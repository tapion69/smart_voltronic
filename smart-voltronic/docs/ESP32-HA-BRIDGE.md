# Full-flow Voltronic ESP32 ↔ Smart Voltronic (experimental only)

Baseline: user export `flows (1)(20261007-154232).json` from 7 Oct 2026 (**322 nodes**), not the reduced 117-node `develop` flow.
The version-controlled `flows.json` in this branch contains **340** nodes (322 original IDs preserved + 18 ESP32 cached snapshot nodes). On add-on startup, `run.sh` merges **15** more nodes from `esp32_learning_nodes.json` idempotently: 355 runtime nodes.

## Read-only telemetry and Home Assistant parity

Every 2 seconds, the ESP32 HTTP client reads `GET /api/v1/bridge/snapshot` with `X-Setup-Code`. The response contains up to 20 independently CRC-validated latest raw responses from the firmware's single UART poller, including QPIGS, QPIGS2, QMOD, QPIRI, QDOP, QPIWS, Q1, QBMS, QMN, QID, QVFW, QVFW3, and QET/QLT/QED/QLD/QEM/QLM/QEY/QLY.

The bridge validates freshness, command allowlist, sequence number, reboot and stale data, reconstructs a Voltronic-framed message in memory and sends it into the **existing original full-flow parser** for that inverter. It then traverses the original normalize, energy, premium, MQTT discovery, publisher and Doctor functions. No new Home Assistant unique IDs or state topics are created.

The original discovery template declares **85 sensors**, **1 text**, **6 selects**, **12 numbers** and **5 switches**, = **109 entities per configured inverter**. These IDs and templates remain byte-for-byte unchanged in this experimental branch. Identity preservation does **not** mean that every sensor is populated by all inverter models or that every write control is supported.

The ESP32 remains UART master; Node-RED disables Serial/TCP legacy I/O for the inverter only while `invN_link=esp32`. The Android app can continue GETting shared cached telemetry independently.

## Learning / SET commands

Existing full-flow Learning Preprocess → Decision → Build Candidate → RX Feedback → State Feedback → Persist Profile is preserved. In ESP mode, only selected semantic learning candidates reach the firmware's existing `POST /api/v1/parameters/change`; writes are **opt-in** via `invN_esp_write_enabled=true` and require fresh QPIRI preview and a known parameter.

The firmware (0.3.7-test-ha-bridge) authenticates each request, enforces a strict semantic allowlist and exact old-value check, performs one UART SET per transaction, and immediately verifies a fresh native QPIRI/QDOP readback. It distinguishes definitive NAK (same-setting safe alternate serialization may be attempted) from unknown outcome/timeout (terminal, never auto-retry).

The only alternate encodings currently accepted are variants of `MUCHGC` and `MNCHGC` for the *same* current setting. **Cross-setting guesses such as PBCV for bulk are rejected** to avoid modifying recharge voltage inadvertently. MQTT settings and LOAD2 commands are **not** forwarded as unchecked raw serial operations.

## Unresolved parity gaps: do NOT install on production

- Original full flow has `MODBUS_MPPT2` fallback when QPIGS2 is unsupported. The ESP32 UART poller does **not** implement that Modbus fallback yet. A PV2 sensor may legitimately be unavailable on affected inverters.
- LOAD2 controls/thresholds, some diagnostic toggles and other non-read-only operations are not available through the current protected firmware write allowlist. Readonly status from QDOP is available where the firmware emits it.
- Normalized derived sensors (daily/monthly/yearly totals, quality score, Doctor) need comparative long-running HA tests, especially rollover in `Europe/Paris`. Merely retaining code does not prove semantic parity.
- A full Node-RED broker and Home Assistant instance, Android app, ESP-IDF build, hardware CRC and two-client load test have **not** been validated in this session.
- The baseline is from October 7, 2026 and may not represent today's on-device 300+ node flow.

## Tests

```bash
node --test smart-voltronic/tests/esp32-ha-bridge.test.cjs
bash -n smart-voltronic/run.sh
```

This test runner executes the **actual JavaScript function bodies** in an isolated harness (mocked Node-RED context, env, HTTP, MQTT). Source checks and replay tests were additionally executed in an isolated JavaScript tool runtime. Such tests are not equivalent to running the complete Node-RED process on Home Assistant.

Protect `main`, `develop`, Android `dev` and real ESP32 devices. This is strictly the `test/esp32-ha-bridge` experiment.
