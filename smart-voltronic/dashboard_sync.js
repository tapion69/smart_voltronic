#!/usr/bin/env node
"use strict";

const action = process.argv[2] || "upsert";
const b64 = process.argv[3] || "";
const token = process.env.SUPERVISOR_TOKEN;
const wsUrl = "ws://supervisor/core/websocket";

const REQUIRED_RESOURCES = [
  { url: "/local/smart-voltronic/card-mod.js", type: "module" },
  { url: "/local/smart-voltronic/apexcharts-card.js", type: "module" },
  { url: "/local/smart-voltronic/mini-graph-card.js", type: "module" }
];

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

if (typeof WebSocket === "undefined") {
  console.error(JSON.stringify({
    ok: false,
    error: "Global WebSocket not available in this Node version"
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
const pending = new Map();
let finished = false;

function finishOk(extra = {}) {
  if (finished) return;
  finished = true;
  console.log(JSON.stringify({
    ok: true,
    action,
    dashboard: urlPath,
    ...extra
  }));
  try { ws.close(); } catch (_) {}
  process.exit(0);
}

function finishErr(error, extra = {}) {
  if (finished) return;
  finished = true;
  console.error(JSON.stringify({
    ok: false,
    action,
    error: String(error || "Unknown error"),
    ...extra
  }));
  try { ws.close(); } catch (_) {}
  process.exit(1);
}

function call(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, type });
    ws.send(JSON.stringify({
      id,
      type,
      ...payload
    }));
  });
}

async function ensureResources() {
  const existing = await call("lovelace/resources");
  const existingUrls = new Set(
    Array.isArray(existing)
      ? existing.map((r) => String(r.url || "").trim())
      : []
  );

  const created = [];

  for (const res of REQUIRED_RESOURCES) {
    if (existingUrls.has(res.url)) continue;

    await call("lovelace/resources/create", {
      url: res.url,
      type: res.type
    });

    created.push(res.url);
  }

  return created;
}

async function createOrUpdateDashboard() {
  let createdDashboard = false;

  try {
    await call("lovelace/dashboards/create", {
      url_path: urlPath,
      title,
      icon,
      show_in_sidebar: showInSidebar,
      require_admin: requireAdmin,
      mode: "storage"
    });
    createdDashboard = true;
  } catch (err) {
    // S'il existe déjà, on continue avec save
    const msg = String(err?.message || err || "").toLowerCase();
    if (
      !msg.includes("exists") &&
      !msg.includes("already") &&
      !msg.includes("configured")
    ) {
      throw err;
    }
  }

  await call("lovelace/config/save", {
    url_path: urlPath,
    config: dashboardConfig
  });

  return { created_dashboard: createdDashboard, saved: true };
}

async function deleteDashboard() {
  await call("lovelace/config/delete", {
    url_path: urlPath
  });

  return { deleted: true };
}

ws.onerror = (event) => {
  const msg = event?.message || "WebSocket error";
  finishErr(msg);
};

ws.onmessage = async (event) => {
  let msg;

  try {
    msg = JSON.parse(event.data.toString());
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
    try {
      if (action === "delete") {
        const result = await deleteDashboard();
        finishOk(result);
        return;
      }

      const createdResources = await ensureResources();
      const result = await createOrUpdateDashboard();

      finishOk({
        resources_created: createdResources,
        ...result
      });
    } catch (err) {
      finishErr(err?.message || err);
    }
    return;
  }

  if (Object.prototype.hasOwnProperty.call(msg, "id")) {
    const waiter = pending.get(msg.id);
    if (!waiter) return;

    pending.delete(msg.id);

    if (msg.success === false) {
      waiter.reject(new Error(msg.error?.message || "Home Assistant error"));
    } else {
      waiter.resolve(msg.result);
    }
  }
};
