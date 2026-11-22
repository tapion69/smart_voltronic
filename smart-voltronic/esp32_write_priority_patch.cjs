#!/usr/bin/env node
"use strict";
/**
 * ESP32-only runtime improvement on top of canonical Smart Voltronic flows.
 * No serial/gateway functions, HA IDs, MQTT discovery or inverter wiring changed.
 * Safe/idempotent; refuse unknown Node-RED queue structure.
 */
const fs=require("node:fs");
const file=process.argv[2]||"/data/flows.json";
const nodes=JSON.parse(fs.readFileSync(file,"utf8"));
if(!Array.isArray(nodes))throw Error("Smart Voltronic flows must be an array");
const by=new Map(nodes.map(n=>[n.id,n]));
if(by.size!==nodes.length)throw Error("Duplicate Node-RED IDs");
let patched=0;
for(let inv=1;inv<=3;inv++){
  const mode=String(process.env["INV"+inv+"_TRANSPORT"]||"serial").toLowerCase();
  if(mode!=="esp32")continue;
  const control=by.get("espqueue"+inv+"_control");
  const tick=by.get("espqueue"+inv+"_tick");
  if(!control||control.type!=="function"||!tick||tick.type!=="inject")
    throw Error("ESP"+inv+" canonical queue not found");
  if(!control.func.includes("// ESP_WRITE_PRIORITY_V1")){
    const oldGate='&& now-Number(state._last_qpiri_ts||0)<120000';
    const newGate='&& Number(state._last_qpiri_ts||0)>0\n  && now-Number(state._last_qpiri_ts||0)<360000';
    if(!control.func.includes(oldGate))throw Error("ESP"+inv+" QPIRI gate changed");
    control.func=control.func.replace(oldGate,newGate);
    const oldDispatch='q.last_result="queued";q.last_error="";save();\n // Tick handles dispatch; do not bypass timeout/locking even if online.\n return publish(null);';
    const newDispatch='q.last_result="queued";q.last_error="";save();\n // ESP_WRITE_PRIORITY_V1: dispatch on the same MQTT event when ready; otherwise defer.\n // The firmware itself re-reads the setting BEFORE writing and AFTER ACK.\n';
    if(!control.func.includes(oldDispatch))throw Error("ESP"+inv+" enqueue contract changed");
    control.func=control.func.replace(oldDispatch,newDispatch);
    patched++;
  }
  // Only the ESP housekeeper runs more often. This does not poll serial or HTTP.
  if(tick.repeat!=="1"&&tick.repeat!=="5")throw Error("ESP"+inv+" unknown housekeeping cadence");
  tick.repeat="1";
}
if(patched){
 const tmp=file+".priority-tmp";
 fs.writeFileSync(tmp,JSON.stringify(nodes)+"\n");
 fs.renameSync(tmp,file);
}
console.log("ESP_WRITE_PRIORITY_V1 "+JSON.stringify({patched,espModes:[1,2,3].filter(i=>String(process.env["INV"+i+"_TRANSPORT"]||"serial").toLowerCase()==="esp32")}));
