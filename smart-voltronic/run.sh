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

# ✅ NE PAS créer options.json : sinon on masque le montage HA et on perd user/pass
if [ ! -f "$OPTS" ]; then
  loge "options.json introuvable dans /data (montage HA absent ou problème d'add-on). Stop."
  loge "Chemin attendu: $OPTS"
  exit 1
fi

# Helpers jq
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

# Escape safe pour sed
esc() { printf '%s' "$1" | sed -e 's/[\/&|\\]/\\&/g'; }

# ---------- MQTT : HA service si dispo, sinon fallback options.json ----------
MQTT_HOST=""
MQTT_PORT=""
MQTT_USER=""
MQTT_PASS=""

if [ -f /usr/lib/bashio/bashio.sh ]; then
  if bashio::services.available mqtt >/dev/null 2>&1; then
    MQTT_HOST="$(bashio::services mqtt host)"
    MQTT_PORT="$(bashio::services mqtt port)"
    MQTT_USER="$(bashio::services mqtt username)"
    MQTT_PASS="$(bashio::services mqtt password)"
    logi "MQTT (HA service): ${MQTT_HOST}:${MQTT_PORT} (user: ${MQTT_USER:-<none>})"
  else
    logw "MQTT service indisponible (API Supervisor). On utilise options.json."
  fi
fi

if [ -z "${MQTT_HOST}" ] || [ -z "${MQTT_PORT}" ]; then
  MQTT_HOST="$(jq_str_or '.mqtt_host' 'core-mosquitto')"
  MQTT_PORT="$(jq_int_or '.mqtt_port' 1883)"
  # ✅ accepte plusieurs noms de champs
  MQTT_USER="$(jq -r '.mqtt_user // .mqtt_username // ""' "$OPTS")"
  MQTT_PASS="$(jq -r '.mqtt_pass // .mqtt_password // ""' "$OPTS")"
  logw "MQTT (fallback options.json): ${MQTT_HOST}:${MQTT_PORT} (user: ${MQTT_USER:-<none>})"
fi

if [ -z "${MQTT_USER}" ] || [ -z "${MQTT_PASS}" ]; then
  loge "MQTT_USER ou MQTT_PASS vide -> Mosquitto refusera probablement la connexion."
  loge "Vérifie la config de l'add-on dans l'UI HA (mqtt_user/mqtt_pass)."
fi

# ---------- Serial ports ----------
SERIAL_1="$(jq -r '.serial_ports[0] // ""' "$OPTS")"
SERIAL_2="$(jq -r '.serial_ports[1] // ""' "$OPTS")"
SERIAL_3="$(jq -r '.serial_ports[2] // ""' "$OPTS")"

logi "Serial1: ${SERIAL_1:-<empty>}"
logi "Serial2: ${SERIAL_2:-<empty>}"
logi "Serial3: ${SERIAL_3:-<empty>}"

for p in "$SERIAL_1" "$SERIAL_2" "$SERIAL_3"; do
  if [ -n "$p" ] && [ ! -e "$p" ]; then
    logw "Port série introuvable: $p"
  fi
done

# Réappliquer le flow
cp /addon/flows.json /data/flows.json

# Copier les credentials Node-RED (IMPORTANT pour MQTT auth)
if [ -f /addon/flows_cred.json ]; then
  cp /addon/flows_cred.json /data/flows_cred.json
  logi "OK: flows_cred.json copié dans /data"
else
  logw "flows_cred.json absent -> Node-RED démarrera sans credentials chiffrés"
fi

# Inject MQTT
sed -i "s/__MQTT_HOST__/$(esc "$MQTT_HOST")/g" /data/flows.json
sed -i "s/__MQTT_PORT__/$(esc "$MQTT_PORT")/g" /data/flows.json
sed -i "s/__MQTT_USER__/$(esc "$MQTT_USER")/g" /data/flows.json
sed -i "s/__MQTT_PASS__/$(esc "$MQTT_PASS")/g" /data/flows.json

# Inject Serial
sed -i "s/__SERIAL_1__/$(esc "$SERIAL_1")/g" /data/flows.json
sed -i "s/__SERIAL_2__/$(esc "$SERIAL_2")/g" /data/flows.json
sed -i "s/__SERIAL_3__/$(esc "$SERIAL_3")/g" /data/flows.json

# ✅ Optionnel mais recommandé : credentials chiffrés (Node-RED 4.x)
if [ -f /addon/flows_cred.json ]; then
  cp /addon/flows_cred.json /data/flows_cred.json
  sed -i "s/__MQTT_USER__/$(esc "$MQTT_USER")/g" /data/flows_cred.json
  sed -i "s/__MQTT_PASS__/$(esc "$MQTT_PASS")/g" /data/flows_cred.json
  logi "OK: flows_cred.json installé dans /data"
else
  logw "flows_cred.json absent -> Node-RED peut afficher 'Encrypted credentials not found'"
fi

# --- Nettoyage configs serial-port vides (jq minimal, sans !) ---
cleanup_unconfigured_serial_ports() {
  local tmp="/data/flows.tmp.json"

  local bad_ids
  bad_ids="$(jq -r '
    .[]
    | select(.type=="serial-port")
    | select((.serialport // "") == "")
    | .id
  ' /data/flows.json 2>/dev/null || true)"

  if [ -z "$bad_ids" ]; then
    logi "Aucune config serial-port vide détectée"
    return 0
  fi

  logw "Configs serial-port vides détectées (suppression): $(echo "$bad_ids" | tr '\n' ' ')"

  local bad_json
  bad_json="$(printf '%s\n' "$bad_ids" | jq -R . | jq -s .)"

  jq --argjson bad "$bad_json" '
    del(
      .[] |
      select((.type=="serial in" or .type=="serial out")) |
      select([.serial] as $s | ($bad | index($s[0]) != null))
    )
  ' /data/flows.json > "$tmp" && mv "$tmp" /data/flows.json

  jq --argjson bad "$bad_json" '
    del(
      .[] |
      select(.type=="serial-port") |
      select([.id] as $i | ($bad | index($i[0]) != null))
    )
  ' /data/flows.json > "$tmp" && mv "$tmp" /data/flows.json
}

cleanup_unconfigured_serial_ports

# Vérifier placeholders (incluant MQTT + serial)
if grep -q "__MQTT_HOST__\|__MQTT_PORT__\|__MQTT_USER__\|__MQTT_PASS__\|__SERIAL_1__\|__SERIAL_2__\|__SERIAL_3__" /data/flows.json; then
  loge "Placeholders encore présents dans /data/flows.json -> vérifie flows.json et options.json"
  grep -n "__MQTT_HOST__\|__MQTT_PORT__\|__MQTT_USER__\|__MQTT_PASS__\|__SERIAL_1__\|__SERIAL_2__\|__SERIAL_3__" /data/flows.json || true
else
  logi "OK: placeholders remplacés dans /data/flows.json"
fi

logi "Starting Node-RED..."
exec node-red --userDir /data --settings /addon/settings.js
