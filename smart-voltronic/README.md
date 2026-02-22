# 🔋 Smart Voltronic – Home Assistant Add-on

➡️ **Lire ce README en français :**
[https://github.com/tapion69/smart-voltronic/blob/main/smart-voltronic/README_FR.md](https://github.com/tapion69/smart-voltronic/blob/main/smart-voltronic/README_FR.md)

☕ **Support the developers:**
If you like this project, you can support future development here:
https://ko-fi.com/tapion69

---
## 📸 Screenshots

### 🔎 Device information & status

Monitor inverter status, firmware, warnings and fault details directly in Home Assistant.

![Device info](docs/images/dashboard-overview.png)

---

### ⚙️ Inverter settings from Home Assistant

Change key inverter parameters directly from Home Assistant UI:
battery type, charging priority, voltages, grid settings and more.

![Settings](docs/images/inverter-settings.png)

---

### ⚡ Real-time power monitoring

Track all critical electrical values in real time:
AC output, battery charge/discharge, grid usage and load statistics.

![Power](docs/images/inverter-power.png)

---

### ☀️ Solar production tracking

Monitor PV production, MPPT inputs, daily/monthly/yearly solar statistics.

![PV](docs/images/inverter-pv.png)

---

Home Assistant add-on designed to **monitor and control up to 3 Voltronic / Axpert inverters**.

Compatible with most models using the Voltronic protocol (Axpert, VM, MKS, MAX, MAX II, MAX IV…).

---

# 🔧 Installation – RS232 Cable & USB Adapter

This add-on communicates with the inverter using the **Voltronic RS232 port (RJ45 connector)**.

To connect your inverter to Home Assistant, you must:

1️⃣ Build a **RJ45 → DB9 serial cable**
2️⃣ Use a **USB → RS232 adapter**

---

## 🧰 Required hardware

You will need:

* RJ45 connector (Ethernet plug)
* DB9 female connector
* Small cable (**only 3 wires required**)
* USB → RS232 adapter (**FTDI recommended**)

---

## 🔌 RJ45 → DB9 wiring

Voltronic inverters expose the RS232 port on an **RJ45 connector**.
Only **TX / RX / GND** are required.

### Pinout diagram

![RJ45 to DB9 pinout](https://raw.githubusercontent.com/tapion69/smart-voltronic/main/smart-voltronic/docs/images/cable-rj45-db9-pinout.jpg)

### Wiring table

| RJ45 Pin | DB9 Pin | Signal |
| -------- | ------- | ------ |
| 1        | 2       | TX     |
| 2        | 3       | RX     |
| 8        | 5       | GND    |

⚠️ Important:

* RJ45 drawing = **Top view**
* DB9 drawing = **Front view (female)**

---

## 🪛 Example finished cable

![RJ45 DB9 cable](https://raw.githubusercontent.com/tapion69/smart-voltronic/main/smart-voltronic/docs/images/cable-rj45-db9.jpg)

Inside the RJ45 connector, only **3 wires are connected**:

![RJ45 wiring close-up](https://raw.githubusercontent.com/tapion69/smart-voltronic/main/smart-voltronic/docs/images/cable-rj45-inside.jpg)

---

## 🔌 USB → RS232 adapter

You must connect the DB9 cable to Home Assistant using a USB adapter.

Recommended chipsets:

* ⭐ FTDI (best compatibility)
* ✔️ Prolific PL2303 (works well)

Example adapter:

![USB RS232 adapter](https://raw.githubusercontent.com/tapion69/smart-voltronic/main/smart-voltronic/docs/images/usb-rs232-adapter.png)

---

## 🖥️ Final connection

```
Inverter RJ45 port
      ↓
RJ45 → DB9 cable (DIY)
      ↓
USB → RS232 adapter
      ↓
Home Assistant / Raspberry Pi / Server
```

Once plugged, the serial port will appear as:

```
/dev/serial/by-id/...
```

You can now configure the port inside the add-on 🎉

---

# ⚙️ Configuration (Important)

## 🔌 Number of supported inverters

The add-on can manage **up to 3 inverters simultaneously**:

* Serial 1 → Inverter 1
* Serial 2 → Inverter 2
* Serial 3 → Inverter 3

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

* Real-time inverter status
* PV / Battery / Load power
* Daily / Monthly / Yearly energy
* Temperatures, voltages, currents
* Alarms and warnings
* MPPT status
* Battery State of Charge
* AC & solar charging status

Refresh rate ≈ **4 seconds**.

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

* Max charging current
* Max AC charging current
* Max discharging current

Every change:

1. Is sent to the inverter
2. Is automatically read back
3. Is synchronized with Home Assistant

No desynchronization possible.

---

# 🌐 Future support – Gateway / Ethernet modules

Future versions will support **gateway modules** (Wi-Fi / Ethernet) for **USB-free installations**.

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

* Burst read triggered
* Parameters verified
* HA always reflects the **real inverter state**

---

# 🔐 Robust & Reliable

* Automatic serial error handling
* Invalid command protection
* Serial queue (collision prevention)
* Automatic restart on failure
* Compatible with parallel systems

---

# 📊 Anonymous telemetry (optional)

To help understand how many installations are running the add-on, an **optional anonymous telemetry ping** can be enabled.

When enabled, the add-on sends a small daily **“bip”** request that increments a global counter.

### Privacy first

The telemetry contains **NO personal or technical data**:

* ❌ No IP stored
* ❌ No Home Assistant data
* ❌ No MQTT data
* ❌ No inverter data
* ❌ No serial numbers

It only counts **how many installations exist**.

### Enable / disable

Enabled by default:

```yaml
send_bip: true
```

Disable telemetry:

```yaml
send_bip: false
```

The add-on works exactly the same when disabled.

---

## 📄 Full parameter list

[https://github.com/tapion69/smart-voltronic/blob/main/smart-voltronic/PARAMETERS.md](https://github.com/tapion69/smart-voltronic/blob/main/smart-voltronic/PARAMETERS.md)

---

# 🛠️ Support & Suggestions

Open an **issue on GitHub** for bugs or feature requests.

---

# ❤️ Contribution

Open-source and evolving project.
Contributions and feedback are welcome.

---

**Smart inverter control, fully integrated into Home Assistant 🚀**
