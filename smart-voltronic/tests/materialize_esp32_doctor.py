#!/usr/bin/env python3
"""Create fully versioned 355-node flows.json, preserving HA discovery IDs."""
import json
import os
import re
import subprocess
from pathlib import Path

root = Path("smart-voltronic")
flow_path = root / "flows.json"
original = json.loads(flow_path.read_text())
assert len(original) in (322, 355)
orig_by_id = {n["id"]: n for n in original}
temp = Path("/tmp/canonical-esp32-voltronic-flows.json")
temp.write_text(json.dumps(original))
env = dict(os.environ, INV1_TRANSPORT="serial", INV2_TRANSPORT="serial", INV3_TRANSPORT="serial")
subprocess.run(["node", str(root / "esp32_patch_flows.cjs"), str(temp), str(root)], env=env, check=True)
nodes = json.loads(temp.read_text())
by_id = {n["id"]: n for n in nodes}
monitors = ["3ea573730416012d", "7e96e2b785b1d159", "638cb89fdbee6fe3"]
publishers = ["2978c86114a84875", "8a05fbc3b3f6bdbc", "d34cc22c5de4c537"]

for inv in (1, 2, 3):
    mon = by_id[monitors[inv - 1]]
    marker = "// ESP_DOCTOR_MONITOR_" + str(inv)
    if marker not in mon["func"]:
        assert "const now = Date.now();" in mon["func"]
        bridge = """
// ESP_DOCTOR_MONITOR_NUM read-only authenticated HTTP/RS232 health.
if (String(env.get("INVNUM_TRANSPORT") || "").toLowerCase() === "esp32") {
 const h = global.get("invNUM_esp_health") || {}, stamp=Date.now();
 const age = h.last_response_ts ? Math.max(0,stamp-h.last_response_ts) : null;
 const httpAge = h.last_http_ok_ts ? Math.max(0,stamp-h.last_http_ok_ts) : null;
 const online = httpAge !== null && httpAge <= 12000;
 const fresh = online && age !== null && age <= 20000;
 const status = fresh ? "HEALTHY" : online ? "DEGRADED" : "OFFLINE";
 const reason = fresh ? "OK" : online ? "STALE_TELEMETRY" : "ESP_HTTP_UNAVAILABLE";
 health.transport="esp32";health.status=status;health.reason=reason;
 health.endpoint=String(env.get("INVNUM_ESP_HOST")||"--")+":"+String(env.get("INVNUM_ESP_PORT")||18081);
 health.response_count=Number(h.response_count||0);
 health.last_response_ts=Number(h.last_response_ts||0);
 health.last_response_command=String(h.last_command||"--");
 health.last_raw_rx_ts=health.last_response_ts;
 health.last_raw_rx_source="esp32";
 health.raw_rx_chunks=health.response_count;
 health.last_response_age_ms=age;health.last_raw_rx_age_ms=age;
 health.last_response_age_s=age===null?null:Math.floor(age/1000);
 health.last_raw_rx_age_s=health.last_response_age_s;
 health.last_tx_age_s=null;health.queue_depth=0;health.inflight_command="--";health.inflight_age_ms=null;
 health.command_success_pct=null;health.response_success_pct=null;
 health.esp_http_ok=online;health.esp_last_http_age_s=httpAge===null?null:Math.floor(httpAge/1000);
 health.esp_http_failures=Number(h.http_failures||0);
 health.esp_cached_replies=Number(h.cached_replies||0);
 health.esp_last_seq=Number(h.last_seq||0);
 health.esp_uptime_ms=Number(h.uptime_ms||0);
 health.esp_last_error=String(h.last_error||"");
 health.esp_write_enabled=String(env.get("INVNUM_ESP_WRITE_ENABLED")||"false")==="true";
 global.set(key,health);
 node.status({fill:fresh?"green":online?"yellow":"red",shape:fresh?"dot":"ring",text:status+" ESPNUM | RX "+(age===null?"--":Math.round(age/1000)+"s")});
 msg.payload={inverter:NUM,status,reason,transport:"esp32",last_response_age_ms:age,command_success_pct:null,response_success_pct:null};
 return msg;
}
""".replace("NUM", str(inv))
        mon["func"] = mon["func"].replace("const now = Date.now();", "const now = Date.now();\n" + bridge, 1)
    pub = by_id[publishers[inv-1]]
    marker = "// ESP_DOCTOR_MQTT_" + str(inv)
    if marker not in pub["func"]:
        patch = """
// ESP_DOCTOR_MQTT_NUM: preserve topic and existing entity unique IDs.
if (health.transport === "esp32") {
 Object.assign(payload,{
 esp_http_ok:health.esp_http_ok,esp_last_http_age_s:health.esp_last_http_age_s,
 esp_http_failures:health.esp_http_failures,esp_cached_replies:health.esp_cached_replies,
 esp_last_seq:health.esp_last_seq,esp_uptime_ms:health.esp_uptime_ms,
 esp_last_error:health.esp_last_error,esp_write_enabled:health.esp_write_enabled
 });
}
msg.payload = JSON.stringify(payload);
""".replace("NUM", str(inv))
        text, count = re.subn(r"msg\.payload\s*=\s*JSON\.stringify\(payload\);", lambda _: patch, pub["func"], count=1)
        assert count == 1
        pub["func"] = text

