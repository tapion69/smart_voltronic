"use strict";
const fs=require("node:fs"),os=require("node:os"),path=require("node:path"),cp=require("node:child_process"),assert=require("node:assert/strict");
const addon=path.resolve("smart-voltronic"),dir=fs.mkdtempSync(path.join(os.tmpdir(),"voltronic-fifo-"));
const flow=path.join(dir,"flows.json"),original=fs.readFileSync(path.join(addon,"flows.json"));
const mqtt=["99e50980ea51a78b","0e9a9faa6a7dc537","1aa342570293ed07"];
const modes=["serial","tcp","esp32","disabled"];
let count=0;
try{
 for(const a of modes)for(const b of modes)for(const c of modes){
  const env={...process.env,INV1_TRANSPORT:a,INV2_TRANSPORT:b,INV3_TRANSPORT:c};
  fs.writeFileSync(flow,original);
  const start=()=>{for(const file of ["esp32_patch_flows.cjs","esp32_write_priority_patch.cjs","transaction_fifo_patch.cjs"])cp.execFileSync(process.execPath,[path.join(addon,file),flow,addon],{env,stdio:"pipe"});return fs.readFileSync(flow,"utf8");};
  const first=start(),second=start();assert.equal(first,second,"restart must be idempotent: "+[a,b,c]);
  const nodes=JSON.parse(second),map=new Map(nodes.map(x=>[x.id,x]));
  for(let i=1;i<=3;i++){assert(map.get(mqtt[i-1]).wires[0].includes("espqueue"+i+"_control"));assert.equal(map.get(mqtt[i-1]).qos,"1");}
  for(const n of nodes)if(n.type==="function")new Function(n.func);
  count++;
 }
 console.log("PASS "+count+" startup configurations / repeat boots");
}finally{fs.rmSync(dir,{recursive:true,force:true});}
