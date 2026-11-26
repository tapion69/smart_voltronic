# Changelog – Smart Voltronic Add-on

## 2.3.19 — validation terrain / field validation

- File FIFO par onduleur et priorité des écritures sur les interrogations périodiques RS232 et Gateway. Relecture de confirmation et protections contre les réponses obsolètes.
- File ESP32 prioritaire côté flow ; le firmware reste propriétaire du port UART et doit confirmer la relecture réelle. Firmware Voltronic 0.3.9 bêta recommandé comme pour 2.3.18.
- Préservation de l'apprentissage, tests mémoire vierge, profils existants, commandes successives à trois secondes, reprise après interruption, LOAD2 en liaison native et rejet des commandes MQTT retenues.
- GitHub Actions : 2 084 assertions de simulation et 64 configurations de démarrage/redémarrage validées avant promotion.
- Version installable depuis Home Assistant pour validation terrain demandée par le mainteneur. Pas de certification matérielle ni de garantie de livraison en cas de déconnexion ; sauvegarder l'add-on et contrôler les changements de paramètres avant toute automatisation critique. Les limites ESP32 existantes restent applicables.

## 2.3.18 — priorité écriture ESP32 (bêta)

- Traitement immédiat des demandes de paramètres dans la file ESP32 dès que la liaison est saine, sans attendre le cycle d'entretien de 5 secondes.
- Contrôle QPIRI adapté à la cadence native du firmware (lecture de moins de 6 minutes au lieu de moins de 2 minutes), avec relecture immédiate de la valeur réelle avant tout SET sur l'ESP32.
- Gestion du cas où la valeur est déjà appliquée : validation par relecture sans écriture supplémentaire.
- File d'attente ESP32 vérifiée toutes les secondes ; une seule modification en cours, jamais de réémission automatique si l'issue d'une écriture est incertaine.
- Serial et passerelles Ethernet inchangés ; mêmes identifiants d'entités Home Assistant.
- À utiliser avec firmware ESP32 Voltronic 0.3.9 bêta pour le meilleur comportement HTTP/SET. Essais matériels requis avant généralisation.

## 2.3.17

- Réorganisation visuelle des 63 nœuds ESP32, alignés par onduleur et par fonction : lecture, diagnostics, apprentissage, vérification QPIRI et file d’écriture.
- Les 13 groupes existants, les 385 éléments du flow, les connexions, les fonctions et les entités Home Assistant sont conservés. Seules les coordonnées des 63 nœuds ESP32 ont changé.

## 1.4.9

### Added
- Added support for **24V battery systems**
- New add-on configuration option to select **battery system voltage (24V / 48V)**

### Improved
- Home Assistant voltage parameter ranges now automatically adapt to the selected battery system
  - **24V systems**
    - Bulk: 24–30V
    - Float: 24–30V
    - Return grid voltage: 22–25.5V
    - Re-discharge voltage: 24–29V
    - Under voltage: 20–27V
  - **48V systems**
    - Existing ranges remain unchanged

### Technical
- MQTT Discovery updated to dynamically adjust voltage parameter limits based on battery system voltage
- Added internal configuration handling for battery system detection

## 🔄 v1.4.8
* Bug fixe

## 🔄 v1.4.7

### ✨ New

* Added support for **Elfin Ethernet/WiFi gateways**
* Inverters can now be connected using either **Serial (USB/RS232)** or **Gateway (TCP/IP)**
* New configuration options for each inverter:

  * `serial` connection
  * `gateway` connection (IP + port)

### ⚙️ Improvements

* Automatic TCP configuration for Elfin gateways
* Dynamic transport selection (Serial or TCP) directly from add-on configuration
* Improved startup script to apply network settings automatically
* Better connection handling when switching between Serial and Gateway modes

### 🛠 Internal

* Refactored startup script to dynamically patch TCP nodes
* Improved connection logic to prevent conflicts between Serial and TCP transports


## 🔄 Version 1.4.6
* Bug fixe

## 🔄 Version 1.4.5

### 🌍 Added Timezone Support

* New configurable timezone option in add-on settings
* Dropdown selection for common timezones
* Custom timezone support (IANA format, e.g. `Europe/Athens`)
* Used for accurate daily energy reset calculations
* Fully handled inside the add-on (no Home Assistant configuration required)

### ⚡ New Sensor: Grid Energy Today

* Added `grid_today` energy sensor
* Automatically calculated from `grid_power`
* Daily reset based on configured timezone
* Exposed via MQTT discovery
* Works on all supported inverter models

### 🌐 Translations

* Added English and French translations
* Improved configuration UI labels

### 🛠 Improvements

* Safe timezone handling in run.sh
* Robust daily energy reset logic
* No breaking changes

---

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