doctor = by_id["2d7f7336b88783dc"]
section = "### ESP32 : liaison RS232 via Wi-Fi"
if section not in doctor["func"]:
    serial = "### 🔌 " + "$" + "{t.serial_transport}"
    queue = "### 🔄 " + "$" + "{t.queue}"
    assert serial in doctor["func"] and queue in doctor["func"]
    content = """{% if a(e, 'transport') == 'esp32' %}
### ESP32 : liaison RS232 via Wi-Fi
| Diagnostic | Valeur |
|:--|--:|
| HTTP cache | {{ 'OK' if a(e, 'esp_http_ok') == true else 'Indisponible' }} |
| Dernière réponse valide | {{ duration(a(e, 'last_response_age_s')) }} |
| Dernier HTTP valide | {{ duration(a(e, 'esp_last_http_age_s')) }} |
| Réponses décodées | {{ a(e, 'response_count') or 0 }} |
| Réponses en cache | {{ a(e, 'esp_cached_replies') or 0 }} |
| Dernière commande | {{ a(e, 'last_response_command') or '--' }} |
| Uptime ESP (secondes) | {{ ((a(e, 'esp_uptime_ms') or 0) / 1000) | round(0) }} |
| Échecs HTTP | {{ a(e, 'esp_http_failures') or 0 }} |
| Écriture autorisée | {{ 'Oui' if a(e, 'esp_write_enabled') == true else 'Non' }} |
| Dernière erreur | {{ a(e, 'esp_last_error') or '--' }} |
{% else %}
"""
    doctor["func"] = doctor["func"].replace(serial, content + serial, 1).replace(queue, "{% endif %}\n" + queue, 1)

for node_id in ("4106254e7828ed3b","384929d824e573d3","9d441aa9cbe276c5","f4c19e972e33cb09"):
    assert by_id[node_id]["func"] == orig_by_id[node_id]["func"], "HA discovery unique IDs changed"
    assert by_id[node_id]["wires"] == orig_by_id[node_id]["wires"], "HA discovery wires changed"

assert len(nodes) == 355 and len(by_id) == 355
assert len([n for n in nodes if re.match(r"^espfull[123]_", n["id"])]) == 33
flow_path.write_text(json.dumps(nodes, ensure_ascii=False, separators=(",", ":")) + "\n")
print("PASS: 355 canonical nodes, ESP health Doctor, preserved HA unique IDs, no duplicate nodes")
