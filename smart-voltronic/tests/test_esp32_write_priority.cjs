"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const cp=require("node:child_process");
const srcFile="smart-voltronic/flows.json";
const data=JSON.parse(fs.readFileSync(srcFile,"utf8"));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"voltronic-esp-priority-"));
const flow=path.join(tmp,"flows.json");
fs.writeFileSync(flow,JSON.stringify(data));
const env={...process.env,INV1_TRANSPORT:"serial",INV2_TRANSPORT:"esp32",INV3_TRANSPORT:"disabled"};
cp.execFileSync("node",["smart-voltronic/esp32_patch_flows.cjs",flow,"smart-voltronic"],{env});
const baseline=JSON.parse(fs.readFileSync(flow,"utf8"));
const first=new Map(baseline.map(n=>[n.id,n]));
cp.execFileSync("node",["smart-voltronic/esp32_write_priority_patch.cjs",flow],{env});
const patched=JSON.parse(fs.readFileSync(flow,"utf8"));
assert.equal(patched.length,baseline.length,"no entities or nodes added/removed");
const after=new Map(patched.map(n=>[n.id,n]));
assert.equal(after.size,baseline.length,"unique node IDs");
const changed=patched.filter(n=>JSON.stringify(n)!==JSON.stringify(first.get(n.id))).map(n=>n.id).sort();
assert.deepEqual(changed,["espfull2_learn_result","espqueue2_control","espqueue2_tick"],"only ESP2 functions and timer changed");
assert.equal(after.get("espqueue2_tick").repeat,"1");
assert.equal(after.get("espqueue1_tick").repeat,"5","serial INV1 intact");
assert.deepEqual(after.get("99e50980ea51a78b").wires,first.get("99e50980ea51a78b").wires);
assert.deepEqual(after.get("0e9a9faa6a7dc537").wires,first.get("0e9a9faa6a7dc537").wires);
assert(after.get("espfull2_learn_result").func.includes('d?.result==="already_at_requested_value"'));
assert(!after.get("espqueue2_control").func.includes("Tick handles dispatch"));
assert(after.get("espqueue2_control").func.includes("ESP_WRITE_PRIORITY_V1"));
// Idempotent startup, including the 1-second housekeeping tick.
const once=fs.readFileSync(flow,"utf8");
cp.execFileSync("node",["smart-voltronic/esp32_write_priority_patch.cjs",flow],{env});
assert.equal(fs.readFileSync(flow,"utf8"),once,"repeat startup must not rewrite");
let now=Date.parse("2026-11-22T09:00:00Z");
class FakeDate extends Date {constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
const fmem=new Map(),gmem=new Map(),pmem=new Map(),cmem=new Map();
const global={get:(k,s)=>(s==="persistent"?pmem:gmem).get(k),set:(k,v,s)=>(s==="persistent"?pmem:gmem).set(k,v)};
const flowContext={get:k=>fmem.get(k),set:(k,v)=>fmem.set(k,v)};
const context={get:k=>cmem.get(k),set:(k,v)=>cmem.set(k,v)};
const node={status(){},warn(){},log(){},error(e){throw Error(String(e))}};
const runtime={get:k=>k==="INV2_TRANSPORT"?"esp32":k==="INV2_ESP_WRITE_ENABLED"?"true":""};
const fn=new Function("msg","global","flow","context","node","env","Date",
  after.get("espqueue2_control").func);
function emit(msg){return fn(msg,global,flowContext,context,node,runtime,FakeDate)}
gmem.set("inv2_esp_health",{last_http_ok_ts:now,last_response_ts:now,http_ok:true});
gmem.set("inv2_comm_health",{night_freeze:false,sleeping:false});
fmem.set("inv2_normalized_state",{_last_qpiri_ts:now-240000,
  params:{qpiri:{battery_float_voltage:53.8}}});
const out=emit({topic:"voltronic/2/set/battery_float_voltage",payload:54.2});
assert.equal(out[0].topic,"voltronic/2/set/battery_float_voltage","immediate priority dispatch");
assert.equal(out[0].payload,54.2);
assert.equal(out[0]._esp_queue_replay,true);
const store=gmem.get("espqueue_inv2_v1");
assert.equal(store.items.length,1);
assert.equal(store.inflight.param,"battery_float_voltage");
// An active transaction must not be duplicated or interrupted.
const pending=emit({topic:"voltronic/2/set/battery_float_voltage",payload:54.4});
assert.equal(pending[0],null);
assert.equal(gmem.get("espqueue_inv2_v1").items.length,2);
emit({_learn_complete:true,_learn_success:true,inverterNum:2});
assert.equal(gmem.get("espqueue_inv2_v1").inflight,null);
// An older-than-poll-interval QPIRI blocks, but the local 1s tick retries.
fmem.set("inv2_normalized_state",{_last_qpiri_ts:now-400000,
  params:{qpiri:{battery_float_voltage:53.8}}});
assert.equal(emit({_esp_queue_tick:true})[0],null);
fmem.set("inv2_normalized_state",{_last_qpiri_ts:now,
  params:{qpiri:{battery_float_voltage:54.2}}});
assert.equal(emit({_esp_queue_tick:true})[0]._esp_queue_replay,true);
// Firmware's fresh preflight may confirm a no-op without ever sending SET.
// Learning must complete successfully, but never misreport a failed write.
const feedbackFn=new Function("msg","flow","global","node","context","env","Date",after.get("espfull2_learn_result").func);
fmem.set("learn_session_inv2",{active:true,sessionId:"test-noop",param:"battery_float_voltage"});
const verifiedNoop=feedbackFn({statusCode:200,_esp_learning_session:"test-noop",
  _esp_learning_command:"PBFT54.2",
  payload:{verified:true,set_acknowledged:false,result:"already_at_requested_value"}},
  flowContext,global,node,context,runtime,FakeDate);
assert.equal(verifiedNoop[0]._raw_response,"ACK");
assert.equal(verifiedNoop[0].command,"PBFT54.2");
console.log("PASS: ESP write priority, stale preview recovery, no duplicate SET, 3-inverter isolation");
