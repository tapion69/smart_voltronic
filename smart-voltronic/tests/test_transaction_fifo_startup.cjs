"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const nodes=JSON.parse(fs.readFileSync("smart-voltronic/flows.json")),map=new Map(nodes.map(n=>[n.id,n]));
const mqtt=["99e50980ea51a78b","0e9a9faa6a7dc537","1aa342570293ed07"],build=["b1a8cd69494aac47","bbd3067079b8f836","9288782e4d4509cf"];
const modes=["serial","tcp","esp32","disabled"];
assert.equal(map.size,nodes.length);
for(const n of nodes)if(n.type==="function")new Function(n.func);
let count=0;
for(const a of modes)for(const b of modes)for(const c of modes){
 const options={};const expected=[];
 for(const [j,mode] of [a,b,c].entries()){
  const i=j+1;options["inv"+i+"_link"]=mode;options["inv"+i+"_serial_port"]="/dev/ttyUSB"+j;options["inv"+i+"_gateway_host"]="192.168.1.2";options["inv"+i+"_gateway_port"]=8899;options["inv"+i+"_esp_host"]="192.168.1.3";options["inv"+i+"_esp_port"]=18081;if(mode!=="disabled")expected.push(i);
  assert(map.get(mqtt[j]).wires[0].includes("espqueue"+i+"_control"));assert.equal(map.get(mqtt[j]).qos,"1");
  assert.deepEqual(map.get(build[j]).wires[2],["espfull"+i+"_learn"]);
 }
 const data=new Map(),g={get:k=>data.get(k),set:(k,v)=>data.set(k,v)},node={warn(){},error(e){throw Error(String(e))},status(){}};
 new Function("msg","node","global","env","flow","context",map.get("309c2c85e8d3a815").func)({payload:JSON.stringify(options)},node,g,{get:()=>undefined},g,g);
 assert([...data.values()].some(v=>Array.isArray(v)&&JSON.stringify(v)===JSON.stringify(expected)),"active slots "+[a,b,c]);
 count++;
}
console.log("PASS "+count+" canonical configuration combinations");
