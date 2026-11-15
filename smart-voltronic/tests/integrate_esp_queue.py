#!/usr/bin/env python3
"""Integrate a safe, persistent per-ESP verified-write queue in canonical flows.json.
No serial/tcp path changes. MQTT discovery only when INVn_TRANSPORT=esp32.
"""
import json, copy
from pathlib import Path
p=Path("smart-voltronic/flows.json")
nodes=json.loads(p.read_text())
assert len(nodes) in (373,385),len(nodes)
by={n["id"]:n for n in nodes}
assert len(by)==len(nodes)
discovery={id:(by[id]["func"],by[id]["wires"]) for id in ["4106254e7828ed3b","384929d824e573d3","9d441aa9cbe276c5"]}
mqtt_broker=by["espfull2_status"]["broker"]
original_legacy={
 id:copy.deepcopy(by[id]) for id in ["6517b72b5eb806e4","5b54a23492681019",
 "e7e742e262da6264","818d9f11dc2a6669","f2d0c3244cf5959e","6a77a0869a848c5b"]
}
ha_set=["381cb2e10d9b5625","46ca504f4729209c","03e8bd2641c96986"]
mqtt_ins=["99e50980ea51a78b","0e9a9faa6a7dc537","1aa342570293ed07"]
complete=["7b3c22ccb3f35b22","4e9392aefa24990d","3a59470b27677402"]
tab=by["espfull2_tick"]["z"]
for inv in (1,2,3):
 i=str(inv)
 qid="espqueue"+i+"_control"
 tickid="espqueue"+i+"_tick"
 purgeid="espqueue"+i+"_purge_in"
 mqttid="espqueue"+i+"_mqtt_out"
 if qid not in by:
  control=dict(id=qid,type="function",z=tab,name="ESP"+i+" persistent verified-write queue (5/60min)",
       func="",outputs=2,noerr=0,initialize="",finalize="",libs=[],
       wires=[[ha_set[inv-1]],[mqttid]],x=640,y=2020+inv*150)
  tick=copy.deepcopy(by["espnet"+i+"_tick"])
  tick.update(id=tickid,name="ESP"+i+" queue housekeeping 5s",repeat="5",once=True,onceDelay="4",
    wires=[[qid]],x=160,y=2030+inv*150)
  purge=dict(id=purgeid,type="mqtt in",z=tab,name="ESP"+i+" queue purge button command",
       topic="voltronic/"+i+"/esp_queue/purge/set",qos="1",datatype="auto",
       broker=mqtt_broker,nl=False,rap=True,rh=0,
       wires=[[qid]],x=250,y=2075+inv*150)
  mqtt=dict(id=mqttid,type="mqtt out",z=tab,name="ESP"+i+" queue sensor/discovery and purge button",
       topic="",qos="",retain="",respTopic="",contentType="",userProps="",correl="",
       expiry="",broker=mqtt_broker,wires=[],x=915,y=2070+inv*150)
  nodes.extend([control,tick,purge,mqtt])
  for node in (control,tick,purge,mqtt):by[node["id"]]=node
 # Add a direct completion observer, not a second UART or retry path.
 if qid not in by[complete[inv-1]]["wires"][0]:
  by[complete[inv-1]]["wires"][0].append(qid)
 # MQTT HA commands flow through queue control when ESP; unchanged legacy passes through unchanged.
 inp=by[mqtt_ins[inv-1]]
 assert ha_set[inv-1] in inp["wires"][0] or qid in inp["wires"][0]
 inp["wires"][0]=[qid if x==ha_set[inv-1] else x for x in inp["wires"][0]]
 # Force 2-choice to use verified ESP learner, rather than legacy direct UART path.
 setnode=by[ha_set[inv-1]]
 if "ESP_QUEUE_FORCE_VERIFIED_TWO_CHOICE_"+i not in setnode["func"]:
  target='if (param === "output_source_priority" && isTwoChoiceOutputPriorityEnabled(inverterNum)) {'
  assert target in setnode["func"]
  repl='// ESP_QUEUE_FORCE_VERIFIED_TWO_CHOICE_'+i+'\nif (param === "output_source_priority" && isTwoChoiceOutputPriorityEnabled(inverterNum) &&\n String(env.get("INV'+i+'_TRANSPORT")||"").toLowerCase()!=="esp32") {'
  setnode["func"]=setnode["func"].replace(target,repl,1)
 # Queue handles only semantic parameters compatible with verified ESP candidate learning.
 code=r'''
const INV=__I__;
const mode=String(env.get("INV"+INV+"_TRANSPORT")||"").toLowerCase();
const isEsp=mode==="esp32";
const KEY="espqueue_inv"+INV+"_v1";
const LIMIT=5,TTL=3600000;
const now=Date.now();
function safeNumber(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function clean(v){return String(v===undefined||v===null?"":v).trim();}
function canonical(param){
 const aliases={
  battery_cutoff_voltage:"battery_under_voltage",
  back_to_grid_voltage:"battery_recharge_voltage",
  back_to_battery_voltage:"battery_re_discharge_voltage",
  grid_charging_current:"max_ac_charging_current"};
 return aliases[param]||param;
}
const allow=new Set(["battery_bulk_voltage","battery_float_voltage","battery_under_voltage",
 "battery_recharge_voltage","battery_re_discharge_voltage","max_charging_current",
 "max_ac_charging_current","output_source_priority","charger_source_priority"]);
function init(){
 let q=global.get(KEY)||global.get(KEY,"persistent");
 if(!q||typeof q!=="object"||!Array.isArray(q.items))q={items:[],inflight:null,
  expired:0,rejected:0,purged:0,confirmed:0,uncertain:0,last_error:"",last_result:""};
 q.items=q.items.filter(x=>x&&allow.has(x.param)&&
  Number.isFinite(x.added)&&typeof x.value!=="object"&&
  x.param.length<=48&&clean(x.value).length<=64);
 if(q.items.length>LIMIT)q.items=q.items.slice(0,LIMIT);
 // Never replay a command that may have been sent before restart/redeploy.
 if(q.inflight&&context.get("queue_initialised")!==true){
  q.items=q.items.filter(x=>x.id!==q.inflight.id);
  q.uncertain++;q.last_error="restarted_while_write_inflight";
  q.last_result="uncertain_after_restart";q.inflight=null;}
 context.set("queue_initialised",true);
 return q;
}
let q=init();
function save(){global.set(KEY,q);global.set(KEY,q,"persistent");}
const top="voltronic/"+INV+"/esp_queue";
const discoveryBase="homeassistant";
function messages(){
 const count=q.items.length;
 const attrs={count,limit:LIMIT,ttl_seconds:3600,
  waiting_params:q.items.map(x=>x.param),
  oldest_age_seconds:count?Math.max(0,Math.floor((now-Math.min(...q.items.map(x=>x.added)))/1000)):null,
  inflight_param:q.inflight?.param||null,
  expired:q.expired,rejected:q.rejected,purged:q.purged,
  confirmed:q.confirmed,uncertain:q.uncertain,
  last_error:q.last_error||"",last_result:q.last_result||""};
 const state=count===0?"Vide":count===LIMIT?"Pleine":"Attente";
 const out=[
  {topic:top+"/state",payload:state,retain:true},
  {topic:top+"/attributes",payload:JSON.stringify(attrs),retain:true}
 ];
 if(!isEsp){
  // Remove old retained HA discovery if user changes ESP -> gateway/serial.
  out.push({topic:discoveryBase+"/sensor/smart_voltronic_inv"+INV+"_esp_queue/config",payload:"",retain:true},
           {topic:discoveryBase+"/button/smart_voltronic_inv"+INV+"_esp_queue_purge/config",payload:"",retain:true});
  return out;
 }
 const device={identifiers:["voltronic_inv_"+INV],name:"Voltronic Inverter "+INV,
  manufacturer:"Voltronic",model:"Axpert/Voltronic"};
 const sensor={name:"Onduleur "+INV+" file attente ESP32",
  unique_id:"smart_voltronic_inv"+INV+"_esp_queue_state_v1",
  default_entity_id:"sensor.voltronic_inv"+INV+"_esp_queue_state",
  state_topic:top+"/state",json_attributes_topic:top+"/attributes",
  icon:"mdi:playlist-clock",device};
 const button={name:"Onduleur "+INV+" purger file ESP32",
  unique_id:"smart_voltronic_inv"+INV+"_esp_queue_purge_v1",
  default_entity_id:"button.voltronic_inv"+INV+"_esp_queue_purge",
  command_topic:top+"/purge/set",payload_press:"PURGE",
  icon:"mdi:playlist-remove",device};
 out.push({topic:discoveryBase+"/sensor/smart_voltronic_inv"+INV+"_esp_queue/config",
   payload:JSON.stringify(sensor),retain:true},
  {topic:discoveryBase+"/button/smart_voltronic_inv"+INV+"_esp_queue_purge/config",
   payload:JSON.stringify(button),retain:true});
 return out;
}
function publish(out){
 const m=messages();
 // Limit retained MQTT config churn to every 5 minutes or mode transition;
 // publish state every event/tick (small, deterministic).
 const rec=global.get(KEY+"_discovery")||{};
 const modeChanged=rec.mode!==mode;
 if(!modeChanged&&now-Number(rec.last||0)<300000)
  m.splice(2);
 else global.set(KEY+"_discovery",{mode,last:now});
 return [out||null,m];
}
function expire(){
 const before=q.items.length;
 q.items=q.items.filter(item=>(q.inflight&&q.inflight.id===item.id)||
  (item.added>now-TTL&&item.added<=now+60000));
 const diff=before-q.items.length;
 if(diff){q.expired+=diff;q.last_result="expired";q.last_error="ttl_1h";}
}
if(!isEsp){
 // Never intercept or alter serial/gateway. MQTT commands pass straight to original SET.
 q.items=[];q.inflight=null;save();
 if(msg.topic&&msg.topic.startsWith("voltronic/"+INV+"/set/"))
  return publish(msg);
 return publish(null);
}
expire();
if(msg.topic===top+"/purge/set"){
 if(clean(msg.payload).toUpperCase()!=="PURGE")return null;
 q.purged+=q.items.length;q.items=[];q.last_result="purged";
 // In-flight writes may be on UART already: never cancel blindly.
 q.last_error=q.inflight?"purged_pending_inflight_not_cancelled":"";
 save();return publish(null);
}
if(msg._learn_complete===true && Number(msg.inverterNum)===INV){
 const pending=q.inflight;
 if(pending){
  q.inflight=null;
  const idx=q.items.findIndex(x=>x.id===pending.id);
  if(idx>=0)q.items.splice(idx,1);
  if(msg._learn_success===true){q.confirmed++;q.last_result="verified";q.last_error="";}
  else {q.uncertain++;q.last_result="not_verified";
    q.last_error=clean(msg.payload?.reason||"learning_failed");}
  save();
 }
 return publish(null);
}
const match=clean(msg.topic).match(new RegExp("^voltronic/"+INV+"/set/([a-z_]+)$"));
if(match){
 const raw=match[1],param=canonical(raw);
 if(!allow.has(param))return [msg,null]; // legacy direct guard remains responsible
 const val=msg.payload;
 // Never queue raw commands, arbitrary objects, oversized or invalid values.
 if(typeof val==="object"||typeof val==="boolean"||clean(val).length>64||!clean(val)){
  q.rejected++;q.last_error="invalid_value";q.last_result="rejected";save();return publish(null);
 }
 const numeric=safeNumber(val),isEnum=param.endsWith("_priority");
 if(!isEnum && (numeric===null||numeric<0||numeric>300)){
  q.rejected++;q.last_error="invalid_numeric_value";save();return publish(null);
 }
 if(isEnum&&!/^[a-zA-Z0-9_+-]{1,40}$/.test(clean(val))){
  q.rejected++;q.last_error="invalid_priority_value";save();return publish(null);
 }
 const old=q.items.find(x=>x.param===param);
 const entry={id:now+"-"+Math.floor(Math.random()*1000000),param,value:val,raw,added:now};
 if(old){
  // An in-flight write cannot be withdrawn; preserve the newer request to
  // be sent after it finishes, and do NOT retry the in-flight operation.
  const sameInflight=q.inflight&&q.inflight.id===old.id;
  if(sameInflight){
   if(q.items.length>=LIMIT){q.rejected++;q.last_error="full_inflight";save();return publish(null);}
   q.items.push(entry);
  }else q.items[q.items.indexOf(old)]=entry;
 }else if(q.items.length>=LIMIT){
  q.rejected++;q.last_error="queue_full";q.last_result="rejected";save();return publish(null);
 }else q.items.push(entry);
 q.last_result="queued";q.last_error="";save();
 // Tick handles dispatch; do not bypass timeout/locking even if online.
 return publish(null);
}
// Only release one item if recent native replies and QPIRI are both available.
// Never use cached status after a long disconnection or send during sleep.
const snap=global.get("inv"+INV+"_esp_health")||{};
const health=global.get("inv"+INV+"_comm_health")||{};
const state=flow.get("inv"+INV+"_normalized_state")||{};
const learn=flow.get("learn_session_inv"+INV)||{};
if(q.inflight){
 if(now-q.inflight.started>45000){
  // Write may have happened; never reissue after a timeout.
  const ix=q.items.findIndex(x=>x.id===q.inflight.id);
  if(ix>=0)q.items.splice(ix,1);
  q.inflight=null;q.uncertain++;q.last_error="inflight_confirmation_timeout";
  q.last_result="uncertain";save();
 }
 return publish(null);
}
const live=String(env.get("INV"+INV+"_ESP_WRITE_ENABLED")||"false").toLowerCase()==="true"
 && now-Number(snap.last_http_ok_ts||0)<10000
 && now-Number(snap.last_response_ts||0)<15000
 && snap.http_ok===true
 && now-Number(state._last_qpiri_ts||0)<120000
 && health.night_freeze!==true && health.sleeping!==true
 && learn.active!==true;
if(!q.items.length||!live){save();return publish(null);}
const entry=q.items[0];
if(entry.added<=now-TTL){expire();save();return publish(null);}
// A fresh and already matching QPIRI confirms no write is needed.
// Never treat numeric string "0" or a missing field as an implicit 0.
const qp=state.params?.qpiri||{};
const numericFields={
 battery_bulk_voltage:"battery_bulk_voltage",
 battery_float_voltage:"battery_float_voltage",
 battery_under_voltage:"battery_under_voltage",
 battery_recharge_voltage:"battery_recharge_voltage",
 battery_re_discharge_voltage:"battery_re_discharge_voltage",
 max_charging_current:"max_charging_current",
 max_ac_charging_current:"max_ac_charging_current"
};
const field=numericFields[entry.param];
if(field&&qp[field]!==null&&qp[field]!==undefined){
 const actual=Number(qp[field]),wanted=Number(entry.value);
 if(Number.isFinite(actual)&&Number.isFinite(wanted)&&Math.abs(actual-wanted)<=0.049){
  q.items.shift();q.confirmed++;q.last_error="";
  q.last_result="already_applied";save();return publish(null);
 }
}
// Re-enter the ORIGINAL HA SET + Learning pipeline, which validates ranges
// and performs fresh native preflight/SET/readback at the ESP; no raw HTTP writes.
q.inflight={id:entry.id,param:entry.param,started:now};
save();
return publish({topic:"voltronic/"+INV+"/set/"+entry.raw,
 payload:entry.value,inverterNum:INV,_esp_queue_replay:true});
'''.replace("__I__",i)
 by[qid]["func"]=code
 # Ensure one serial request is always transparently passed through even with queue states retained.
 assert by[qid]["wires"][0]==[ha_set[inv-1]]
 # Purge buttons operate only when ESP active: sensors and buttons retained
 # discovery are actively deleted on mode switch.
for id,(func,wires) in discovery.items():
 assert by[id]["func"]==func and by[id]["wires"]==wires
for id,before in original_legacy.items():
 assert by[id]==before,("legacy UART request/pump modified",id)
assert len(nodes)==385 and len(by)==385
p.write_text(json.dumps(nodes,ensure_ascii=False,separators=(",",":"))+"\n")
print("PASS: 385 canonical nodes (12 ESP queue nodes); ESP-only persistent 1h/5-item queue, HA MQTT sensor & purge button")
