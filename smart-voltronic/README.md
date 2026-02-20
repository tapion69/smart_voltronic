# 🔋 Smart Voltronic – Home Assistant Add-on

Add-on Home Assistant permettant de **superviser et piloter jusqu’à 3 onduleurs Voltronic / Axpert**.

Compatible avec la majorité des modèles utilisant le protocole Voltronic (Axpert, VM, MKS, MAX, MAX II, MAX IV…).

---

# ⚙️ Configuration (Important)

## 🔌 Nombre d’onduleurs supportés

L’add-on peut gérer **jusqu’à 3 onduleurs simultanément** :

* Serial 1 → Onduleur 1
* Serial 2 → Onduleur 2
* Serial 3 → Onduleur 3

Les onduleurs peuvent être :

* Indépendants
* En parallèle Voltronic
* De modèles différents

Chaque onduleur dispose :

* De son port série dédié
* De son espace MQTT dédié
* De ses propres entités Home Assistant

### Topics MQTT

voltronic/1/...
voltronic/2/...
voltronic/3/...

Chaque onduleur est totalement isolé des autres.

---

## 🧠 Compatibilité multi-modèles

Les différences firmware entre générations sont automatiquement gérées :

* Détection des commandes supportées
* Gestion des réponses NAK
* Adaptation automatique des formats
* Fallback intelligent si nécessaire

Vous pouvez donc connecter des modèles différents sans modifier le code.

---

# ✨ Fonctionnalités principales

## 🟢 Supervision complète

Remontée automatique dans Home Assistant :

* Etat temps réel (mode, charge, décharge, PV, réseau…)
* Puissances PV / Batterie / Charge
* Energie journalière / mensuelle / annuelle
* Températures, tensions, courants
* Alarmes et warnings
* Etats des MPPT
* Etat de charge batterie
* Statut charge AC / charge solaire

Mise à jour rapide (~4 secondes).

---

## 🎛️ Pilotage depuis Home Assistant

Paramètres modifiables :

* Priorité de sortie (Utility / Solar / SBU)
* Priorité de charge (Solar first / Solar+Utility / Solar only)
* Type de batterie
* Tensions batterie :

  * Bulk (CV)
  * Float
  * Recharge
  * Re-discharge
  * Cut-off
* Courants :

  * Max charging current (total)
  * Max AC charging current (secteur)
  * Max discharging current
* Seuils batterie (%)
* Options firmware

Chaque modification :

1. Est envoyée à l’onduleur
2. Est automatiquement relue
3. Est synchronisée avec Home Assistant

Aucune désynchronisation possible.

---

# 🌐 Support futur des modules Elfin (Wi-Fi / Ethernet)

Une prochaine version ajoutera la **prise en charge des modules Elfin** permettant de connecter les onduleurs :

* via Wi-Fi
* via Ethernet

Cela permettra une intégration **sans liaison USB directe**, idéale pour les installations distantes ou les baies techniques.

---

# 🏠 Intégration Home Assistant

Les entités sont créées automatiquement via MQTT Auto-Discovery :

* Sensors
* Numbers
* Select
* Switches
* Binary sensors

Aucune configuration YAML requise.

---

# 🔄 Synchronisation automatique

Après chaque modification :

* Une rafale de lecture est déclenchée
* Les paramètres sont revalidés
* HA reflète toujours l’état réel de l’onduleur

---

# 🔐 Robustesse

* Gestion automatique des erreurs série
* Protection contre commandes invalides
* File d’attente série (anti-collision)
* Redémarrage automatique en cas d’erreur
* Compatible systèmes parallèles

---

## 📄 Liste complète des paramètres

La liste détaillée des capteurs et paramètres est disponible ici :

👉 https://github.com/TON_GITHUB/smart-voltronic-addon/blob/main/smart-voltronic/PARAMETERS.md](https://github.com/tapion69/smart-voltronic/blob/main/smart-voltronic/PARAMETERS.md
---

# 🧩 À compléter

Vous pouvez ajouter ici :

* Schéma de câblage RS232 / USB
* Adaptateurs recommandés
* Exemple d’installation matérielle

---

# 🛠️ Support & Suggestions

Pour tout problème, bug ou proposition d’amélioration, merci d’ouvrir une **issue sur le dépôt GitHub** du projet.

---

# ❤️ Contribution

Projet open-source et évolutif.
Les contributions et retours sont les bienvenus.

---

**Smart inverter control, fully integrated into Home Assistant 🚀**
