"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const crypto=require("node:crypto");
const path=require("node:path");
const root=path.join(__dirname,"..");
const nodes=JSON.parse(fs.readFileSync(path.join(root,"flows.json"),"utf8"));
const extras=JSON.parse(fs.readFileSync(path.join(root,"esp32_learning_nodes.json"),"utf8"));
const names=new Map([...nodes,...extras].map(n=>[n.id,n]));
const get=id=>{const n=names.get(id);assert.ok(n,"missing "+id);return n};
const sh=id=>crypto.createHash("sha256").update(get(id).func).digest("hex");
const ids={
 req:["","6517b72b5eb806e4","e7e742e262da6264","f2d0c3244cf5959e"],
 parser:["","06f687dbe6782ce8","e82d4d3650a26a34","057108fc794236af"],
 pump:["","5b54a23492681019","818d9f11dc2a6669","6a77a0869a848c5b"],
 replay:i=>"espfull"+i+"_replay",
 builder:i=>"espfull"+i+"_builder",
 learn:i=>"espfull"+i+"_learn",
 result:i=>"espfull"+i+"_learn_result"
};
function harness(mode="esp32",overrides={}){
 const state=new Map(),globals=new Map(),ctx=new Map(),events=[];
 const store=m=>({
   get:(k,t)=>m.get((t||"ram")+"|"+k) ?? m.get(k),
   set:(k,v,t)=>{m.set((t||"ram")+"|"+k,v);if(!t)m.set(k,v)}
 });
 const env={get:k=>{
   if(k==="ADDON_TIMEZONE")return "Europe/Paris";
   if(k==="BATTERY_SYSTEM_VOLTAGE")return "48";
   if(Object.prototype.hasOwnProperty.call(overrides,k))return overrides[k];
   if(/^INV[1-3]_TRANSPORT$/.test(k))return mode;
   if(k.endsWith("_ESP_HOST"))return "127.0.0.1";
   if(k.endsWith("_ESP_PORT"))return 18081;
   if(k.endsWith("_ESP_CODE"))return "EXAMPLE-TEST-CODE";
   if(k.endsWith("_ESP_WRITE_ENABLED"))return "false";
   return null;
 }};
 const node={warn:v=>events.push(String(v)),error:v=>events.push(String(v)),status:()=>{},send:()=>{}};
 const run=(id,msg)=>{
   if(!ctx.has(id))ctx.set(id,new Map());
   return new Function("msg","flow","global","context","env","node","Buffer","setTimeout","clearTimeout",get(id).func)(
     msg,store(state),store(globals),store(ctx.get(id)),env,node,Buffer,()=>{},()=>{}
   );
 };
 return {run,state,globals,ctx,events};
}
function synthetic(body){
 const bytes=Buffer.from("("+body,"ascii");
 let c=0;for(const b of bytes){c^=b<<8;for(let k=0;k<8;k++)c=(c&32768)?(((c<<1)^0x1021)&65535):((c<<1)&65535);}
 return Buffer.concat([bytes,Buffer.from([c>>8,c&255,13])]);
}
const fields=[230,50,230,50,1200,1100,35,380,52.5,92,15,72,5,280,52.5,0,0,0,0,1400,0,0,0,0,0].join(" ");
test("Complete flow 322 preserved + 18 snapshot nodes, Doctor, Learning and 9 safe-learning nodes",()=>{
 assert.equal(nodes.length,340);assert.equal(extras.length,15);
 assert.equal(new Set([...nodes,...extras].map(n=>n.id)).size,355);
 assert.equal(nodes.filter(n=>/VOLTRONIC DOCTOR/.test(n.name||"")).length,5);
 assert.equal(nodes.filter(n=>/Learning - (Preprocess|Decision|Build Candidate|RX Feedback|State Feedback|Complete|Persist Profile)/.test(n.name||"")).length,21);
});
test("Full existing HA identity templates and MQTT state publisher unchanged",()=>{
 const expected={
 "4106254e7828ed3b":"ab7d33caf573b5c8493080ccd14ca412dbb1ed20c1331e2ceeef87d15819f00d",
 "384929d824e573d3":"eec6c88f9df2bab71a099ee6aff1cabbdab259fbf4f32a821bc6c69a2bdbf809",
 "9d441aa9cbe276c5":"78e7fced0a35012b8d9c4cf1a9c531508c135e8531231037865933793ffb6c01",
 "429e63c1cf8135ce":"2812f1fd53b1160c09a8fa5da07b47fd6d3e423ac65e40eb7216c4a48f1c8622",
 "1fdf50692dc40100":"2812f1fd53b1160c09a8fa5da07b47fd6d3e423ac65e40eb7216c4a48f1c8622",
 "d557d9e01ce7ca0d":"2812f1fd53b1160c09a8fa5da07b47fd6d3e423ac65e40eb7216c4a48f1c8622",
 "2d7f7336b88783dc":"b50d1a2a83550cbc01d81ee6729465e23ff59bb8f05bb2ed0a56295b9f08e6fe"
 };
 for(const [id,sha]of Object.entries(expected))assert.equal(sh(id),sha);
});
for(let i=1;i<=3;i++){
 test("INV"+i+" ESP cache GET never emits UART polling",()=>{
  const h=harness("esp32");
  assert.equal(h.run(ids.req[i],{}),null);
  assert.equal(h.run(ids.pump[i],{inverterNum:i}),null);
  const getMsg=h.run(ids.builder(i),{});
  assert.equal(getMsg.method,"GET");
  assert.ok(getMsg.url.endsWith("/api/v1/bridge/snapshot"));
  assert.equal(getMsg.headers["X-Setup-Code"],"EXAMPLE-TEST-CODE");
 });
 test("INV"+i+" serial / gateway remain enabled",()=>{
  for(const transport of ["serial","tcp"]){
   const h=harness(transport);
   assert.notEqual(h.run(ids.req[i],{}),null);
   assert.equal(h.run(ids.builder(i),{}),null);
  }
 });
 test("INV"+i+" replay rejects offline, stale and duplicate sequences",()=>{
  const h=harness("esp32"),now=Date.now();
  const r={command:"QMOD",seq:3,age_ms:100,payload:"B",nak:false};
  const doc={statusCode:200,payload:{cache_only:true,available:true,uptime_ms:1000,max_seq:3,replies:[r]}};
  const out=h.run(ids.replay(i),doc);
  assert.equal(out[0].length,1);
  assert.equal(out[0][0]._esp_command,"QMOD");
  assert.equal(out[1].payload,"online");
  assert.equal(h.run(ids.replay(i),doc)[0].length,0);
  assert.equal(h.run(ids.replay(i),{statusCode:200,payload:{cache_only:true,available:false,replies:[]}})[1].payload,"offline");
  assert.equal(h.run(ids.replay(i),{statusCode:200,payload:{cache_only:true,available:true,uptime_ms:2000,max_seq:4,replies:[{...r,seq:4,age_ms:99999999}]}})[0].length,0);
 });
 test("INV"+i+" cached original frames enter original parser and retain command",()=>{
  const h=harness("esp32");
  const doc={statusCode:200,payload:{cache_only:true,available:true,uptime_ms:1200,max_seq:1,replies:[{command:"QMOD",seq:1,age_ms:0,payload:"B",nak:false}]}};
  const replay=h.run(ids.replay(i),doc);
  const parsed=h.run(ids.parser[i],replay[0][0]);
  assert.equal(parsed[1][0].payload.command,"QMOD");
  assert.equal(parsed[1][0].payload.raw,"B");
  assert.equal(h.state.get("inv"+i+"_inflight"),undefined);
 });
}
test("INV1 QPIGS legacy normalize + energy + premium + MQTT output parity",()=>{
 const h=harness("esp32");
 const doc={statusCode:200,payload:{cache_only:true,available:true,uptime_ms:25000,max_seq:1,replies:[{command:"QPIGS",seq:1,age_ms:100,payload:fields,nak:false}]}};
 const packets=h.run(ids.replay(1),doc)[0];
 assert.equal(packets.length,1);
 const parsed=h.run(ids.parser[1],packets[0])[1][0];
 assert.equal(parsed.payload.command,"QPIGS");
 const normalized=h.run("6610714dd2585f9b",parsed);
 assert.ok(normalized?.[0]?.payload || normalized?.payload);
 const message=Array.isArray(normalized)?normalized[0]:normalized;
 const energy=h.run("d93a2e10acf772a3",message)||message;
 const premium=h.run("42e26db1e016cdb9",energy)||energy;
 const output=h.run("429e63c1cf8135ce",premium);
 assert.equal(output[0].topic,"voltronic/1/state");
 assert.equal(output[1].topic,"voltronic/1/availability");
 const state=JSON.parse(output[0].payload);
 assert.ok(state.battery_voltage>0);
 assert.ok(state.ac_output_active_power>0);
});
test("Full original learning: NAK selects second current format",()=>{
 const h=harness("esp32");
 h.state.set("inv1_normalized_state",{diag:{model:"TEST",serial:"BENCH",fw_main:"1"},params:{qpiri:{max_ac_charging_current:20}}});
 const pre=h.run("8093ac9b9299eb71",{inverterNum:1,_ha_param:"max_ac_charging_current",_ha_value:30,payload:30})[0];
 const decision=h.run("49a49791d8e00e12",pre);
 const first=h.run("b1a8cd69494aac47",decision)[0];
 assert.equal(first.command,"MUCHGC0030");
 const failed=h.run("297f43a988be0f16",{inverterNum:1,command:first.command,payload:{nak:true,raw:"NAK"},_raw_response:"NAK"});
 const second=h.run("b1a8cd69494aac47",failed[1])[0];
 assert.equal(second.command,"MUCHGC030");
});
test("ESP learning write disabled by default; enabled yields semantic verified candidate only",()=>{
 const base={diag:{model:"TEST",serial:"BENCH",fw_main:"1"},_last_qpiri_ts:Date.now(),params:{qpiri:{max_ac_charging_current:20}}};
 const a=harness("esp32");a.state.set("inv1_normalized_state",base);
 a.state.set("learn_session_inv1",{active:true,sessionId:"s1",param:"max_ac_charging_current",kind:"number",requestedValue:30,currentCandidate:{command:"MUCHGC030"}});
 assert.equal(a.run(ids.learn(1),{inverterNum:1,command:"MUCHGC030"})[2]._learn_success,false);
 const b=harness("esp32",{INV1_ESP_WRITE_ENABLED:"true"});b.state.set("inv1_normalized_state",base);
 b.state.set("learn_session_inv1",{active:true,sessionId:"s1",param:"max_ac_charging_current",kind:"number",requestedValue:30,currentCandidate:{command:"MUCHGC030"}});
 const request=b.run(ids.learn(1),{inverterNum:1,command:"MUCHGC030"})[0];
 assert.equal(request.method,"POST");
 const payload=JSON.parse(request.payload);
 assert.equal(payload.parameter,"max_ac_charging_current_a");assert.equal(payload.old,20);assert.equal(payload.value,30);
 assert.equal(payload.candidate,"MUCHGC030");
 const ok=b.run(ids.result(1),{statusCode:200,_esp_learning_session:"s1",_esp_learning_command:"MUCHGC030",payload:{verified:true,set_acknowledged:true,result:"verified_by_fresh_native_readback"}});
 assert.equal(ok[0].payload.nak,false);
 const uncertain=b.run(ids.result(1),{statusCode:500,_esp_learning_session:"s1",_esp_learning_command:"MUCHGC030",payload:{result:"post_write_read_failed"}});
 assert.equal(uncertain[2]._learn_success,false);
 assert.equal(uncertain[0],null);
 const nak=b.run(ids.result(1),{statusCode:200,_esp_learning_session:"s1",_esp_learning_command:"MUCHGC030",payload:{verified:false,set_acknowledged:false,result:"set_rejected_by_nak"}});
 assert.equal(nak[1].payload.nak,true);
 assert.equal(nak[2],null);
});
test("ESP learning refuses mismatched semantic candidate without transmitting HTTP",()=>{
 const h=harness("esp32",{INV1_ESP_WRITE_ENABLED:"true"});
 h.state.set("inv1_normalized_state",{_last_qpiri_ts:Date.now(),params:{qpiri:{battery_bulk_voltage:54}}});
 h.state.set("learn_session_inv1",{active:true,sessionId:"s1",param:"battery_bulk_voltage",kind:"number",requestedValue:55.2,currentCandidate:{command:"PBCV55.2"}});
 const out=h.run(ids.learn(1),{inverterNum:1,command:"PBCV55.2"});
 assert.equal(out[0],null);assert.equal(out[1].payload.nak,true);
});

