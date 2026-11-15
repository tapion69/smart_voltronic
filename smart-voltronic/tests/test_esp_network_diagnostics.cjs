"use strict";
const assert=require("node:assert/strict"),fs=require("fs"),cp=require("child_process");
const path="/tmp/smart-doctor-esp-network-test.json";
fs.copyFileSync("smart-voltronic/flows.json",path);
const old=JSON.parse(fs.readFileSync(path)),oldIDs=new Map(old.map(n=>[n.id,n]));
assert(old.length===355||old.length===373,"unexpected canonical version");
cp.execFileSync("python3",["smart-voltronic/tests/integrate_esp_network_diagnostics.py"],{stdio:"pipe"});
const nodes=JSON.parse(fs.readFileSync("smart-voltronic/flows.json")),map=new Map(nodes.map(n=>[n.id,n]));
assert.equal(nodes.length,373);assert.equal(map.size,373);
for(const id of ["4106254e7828ed3b","384929d824e573d3","9d441aa9cbe276c5"]){
 assert.equal(map.get(id).func,oldIDs.get(id).func,"HA discovery unique ID definitions untouched");
 assert.deepEqual(map.get(id).wires,oldIDs.get(id).wires,"MQTT entity discovery topology untouched");
}
for(const n of nodes.filter(n=>n.type==="function")){
 try{new Function("msg","node","context","flow","global","env","Buffer",n.func)}
 catch(e){throw Error("Node "+n.name+" / "+n.id+": "+e.stack)}
}
for(let i=1;i<=3;i++){
 for(const kind of ["tick","builder","http","collect","catch","snapshot_catch"]){
  assert(map.has("espnet"+i+"_"+kind),"missing ESP"+i+" diagnostic node "+kind);
 }
 assert.deepEqual(map.get("espnet"+i+"_catch").scope,["espnet"+i+"_http"]);
 assert.deepEqual(map.get("espnet"+i+"_snapshot_catch").scope,["espfull"+i+"_http"]);
 assert(map.get("espnet"+i+"_builder").func.includes("/api/v1/diagnostics"));
 assert.equal(map.get("espnet"+i+"_tick").repeat,"30");
 assert(map.get("espnet"+i+"_builder").func.includes("INV"+i+"_ESP_CODE"));
}
const storages=new Map(),ctx=new Map(),fl=new Map();
const store=m=>({get:k=>m.get(k),set:(k,v)=>m.set(k,v)});
const g=store(storages),context=store(ctx),flow=store(fl);
const node={status(){},warn(){},error(e){throw Error(String(e))},log(){}};
function run(id,msg,i=2){
 let v=map.get(id);assert(v,"missing "+id);
 const env={get:k=>k==="INV"+i+"_TRANSPORT"?"esp32":
  k==="INV"+i+"_ESP_HOST"?"192.168.1.64":
  k==="INV"+i+"_ESP_PORT"?"18081":
  k==="INV"+i+"_ESP_CODE"?"configured-test-code":
  k==="INV"+i+"_ESP_WRITE_ENABLED"?"false":undefined};
 return new Function("msg","node","context","flow","global","env","Buffer",v.func)(
  msg,node,context,flow,g,env,Buffer);
}
const builder=run("espnet2_builder",{payload:"unused"});
assert(builder.url==="http://192.168.1.64:18081/api/v1/diagnostics");
assert.equal(builder.method,"GET");
assert.equal(builder.headers["X-Setup-Code"],"configured-test-code");

