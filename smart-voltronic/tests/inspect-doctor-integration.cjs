const fs=require('fs'),a=JSON.parse(fs.readFileSync('smart-voltronic/flows.json')),byId=new Map(a.map(n=>[n.id,n]));const re=/doctor|diagnos|communication|comm health|watchdog/i;console.log('BASE_COUNT',a.length);for(const n of a.filter(n=>re.test(n.name||'')||re.test(n.func||''))){const hit=re.test(n.name||'')?'NAME':'FUNC';console.log('DOCTOR',JSON.stringify({hit,id:n.id,z:n.z,type:n.type,name:n.name,wires:n.wires,funcHead:n.func?.slice(0,260),funcLength:n.func?.length}));}
const refs=['b841e65580803812','3e21c5c2226d40ab','99f7bc7173ead525','309c2c85e8d3a815'];for(const id of refs){const n=byId.get(id);console.log('TRANSPORT',id,n?.name,n?.func?.slice(0,9000));}

for(const id of ['3ea573730416012d','7e96e2b785b1d159','2978c86114a84875','2d7f7336b88783dc','5de2855b326d27b7']){
 const n=byId.get(id),lines=n.func.split('\n');const hits=[];
 for(let x=0;x<lines.length;x++)if(/transport|inflight|queue|last_rx|last_tx|mode|health|monitor|link|esp32|serial|tcp|received|timeout|error|COMM HEALTH|global\.get|flow\.get/.test(lines[x]))hits.push((x+1)+':'+lines[x].slice(0,200));
 console.log('DOCTOR_LOGIC',n.name,id,hits.join(' | ').slice(0,13000));
}
for(const id of ['2d7f7336b88783dc','3ea573730416012d']){
 const n=byId.get(id);console.log('DOCTOR_SECTION',id,n.func.slice(0,12000));
}

for(const id of ['3ea573730416012d','2978c86114a84875','2d7f7336b88783dc']){
 const n=byId.get(id),a=n.func.split('\n');
 for(const [lo,hi] of (id==='3ea573730416012d'?[[1,55],[295,332],[1220,1475]]:id==='2978c86114a84875'?[[1,110],[1410,1510]]:[[1,95],[1400,1585],[1625,1730]])){
 console.log('SECTION',id,lo,hi,a.slice(lo-1,hi).map((x,j)=>(lo+j)+':'+x).join(' | ').slice(0,21500));
 }
}
