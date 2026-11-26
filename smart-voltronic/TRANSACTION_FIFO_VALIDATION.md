# Transaction FIFO development candidate

**Not approved for production.** Base: 125a1d213dfd1d344b83c597d393fcee455ff51e (2.3.18).

The shipped base flow remains intact; run.sh applies transaction_fifo_patch.cjs after the two existing ESP patches. It preserves node IDs and HA discovery identifiers and routes every active inverter through a common per-inverter FIFO. An in-flight write is never blindly repeated on an ambiguous timeout. Readback retries are bounded. ESP keeps the existing offline limit of 5 and 1h TTL; healthy connections have a limit of 200. Native pending requests are memory-only. A full or expired queue produces an explicit diagnostic; no claim of guaranteed delivery through an offline MQTT publisher is made. The supported ESP semantic write set remains limited to firmware capability; forced two-choice ESP and unsupported direct commands are explicitly rejected. Native direct parameters use the existing protocol and readback rules.

Test: node smart-voltronic/tests/test_transaction_fifo.cjs; node smart-voltronic/tests/test_transaction_fifo_startup.cjs.

Before release: real serial, gateway and ESP devices, mixed three-inverter setup, dropped/late UART frames, actual ESP firmware verified-readback contract, learned profiles and Home Assistant entity refresh, prolonged bursts and recovery. Do not merge to main or publish before these checks. Existing ambiguous enum profile detection remains a hardware compatibility concern.
