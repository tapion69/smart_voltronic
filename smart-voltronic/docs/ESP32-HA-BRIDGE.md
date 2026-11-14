# EXPERIMENTAL ESP32-S3 ↔ Smart Voltronic HA bridge

**Only for branch `test/esp32-ha-bridge`. Do not enable on a production HA installation without a backup and hardware verification.**

## Design

- ESP32-S3 remains the **sole UART1/RS232 owner** (2400 8N1).
- Smart Voltronic never issues its own `QPIGS` / serial requests in `esp32` mode. 
- Node-RED GET `/api/v1/telemetry` every 2 s and `/api/v1/details` every 15 s, with `X-Setup-Code`.
- The Node-RED canonical state adapter publishes to the **existing** MQTT `voltronic/N/state` and `voltronic/N/availability` topics, using the original MQTT state-publisher functions.
- The original HA discovery templates and `unique_id` definitions remain unchanged. Gateway/serial modes retain their existing transports.
- If the ESP32 reports stale/unavailable/error, availability becomes `offline`. Zero solar production is valid and does not mark the inverter unavailable.
- Battery / grid / load / PV daily integrals are computed locally in Node-RED in the selected timezone; native total energy is read from ESP details. Those values are new integration histories and may differ from historic Node-RED totals.

## Per-inverter add-on configuration

`invN_link: esp32` (N = 1, 2 or 3), `invN_esp_host`, `invN_esp_port` (default 18081) and `invN_esp_code` (8–32 characters, local access code). `invN_esp_write_enabled` is **false by default**.

Only `run.sh` exposes the code to Node-RED as a process environment variable. Never store the code in a function body, flow JSON, issue, CI log or README.

Do not point serial/gateway at the same inverter while an ESP32 also owns its serial port. Each configured inverter has its own bridge and HA state.

## Parameter changes

If and only if `invN_esp_write_enabled=true`, Home Assistant SET messages are mapped from allowed semantic parameter names to the firmware's `POST /api/v1/parameters/change`.

The ESP32 checks an explicit confirmation header, validates the native SET value against its whitelist, performs a **fresh pre-read, SET, fresh post-read**, and reports `verified`. The Node-RED bridge does not forward raw UART commands and does not automatically retry a failed edit.

**Known limitation:** legacy automatic fallback/learning of alternate opcodes is **not available in ESP mode**. Unsafe fallback guesses (for example using a command that may affect a different voltage setting) are deliberately disabled pending a verified device-specific mapping.

The APK continues to read the same ESP32 HTTP cache independently; no Android or JK BMS code is changed.

## Offline regression

```bash
node --test smart-voltronic/tests/esp32-ha-bridge.test.cjs
bash -n smart-voltronic/run.sh
```

The Node.js test runner executes the actual Node-RED JavaScript functions using mocked node/context/flow/global/HTTP responses. It does not boot a full Home Assistant or Node-RED runtime. A separate ESP-IDF CI workflow builds the firmware on the matching test branch.

## Exit criteria before hardware

1. Node.js flow tests and ESP-IDF/GCC firmware tests must succeed in GitHub Actions.
2. Validate real ESP hardware with read-only mode before permitting writes.
3. Compare old/new HA discovery topic + unique IDs, using a snapshot.
4. Check two concurrent clients (APK + HA), timeout recovery, 24 h load, NAK and stale-data cases.
5. No changes or installation on existing `main`, `develop` or APK `dev` branches.
