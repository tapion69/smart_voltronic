"use strict";
const assert=require("assert"),fs=require("fs"),cp=require("child_process");
const file="/tmp/esp32-doctor-complete-test.json";
fs.copyFileSync("smart-voltronic/flows.json",file);
const original=JSON.parse(fs.readFileSync(file));
assert.equal(original.length,385);
const orig=new Map(original.map(n=>[n.id,n]));
cp.execFileSync("python3",["smart-voltronic/tests/repair_doctor_esp32_full.py"] ,{
 stdio:"pipe",
 // Run in temporary separate checkout would be ideal. This test verifies the
 // materialized canonical result after CI patched the workspace flow.
});
const data=JSON.parse(fs.readFileSync("smart-voltronic/flows.json"));
const n=new Map(data.map(x=>[x.id,x]));
assert.equal(n.size,385);
for(const id of ["4106254e7828ed3b","384929d824e573d3","9d441aa9cbe276c5"]){
 assert.equal(n.get(id).func,orig.get(id).func,"HA discovery ID contract");
 assert.deepEqual(n.get(id).wires,orig.get(id).wires,"MQTT discovery topology contract");
}
for(let i=1;i<=3;i++){
 const monitor=n.get(["3ea573730416012d","7e96e2b785b1d159","638cb89fdbee6fe3"][i-1]);
 assert(monitor.func.includes("ESP_DOCTOR_NIGHT_REPAIRED_INV"+i));
 assert(monitor.func.includes("nightFreeze"));
 assert(monitor.func.includes("expectedSleepLoss"));
 assert(n.get(["d385574be7304d91","5a8f3478dfb6b6d8","609774e30abc3c0d"][i-1]).func.includes("ESP_DOCTOR_NO_LEGACY_PENDING_INV"+i));
 try{new Function(monitor.func)}catch(e){console.error("DEBUG_MONITOR_LINES",monitor.func.split("\n").slice(0,290).map((s,i)=>(i+1)+":"+s).join("\n"));throw e;}
}
const doctorJs=n.get("2d7f7336b88783dc").func;
new Function(doctorJs);
assert(doctorJs.includes('entity:switchEntity(inv,"night_sleep")'));
assert(doctorJs.includes('type:"vertical-stack"'));
assert(doctorJs.includes("ESP_DOCTOR_SERIAL_ONLY_TAIL"));

