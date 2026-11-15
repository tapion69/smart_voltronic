import json
from pathlib import Path
p=Path("smart-voltronic/flows.json")
a=json.loads(p.read_text());assert len(a)==385,len(a)
m={x["id"]:x for x in a};assert len(m)==385
orig={i:m[i]["func"] for i in ["4106254e7828ed3b","384929d824e573d3","9d441aa9cbe276c5"]}
for n in (1,2,3):
 i=str(n)
 q=m["espqueue"+i+"_control"]
 old='const device={identifiers:["smart_voltronic_esp_inv"+INV],name:"Voltronic ESP"+INV,\n  manufacturer:"Smart Voltronic",model:"ESP32-S3 RS232 bridge"};'
 new='const device={identifiers:["voltronic_inv_"+INV],name:"Voltronic Inverter "+INV,\n  manufacturer:"Voltronic",model:"Axpert/Voltronic"};'
 assert old in q["func"] or new in q["func"]
 q["func"]=q["func"].replace(old,new)
 q["func"]=q["func"].replace('unique_id:"smart_voltronic_inv"+INV+"_esp_queue_state_v1",','unique_id:"smart_voltronic_inv"+INV+"_esp_queue_state_v1",\n  default_entity_id:"sensor.voltronic_inv"+INV+"_esp_queue_state",')
 q["func"]=q["func"].replace('unique_id:"smart_voltronic_inv"+INV+"_esp_queue_purge_v1",','unique_id:"smart_voltronic_inv"+INV+"_esp_queue_purge_v1",\n  default_entity_id:"button.voltronic_inv"+INV+"_esp_queue_purge",')
 pub=m[["2978c86114a84875","8a05fbc3b3f6bdbc","d34cc22c5de4c537"][n-1]]
 needle='// ESP_DOCTOR_MQTT_'+i+': preserve topic and existing entity unique IDs.'
 assert needle in pub["func"]
 extra="""
// ESP_QUEUE_EXISTING_COMM_HEALTH_{n}
// Reuse existing communication_health entity; no extra MQTT device.
if(String(health.transport||"").toLowerCase()==="esp32"){{
 const queue=global.get("espqueue_inv{n}_v1")||{{}};
 const entries=Array.isArray(queue.items)?queue.items:[];
 const count=entries.length;
 payload.esp_queue_state=count===0?"Vide":count>=5?"Pleine":"Attente";
 payload.esp_queue_count=count;payload.esp_queue_limit=5;
 payload.esp_queue_parameters=entries.map(x=>String(x.param||"")).slice(0,5);
 payload.esp_queue_oldest_age_s=count?Math.max(0,Math.floor(
 (Date.now()-Math.min(...entries.map(x=>Number(x.added)||Date.now())))/1000)):null;
 payload.esp_queue_inflight=String(queue.inflight?.param||"");
 for(const k of ["confirmed","expired","rejected","purged","uncertain"])
  payload["esp_queue_"+k]=Number(queue[k]||0);
 payload.esp_queue_last_result=String(queue.last_result||"");
 payload.esp_queue_last_error=String(queue.last_error||"");
}}
""".format(n=i)
 if "ESP_QUEUE_EXISTING_COMM_HEALTH_"+i not in pub["func"]:
  pub["func"]=pub["func"].replace(needle,extra+'\n'+needle,1)
