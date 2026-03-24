#!/usr/bin/env node
"use strict";

const ACTION = process.argv[2] || "upsert";
const b64 = process.argv[3] || "";

if (!b64) {
    console.error(JSON.stringify({
        ok: false,
        error: "Missing dashboard payload"
    }));
    process.exit(1);
}

let input;

try {
    const json = Buffer.from(b64, "base64").toString("utf8");
    input = JSON.parse(json);
} catch (e) {
    console.error(JSON.stringify({
        ok: false,
        error: "Invalid dashboard JSON"
    }));
    process.exit(1);
}

const TOKEN = process.env.SUPERVISOR_TOKEN;

if (!TOKEN) {
    console.error(JSON.stringify({
        ok: false,
        error: "Supervisor token missing"
    }));
    process.exit(1);
}

const WebSocket = require("ws");
const ws = new WebSocket("ws://supervisor/core/websocket");

let msgId = 1;
let authOk = false;
let dashboardCreatedOrExists = false;
let configSaved = false;

function send(type, data = {}) {
    ws.send(JSON.stringify({
        id: msgId++,
        type,
        ...data
    }));
}

function finishOk(extra = {}) {
    console.log(JSON.stringify({
        ok: true,
        action: ACTION,
        dashboard: input.dashboard_meta?.url_path || "smart-voltronic",
        ...extra
    }));
    process.exit(0);
}

function finishErr(error) {
    console.error(JSON.stringify({
        ok: false,
        action: ACTION,
        error: String(error || "Unknown error")
    }));
    process.exit(1);
}

ws.on("open", () => {
    // attendre auth_required
});

ws.on("message", (raw) => {
    let msg;
    try {
        msg = JSON.parse(raw.toString());
    } catch (e) {
        return finishErr("Invalid websocket message");
    }

    if (msg.type === "auth_required") {
        ws.send(JSON.stringify({
            type: "auth",
            access_token: TOKEN
        }));
        return;
    }

    if (msg.type === "auth_invalid") {
        return finishErr("Authentication failed");
    }

    if (msg.type === "auth_ok") {
        authOk = true;

        if (ACTION === "delete") {
            send("lovelace/config/delete", {
                url_path: input.dashboard_meta.url_path
            });
            return;
        }

        send("lovelace/dashboards/create", {
            url_path: input.dashboard_meta.url_path,
            title: input.dashboard_meta.title,
            icon: input.dashboard_meta.icon,
            show_in_sidebar: input.dashboard_meta.show_in_sidebar !== false,
            require_admin: !!input.dashboard_meta.require_admin,
            mode: "storage"
        });
        return;
    }

    if (!authOk) return;

    if (ACTION === "delete") {
        if (msg.success === true) {
            return finishOk({ deleted: true });
        }
        if (msg.success === false) {
            return finishErr(msg.error?.message || "Delete failed");
        }
    }

    // create dashboard
    if (!dashboardCreatedOrExists && msg.id === 1 + 0) {
        // rien ici, car auth n'a pas d'id
    }

    if (msg.success === false) {
        const err = msg.error?.message || "";

        // Si le dashboard existe déjà, on continue quand même vers save
        if (err.toLowerCase().includes("exists") || err.toLowerCase().includes("already")) {
            dashboardCreatedOrExists = true;
            send("lovelace/config/save", {
                url_path: input.dashboard_meta.url_path,
                config: input.config
            });
            return;
        }

        // Certaines versions HA peuvent renvoyer une erreur create différente
        // On tente quand même le save si on est sur dashboards/create
        if (!configSaved) {
            send("lovelace/config/save", {
                url_path: input.dashboard_meta.url_path,
                config: input.config
            });
            configSaved = true;
            return;
        }

        return finishErr(err || "Home Assistant error");
    }

    // Premier succès après auth = create OK
    if (!dashboardCreatedOrExists) {
        dashboardCreatedOrExists = true;
        send("lovelace/config/save", {
            url_path: input.dashboard_meta.url_path,
            config: input.config
        });
        configSaved = true;
        return;
    }

    // Deuxième succès = save OK
    return finishOk({ saved: true });
});

ws.on("error", (err) => {
    finishErr(err.message || err);
});
});