const payload={
 source:"voltronic-diagnostics-read-only",uptime_ms:300000,
 wifi_connected:true,wifi_disconnect_count:2,wifi_got_ip_count:3,
 wifi_connect_attempts:4,wifi_last_disconnect_reason:201,wifi_rssi_dbm:-62,
 tx_commands:1250,rx_frames:1200,polls_ok:1170,timeouts:8,no_rx_timeouts:2,
 crc_rejects:3,partial_frames:1,malformed_frames:0,naks:4,parse_rejects:0,
 last_good_age_ms:200,http_send_failures:0
};
run("espnet2_collect",{statusCode:200,payload});
let state=storages.get("inv2_esp_network");
assert.equal(state.wifi_connected,true);
assert.equal(state.wifi_rssi_dbm,-62);
assert.equal(state.wifi_disconnect_count_boot,2);
assert.equal(state.uart_timeouts,8);
assert.equal(state.uart_crc_rejects,3);
assert.equal(state.snapshot_outages,undefined);
const p2={...payload,uptime_ms:330000,wifi_disconnect_count:4,wifi_got_ip_count:5};
run("espnet2_collect",{statusCode:200,payload:p2});
state=storages.get("inv2_esp_network");
assert.equal(state.wifi_disconnect_events_observed,2);
run("espnet2_collect",{error:{message:"ETIMEDOUT"},statusCode:null,payload:null});
state=storages.get("inv2_esp_network");
assert.equal(state.diag_failures,1);
assert.equal(state.wifi_disconnect_count_boot,4,"diagnostic error must preserve last known counters");

const failure=run("espfull2_replay",{error:{message:"EHOSTUNREACH"},statusCode:null,payload:null});
assert.equal(failure[1].payload,"offline");
state=storages.get("inv2_esp_network");
assert.equal(state.snapshot_down,true);
assert.equal(state.snapshot_failures,1);
assert.equal(state.snapshot_outages,1);
run("espfull2_replay",{error:{message:"ECONNRESET"},statusCode:null,payload:null});
state=storages.get("inv2_esp_network");
assert.equal(state.snapshot_outages,1,"same outage must count once");
const cacheUnavailable=run("espfull2_replay",{statusCode:200,payload:{cache_only:true,available:false,replies:[],uptime_ms:330500,max_seq:10}});
assert.equal(cacheUnavailable[1].payload,"offline");
state=storages.get("inv2_esp_network");
assert.equal(state.snapshot_down,false,"HTTP 200 unavailable cache is NOT a WiFi outage");
assert.equal(state.snapshot_outages,1);
assert.equal(state.cache_unavailable_count,1);
assert.equal(typeof state.last_outage_duration_s,"number");
const diagSample={...p2,uptime_ms:350000,wifi_rssi_dbm:-72};
run("espnet2_collect",{statusCode:200,payload:diagSample});
storages.set("premium.active",true);
storages.set("inv2_comm_health",{started_ts:Date.now(),night_sleep_enabled:false});
storages.set("inv2_normalized_state",{pv_total_power:55});
const sample={statusCode:200,payload:{cache_only:true,available:true,uptime_ms:351000,max_seq:12,replies:[
 {command:"QPIGS",seq:12,age_ms:50,payload:"230.0 50.0 230.0 50.0"}
]}};
run("espfull2_replay",sample);
const mon=run("7e96e2b785b1d159",{payload:{}});
assert(mon.payload.status==="HEALTHY","Doctor original behavior preserved");
const h=storages.get("inv2_comm_health");
assert.equal(h.esp_wifi_rssi_dbm,-72);
assert.equal(h.esp_wifi_disconnect_count,4);
assert.equal(h.esp_network_outages,1);
assert.equal(h.esp_cache_unavailable_count,1);
assert.equal(h.esp_uart_timeouts,8);
assert.equal(h.esp_uart_crc_rejects,3);
assert.equal(h.esp_net_diag_fresh,true);
assert.equal(h.esp_wifi_connected,true);
assert.equal(storages.has("inv1_esp_network"),false,"ESP2 must not leak to ESP1");
assert.equal(storages.has("inv3_esp_network"),false,"ESP2 must not leak to ESP3");
const doc=map.get("2d7f7336b88783dc").func;
for(const word of ["Diagnostic réseau indépendant","wifi_rssi_dbm","esp_network_outages","esp_uart_timeouts","night_sleep"])assert(doc.includes(word),"Doctor missing "+word);
assert.equal(map.get("espfull2_replay").wires[0][0],"e82d4d3650a26a34","native parser must be unchanged");
assert.equal(map.get("espnet2_collect").wires[0].length,0,"diagnostic must not create UART commands");
console.log("PASS: 373 canonical nodes; WiFi reconnect statistics, HTTP outage vs unavailable inverter cache, RS232 errors, Doctor MQTT, per-inverter isolation and unchanged unique IDs");
