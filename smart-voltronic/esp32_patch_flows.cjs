#!/usr/bin/env node
"use strict";
/*
 * ESP32/RS232 bridge for Smart Voltronic main 2.3.7.
 * Only patches a verified copy of the existing full 322-node flow;
 * all historical HA MQTT IDs, discovery/energy logic and premium nodes stay put.
 * Per inverter: serial / tcp / esp32 / disabled are independent.
 * ESP32 firmware owns UART; Node-RED consumes read-only authenticated cache;
 * only validated semantic Learning writes can use ESP32 HTTP.
 */
const fs=require("node:fs");
const path=require("node:path");
const sourceFile=process.argv[2] || "/data/flows.json";
const addonDir=process.argv[3] || "/addon";
const modes=[1,2,3].map(i=>String(process.env["INV"+i+"_TRANSPORT"]||"serial").toLowerCase());
const expected=[
  {request:"6517b72b5eb806e4",pump:"5b54a23492681019",set:"381cb2e10d9b5625",candidate:"b1a8cd69494aac47",legacy:"e56dd41194be1e35",learnFeed:"9a6552a4d8f3ae99",verify:"6013564ccd697834",io:["a3fcb4ec8a648918","fb96a298c987d683","1e1a7ad9eb6b2a52"]},
  {request:"e7e742e262da6264",pump:"818d9f11dc2a6669",set:"46ca504f4729209c",candidate:"bbd3067079b8f836",legacy:"e4b3e0c1b7d78e69",learnFeed:"4cf4c0d516871496",verify:"bf5b654c1eeba5bc",io:["6431323d5b272bc2","07215c45cd82b652","63bcf98463aab41a"]},
  {request:"f2d0c3244cf5959e",pump:"6a77a0869a848c5b",set:"03e8bd2641c96986",candidate:"9288782e4d4509cf",legacy:"aae15edafbdf31c6",learnFeed:"349ff60ff7844948",verify:"6fc157dd4e04371b",io:["8e2f29ef96d4823e","c78f64d7a88c2a2e","b8fce564589ea5e6"]}
];
function assert(ok,msg){if(!ok)throw Error("ESP BRIDGE SAFE STOP: "+msg)}
assert(modes.every(m=>["serial","tcp","esp32","disabled"].includes(m)),"unsupported inverter mode");
const base=JSON.parse(fs.readFileSync(sourceFile,"utf8"));
assert(Array.isArray(base)&&base.length>=322,"existing full flows.json not recognized");
const cache=JSON.parse(fs.readFileSync(path.join(addonDir,"esp32_bridge_nodes.json"),"utf8"));
const learning=JSON.parse(fs.readFileSync(path.join(addonDir,"esp32_learning_nodes.json"),"utf8"));
assert(cache.length===18&&learning.length===15,"wrong ESP sidecar node count");
const byId=new Map(base.map(n=>[n.id,n]));
assert(byId.size===base.length,"duplicate original flow IDs");