test("INV1 all 20 cached native command types parse and publish via FULL existing sensor pipeline",()=>{
 const h=harness("esp32"),day=new Date().toISOString().slice(0,10).replace(/-/g,"");
 const num=Array(32).fill(0);Object.assign(num,{8:49,9:46,10:55.2,11:54,12:2,13:30,14:80,16:2,17:1,22:53,27:100});
 const qdop=Array(13).fill(0);Object.assign(qdop,{8:30,9:40,10:10});
 const rows=[
  ["QPIGS",fields],["QPIGS2","4.1 330.0 1300"],["QMOD","B"],
  ["QPIRI",num.join(" ")],["QDOP",qdop.join(" ")],
  ["QPIWS","0".repeat(40)],["QBMS","0 1 0"],
  ["Q1","0 0 0 0 0 30 32 35 38 0 00 0 65"],
  ["QMN","AXPERT-MAX"],["QID","S123456"],
  ["QVFW","VERFW:001"],["QVFW3","VERFW3:001"],
  ["QET","123456"],["QLT","112233"],
  ["QED"+day,"35000"],["QLD"+day,"20000"],
  ["QEM"+day.slice(0,6),"600000"],["QLM"+day.slice(0,6),"350000"],
  ["QEY"+day.slice(0,4),"910000"],["QLY"+day.slice(0,4),"800000"]
 ];
 const d={cache_only:true,available:true,uptime_ms:20000,max_seq:20,
    replies:rows.map(([command,payload],i)=>({command,payload,seq:i+1,age_ms:25,nak:false}))};
 const replay=h.run(ids.replay(1),{statusCode:200,payload:d})[0];
 assert.equal(replay.length,20);
 for(const msg of replay){
    const parsed=h.run(ids.parser[1],msg);
    assert.ok(parsed[1].length>=1,"parser "+msg._esp_command);
    for(const m of parsed[1]){
       const out=h.run("6610714dd2585f9b",m);
       const state=Array.isArray(out)?out[0]:out;
       const energy=h.run("d93a2e10acf772a3",state)||state;
       const premium=h.run("42e26db1e016cdb9",energy)||energy;
       const published=h.run("429e63c1cf8135ce",premium);
       assert.equal(published[0].topic,"voltronic/1/state");
       assert.ok(JSON.parse(published[0].payload).battery_voltage>0);
    }
 }
});
