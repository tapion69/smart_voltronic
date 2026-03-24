#!/usr/bin/env node
"use strict";

try {
  const action = process.argv[2] || "";
  const b64 = process.argv[3] || "";

  if (!b64) {
    throw new Error("Missing base64 payload");
  }

  const json = Buffer.from(b64, "base64").toString("utf8");
  const parsed = JSON.parse(json);

  console.log(JSON.stringify({
    ok: true,
    action,
    parsed
  }));
  process.exit(0);
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    error: err.message || String(err),
    argv: process.argv
  }));
  process.exit(1);
}