d=m["2d7f7336b88783dc"]
s=d["func"]
if "ESP_QUEUE_DOCTOR_CARD_V1" not in s:
 needle="| Réussite des modifications confirmées |"
 pos=s.index(needle);end=s.index("\n",pos)
 addition="""
| **File d'attente ESP32** | **{{ state_attr('ENTITY','esp_queue_state') or 'Vide' }}** |
| Paramètres en attente | {{ state_attr('ENTITY','esp_queue_count') or 0 }} / 5 |
| Paramètres | {{ (state_attr('ENTITY','esp_queue_parameters') or []) | join(', ') if state_attr('ENTITY','esp_queue_parameters') else '--' }} |
| Opération en cours | {{ state_attr('ENTITY','esp_queue_inflight') or '--' }} |
| Plus ancienne consigne | {{ ((state_attr('ENTITY','esp_queue_oldest_age_s')|int(0)) ~ ' s') if state_attr('ENTITY','esp_queue_oldest_age_s') is not none else '--' }} |
| Commandes confirmées | {{ state_attr('ENTITY','esp_queue_confirmed') or 0 }} |
| Commandes expirées | {{ state_attr('ENTITY','esp_queue_expired') or 0 }} |
| Commandes refusées | {{ state_attr('ENTITY','esp_queue_rejected') or 0 }} |
| Commandes purgées | {{ state_attr('ENTITY','esp_queue_purged') or 0 }} |
| Résultats incertains | {{ state_attr('ENTITY','esp_queue_uncertain') or 0 }} |
| Dernier résultat | {{ state_attr('ENTITY','esp_queue_last_result') or '--' }} |
| Dernière erreur | {{ state_attr('ENTITY','esp_queue_last_error') or '--' }} |"""
 s=s[:end]+addition+s[end:]
 old=''' {type:"markdown",content:txt}
]};'''
 new=''' {type:"markdown",content:txt},
 // ESP_QUEUE_DOCTOR_CARD_V1: use MQTT purge command, no auto-generated HA entity_id.
 {type:"button",name:"Purger la file ESP"+inv,icon:"mdi:playlist-remove",
  show_state:false,tap_action:{action:"perform-action",perform_action:"mqtt.publish",
   data:{topic:"voltronic/"+inv+"/esp_queue/purge/set",payload:"PURGE"}}}
]};'''
 assert old in s
 s=s.replace(old,new,1)
 old='''### ESP32 · Diagnostic réseau indépendant
*Les compteurs Wi-Fi et RS232'''
 assert old in s
 s=s.replace(old,'''


### ESP32 · Diagnostic réseau indépendant

*Les compteurs Wi-Fi et RS232''',1)
 old="""| HTTP cache | {{ 'OK' if a(e, 'esp_http_ok') == true else 'Indisponible' }} |"""
 assert old in s
 s=s.replace(old,"""#### État du cache et des échanges

| Diagnostic | Valeur |
|:--|--:|
| HTTP cache | {{ 'OK' if a(e, 'esp_http_ok') == true else 'Indisponible' }} |""",1)
 needle="{% else %}\n### 🔌 "+chr(36)+"{t.serial_transport}"
 assert needle in s
 block="""

### File d'attente ESP32 (60 min / 5 paramètres)

| Paramètre | Valeur |
|:--|--:|
| État | {{ a(e, 'esp_queue_state') or 'Vide' }} |
| Nombre en attente | {{ a(e, 'esp_queue_count') or 0 }} / 5 |
| Paramètres | {{ (a(e, 'esp_queue_parameters') or []) | join(', ') if a(e, 'esp_queue_parameters') else '--' }} |
| Commande en cours | {{ a(e, 'esp_queue_inflight') or '--' }} |
| Commandes confirmées | {{ a(e, 'esp_queue_confirmed') or 0 }} |
| Commandes expirées | {{ a(e, 'esp_queue_expired') or 0 }} |
| Commandes refusées | {{ a(e, 'esp_queue_rejected') or 0 }} |
| Commandes purgées | {{ a(e, 'esp_queue_purged') or 0 }} |
| Écritures incertaines | {{ a(e, 'esp_queue_uncertain') or 0 }} |
| Dernière erreur | {{ a(e, 'esp_queue_last_error') or '--' }} |

"""
 s=s.replace(needle,block+needle,1)
 d["func"]=s
for id,src in orig.items():assert m[id]["func"]==src
p.write_text(json.dumps(a,ensure_ascii=False,separators=(",",":"))+"\n")
print("PASS: shared MQTT Voltronic device, stable unique IDs, Doctor queue and purge, complete diagnostic tables")
