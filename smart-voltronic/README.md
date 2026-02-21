Here’s a clean, polished **English README** ready for GitHub, with a French link at the top and a Buy-Me-a-Coffee line added 👍

---

# 🔋 Smart Voltronic – Home Assistant Add-on

➡️ **Lire ce README en français :**
https://github.com/tapion69/smart-voltronic/blob/main/smart-voltronic/README_FR.md

☕ **Support the developers:**
If you like this project, you can support future development here:
buymeacoffee.com/tapion

---

Home Assistant add-on designed to **monitor and control up to 3 Voltronic / Axpert inverters**.

Compatible with most models using the Voltronic protocol (Axpert, VM, MKS, MAX, MAX II, MAX IV…).

---

# ⚙️ Configuration (Important)

## 🔌 Number of supported inverters

The add-on can manage **up to 3 inverters simultaneously**:

* Serial 1 → Inverter 1
* Serial 2 → Inverter 2
* Serial 3 → Inverter 3

Inverters can be:

* Standalone
* Parallel Voltronic systems
* Different models and generations

Each inverter has:

* Its own serial port
* Its own MQTT namespace
* Its own Home Assistant entities

### MQTT Topics

```
voltronic/1/...
voltronic/2/...
voltronic/3/...
```

Each inverter is completely isolated from the others.

---

## 🧠 Multi-model compatibility

Firmware differences between generations are handled automatically:

* Detection of supported commands
* Automatic NAK handling
* Automatic format adaptation
* Smart fallback when needed

You can mix different inverter models **without modifying any code**.

---

# ✨ Main Features

## 🟢 Full monitoring

Automatic data integration into Home Assistant:

* Real-time inverter status (mode, charging, discharging, PV, grid…)
* PV / Battery / Load power
* Daily / Monthly / Yearly energy
* Temperatures, voltages, currents
* Alarms and warnings
* MPPT status
* Battery State of Charge
* AC charging & solar charging status

Fast refresh rate (~4 seconds).

---

## 🎛️ Control directly from Home Assistant

Adjust inverter settings directly from HA:

### Output & Charging priorities

* Output priority (Utility / Solar / SBU)
* Charging priority (Solar First / Solar + Utility / Solar Only)
* Battery type

### Battery voltages

* Bulk (CV)
* Float
* Recharge
* Re-discharge
* Cut-off

### Currents

* Max charging current (total)
* Max AC charging current (grid)
* Max discharging current

### Battery thresholds & firmware options

Every change:

1. Is sent to the inverter
2. Is automatically read back
3. Is synchronized with Home Assistant

No desynchronization possible.

---

# 🌐 Future support – gateway / Ethernet modules

A future release will add support for **gateway**, allowing inverters to connect via:

* Wi-Fi
* Ethernet

This enables **USB-free installations**, ideal for remote setups or technical racks.

---

# 🏠 Home Assistant Integration

Entities are created automatically via **MQTT Auto-Discovery**:

* Sensors
* Numbers
* Selects
* Switches
* Binary sensors

No YAML configuration required.

---

# 🔄 Automatic synchronization

After each setting change:

* A burst read is triggered
* Parameters are verified
* Home Assistant always reflects the **real inverter state**

---

# 🔐 Robust & Reliable

* Automatic serial error handling
* Invalid command protection
* Serial queue (collision prevention)
* Automatic restart on failure
* Compatible with parallel systems

---

## 📄 Full parameter list

The complete list of sensors and settings is available here:

👉 [https://github.com/tapion69/smart-voltronic/blob/main/smart-voltronic/PARAMETERS.md](https://github.com/tapion69/smart-voltronic/blob/main/smart-voltronic/PARAMETERS.md)

---

# 🧩 To be completed

You may add:

* RS232 / USB wiring diagram
* Recommended adapters
* Hardware installation examples

---

# 🛠️ Support & Suggestions

For bugs, issues, or feature requests, please open an **issue on the GitHub repository**.

---

# ❤️ Contribution

Open-source and evolving project.
Contributions and feedback are very welcome.

---

**Smart inverter control, fully integrated into Home Assistant 🚀**
