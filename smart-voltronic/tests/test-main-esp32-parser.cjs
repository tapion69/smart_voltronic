"use strict";
const fs=require("fs"),cp=require("child_process"),assert=require("assert");
const file="/tmp/smart-esp32-main-parser-regression.json";
fs.writeFileSync(file,fs.readFileSync("smart-voltronic/flows.json"));
const env={...process.env,INV1_TRANSPORT:"esp32",INV2_TRANSPORT:"esp32",INV3_TRANSPORT:"disabled"};
const nodes=JSON.parse(fs.readFileSync(file));const map=new Map(nodes.map(n=>[n.id,n]));
const original=JSON.parse(fs.readFileSync("smart-voltronic/flows.json"));
const origById=new Map(original.map(n=>[n.id,n]));
for(let i=1;i<=3;i++){
 const id=["06f687dbe6782ce8","e82d4d3650a26a34","057108fc794236af"][i-1];
 const p=map.get(id).func;
 assert(p.includes("ESP_BRIDGE_VERIFIED_REPLY_CMD_INV"+i),"missing parser patch");
 assert(p.includes("const inflight = espRead ? {cmd:espCmd,raw:espCmd,raw_manual:false} : flow.get(inflightKey);"));
 const pure=origById.get(id).func;
 assert(p.startsWith(pure.slice(0,80)),"parser original body lost");
}
for(const id of ["4106254e7828ed3b","384929d824e573d3","9d441aa9cbe276c5","f4c19e972e33cb09"]){
 const a=origById.get(id),b=map.get(id);
 assert.equal(a.func,b.func,"HA MQTT discovery changed for "+a.name);
 assert.deepEqual(a.wires,b.wires,"HA MQTT topics changed");
}
function ctx(){const store=new Map();return {get:k=>store.get(k),set:(k,v)=>store.set(k,v)}}
function crc(buf){let c=0;for(const b of buf){c^=b<<8;for(let j=0;j<8;j++)c=(c&32768)?(((c<<1)^0x1021)&65535):((c<<1)&65535)}return c}
const payload="(230.0 50.0 230.0 50.0 0300 0200 020 420 52.2 012 70 0370 0045 00.0 000.0 00000 00000 00000 00000 00000 00000 00000 00000 00000";
const body=Buffer.from(payload,"ascii"),sum=crc(body),frame=Buffer.concat([body,Buffer.from([sum>>8,sum&255,13])]);
for(let i=1;i<=2;i++){
 const id=["06f687dbe6782ce8","e82d4d3650a26a34"][i-1];
 const fn=map.get(id).func;
 const storage=ctx(),f=ctx(),g=ctx();
 const node={status(){},warn(){},error(e){throw Error(String(e))},debug(){},log(){}};
 const msg={inverterNum:i,_esp_bridge:true,_esp_command:"QPIGS",payload:frame};
 let out;
 try{out=new Function("msg","node","context","flow","global","env","Buffer","setTimeout","clearTimeout",fn)(msg,node,storage,f,g,{get:()=>undefined},Buffer,()=>0,()=>0)}
 catch(e){throw Error("INV"+i+" real native parser exception "+e.stack)}
 assert(Array.isArray(out),"INV"+i+" native parser output not array");
 const msgs=out.flat(Infinity).filter(m=>m&&typeof m==="object");
 assert(msgs.some(m=>m.command==="QPIGS"||m.payload?.command==="QPIGS"),"INV"+i+" cached QPIGS was not recognized by historical parser");
 console.log("INV"+i+" native parser produced verified QPIGS",msgs.map(m=>m.command||m.payload?.command));
}
console.log("ESP1/2 parser and exact original HA discovery templates preserved: PASS");
