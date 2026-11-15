#!/usr/bin/env python3
"""ESP32 Voltronic Doctor diagnostics, source-of-truth canonical flows.json.

- Authenticated, read-only /api/v1/diagnostics every 30s per enabled ESP.
- Existing 2s /bridge/snapshot remains the sole telemetry bridge.
- The ESP alone owns RS232 polling; no new inverter commands.
- Distinguish HTTP reachability from an RS232-unavailable cache.
- Preserve HA MQTT topics/unique IDs, serial/gateway routes, night freeze.
"""
import copy
import json
from pathlib import Path

p=Path("smart-voltronic/flows.json")
nodes=json.loads(p.read_text())
assert len(nodes) in (355,370,373), ("Unexpected canonical flow count",len(nodes))
by={n["id"]:n for n in nodes}
assert len(by)==len(nodes)
discovery={
 id:(by[id]["func"],by[id]["wires"])
 for id in ["4106254e7828ed3b","384929d824e573d3","9d441aa9cbe276c5"]
}
monitor_ids=["3ea573730416012d","7e96e2b785b1d159","638cb89fdbee6fe3"]
publish_ids=["2978c86114a84875","8a05fbc3b3f6bdbc","d34cc22c5de4c537"]

for inv in (1,2,3):
    tag=str(inv)
    # A separate, slow diagnostics read prevents competing with normal HA
    # snapshot telemetry. Node IDs intentionally stable and versioned.
    ids=["espnet"+tag+"_"+k for k in ["tick","builder","http","collect","catch"]]
    if ids[0] not in by:
        tick=copy.deepcopy(by["espfull"+tag+"_tick"])
        tick.update(id=ids[0],name="ESP"+tag+" network/RS232 diagnostics 30s",
           repeat="30",once=True,onceDelay="9",wires=[[ids[1]]],x=180,y=960+inv*180)
        builder=copy.deepcopy(by["espfull"+tag+"_builder"])
        builder.update(id=ids[1],name="ESP"+tag+" authenticated diagnostics GET",x=390,y=960+inv*180,wires=[[ids[2]]])
        builder["func"]=by["espfull"+tag+"_builder"]["func"].replace("/api/v1/bridge/snapshot","/api/v1/diagnostics")
        http=copy.deepcopy(by["espfull"+tag+"_http"])
        http.update(id=ids[2],name="ESP"+tag+" read-only diagnostics HTTP",wires=[[ids[3]]],x=600,y=960+inv*180)
        collect=dict(id=ids[3],type="function",z=tick["z"],name="ESP"+tag+" WiFi + UART diagnostics",
           func="",outputs=1,noerr=0,initialize="",finalize="",libs=[],wires=[[]],x=830,y=960+inv*180)
        catch=dict(id=ids[4],type="catch",z=tick["z"],name="ESP"+tag+" HTTP diagnostics error catcher",
          scope=[ids[2]],uncaught=False,wires=[[ids[3]]],x=585,y=1000+inv*180)
        nodes.extend([tick,builder,http,collect,catch])
        for n in [tick,builder,http,collect,catch]:
            assert n["id"] not in by
            by[n["id"]]=n

    collect=by[ids[3]]
    collect["func"]=r'''
const inv=__I__;
if(String(env.get("INV"+inv+"_TRANSPORT")||"").toLowerCase()!=="esp32")return null;
const now=Date.now(),key="inv"+inv+"_esp_network";
const old=global.get(key)||{},v=msg.payload;
const d=(typeof v==="string")?(()=>{try{return JSON.parse(v)}catch(e){return null}})():v;
const ok=!msg.error&&Number(msg.statusCode)===200&&d&&typeof d==="object"
 && d.source==="voltronic-diagnostics-read-only"
 && Number.isFinite(Number(d.uptime_ms))
 && Number.isFinite(Number(d.wifi_disconnect_count))
 && Number.isFinite(Number(d.tx_commands));
const out={...old};
out.last_attempt_ts=now;
if(!ok){
 out.diag_failures=Number(out.diag_failures||0)+1;
 out.last_error=(msg.error?"HTTP_NETWORK_ERROR":
   (Number(msg.statusCode)===401?"UNAUTHORIZED":
    "INVALID_DIAGNOSTICS_OR_HTTP_"+String(msg.statusCode||"NO_STATUS")));
 out.diag_reachable=false;
 global.set(key,out);
 return null;
}
const uptime=Number(d.uptime_ms),prev=Number(out.last_uptime_ms||0);
const reboot=!!out.last_ok_ts&&uptime<prev;
if(reboot)out.firmware_restarts_observed=Number(out.firmware_restarts_observed||0)+1;
out.last_uptime_ms=uptime;
out.last_ok_ts=now;
out.diag_reachable=true;out.last_error="";
out.diag_successes=Number(out.diag_successes||0)+1;
out.wifi_connected=d.wifi_connected===true?true:d.wifi_connected===false?false:null;
out.wifi_rssi_dbm=(d.wifi_rssi_dbm!==undefined&&Number.isFinite(Number(d.wifi_rssi_dbm)))
  ?Number(d.wifi_rssi_dbm):null;
const disconnect=Number(d.wifi_disconnect_count),attempts=Number(d.wifi_connect_attempts);
const gotip=Number(d.wifi_got_ip_count);
const before=Number(out.wifi_disconnect_count_boot||0);
if(out.last_ok_before&&disconnect>before&&!reboot)
 out.wifi_disconnect_events_observed=Number(out.wifi_disconnect_events_observed||0)+(disconnect-before);
out.wifi_disconnect_count_boot=disconnect;
out.wifi_connect_attempts_boot=Number.isFinite(attempts)?attempts:null;
out.wifi_got_ip_count_boot=Number.isFinite(gotip)?gotip:null;
out.wifi_last_disconnect_reason=Number(d.wifi_last_disconnect_reason)||0;
out.last_ok_before=true;
for(const [field,source] of Object.entries({
 uart_tx_commands:"tx_commands",uart_rx_frames:"rx_frames",uart_polls_ok:"polls_ok",
 uart_timeouts:"timeouts",uart_no_rx_timeouts:"no_rx_timeouts",
 uart_crc_rejects:"crc_rejects",uart_partial_frames:"partial_frames",
 uart_malformed_frames:"malformed_frames",uart_naks:"naks",
 uart_parse_rejects:"parse_rejects",uart_last_good_age_ms:"last_good_age_ms",
 http_send_failures_firmware:"http_send_failures"
})){
 const val=d[source];
 out[field]=(val!==undefined&&val!==null&&Number.isFinite(Number(val))&&Number(val)>=0)?Number(val):null;
}
global.set(key,out);
node.status({fill:"green",shape:"dot",text:"ESP"+inv+" WiFi "+(out.wifi_rssi_dbm===null?"RSSI --":out.wifi_rssi_dbm+" dBm")+" | RS232 "+(out.uart_timeouts===null?"--":out.uart_timeouts)+" timeouts"});
return null;
'''.replace("__I__",tag)

    snapcatch_id="espnet"+tag+"_snapshot_catch"
    if snapcatch_id not in by:
        catch=dict(id=snapcatch_id,type="catch",z=by["espfull"+tag+"_tick"]["z"],
            name="ESP"+tag+" snapshot HTTP timeout catcher",
            scope=["espfull"+tag+"_http"],uncaught=False,
            wires=[["espfull"+tag+"_replay"]],x=570,y=1030+inv*180)
        nodes.append(catch)
        by[catch["id"]]=catch

    replay=by["espfull"+tag+"_replay"]
    code=replay["func"]
    marker="// ESP_NETWORK_REACHABILITY_TRACKER_"+tag
    if marker not in code:
        # Reuse the verified snapshot itself for HTTP reachability. An HTTP 200
        # with available=false means the inverter/cache is stale, not Wi-Fi down.
        # No response data or raw secrets are logged.
        hook=r'''
// ESP_NETWORK_REACHABILITY_TRACKER___I__
const netKey="inv"+inv+"_esp_network",net=global.get(netKey)||{},ts=Date.now();
let decoded=msg.payload;
if(typeof decoded==="string"){try{decoded=JSON.parse(decoded)}catch(e){decoded=null;}}
const httpValid=!msg.error&&Number(msg.statusCode)===200&&decoded&&
 decoded.cache_only===true&&Array.isArray(decoded.replies);
const wasDown=net.snapshot_down===true;
if(httpValid){
 net.snapshot_successes=Number(net.snapshot_successes||0)+1;
 net.last_snapshot_ok_ts=ts;
 if(wasDown){
  const ms=net.snapshot_outage_started_ts>0?Math.max(0,ts-net.snapshot_outage_started_ts):0;
  net.last_outage_duration_s=Math.round(ms/1000);
  net.longest_outage_duration_s=Math.max(Number(net.longest_outage_duration_s||0),net.last_outage_duration_s);
  net.last_restored_ts=ts;
  net.snapshot_outage_started_ts=0;
 }
 net.snapshot_down=false;
 if(decoded.available===false)net.cache_unavailable_count=Number(net.cache_unavailable_count||0)+1;
}else{
 net.snapshot_failures=Number(net.snapshot_failures||0)+1;
 net.last_snapshot_failure_ts=ts;
 if(!wasDown){
  net.snapshot_outage_started_ts=ts;
  net.snapshot_outages=Number(net.snapshot_outages||0)+1;
 }
 net.snapshot_down=true;
}
global.set(netKey,net);
'''.replace("__I__",tag)
        assert 'const inv='+tag+';' in code
        code=code.replace('const inv='+tag+';','const inv='+tag+';\n'+hook,1)
        replay["func"]=code

    monitor=by[monitor_ids[inv-1]]
    code=monitor["func"]
    marker="// ESP_NETWORK_DOCTOR_MERGE_"+tag
    if marker not in code:
        hook=r'''
// ESP_NETWORK_DOCTOR_MERGE___I__
// Wi-Fi/RS232 counters come from a separate 30-second diagnostics GET.
// A stale diagnostics sample is UNKNOWN, never Wi-Fi=connected or lost.
const net=global.get("inv"+inv+"_esp_network")||{};
const netAge=Number(net.last_ok_ts)>0?Math.max(0,Date.now()-net.last_ok_ts):null;
const diagFresh=netAge!==null&&netAge<=90000;
health.esp_net_diag_fresh=diagFresh;
health.esp_net_diag_age_s=netAge===null?null:Math.floor(netAge/1000);
health.esp_wifi_connected=diagFresh?net.wifi_connected:null;
health.esp_wifi_rssi_dbm=diagFresh?net.wifi_rssi_dbm:null;
health.esp_wifi_disconnect_count=net.last_ok_ts?net.wifi_disconnect_count_boot:null;
health.esp_wifi_disconnect_observed=Number(net.wifi_disconnect_events_observed||0);
health.esp_wifi_connect_attempts=net.last_ok_ts?net.wifi_connect_attempts_boot:null;
health.esp_wifi_got_ip_count=net.last_ok_ts?net.wifi_got_ip_count_boot:null;
health.esp_wifi_last_reason=net.last_ok_ts?net.wifi_last_disconnect_reason:null;
health.esp_firmware_restarts_observed=Number(net.firmware_restarts_observed||0);
health.esp_network_snapshot_successes=Number(net.snapshot_successes||0);
health.esp_network_snapshot_failures=Number(net.snapshot_failures||0);
health.esp_network_outages=Number(net.snapshot_outages||0);
health.esp_network_down=net.snapshot_down===true;
health.esp_network_current_outage_s=health.esp_network_down?
 Math.floor(Math.max(0,Date.now()-Number(net.snapshot_outage_started_ts||Date.now()))/1000):0;
health.esp_network_last_outage_s=net.last_outage_duration_s??null;
health.esp_network_longest_outage_s=net.longest_outage_duration_s??null;
health.esp_network_last_recovered_ts=net.last_restored_ts||null;
health.esp_network_last_failure_ts=net.last_snapshot_failure_ts||null;
health.esp_cache_unavailable_count=Number(net.cache_unavailable_count||0);
health.esp_net_diag_failures=Number(net.diag_failures||0);
health.esp_net_diag_last_error=String(net.last_error||"");
health.esp_uart_data_fresh=diagFresh;
for(const k of ["uart_tx_commands","uart_rx_frames","uart_polls_ok",
 "uart_timeouts","uart_no_rx_timeouts","uart_crc_rejects","uart_partial_frames",
 "uart_malformed_frames","uart_naks","uart_parse_rejects","uart_last_good_age_ms",
 "http_send_failures_firmware"]){
 health["esp_"+k]=diagFresh?net[k]:null;
}
'''.replace("__I__",tag)
        anchor='global.set(key,health);'
        assert anchor in code
        # first matching save belongs to ESP mode; insert directly before it
        code=code.replace(anchor,hook+'\n'+anchor,1)
        monitor["func"]=code

    pub=by[publish_ids[inv-1]]
    code=pub["func"]
    marker="// ESP_NETWORK_MQTT_FIELDS_"+tag
    if marker not in code:
        extra='''// ESP_NETWORK_MQTT_FIELDS___I__
for(const key of [
"esp_net_diag_fresh","esp_net_diag_age_s","esp_wifi_connected",
"esp_wifi_rssi_dbm","esp_wifi_disconnect_count","esp_wifi_disconnect_observed",
"esp_wifi_connect_attempts","esp_wifi_got_ip_count","esp_wifi_last_reason",
"esp_firmware_restarts_observed","esp_network_snapshot_successes","esp_network_snapshot_failures",
"esp_network_outages","esp_network_down","esp_network_current_outage_s",
"esp_network_last_outage_s","esp_network_longest_outage_s","esp_network_last_recovered_ts",
"esp_network_last_failure_ts","esp_cache_unavailable_count","esp_net_diag_failures",
"esp_net_diag_last_error","esp_uart_data_fresh","esp_uart_tx_commands",
"esp_uart_rx_frames","esp_uart_polls_ok","esp_uart_timeouts","esp_uart_no_rx_timeouts",
"esp_uart_crc_rejects","esp_uart_partial_frames","esp_uart_malformed_frames",
"esp_uart_naks","esp_uart_parse_rejects","esp_uart_last_good_age_ms",
"esp_http_send_failures_firmware"
]) payload[key]=(health[key]===undefined?null:health[key]);
'''.replace("__I__",tag)
        anchor='msg.payload = JSON.stringify(payload);'
        assert anchor in code, "Doctor MQTT serialization moved for INV"+tag
        code=code.replace(anchor, 'if(String(health.transport||"")==="esp32"){\n'+extra+'\n}\n'+anchor,1)
        pub["func"]=code

