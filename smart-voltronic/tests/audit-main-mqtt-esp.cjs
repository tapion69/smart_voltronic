const fs=require('fs');const a=JSON.parse(fs.readFileSync('smart-voltronic/flows.json'));const map=new Map(a.map(n=>[n.id,n]));const bridge=JSON.parse(fs.readFileSync('smart-voltronic/esp32_bridge_nodes.json'));const next=JSON.parse(fs.readFileSync('smart-voltronic/esp32_learning_nodes.json'));const show=n=>({id:n.id,type:n.type,name:n.name,topic:n.topic,broker:n.broker,wires:n.wires,status:n.status,funcHead:n.func?.slice(0,600)});
console.log('MAIN BASE sha unchanged full 322 nodes',a.length);
console.log('MQTT BROKERS',JSON.stringify(a.filter(n=>n.type==='mqtt-broker').map(show)));
console.log('BRIDGE BROKERS',JSON.stringify(bridge.filter(n=>n.type==='mqtt out').map(show)));
console.log('MAIN serial parser',JSON.stringify(['06f687dbe6782ce8','e82d4d3650a26a34','057108fc794236af'].map(id=>show(map.get(id)))));
console.log('MAIN state normalize',JSON.stringify(a.filter(n=>/normalize state|mqtt discovery|HA discovery|MQTT out|Publish/i.test(n.name||'')).map(show)).slice(0,13000));
console.log('MQTT UNIQUE IDS',JSON.stringify(a.filter(n=>n.type==='function'&&/unique_id|uniqueId|uniqueID/.test(n.func||'')).map(n=>({id:n.id,name:n.name,unique:(n.func.match(/unique_id[^\n]{0,110}/g)||[]).slice(0,5)}))).slice(0,12000));
for(const i of [1,2,3]){const id='espfull'+i+'_replay';const n=bridge.find(x=>x.id===id);console.log('REPLAY',i,JSON.stringify(show(n)));const parser=map.get(n.wires[0][0]);console.log('PARSER TARGET',i,JSON.stringify(show(parser)));console.log('PARSER_HEAD',i,parser.func?.slice(0,3200));}
for(const id of ['0afb3d6df9f843dd','4122a58795a420a8','277e4fdf74343135']){const n=map.get(id);console.log('CONFIG NODE',JSON.stringify(show(n)));}

for(const id of ['06f687dbe6782ce8','e82d4d3650a26a34','057108fc794236af']){
 const n=map.get(id),l=n.func.split('\n');let out=[];
 for(let i=0;i<l.length;i++)if(/inflight|command|msg\.payload|return null|response|parsed|crc|CRC|rxbuf/.test(l[i]))out.push((i+1)+': '+l[i]);
 console.log('PARSER_LOGIC',id,out.join(' | ').slice(0,13000));
}
for(const id of ['6610714dd2585f9b','cc84c35690619c8c']){
 const n=map.get(id),l=n.func.split('\n');console.log('NORMALIZE_LOGIC',id,l.slice(0,95).join('\n').slice(0,8000));
}

for(const id of ['06f687dbe6782ce8','e82d4d3650a26a34']){
 const n=map.get(id),l=n.func.split('\n');
 for(const [a,b] of [[600,645],[890,958]])console.log('PARSER_SECTION',id,a,b,l.slice(a-1,b).map((x,i)=>(a+i)+':'+x).join(' | '));
}
