#!/usr/bin/env python3
"""Audited, ESP-only Voltronic Doctor repair; serial/gateway and HA unique IDs unchanged."""
import json
from pathlib import Path
p=Path("smart-voltronic/flows.json")
nodes=json.loads(p.read_text())
assert len(nodes)==355
by={n["id"]:n for n in nodes}
assert len(by)==355
discovery={x:(by[x]["func"],by[x]["wires"]) for x in ("4106254e7828ed3b","384929d824e573d3","9d441aa9cbe276c5")}
mons=["3ea573730416012d","7e96e2b785b1d159","638cb89fdbee6fe3"]
receivers=["d385574be7304d91","5a8f3478dfb6b6d8","609774e30abc3c0d"]
for inv in (1,2,3):
 n=by[mons[inv-1]]
 src=n["func"]
 start=src.index("const nightSleepEnabled =",src.index("ARRÊT NOCTURNE / NIGHT FREEZE"))
 night=src[start:src.index("const activeNativeDisconnected =",start)]
 store=src[src.index("health.night_sleep_enabled =",start):src.index("// Détermination HEALTH",start)]
 assert "const inNightWindow =" in night and "previousNightFreeze" in night
 assert "health.night_freeze =" in store
 # Null/undefined PV must not turn into a fictitious 0W reading.
 night=night.replace("normalizedState.pv_total_power\n",
  "((normalizedState.pv_total_power===null||normalizedState.pv_total_power===undefined)?NaN:normalizedState.pv_total_power)\n")
 marker="// ESP_DOCTOR_MONITOR_"+str(inv)
 pos=src.index(marker)
 begin=src.rfind('if (String(env.get("INV'+str(inv)+'_TRANSPORT") || "").toLowerCase() === "esp32") {',0,pos)
 assert begin>=0
 end=src.index("\n}\n",pos)+2
 prefix="""if (String(env.get("INVNUM_TRANSPORT")||"").toLowerCase()==="esp32"){
// ESP_DOCTOR_NIGHT_REPAIRED_INVNUM
const h=global.get("invNUM_esp_health")||{};
const NIGHT_FREEZE_THRESHOLD_W=20;
const prevFrozen=health.night_freeze===true;
""".replace("NUM",str(inv))
 link="""
const stamp=Date.now(),lastValid=Number(h.last_response_ts||0),lastHttp=Number(h.last_http_ok_ts||0);
const responseAge=lastValid>0?Math.max(0,stamp-lastValid):null;
const httpAge=lastHttp>0?Math.max(0,stamp-lastHttp):null;
const httpOnline=httpAge!==null&&httpAge<=12000;
const replyFresh=responseAge!==null&&responseAge<=20000;
const expectedSleepLoss=nightFreeze&&(responseAge===null||responseAge>30000);
"""
 tail="""
// Never backfill overnight HTTP/write counts into daytime statistics on wakeup.
const raw={
 success:Number(h.http_successes||0), failure:Number(h.http_failures||0),
 reply:Number(h.response_count||0),verified:Number(h.write_verified||0),
 rejected:Number(h.write_rejected||0),uncertain:Number(h.write_uncertain||0)
};
const old=health.esp_doctor_last_raw;
if(!old||health.esp_doctor_stats_v2!==true){
 health.esp_http_successes=0;health.esp_http_failures=0;
 health.esp_write_verified=0;health.esp_write_rejected=0;health.esp_write_uncertain=0;
 health.response_count=0;health.esp_doctor_stats_v2=true;
}else if(!nightFreeze&&!prevFrozen){
 const d=(k)=>Math.max(0,raw[k]>=Number(old[k]||0)?raw[k]-Number(old[k]||0):raw[k]);
 health.esp_http_successes=Number(health.esp_http_successes||0)+d("success");
 health.esp_http_failures=Number(health.esp_http_failures||0)+d("failure");
 health.esp_write_verified=Number(health.esp_write_verified||0)+d("verified");
 health.esp_write_rejected=Number(health.esp_write_rejected||0)+d("rejected");
 health.esp_write_uncertain=Number(health.esp_write_uncertain||0)+d("uncertain");
 health.response_count=Number(health.response_count||0)+d("reply");
}
health.esp_doctor_last_raw=raw;
const reads=health.esp_http_successes+health.esp_http_failures;
const writes=health.esp_write_verified+health.esp_write_rejected;
health.esp_http_success_pct=reads?Math.round(1000*health.esp_http_successes/reads)/10:null;
health.esp_write_success_pct=writes?Math.round(1000*health.esp_write_verified/writes)/10:null;
const status=nightFreeze?(expectedSleepLoss?"SLEEPING":"HEALTHY"):
 (!httpOnline?"OFFLINE":(!replyFresh?"DEGRADED":"HEALTHY"));
const reason=nightFreeze?(expectedSleepLoss?"NIGHT_SHUTDOWN":"NIGHT_FREEZE"):
 (!httpOnline?"ESP_HTTP_UNAVAILABLE":(!replyFresh?"STALE_TELEMETRY":"OK"));
health.transport="esp32";health.status=status;health.reason=reason;
health.endpoint=String(env.get("INVNUM_ESP_HOST")||"--")+":"+String(env.get("INVNUM_ESP_PORT")||18081);
health.esp_http_ok=httpOnline;
health.esp_last_http_age_s=httpAge===null?null:Math.floor(httpAge/1000);
health.esp_cached_replies=Number(h.cached_replies||0);
health.esp_last_seq=Number(h.last_seq||0);
health.esp_uptime_ms=Number(h.uptime_ms||0);
health.esp_last_error=String(h.last_error||"");
health.esp_write_enabled=String(env.get("INVNUM_ESP_WRITE_ENABLED")||"false")==="true";
health.esp_write_last_status=String(h.last_write_status||"none");
health.last_response_ts=lastValid;
health.last_response_command=String(h.last_command||"--");
health.last_raw_rx_ts=lastValid;health.last_raw_rx_source="esp32";
health.last_response_age_ms=responseAge;health.last_raw_rx_age_ms=responseAge;
health.last_response_age_s=responseAge===null?null:Math.floor(responseAge/1000);
health.last_raw_rx_age_s=health.last_response_age_s;
health.last_tx_age_ms=null;health.last_tx_age_s=null;
health.queue_depth=0;health.inflight_command="--";health.inflight_age_ms=null;
health.command_success_pct=null;health.response_success_pct=null;
global.set(key,health);
node.status({fill:status==="HEALTHY"?(nightFreeze?"blue":"green"):
 status==="SLEEPING"?"blue":status==="DEGRADED"?"yellow":"red",
 shape:status==="OFFLINE"?"ring":"dot",
 text:status+" ESPNUM | "+(nightFreeze?"NIGHT FREEZE | ":"")+
 "RX "+(responseAge===null?"--":Math.round(responseAge/1000)+"s")});
msg.payload={inverter:NUM,status,reason,transport:"esp32",
 night_sleep_enabled:nightSleepEnabled,night_freeze:nightFreeze,sleeping:expectedSleepLoss,
 last_response_age_ms:responseAge,esp_http_ok:httpOnline};
return msg;
}
""".replace("NUM",str(inv))
 n["func"]=src[:begin]+prefix+night+"\n"+link+store+tail+src[end:]
 r=by[receivers[inv-1]]
 guard="// ESP_DOCTOR_NO_LEGACY_PENDING_INV"+str(inv)
 if guard not in r["func"]:
  needle="// -------------------------------------------------\n// Helpers"
  assert needle in r["func"]
  code=guard+"\n"+'if(String(env.get("INV'+str(inv)+'_TRANSPORT")||"").toLowerCase()==="esp32")return null;\n\n'
  r["func"]=r["func"].replace(needle,code+needle,1)