doctor=by["2d7f7336b88783dc"]
code=doctor["func"]
marker="### ESP32 · Diagnostic réseau indépendant"
if marker not in code:
    # The main ESP summary already uses the ORIGINAL entity and remains a
    # vertical-stack with the original night_sleep switch.
    token='''| Modifications confirmées |'''
    assert token in code
    summary='''| Wi-Fi ESP32 | {{ ('Connecté' if state_attr('ENTITY','esp_wifi_connected') == true else 'Déconnecté') if state_attr('ENTITY','esp_net_diag_fresh') == true and state_attr('ENTITY','esp_wifi_connected') is not none else 'Diagnostic indisponible' }} |
| Signal Wi-Fi | {{ ((state_attr('ENTITY','esp_wifi_rssi_dbm')|string) ~ ' dBm') if state_attr('ENTITY','esp_wifi_rssi_dbm') is not none else '--' }} |
| Déconnexions Wi-Fi (depuis démarrage ESP) | {{ state_attr('ENTITY','esp_wifi_disconnect_count') if state_attr('ENTITY','esp_wifi_disconnect_count') is not none else '--' }} |
| Interruptions HTTP vues par HA | {{ state_attr('ENTITY','esp_network_outages') or 0 }} |
| HTTP actuellement interrompu | {{ 'Oui' if state_attr('ENTITY','esp_network_down') == true else 'Non' }} |
| Timeouts RS232 (depuis démarrage ESP) | {{ state_attr('ENTITY','esp_uart_timeouts') if state_attr('ENTITY','esp_uart_timeouts') is not none else '--' }} |
'''
    code=code.replace(token,summary+token,1)

    # Full Doctor's ESP-only branch is separated from serial/gateway in
    # a Jinja if-block. Insert read-only counters there only.
    section="### ESP32 : liaison RS232 via Wi-Fi"
    assert section in code
    begin=code.index(section)
    table=code.index("| HTTP cache |",begin)
    block='''### ESP32 · Diagnostic réseau indépendant
*Les compteurs Wi-Fi et RS232 proviennent du firmware (depuis son dernier démarrage). Une interruption HTTP seule ne prouve pas une panne Wi-Fi.*

#### Wi-Fi ESP32
| Indicateur | Valeur |
|:--|--:|
| Diagnostic récent | {{ 'Oui' if a(e, 'esp_net_diag_fresh') == true else 'Non : dernière mesure ancienne ou absente' }} |
| Âge du dernier diagnostic | {{ duration(a(e, 'esp_net_diag_age_s')) }} |
| État Wi-Fi | {{ ('Connecté' if a(e, 'esp_wifi_connected') == true else 'Déconnecté') if a(e, 'esp_wifi_connected') is not none else 'Inconnu' }} |
| RSSI | {{ ((a(e, 'esp_wifi_rssi_dbm')|string) ~ ' dBm') if a(e, 'esp_wifi_rssi_dbm') is not none else '--' }} |
| Déconnexions depuis démarrage ESP | {{ a(e, 'esp_wifi_disconnect_count') if a(e, 'esp_wifi_disconnect_count') is not none else '--' }} |
| Déconnexions observées par HA | {{ a(e, 'esp_wifi_disconnect_observed') or 0 }} |
| Tentatives de connexion | {{ a(e, 'esp_wifi_connect_attempts') if a(e, 'esp_wifi_connect_attempts') is not none else '--' }} |
| Obtention d'adresse IP | {{ a(e, 'esp_wifi_got_ip_count') if a(e, 'esp_wifi_got_ip_count') is not none else '--' }} |
| Dernier motif Wi-Fi (code ESP-IDF) | {{ a(e, 'esp_wifi_last_reason') if a(e, 'esp_wifi_last_reason') is not none else '--' }} |
| Redémarrages firmware observés | {{ a(e, 'esp_firmware_restarts_observed') or 0 }} |

#### Réseau Home Assistant ↔ ESP32
| Indicateur | Valeur |
|:--|--:|
| Requêtes snapshot HTTP valides | {{ a(e, 'esp_network_snapshot_successes') or 0 }} |
| Requêtes snapshot HTTP échouées | {{ a(e, 'esp_network_snapshot_failures') or 0 }} |
| Interruptions HTTP | {{ a(e, 'esp_network_outages') or 0 }} |
| Interruption en cours | {{ 'Oui' if a(e, 'esp_network_down') == true else 'Non' }} |
| Durée interruption en cours | {{ duration(a(e, 'esp_network_current_outage_s')) }} |
| Dernière interruption | {{ duration(a(e, 'esp_network_last_outage_s')) }} |
| Interruption la plus longue | {{ duration(a(e, 'esp_network_longest_outage_s')) }} |
| Cache onduleur indisponible (HTTP valide) | {{ a(e, 'esp_cache_unavailable_count') or 0 }} |
| Erreurs requête diagnostic | {{ a(e, 'esp_net_diag_failures') or 0 }} |
| Dernière erreur diagnostic | {{ a(e, 'esp_net_diag_last_error') or '--' }} |

#### Liaison ESP32 ↔ Voltronic (RS232)
| Indicateur | Valeur |
|:--|--:|
| Diagnostic RS232 récent | {{ 'Oui' if a(e, 'esp_uart_data_fresh') == true else 'Non' }} |
| Commandes envoyées | {{ a(e, 'esp_uart_tx_commands') if a(e, 'esp_uart_tx_commands') is not none else '--' }} |
| Réponses reçues | {{ a(e, 'esp_uart_rx_frames') if a(e, 'esp_uart_rx_frames') is not none else '--' }} |
| Pollings validés | {{ a(e, 'esp_uart_polls_ok') if a(e, 'esp_uart_polls_ok') is not none else '--' }} |
| Timeouts RS232 | {{ a(e, 'esp_uart_timeouts') if a(e, 'esp_uart_timeouts') is not none else '--' }} |
| Timeouts sans aucun octet | {{ a(e, 'esp_uart_no_rx_timeouts') if a(e, 'esp_uart_no_rx_timeouts') is not none else '--' }} |
| Erreurs CRC | {{ a(e, 'esp_uart_crc_rejects') if a(e, 'esp_uart_crc_rejects') is not none else '--' }} |
| Trames partielles | {{ a(e, 'esp_uart_partial_frames') if a(e, 'esp_uart_partial_frames') is not none else '--' }} |
| Trames malformées | {{ a(e, 'esp_uart_malformed_frames') if a(e, 'esp_uart_malformed_frames') is not none else '--' }} |
| Réponses NAK | {{ a(e, 'esp_uart_naks') if a(e, 'esp_uart_naks') is not none else '--' }} |
| Réponses rejetées par parser | {{ a(e, 'esp_uart_parse_rejects') if a(e, 'esp_uart_parse_rejects') is not none else '--' }} |
| Dernière réponse valide (firmware) | {{ duration((a(e, 'esp_uart_last_good_age_ms') or 0) / 1000) if a(e, 'esp_uart_last_good_age_ms') is not none else '--' }} |

'''
    code=code[:table]+block+code[table:]
    doctor["func"]=code

for id,(func,wires) in discovery.items():
    assert by[id]["func"]==func and by[id]["wires"]==wires,("HA discovery changed",id)
assert len(nodes)==373 and len({n["id"] for n in nodes})==373
p.write_text(json.dumps(nodes,ensure_ascii=False,separators=(",",":"))+"\n")
print("PASS canonical 373 nodes: WiFi, HTTP outage durations, RS232 native counters; HA unique IDs and legacy unchanged")
