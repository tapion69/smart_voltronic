#!/usr/bin/env node
"use strict";

console.log(JSON.stringify({
  ok: true,
  action: process.argv[2] || "",
  arg: process.argv[3] || "",
  argv: process.argv
}));
process.exit(0);
