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

# ---------- Gestion du flows.json ----------
# Logique de versioning :
#   - Première installation                   -> copie du flows depuis l'addon
#   - Version flows addon > version installée -> mise à jour du flows
#   - Version identique                       -> flows utilisateur conservé

ADDON_FLOWS_VERSION="$(cat /addon/flows_version.txt 2>/dev/null || echo '0.0.0')"
INSTALLED_VERSION="$(cat /data/flows_version.txt 2>/dev/null || echo '')"

if [ ! -f /data/flows.json ] || [ "$INSTALLED_VERSION" != "$ADDON_FLOWS_VERSION" ]; then
  logi "Mise à jour flows : (installé: ${INSTALLED_VERSION:-aucun}) -> (addon: $ADDON_FLOWS_VERSION)"
  cp /addon/flows.json /data/flows.json
  echo "$ADDON_FLOWS_VERSION" > /data/flows_version.txt
  logi "flows.json mis à jour vers v$ADDON_FLOWS_VERSION"
else
  logi "flows.json à jour (v$ADDON_FLOWS_VERSION), conservation des flows utilisateur"
fi

tmp="/data/flows.tmp.json"

# ---------- Injection des ports serial configurés ----------
# IDs fixes des noeuds serial-port dans flows.json :
#   SERIAL_1 -> c546b54ae425b9d2
#   SERIAL_2 -> 55a40ce3e960db15
#   SERIAL_3 -> 39e06a015d18096d

logi "Mise à jour des ports serial dans flows.json..."

update_serial_port() {
  local node_id="$1"
  local serial_value="$2"
  local label="$3"

  if [ -z "$serial_value" ]; then
    logi "Serial ${label} non configuré, noeud conservé tel quel"
    return 0
  fi

  local exists
  exists="$(jq -r --arg id "$node_id" '.[] | select(.id==$id) | .id' /data/flows.json 2>/dev/null || echo "")"

  if [ -z "$exists" ]; then
    logw "Noeud serial-port ID $node_id introuvable dans flows.json (${label})"
    return 0
  fi

  jq --arg id "$node_id" --arg port "$serial_value" '
    map(
      if .id == $id
      then .serialport = $port
      else .
      end
    )
  ' /data/flows.json > "$tmp" && mv "$tmp" /data/flows.json

  logi "Port serial mis à jour : ${label} -> ${serial_value}"
}

update_serial_port "c546b54ae425b9d2" "$SERIAL_1" "SERIAL_1"
update_serial_port "55a40ce3e960db15" "$SERIAL_2" "SERIAL_2"
update_serial_port "39e06a015d18096d" "$SERIAL_3" "SERIAL_3"

# ---------- Injection MQTT dans le node mqtt-broker ----------
if ! jq -e '.[] | select(.type=="mqtt-broker" and .name=="HA MQTT Broker")' /data/flows.json >/dev/null 2>&1; then
  loge 'Aucun mqtt-broker nommé "HA MQTT Broker" trouvé dans flows.json'
  exit 1
fi

logi "Injection MQTT (broker/port/user) dans flows.json"

jq \
  --arg host "$MQTT_HOST" \
  --arg port "$MQTT_PORT" \
  --arg user "$MQTT_USER" \
  '
  map(
    if .type=="mqtt-broker" and .name=="HA MQTT Broker"
    then
      .broker=$host
      | .port=$port
      | .user=$user
    else .
    end
  )
  ' /data/flows.json > "$tmp" && mv "$tmp" /data/flows.json

# ---------- Injection credentials dans flows_cred.json ----------
if [ -f /data/flows_cred.json ]; then
  rm -f /data/flows_cred.json
  logw "Ancien flows_cred.json supprimé"
fi

BROKER_ID="$(jq -r '.[] | select(.type=="mqtt-broker" and .name=="HA MQTT Broker") | .id' /data/flows.json)"

if [ -z "$BROKER_ID" ]; then
  loge "Impossible de récupérer l'ID du node mqtt-broker dans flows.json"
  exit 1
fi

logi "Broker node ID: $BROKER_ID — Création flows_cred.json"

jq -n \
  --arg id "$BROKER_ID" \
  --arg user "$MQTT_USER" \
  --arg pass "$MQTT_PASS" \
  '{($id): {"user": $user, "password": $pass}}' \
  > /data/flows_cred.json

logi "flows_cred.json créé avec succès"

logi "Starting Node-RED sur le port 1892..."
exec node-red --userDir /data --settings /addon/settings.js
