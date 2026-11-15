"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),cp=require("node:child_process");
const file="smart-voltronic/flows.json";
const before=JSON.parse(fs.readFileSync(file)),orig=new Map(before.map(n=>[n.id,n]));
assert.equal(before.length,385);
cp.execFileSync("python3",["smart-voltronic/tests/repair_esp_queue_doctor_device.py"],{stdio:"inherit"});
const after=JSON.parse(fs.readFileSync(file)),m=new Map(after.map(n=>[n.id,n]));
assert.equal(after.length,385);assert.equal(m.size,385);
for(const x of after.filter(n=>n.type==="function")){
 try{new Function(x.func)}catch(e){throw new Error(x.id+" "+x.name+": "+e.message)}
}
for(const id of ["4106254e7828ed3b","384929d824e573d3","9d441aa9cbe276c5"]){
 assert.equal(orig.get(id).func,m.get(id).func,"ORIGINAL discovery must not be overwritten");
}
for(let i=1;i<=3;i++){
 const q=m.get("espqueue"+i+"_control");
 assert(q);
 assert(q.func.includes('identifiers:["voltronic_inv_"+INV]'),"new entities must merge with original inverter MQTT device");
 assert(!q.func.includes('identifiers:["smart_voltronic_esp_inv"+INV]'),"no duplicate MQTT devices");
 assert(q.func.includes('default_entity_id:"sensor.voltronic_inv"+INV+"_esp_queue_state"'));
 assert(q.func.includes('default_entity_id:"button.voltronic_inv"+INV+"_esp_queue_purge"'));
 assert(q.func.includes('unique_id:"smart_voltronic_inv"+INV+"_esp_queue_state_v1"'));
 assert(q.func.includes('unique_id:"smart_voltronic_inv"+INV+"_esp_queue_purge_v1"'));
 const pub=m.get(["2978c86114a84875","8a05fbc3b3f6bdbc","d34cc22c5de4c537"][i-1]);
 assert(pub.func.includes("ESP_QUEUE_EXISTING_COMM_HEALTH_"+i));
 assert(pub.func.includes('payload.esp_queue_count=count'));
 assert(pub.func.includes('payload.esp_queue_state=count===0?"Vide":count>=5?"Pleine":"Attente"'));
 // original read-only parsing, snapshot and UART transport not touched.
 for(const id of ["espfull"+i+"_replay","espfull"+i+"_learn","espnet"+i+"_collect"])
  assert.equal(orig.get(id).func,m.get(id).func,"Original ESP polling or verified-write behavior changed: "+id);
}
const d=m.get("2d7f7336b88783dc").func;
for(const x of ["ESP_QUEUE_DOCTOR_CARD_V1","Purger la file ESP","esp_queue_count",
 "esp_queue_inflight","esp_queue_expired","esp_queue_rejected","esp_queue_purged",
 "esp_queue_uncertain","Diagnostic réseau indépendant","esp_uart_timeouts",
 "perform_action:\"mqtt.publish\"","État du cache et des échanges"]){
 assert(d.includes(x),"Doctor missing "+x);
}
assert(d.includes("#### État du cache et des échanges\n\n| Diagnostic | Valeur |"));
assert(d.includes("### File d'attente ESP32 (60 min / 5 paramètres)"));
assert(d.includes("### ESP32 · Diagnostic réseau indépendant\n\n"));
console.log("PASS repair: 385 nodes compile, same MQTT inverter device, 6 stable new unique IDs, Doctor queue/purge and fenced markdown tables, serial/RS232 unchanged");
