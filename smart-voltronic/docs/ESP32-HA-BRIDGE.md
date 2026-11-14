# Smart Voltronic complete 322-node export + ESP32-S3 bridge — TEST ONLY

**Scope:** branch `test/esp32-ha-bridge` of `tapion69/smart_voltronic`.
Base is the user's **7 Oct 2026 322-node Node-RED export**, not the short 117-node `develop` source. This experiment now has **352 nodes**, preserving all 322 original node IDs, all 3 existing MQTT state publishers, all 3 unchanged HA discovery definitions, Voltronic Doctor, premium dashboard/House, learning profiles and COMM HEALTH logic.

Do **not install on production HA**: device hardware and full Node-RED runtime have not been validated.

## Architecture

- The ESP32-S3 is the only owner of the RS232 bus, with its original `polling_task`, CRC/XMODEM validation, NAK and error tracking.
- In mode `esp32`, Node-RED disables its own serial/TCP nodes and polling/Queue Pump and GETs **`/api/v1/bridge/snapshot` every 2 s**; authentication is `X-Setup-Code`.
- Firmware publishes cached, already CRC-verified native command replies (`QPIGS`, `QPIGS2`, `QPIRI`, `QDOP`, `QPIWS`, `QMOD`, `QBMS`, `Q1`, energies, firmware model/serial, etc.), with monotonically increasing sequence IDs and age. **GET never sends an RS232 command.**
- New Node-RED adapter deduplicates native frames, filters stale data and replays them through the **original model-specific Voltronic parser**, normalize, daily/Premium calculation and original MQTT state publisher. Inverter state topic `voltronic/N/state`, availability topic, discovery `unique_id` and existing HA entities retain their names.
- A fresh cache state is required for online availability. PV output of zero at night is not considered offline. UTC native dated energy is not used as a different local day.
- Premium COMM HEALTH uses ESP native actual UART counters (not fake synthetic queue successes) in ESP mode, preserving existing diagnostic MQTT sensor keys. Serial/TCP monitoring logic remains unchanged.
- The APK can independently read its existing `/api/v1/telemetry` and `/api/v1/details` endpoints. This branch does not change JK BMS or the Android APK.

## Config

For each inverter `N` = 1, 2, 3:
- `invN_link: esp32` (other choices unchanged: `serial`, `gateway`)
- `invN_esp_host`, `invN_esp_port` (18081), `invN_esp_code` (local setup code, 8–32 chars)
- `invN_esp_write_enabled: false` (safe default)

Credentials are read at startup into process env only. Do not put secrets in flow JSON or screenshots.

## Full learning loop (readback required)

The **original** `HA SET -> Learning Preprocess -> Decision -> Build Candidate -> RX Feedback -> State Feedback -> Complete -> Persist Profile` logic remains in place. ESP transport accepts only **known semantic parameter edits with exact native candidate encoding**, not user-supplied raw UART commands:
1. An unsupported candidate returns simulated NAK to Learning; next safe candidate is considered.
2. A supported candidate is sent to `POST /api/v1/parameters/change` with `X-Write-Confirmed: yes`, `confirmed:true`, exact previous native value, authenticated code, and optional user opt-in enabled.
3. The ESP's sole UART task performs pre-read, semantic opcode write, and fresh readback. It signals `verified:true` ONLY when readback matches.
4. The verified QPIRI/QDOP readback is also cached with a newer sequence ID. Original Learning - State Feedback can then confirm and save the profile. No failed / stale candidate can be learned.
5. Model-specific unknown aliases are not sent raw. Some candidates can therefore be rejected rather than learned, by design.

**No guarantee of compatibility with every inverter model:** QPIGS2 may NAK; optional physical PV2 or grid power cannot be fabricated. Some energy histories depend on Premium and local persistence. Voltronic Doctor diagnostics sourced from direct RS232 transport are replaced by ESP health counters in this mode.

## Run tests

```bash
node --test smart-voltronic/tests/esp32-ha-bridge.test.cjs
bash -n smart-voltronic/run.sh
```

The test suite exercises the actual 352-node functions with simulated HTTP responses; it does not boot Home Assistant, MQTT broker, Android or the ESP-IDF binary. Firmware `test_ha_bridge_contract.py`, native host C parser and semantic edit tests, and ESP-IDF build are configured on `test/esp32-ha-bridge`. Verify their real GitHub Actions run status separately.

## Hardware test exit criteria

Build CI is green; full Node-RED and HA MQTT integration without duplicate/disappearing entity IDs; 24-hour burn in with APK and HA concurrently; offline/online/restart/ESP reboot; real QPIGS2 and MPPT2/energy sources; real model-specific parameter learning and safe revert; no legacy Serial/Gateway regression.

All 322 original node IDs still exist. This export dates from October and may differ from the live November 2026 HA instance.
