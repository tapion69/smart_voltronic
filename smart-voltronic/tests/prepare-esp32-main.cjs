"use strict";
const fs=require("fs"),cp=require("child_process"),path=require("path");
function refFile(p){return cp.execFileSync("git",["show","origin/dev/esp32-s3-full-live-test:"+p],{maxBuffer:16000000,encoding:"utf8"})}
const src=JSON.parse(refFile("smart-voltronic/flows.json"));
const base=JSON.parse(fs.readFileSync("smart-voltronic/flows.json","utf8"));
const ids=new Set(base.map(n=>n.id));
const bridge=src.filter(n=>/^espfull[1-3]_/.test(n.id));
const learn=JSON.parse(refFile("smart-voltronic/esp32_learning_nodes.json"));
if(src.length!==340||base.length!==322||bridge.length!==18||learn.length!==15)throw Error("Unexpected flow size / ESP node extraction: "+[src.length,base.length,bridge.length,learn.length]);
for(const n of [...bridge,...learn]){if(ids.has(n.id))throw Error("ESP bridge collides with main flow: "+n.id)}
const groups=new Map();for(const n of [...bridge,...learn]){const i=Number(n.id.match(/^espfull([123])_/)[1]);groups.set(i,(groups.get(i)||0)+1)}
for(let i=1;i<=3;i++)if(groups.get(i)!==11)throw Error("Wrong ESP bridge nodes per inverter "+i+":"+groups.get(i));
fs.writeFileSync("smart-voltronic/esp32_bridge_nodes.json",JSON.stringify(bridge,null,2)+"\n");
fs.writeFileSync("smart-voltronic/esp32_learning_nodes.json",JSON.stringify(learn,null,2)+"\n");
console.log("Snapshot bridge",bridge.length,"learning",learn.length,"main retained",base.length);
console.log("Bridge IDs",bridge.map(n=>n.id+" "+n.type+" "+n.name).join(" | "));
