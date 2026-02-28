# Changelog – Smart Voltronic Add-on

## v1.4.4
- Bug fixe

## v1.4.3

### ✨ New features
- MQTT Discovery is now **dynamic based on configured inverters**.
- Entities are created **only for configured serial ports**.
- Prevents Home Assistant from creating unused inverter devices.

### ⚙️ Improvements
- Refactored MQTT Discovery code to a **generic multi-inverter architecture**.
- Removed duplicated discovery logic for inverter 1/2/3.
- Easier maintenance and future feature additions.

### 🚀 Reliability
- Prevents ghost devices and unused entities when only one inverter is connected.
- Ensures Home Assistant device list always matches the real hardware configuration.

## v1.4.2

### ✨ New features
- Added new **Inverter Output Current** sensor (A).
- This sensor estimates the AC output current using inverter power and voltage.

### ℹ️ Notes
- The inverter does **not provide this value directly**.
- The current is **calculated by the add-on** using real-time measurements (Power ÷ Voltage).

## v1.4.1

### 🐞 Fixes
- Fixed sensors resetting to `0` or `unknown` after Home Assistant or add-on restart.
- MQTT state topic is now published with **retain enabled**.

### 🚀 Improvements
- Home Assistant now restores the **last known inverter values instantly** after restart.
- Improved overall reliability and startup behavior.

## v1.4.0

### ✨ New features
- Added new **Global Battery Current** sensor (A).
- The sensor provides a **signed current value**:
  - Positive → battery charging  
  - Negative → battery discharging
- Automatically created via MQTT Discovery (no Home Assistant setup required).

### ⚙️ Improvements
- Improved battery monitoring with clearer charge/discharge visibility.

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

