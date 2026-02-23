# Changelog – Smart Voltronic Add-on

## v1.3.8

### 🐞 Fixes
- Fixed incorrect handling of **Max Discharging Current** parameter.

### ⚙️ Improvements
- Added **better error handling and logging** to reduce Home Assistant log spam.
- Improved MQTT payload sanitization and command normalization.
- Ensured **inverter parameters (QPIRI / QDOP / diagnostics)** are fetched immediately at startup.

### 🚀 Reliability
- More robust startup sequence to guarantee parameters and diagnostics are available right after boot.

## v1.3.7 – Initial release

🎉 First functional release of the add-on.

### Added

* Add-on is now **operational**
* Serial communication with Voltronic inverters
* MQTT data publishing
* Home Assistant integration (auto-discovery)
* Foundation for multi-inverter support

