const a=require('../flows.json'),m=new Map(a.map(x=>[x.id,x]));
const ids=['4106254e7828ed3b','384929d824e573d3','9d441aa9cbe276c5','2d7f7336b88783dc','espqueue1_control','espqueue2_control','espqueue3_control'];
for(const id of ids){const n=m.get(id);console.log('AUDIT',id,'name',n?.name,'type',n?.type,'funcsize',n?.func?.length); if(!n?.func)continue;const l=n.func.split('\n');if(id.includes('espqueue')){let i=l.findIndex(x=>x.includes('const device='));console.log('QUEUE_DISC',id,l.slice(i-8,i+35).join('\n'));continue}
if(id==='2d7f7336b88783dc'){
for(const needle of ['function inverterSummaryCard','### ESP32','Diagnostic réseau indépendant','esp_network_outages','function build','function inverter','type:"markdown"','type: "markdown"','_esp_queue']){
 const found=[];l.forEach((x,i)=>{if(x.includes(needle))found.push(i)});console.log('DOCTOR_MATCH',needle,found.slice(0,30));for(const i of found.slice(0,3))console.log('DOCTOR_REGION',i,l.slice(Math.max(0,i-12),i+56).map((x,j)=>String(Math.max(0,i-12)+j+1)+': '+x).join('\n').slice(0,10000))}
}else{
for(const needle of ['identifiers:','identifiers','device:','device =','unique_id','MQTT DISCOVERY','device_id','config.mqtt','deviceIdentifier']){
 const loc=[];l.forEach((x,i)=>{if(x.includes(needle))loc.push(i)});console.log('DISC_MATCH',id,needle,loc.slice(0,16));for(const i of loc.slice(0,3))console.log('DISC_REGION',id,l.slice(Math.max(0,i-5),i+15).join('\n').slice(0,3700))}
}}

const d=m.get('2d7f7336b88783dc').func,l=d.split('\n');
for(const needle of ['inverterSummaryCard(', 'const e =','const e=','render_template','markdown','esp_queue','esp_uart_tx_commands', 'Communication ESP32']){
 let hits=[];for(let i=0;i<l.length;i++)if(l[i].includes(needle))hits.push(i);
 console.log('DOC_STRUCT',needle,hits);for(const i of hits.slice(-8))console.log('DOC_EXTRACT',i,l.slice(Math.max(0,i-10),i+30).join('\n').slice(0,5000));
}
for(const id of ['2978c86114a84875','8a05fbc3b3f6bdbc','d34cc22c5de4c537']){const f=m.get(id).func;let l=f.split('\n');for(let i=0;i<l.length;i++)if(/ESP_NETWORK_MQTT_FIELDS|payload\[key\]|msg.payload = JSON.stringify|health.transport/.test(l[i]))console.log('HEALTHPUB',id,i,l.slice(Math.max(0,i-5),i+18).join('\n').slice(0,2600))}
