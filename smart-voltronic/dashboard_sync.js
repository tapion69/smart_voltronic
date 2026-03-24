#!/usr/bin/env node
"use strict";

const ACTION = process.argv[2] || "upsert";
const b64 = process.argv[3] || "";

if (!b64) {
    console.error(JSON.stringify({
        ok:false,
        error:"Missing dashboard payload"
    }));
    process.exit(1);
}

let input;

try{
    const json = Buffer.from(b64,"base64").toString("utf8");
    input = JSON.parse(json);
}catch(e){
    console.error(JSON.stringify({
        ok:false,
        error:"Invalid dashboard JSON"
    }));
    process.exit(1);
}

const TOKEN = process.env.SUPERVISOR_TOKEN;

if(!TOKEN){
    console.error(JSON.stringify({
        ok:false,
        error:"Supervisor token missing"
    }));
    process.exit(1);
}

const WS = require("ws");

const ws = new WS("ws://supervisor/core/websocket");

let msgId = 10;

function send(type,data={}){
    ws.send(JSON.stringify({
        id:msgId++,
        type,
        ...data
    }));
}

ws.on("message",(data)=>{

    const msg = JSON.parse(data);

    if(msg.type==="auth_required"){
        ws.send(JSON.stringify({
            type:"auth",
            access_token:TOKEN
        }));
        return;
    }

    if(msg.type==="auth_ok"){

        send("lovelace/dashboards/create",{
            url_path:input.dashboard_meta.url_path,
            title:input.dashboard_meta.title,
            icon:input.dashboard_meta.icon,
            show_in_sidebar:true,
            require_admin:false,
            mode:"storage"
        });

        setTimeout(()=>{

            send("lovelace/config/save",{
                url_path:input.dashboard_meta.url_path,
                config:input.config
            });

            setTimeout(()=>{

                console.log(JSON.stringify({
                    ok:true,
                    action:"upsert",
                    dashboard:input.dashboard_meta.url_path
                }));

                process.exit(0);

            },800);

        },800);

    }

    if(msg.type==="auth_invalid"){

        console.error(JSON.stringify({
            ok:false,
            error:"Auth failed"
        }));

        process.exit(1);

    }

});

ws.on("error",(e)=>{

    console.error(JSON.stringify({
        ok:false,
        error:e.message
    }));

    process.exit(1);

});
