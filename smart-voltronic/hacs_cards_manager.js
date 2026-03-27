#!/usr/bin/env node
"use strict";

// ============================================================
// hacs_cards_manager.js v2
// Smart Voltronic – HACS Frontend Cards Manager
//
// Usage:  node hacs_cards_manager.js [auto_install]
//   auto_install = "true" | "false"
//
// Toujours produit du JSON sur stdout, même en cas d'erreur
// ============================================================

const autoInstall = (process.argv[2] || "false").toLowerCase() === "true";
const token = process.env.SUPERVISOR_TOKEN;
const wsUrl = "ws://supervisor/core/websocket";

// -------------------------
// Garantir une sortie JSON en toutes circonstances
// -------------------------
function safeExit(output) {
  try {
    process.stdout.write(JSON.stringify(output) + "\n");
  } catch (_) {
    process.stdout.write('{"ok":false,"error":"JSON stringify failed"}\n');
  }
  process.exit(output.ok ? 0 : 1);
}

// -------------------------
// Vérifications initiales
// -------------------------
if (!token) {
  safeExit({ ok: false, error: "Supervisor token missing" });
}

// -------------------------
// Résoudre WebSocket: global (Node-RED) ou module ws
// -------------------------
let WS;
if (typeof WebSocket !== "undefined") {
  WS = WebSocket;
} else {
  try {
    WS = require("ws");
  } catch (e) {
    safeExit({ ok: false, error: "WebSocket not available: no global WebSocket and 'ws' module not found. " + e.message });
  }
}

// -------------------------
// Required cards definition
// -------------------------
const REQUIRED_CARDS = [
  {
    card_type: "mini-graph-card",
    repository: "kalkih/mini-graph-card",
    category: "plugin",
    resource_keywords: ["mini-graph-card"]
  },
  {
    card_type: "apexcharts-card",
    repository: "RomRider/apexcharts-card",
    category: "plugin",
    resource_keywords: ["apexcharts-card"]
  },
  {
    card_type: "card-mod",
    repository: "thomasloven/lovelace-card-mod",
    category: "plugin",
    resource_keywords: ["card-mod"]
  },
  {
    card_type: "bubble-card",
    repository: "Clooos/Bubble-Card",
    category: "plugin",
    resource_keywords: ["bubble-card"]
  }
];

// -------------------------
// WebSocket helpers
// -------------------------
let ws;
try {
  ws = new WS(wsUrl);
} catch (e) {
  safeExit({ ok: false, error: "WebSocket connection failed: " + e.message });
}

let nextId = 1;
const pending = new Map();
let finished = false;

function finish(output) {
  if (finished) return;
  finished = true;
  try { ws.close(); } catch (_) {}
  safeExit(output);
}

function call(type, payload = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    try {
      ws.send(JSON.stringify({ id, type, ...payload }));
    } catch (e) {
      pending.delete(id);
      reject(new Error("WebSocket send failed: " + e.message));
    }
  });
}

// -------------------------
// Detection: check lovelace resources
// -------------------------
async function getInstalledResources() {
  try {
    const result = await call("lovelace/resources");
    return Array.isArray(result) ? result : [];
  } catch (err) {
    return [];
  }
}

function isCardInstalled(resources, card) {
  return resources.some(r => {
    if (typeof r.url !== "string") return false;
    const urlLower = r.url.toLowerCase();
    return card.resource_keywords.some(kw => urlLower.includes(kw.toLowerCase()));
  });
}

// -------------------------
// Detection: check if HACS is available
// -------------------------
async function isHacsAvailable() {
  try {
    await call("hacs/info");
    return true;
  } catch (err) {
    return false;
  }
}

// -------------------------
// Install via HACS websocket API
// -------------------------
async function hacsInstallCard(card) {
  try {
    // Ensure the repository is known to HACS
    try {
      await call("hacs/repository/add", {
        repository: card.repository,
        category: card.category
      });
    } catch (addErr) {
      // May already be in HACS registry — ignore
    }

    // Download/install
    await call("hacs/repository/download", {
      repository: card.repository,
      category: card.category
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

// -------------------------
// Main logic
// -------------------------
async function run() {
  const resources = await getInstalledResources();
  const hacsOk = await isHacsAvailable();

  const cardsStatus = {};
  let installCount = 0;

  for (const card of REQUIRED_CARDS) {
    const installed = isCardInstalled(resources, card);
    cardsStatus[card.card_type] = {
      installed,
      repo: card.repository
    };

    if (!installed && autoInstall && hacsOk) {
      const result = await hacsInstallCard(card);
      cardsStatus[card.card_type].install_attempted = true;
      cardsStatus[card.card_type].install_ok = result.ok;
      if (result.ok) {
        cardsStatus[card.card_type].installed = true;
        installCount++;
      } else {
        cardsStatus[card.card_type].install_error = result.error;
      }
    }
  }

  const finalAllInstalled = Object.values(cardsStatus).every(c => c.installed);

  finish({
    ok: true,
    cards: cardsStatus,
    hacs_available: hacsOk,
    auto_install: autoInstall,
    all_installed: finalAllInstalled,
    newly_installed: installCount
  });
}

// -------------------------
// WebSocket events
// -------------------------
ws.onerror = (event) => {
  finish({ ok: false, error: "WebSocket error: " + (event?.message || "unknown") });
};

ws.onclose = () => {
  if (!finished) {
    finish({ ok: false, error: "WebSocket closed unexpectedly" });
  }
};

ws.onopen = () => {
  // Connexion établie, on attend auth_required
};

ws.onmessage = async (event) => {
  let msg;
  try {
    const raw = typeof event.data === "string" ? event.data : event.data.toString();
    msg = JSON.parse(raw);
  } catch (e) {
    finish({ ok: false, error: "Invalid websocket message: " + e.message });
    return;
  }

  if (msg.type === "auth_required") {
    try {
      ws.send(JSON.stringify({ type: "auth", access_token: token }));
    } catch (e) {
      finish({ ok: false, error: "Auth send failed: " + e.message });
    }
    return;
  }

  if (msg.type === "auth_invalid") {
    finish({ ok: false, error: "Authentication failed" });
    return;
  }

  if (msg.type === "auth_ok") {
    try {
      await run();
    } catch (err) {
      finish({ ok: false, error: "Run error: " + String(err?.message || err) });
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

// -------------------------
// Timeout global de sécurité (30s)
// -------------------------
setTimeout(() => {
  if (!finished) {
    finish({ ok: false, error: "Timeout: script took more than 30 seconds" });
  }
}, 30000);
