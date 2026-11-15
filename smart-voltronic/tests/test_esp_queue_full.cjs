"use strict";
const assert=require("node:assert/strict"),fs=require("fs"),cp=require("child_process");
const original=JSON.parse(fs.readFileSync("smart-voltronic/flows.json"));
const baseline=new Map(original.map(n=>[n.id,n]));
assert(original.length===373||original.length===385);
cp.execFileSync("python3",["smart-voltronic/tests/integrate_esp_queue.py"],{stdio:"pipe"});
const nodes=JSON.parse(fs.readFileSync("smart-voltronic/flows.json"));
const map=new Map(nodes.map(n=>[n.id,n]));
assert.equal(nodes.length,385);
assert.equal(map.size,385,"unique Node-RED node IDs");
for(const n of nodes.filter(n=>n.type==="function"))try{new Function(n.func)}catch(e){throw Error(n.name+": "+e.stack)}
for(const id of ["4106254e7828ed3b","384929d824e573d3","9d441aa9cbe276c5"]){
 assert.equal(map.get(id).func,baseline.get(id).func,"original MQTT discovery source untouched");
 assert.deepEqual(map.get(id).wires,baseline.get(id).wires,"original MQTT discovery wiring untouched");
}
for(let inv=1;inv<=3;inv++){
 for(const suffix of ["control","tick","purge_in","mqtt_out"])assert(map.has("espqueue"+inv+"_"+suffix),"queue node missing");
 assert.equal(map.get("espqueue"+inv+"_tick").repeat,"5");
 assert.equal(map.get("espqueue"+inv+"_purge_in").topic,"voltronic/"+inv+"/esp_queue/purge/set");
 assert(map.get("espqueue"+inv+"_control").func.includes("INV="+inv));
}
let clock=Date.parse("2026-11-15T19:00:00Z");
class FakeDate extends Date {
 constructor(...args){super(...(args.length?args:[clock]))}
 static now(){return clock}
}
const baseModes={1:"esp32",2:"esp32",3:"disabled"};
const memory=new Map(),persistent=new Map(),fmem=new Map(),cctx=new Map();
const context={get:k=>cctx.get(k),set:(k,v)=>cctx.set(k,v)};
const storage={
 get:(k,scope)=>scope==="persistent"?persistent.get(k):memory.get(k),
 set:(k,v,scope)=>{(scope==="persistent"?persistent:memory).set(k,v)}
};
const flow={get:k=>fmem.get(k),set:(k,v)=>fmem.set(k,v)};
const node={status(){},warn(){},log(){},error(e){throw Error(String(e))}};
function run(inv,msg,modes=baseModes){
 const env={get:(key)=>{
  const match=key.match(/^INV([123])_TRANSPORT$/);if(match)return modes[+match[1]];
  if(key==="INV"+inv+"_ESP_WRITE_ENABLED")return "true";
  return undefined;
 }};
 return new Function("msg","node","global","flow","env","context","Date","Math","JSON",
  map.get("espqueue"+inv+"_control").func)(
  msg,node,storage,flow,env,context,FakeDate,Math,JSON);
}
const key=i=>"espqueue_inv"+i+"_v1";
const size=i=>persistent.get(key(i))?.items?.length||0;
const state=o=>o[1].find(x=>x.topic.endsWith("/state"))?.payload;
const attr=o=>JSON.parse(o[1].find(x=>x.topic.endsWith("/attributes"))?.payload);
const tick=i=>run(i,{_esp_queue_tick:true});
const request=(i,param,value)=>run(i,{topic:"voltronic/"+i+"/set/"+param,payload:value});
const purge=i=>run(i,{topic:"voltronic/"+i+"/esp_queue/purge/set",payload:"PURGE"});

let q=tick(2);
assert.equal(state(q),"Vide");
const discovery=q[1].filter(x=>x.topic.includes("/config"));
assert.equal(discovery.length,2);
assert(discovery.every(x=>x.retain===true));
const sensor=JSON.parse(discovery.find(x=>x.topic.includes("/sensor/")).payload);
const button=JSON.parse(discovery.find(x=>x.topic.includes("/button/")).payload);
assert.equal(sensor.unique_id,"smart_voltronic_inv2_esp_queue_state_v1");
assert.equal(button.unique_id,"smart_voltronic_inv2_esp_queue_purge_v1");
assert.equal(button.command_topic,"voltronic/2/esp_queue/purge/set");
assert.equal(sensor.json_attributes_topic,"voltronic/2/esp_queue/attributes");
const legacy=tick(3);
assert.equal(state(legacy),"Vide");
assert(legacy[1].filter(x=>x.topic.endsWith("/config")).every(x=>x.payload===""),
 "Disabled transport must delete prior retained discoveries");
const serial={1:"serial",2:"gateway",3:"disabled"};
const oldMessage={topic:"voltronic/1/set/battery_float_voltage",payload:54.5};
const passthrough=run(1,oldMessage,serial);
assert.deepEqual(passthrough[0],oldMessage,"serial passthrough exact original msg");
assert(passthrough[1].filter(x=>x.topic.endsWith("/config")).every(x=>x.payload===""),
 "Serial/gateway must not expose ESP-only entities");

