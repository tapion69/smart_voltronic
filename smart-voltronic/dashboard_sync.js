#!/usr/bin/env node
"use strict";

const WebSocket = require("ws");

const action = process.argv[2] || "upsert";
const b64 = process.argv[3] || "";
const token = process.env.SUPERVISOR_TOKEN;
const wsUrl = "ws://supervisor/core/websocket";

if (!b64) {
    console.error(JSON.stringify({
        ok: false,
        error: "Missing dashboard payload"
    }));
    process.exit(1);
}

if (!token) {
    console.error(JSON.stringify({
        ok: false,
        error: "Supervisor token missing"
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

const dashboardMeta = input.dashboard_meta || {};
const dashboardConfig = input.config || {};
const urlPath = dashboardMeta.url_path || "smart-voltronic";
const title = dashboardMeta.title || "Smart Voltronic";
const icon = dashboardMeta.icon || "mdi:solar-power";
const showInSidebar = dashboardMeta.show_in_sidebar !== false;
const requireAdmin = !!dashboardMeta.require_admin;

const ws = new WebSocket(wsUrl);

let nextId = 1;
let authDone = false;
let createSent = false;
let saveSent = false;
let deleteSent = false;

function send(type, payload = {}) {
    ws.send(JSON.stringify({
        id: nextId++,
        type,
        ...payload
    }));
}

function finishOk(extra = {}) {
    console.log(JSON.stringify({
        ok: true,
        action,
        dashboard: urlPath,
        ...extra
    }));
    process.exit(0);
}

function finishErr(error) {
    console.error(JSON.stringify({
        ok: false,
        action,
        error: String(error || "Unknown error")
    }));
    process.exit(1);
}

ws.on("error", (err) => {
    finishErr(err.message || err);
});

ws.on("message", (raw) => {
    let msg;

    try {
        msg = JSON.parse(raw.toString());
    } catch (e) {
        finishErr("Invalid websocket message");
        return;
    }

    if (msg.type === "auth_required") {
        ws.send(JSON.stringify({
            type: "auth",
            access_token: token
        }));
        return;
    }

    if (msg.type === "auth_invalid") {
        finishErr("Authentication failed");
        return;
    }

    if (msg.type === "auth_ok") {
        authDone = true;

        if (action === "delete") {
            deleteSent = true;
            send("lovelace/config/delete", {
                url_path: urlPath
            });
            return;
        }

        createSent = true;
        send("lovelace/dashboards/create", {
            url_path: urlPath,
            title: title,
            icon: icon,
            show_in_sidebar: showInSidebar,
            require_admin: requireAdmin,
            mode: "storage"
        });
        return;
    }

    if (!authDone) {
        return;
    }

    if (action === "delete") {
        if (deleteSent && msg.success === true) {
            finishOk({ deleted: true });
            return;
        }

        if (deleteSent && msg.success === false) {
            const err = (msg.error && msg.error.message) || "Delete failed";
            finishErr(err);
            return;
        }

        return;
    }

    // Réponse à dashboards/create
    if (createSent && !saveSent) {
        if (msg.success === true) {
            saveSent = true;
            send("lovelace/config/save", {
                url_path: urlPath,
                config: dashboardConfig
            });
            return;
        }

        if (msg.success === false) {
            // Si le dashboard existe déjà, on tente quand même le save
            saveSent = true;
            send("lovelace/config/save", {
                url_path: urlPath,
                config: dashboardConfig
            });
            return;
        }
    }

    // Réponse à config/save
    if (saveSent) {
        if (msg.success === true) {
            finishOk({ saved: true });
            return;
        }

        if (msg.success === false) {
            const err = (msg.error && msg.error.message) || "Dashboard save failed";
            finishErr(err);
            return;
        }
    }
});
