# Transaction FIFO development candidate

**Field-validation build, not certified for production.** Base: 125a1d213dfd1d344b83c597d393fcee455ff51e (2.3.18).

The shipped base flow remains intact; run.sh applies transaction_fifo_patch.cjs after the two existing ESP patches. It preserves node IDs and HA discovery identifiers and routes every active inverter through a common per-inverter FIFO. An in-flight write is never blindly repeated on an ambiguous timeout. Readback retries are bounded. ESP keeps the existing offline limit of 5 and 1h TTL; healthy connections have a limit of 200. Native pending requests are memory-only. A full or expired queue produces an explicit diagnostic; no claim of guaranteed delivery through an offline MQTT publisher is made. The supported ESP semantic write set remains limited to firmware capability; forced two-choice ESP and unsupported direct commands are explicitly rejected. Native direct parameters use the existing protocol and readback rules.

Test: node smart-voltronic/tests/test_transaction_fifo.cjs; node smart-voltronic/tests/test_transaction_fifo_startup.cjs.

Before release: real serial, gateway and ESP devices, mixed three-inverter setup, dropped/late UART frames, actual ESP firmware verified-readback contract, learned profiles and Home Assistant entity refresh, prolonged bursts and recovery. The maintainer requested publication on main for personal field validation; do not interpret this availability as approval for general production use. Existing ambiguous enum profile detection remains a hardware compatibility concern.

## 2026-11-26 expanded short-test pass

- 1,880 transaction assertions passed in an isolated JavaScript simulation using the actual repository flow and function code, with simulated clocks, context and protocol replies.
- 64 transport combinations passed repeated startup patch application (serial, tcp, esp32, disabled per inverter; 384 simulated script invocations using in-memory filesystem/process adapters).
- Added LOAD2 FIFO/readback, retained command rejection, native fresh-response gate after uncertainty, ESP reconnect, stale completion, overflow and expiry coverage. The native guard leaves polling active while the FIFO awaits a valid response.
- These are not hardware-in-loop, actual Node-RED runtime, MQTT broker or GitHub Actions results. CI was subsequently confirmed on the development commit. Do not infer a release approval from assertion counts.
- Important operational limits: an offline ESP queue holds five entries for up to one hour; native pending commands are memory-only; unsupported ESP direct commands are rejected, not emulated. A failed or ambiguous write is not guaranteed to be applied. HA automations should validate the actual resulting state and alarm on failure.

## Promotion for maintainer field validation

GitHub Actions run 45844017808 on d4c4839ec0d478c8dd8b83bcd5ee17f74d7200fe passed 2,084 assertions, including virgin learning, and 64 repeated startup configurations. Version 2.3.19 is installable for field validation at the maintainer's request. Hardware-in-loop and full HA integration remain unverified. No ESP firmware or Android app change is included. Backup and verify actual parameter state before relying on critical automation.
