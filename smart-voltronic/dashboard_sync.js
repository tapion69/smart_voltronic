#!/usr/bin/env node
"use strict";

/*
  Smart Voltronic - Premium Dashboard Sync
  ----------------------------------------
  Actions:
    - upsert : create/update Lovelace dashboard
    - delete : delete Lovelace dashboard

  Input via stdin JSON:
  {
    "dashboard_meta": {
      "url_path": "smart-voltronic",
      "title": "Smart Voltronic",
      "icon": "mdi:solar-power",
      "show_in_sidebar": true,
      "require_admin": false
    },
    "config": {
      "views": [...]
    }
  }

  Node-RED exec:
    node /addon/dashboard_sync.js upsert
    node /addon/dashboard_sync.js delete
*/

const ACTION = String(process.argv[2] || "upsert").trim().toLowerCase();
const WS_URL = process.env.HA_WS_URL || "ws://supervisor/core/websocket";
const TOKEN = process.env.SUPERVISOR_TOKEN;

if (!TOKEN) {
  console.error(JSON.stringify({
    ok: false,
    action: ACTION,
    error: "SUPERVISOR_TOKEN missing"
  }));
  process.exit(1);
}

let WSImpl = globalThis.WebSocket;
if (!WSImpl) {
  try {
    WSImpl = require("ws");
  } catch (err) {
    console.error(JSON.stringify({
      ok: false,
      action: ACTION,
      error: "No WebSocket implementation available. Install 'ws' or use a Node version with global WebSocket."
    }));
    process.exit(1);
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", chunk => { input += chunk; });
    process.stdin.on("end", () => resolve(input.trim()));
    process.stdin.on("error", reject);
  });
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function ensureObject(v, fallback = {}) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : fallback;
}

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeBoolean(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(s)) return true;
    if (["false", "0", "no", "off"].includes(s)) return false;
  }
  return fallback;
}

function cleanString(v, fallback = "") {
  const s = String(v ?? "").trim();
  return s || fallback;
}

function normalizeDashboardInput(raw) {
  let parsed = {};
  if (raw) {
    parsed = JSON.parse(raw);
  }

  // Format accepté:
  // 1) { dashboard_meta: {...}, config: {...} }
  // 2) { title, icon, views, ... }
  const hasExplicitFormat = parsed.dashboard_meta || parsed.config;

  const dashboard_meta = hasExplicitFormat
    ? ensureObject(parsed.dashboard_meta)
    : {
        url_path: parsed.url_path,
        title: parsed.title,
        icon: parsed.icon,
        show_in_sidebar: parsed.show_in_sidebar,
        require_admin: parsed.require_admin
      };

  const config = hasExplicitFormat
    ? ensureObject(parsed.config)
    : {
        views: ensureArray(parsed.views)
      };

  return {
    dashboard_meta: {
      url_path: cleanString(dashboard_meta.url_path, "smart-voltronic"),
      title: cleanString(dashboard_meta.title, "Smart Voltronic"),
      icon: cleanString(dashboard_meta.icon, "mdi:solar-power"),
      show_in_sidebar: normalizeBoolean(dashboard_meta.show_in_sidebar, true),
      require_admin: normalizeBoolean(dashboard_meta.require_admin, false)
    },
    config: normalizeDashboardConfig(config)
  };
}

function normalizeDashboardConfig(config) {
  const cfg = ensureObject(config);
  const views = ensureArray(cfg.views).map(normalizeView).filter(Boolean);

  const out = clone(cfg);
  out.views = views;
  return out;
}

function normalizeView(view, index) {
  const v = ensureObject(view);
  const title = cleanString(v.title, `View ${index + 1}`);
  const path = cleanString(v.path, slugify(title));
  const cards = ensureArray(v.cards).map(normalizeCard).filter(Boolean);

  return {
    ...clone(v),
    title,
    path,
    cards
  };
}

function normalizeCard(card) {
  const c = ensureObject(card);
  const type = cleanString(c.type);
  if (!type) return null;

  const out = clone(c);

  if (type === "entities") {
    out.entities = ensureArray(c.entities)
      .map(entityEntry => normalizeEntityEntry(entityEntry))
      .filter(Boolean);
  }

  return out;
}

function normalizeEntityEntry(entry) {
  if (typeof entry === "string") {
    const s = cleanString(entry);
    return s || null;
  }

  if (entry && typeof entry === "object") {
    const obj = clone(entry);
    if (typeof obj.entity === "string" && obj.entity.trim()) {
      obj.entity = obj.entity.trim();
      return obj;
    }
  }

  return null;
}

function slugify(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "view";
}

class HAWebSocketClient {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.isAuthenticated = false;
    this.isConnected = false;
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const ws = new WSImpl(this.url);
      this.ws = ws;

      const fail = (err) => {
        try {
          reject(err instanceof Error ? err : new Error(String(err)));
        } catch (_) {}
      };

      ws.onopen = () => {
        this.isConnected = true;
      };

      ws.onerror = (err) => {
        fail(err);
      };