// Offline: queue 5 distinct canonical semantic settings.
let cmds=[
 ["battery_float_voltage",54.3],
 ["battery_bulk_voltage",55.2],
 ["max_charging_current",40],
 ["output_source_priority","sbu"],
 ["charger_source_priority","solarfirst"]
];
for(const [k,v] of cmds)q=request(2,k,v);
assert.equal(size(2),5);assert.equal(state(q),"Pleine");
assert.equal(attr(q).limit,5);
q=request(2,"battery_recharge_voltage",49.0);
assert.equal(size(2),5);assert.equal(attr(q).rejected,1);
q=request(2,"battery_float_voltage",54.6);
assert.equal(size(2),5,"same parameter must overwrite");
assert.equal(persistent.get(key(2)).items[0].value,54.6);
assert.equal(state(q),"Pleine");
assert.equal(size(1),0,"INV2 isolation");
q=request(2,"raw_command","PTOPE1");
assert.equal(q[0]?.topic,"voltronic/2/set/raw_command");
assert.equal(size(2),5,"raw manual command must not be persisted");
q=purge(2);
assert.equal(size(2),0);assert.equal(state(q),"Vide");
assert.equal(attr(q).purged,5);
assert.equal(purge(2)[0],null);
assert.equal(size(2),0);

// Expiration after 1 hour, including successful context load after restart.
q=request(2,"battery_float_voltage",54.2);
clock+=3600001;
q=tick(2);
assert.equal(size(2),0);assert.equal(attr(q).expired,1);
q=request(2,"battery_float_voltage",54.5);
clock+=4000;
const expiredState=persistent.get(key(2));
assert.equal(expiredState.items.length,1);
memory.clear();cctx.clear(); // emulate Node-RED restart, retained file context persists.
q=tick(2);
assert.equal(size(2),1,"file-backed persistence");
assert.equal(state(q),"Attente");
assert.equal(q[0],null,"must not dispatch when ESP unhealthy");

// Recovery requires recent HTTP response and fresh QPIRI; no unsafe blind retry.
memory.set("inv2_esp_health",{last_http_ok_ts:clock,last_response_ts:clock,http_ok:true});
fmem.set("inv2_normalized_state",{_last_qpiri_ts:clock,params:{qpiri:{battery_float_voltage:53.8}}});
memory.set("inv2_comm_health",{night_freeze:false,sleeping:false});
q=tick(2);
assert.equal(q[0].topic,"voltronic/2/set/battery_float_voltage");
assert.equal(q[0].payload,54.5);
assert.equal(size(2),1,"pending until learner completion");
assert(persistent.get(key(2)).inflight);
q=tick(2);
assert.equal(q[0],null,"no duplicate dispatch while in-flight");
const done=run(2,{inverterNum:2,_learn_complete:true,_learn_success:true,payload:{param:"battery_float_voltage"}});
assert.equal(size(2),0);
assert.equal(state(done),"Vide");
assert.equal(attr(done).confirmed,1);
assert.equal(persistent.get(key(2)).inflight,null);

// Retry of unknown state prohibited. No duplicate after crash.
q=request(2,"battery_bulk_voltage",54.8);
q=tick(2);
assert(q[0]);
memory.clear();cctx.clear();
q=tick(2);
assert.equal(size(2),0);
assert.equal(attr(q).uncertain,1);
assert.equal(q[0],null,"unconfirmed dispatched operation cannot be replayed");

// Purge cannot cancel command already submitted to hardware.
q=request(2,"max_charging_current",35);
memory.set("inv2_esp_health",{last_http_ok_ts:clock,last_response_ts:clock,http_ok:true});
memory.set("inv2_comm_health",{night_freeze:false,sleeping:false});
q=tick(2);assert(q[0]);
q=purge(2);
assert.equal(size(2),0);
assert.equal(attr(q).inflight_param,"max_charging_current");
const completion=run(2,{inverterNum:2,_learn_complete:true,_learn_success:false,payload:{reason:"not_verified"}});
assert.equal(attr(completion).uncertain,2);
assert.equal(completion[0],null);

// Night freeze blocks dispatch, even if cached HTTP appears healthy.
q=request(2,"battery_float_voltage",54.1);
memory.set("inv2_esp_health",{last_http_ok_ts:clock,last_response_ts:clock,http_ok:true});
memory.set("inv2_comm_health",{night_freeze:true,sleeping:true});
fmem.set("inv2_normalized_state",{_last_qpiri_ts:clock});
q=tick(2);assert.equal(q[0],null);
assert.equal(size(2),1);
q=purge(2);assert.equal(size(2),0);

console.log("PASS: 385 nodes, unique IDs, ESP-only discovery/purge, 5-item cap, 1h expiration, persistence, dedup, HA verified learning dispatch, crash/unknown safety, night freeze, serial/gateway passthrough");
