# 📊 PARAMETERS.md

## Smart Voltronic – Liste des capteurs & paramètres

Ce fichier référence les entités actuellement exposées dans Home Assistant.

⚠️ Selon le modèle d’onduleur, certaines valeurs peuvent ne pas être disponibles.

---

# 🔎 Informations onduleur

* Inverter model
* Inverter serial
* Firmware main
* Firmware remote
* Fault state
* Fault details
* Warning state
* Warning details

---

# ⚡ Réseau (Grid)

* Grid voltage
* Grid frequency
* Grid power

---

# 🔌 Sortie AC

* AC output voltage
* AC output frequency
* AC output active power
* Output load %

---

# 🔋 Batterie

## Mesures

* Battery voltage
* Battery capacity (%)
* Battery power
* Battery charging current
* Battery discharging current
* Battery charge power
* Battery discharge power

## Paramètres configurables

* Battery type
* Bulk voltage
* Float voltage
* Battery recharge voltage
* Battery re-discharge voltage
* Battery under voltage

## Courants configurables

* Max charging current (PV + AC)
* Max AC charging current (grid)
* Max discharging current

## Seuils batterie (%)

* Battery under capacity %
* Battery recharge capacity %
* Battery redischarge capacity %

---

# ☀️ Solaire (PV)

## Mesures temps réel

* PV total power
* PV1 voltage
* PV1 current
* PV1 power
* PV2 voltage *(si présent)*
* PV2 current *(si présent)*
* PV2 power *(si présent)*

## Energie solaire

* PV today
* PV month
* PV year
* PV total

---

# 🏠 Consommation maison

* Load today
* Load month
* Load total
* Load year
* Output load %

---

# 🔥 Température

* Inverter heatsink temperature

---

# ⚙️ Mode & priorités

* Operation mode (Line / Battery / Fault / Standby…)
* Output source priority
* Charger source priority

---

# 🔄 Multi-onduleurs

Toutes les entités existent pour :

* Onduleur 1
* Onduleur 2
* Onduleur 3

Topics MQTT utilisés :

voltronic/<id>/state
voltronic/<id>/set/<param>

---

# 🚀 Roadmap

Prochaines évolutions prévues :

* Support des modules **Elfin Wi-Fi / Ethernet**
* Amélioration détection automatique des modèles
* Ajout de nouveaux flags firmware
* Support étendu des systèmes parallèles

---

Ce fichier évoluera avec les prochaines versions de l’add-on.
