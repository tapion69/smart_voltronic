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
if [ ! -f "$OPTS" ]; then
  loge "options.json introuvable dans /data. Stop."
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

# Escape safe pour sed (serial uniquement)
esc() { printf '%s' "$1" | sed -e 's/[\/&|\\]/\\&/g'; }

# ---------- MQTT (options.json) ----------
MQTT_HOST="$(jq_str_or '.mqtt_host' '')"
MQTT_PORT="$(jq_int_or '.mqtt_port' 1883)"
MQTT_USER="$(jq -r '.mqtt_user // .mqtt_username // ""' "$OPTS")"
MQTT_PASS="$(jq -r '.mqtt_pass // .mqtt_password // ""' "$OPTS")"

logi "MQTT (options.json): ${MQTT_HOST:-<empty>}:${MQTT_PORT} (user: ${MQTT_USER:-<none>})"

if [ -z "${MQTT_HOST}" ]; then
  loge "mqtt_host vide. Renseigne-le dans la config add-on."
  exit 1
fi
if [ -z "${MQTT_USER}" ] || [ -z "${MQTT_PASS}" ]; then
  loge "mqtt_user ou mqtt_pass vide. Renseigne-les dans la config add-on."
  exit 1
fi

# ---------- Serial ports ----------
SERIAL_1="$(jq -r '.serial_ports[0] // ""' "$OPTS")"
SERIAL_2="$(jq -r '.serial_ports[1] // ""' "$OPTS")"
SERIAL_3="$(jq -r '.serial_ports[2] // ""' "$OPTS")"

logi "Serial1: ${SERIAL_1:-<empty>}"
logi "Serial2: ${SERIAL_2:-<empty>}"
logi "Serial3: ${SERIAL_3:-<empty>}"

# ---------- Appliquer flows ----------
cp /addon/flows.json /data/flows.json

# ✅ IMPORTANT : on supprime les anciens credentials pour forcer Node-RED à reprendre ceux qu’on injecte
if [ -f /data/flows_cred.json ]; then
  rm -f /data/flows_cred.json
  logw "flows_cred.json supprimé (reset creds Node-RED) pour éviter anciens identifiants MQTT"
fi

# ---------- Serial placeholders (si tu utilises __SERIAL_X__) ----------
sed -i "s/__SERIAL_1__/$(esc "$SERIAL_1")/g" /data/flows.json
sed -i "s/__SERIAL_2__/$(esc "$SERIAL_2")/g" /data/flows.json
sed -i "s/__SERIAL_3__/$(esc "$SERIAL_3")/g" /data/flows.json

# ---------- Injection MQTT dans le node mqtt-broker ----------
tmp="/data/flows.tmp.json"

if ! jq -e '.[] | select(.type=="mqtt-broker" and .name=="HA MQTT Broker")' /data/flows.json >/dev/null 2>&1; then
  loge 'Aucun mqtt-broker nommé "HA MQTT Broker" trouvé dans flows.json'
  exit 1
fi

logi "Injection MQTT (broker/port + credentials) dans flows.json"

jq \
  --arg host "$MQTT_HOST" \
  --arg port "$MQTT_PORT" \
  --arg user "$MQTT_USER" \
  --arg pass "$MQTT_PASS" \
  '
  map(
    if .type=="mqtt-broker" and .name=="HA MQTT Broker"
    then
      .broker=$host
      | .port=$port
      # Certains nodes lisent user/password ici…
      | .user=$user
      | .password=$pass
      # …et surtout le node mqtt garde souvent les creds dans "credentials"
      | .credentials = {"user": $user, "password": $pass}
    else .
    end
  )
  ' /data/flows.json > "$tmp" && mv "$tmp" /data/flows.json

# --- Nettoyage configs serial-port vides ---
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

logi "Starting Node-RED..."
exec node-red --userDir /data --settings /addon/settings.js


logi "Starting Node-RED..."
exec node-red --userDir /data --settings /addon/settings.js
