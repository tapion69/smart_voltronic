#!/usr/bin/env node
"use strict";
function patch(nodes) {
 const by=new Map(nodes.map(n=>[n.id,n]));
 const ids=[
 ["99e50980ea51a78b","381cb2e10d9b5625","8093ac9b9299eb71","49a49791d8e00e12","b1a8cd69494aac47","297f43a988be0f16","63a5df524557766e","7b3c22ccb3f35b22","ae550f5a2172cd28","5b54a23492681019","06f687dbe6782ce8","6610714dd2585f9b","6013564ccd697834"],
 ["0e9a9faa6a7dc537","46ca504f4729209c","05be72a05279b7ec","d2c377c45785984f","bbd3067079b8f836","6bb428a986b3c6aa","360742b2f76a7b41","4e9392aefa24990d","41e38efed69c0164","818d9f11dc2a6669","e82d4d3650a26a34","cc84c35690619c8c","bf5b654c1eeba5bc"],
 ["1aa342570293ed07","03e8bd2641c96986","feda378cd425f63c","b636109e2d09a423","9288782e4d4509cf","326527ee9a32da40","eb3be03414b247e5","3a59470b27677402","16e174899c2ba6ec","6a77a0869a848c5b","057108fc794236af","7a996d0af613991a","6fc157dd4e04371b"]];
 const must=(ok,m)=>{if(!ok)throw Error(m)};
 const rep=(n,a,b)=>{must(n.func.includes(a),n.name+" missing "+String(a).slice(0,80));n.func=n.func.replace(a,b)};
 const add=(n,o,id)=>{if(!n.wires[o].includes(id))n.wires[o].push(id)};
 const marker="// TX_FIFO_V2";
 if(ids.every((_,k)=>by.get("espqueue"+(k+1)+"_control")?.func.includes(marker)))return nodes;
 for(let i=1;i<=3;i++){
  const [mqtt,ha,pre,dec,build,rx,sf,done,enq,pump,parser,norm,verify]=ids[i-1].map(id=>{must(by.has(id),id);return by.get(id)});
  const qid="espqueue"+i+"_control",q=by.get(qid),tick=by.get("espqueue"+i+"_tick"),espResult=by.get("espfull"+i+"_learn_result");
  must(q&&tick&&espResult,"missing queue "+i);
  // Preserve original HA entities and ESP discovery payloads; replace dispatch policy.
  const old=q.func;
  const discovery=old.slice(old.indexOf('const top="voltronic/'),old.indexOf("function expire()"));
  must(discovery.includes("function publish(out)")&&discovery.includes("function messages()"),"queue discovery contract");
  q.func=marker+"\nconst INV="+i+";\n"+String.raw`
const mode=String(env.get("INV"+INV+"_TRANSPORT")||"serial").toLowerCase();
const isEsp=mode==="esp32", disabled=mode==="disabled";
const KEY=isEsp?"espqueue_inv"+INV+"_v1":"nativequeue_inv"+INV+"_v2";
const ACTIVE="inv"+INV+"_tx_active", DIRECT="inv"+INV+"_tx_direct";
const LIMIT=isEsp?5:200, TTL=3600000, now=Date.now();
const clean=v=>String(v??"").trim();
const canonical=p=>({battery_cutoff_voltage:"battery_under_voltage",back_to_grid_voltage:"battery_recharge_voltage",back_to_battery_voltage:"battery_re_discharge_voltage",grid_charging_current:"max_ac_charging_current"}[p]||p);
const allow=new Set(["battery_bulk_voltage","battery_float_voltage","battery_under_voltage","battery_recharge_voltage","battery_re_discharge_voltage","max_charging_current","max_ac_charging_current","output_source_priority","charger_source_priority"]);
let q=global.get(KEY)||(isEsp?global.get(KEY,"persistent"):null);
if(!q||!Array.isArray(q.items))q={items:[],inflight:null,expired:0,rejected:0,purged:0,confirmed:0,uncertain:0,last_error:"",last_result:"",sequence:0,failed:0,ack_only:0};
for(const k of ["expired","rejected","purged","confirmed","uncertain","sequence","failed","ack_only"])q[k]=Number(q[k]||0);
if(context.get("tx_mode")!==mode){
 if(q.inflight){q.items=q.items.filter(x=>x.id!==q.inflight.id);q.inflight=null;q.uncertain++;q.last_error="restart_inflight_not_replayed";}
 flow.set(ACTIVE,null);flow.set(DIRECT,null);context.set("tx_mode",mode);
}
function save(){global.set(KEY,q);if(isEsp)global.set(KEY,q,"persistent");}
`+discovery.replace("const out=[","const out=[\n  {topic:\"voltronic/\"+INV+\"/transactions/status\",payload:JSON.stringify({mode,depth:count,inflight:q.inflight?.param||null,confirmed:q.confirmed,ack_only:q.ack_only,failed:q.failed,uncertain:q.uncertain,rejected:q.rejected,expired:q.expired,last_result:q.last_result,last_error:q.last_error}),retain:true},").replace("m.splice(2);","m.splice(3);")+String.raw`
function finish(ok,reason,uncertain=false,ackOnly=false){
 const a=q.inflight;if(!a)return;
 q.items=q.items.filter(x=>x.id!==a.id);q.inflight=null;
 if(ok){if(ackOnly)q.ack_only++;else q.confirmed++;}
 else if(uncertain)q.uncertain++;else q.failed++;
 q.last_result=ok?(ackOnly?"ack_only":"verified"):(uncertain?"uncertain":"failed");q.last_error=ok?"":reason;
 flow.set(ACTIVE,null);flow.set(DIRECT,null);
 const k="inv"+INV+"_queue",pending=flow.get(k);
 if(Array.isArray(pending))flow.set(k,pending.filter(x=>x._tx_id!==a.id));
 if(!ok)node.warn("INV"+INV+" transaction "+a.param+": "+reason);
 if(uncertain)q.holdUntil=now+2000;
 save();
}
const oldLen=q.items.length;
q.items=q.items.filter(x=>x&&((q.inflight&&x.id===q.inflight.id)||(Number.isFinite(x.added)&&x.added>now-TTL)));
if(q.items.length<oldLen){q.expired+=oldLen-q.items.length;q.last_error="ttl_1h";q.last_result="expired";node.warn("INV"+INV+" expired pending transactions");}
if(msg.topic==="voltronic/"+INV+"/esp_queue/purge/set"){
 if(!isEsp||clean(msg.payload).toUpperCase()!=="PURGE")return publish(null);
 q.purged+=q.items.filter(x=>x.id!==q.inflight?.id).length;
 q.items=q.items.filter(x=>x.id===q.inflight?.id);q.last_result="purged";save();return publish(null);
}
const a=q.inflight;
if(msg._tx_end===true&&a&&msg._tx_id===a.id){
 finish(msg.success===true,msg.reason||"rejected",msg.uncertain===true,msg.ack_only===true);
}else if(msg._learn_complete===true&&a&&msg._tx_id===a.id){
 finish(msg._learn_success===true,msg.payload?.reason||"learning_failed",msg.payload?.uncertain===true);
}else if(a&&!isEsp&&msg._tx_id===a.id&&msg._tx_response===true){
 const d=flow.get(DIRECT);
 if(d&&d.id===a.id){
  const c=clean(msg.command||msg._cmd).toUpperCase(),raw=clean(msg.payload?.raw_response||msg._raw_response).replace(/^\(/,"").replace(/\)$/,"").trim().toUpperCase();
  if(msg._learn_timeout||msg.payload?.timeout){finish(false,"direct_timeout",true);}
  else if(msg.payload?.nak===true){finish(false,"direct_nak");}
  else if(c===d.set){
   if(d.raw){finish(true,"raw_response",false,true);}
   else if(raw!=="ACK"){finish(false,"invalid_ack",true);}
   else {d.acked=true;flow.set(DIRECT,d);if(!d.reads.length&&!d.load2)finish(true,"ack",false,true);}
  }else if(d.acked&&d.load2&&c==="QDOP"){
   const vals=msg.payload?.fields||[],index=d.load2.index;
   const actual=vals[index]===undefined||vals[index]===null||vals[index]===""?NaN:Number(vals[index]);
   if(Number.isFinite(actual)&&Math.abs(actual-d.load2.expected)<0.05)finish(true,"load2_verified");
   else if(d.set!=="PTOPE0"&&d.set!=="PTOPE1"||!flow.get("inv"+INV+"_load2_verify_pending"))finish(false,"load2_readback_mismatch",true);
  }else if(d.acked&&d.reads.includes(c)){
   d.reads=d.reads.filter(x=>x!==c);flow.set(DIRECT,d);
   if(!d.reads.length)finish(true,"ack_and_refresh",false,true);
  }
 }
}
const match=clean(msg.topic).match(new RegExp("^voltronic/"+INV+"/set/([a-z_]+)$"));
if(match){
 const param=canonical(match[1]),v=msg.payload;
 if(disabled||(isEsp&&!allow.has(param))||v===null||v===undefined||typeof v==="object"||clean(v).length>128||!clean(v)){
  q.rejected++;q.last_result="rejected";q.last_error=disabled?"disabled":isEsp&&!allow.has(param)?"unsupported_esp_parameter":"invalid_value";node.warn("INV"+INV+" "+param+": "+q.last_error);save();return publish(null);
 }
 if(q.items.length>=LIMIT){q.rejected++;q.last_result="rejected";q.last_error="queue_full";node.warn("INV"+INV+" FIFO full: "+param);save();return publish(null);}
 // No coalescing, even for the same parameter: each HA event has its own identity.
 q.items.push({id:now+"-"+(++q.sequence),param,raw:match[1],value:v,added:now});
 q.last_result="queued";q.last_error="";save();
}
if(q.inflight){
 const age=now-q.inflight.started;
 if(age>(isEsp?60000:90000)){
  const session=flow.get("learn_session_inv"+INV);
  // Do not retry a write whose outcome is unknown; invalidate only this transaction.
  if(session?.txId===q.inflight.id){flow.set("learn_session_inv"+INV,null);flow.set("learn_pending_inv"+INV,null);}
  if(flow.get(DIRECT)?.load2)flow.set("inv"+INV+"_load2_verify_pending",null);
  finish(false,"transaction_deadline",true);
 }
 return publish(null);
}
if(disabled||!q.items.length||now<Number(q.holdUntil||0)){save();return publish(null);}
const state=flow.get("inv"+INV+"_normalized_state")||{},learn=flow.get("learn_session_inv"+INV)||{};
if(learn.active===true){save();return publish(null);}
const e=q.items[0];
const identity=state.diag?.serial||state.diag?.model||state.diag?.fw_main;
if(allow.has(e.param)&&(!identity||!Number(state._last_qpiri_ts))){save();return publish(null);}
if(isEsp){
 const h=global.get("inv"+INV+"_esp_health")||{},health=global.get("inv"+INV+"_comm_health")||{};
 if(String(env.get("INV"+INV+"_ESP_WRITE_ENABLED")||"false").toLowerCase()!=="true"||
 h.http_ok!==true||now-Number(h.last_http_ok_ts||0)>=10000||now-Number(h.last_response_ts||0)>=15000||
 now-Number(state._last_qpiri_ts||0)>=360000||health.night_freeze===true||health.sleeping===true){save();return publish(null);}
}
q.inflight={id:e.id,param:e.param,started:now};flow.set(ACTIVE,q.inflight);save();
return publish({topic:"voltronic/"+INV+"/set/"+e.raw,payload:e.value,inverterNum:INV,_tx_id:e.id,_esp_queue_replay:isEsp});
`;
  // Reuse the existing per-inverter MQTT entry and completion path in every transport.
  mqtt.wires[0]=mqtt.wires[0].map(x=>x===ha.id||x===qid?qid:x);
  must(mqtt.wires[0].filter(x=>x===qid).length===1,"MQTT route "+i);
  mqtt.qos="1";tick.repeat="1";
  // Mapper wrapper retains original validations and mappings. Direct writes receive a terminal path.
  const haOrig=ha.func;
  ha.func=marker+"\nconst txInput=msg._tx_id;\nconst result=(function(){\n"+haOrig+"\n})();\n"+String.raw`
if(!txInput)return result;
const inv=Number(msg.inverterNum||String(msg.topic).split("/")[1]);
const end=(reason)=>[null,null,{inverterNum:inv,_tx_end:true,_tx_id:txInput,success:false,reason}];
if(!result)return end("invalid_or_unsupported_parameter");
if(result[0])result[0]._tx_id=txInput;
if(result[1]){
 const arr=Array.isArray(result[1])?result[1]:[result[1]];
 const set=arr[0];if(!set)return end("empty_direct_command");
 if(String(env.get("INV"+inv+"_TRANSPORT")||"").toLowerCase()==="esp32")return end("unsupported_esp_direct");
 for(const m of arr){m._tx_id=txInput;m._priority=true;}
 const command=String(set.command||"").toUpperCase();
 const load2Map={load2:[0,command==="PTOPE1"?1:0],load2_off_voltage:[5,Number(command.slice(5))],load2_on_voltage:[14,Number(command.slice(6))],load2_off_soc:[11,Number(command.slice(6))],load2_on_soc:[16,Number(command.slice(7))]};
 const lp=load2Map[set._ha_param];
 flow.set("inv"+inv+"_tx_direct",{id:txInput,set:command,reads:arr.slice(1).map(x=>String(x.command).toUpperCase()),raw:set._raw_manual===true,acked:false,load2:lp?{index:lp[0],expected:lp[1]}:null});
}
return result;
`;
  ha.outputs=3;ha.wires.push([qid]);
  // Preprocessor: do not treat an old cached value as success. ESP firmware does its own fresh preflight.
  rep(pre,'const valueRaw = msg._ha_value ?? msg.payload;',`const valueRaw = msg._ha_value ?? msg.payload;
const txEnd=(success,reason)=>[null,null,{inverterNum:inv,_tx_end:true,_tx_id:msg._tx_id,success,reason}];`);
  rep(pre,'if (param === "output_source_priority" && isTwoChoiceOutputPriorityEnabled(inv)) {','if (param === "output_source_priority" && isTwoChoiceOutputPriorityEnabled(inv)) {\\n    if(msg._tx_id)return txEnd(false,"forced_two_choice_requires_native");'.replace("\\n","\n"));
  rep(pre,'return [null, msg];\n}\n\nconst currentValue','return msg._tx_id?txEnd(false,"identity_missing"):[null,msg];\n}\n\nconst currentValue');
  rep(pre,'const currentValue = getByPath(state, cfg.statePath);',`const currentValue = getByPath(state, cfg.statePath);
const canNoop=(!msg._tx_id||String(env.get("INV"+inv+"_TRANSPORT")||"").toLowerCase()!=="esp32")&&Number(state._last_qpiri_ts)>0&&Date.now()-Number(state._last_qpiri_ts)<5000&&currentValue!==null&&currentValue!==undefined;`);
  rep(pre,'if (guard && guard.blockUntil && Date.now() < Number(guard.blockUntil)) {','if (!msg._tx_id && guard && guard.blockUntil && Date.now() < Number(guard.blockUntil)) {');
  rep(pre,'if (isEqual(currentValue, requestedValue, cfg.tolerance)) {','if (canNoop && isEqual(currentValue, requestedValue, cfg.tolerance)) {');
  rep(pre,'if (Number.isInteger(currentNum)) {','if (canNoop && Number.isInteger(currentNum)) {');
  // Map all early returns for managed transactions to explicit outcomes; no false success on invalid input.
  pre.func=pre.func.replace(/return \[null, null\];/g,(match,offset,src)=>{
   const prefix=src.slice(Math.max(0,offset-200),offset);
   const good=prefix.includes("`already ");
   return `return msg._tx_id?txEnd(${good},${JSON.stringify(good?"already_applied":"preprocess_rejected")}):[null,null];`;
  });
  pre.outputs=3;pre.wires.push([qid]);
  rep(dec,'sessionId: msg._learn.sessionId,','sessionId: msg._learn.sessionId,\n    txId: msg._tx_id || null,');
  // Queue accepts exactly one managed operation, not a stack of urgent polling requests.
  rep(enq,'const now = Date.now();',`const now = Date.now();
const activeTx=flow.get("inv"+inv+"_tx_active");
if(String(env.get("INV"+inv+"_TRANSPORT")||"").toLowerCase()==="esp32")return null;`);
  rep(enq,'const origin = cleanStr(m._origin);',`const origin = cleanStr(m._origin);
    let txId=m._tx_id||null;
    const direct=flow.get("inv"+inv+"_tx_direct");
    if(activeTx&&!txId&&origin==="learn_retry"&&m._learn?.sessionId===flow.get("learn_session_inv"+inv)?.sessionId)txId=activeTx.id;
    if(activeTx&&!txId&&direct?.load2&&(origin==="load2_refresh"||(origin==="ha_set"&&cmd===direct.set)))txId=activeTx.id;
    if(activeTx&&txId!==activeTx.id)return null;
    if(txId&&(!activeTx||activeTx.id!==txId))return null;`);
  rep(enq,'_origin: origin,','_origin: origin,\n        _tx_id: txId,');
  rep(enq,'const mustKeep = isCriticalOrigin(origin);','const mustKeep = !!item._tx_id || isCriticalOrigin(origin);');
  rep(enq,'q.unshift(item);',`const rank=x=>x._tx_id?0:(x._origin==="ha_set"||x._origin==="learn_retry")?1:x.priority?2:3;
        const at=q.findIndex(x=>rank(x)>rank(item));
        if(at<0)q.push(item);else q.splice(at,0,item);`);
  // During a write session, only its own candidate/readback can leave the UART queue.
  rep(pump,'const pendingLearnKey = `learn_pending_inv${inv}`;',`const pendingLearnKey = \`learn_pending_inv\${inv}\`;
const activeTx=flow.get("inv"+inv+"_tx_active");
if(Date.now()<Number(flow.get("inv"+inv+"_tx_drain_until")||0))return [null,null];`);
  rep(pump,'flow.set(\n                pendingLearnKey,\n                null\n            );','// Retain pending verification until the correlated timeout reaches Learning RX.');
  rep(pump,'inFlight =\n        null;','inFlight =\n        null;');
  rep(pump,'    inFlight =\n        null;\n}',`    if(inFlight._tx_id){
        if(!timeoutEvent)timeoutEvent={inverterNum:inv,command:timedOutCmd,_cmd:timedOutCmd,_learn_timeout:true,payload:{timeout:true}};
        timeoutEvent._tx_id=inFlight._tx_id;timeoutEvent._tx_response=true;timeoutEvent._learn_session_id=inFlight.learn?.sessionId;
    }
    flow.set("inv"+inv+"_tx_drain_until",Date.now()+1000);
    return [null,timeoutEvent];
}`);
  rep(pump,'const next =\n    q.shift();',`const idx=activeTx?q.findIndex(x=>x._tx_id===activeTx.id):0;
if(idx<0)return [null,timeoutEvent];
const next=q.splice(idx,1)[0];`);
  rep(pump,'origin:\n            origin,','origin:\n            origin,\n        _tx_id: out._tx_id || null,');
  add(pump,1,qid);
  // Native parser: retain transaction identity and validate response class before releasing inflight.
  rep(parser,'const parsed = parseFrame(frames[i], cmd, rawCmd);',`const parsed = parseFrame(frames[i], cmd, rawCmd);
  if(i===0&&inflight?._tx_id){
    const frame=frames[i];
    let valid=frame.length===1&&frame[0]===NAK;
    if(frame.length>=4&&frame[0]===0x28){
      let crc=0;for(const b of frame.slice(0,-3)){crc^=b<<8;for(let k=0;k<8;k++)crc=((crc&32768)?((crc<<1)^0x1021):(crc<<1))&65535;}
      const adjust=b=>[0x28,0x0d,0x0a].includes(b)?b+1:b;
      valid=frame[frame.length-3]===adjust(crc>>8)&&frame[frame.length-2]===adjust(crc&255);
    }
    const raw=String(parsed.raw_response||"").replace(/^\\(/,"").replace(/\\)$/,"").trim().toUpperCase();
    if(!valid||(!inflight.raw_manual&&!cmd.startsWith("Q")&&!parsed.nak&&raw!=="ACK")||
      (!parsed.nak&&cmd==="QPIRI"&&(parsed.fields.length<18||!/^[-+]?\\d+(\\.\\d+)?$/.test(String(parsed.fields[16]))||!/^[-+]?\\d+(\\.\\d+)?$/.test(String(parsed.fields[17]))))) {
      node.warn("INV"+inv+" invalid transaction response "+cmd);return null;
    }
  }`);
  rep(parser,'_raw_manual: isRawManual,\n    payload: parsed,','_raw_manual: isRawManual,\n    _tx_id: i===0?inflight?._tx_id:null,\n    _tx_response: i===0&&!!inflight?._tx_id,\n    _learn_session_id: i===0?inflight?.learn?.sessionId:null,\n    _esp_seq: espRead?msg._esp_seq:null,\n    payload: parsed,');
  // Do not let a delayed LOAD2 timer from an older transaction resend an obsolete value.
  rep(parser,'node.send([null, null, triggerMsg]);','if(!inflight?._tx_id||flow.get("inv"+inv+"_tx_active")?.id===inflight._tx_id)node.send([null,null,triggerMsg]);');
  rep(parser,'node.send([null, null, triggerMsg]);','if(!inflight?._tx_id||flow.get("inv"+inv+"_tx_active")?.id===inflight._tx_id)node.send([null,null,triggerMsg]);');
  add(parser,1,qid);
  // Reuse original learning algorithm and NAK fallbacks, but require genuine ACK and correlated state.
  rep(build,'let session = flow.get(sessionKey);','let session = flow.get(sessionKey);\nif(msg._learn?.sessionId&&session?.sessionId!==msg._learn.sessionId)return null;');
  build.func=build.func.replaceAll('_poll_pause_until','_pause_polling_until');
  rep(rx,'if (!session || session.active !== true) return null;','if (!session || session.active !== true) return null;\nif(session.txId&&msg._learn_session_id!==session.sessionId)return null;');
  rep(rx,'rawResp.startsWith("ACK") ||\n        msg.payload?.nak === false','rawResp.replace(/\\)$/,"").trim()==="ACK"');
  rep(rx,'if (isTimeout) {\n        session.lastAck = "TIMEOUT";',`if(isTimeout&&session.txId){
        return [null,{...buildFailMsg(session,"write_timeout_uncertain"),payload:{...buildFailMsg(session,"write_timeout_uncertain").payload,uncertain:true}}];
    }
    if (isTimeout) {
        session.lastAck = "TIMEOUT";`);
  rep(rx,'if (isTimeout) {\n        session.lastAck = "QPIRI_TIMEOUT";',`if((isTimeout||isNak)&&session.txId){
        return [null,{...buildFailMsg(session,"readback_failed"),payload:{...buildFailMsg(session,"readback_failed").payload,uncertain:true}}];
    }
    if (isTimeout) {
        session.lastAck = "QPIRI_TIMEOUT";`);
  // RX failure output originally routes through Build Candidate. Forward terminal messages without creating another SET.
  rep(build,'let session = flow.get(sessionKey);','if(msg._learn_complete===true)return [null,msg];\nlet session = flow.get(sessionKey);');
  // Native verification must be the real QPIRI response for this session; no 1.2s artificial delay.
  rep(sf,'const n = Number(v);','if(v===null||v===undefined||v==="")return null;\n    const n = Number(v);');
  rep(sf,'const ageSinceVerify = Date.now() - Number(session.verifySentAt || 0);\nif (ageSinceVerify < 1200) {\n    return null;\n}',`if(session.txId){
    if(String(msg._cmd||msg.command||"").toUpperCase()!=="QPIRI"||msg._tx_id!==session.txId||msg._learn_session_id!==session.sessionId||Number(msg._rx_ts||0)<Number(session.verifySentAt||0))return null;
    const actual=getByPath(state,session.statePath);
    if(actual===null||actual===undefined||actual===""||!Number.isFinite(Number(actual)))return null;
}`);
  // ESP firmware already performs readback. Deliver its verified result to the same learning state machine,
  // not to the stale cache. The firmware's actual semantic confirmation is the evidence.
  const espOriginal=espResult.func;
  espResult.func=marker+"\nconst result=(function(){\n"+espOriginal+"\n})();\n"+String.raw`
if(!result)return result;
const inv=Number(msg.inverterNum||1),s=flow.get("learn_session_inv"+inv);
if(!s?.active||s.sessionId!==msg._esp_learning_session)return null;
if(result[0]&&s.txId){
 const expected=s.kind==="number"?s.requestedValue:s.currentCandidate?.expectedCode;
 if(expected===null||expected===undefined||!Number.isFinite(Number(expected)))return [null,null,{inverterNum:inv,_learn_complete:true,_learn_success:false,payload:{reason:"missing_verified_value",uncertain:true}}];
 s.phase="wait_state";s.verifySentAt=Date.now();s.lastAck="ACK";s.updatedAt=Date.now();
 flow.set("learn_session_inv"+inv,s);
 flow.set("learn_pending_inv"+inv,{cmd:"QPIRI",sessionId:s.sessionId,param:s.param});
 const state={};let cursor=state;const p=s.statePath.split(".");
 for(const k of p.slice(0,-1)){cursor[k]={};cursor=cursor[k];}cursor[p[p.length-1]]=expected;
 return [null,null,null,{inverterNum:inv,_cmd:"QPIRI",_tx_id:s.txId,_learn_session_id:s.sessionId,_rx_ts:Date.now(),payload:state}];
}
for(const x of result)if(x){x._learn_session_id=s.sessionId;if(x._learn_complete&&x.payload)x.payload.uncertain=true;}
return result;
`;
  espResult.outputs=4;espResult.wires.push([sf.id]);
  // Remove deferred stale cache verification route; regular native path remains.
  verify.wires[0]=verify.wires[0].filter(x=>x!=="espfull"+i+"_verify_filter");
  rep(done,'const success = (msg._learn_success === true);','if(!session?.active)return null;\nmsg._tx_id=session.txId||null;\nconst success = (msg._learn_success === true);');
  // Discovery and parameter entities are untouched, only new generic status topic.
  for(const n of [q,ha,pre,dec,build,rx,sf,done,enq,pump,parser,espResult]){
   try{new Function(n.func)}catch(e){throw Error(n.name+": "+e.message)}
  }
 }
 must(by.size===nodes.length,"duplicate node IDs");
 return nodes;
}
module.exports=patch;
if(require.main===module){const fs=require("node:fs"),file=process.argv[2]||"/data/flows.json";const nodes=patch(JSON.parse(fs.readFileSync(file,"utf8")));const tmp=file+".tx-fifo-tmp";fs.writeFileSync(tmp,JSON.stringify(nodes)+"\n");fs.renameSync(tmp,file);console.log("TX_FIFO_V2: "+nodes.length+" nodes");}
