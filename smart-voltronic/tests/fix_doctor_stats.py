#!/usr/bin/env python3
"""Correct ESP32 Doctor success accounting without changing MQTT discovery unique IDs."""
import json
from pathlib import Path

root = Path("smart-voltronic")
flow_file = root / "flows.json"
nodes = json.loads(flow_file.read_text())
assert len(nodes) == 355, "Expected the canonical 355-node flow"
m = {n["id"]: n for n in nodes}

for inv in (1, 2, 3):
    replay = m[f"espfull{inv}_replay"]
    text = replay["func"]
    needle = 'health.http_ok=true;health.last_http_ok_ts=Date.now();'
    assert needle in text, f"ESP{inv} snapshot success tracking anchor changed"
    if "health.http_successes=" not in text:
        text = text.replace(needle, needle + '\nhealth.http_successes=(health.http_successes||0)+1;', 1)
    replay["func"] = text

    learning = m[f"espfull{inv}_learn_result"]
    text = learning["func"]
    marker = f"// ESP_DOCTOR_WRITE_STATS_INV{inv}"
    if marker not in text:
        at = 'let d=msg.payload;'
        assert at in text
        tracker = f"""
{marker}
function trackVerifiedResult(outcome) {{
 const h=global.get("inv{inv}_esp_health")||{{}};
 const token=String(session.sessionId||"")+":"+String(msg._esp_learning_command||"")+":"+outcome;
 if(h.last_write_event_key===token)return;
 h.last_write_event_key=token;
 h.write_verified=Number(h.write_verified||0);
 h.write_rejected=Number(h.write_rejected||0);
 h.write_uncertain=Number(h.write_uncertain||0);
 if(outcome==="verified")h.write_verified++;
 else if(outcome==="rejected")h.write_rejected++;
 else h.write_uncertain++;
 h.last_write_ts=Date.now();
 h.last_write_status=outcome;
 global.set("inv{inv}_esp_health",h);
}}
"""
        text = text.replace(at, tracker + '\n' + at, 1)
        good = 'if(msg.statusCode===200&&d?.verified===true&&d?.set_acknowledged===true){'
        rejected = 'if(d?.result==="unsupported_candidate"||d?.result==="set_rejected_by_nak")'
        assert good in text and rejected in text
        text = text.replace(good, good + '\n trackVerifiedResult("verified");', 1)
        text = text.replace(rejected, rejected + '{\n trackVerifiedResult("rejected");', 1)
        # Close the new rejection block immediately after its second-output return
        close_needle = '_raw_response:"NAK",payload:{nak:true,raw:"NAK"}},null];'
        assert close_needle in text
        text = text.replace(close_needle, close_needle + '\n}', 1)
        uncertainty = 'return [null,null,{inverterNum:INV,_learn_complete:true,_learn_success:false,'
        assert uncertainty in text
        text = text.replace(uncertainty, 'trackVerifiedResult("uncertain");\n' + uncertainty, 1)
        learning["func"] = text

    monitor = m[["3ea573730416012d", "7e96e2b785b1d159", "638cb89fdbee6fe3"][inv-1]]
    text = monitor["func"]
    anchor = 'health.esp_http_failures=Number(h.http_failures||0);'
    assert anchor in text
    if "health.esp_http_successes=" not in text:
        data = """health.esp_http_successes=Number(h.http_successes||0);
const readAttempts=health.esp_http_successes+health.esp_http_failures;
health.esp_http_success_pct=readAttempts>0?Math.round(1000*health.esp_http_successes/readAttempts)/10:null;
health.esp_write_verified=Number(h.write_verified||0);
health.esp_write_rejected=Number(h.write_rejected||0);
health.esp_write_uncertain=Number(h.write_uncertain||0);
const confirmedWrites=health.esp_write_verified+health.esp_write_rejected;
health.esp_write_success_pct=confirmedWrites>0?Math.round(1000*health.esp_write_verified/confirmedWrites)/10:null;
health.esp_write_last_status=String(h.last_write_status||"none");
"""
        text = text.replace(anchor, anchor + '\n' + data, 1)
    monitor["func"] = text

    publisher = m[["2978c86114a84875", "8a05fbc3b3f6bdbc", "d34cc22c5de4c537"][inv-1]]
    text = publisher["func"]
    anchor = 'esp_http_failures:health.esp_http_failures,'
    assert anchor in text
    if "esp_http_success_pct:health.esp_http_success_pct" not in text:
        text = text.replace(anchor, anchor + 'esp_http_successes:health.esp_http_successes,esp_http_success_pct:health.esp_http_success_pct,\n esp_write_verified:health.esp_write_verified,esp_write_rejected:health.esp_write_rejected,esp_write_uncertain:health.esp_write_uncertain,esp_write_success_pct:health.esp_write_success_pct,esp_write_last_status:health.esp_write_last_status,', 1)
    publisher["func"] = text