doc=by["2d7f7336b88783dc"]
s=doc["func"]
old='return {type:"markdown",title:"Communication ESP32 - Onduleur "+inv,content:txt};'
assert old in s
card="""return {type:"vertical-stack",cards:[
 {type:"entities",title:t.communication+" - "+t.inverter+" "+inv,
  show_header_toggle:false,state_color:true,entities:[
   {entity:sensor(inv,"communication_health"),name:t.communication,icon:"mdi:access-point-network"},
   {entity:switchEntity(inv,"night_sleep"),name:t.night_sleep,icon:"mdi:weather-night"}]},
 {type:"markdown",content:txt}
]};"""
s=s.replace(old,card,1)
queue="### 🔄 "+"$"+"{t.queue}"
assert s.count(queue)==1
idx=s.index(queue)
end=s.index("\n"+chr(96)+";",idx)
assert "ESP_DOCTOR_SERIAL_ONLY_TAIL" not in s
s=s[:idx]+"{% if a(e, 'transport') != 'esp32' %}\n"+"// ESP_DOCTOR_SERIAL_ONLY_TAIL\n"+s[idx:end]+"{% endif %}\n"+s[end:]
doc["func"]=s
for ident,(func,wires) in discovery.items():
 assert by[ident]["func"]==func and by[ident]["wires"]==wires
assert len(nodes)==355 and len(by)==355
p.write_text(json.dumps(nodes,ensure_ascii=False,separators=(",",":"))+"\n")
print("PASS: original 355 nodes, ESP night switch, freeze, sleep, no fake orphans, unique IDs unchanged")
