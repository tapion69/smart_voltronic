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

# ---------- Optional isolated learning bridge for the COMPLETE flow ----------
# Idempotent across every restart: do not duplicate Node-RED nodes or wiring.
if [ -f /addon/esp32_learning_nodes.json ]; then
  jq -s '
    .[0] as $base | .[1] as $extra |
    $base + ($extra | map(select(.id as $newId | all($base[]; .id != $newId))))
    | map(
      if .id=="9a6552a4d8f3ae99" then .wires[0] |= (. + ["espfull1_learn"] | unique)
      elif .id=="4cf4c0d516871496" then .wires[0] |= (. + ["espfull2_learn"] | unique)
      elif .id=="349ff60ff7844948" then .wires[0] |= (. + ["espfull3_learn"] | unique)
      elif .id=="6013564ccd697834" then .wires[0] |= (. + ["espfull1_verify_filter"] | unique)
      elif .id=="bf5b654c1eeba5bc" then .wires[0] |= (. + ["espfull2_verify_filter"] | unique)
      elif .id=="6fc157dd4e04371b" then .wires[0] |= (. + ["espfull3_verify_filter"] | unique)
      else . end
    )
  ' /data/flows.json /addon/esp32_learning_nodes.json > "$tmp" && mv "$tmp" /data/flows.json
  logi "Full flow: verified ESP candidate learning bridge included"
fi

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

update_serial_port "128a99ca861bd3f8" "$SERIAL_1" "SERIAL_1"
update_serial_port "4d203e7ceee61fed" "$SERIAL_2" "SERIAL_2"
update_serial_port "bf8d21a7f1d69392" "$SERIAL_3" "SERIAL_3"

# =====================================================================
# GATEWAY / SERIAL : lecture depuis config add-on
# =====================================================================

sanitize_transport() {
  local v="$1"
  case "$v" in
    serial)       echo "serial" ;;
    gateway|tcp)  echo "tcp" ;;
    esp32)        echo "esp32" ;;
    disabled)     echo "disabled" ;;
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

update_tcp_server_port() {
  local id="$1" host="$2" port="$3" label="$4"
  jq --arg id "$id" --arg host "$host" --arg port "$port" '
    map(if .id==$id then .server=$host | .port=$port else . end)
  ' /data/flows.json > "$tmp" && mv "$tmp" /data/flows.json
  logi "TCP request ${label} configured"
}
# One tcp-request node per inverter in the complete 322-node flow.
for i in 1 2 3; do
  transport_var="INV${i}_TRANSPORT"
  host_var="INV${i}_HOST"
  port_var="INV${i}_PORT"
  transport="${!transport_var}"
  host="${!host_var}"
  port="${!port_var}"
  if [ "$transport" != "tcp" ]; then host="127.0.0.1"; port="1"; fi
  case "$i" in
    1) id="1e1a7ad9eb6b2a52" ;;
    2) id="63bcf98463aab41a" ;;
    3) id="b8fce564589ea5e6" ;;
  esac
  update_tcp_server_port "$id" "$host" "$port" "INV${i}"
done


# ---------- Per-inverter ESP mode: disable legacy I/O nodes only ----------
# Never even open an old local serial/TCP endpoint when the ESP owns UART.
# _esp_bridge_disabled tracks only bridge-added disables, so a switch back to
# serial/gateway restores the previous node without overriding user's d=true.
set_io_mode() {
  local n="$1" mode="$2" ids
  case "$n" in
1) ids='["a3fcb4ec8a648918","fb96a298c987d683","1e1a7ad9eb6b2a52"]' ;;
2) ids='["6431323d5b272bc2","07215c45cd82b652","63bcf98463aab41a"]' ;;
3) ids='["8e2f29ef96d4823e","c78f64d7a88c2a2e","b8fce564589ea5e6"]' ;;
    *) return 1 ;;
  esac
  jq --arg mode "$mode" --argjson ids "$ids" '
    map(
      if (.id as $nodeId | ($ids | index($nodeId)) != null) then
        if ($mode == "esp32" or $mode == "disabled") then
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
