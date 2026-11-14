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

# ---------- Timezone (options.json) ----------
TZ_MODE="$(jq -r '.timezone_mode // "UTC"' "$OPTS")"
TZ_CUSTOM="$(jq -r '.timezone_custom // "UTC"' "$OPTS")"

if [ "$TZ_MODE" = "CUSTOM" ]; then
  ADDON_TIMEZONE="$TZ_CUSTOM"
else
  ADDON_TIMEZONE="$TZ_MODE"
fi

if [ -z "${ADDON_TIMEZONE:-}" ] || [ "$ADDON_TIMEZONE" = "null" ]; then
  ADDON_TIMEZONE="UTC"
fi

export ADDON_TIMEZONE
logi "Timezone (options.json): $ADDON_TIMEZONE"

# ---------- Battery system voltage (options.json) ----------
# Attendu dans options.json :
#   "battery_system_voltage": "24V" | "48V" | 24 | 48
# Export env: BATTERY_SYSTEM_VOLTAGE=24|48 pour Node-RED (env.get)

BATTERY_SYSTEM_VOLTAGE_RAW="$(jq -r '.battery_system_voltage // "48V"' "$OPTS" | tr '[:lower:]' '[:upper:]' | tr -d ' ')"

case "$BATTERY_SYSTEM_VOLTAGE_RAW" in
  24|24V) BATTERY_SYSTEM_VOLTAGE="24" ;;
  48|48V) BATTERY_SYSTEM_VOLTAGE="48" ;;
  *)      BATTERY_SYSTEM_VOLTAGE="48" ;; # fallback safe
esac

export BATTERY_SYSTEM_VOLTAGE
logi "Battery system voltage (options.json): ${BATTERY_SYSTEM_VOLTAGE}V"

# ---------- Serial ports ----------
SERIAL_1="$(jq -r '.inv1_serial_port // ""' "$OPTS")"
SERIAL_2="$(jq -r '.inv2_serial_port // ""' "$OPTS")"
SERIAL_3="$(jq -r '.inv3_serial_port // ""' "$OPTS")"

logi "Serial1: ${SERIAL_1:-<empty>}"
logi "Serial2: ${SERIAL_2:-<empty>}"
logi "Serial3: ${SERIAL_3:-<empty>}"

# ---------- Gestion du flows.json ----------
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

# =====================================================================
# GATEWAY / SERIAL : lecture depuis config add-on
# =====================================================================

sanitize_transport() {
  local v="$1"
  case "$v" in
    serial)       echo "serial" ;;
    gateway|tcp)  echo "tcp" ;;
    esp32)        echo "esp32" ;;
    *)            echo "serial" ;;
  esac
}

INV1_LINK="$(jq -r '.inv1_link // "serial"' "$OPTS" | tr '[:upper:]' '[:lower:]')"
INV2_LINK="$(jq -r '.inv2_link // "serial"' "$OPTS" | tr '[:upper:]' '[:lower:]')"
INV3_LINK="$(jq -r '.inv3_link // "serial"' "$OPTS" | tr '[:upper:]' '[:lower:]')"

INV1_TRANSPORT="$(sanitize_transport "$INV1_LINK")"
INV2_TRANSPORT="$(sanitize_transport "$INV2_LINK")"
INV3_TRANSPORT="$(sanitize_transport "$INV3_LINK")"

INV1_HOST="$(jq -r '.inv1_gateway_host // ""' "$OPTS")"
INV2_HOST="$(jq -r '.inv2_gateway_host // ""' "$OPTS")"
INV3_HOST="$(jq -r '.inv3_gateway_host // ""' "$OPTS")"

INV1_PORT="$(jq_int_or '.inv1_gateway_port' 8899)"
INV2_PORT="$(jq_int_or '.inv2_gateway_port' 8899)"
INV3_PORT="$(jq_int_or '.inv3_gateway_port' 8899)"

logi "Inv1 -> link: $INV1_LINK | transport: $INV1_TRANSPORT | host: ${INV1_HOST:-<empty>} | port: ${INV1_PORT}"
logi "Inv2 -> link: $INV2_LINK | transport: $INV2_TRANSPORT | host: ${INV2_HOST:-<empty>} | port: ${INV2_PORT}"
logi "Inv3 -> link: $INV3_LINK | transport: $INV3_TRANSPORT | host: ${INV3_HOST:-<empty>} | port: ${INV3_PORT}"

# Validation : si gateway, host obligatoire
if [ "$INV1_TRANSPORT" = "tcp" ] && [ -z "${INV1_HOST}" ]; then
  loge "Inv1: inv1_link=gateway mais inv1_gateway_host est vide dans la config."
  exit 1
fi
if [ "$INV2_TRANSPORT" = "tcp" ] && [ -z "${INV2_HOST}" ]; then
  loge "Inv2: inv2_link=gateway mais inv2_gateway_host est vide dans la config."
  exit 1
fi
if [ "$INV3_TRANSPORT" = "tcp" ] && [ -z "${INV3_HOST}" ]; then
  loge "Inv3: inv3_link=gateway mais inv3_gateway_host est vide dans la config."
  exit 1
fi


