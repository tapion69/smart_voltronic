const fs=require('fs');
const a=JSON.parse(fs.readFileSync('smart-voltronic/flows.json','utf8'));
const extra=JSON.parse(fs.readFileSync('smart-voltronic/esp32_learning_nodes.json','utf8'));
const all=[...a,...extra], map=new Map(all.map(n=>[n.id,n]));
function summary(n){return {id:n.id,type:n.type,name:n.name,topic:n.topic,disabled:n.d,wires:n.wires?.map(w=>w.map(id=>map.get(id)?.name||id))};}
console.log("FLOW",a.length,extra.length);
const roots=all.filter(n=>n.type==='mqtt in'||(/Learning - Preprocess|Learning - Decision|Learning - Build Candidate|Learning - RX Feedback|ESP1 verified learning request|QUEUE|Pump|HA Number|HA Select/i.test(n.name||'')));
for(const n of roots){console.log(JSON.stringify(summary(n)));if(/Learning - Preprocess|Learning - Decision|Learning - Build Candidate/i.test(n.name||''))console.log('SCRIPT',n.func?.slice(0,3400));}
console.log('MQTT_IN',a.filter(n=>n.type==='mqtt in').length);
for(const n of all.filter(n=>/bulk|float|charge current|charge voltage/i.test(n.name||'')))console.log('MATCH',JSON.stringify(summary(n)));
