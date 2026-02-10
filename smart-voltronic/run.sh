#!/usr/bin/env bash
set -euo pipefail

echo "### RUN.SH SMART VOLTRONIC START ###"

# Logs (bashio si dispo)
if [ -f /usr/lib/bashio/bashio.sh ]; then
  # shellcheck disable=SC1091
  source /usr/lib/bashio/bashio.sh
  logi(){ bashio::log.info "$1"; }
  logw(){ bashio::log.warning "$1"; }
  loge(){ bashio::log.error "$1"; }
else
  logi(){ echo "[INFO] $1"; }
  logw(){ echo "[WARN] $1"; }
  loge(){ echo "[ERROR] $1"; }
fi

logi "Smart Voltronic: init..."

OPTS="/data/options.json"

# Crée options.json si absent (premier démarrage / install manuelle)
if [ ! -f "$OPTS" ]; then
  logw "options.json introuvable, création avec valeurs par défaut: $OPTS"
  cat > "$OPTS" <<'JSON'
{
  "mqtt_host": "core-mosquitto",
  "mqtt_port": 1883,
  "mqtt_user": "",
  "mqtt_pass": "",
  "serial_ports": ["", "", ""]
}
JSON
fi

# Helpers jq: string avec fallback si vide OU null
jq_str_or() {
  local jq_expr="$1"
  local fallback="$2"
  jq -r "($jq_expr // \"\") | if (type==\"string\" and length>0) then . else \"$fallback\" end" "$OPTS"
}

jq_int_or() {
  local jq_expr="$1"
  local fallback="$2"
  jq -r "($jq_expr // $fallback) | tonumber" "$OPTS" 2>/dev/null || echo "$fallback"
}

# Lecture options
MQTT_HOST="$(jq_str_or '.mqtt_host' 'core-mosquitto')"
MQTT_PORT="$(jq_int_or '.mqtt_port' 1883)"
MQTT_USER="$(jq -r '.mqtt_user // ""' "$OPTS")"
MQTT_PASS="$(jq -r '.mqtt_pass // ""' "$OPTS")"

SERIAL_1="$(jq -r '.serial_ports[0] // ""' "$OPTS")"
SERIAL_2="$(jq -r '.serial_ports[1] // ""' "$OPTS")"
SERIAL_3="$(jq -r '.serial_ports[2] // ""' "$OPTS")"

logi "MQTT: ${MQTT_HOST}:${MQTT_PORT} (user: ${MQTT_USER:-<none>})"
logi "Serial1: ${SERIAL_1:-<empty>}"
logi "Serial2: ${SERIAL_2:-<empty>}"
logi "Serial3: ${SERIAL_3:-<empty>}"

# Vérif chemins (utile pour /dev/serial/by-id/*)
for p in "$SERIAL_1" "$SERIAL_2" "$SERIAL_3"; do
  if [ -n "$p" ] && [ ! -e "$p" ]; then
    logw "Port série introuvable: $p"
  fi
done

# Toujours réappliquer le flow (auto-update)
cp /addon/flows.json /data/flows.json

# Escape safe pour sed
esc() { printf '%s' "$1" | sed -e 's/[\/&|\\]/\\&/g'; }

# Inject MQTT
sed -i "s/__MQTT_HOST__/$(esc "$MQTT_HOST")/g" /data/flows.json
sed -i "s/__MQTT_PORT__/$(esc "$MQTT_PORT")/g" /data/flows.json
sed -i "s/__MQTT_USER__/$(esc "$MQTT_USER")/g" /data/flows.json
sed -i "s/__MQTT_PASS__/$(esc "$MQTT_PASS")/g" /data/flows.json

# Inject Serial
sed -i "s/__SERIAL_1__/$(esc "$SERIAL_1")/g" /data/flows.json
sed -i "s/__SERIAL_2__/$(esc "$SERIAL_2")/g" /data/flows.json
sed -i "s/__SERIAL_3__/$(esc "$SERIAL_3")/g" /data/flows.json

# --- Suppression dynamique des ports non configurés (robuste, basé sur NAME) ---
# On supprime:
# - le serial in/out nommé "📥 Serial In N" / "📤 Serial Out N"
# - et la config "serial-port" référencée par leur champ "serial"
remove_serial_group_if_empty() {
  local n="$1"
  local port="$2"

  local in_name="📥 Serial In ${n}"
  local out_name="📤 Serial Out ${n}"

  if [ -n "$port" ]; then
    return 0
  fi

  logw "Serial${n} vide -> suppression de '${in_name}', '${out_name}' + config associée"

  local tmp="/data/flows.tmp.json"

  # 1) récupérer les IDs de config série référencés par ces nodes
  # (peut être vide si les nodes n'existent pas)
  local cfg_ids
  cfg_ids="$(jq -r --arg in "$in_name" --arg out "$out_name" '
    [ .[]
      | select((.type=="serial in" and .name==$in) or (.type=="serial out" and .name==$out))
      | .serial
    ]
    | unique
    | .[]
  ' /data/flows.json 2>/dev/null || true)"

  # 2) supprimer les nodes serial in/out de ce groupe par name
  jq --arg in "$in_name" --arg out "$out_name" '
    map(select(!((.type=="serial in" and .name==$in) or (.type=="serial out" and .name==$out))))
  ' /data/flows.json > "$tmp" && mv "$tmp" /data/flows.json

  # 3) supprimer les configs "serial-port" référencées (si elles ne sont plus utilisées ailleurs)
  # On ne supprime que si aucun autre serial in/out ne référence ce cfg.
  if [ -n "$cfg_ids" ]; then
    while IFS= read -r cfg; do
      [ -z "$cfg" ] && continue

      # encore utilisé ?
      if jq -e --arg cfg "$cfg" '
          any(.[]; ((.type=="serial in" or .type=="serial out") and (.serial==$cfg)))
        ' /data/flows.json >/dev/null 2>&1; then
        logw "Config serial-port ${cfg} encore utilisée ailleurs -> conservation"
      else
        logi "Suppression config serial-port ${cfg} (plus utilisée)"
        jq --arg cfg "$cfg" '
          map(select(!(.type=="serial-port" and .id==$cfg)))
        ' /data/flows.json > "$tmp" && mv "$tmp" /data/flows.json
      fi
    done <<< "$cfg_ids"
  fi
}

remove_serial_group_if_empty 3 "$SERIAL_3"
remove_serial_group_if_empty 2 "$SERIAL_2"
remove_serial_group_if_empty 1 "$SERIAL_1"

# Vérifier qu'il ne reste pas de placeholders
if grep -q "__MQTT_HOST__\|__MQTT_PORT__\|__SERIAL_1__\|__SERIAL_2__\|__SERIAL_3__" /data/flows.json; then
  loge "Placeholders encore présents dans /data/flows.json -> vérifie flows.json et options.json"
  grep -n "__MQTT_HOST__\|__MQTT_PORT__\|__SERIAL_1__\|__SERIAL_2__\|__SERIAL_3__" /data/flows.json || true
else
  logi "OK: placeholders remplacés dans /data/flows.json"
fi

logi "Starting Node-RED..."
exec node-red --userDir /data --settings /addon/settings.js
