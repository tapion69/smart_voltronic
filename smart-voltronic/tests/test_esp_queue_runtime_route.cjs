"use strict";
const assert=require("node:assert/strict"),fs=require("fs"),cp=require("child_process");
const original=JSON.parse(fs.readFileSync("smart-voltronic/flows.json"));
assert.equal(original.length,385);
const id=["99e50980ea51a78b","0e9a9faa6a7dc537","1aa342570293ed07"];
const direct=["381cb2e10d9b5625","46ca504f4729209c","03e8bd2641c96986"];
const run=(modes)=>{
 const file="/tmp/smart-esp-queue-transport-"+modes.join("-")+".json";
 fs.writeFileSync(file,JSON.stringify(original));
 const env={...process.env,...Object.fromEntries(modes.map((m,j)=>["INV"+(j+1)+"_TRANSPORT",m]))};
 cp.execFileSync("node",["smart-voltronic/esp32_patch_flows.cjs",file,"smart-voltronic"],{env});
 const nodes=JSON.parse(fs.readFileSync(file)),map=new Map(nodes.map(n=>[n.id,n]));
 assert.equal(nodes.length,385);
 for(let i=0;i<3;i++){
  const arr=map.get(id[i]).wires[0];
  const target=modes[i]==="esp32"?"espqueue"+(i+1)+"_control":direct[i];
  assert.equal(arr[0],target,"HA SET first output INV"+(i+1));
  assert.equal(arr.filter(x=>x===target).length,1,"single HA SET destination");
  assert.equal(arr.length,2,"original extra MQTT listener preserved");
  const q=map.get("espqueue"+(i+1)+"_control");
  assert.deepEqual(q.wires[0],[direct[i]],"ESP queue may only release via original SET");
 }
 // The parser identity and existing HA discovery functions must remain stable.
 for(const key of ["4106254e7828ed3b","384929d824e573d3","9d441aa9cbe276c5"]){
  assert.equal(map.get(key).func,original.find(n=>n.id===key).func);
 }
 // Re-run startup patch to check idempotent routing.
 cp.execFileSync("node",["smart-voltronic/esp32_patch_flows.cjs",file,"smart-voltronic"],{env});
 const reread=JSON.parse(fs.readFileSync(file));
 for(let i=0;i<3;i++)assert.deepEqual(reread.find(n=>n.id===id[i]).wires[0],map.get(id[i]).wires[0]);
 console.log("PASS modes "+modes.join(",")+"; routes "+modes.map((m,i)=>m==="esp32"?"queue "+(i+1):"original "+(i+1)).join("; "));
};
run(["esp32","esp32","disabled"]);
run(["serial","tcp","disabled"]);
run(["tcp","esp32","serial"]);
