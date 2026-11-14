"use strict";
/* Offline regression suite for the REAL Node-RED functions in flows.json.
 * No Home Assistant, ESP32, real addresses or serial port required.
 * Run: node --test smart-voltronic/tests/esp32-ha-bridge.test.cjs
 */
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const nodes=JSON.parse(fs.readFileSync(path.join(__dirname,"..","flows.json"),"utf8"));
const byId=id=>{const n=nodes.find(x=>x.id===id);assert.ok(n,"missing node "+id);return n;};
const ids={
 parser:["","4a383e9860f1a0aa","dbbd9dd86fd5695b","872c4f8a9cfa1807"],
 enq:["","e6b2d3de3019c3fb","3c224b7e3f20eee7","2ffb7137af260e8c"],
 pump:["","a805fad0f7e48fe5","0be25ea15fb469b2","c4fdf65a9c05900a"],
 req:["","75cace1d586241f9","9a9d228741f312c2","c94995b798b91cde"],
 tx:["","2b4ef851376520c9","d5260b4ced1e451a","c49d07c9a15f5119"],
 pub:["","62d983931faacd27","a9cd5d4f7c52083c","1beb5ca711de6c85"],
 get:i=>"esp32ha_request_"+i,
 adapter:i=>"esp32ha_adapter_"+i,
 set:i=>"esp32ha_set_prepare_"+i,
 result:i=>"esp32ha_set_result_"+i
};
function harness(mode="serial",changes={}){
 const flowData=new Map(),globalData=new Map(),ctx=new Map(),alerts=[];
 const store=m=>({get:k=>m.get(k),set:(k,v)=>m.set(k,v)});
 const env={get:k=>{
   if(k==="ADDON_TIMEZONE")return "Europe/Paris";
   if(changes[k]!==undefined)return changes[k];
   if(/^INV[1-3]_TRANSPORT$/.test(k))return mode;
   if(/_ESP_HOST$/.test(k))return "127.0.0.1";
   if(/_ESP_PORT$/.test(k))return 18081;
   if(/_ESP_CODE$/.test(k))return "TESTCODE123";
   if(/_ESP_WRITE_ENABLED$/.test(k))return "false";
   return null;
 }};
 const node={warn:x=>alerts.push(String(x)),error:x=>alerts.push(String(x)),status:()=>{}};
 const invoke=(id,msg)=>{
   if(!ctx.has(id))ctx.set(id,new Map());
   return new Function("msg","flow","global","context","node","env","Buffer",byId(id).func)(
     msg,store(flowData),store(globalData),store(ctx.get(id)),node,env,Buffer
   );
 };
 return {invoke,flowData,alerts};
}
function encodedReply(body){
 const h=harness();
 h.invoke("ad544e9b772d8b69",{});
 return h.invoke("ad544e9b772d8b69",{})||Buffer.from(body); // unused helper initializer
}
function crcPacket(body){
 let crc=0;
 for(const b of Buffer.from(body,"ascii")){
   crc^=b<<8;
   for(let k=0;k<8;k++)crc=(crc&0x8000)?(((crc<<1)^0x1021)&0xffff):((crc<<1)&0xffff);
 }
 return Buffer.concat([Buffer.from(body,"ascii"),Buffer.from([crc>>8,crc&255,13])]);
}
test("Graph: IDs unique, 3 bridge adapters, unchanged MQTT publisher IDs",()=>{
 assert.equal(new Set(nodes.map(x=>x.id)).size,nodes.length);
 for(let i=1;i<=3;i++){
   assert.ok(byId(ids.get(i)).func.includes("GET"));
   assert.ok(byId(ids.adapter(i)).func.includes("voltronic/"));
   assert.equal(byId(ids.pub[i]).type,"function");
   assert.ok(byId(ids.enq[i]).func.includes("esp32"));
 }
});
for(let i=1;i<=3;i++){
 test("INV"+i+" serial and gateway preserve scheduler; ESP blocks duplicate poll",()=>{
   const a=harness("serial"),b=harness("tcp"),c=harness("esp32");
   assert.ok(Array.isArray(a.invoke(ids.req[i],{})[0]));
   assert.ok(Array.isArray(b.invoke(ids.req[i],{})[0]));
   assert.equal(c.invoke(ids.req[i],{}),null);
 });
 test("INV"+i+" CRC valid/QMOD, corrupted CRC rejected, NAK handled",()=>{
   const h=harness("serial"),buf=crcPacket("(B");
   h.flowData.set("inv"+i+"_inflight",{cmd:"QMOD",ts:Date.now()});
   let good=h.invoke(ids.parser[i],{inverterNum:i,payload:buf});
   assert.equal(good[1][0].payload.fields[0],"B");
   assert.equal(h.flowData.get("inv"+i+"_inflight"),null);
   h.flowData.set("inv"+i+"_inflight",{cmd:"QMOD",ts:Date.now()});
   const bad=Buffer.from(buf);bad[bad.length-2]^=1;
   assert.equal(h.invoke(ids.parser[i],{inverterNum:i,payload:bad}),null);
   assert.ok(h.flowData.get("inv"+i+"_inflight"));
   h.flowData.set("inv"+i+"_inflight",{cmd:"QPIGS2",ts:Date.now()});
   const nak=h.invoke(ids.parser[i],{inverterNum:i,payload:Buffer.from([0x15])});
   assert.equal(nak[1][0].payload.nak,true);
   assert.equal(h.flowData.get("inv"+i+"_supports_qpigs2"),false);
 });
 test("INV"+i+" queue serializes, retains verified SET metadata and priority",()=>{
   const h=harness("serial");
   h.invoke(ids.enq[i],{inverterNum:i,command:"PCVV55.2",_set_param:"battery_bulk_voltage"});
   const sent=h.invoke(ids.pump[i],{inverterNum:i});
   assert.equal(sent.command,"PCVV55.2");
   assert.equal(sent._set_param,"battery_bulk_voltage");
   h.invoke(ids.enq[i],{inverterNum:i,payload:Array.from({length:220},()=>({command:"QPIGS"}))});
   assert.equal(h.invoke(ids.pump[i],{inverterNum:i}),null);
   assert.ok(h.flowData.get("inv"+i+"_queue").length<=200);
 });
 test("INV"+i+" GET reads shared ESP cache, not UART",()=>{
   const h=harness("esp32");
   const msg=h.invoke(ids.get(i),{_esp_kind:"telemetry"});
   assert.equal(msg.method,"GET");
   assert.equal(msg.url,"http://127.0.0.1:18081/api/v1/telemetry");
   assert.equal(msg.headers["X-Setup-Code"],"TESTCODE123");
   assert.equal(h.invoke(ids.get(i),{_esp_kind:"details"}).url.endsWith("/details"),true);
 });
 test("INV"+i+" ESP details+telemetry map to the SAME MQTT state and availability topics",()=>{
   const h=harness("esp32"),adapt=ids.adapter(i);
   h.invoke(adapt,{statusCode:200,_esp_kind:"details",payload:{
     operation_mode:"B",parameters:{qpiri:{battery_bulk_voltage_v:55.2,output_source_priority_code:2,charger_source_priority_code:1},qdop:{battery_under_capacity_pct:10}},
     identification:{model:"MOCK",firmware_main:"V1"},energy_wh:{pv:{total:150000},load:{total:90000}}
   }});
   const [state,offline]=h.invoke(adapt,{statusCode:200,_esp_kind:"telemetry",payload:{
      available:true,age_ms:100,values:{battery_voltage_v:52.1,output_w:110,
      grid_voltage_v:0,pv1_current_a:0,pv1_voltage_v:0,
      battery_charge_a:0,battery_discharge_a:4,heatsink_temp_c:38}
   }});
   assert.equal(offline,null);
   assert.equal(state.payload.battery_voltage,52.1);
   assert.equal(state.payload.pv_total_power,0);
   assert.ok(state.payload.battery_power<0);
   assert.equal(state.payload.params.qpiri.output_source_priority,"SolarBatUtility");
   const published=h.invoke(ids.pub[i],state);
   assert.equal(published[0].topic,"voltronic/"+i+"/state");
   assert.equal(published[1].topic,"voltronic/"+i+"/availability");
   assert.equal(published[1].payload,"online");
   assert.equal(JSON.parse(published[0].payload).battery_voltage,52.1);
   const stale=h.invoke(adapt,{statusCode:200,_esp_kind:"telemetry",payload:{available:false,age_ms:11000}});
   assert.equal(stale[0],null);
   assert.equal(stale[1].payload,"offline");
   assert.equal(stale[1].topic,"voltronic/"+i+"/availability");
 });
 test("INV"+i+" semantic changes fail closed until explicitly enabled",()=>{
   const blocked=harness("esp32");
   blocked.flowData.set("esp"+i+"_details_seen",Date.now());
   blocked.flowData.set("esp"+i+"_details",{parameters:{qpiri:{battery_bulk_voltage_v:54.8}}});
   assert.equal(blocked.invoke(ids.set(i),{topic:"voltronic/"+i+"/set/battery_bulk_voltage",payload:55.2}),null);
   const h=harness("esp32",{["INV"+i+"_ESP_WRITE_ENABLED"]:"true"});
   h.flowData.set("esp"+i+"_details_seen",Date.now());
   h.flowData.set("esp"+i+"_details",{parameters:{qpiri:{battery_bulk_voltage_v:54.8}}});
   const req=h.invoke(ids.set(i),{topic:"voltronic/"+i+"/set/battery_bulk_voltage",payload:55.2});
   assert.equal(req.method,"POST");
   assert.equal(req.headers["X-Write-Confirmed"],"yes");
   assert.deepEqual(JSON.parse(req.payload),{parameter:"battery_bulk_voltage_v",old:54.8,value:55.2,confirmed:true});
   assert.equal(h.invoke(ids.set(i),{topic:"voltronic/"+i+"/set/unknown_command",payload:55.2}),null);
   assert.equal(h.invoke(ids.set(i),{topic:"voltronic/"+i+"/set/battery_bulk_voltage",payload:54.8}),null);
   const result=h.invoke(ids.result(i),{statusCode:200,_esp_edit_parameter:"battery_bulk_voltage_v",payload:{verified:false,set_acknowledged:true,result:"readback_does_not_match"}});
   assert.equal(result._esp_kind,"details");
   assert.equal(h.flowData.get("esp"+i+"_last_edit").success,false);
 });
}
test("INV1 legacy SET ACK transitions to fresh verification phase; not stale QMOD",()=>{
 const h=harness("serial");
 h.flowData.set("inv1_pending_set",{param:"battery_bulk_voltage",value:55.2,phase:"sending",tryIndex:0,candidates:[{key:"PCVV",cmd:"PCVV55.2"}]});
 h.flowData.set("inv1_inflight",{cmd:"PCVV55.2",ts:Date.now()});
 h.invoke(ids.parser[1],{inverterNum:1,payload:crcPacket("(ACK")});
 assert.equal(h.flowData.get("inv1_pending_set").phase,"await_verify");
 const verify="3be46be2d1ed1a58";
 h.invoke(verify,{inverterNum:1,_cmd:"QMOD",payload:{params:{qpiri:{battery_bulk_voltage:55.2}}}});
 assert.equal(h.flowData.get("inv1_pending_set").phase,"await_verify");
 h.invoke(verify,{inverterNum:1,_cmd:"QPIRI",payload:{params:{qpiri:{battery_bulk_voltage:55.2}}}});
 assert.equal(h.flowData.get("inv1_pending_set"),null);
});
test("Legacy selectors keep original discovery, topic and entity identifiers",()=>{
 const discovery=nodes.filter(n=>/HA Discovery/.test(n.name||""));
 assert.ok(discovery.length>=3);
 const publishers=nodes.filter(n=>n.name==="MQTT state publisher");
 assert.equal(publishers.length,3);
 assert.deepEqual(publishers.map(n=>n.id).sort(),ids.pub.slice(1).sort());
});
