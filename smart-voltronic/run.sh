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
  loge "mqtt_host vide."
  exit 1
fi
if [ -z "${MQTT_USER}" ] || [ -z "${MQTT_PASS}" ]; then
  loge "mqtt_user ou mqtt_pass vide."
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

# Optionnel : si tu gardes __SERIAL_X__ dans flows.json
sed -i "s/__SERIAL_1__/$(esc "$SERIAL_1")/g" /data/flows.json
sed -i "s/__SERIAL_2__/$(esc "$SERIAL_2")/g" /data/flows.json
sed -i "s/__SERIAL_3__/$(esc "$SERIAL_3")/g" /data/flows.json

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

# ✅ Export des variables d'environnement pour Node-RED
export MQTT_HOST MQTT_PORT MQTT_USER MQTT_PASS
export SERIAL_1 SERIAL_2 SERIAL_3

logi "Env set: MQTT_HOST/MQTT_PORT/MQTT_USER/MQTT_PASS + SERIAL_1..3"

logi "Starting Node-RED..."
exec node-red --userDir /data --settings /addon/settings.js

logi "Starting Node-RED..."
exec node-red --userDir /data --settings /addon/settings.js