doctor = m["2d7f7336b88783dc"]
body = doctor["func"]
anchor = "function inverterSummaryCard(inv) {"
assert anchor in body
if "// ESP_DOCTOR_SUMMARY_RATES" not in body:
    # Keep existing HA entity IDs untouched. ESP summary uses actual communication
    # attributes, rather than legacy serial/tcp success sensors that default to 0%.
    prefix = """function inverterSummaryCard(inv) {
 // ESP_DOCTOR_SUMMARY_RATES
 const cfg=global.get("config.invCfg")||{};
 const transport=String(cfg[inv]?.transport||cfg[String(inv)]?.transport||"").toLowerCase();
 if(transport==="esp32"){
  const entity=sensor(inv,"communication_health");
  const txt = `
### ESP32 · Onduleur ${inv}
**Communication :** {{ states('ENTITY') }}

| Mesure | Résultat |
|:--|--:|
| Lectures HTTP réussies | {{ state_attr('ENTITY','esp_http_successes') or 0 }} |
| Lectures HTTP échouées | {{ state_attr('ENTITY','esp_http_failures') or 0 }} |
| Réussite des lectures | {{ ((state_attr('ENTITY','esp_http_success_pct')|string) ~ ' %') if state_attr('ENTITY','esp_http_success_pct') is not none else 'Aucune lecture comptabilisée' }} |
| Modifications confirmées | {{ state_attr('ENTITY','esp_write_verified') or 0 }} |
| Modifications rejetées | {{ state_attr('ENTITY','esp_write_rejected') or 0 }} |
| Modifications incertaines | {{ state_attr('ENTITY','esp_write_uncertain') or 0 }} |
| Réussite des modifications confirmées | {{ ((state_attr('ENTITY','esp_write_success_pct')|string) ~ ' %') if state_attr('ENTITY','esp_write_success_pct') is not none else 'Aucune commande testée' }} |
`.replaceAll("ENTITY",entity);
  return {type:"markdown",title:"Communication ESP32 - Onduleur "+inv,content:txt};
 }
"""
    body = body.replace(anchor, prefix, 1)
section = "### ESP32 : liaison RS232 via Wi-Fi"
assert section in body
if "| Lectures HTTP réussies |" not in body[body.index(section):]:
    at = "| HTTP cache |"
    # Also display real counters in full Doctor view.
    assert at in body
    extra = """| Lectures HTTP réussies | {{ a(e, 'esp_http_successes') or 0 }} |
| Taux de réussite des lectures HTTP | {{ ((a(e, 'esp_http_success_pct')|string) ~ ' %') if a(e, 'esp_http_success_pct') is not none else 'Aucune lecture' }} |
| Modifications vérifiées | {{ a(e, 'esp_write_verified') or 0 }} |
| Modifications rejetées | {{ a(e, 'esp_write_rejected') or 0 }} |
| Modifications incertaines | {{ a(e, 'esp_write_uncertain') or 0 }} |
| Taux de réussite des modifications confirmées | {{ ((a(e, 'esp_write_success_pct')|string) ~ ' %') if a(e, 'esp_write_success_pct') is not none else 'Aucune commande testée' }} |
"""
    ix = body.index(section)
    pos = body.index(at, ix)
    body = body[:pos] + extra + body[pos:]
doctor["func"] = body

assert len(nodes) == 355 and len(m) == 355
flow_file.write_text(json.dumps(nodes, ensure_ascii=False, separators=(",", ":")) + "\n")
print("PASS: ESP1/2/3 HTTP success and verified-write statistics; preserve all MQTT discovery IDs")
