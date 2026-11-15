#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Extract exactly the run.sh startup patch and exercise it on a complete 340-node flow.
sed -n '/^patch_esp_ha_commands() {/,/^}/p' smart-voltronic/run.sh > /tmp/esp-command-patch.func.sh
source /tmp/esp-command-patch.func.sh
mkdir -p /data
cp smart-voltronic/flows.json /data/flows.json
tmp=/tmp/esp-command-flow.tmp.json
logi() { :; }
patch_esp_ha_commands 1 esp32
patch_esp_ha_commands 2 serial
patch_esp_ha_commands 3 gateway
jq -e '
  (.[] | select(.id=="381cb2e10d9b5625") | .func) as $ha |
  (.[] | select(.id=="b1a8cd69494aac47") | .wires[0]) as $esp |
  (.[] | select(.id=="bbd3067079b8f836") | .wires[0]) as $serial |
  (.[] | select(.id=="9288782e4d4509cf") | .wires[0]) as $gateway |
  ($ha | startswith("if(String(env.get(\"INV1_TRANSPORT\")") | not)
  and ($ha | contains("ESP32 direct SET blocked"))
  and ($esp == ["espfull1_learn"])
  and ($serial == ["e4b3e0c1b7d78e69"])
  and ($gateway == ["aae15edafbdf31c6"])
' /data/flows.json
# Idempotent startup and preserved legacy modes.
patch_esp_ha_commands 1 esp32
jq -e '[.[]|select(.id=="381cb2e10d9b5625")|.func|scan("ESP32 direct SET blocked")] | length == 1' /data/flows.json
patch_esp_ha_commands 1 serial
jq -e '(.[] | select(.id=="b1a8cd69494aac47") | .wires[0]) == ["e56dd41194be1e35"]' /data/flows.json
echo "HA MQTT -> verified learning ESP route PASS; legacy serial/gateway restored"