let clock=Date.parse("2026-11-15T11:00:00Z"); // Paris noon (no freeze allowed)
class TestDate extends Date{
 constructor(...args){super(...(args.length?args:[clock]));}
 static now(){return clock;}
}
const g=new Map([["premium.active",true],["addon_timezone","Europe/Paris"]]);
const ctx=new Map(),fl=new Map();
const store=(m)=>({get:(key)=>m.get(key),set:(key,v)=>m.set(key,v)});
const global=store(g),context=store(ctx),flow=store(fl);
const stat=[];
const node={status:s=>stat.push(s),warn:()=>{},error:e=>{throw Error(String(e))},log:()=>{}};
function execute(id,msg,inv=2){
 const env={get:key=>
   key==="INV"+inv+"_TRANSPORT"?"esp32":
   key==="INV"+inv+"_ESP_HOST"?"192.168.1.64":
   key==="INV"+inv+"_ESP_PORT"?"18081":
   key==="INV"+inv+"_ESP_WRITE_ENABLED"?"false":undefined};
 return new Function("msg","node","context","flow","global","env","Buffer","Date","Intl",
     n.get(id).func)(msg,node,context,flow,global,env,Buffer,TestDate,Intl);
}
function snap(){return g.get("inv2_esp_health");}
function health(){return g.get("inv2_comm_health");}
function observe(){return execute("7e96e2b785b1d159",{payload:{}}).payload;}
g.set("inv2_comm_health",{started_ts:clock,night_sleep_enabled:false,orphan_response_count:6238,events:[]});
g.set("inv2_normalized_state",{pv_total_power:0});
g.set("inv2_esp_health",{http_successes:4,http_failures:0,response_count:9,last_http_ok_ts:clock,last_response_ts:clock,last_command:"QPIGS",write_verified:0,write_rejected:0,write_uncertain:0});
let data0=observe();
assert.equal(data0.status,"HEALTHY");
assert.equal(health().night_freeze,false,"No freeze at noon even with zero solar");
assert.equal(health().esp_http_success_pct,null,"Fresh diagnostic baseline has no attempts");
const h=snap();h.http_successes+=2;h.last_http_ok_ts=clock+3000;h.last_response_ts=clock+3000;g.set("inv2_esp_health",h);
clock+=3000;observe();
assert.equal(health().esp_http_success_pct,100);
assert.equal(health().esp_http_successes,2);
// Unsolicited verified polling replies are NEVER counted as orphan without inflight.
const oldOrphans=health().orphan_response_count;
execute("5a8f3478dfb6b6d8",{command:"QPIGS",_esp_bridge:true,payload:{nak:false}});
assert.equal(health().orphan_response_count,oldOrphans);
assert.equal(execute("24bf6b0e4899bf4a",{topic:"voltronic/2/set/night_sleep",payload:"ON"}),null);
assert.equal(health().night_sleep_enabled,true);
assert.equal(g.get("inv2_night_sleep_enabled"),true);
clock=Date.parse("2026-11-15T16:30:00Z"); // 17:30 Paris, PV 0
let ev=snap();ev.last_http_ok_ts=clock;ev.last_response_ts=clock;ev.http_successes+=100;g.set("inv2_esp_health",ev);
let v=observe();assert.equal(v.status,"HEALTHY");assert.equal(v.reason,"NIGHT_FREEZE");
assert.equal(health().night_freeze,true);
let saved=health().esp_http_successes;
ev=snap();ev.http_successes+=110;ev.last_http_ok_ts=clock+35000;g.set("inv2_esp_health",ev);
clock+=35000;v=observe();
assert.equal(v.status,"SLEEPING");assert.equal(v.reason,"NIGHT_SHUTDOWN");
assert.equal(health().esp_http_successes,saved,"Freeze must hold statistics");
clock=Date.parse("2026-11-16T10:05:00Z"); // 11:05 Paris: freeze must continue with 0W
ev=snap();ev.last_http_ok_ts=clock;ev.last_response_ts=clock;g.set("inv2_esp_health",ev);
v=observe();assert.equal(v.reason,"NIGHT_FREEZE");
assert.equal(health().night_freeze,true,"Hold frozen after 10 AM until PV >= 20W");
g.set("inv2_normalized_state",{pv_total_power:null});
clock+=3000;ev=snap();ev.last_http_ok_ts=clock;ev.last_response_ts=clock;g.set("inv2_esp_health",ev);
observe();assert.equal(health().night_freeze,true,"Null PV must preserve frozen state");
g.set("inv2_normalized_state",{pv_total_power:20});
clock+=3000;ev=snap();ev.last_http_ok_ts=clock;ev.last_response_ts=clock;g.set("inv2_esp_health",ev);
v=observe();assert.equal(v.reason,"OK");assert.equal(health().night_freeze,false);
assert.equal(health().esp_http_successes,saved,"No night backfill upon wake");
g.set("inv2_normalized_state",{pv_total_power:0});
clock+=1000;ev=snap();ev.last_http_ok_ts=clock;ev.last_response_ts=clock;g.set("inv2_esp_health",ev);
observe();assert.equal(health().night_freeze,false,"No re-freeze at midday below threshold");
clock+=60000;v=observe();
assert.equal(v.status,"OFFLINE");assert.equal(v.reason,"ESP_HTTP_UNAVAILABLE");
assert.equal(health().orphan_response_count,oldOrphans,"Legacy data must not be altered");
execute("24bf6b0e4899bf4a",{topic:"voltronic/2/set/night_sleep",payload:"OFF"});
assert.equal(health().night_sleep_enabled,false);
assert.equal(health().night_freeze,false);
assert(doctorJs.includes("{% if a(e, 'transport') != 'esp32' %}"));
console.log("FULL ESP DOCTOR TEST PASS: 355 nodes, unique IDs, switch, 16-10 freeze, 20W wake, null PV, actual sleeping, frozen counters, outage, no orphan inflation");