      ws.onclose = () => {
        if (!this.isAuthenticated) {
          fail(new Error("WebSocket closed before authentication"));
        }
      };

      ws.onmessage = (event) => {
        try {
          const raw = typeof event.data === "string"
            ? event.data
            : event.data.toString();
          const msg = JSON.parse(raw);

          if (msg.type === "auth_required") {
            ws.send(JSON.stringify({
              type: "auth",
              access_token: this.token
            }));
            return;
          }

          if (msg.type === "auth_ok") {
            this.isAuthenticated = true;
            resolve();
            return;
          }

          if (msg.type === "auth_invalid") {
            fail(new Error(msg.message || "Authentication invalid"));
            return;
          }

          if (Object.prototype.hasOwnProperty.call(msg, "id")) {
            const pending = this.pending.get(msg.id);
            if (!pending) return;

            this.pending.delete(msg.id);

            if (msg.success === false) {
              pending.reject(new Error(msg.error?.message || "Unknown Home Assistant error"));
            } else {
              pending.resolve(msg.result);
            }
          }
        } catch (err) {
          fail(err);
        }
      };
    });
  }

  call(type, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.isAuthenticated) {
        reject(new Error("WebSocket not authenticated"));
        return;
      }

      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });

      const msg = { id, type, ...payload };
      this.ws.send(JSON.stringify(msg));
    });
  }

  async close() {
    try {
      if (this.ws && this.isConnected) {
        this.ws.close();
      }
    } catch (_) {}
  }
}

async function listDashboards(client) {
  return await client.call("lovelace/dashboards/list");
}

async function findDashboardByUrlPath(client, urlPath) {
  const dashboards = await listDashboards(client);
  return ensureArray(dashboards).find(d => d && d.url_path === urlPath) || null;
}

async function createDashboard(client, meta) {
  return await client.call("lovelace/dashboards/create", {
    url_path: meta.url_path,
    title: meta.title,
    icon: meta.icon,
    show_in_sidebar: meta.show_in_sidebar,
    require_admin: meta.require_admin,
    mode: "storage"
  });
}

async function updateDashboardMeta(client, dashboardId, meta) {
  return await client.call("lovelace/dashboards/update", {
    dashboard_id: dashboardId,
    title: meta.title,
    icon: meta.icon,
    show_in_sidebar: meta.show_in_sidebar,
    require_admin: meta.require_admin
  });
}

async function saveDashboardConfig(client, urlPath, config) {
  return await client.call("lovelace/config/save", {
    url_path: urlPath,
    config
  });
}

async function deleteDashboardConfig(client, urlPath) {
  return await client.call("lovelace/config/delete", {
    url_path: urlPath
  });
}

async function getDashboardConfig(client, urlPath) {
  return await client.call("lovelace/config", {
    url_path: urlPath
  });
}

function stableStringify(value) {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortKeysDeep(value[key]);
    }
    return out;
  }
  return value;
}

async function upsertDashboard(client, input) {
  const meta = input.dashboard_meta;
  const config = input.config;

  let dashboard = await findDashboardByUrlPath(client, meta.url_path);
  let created = false;
  let updatedMeta = false;
  let savedConfig = false;

  if (!dashboard) {
    dashboard = await createDashboard(client, meta);
    created = true;
  } else {
    await updateDashboardMeta(client, dashboard.id, meta);
    updatedMeta = true;
  }

  let existingConfig = null;
  try {
    existingConfig = await getDashboardConfig(client, meta.url_path);
  } catch (_) {
    existingConfig = null;
  }

  const nextConfigString = stableStringify(config);
  const currentConfigString = existingConfig ? stableStringify(existingConfig) : null;

  if (currentConfigString !== nextConfigString) {
    await saveDashboardConfig(client, meta.url_path, config);
    savedConfig = true;
  }

  return {
    ok: true,
    action: "upsert",
    url_path: meta.url_path,
    title: meta.title,
    dashboard_id: dashboard.id,
    created,
    updated_meta: updatedMeta,
    saved_config: savedConfig
  };
}

async function deleteDashboard(client, input) {
  const meta = input.dashboard_meta;
  const dashboard = await findDashboardByUrlPath(client, meta.url_path);

  if (!dashboard) {
    return {
      ok: true,
      action: "delete",
      url_path: meta.url_path,
      deleted: false,
      reason: "dashboard_not_found"
    };
  }

  await deleteDashboardConfig(client, meta.url_path);

  return {
    ok: true,
    action: "delete",
    url_path: meta.url_path,
    deleted: true
  };
}

(async () => {
  let client = null;

  try {
    const raw = await readStdin();
    const input = normalizeDashboardInput(raw);

    client = new HAWebSocketClient(WS_URL, TOKEN);
    await client.connect();

    let result;
    if (ACTION === "delete") {
      result = await deleteDashboard(client, input);
    } else {
      result = await upsertDashboard(client, input);
    }

    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    process.stderr.write(JSON.stringify({
      ok: false,
      action: ACTION,
      error: err?.message || String(err)
    }));
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
    }
  }
})();
