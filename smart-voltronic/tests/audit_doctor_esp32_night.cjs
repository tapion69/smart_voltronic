const fs=require('fs'),n=JSON.parse(fs.readFileSync('smart-voltronic/flows.json','utf8')),m=new Map(n.map(x=>[x.id,x]));console.log('NODE_COUNT',n.length);
const kw=/NIGHT|night.sleep|sleep|COMM HEALTH|DOCTOR|COMMUNICATION|ORPHAN|PARSER/i;
for(const x of n.filter(x=>kw.test(x.name||'')))console.log('NODE',JSON.stringify({id:x.id,type:x.type,name:x.name,wires:x.wires,z:x.z,topic:x.topic}));
const ids=['3ea573730416012d','7e96e2b785b1d159','638cb89fdbee6fe3','2978c86114a84875','8a05fbc3b3f6bdbc','d34cc22c5de4c537','2d7f7336b88783dc','06f687dbe6782ce8','e82d4d3650a26a34','057108fc794236af'];
for(const id of ids){const x=m.get(id);console.log('FUNCTION',id,x?.name,'LEN',x?.func?.length);if(!x?.func)continue;const l=x.func.split('\n');
let regex=/orphan|night.?sleep|night.?freeze|sleep_candidate|sleeping|night_window|low_pv|timeout|response_count|last_response_ts|last_raw_rx|inflight|command_mismatch|health\.transport|esp32|active_transport|return \{|inverterSummaryCard|diagnosticMarkdownCard|night_sleep|switchEntity|COMM HEALTH/i;
const indexes=[];for(let i=0;i<l.length;i++)if(regex.test(l[i]))indexes.push(i);
const spans=[];for(const i of indexes){if(spans.length&&i<=spans[spans.length-1][1]+2)spans[spans.length-1][1]=i+2;else spans.push([Math.max(i-2,0),Math.min(i+3,l.length)]);}
for(const [start,end] of spans)console.log('PART',id,start+1,end,l.slice(start,end).map((line,i)=>String(start+i+1).padStart(4)+' '+line).join('\n').slice(0,18000));
}
for(const x of n.filter(x=>x.type==='function'&&/orphan_response_count|night_sleep/.test(x.func||'')&&!ids.includes(x.id)))console.log('OTHER_FUNCTION',JSON.stringify({id:x.id,name:x.name,z:x.z,head:x.func?.slice(0,200)}));

const selects=[
 ['7e96e2b785b1d159',35,87],['7e96e2b785b1d159',690,1100],['7e96e2b785b1d159',1095,1280],
 ['5a8f3478dfb6b6d8',1,260],['24bf6b0e4899bf4a',1,250],
 ['d385574be7304d91',1,260],['2d7f7336b88783dc',1380,1450]
];for(const [id,a,b] of selects){console.log('---BEGIN EXTRACT',id,a,b); const x=m.get(id);console.log(x.func.split('\n').slice(a-1,b).map((s,j)=>(a+j)+': '+s).join('\n'));console.log('---END EXTRACT',id,a,b)}

const smaller=[['5a8f3478dfb6b6d8',250,560],['fa7cc4fe4fb09bd9',1,245],['7e96e2b785b1d159',90,220],['7e96e2b785b1d159',1090,1285],['2d7f7336b88783dc',1430,1590]];
for(const [id,from,to] of smaller){console.log('===MINI',id,from,to);const lines=m.get(id).func.split('\n');console.log(lines.slice(from-1,to).map((s,i)=>(from+i)+': '+s).join('\n'));console.log('===END MINI',id,from,to)}
