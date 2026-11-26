"use strict";
const fs=require("node:fs");const patch=require("../transaction_fifo_patch.cjs");
function tests(nodes){
const by=new Map(nodes.map(n=>[n.id,n])),count={passed:0},checks=[];
const assert=(ok,label)=>{if(!ok)throw Error(label);count.passed++;checks.push(label)};
const names=[
["381cb2e10d9b5625","8093ac9b9299eb71","49a49791d8e00e12","b1a8cd69494aac47","297f43a988be0f16","63a5df524557766e","7b3c22ccb3f35b22","ae550f5a2172cd28","5b54a23492681019"],
["46ca504f4729209c","05be72a05279b7ec","d2c377c45785984f","bbd3067079b8f836","6bb428a986b3c6aa","360742b2f76a7b41","4e9392aefa24990d","41e38efed69c0164","818d9f11dc2a6669"],
["03e8bd2641c96986","feda378cd425f63c","b636109e2d09a423","9288782e4d4509cf","326527ee9a32da40","eb3be03414b247e5","3a59470b27677402","16e174899c2ba6ec","6a77a0869a848c5b"]];
function harness(i,mode){
 let now=Date.parse("2026-11-26T12:00:00Z");
 class Clock extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
 const ctx=()=>{const m=new Map();return {get:(k,s)=>m.get((s||"")+k),set:(k,v,s)=>m.set((s||"")+k,v)}};
 const flow=ctx(),global=ctx(),contexts=new Map(),node={status(){},warn(){},error(x){throw Error(String(x))}},env={get:k=>k.endsWith("_TRANSPORT")?mode:k.endsWith("_ESP_WRITE_ENABLED")?"true":k.endsWith("_ESP_CODE")?"test-code":k.endsWith("_ESP_HOST")?"localhost":undefined};
 const [HA,PRE,DEC,BUILD,RX,SF,DONE,ENQ,PUMP]=names[i-1],Q="espqueue"+i+"_control",K=mode==="esp32"?"espqueue_inv"+i+"_v1":"nativequeue_inv"+i+"_v2",active=()=>flow.get("inv"+i+"_tx_active");
 const qp={charger_source_priority_code:3,output_source_priority_code:3,max_ac_charging_current:10,battery_float_voltage:54.2,battery_bulk_voltage:55.2};const state={diag:{serial:"TEST"+i},_last_qpiri_ts:now,params:{qpiri:qp}};
 flow.set("inv"+i+"_normalized_state",state);
 global.set("inv"+i+"_esp_health",{http_ok:true,last_http_ok_ts:now,last_response_ts:now});
 global.set("learned_commands",{["SERIAL:TEST"+i]:{charger_source_priority:{mode:"profile",profileKey:"pcp_01_03"},output_source_priority:{mode:"profile",profileKey:"pop_01_03"}}});
 function run(id,msg){if(!contexts.has(id))contexts.set(id,ctx());return new Function("msg","flow","global","context","node","env","Date",by.get(id).func)(msg,flow,global,contexts.get(id),node,env,Clock)}
 const req=(p,v)=>run(Q,{topic:"voltronic/"+i+"/set/"+p,payload:v})[0];
 const q=()=>global.get(K);
 const start=(m)=>{const h=run(HA,m),p=run(PRE,h[0]);return run(BUILD,run(DEC,p[0]))[0]};
 const queue=(m)=>run(ENQ,m);
 const pump=()=>run(PUMP,{inverterNum:i});
 const session=()=>flow.get("learn_session_inv"+i);
 const complete=(msg)=>run(Q,run(DONE,msg))[0];
 const step=(ms)=>{now+=ms;global.set("inv"+i+"_esp_health",{http_ok:true,last_http_ok_ts:now,last_response_ts:now});state._last_qpiri_ts=now};
 const reply=(cmd,ack=true)=>run(RX,{inverterNum:i,_cmd:cmd,_raw_response:ack?"(ACK":"(NAK",payload:{nak:!ack},_learn_session_id:session()?.sessionId});
 const verify=(value,stale=false,rawOverride)=>{const s=session(),fields=Array(30).fill("0");const index={charger_source_priority:17,output_source_priority:16,max_ac_charging_current:13,battery_float_voltage:11}[s.param];fields[index]=String(rawOverride??value);qp[s.statePath.split(".").at(-1)]=value;return run(SF,{inverterNum:i,_cmd:stale?"QPIGS":"QPIRI",_tx_id:s.txId,_learn_session_id:s.sessionId,_rx_ts:now,_tx_fields:fields,payload:state})};
 const sendNative=(cand,value)=>{queue(cand);const sent=pump()[0];assert(sent?.command===cand.command,"INV"+i+" "+mode+" candidate dispatch");step(200);flow.set("inv"+i+"_inflight",null);const read=reply(cand.command)[0];queue(read);assert(pump()[0]?.command==="QPIRI","INV"+i+" "+mode+" verify dispatched");step(200);flow.set("inv"+i+"_inflight",null);assert(verify(value,true)===null,"stale telemetry ignored");assert(verify(value,false,999)===null,"sanitized fallback rejected");const done=verify(value)[0];assert(done?._learn_success,"rapid readback verified");return complete(done)};
 const sendEsp=(cand,noOp=false)=>{const sessionId=session().sessionId;const req=run("espfull"+i+"_learn",cand);assert(!!req[0],"ESP HTTP candidate");const verified=run("espfull"+i+"_learn_result",{inverterNum:i,statusCode:200,_esp_learning_session:sessionId,_esp_learning_command:cand.command,payload:{verified:true,set_acknowledged:!noOp,result:noOp?"already_at_requested_value":"verified"}});assert(!!verified[3],"ESP verified readback forwarded");const terminal=run(SF,verified[3])[0];assert(terminal?._learn_success,"ESP learner completion");return complete(terminal)};
 return {flow,global,state,qp,q,req,start,run,queue,pump,session,complete,step,reply,verify,sendNative,sendEsp,Q,HA,PRE,DEC,BUILD,RX,SF,DONE,ENQ,PUMP,active,now:()=>now};
}
assert(by.size===nodes.length,"unique IDs");
for(const n of nodes){if(n.type==="function")new Function(n.func);for(const k of (n.wires||[]).flat())if(!by.has(k))throw Error("invalid wire "+k);for(const k of n.links||[])if(!by.has(k))throw Error("invalid link "+k)}
assert(true,"all functions compile and links resolve");
for(let i=1;i<=3;i++)for(const mode of ["serial","tcp","esp32"]){
 const h=harness(i,mode),first=h.req("charger_source_priority","SolarPlusUtility");assert(first?.payload==="SolarPlusUtility","immediate "+i+" "+mode);
 const a=h.start(first);assert(a.command==="PCP02","learned profile mapping");
 h.step(3000);assert(h.req("max_ac_charging_current",20)===null,"second waits");
 h.step(3000);assert(h.req("charger_source_priority","OnlySolar")===null,"third waits");
 assert(h.q().items.map(x=>x.value).join(",")==="SolarPlusUtility,20,OnlySolar","FIFO no coalesce");
 if(mode!=="esp32"){h.queue({_origin:"poll_fast_fault",command:"QMOD",inverterNum:i});assert((h.flow.get("inv"+i+"_queue")||[]).length===0,"poll blocked during transaction");}
 const next=mode==="esp32"?h.sendEsp(a):h.sendNative(a,2);assert(next?.payload===20,"second dispatched after confirmation");
 const b=h.start(next);assert(b.command.startsWith("MUCHGC"),"numeric learning candidate");
 const last=mode==="esp32"?h.sendEsp(b):h.sendNative(b,20);assert(last?.payload==="OnlySolar","restore executes last");
 const c=h.start(last);assert(c.command==="PCP03","restore candidate");
 const end=mode==="esp32"?h.sendEsp(c,true):h.sendNative(c,3);assert(end===null&&h.q().confirmed===3&&!h.q().inflight,"all three confirmed");
}
for(let i=1;i<=3;i++)for(const mode of ["serial","tcp"]){
 const h=harness(i,mode),c=h.start(h.req("charger_source_priority","SolarPlusUtility"));
 h.queue(c);h.pump();h.step(200);h.flow.set("inv"+i+"_inflight",null);const read=h.reply(c.command)[0];h.queue(read);h.pump();
 h.step(5000);let e=h.pump()[1];assert(e?._learn_timeout,"QPIRI timeout emitted");let retry=h.run(h.RX,e)[0];assert(retry?.command==="QPIRI","retry read only");h.queue(retry);h.step(1100);assert(h.pump()[0]?.command==="QPIRI","retry read dispatched after drain");
 h.step(200);h.flow.set("inv"+i+"_inflight",null);assert(h.complete(h.verify(2)[0])===null&&h.q().confirmed===1,"readback recovered");
 const h2=harness(i,mode),a=h2.start(h2.req("charger_source_priority","SolarPlusUtility"));h2.queue(a);h2.pump();h2.step(5000);const timeout=h2.pump()[1],fail=h2.run(h2.RX,timeout)[1];assert(fail?._learn_complete&&fail.payload.uncertain,"write timeout explicit uncertainty");h2.complete(h2.run(h2.BUILD,fail)[1]);assert(h2.q().uncertain===1&&!h2.q().inflight,"write timeout terminal");
}
for(let i=1;i<=3;i++){
 const h=harness(i,"esp32");h.global.set("inv"+i+"_esp_health",{http_ok:false});for(let k=0;k<5;k++)assert(h.req("max_ac_charging_current",10+k)===null,"offline queue waits");assert(h.q().items.length===5,"ESP cap");h.req("max_ac_charging_current",99);assert(h.q().rejected===1,"overflow explicit");h.step(1000);const r=h.run(h.Q,{_esp_queue_tick:true})[0];assert(r?.payload===10,"ESP recovery oldest first");
}

for(let i=1;i<=3;i++)for(const mode of ["serial","tcp"]){
 const h=harness(i,mode);
 const msg=h.req("battery_type","AGM");const out=h.run(h.HA,msg);
 assert(out[1]?.length===2&&out[1][0].command==="PBT00"&&out[1][1].command==="QPIRI","native direct only relevant verification");
 for(const cmd of out[1])h.queue(cmd);
 assert(h.pump()[0]?.command==="PBT00","direct SET before readback");
 h.step(100);assert(h.req("charger_source_priority","OnlySolar")===null,"learning cannot overtake direct");
 const id=h.active().id;h.flow.set("inv"+i+"_inflight",null);
 h.run(h.Q,{_tx_id:id,_tx_response:true,inverterNum:i,command:"PBT00",payload:{raw_response:"(ACK",nak:false}});
 assert(h.pump()[0]?.command==="QPIRI","direct readback");
 const fields=Array(30).fill("0");fields[12]="0";h.flow.set("inv"+i+"_inflight",null);
 const next=h.run(h.Q,{_tx_id:id,_tx_response:true,inverterNum:i,command:"QPIRI",payload:{fields,nak:false}})[0];
 assert(h.q().confirmed===1&&next?.payload==="OnlySolar","direct verified then learning released");
 const c=h.start(next);assert(c.command==="PCP03","learning still intact after direct");
 const before=h.session().sessionId;
 assert(h.run(h.BUILD,{inverterNum:i,_learn_complete:true,_learn_session_id:"stale"})===null,"old terminal cannot finish current session");
 assert(h.session().sessionId===before,"session remains active");
}
for(let i=1;i<=3;i++)for(const mode of ["serial","tcp","esp32"]){
 const h=harness(i,mode);
 const c=h.start(h.req("max_ac_charging_current",20));const sid=h.session().sessionId;
 let next=h.run(h.RX,{inverterNum:i,_cmd:c.command,_raw_response:"(NAK",payload:{nak:true},_learn_session_id:sid});
 assert(next?.[1]?._learn_action==="next_candidate","NAK preserves learning fallback");
 const alt=h.run(h.BUILD,next[1])[0];
 assert(alt?.command&&alt.command!==c.command,"next learned format, same transaction");
 assert(h.session().sessionId===sid&&h.q().items.length===1,"candidate retry keeps reservation");
}
for(let i=1;i<=3;i++){
 const h=harness(i,"esp32");
 const first=h.start(h.req("charger_source_priority","SolarPlusUtility"));
 h.step(3000);h.req("charger_source_priority","OnlySolar");
 const second=h.sendEsp(first);
 assert(second?.payload==="OnlySolar","ESP restore dispatched");
 const restore=h.start(second),request=h.run("espfull"+i+"_learn",restore)[0];
 assert(JSON.parse(request.payload).old===2,"ESP uses last verified value rather than stale cache");
 const late=h.run("espfull"+i+"_learn_result",{inverterNum:i,statusCode:200,_esp_learning_session:"stale",payload:{verified:true,set_acknowledged:true}});
 assert(late===null,"stale ESP HTTP result ignored");
}


for(let i=1;i<=3;i++)for(const mode of ["serial","tcp","esp32"]){
 const h=harness(i,mode);
 const load2=[["load2","ON","PTOPE1",0,1],["load2_off_voltage",47.6,"PTOPV47.6",5,47.6],["load2_on_voltage",46,"PTOPVB46.0",14,46],["load2_off_soc",10,"PTOPVC010",11,10],["load2_on_soc",20,"PTOPVCB020",16,20]];
 if(mode==="esp32"){
  for(const [p,v] of load2){assert(h.req(p,v)===null,"ESP unsupported LOAD2 not dispatched");assert(h.q().last_error==="unsupported_esp_parameter","ESP LOAD2 rejection explicit");}
  assert(h.q().rejected===5&&h.q().items.length===0,"ESP LOAD2 leaves queue clean");continue;
 }
 let next=h.req(load2[0][0],load2[0][1]);
 assert(next?.topic.endsWith("/load2"),"LOAD2 reaches FIFO");
 for(const [p,v] of load2.slice(1)){h.step(3000);assert(h.req(p,v)===null,"LOAD2 waits in order");}
 for(const [p,v,command,index,expected] of load2){
  assert(next?.topic.endsWith("/"+p)&&next.payload===v,"LOAD2 FIFO "+p);
  const out=h.run(h.HA,next),set=Array.isArray(out[1])?out[1][0]:out[1];assert(set?.command===command,"LOAD2 mapper "+p);
  h.queue(set);assert(h.pump()[0]?.command===command,"LOAD2 SET "+p);
  const id=h.active().id;h.flow.set("inv"+i+"_inflight",null);
  h.run(h.Q,{_tx_id:id,_tx_response:true,inverterNum:i,command,payload:{raw_response:"(ACK",nak:false}});
  assert(h.active()?.id===id,"LOAD2 waits for QDOP");
  h.queue({_origin:"load2_refresh",command:"QDOP",inverterNum:i});
  assert(h.pump()[0]?.command==="QDOP","LOAD2 QDOP dispatched");
  const fields=Array(30).fill("0");fields[index]=String(expected);h.flow.set("inv"+i+"_inflight",null);
  next=h.run(h.Q,{_tx_id:id,_tx_response:true,inverterNum:i,command:"QDOP",payload:{fields,nak:false}})[0];
 }
 assert(next===null&&h.q().confirmed===5&&!h.q().inflight,"all LOAD2 writes verified");
}


for(let i=1;i<=3;i++)for(const mode of ["serial","tcp","esp32"]){
 const h=harness(i,mode);
 const ret=h.run(h.Q,{topic:"voltronic/"+i+"/set/charger_source_priority",payload:"SolarPlusUtility",retain:true});
 assert(ret[0]===null&&h.q().items.length===0&&h.q().last_error==="retained_set_not_replayed","old retained SET explicitly rejected");
 const first=h.start(h.req("charger_source_priority","SolarPlusUtility"));
 h.step(3000);h.req("max_ac_charging_current",20);h.step(3000);h.req("charger_source_priority","OnlySolar");
 const sid=h.session().sessionId,id=h.active().id;
 h.flow.set("learn_session_inv"+i,null);
 h.run(h.Q,{_tx_end:true,_tx_id:id,success:false,uncertain:true,reason:"test_disconnect"});
 assert(h.q().uncertain===1&&h.q().items.length===2,"ambiguous write not replayed; later requests retained");
 if(mode!=="esp32"){
  h.global.set("inv"+i+"_comm_health",{last_response_ts:h.now(),last_response_type:"OK"});
  h.step(3000);
  assert(h.run(h.Q,{_esp_queue_tick:true})[0]===null,"pre-disconnect response not accepted");
  h.global.set("inv"+i+"_comm_health",{last_response_ts:h.now(),last_response_type:"ORPHAN"});
  assert(h.run(h.Q,{_esp_queue_tick:true})[0]===null,"orphan response cannot resume writes");
  h.step(1000);h.global.set("inv"+i+"_comm_health",{last_response_ts:h.now(),last_response_type:"OK"});
 }else{
  h.step(3000);h.global.set("inv"+i+"_esp_health",{http_ok:false});
  assert(h.run(h.Q,{_esp_queue_tick:true})[0]===null,"ESP outage preserves pending requests");h.step(1000);
 }
 const next=h.run(h.Q,{_esp_queue_tick:true})[0];
 assert(next?.payload===20,"recovery resumes oldest pending write");
 const newId=h.active().id;
 h.run(h.Q,{_tx_end:true,_tx_id:id,success:true});
 assert(h.active()?.id===newId&&h.q().confirmed===0,"late transaction terminal ignored");
}
for(let i=1;i<=3;i++)for(const mode of ["serial","tcp","esp32"]){
 const h=harness(i,mode);
 if(mode==="esp32")h.global.set("inv"+i+"_esp_health",{http_ok:false});
 else h.global.set("inv"+i+"_comm_health",{last_response_ts:0,last_response_type:""});
 const limit=mode==="esp32"?5:200;
 for(let k=0;k<limit;k++){assert(h.req("max_ac_charging_current",k%50+1)===null,"offline write waits");}
 assert(h.q().items.length===limit,"bounded queue "+mode);
 h.req("charger_source_priority","OnlySolar");assert(h.q().rejected===1&&h.q().last_error==="queue_full","overflow visible");
 h.step(3600001);h.run(h.Q,{_esp_queue_tick:true});assert(h.q().items.length===0&&h.q().expired===limit,"expiry visible; old SET not sent");
}

return count.passed;
}
const original=JSON.parse(fs.readFileSync("smart-voltronic/flows.json","utf8"));const nodes=patch(original);const once=JSON.stringify(nodes);if(JSON.stringify(patch(nodes))!==once)throw Error("patch not idempotent");console.log("PASS "+tests(nodes)+" transaction assertions");
