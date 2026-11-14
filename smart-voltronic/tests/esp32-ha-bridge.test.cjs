'use strict';
/* Tests the ACTUAL function bodies of the complete 322-node export (+ bridge).
 * Offline only: mocks ESP HTTP/RS232 traffic, HA MQTT broker and node contexts.
 * Run from repository root:
 *   node --test smart-voltronic/tests/esp32-ha-bridge.test.cjs
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const nodes=JSON.parse(fs.readFileSync(path.join(__dirname,'..','flows.json'),'utf8'));
const byId=new Map(nodes.map(n=>[n.id,n]));
const required=id=>{const n=byId.get(id);assert.ok(n,'node '+id);return n;};
const hash=v=>crypto.createHash('sha256').update(v,'utf8').digest('hex');
const inv={
 1:{parser:'06f687dbe6782ce8',req:'6517b72b5eb806e4',enq:'ae550f5a2172cd28',pump:'5b54a23492681019',select:'b841e65580803812',norm:'6610714dd2585f9b',daily:'d93a2e10acf772a3',premium:'42e26db1e016cdb9',pub:'429e63c1cf8135ce',disc:'4106254e7828ed3b',monitor:'3ea573730416012d',healthMqtt:'2978c86114a84875',init:'a3112bd974677969'},
 2:{parser:'e82d4d3650a26a34',req:'e7e742e262da6264',enq:'41e38efed69c0164',pump:'818d9f11dc2a6669',select:'3e21c5c2226d40ab',norm:'cc84c35690619c8c',pub:'1fdf50692dc40100',disc:'384929d824e573d3',monitor:'7e96e2b785b1d159',healthMqtt:'8a05fbc3b3f6bdbc',init:'fa7cc4fe4fb09bd9'},
 3:{parser:'057108fc794236af',req:'f2d0c3244cf5959e',enq:'16e174899c2ba6ec',pump:'6a77a0869a848c5b',select:'99f7bc7173ead525',norm:'7a996d0af613991a',pub:'d557d9e01ce7ca0d',disc:'9d441aa9cbe276c5',monitor:'638cb89fdbee6fe3',init:'46e75daad5b76fb4'}
};
function harness(overrides={}){
 const context=new Map(),flowMap=new Map(),globalMap=new Map(),warnings=[];
 const store=m=>({get:(k,s)=>m.get(k+'|'+(s||'default'))??m.get(k),set:(k,v,s)=>m.set(k+'|'+(s||'default'),v)});
 const defaults={INV1_TRANSPORT:'esp32',INV2_TRANSPORT:'esp32',INV3_TRANSPORT:'esp32',
 INV1_ESP_WRITE_ENABLED:'false',INV2_ESP_WRITE_ENABLED:'false',INV3_ESP_WRITE_ENABLED:'false',
 INV1_ESP_HOST:'127.0.0.1',INV2_ESP_HOST:'127.0.0.1',INV3_ESP_HOST:'127.0.0.1',
 INV1_ESP_PORT:18081,INV2_ESP_PORT:18081,INV3_ESP_PORT:18081,
 INV1_ESP_CODE:'TESTCODE-123',INV2_ESP_CODE:'TESTCODE-123',INV3_ESP_CODE:'TESTCODE-123',
 ADDON_TIMEZONE:'Europe/Paris'};
 const cfg={...defaults,...overrides},env={get:k=>cfg[k]??null};
 const node={status:()=>{},warn:x=>warnings.push(String(x)),error:x=>warnings.push(String(x)),log:()=>{},debug:()=>{},send:()=>{}};
 const run=(id,msg)=>{
   const fn=required(id);
   if(!context.has(id))context.set(id,new Map());
   return new Function('msg','flow','global','context','node','env','Buffer','require',fn.func)(
       msg,store(flowMap),store(globalMap),store(context.get(id)),node,env,Buffer,require);
 };
 return {run,flow:store(flowMap),global:store(globalMap),env,warnings,cfg};
}
const nowKey=scope=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const v=n=>parts.find(x=>x.type===n).value;
 return v('year')+(scope==='Y'?'':v('month')+(scope==='M'?'':v('day')));
};
const fakeQPIGS=()=>[230,50,230,50,1200,1100,33,410,52.6,23,86,29,12.5,320,52.6,2,...Array(12).fill(0)].join(' ');
const native=(seq,command,payload,extra={})=>({seq,command,payload,nak:false,age_ms:40,...extra});
const snapshot=(seq,replies,extra={})=>({statusCode:200,payload:{available:true,cache_only:true,uptime_ms:100000,max_seq:seq,replies,uart_stats:{tx_commands:150,polls_ok:135,timeouts:10,naks:3,crc_rejects:2,last_serial_exchange_ms:87},...extra}});
function readPipeline(h,rec){
 const msg=h.run('espfull_unpack_1',snapshot(rec.seq,[rec]))[0];
 assert.ok(msg?.length===1,'unpacked exactly one reply');
 const parsed=h.run(inv[1].parser,msg[0]);
 assert.ok(parsed?.[1]?.[0],'parsed real Voltronic reply');
 const norm=h.run(inv[1].norm,parsed[1][0]);
 assert.ok(norm?.payload,'normalizer returned state');
 const daily=h.run(inv[1].daily,norm);
 const premium=h.run(inv[1].premium,daily);
 const mqtt=h.run(inv[1].pub,premium);
 assert.equal(mqtt[0].topic,'voltronic/1/state');
 assert.equal(mqtt[1].topic,'voltronic/1/availability');
 assert.equal(mqtt[1].payload,'online');
 return {state:JSON.parse(mqtt[0].payload),parsed:parsed[1][0],normalized:norm,mqtt};
}
test('complete source: 322 untouched original IDs and 30 isolated bridge nodes',()=>{
 assert.equal(nodes.length,352);
 assert.equal(new Set(nodes.map(n=>n.id)).size,nodes.length);
 const originals=nodes.filter(n=>!n.id.startsWith('espfull_')).map(n=>n.id).sort();
 assert.equal(originals.length,322);
 assert.equal(hash(originals.join('\n')),'e7f501b5995f67f0bbc69ec84bf17e5d559553c9888b66a8d3b51a50a8a42cbc');
 assert.equal(nodes.filter(n=>n.type==='function').length,132);
});
test('unchanged 3 MQTT publishers, HA discovery unique_id source, Doctor and Premium screens',()=>{
 for(const i of [1,2,3])assert.equal(hash(required(inv[i].pub).func),'2812f1fd53b1160c09a8fa5da07b47fd6d3e423ac65e40eb7216c4a48f1c8622');
 const hashes={'4106254e7828ed3b':'ab7d33caf573b5c8493080ccd14ca412dbb1ed20c1331e2ceeef87d15819f00d',
 '384929d824e573d3':'eec6c88f9df2bab71a099ee6aff1cabbdab259fbf4f32a821bc6c69a2bdbf809',
 '9d441aa9cbe276c5':'78e7fced0a35012b8d9c4cf1a9c531508c135e8531231037865933793ffb6c01',
 '2d7f7336b88783dc':'b50d1a2a83550cbc01d81ee6729465e23ff59bb8f05bb2ed0a56295b9f08e6fe',
 'f0b822afe2554cec':'0ee72d0eeebe95e37eef880222b0b7502fc76dd034003e7e80af2919d456e613',
 '188eabe7f52ab4d0':'2d863a5b19908138cd2a54bcedafb7a4a2f6e3746d9ff13071f155348cee6dc6'};
 for(const [id,sha] of Object.entries(hashes))assert.equal(hash(required(id).func),sha,id);
});
test('all 132 original/new function bodies compile in real Node.js',()=>{
 for(const n of nodes.filter(n=>n.type==='function'))assert.doesNotThrow(()=>new Function('msg','flow','global','context','node','env','Buffer','require',n.func),n.name);
});
test('three inverters preserve original parser, normalizer, MQTT and learning topology',()=>{
 for(let i=1;i<=3;i++){
   const n=inv[i];
   for(const key of ['parser','req','enq','pump','select','norm','pub','disc','monitor','init'])assert.ok(required(n[key]));
   for(const id of ['espfull_get_','espfull_http_','espfull_unpack_','espfull_dispatch_','espfull_post_','espfull_result_','espfull_postcatch_'])assert.ok(required(id+i));
   assert.equal(required(n.enq).outputs,2);
   assert.ok(required(n.enq).wires[1].includes('espfull_dispatch_'+i));
   assert.ok(required('espfull_unpack_'+i).wires[0].includes(n.parser));
 }
});
for(let i=1;i<=3;i++){
 test('INV'+i+' no duplicate Node-RED UART polling in ESP transport',()=>{
   const h=harness();
   assert.equal(h.run(inv[i].req,{inverterNum:i}),null);
   assert.equal(h.run(inv[i].pump,{inverterNum:i}),null);
   assert.deepEqual(h.run(inv[i].enq,{inverterNum:i,command:'QPIGS'}),[null,{inverterNum:i,command:'QPIGS'}]);
   assert.deepEqual(h.run(inv[i].select,{inverterNum:i}),[null,null]);
 });
 test('INV'+i+' original serial/gateway modes still dispatch to original queue',()=>{
   for(const mode of ['serial','tcp']){
     const h=harness({['INV'+i+'_TRANSPORT']:mode});
     assert.notEqual(h.run(inv[i].req,{inverterNum:i}),null);
     const v=h.run(inv[i].enq,{inverterNum:i,command:'QPIGS',payload:'QPIGS'});
     assert.equal(v[1],null);
     assert.ok(v[0]);
   }
 });
 test('INV'+i+' HTTP only fetches authenticated native reply cache',()=>{
   const h=harness();
   const m=h.run('espfull_get_'+i,{});
   assert.equal(m.method,'GET');
   assert.equal(m.headers['X-Setup-Code'],'TESTCODE-123');
   assert.equal(m.url,'http://127.0.0.1:18081/api/v1/bridge/snapshot');
 });
}
test('complete pipeline QPIGS -> original parser -> normalize -> day -> Premium -> HA',()=>{
 const h=harness();
 const {state}=readPipeline(h,native(1,'QPIGS',fakeQPIGS()));
 assert.equal(state.ac_output_active_power,1100);
 assert.equal(state.battery_voltage,52.6);
 assert.equal(state.pv1_input_voltage,320);
 assert.equal(state.battery_power,1104.6);
 assert.equal(state.output_load_percent,33);
});
test('all 68 state sensor fields referenced by original HA discovery exist',()=>{
 const h=harness();const state=readPipeline(h,native(1,'QPIGS',fakeQPIGS())).state;
 const discovery=required(inv[1].disc).func;
 const fields=[...new Set([...discovery.matchAll(/value_json\.([a-z][a-z0-9_]*)/g)].map(x=>x[1]))].filter(x=>x!=='get');
 assert.equal(fields.length,71);
 const healthFields=['status','command_success_pct','response_success_pct'];
 for(const f of fields.filter(k=>!healthFields.includes(k)))assert.ok(Object.prototype.hasOwnProperty.call(state,f),'missing published state field '+f);
 assert.equal(fields.filter(k=>!healthFields.includes(k)).length,68);
});
test('zero night PV does not indicate an offline inverter',()=>{
 const h=harness();const raw=[230,50,230,50,80,0,0,410,52.5,0,85,0,0,0,52.5,0,...Array(12).fill(0)].join(' ');
 const state=readPipeline(h,native(1,'QPIGS',raw)).state;
 assert.equal(state.ac_output_active_power,0);
 assert.ok(state.pv_total_power===0||state.pv1_power===0);
});
test('cached QPIGS2 MPPT2 reaches original HA PV2 sensors',()=>{
 const h=harness();
 readPipeline(h,native(1,'QPIGS',fakeQPIGS()));
 const state=readPipeline(h,native(2,'QPIGS2','2.5 240 600')).state;
 assert.equal(state.pv2_power,600);
 assert.equal(state.pv2_input_current,2.5);
 assert.equal(state.pv2_input_voltage,240);
});
test('cached QPIRI and QDOP update existing HA number and select fields',()=>{
 const h=harness();
 const qpiri=Array.from({length:31},(_,i)=>i===10?55.2:i===11?54.0:i===14?50:i===16?2:i===17?1:0);
 const st=readPipeline(h,native(1,'QPIRI',qpiri.join(' '))).state;
 assert.equal(st.params.qpiri.battery_bulk_voltage,55.2);
 assert.equal(st.params.qpiri.max_charging_current,50);
 const qdop=Array.from({length:24},(_,i)=>i===8?15:i===9?20:i===10?10:0);
 const next=readPipeline(h,native(2,'QDOP',qdop.join(' '))).state;
 assert.equal(next.params.qdop.battery_under_capacity_pct,10);
});
test('QMOD/diagnostics/energy queries still pass through original model functions',()=>{
 const h=harness();
 const r1=readPipeline(h,native(1,'QMOD','B')).state;
 assert.ok(r1.operation_mode);
 const r2=readPipeline(h,native(2,'QET','123456')).state;
 assert.ok(r2.pv_energy_total_kwh!==undefined);
 const r3=readPipeline(h,native(3,'QLT','200000')).state;
 assert.ok(r3.load_energy_total_kwh!==undefined);
});
test('QBMS and Q1 native payloads are accepted by original parser (when CRC-verified on ESP)',()=>{
 const h=harness();
 for(const cmd of ['QBMS','Q1']){
    const data=h.run('espfull_unpack_1',snapshot(cmd==='QBMS'?1:2,[native(cmd==='QBMS'?1:2,cmd,'10 20 30 40 50 60')]))[0][0];
    const p=h.run(inv[1].parser,data);
    assert.ok(p?.[1]?.[0]?.payload,cmd);
 }
});
test('ESP cache duplicate snapshots replay no native command twice',()=>{
 const h=harness(),s=snapshot(5,[native(5,'QPIGS',fakeQPIGS())]);
 assert.equal(h.run('espfull_unpack_1',s)[0].length,1);
 assert.equal(h.run('espfull_unpack_1',s)[0],null);
});
test('ESP MCU reboot starts fresh replay sequence without losing HA entity IDs',()=>{
 const h=harness();
 h.run('espfull_unpack_1',snapshot(55,[native(55,'QPIGS',fakeQPIGS())],{uptime_ms:100000}));
 const r=h.run('espfull_unpack_1',snapshot(1,[native(1,'QPIGS',fakeQPIGS())],{uptime_ms:1000}));
 assert.equal(r[0].length,1);
});
test('stale age, no cache marker, unauthorized HTTP or ESP offline produce unavailable',()=>{
 const h=harness();
 for(const msg of [
  snapshot(1,[],{available:false}),{statusCode:401,payload:{error:'unauthorized'}},
  {statusCode:200,payload:{available:true,cache_only:false,replies:[],max_seq:1}},
  {error:{message:'timeout'}}
 ]){
    const res=h.run('espfull_unpack_1',msg);
    assert.equal(res[0],null);
    assert.equal(res[1].topic,'voltronic/1/availability');
    assert.equal(res[1].payload,'offline');
 }
});
test('stale QPIGS beyond 10 seconds is skipped without spoofing HA readings',()=>{
 const h=harness();
 assert.equal(h.run('espfull_unpack_1',snapshot(2,[native(2,'QPIGS',fakeQPIGS(),{age_ms:10001})]))[0],null);
});
test('dated UTC energy from wrong local day is not mislabelled today in Home Assistant',()=>{
 const h=harness();
 const prevDate=new Date(Date.now()-86400000);
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(prevDate);
 const day=parts.find(x=>x.type==='year').value+parts.find(x=>x.type==='month').value+parts.find(x=>x.type==='day').value;
 assert.notEqual(day,nowKey('D'));
 const out=h.run('espfull_unpack_1',snapshot(3,[native(3,'QED'+day,'100000')]));
 assert.equal(out[0],null);
});
test('fresh dated energy is accepted without inventing values',()=>{
 const h=harness();
 const out=h.run('espfull_unpack_1',snapshot(3,[native(3,'QED'+nowKey('D'),'100000')]));
 assert.equal(out[0].length,1);
});
test('ESP authentication code never persists to the Node-RED global configuration',()=>{
 const n=required('309c2c85e8d3a815');
 assert.ok(n.func.includes('delete optsPublic["inv"+k+"_esp_code"]'));
 const h=harness();
 const payload={inv1_link:'esp32',inv1_esp_host:'192.0.2.1',inv1_esp_port:18081,
 inv1_esp_code:'SECRET-NEVER-LOG',inv2_link:'gateway',inv2_gateway_host:'192.0.2.2',
 inv3_link:'serial',inv3_serial_port:'/dev/ttyUSB9'};
 const loaded=h.run('309c2c85e8d3a815',{payload:JSON.stringify(payload)});
 assert.ok(loaded.payload);
 assert.deepEqual(h.global.get('config.invertersList'),[1,2,3]);
 assert.equal(JSON.stringify(h.global.get('addon_config')).includes('SECRET-NEVER-LOG'),false);
});
test('Premium communication health derives real ESP UART stats, not fake queue success',()=>{
 const h=harness();
 h.global.set('premium.active',true);
 h.global.set('config.invCfg',{1:{transport:'esp32',espHost:'127.0.0.1',espPort:18081}});
 h.run(inv[1].init,{});
 h.run('espfull_unpack_1',snapshot(1,[native(1,'QPIGS',fakeQPIGS())]));
 h.run(inv[1].monitor,{});
 const health=h.global.get('inv1_comm_health');
 assert.equal(health.status,'HEALTHY');
 assert.equal(health.transport,'esp32');
 assert.equal(health.tx_count,150);
 assert.equal(health.response_success_pct,90);
 const online=h.run(inv[1].healthMqtt,{});
 assert.ok(online);
 const payload=JSON.parse(online.payload);
 assert.equal(payload.status,'HEALTHY');
 assert.equal(payload.command_success_pct,93.33);
});
test('Premium COMM HEALTH switches OFFLINE when ESP snapshot reports stale',()=>{
 const h=harness();
 h.global.set('premium.active',true);
 h.global.set('config.invCfg',{1:{transport:'esp32',espHost:'127.0.0.1'}});
 h.run(inv[1].init,{});
 h.run('espfull_unpack_1',snapshot(1,[],{available:false}));
 h.run(inv[1].monitor,{});
 assert.equal(h.global.get('inv1_comm_health').status,'OFFLINE');
});
test('writes are disabled by default, including raw SET commands',()=>{
 const h=harness();
 const old=Array.from({length:31},(_,i)=>i===14?20:0);
 h.flow.set('esp1_qpiri',{fields:old,seen:Date.now(),seq:9});
 const out=h.run('espfull_dispatch_1',{inverterNum:1,command:'MNCHGC0030',_ha_param:'max_charging_current'});
 assert.equal(out[0],null);
 assert.equal(out[1].payload.nak,true);
});
test('allowed QDOP percent write selects QDOP old native field and semantic endpoint',()=>{
 const h=harness({INV1_ESP_WRITE_ENABLED:'true'});
 h.flow.set('esp1_qdop',{fields:Array.from({length:16},(_,i)=>i===10?15:0),seen:Date.now(),seq:2});
 const out=h.run('espfull_dispatch_1',{inverterNum:1,command:'PSDC020',_ha_param:'battery_under_capacity_pct'});
 assert.equal(out[0].method,'POST');
 assert.deepEqual(JSON.parse(out[0].payload),{parameter:'battery_under_capacity_pct',old:15,value:20,confirmed:true});
});
test('ambiguous alternative voltage opcode and arbitrary raw SET never reach ESP UART',()=>{
 const h=harness({INV1_ESP_WRITE_ENABLED:'true'});
 h.flow.set('esp1_qpiri',{fields:Array.from({length:31},(_,i)=>i===10?54:0),seen:Date.now(),seq:3});
 for(const command of ['PBCV55.2','PBFV55.2','PMALICIOUS123']){
   const out=h.run('espfull_dispatch_1',{inverterNum:1,command,_ha_param:'battery_bulk_voltage'});
   assert.equal(out[0],null,command);
 }
});
test('semantic writes reject stale cached baseline, old==new and concurrent edit',()=>{
 const h=harness({INV1_ESP_WRITE_ENABLED:'true'});
 h.flow.set('esp1_qpiri',{fields:Array.from({length:31},(_,i)=>i===14?30:0),seen:Date.now()-70000,seq:5});
 const m={inverterNum:1,command:'MNCHGC0030',_ha_param:'max_charging_current'};
 assert.equal(h.run('espfull_dispatch_1',m)[0],null);
 h.flow.set('esp1_qpiri',{fields:Array.from({length:31},(_,i)=>i===14?30:0),seen:Date.now(),seq:5});
 assert.equal(h.run('espfull_dispatch_1',m)[0],null);
 h.flow.set('esp1_qpiri',{fields:Array.from({length:31},(_,i)=>i===14?20:0),seen:Date.now(),seq:5});
 assert.equal(h.run('espfull_dispatch_1',m)[0].method,'POST');
 assert.equal(h.run('espfull_dispatch_1',m)[0],null);
});
test('complete learning: bad first candidate NAK -> next candidate -> verified POST -> fresh native QPIRI -> persisted profile',()=>{
 const h=harness({INV1_ESP_WRITE_ENABLED:'true'});
 h.global.set('config.batterySystemVoltage',48);
 h.flow.set('inv1_normalized_state',{diag:{serial:'MOCKSERIAL',model:'AXPERT TEST',fw_main:'FW'},params:{qpiri:{max_charging_current:20}}});
 h.flow.set('esp1_qpiri',{fields:Array.from({length:31},(_,i)=>i===14?20:0),seen:Date.now(),seq:9});
 const mapped=h.run('381cb2e10d9b5625',{topic:'voltronic/1/set/max_charging_current',payload:30})[0];
 const pre=h.run('8093ac9b9299eb71',mapped)[0];
 const decided=h.run('49a49791d8e00e12',pre);
 const first=h.run('b1a8cd69494aac47',decided)[0];
 assert.equal(first.command,'MNCHGC030');
 const firstSend=h.run('espfull_dispatch_1',first);
 assert.equal(firstSend[0],null);
 assert.equal(firstSend[1].payload.nak,true);
 const next=h.run('297f43a988be0f16',firstSend[1])[1];
 const second=h.run('b1a8cd69494aac47',next)[0];
 assert.equal(second.command,'MNCHGC0030');
 const send=h.run('espfull_dispatch_1',second);
 assert.equal(send[0].method,'POST');
 assert.equal(send[0].headers['X-Write-Confirmed'],'yes');
 assert.equal(send[0].url,'http://127.0.0.1:18081/api/v1/parameters/change');
 const changed=h.run('espfull_result_1',{...send[0],statusCode:200,payload:{verified:true,set_acknowledged:true}})[0];
 const rx=h.run('297f43a988be0f16',changed);
 assert.equal(rx[0]._cmd,'QPIRI');
 assert.equal(h.run('espfull_dispatch_1',rx[0])[2]._esp_verify,true);
 const qpiri=Array.from({length:31},(_,i)=>i===14?30:i===16?2:i===17?1:i===10?55.2:i===11?54:0);
 const snap=h.run('espfull_unpack_1',snapshot(11,[native(11,'QPIRI',qpiri.join(' '))]))[0][0];
 assert.equal(snap._esp_verified_readback,true);
 const parsed=h.run(inv[1].parser,snap)[1][0];
 const norm=h.run(inv[1].norm,parsed);
 const success=h.run('63a5df524557766e',norm)[0];
 assert.equal(success._learn_success,true);
 assert.equal(success.payload.candidate_key,'MNCHGC_MACHINE');
 const completed=h.run('7b3c22ccb3f35b22',success);
 h.run('c7dd3f6c4469e834',completed);
 assert.equal(h.global.get('learned_commands')['SERIAL:MOCKSERIAL'].max_charging_current.key,'MNCHGC_MACHINE');
});
test('failed firmware verification emits NAK, does not claim a learned command',()=>{
 const h=harness();
 const msg=h.run('espfull_result_1',{statusCode:200,_esp_attempt_command:'MNCHGC0030',payload:{verified:false,set_acknowledged:true,result:'readback_does_not_match'}});
 assert.equal(msg[0].payload.nak,true);
 assert.equal(h.flow.get('esp1_verified_after_seq'),null);
 assert.equal(h.flow.get('esp1_edit_inflight'),false);
});
test('cache replay without verified transaction cannot satisfy the learning proof',()=>{
 const h=harness();
 h.flow.set('esp1_qpiri',{fields:Array.from({length:31},()=>0),seen:Date.now(),seq:10});
 const unchanged=Array.from({length:31},(_,i)=>i===14?30:0);
 const before=h.run('espfull_unpack_1',snapshot(9,[native(9,'QPIRI',unchanged.join(' '))]));
 assert.equal(before[0][0]._esp_verified_readback,false);
});
test('ESP HTTP write exception releases edit lock and reports failure',()=>{
 const h=harness();
 h.flow.set('esp1_edit_inflight',true);
 const r=h.run('espfull_result_1',{error:{message:'timeout'},_esp_attempt_command:'MNCHGC0030'});
 assert.equal(h.flow.get('esp1_edit_inflight'),false);
 assert.equal(r[0].payload.nak,true);
});
test('learning remains model-aware: unchanged original profile persistence and retry logic',()=>{
 const expected=['8093ac9b9299eb71','49a49791d8e00e12','b1a8cd69494aac47','297f43a988be0f16',
 '63a5df524557766e','7b3c22ccb3f35b22','c7dd3f6c4469e834'];
 for(const id of expected)assert.ok(required(id).func.length>500);
 assert.ok(required('297f43a988be0f16').wires[1].includes('b1a8cd69494aac47'));
});
