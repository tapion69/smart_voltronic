# Changelog – Smart Voltronic Add-on

## v1.3.9

### ✨ New features
- Added **daily battery energy sensors**:
  - Battery charge today (kWh)
  - Battery discharge today (kWh)
- These sensors are now **automatically created** by the add-on (no Home Assistant configuration required).

### ℹ️ Notes
- Daily battery energy values are **calculated by the add-on** from real-time power measurements.
- These values are **not provided directly by the inverter**.
- Automatic reset at midnight (local time).

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

