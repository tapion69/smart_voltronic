#!/usr/bin/env node
"use strict";

const ACTION = String(process.argv[2] || "upsert").trim().toLowerCase();
const WS_URL = process.env.HA_WS_URL || "ws://supervisor/core/websocket";
const TOKEN = process.env.SUPERVISOR_TOKEN;

let WSImpl = globalThis.WebSocket;
if (!WSImpl) {
  try {
    WSImpl = require("ws");
  } catch (err) {
    console.error(JSON.stringify({
      ok: false,
      action: ACTION,
      error: "No WebSocket implementation available"
    }));
    process.exit(1);
  }
}

function readStdinWithTimeout(timeoutMs = 300) {
  return new Promise((resolve, reject) => {
    let input = "";
    let settled = false;

    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve((value || "").trim());
    };

    const timer = setTimeout(() => done(input), timeoutMs);

    process.stdin.setEncoding("utf8");

    process.stdin.on("data", chunk => {
      input += chunk;
    });

    process.stdin.on("end", () => {
      clearTimeout(timer);
      done(input);
    });

    process.stdin.on("error", err => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

function cleanString(v, fallback = "") {
  const s = String(v ?? "").trim();
  return s || fallback;
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

function normalizeInput(raw) {
  const parsed = raw ? JSON.parse(raw) : {};
  const dashboard_meta = parsed.dashboard_meta || {};
  const config = parsed.config || {};

  return {
    dashboard_meta: {
      url_path: cleanString(dashboard_meta.url_path, "smart-voltronic"),
      title: cleanString(dashboard_meta.title, "Smart Voltronic"),
      icon: cleanString(dashboard_meta.icon, "mdi:solar-power"),
      show_in_sidebar: normalizeBoolean(dashboard_meta.show_in_sidebar, true),
      require_admin: normalizeBoolean(dashboard_meta.require_admin, false)
    },
    config: {
      views: Array.isArray(config.views) ? config.views : []
    }
  };
}

class HAWebSocketClient {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.authenticated = false;
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const ws = new WSImpl(this.url);
      this.ws = ws;

      ws.onerror = (err) => reject(err);

      ws.onclose = () => {
        if (!this.authenticated) {
          reject(new Error("WebSocket closed before authentication"));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());

          if (msg.type === "auth_required") {
            ws.send(JSON.stringify({
              type: "auth",
              access_token: this.token
            }));
            return;
          }

          if (msg.type === "auth_ok") {
            this.authenticated = true;
            resolve();
            return;
          }

          if (msg.type === "auth_invalid") {
            reject(new Error(msg.message || "Authentication invalid"));
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
          reject(err);
        }
      };
    });
  }

  call(type, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.authenticated) {
        reject(new Error("WebSocket not authenticated"));
        return;
      }

      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, type, ...payload }));
    });
  }

  close() {
    try {
      if (this.ws) this.ws.close();
    } catch (_) {}
  }
}

async function listDashboards(client) {
  return client.call("lovelace/dashboards/list");
}

async function findDashboard(client, urlPath) {
  const dashboards = await listDashboards(client);
  return (Array.isArray(dashboards) ? dashboards : []).find(d => d.url_path === urlPath) || null;
}

async function createDashboard(client, meta) {
  return client.call("lovelace/dashboards/create", {
    url_path: meta.url_path,
    title: meta.title,
    icon: meta.icon,
    show_in_sidebar: meta.show_in_sidebar,
    require_admin: meta.require_admin,
    mode: "storage"
  });
}

async function updateDashboardMeta(client, dashboardId, meta) {
  return client.call("lovelace/dashboards/update", {
    dashboard_id: dashboardId,
    title: meta.title,
    icon: meta.icon,
    show_in_sidebar: meta.show_in_sidebar,
    require_admin: meta.require_admin
  });
}

async function saveDashboardConfig(client, urlPath, config) {
  return client.call("lovelace/config/save", {
    url_path: urlPath,
    config
  });
}

async function deleteDashboardConfig(client, urlPath) {
  return client.call("lovelace/config/delete", {
    url_path: urlPath
  });
}

async function upsertDashboard(client, input) {
  const meta = input.dashboard_meta;
  const config = input.config;

  let dashboard = await findDashboard(client, meta.url_path);
  let created = false;

  if (!dashboard) {
    dashboard = await createDashboard(client, meta);
    created = true;
  } else {
    await updateDashboardMeta(client, dashboard.id, meta);
  }

  await saveDashboardConfig(client, meta.url_path, config);

  return {
    ok: true,
    action: "upsert",
    url_path: meta.url_path,
    title: meta.title,
    created
  };
}

async function deleteDashboard(client, input) {
  const meta = input.dashboard_meta;
  const dashboard = await findDashboard(client, meta.url_path);

  if (!dashboard) {
    return {
      ok: true,
      action: "delete",
      url_path: meta.url_path,
      deleted: false
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
    let raw = process.argv.slice(3).join(" ").trim();

    if (!raw) {
      raw = await readStdinWithTimeout(300);
    }

    if (!raw) {
      throw new Error("No dashboard JSON received");
    }

    const input = normalizeInput(raw);

    if (!TOKEN) {
      throw new Error("SUPERVISOR_TOKEN missing");
    }

    client = new HAWebSocketClient(WS_URL, TOKEN);
    await client.connect();

    const result = ACTION === "delete"
      ? await deleteDashboard(client, input)
      : await upsertDashboard(client, input);

    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (err) {
    process.stderr.write(JSON.stringify({
      ok: false,
      action: ACTION,
      error: err.message || String(err)
    }));
    process.exit(1);
  } finally {
    if (client) client.close();
  }
})();
