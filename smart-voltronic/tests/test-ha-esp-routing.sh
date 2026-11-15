#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
sed -n '/^patch_esp_ha_commands() {/,/^}/p' smart-voltronic/run.sh > /tmp/esp-command-patch.func.sh
source /tmp/esp-command-patch.func.sh
mkdir -p /data
cp smart-voltronic/flows.json /data/flows.json
tmp=/tmp/esp-command-flow.tmp.json
logi() { :; }

# Real user's bench: ESP2 MUST map to INV2 only, INV1 & INV3 disabled.
grep -Fq 'inv1_link: "disabled"' smart-voltronic/config.yaml
grep -Fq 'inv2_link: "esp32"' smart-voltronic/config.yaml
grep -Fq 'inv3_link: "disabled"' smart-voltronic/config.yaml
patch_esp_ha_commands 1 disabled
patch_esp_ha_commands 2 esp32
patch_esp_ha_commands 3 disabled
jq -e '
  (.[] | select(.id=="46ca504f4729209c") | .func) as $ha2 |
  (.[] | select(.id=="b1a8cd69494aac47") | .wires[0]) as $inv1 |
  (.[] | select(.id=="bbd3067079b8f836") | .wires[0]) as $inv2 |
  (.[] | select(.id=="9288782e4d4509cf") | .wires[0]) as $inv3 |
  ($ha2 | startswith("if(String(env.get(\\\"INV2_TRANSPORT\\\")") | not)
  and ($ha2 | contains("ESP32 direct SET blocked"))
  and ($inv1 == ["e56dd41194be1e35"])
  and ($inv2 == ["espfull2_learn"])
  and ($inv3 == ["aae15edafbdf31c6"])
' /data/flows.json

# Idempotence, and the independent serial/gateway compatibility restoration.
patch_esp_ha_commands 2 esp32
jq -e '[.[]|select(.id=="46ca504f4729209c")|.func|scan("ESP32 direct SET blocked")] | length == 1' /data/flows.json
patch_esp_ha_commands 2 serial
jq -e '(.[] | select(.id=="bbd3067079b8f836") | .wires[0]) == ["e4b3e0c1b7d78e69"]' /data/flows.json
patch_esp_ha_commands 2 esp32
jq -e '(.[] | select(.id=="bbd3067079b8f836") | .wires[0]) == ["espfull2_learn"]' /data/flows.json
echo "ESP2->INV2 learning isolation PASS; INV1/INV3 unaffected; serial/gateway rollback PASS"
