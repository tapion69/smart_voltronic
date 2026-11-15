"use strict";
const fs=require("fs"),cp=require("child_process"),assert=require("assert");
const addon="smart-voltronic";
const source=JSON.parse(fs.readFileSync(addon+"/flows.json","utf8"));
const raw=source.find(n=>n.id==="309c2c85e8d3a815").func;
const file="/tmp/esp-main-parse-test.json";
function runFlow(modes){
 fs.writeFileSync(file,JSON.stringify(source));
 const env={...process.env};
 for(let i=1;i<=3;i++)env["INV"+i+"_TRANSPORT"]=modes[i-1];
 cp.execFileSync("node",[addon+"/esp32_patch_flows.cjs",file,addon],{env,stdio:"pipe"});
 const a=JSON.parse(fs.readFileSync(file,"utf8"));
 assert.strictEqual(a.length,385);
 return a;
}
function runParser(a,options){
 const fn=a.find(n=>n.id==="309c2c85e8d3a815").func;
 assert(fn.includes('if (v === "esp32" || v === "disabled") return v;'));
 assert(fn.includes("ESP_BRIDGE_ACTIVE_INV_MODES"));
 const data=new Map();
 const g={get:k=>data.get(k),set:(k,v)=>data.set(k,v)};
 const node={warn(){},error(e){throw Error(String(e))},status(){}};
 const env={get:k=>k==="ADDON_TIMEZONE"?"Europe/Paris":undefined};
 const msg={payload:JSON.stringify(options)};
 let output;
 try{output=new Function("msg","node","global","env","flow","context",fn)(msg,node,g,env,g,g)}
 catch(e){throw Error("parse options failed: "+e.stack)}
 return {data,output};
}
const option={
 inv1_link:"esp32",inv1_esp_host:"192.168.1.51",inv1_esp_port:18081,
 inv2_link:"esp32",inv2_esp_host:"192.168.1.52",inv2_esp_port:18081,
 inv3_link:"disabled",
 mqtt_host:"core-mosquitto",mqtt_user:"test",mqtt_pass:"test",
 battery_system_voltage:"48V",timezone_mode:"Europe/Paris"
};
let a=runFlow(["esp32","esp32","disabled"]);
let p=runParser(a,option);
let found=[...p.data.entries()].filter(([k])=>/active|inverter|invCfg|config/.test(k));
console.log("TEST ESP1+ESP2, INV3 disabled:",JSON.stringify(found).slice(0,1600));
assert(found.some(([k,v])=>Array.isArray(v)&&v.includes(1)&&v.includes(2)&&!v.includes(3)),"active inverter list must include 1+2");
assert.equal(a.find(n=>n.id==="b1a8cd69494aac47").wires[0][0],"espfull1_learn");
assert.equal(a.find(n=>n.id==="bbd3067079b8f836").wires[0][0],"espfull2_learn");
a=runFlow(["serial","tcp","disabled"]);
p=runParser(a,{...option,inv1_link:"serial",inv1_serial_port:"/dev/ttyUSB0",inv2_link:"gateway",inv2_gateway_host:"192.168.1.12",inv2_gateway_port:8899});
found=[...p.data.entries()].filter(([k])=>/active|inverter|invCfg|config/.test(k));
console.log("TEST legacy serial+gateway:",JSON.stringify(found).slice(0,1600));
assert(found.some(([k,v])=>Array.isArray(v)&&v.includes(1)&&v.includes(2)&&!v.includes(3)),"legacy 1+2 active");
console.log("ESP32 parse options and unchanged serial/tcp compatibility PASSED");