# ---------- ESP32-S3 independent cached HTTP bridge ----------
# In ESP mode: ESP owns UART; Node-RED reads its HTTP cache only.
# The read code is never printed; writes require an explicit opt-in per inverter.
for n in 1 2 3; do
  host="$(jq -r --arg k "inv${n}_esp_host" '.[$k] // ""' "$OPTS")"
  port="$(jq -r --arg k "inv${n}_esp_port" '.[$k] // 18081 | tonumber' "$OPTS" 2>/dev/null || echo 18081)"
  code="$(jq -r --arg k "inv${n}_esp_code" '.[$k] // ""' "$OPTS")"
  write_enabled="$(jq -r --arg k "inv${n}_esp_write_enabled" '.[$k] // false | tostring' "$OPTS")"
  transport_var="INV${n}_TRANSPORT"
  transport="${!transport_var}"
  if [ "$transport" = "esp32" ]; then
    if [[ ! "$host" =~ ^[a-zA-Z0-9.-]+$ ]]; then
      loge "Inv${n}: ESP host invalid or empty (LAN hostname / IPv4 required)"
      exit 1
    fi
    if [[ ! "$port" =~ ^[0-9]+$ ]] || [ "$port" -lt 1 ] || [ "$port" -gt 65535 ]; then
      loge "Inv${n}: ESP port out of range"
      exit 1
    fi
    if [ "${#code}" -lt 8 ] || [ "${#code}" -gt 32 ]; then
      loge "Inv${n}: ESP setup code length must be 8..32"
      exit 1
    fi
    logi "Inv${n}: ESP32 cache transport enabled (host and access code redacted)"
  fi
  printf -v "INV${n}_ESP_HOST" '%s' "$host"
  printf -v "INV${n}_ESP_PORT" '%s' "$port"
  printf -v "INV${n}_ESP_CODE" '%s' "$code"
  printf -v "INV${n}_ESP_WRITE_ENABLED" '%s' "$write_enabled"
  export "INV${n}_ESP_HOST" "INV${n}_ESP_PORT" "INV${n}_ESP_CODE" "INV${n}_ESP_WRITE_ENABLED"
done

# Export pour Node-RED (env.get())
export INV1_TRANSPORT INV2_TRANSPORT INV3_TRANSPORT
export INV1_HOST INV2_HOST INV3_HOST
export INV1_PORT INV2_PORT INV3_PORT

# =====================================================================
# PATCH TCP IN/OUT host/port dans flows.json (via jq + IDs fixes)
# =====================================================================

update_tcp_host_port() {
  local node_id="$1"
  local host="$2"
  local port="$3"
  local label="$4"

  jq --arg id "$node_id" --arg host "$host" --arg port "$port" '
    map(
      if .id == $id then
        .host = $host | .port = $port
      else .
      end
    )
  ' /data/flows.json > "$tmp" && mv "$tmp" /data/flows.json

  logi "TCP ${label} -> host=${host} port=${port}"
}

# Pour éviter que les nodes TCP essaient de se connecter en mode serial :
TCP1_HOST="$INV1_HOST"; TCP1_PORT="$INV1_PORT"
TCP2_HOST="$INV2_HOST"; TCP2_PORT="$INV2_PORT"
TCP3_HOST="$INV3_HOST"; TCP3_PORT="$INV3_PORT"

if [ "$INV1_TRANSPORT" != "tcp" ]; then TCP1_HOST="127.0.0.1"; TCP1_PORT="1"; fi
if [ "$INV2_TRANSPORT" != "tcp" ]; then TCP2_HOST="127.0.0.1"; TCP2_PORT="1"; fi
if [ "$INV3_TRANSPORT" != "tcp" ]; then TCP3_HOST="127.0.0.1"; TCP3_PORT="1"; fi

# IDs fournis
update_tcp_host_port "affc083c1b7614e8" "$TCP1_HOST" "$TCP1_PORT" "OUT1"
update_tcp_host_port "860cc648606abc47" "$TCP1_HOST" "$TCP1_PORT" "IN1"

update_tcp_host_port "faacf46b9ccb1349" "$TCP2_HOST" "$TCP2_PORT" "OUT2"
update_tcp_host_port "676593474485375b" "$TCP2_HOST" "$TCP2_PORT" "IN2"

update_tcp_host_port "edb28c0311499138" "$TCP3_HOST" "$TCP3_PORT" "OUT3"
update_tcp_host_port "6178939eaeb81b59" "$TCP3_HOST" "$TCP3_PORT" "IN3"

# ---------- Per-inverter ESP mode: disable legacy I/O nodes only ----------
# Never even open an old local serial/TCP endpoint when the ESP owns UART.
# _esp_bridge_disabled tracks only bridge-added disables, so a switch back to
# serial/gateway restores the previous node without overriding user's d=true.
set_io_mode() {
  local n="$1" mode="$2" ids
  case "$n" in
    1) ids='["ee75b8b24f06bd32","8be1a4bda6cf1027","affc083c1b7614e8","860cc648606abc47"]' ;;
    2) ids='["4f05f81d6e3662a6","9efe66c0142e7183","faacf46b9ccb1349","676593474485375b"]' ;;
    3) ids='["8d6598c166d176e0","9a5d93478a7d5cb2","edb28c0311499138","6178939eaeb81b59"]' ;;
    *) return 1 ;;
  esac
  jq --arg mode "$mode" --argjson ids "$ids" '
    map(
      if (.id as $nodeId | ($ids | index($nodeId)) != null) then
        if $mode == "esp32" then
          (if ._esp_bridge_disabled != true then
             ._esp_bridge_was_disabled = (.d == true)
           else . end)
          | .d = true | ._esp_bridge_disabled = true
        elif ._esp_bridge_disabled == true then
          (if ._esp_bridge_was_disabled == true then .d = true else del(.d) end)
          | del(._esp_bridge_disabled, ._esp_bridge_was_disabled)
        else . end
      else . end
    )
  ' /data/flows.json > "$tmp" && mv "$tmp" /data/flows.json
}
set_io_mode 1 "$INV1_TRANSPORT"
set_io_mode 2 "$INV2_TRANSPORT"
set_io_mode 3 "$INV3_TRANSPORT"

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
    else . end
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