// The original "parse options" function only recognizes serial/tcp.
// Without this patch it silently turns esp32 into serial and activeInvs=0,
// preventing MQTT HA discovery and daily counters even with working ESP cache.
const parseOptions=byId.get("309c2c85e8d3a815");
assert(parseOptions&&parseOptions.type==="function"&&parseOptions.name==="parse options","parse options function missing");
const parseModeRegex=/return \(v === "gateway" \|\| v === "tcp"\) \? "tcp" : "serial";/;
const parseModeReplacement='if (v === "esp32" || v === "disabled") return v;\n  return (v === "gateway" || v === "tcp") ? "tcp" : "serial";';
if(!parseOptions.func.includes('if (v === "esp32" || v === "disabled") return v;')){
 assert(parseModeRegex.test(parseOptions.func),"parse options legacy transport guard changed");
 parseOptions.func=parseOptions.func.replace(parseModeRegex,parseModeReplacement);
}
const activeMarker="// ESP_BRIDGE_ACTIVE_INV_MODES\n";
if(!parseOptions.func.includes(activeMarker)){
 const activeRegex=/(\s*)if \(\s*c\.transport === "tcp"\s*\) \{/;
 assert(activeRegex.test(parseOptions.func),"parse options activeInvs branch changed");
 parseOptions.func=parseOptions.func.replace(activeRegex,(matched,space)=>
   space+activeMarker+
   space+'if (c.transport === "esp32") {\n'+
   space+'  if (isValidHost(opts[\`inv\${i}_esp_host\`]) && isValidPort(opts[\`inv\${i}_esp_port\`])) activeInvs.push(i);\n'+
   space+'  continue;\n'+
   space+'}\n'+
   space+'if (c.transport === "disabled") continue;\n'+matched);
}

const ioIDs=new Set();
for(let idx=0;idx<3;idx++){
 const i=idx+1, p=expected[idx],mode=modes[idx];
 for(const id of [p.request,p.pump,p.set,p.candidate,p.learnFeed,p.verify,...p.io]){
   assert(byId.has(id),"missing main "+id+" for INV"+i);
 }
 for(const id of p.io)ioIDs.add(id);
 const req=byId.get(p.request),pump=byId.get(p.pump),set=byId.get(p.set),candidate=byId.get(p.candidate);
 assert(req.type==="function"&&pump.type==="function"&&set.type==="function"&&candidate.type==="function","node type mismatch INV"+i);
 assert(set.name==="HA SET → Voltronic CMD"&&candidate.name==="Learning - Build Candidate","command mapping changed for INV"+i);
 assert(Array.isArray(candidate.wires)&&candidate.wires.length>=2,"candidate outputs changed INV"+i);
 // The historical parser obtains the command identity only from the UART
 // queue's inflight record. That queue is intentionally OFF for ESP32.
 // Cache replies already carry their strict, CRC-validated read command;
 // without this adaptation the parser silently categorizes everything UNKNOWN
 // and none of the unchanged MQTT/HA entities receive measurements.
 const parserId=["06f687dbe6782ce8","e82d4d3650a26a34","057108fc794236af"][idx];
 const parser=byId.get(parserId);
 assert(parser&&parser.type==="function","original Voltronic parser missing INV"+i);
 const marker="// ESP_BRIDGE_VERIFIED_REPLY_CMD_INV"+i+"\n";
 if(!parser.func.includes(marker)){
    const target="const inflight = flow.get(inflightKey);";
    assert(parser.func.includes(target),"original parser inflight lookup changed INV"+i);
    parser.func=parser.func.replace(target,marker+
      'const espCmd = String(msg._esp_command || "").toUpperCase();\n'+
      'const espRead = msg._esp_bridge === true && Number(msg.inverterNum) === '+i+
      ' && /^(QPIGS2?|QMOD|QPIRI|QDOP|QPIWS|QMN|QID|QVFW3?|QBMS|Q1|QET|QLT|QED[0-9]{8}|QLD[0-9]{8}|QEM[0-9]{6}|QLM[0-9]{6}|QEY[0-9]{4}|QLY[0-9]{4})$/.test(espCmd);\n'+
      'if (msg._esp_bridge === true && !espRead) return null;\n'+
      'const inflight = espRead ? {cmd:espCmd,raw:espCmd,raw_manual:false} : flow.get(inflightKey);');
 }

 // Do NOT poll the same UART from Node-RED and firmware.
 for(const n of [req,pump]){
   const marker="// ESP_BRIDGE_POLL_GUARD_INV"+i+"\n";
   if(!n.func.startsWith(marker)){
      n.func=marker+"if ([\"esp32\",\"disabled\"].includes(String(env.get(\"INV"+i+"_TRANSPORT\")||\"\").toLowerCase())) return null;\n"+n.func;
   }
 }
 // The learning-capable HA SET logic is retained. Only unsafe direct bypass
 // is prohibited in ESP mode; original serial/tcp direct dispatch remains.
 const guard="// ESP_BRIDGE_DIRECT_GUARD_INV"+i+"\n";
 if(!set.func.includes(guard)){
   const needle="const batteryTypeMap =";
   assert(set.func.includes(needle),"direct command separation missing INV"+i);
   set.func=set.func.replace(needle,guard+
     "if(String(env.get(\"INV"+i+"_TRANSPORT\")||\"\").toLowerCase()===\"esp32\") { node.warn(\"ESP"+i+": only verified Learning writes permitted; direct command ignored\"); return null; }\n"+needle);
 }
 // Preserve original queue path when selected mode is serial/tcp.
 candidate.wires[0]=mode==="esp32"?["espfull"+i+"_learn"]:[p.legacy];
 // Learning's link-input RX and state verification operate independently
 // of the former Queue Pump and require a fresh QPIRI from ESP cache.
 for(const [id,extra]of [[p.learnFeed,"espfull"+i+"_learn"],[p.verify,"espfull"+i+"_verify_filter"]]){
    const n=byId.get(id);
    assert(Array.isArray(n.wires)&&Array.isArray(n.wires[0]),"missing Learning links INV"+i);
    if(!n.wires[0].includes(extra))n.wires[0].push(extra);
 }
 for(const id of p.io){
   const n=byId.get(id);
   if(mode==="esp32"||mode==="disabled"){
     if(n._esp_bridge_disabled!==true)n._esp_bridge_was_disabled=(n.d===true);
     n.d=true;n._esp_bridge_disabled=true;
   }else if(n._esp_bridge_disabled===true){
     if(n._esp_bridge_was_disabled===true)n.d=true;else delete n.d;
     delete n._esp_bridge_disabled;delete n._esp_bridge_was_disabled;
   }
 }
}
for(const n of [...cache,...learning]){
 assert(n&&/^espfull[123]_/.test(n.id),"non ESP node in bridge sidecar");
 // On restart do not duplicate; a firmware/backend update can update the
 // sidecar nodes without destroying every other base node.
 const old=byId.get(n.id);
 if(!old) {const copy=JSON.parse(JSON.stringify(n));base.push(copy);byId.set(n.id,copy)}
 // Existing ESP nodes in canonical 355-node flows.json are the source of truth.
 // Never overwrite them with stale JSON sidecars during add-on startup.
}
assert(byId.size===base.length,"duplicate merged ID");
assert(base.length>=355,"expected 322 original + 33 ESP");
for(let i=1;i<=3;i++){
 const p=expected[i-1],candidate=byId.get(p.candidate);
 assert(candidate.wires[0].length===1,"candidate must have exclusive output");
 assert(candidate.wires[0][0]===(modes[i-1]==="esp32"?"espfull"+i+"_learn":p.legacy),"unsafe cross-inverter learning route");
 const snap=byId.get("espfull"+i+"_replay");
 assert(snap.wires[0].length===1,"snapshot must only reach one original parser");
}
const out=JSON.stringify(base,null,0);
const tmp=sourceFile+".esp32-tmp";
fs.writeFileSync(tmp,out);
fs.renameSync(tmp,sourceFile);
console.log("ESP BRIDGE OK: "+base.length+" nodes; INV1="+modes[0]+", INV2="+modes[1]+", INV3="+modes[2]+"; original HA/Premium nodes preserved");
