# 🔋 Smart Voltronic – Add-on Home Assistant

➡️ **Read this README in English :**
[https://github.com/tapion69/smart-voltronic/blob/main/smart-voltronic/README.md](https://github.com/tapion69/smart-voltronic/blob/main/smart-voltronic/README.md)

☕ **Soutenir le développement :**
Si vous aimez ce projet, vous pouvez soutenir son évolution ici :
https://ko-fi.com/tapion69

---

Add-on Home Assistant permettant de **surveiller et piloter jusqu’à 3 onduleurs Voltronic / Axpert**.

Compatible avec la majorité des modèles utilisant le protocole Voltronic (Axpert, VM, MKS, MAX, MAX II, MAX IV…).

---

# 🔧 Installation – Câble RS232 & Adaptateur USB

Cet add-on communique avec l’onduleur via le **port RS232 Voltronic (connecteur RJ45)**.

Pour connecter votre onduleur à Home Assistant, vous devez :

1️⃣ Fabriquer un **câble RJ45 → DB9**
2️⃣ Utiliser un **adaptateur USB → RS232**

---

## 🧰 Matériel nécessaire

Vous aurez besoin de :

* Connecteur RJ45 (prise Ethernet)
* Connecteur DB9 femelle
* Petit câble (**3 fils seulement nécessaires**)
* Adaptateur USB → RS232 (**FTDI recommandé**)

---

## 🔌 Câblage RJ45 → DB9

Les onduleurs Voltronic exposent le port RS232 sur un **connecteur RJ45**.
Seuls **TX / RX / GND** sont nécessaires.

### Schéma de câblage

![RJ45 to DB9 pinout](docs/images/cable-rj45-db9-pinout.jpg)

### Tableau de câblage

| Pin RJ45 | Pin DB9 | Signal |
| -------- | ------- | ------ |
| 1        | 2       | TX     |
| 2        | 3       | RX     |
| 8        | 5       | GND    |

⚠️ Important :

* Dessin RJ45 = **vue de dessus**
* Dessin DB9 = **vue de face (femelle)**

---

## 🪛 Exemple de câble terminé

![RJ45 DB9 cable](docs/images/cable-rj45-db9.jpg)

À l’intérieur du RJ45, seulement **3 fils sont connectés** :

![RJ45 wiring close-up](docs/images/cable-rj45-inside.jpg)

---

## 🔌 Adaptateur USB → RS232

Le câble DB9 doit être connecté à Home Assistant via un adaptateur USB.

Chipsets recommandés :

* ⭐ FTDI (meilleure compatibilité)
* ✔️ Prolific PL2303 (fonctionne bien)

Exemple :

![USB RS232 adapter](docs/images/usb-rs232-adapter.png)

---

## 🖥️ Connexion finale

```
Port RJ45 onduleur
      ↓
Câble RJ45 → DB9 (DIY)
      ↓
Adaptateur USB → RS232
      ↓
Home Assistant / Raspberry Pi / Serveur
```

Une fois branché, le port série apparaîtra sous :

```
/dev/serial/by-id/...
```

Vous pouvez maintenant configurer le port dans l’add-on 🎉

---

# ⚙️ Configuration (Important)

## 🔌 Nombre d’onduleurs supportés

L’add-on peut gérer **jusqu’à 3 onduleurs simultanément** :

* Série 1 → Onduleur 1
* Série 2 → Onduleur 2
* Série 3 → Onduleur 3

Chaque onduleur possède :

* Son propre port série
* Son propre namespace MQTT
* Ses propres entités Home Assistant

### Topics MQTT

```
voltronic/1/...
voltronic/2/...
voltronic/3/...
```

Chaque onduleur est totalement isolé des autres.

---

## 🧠 Compatibilité multi-modèles

Les différences de firmware sont gérées automatiquement :

* Détection des commandes supportées
* Gestion automatique des NAK
* Adaptation automatique du format
* Fallback intelligent si nécessaire

Vous pouvez mélanger différents modèles **sans modifier le code**.

---

# ✨ Fonctionnalités principales

## 🟢 Supervision complète

Intégration automatique dans Home Assistant :

* Statut onduleur en temps réel
* Puissance PV / Batterie / Charge
* Énergie journalière / mensuelle / annuelle
* Températures, tensions, courants
* Alarmes et avertissements
* Statut MPPT
* État de charge batterie
* Statut charge solaire et secteur

Rafraîchissement ≈ **4 secondes**.

---

## 🎛️ Contrôle depuis Home Assistant

Modification des paramètres directement depuis HA :

### Priorités sortie & charge

* Priorité sortie (Utility / Solar / SBU)
* Priorité charge (Solar First / Solar + Utility / Solar Only)
* Type de batterie

### Tensions batterie

* Bulk (CV)
* Float
* Recharge
* Re-discharge
* Cut-off

### Courants

* Courant de charge max
* Courant de charge secteur max
* Courant de décharge max

Chaque modification :

1. Est envoyée à l’onduleur
2. Est relue automatiquement
3. Est synchronisée avec Home Assistant

Aucune désynchronisation possible.

---

# 🌐 Support futur – Modules Gateway / Ethernet

Une future version ajoutera le support des **modules gateway** (Wi-Fi / Ethernet) pour des installations sans USB.

---

# 🏠 Intégration Home Assistant

Création automatique via **MQTT Auto-Discovery** :

* Sensors
* Numbers
* Selects
* Switches
* Binary sensors

Aucune configuration YAML requise.

---

# 🔄 Synchronisation automatique

Après chaque modification :

* Lecture complète des paramètres
* Vérification automatique
* Home Assistant reflète toujours l’état réel

---

# 🔐 Robuste & Fiable

* Gestion automatique des erreurs série
* Protection commandes invalides
* File d’attente série (anti-collision)
* Redémarrage automatique
* Compatible systèmes parallèles

---

# 📊 Télémétrie anonyme (optionnelle)

Pour savoir combien d’installations utilisent l’add-on, une **télémétrie anonyme optionnelle** est disponible.

Lorsqu’elle est activée, l’add-on envoie un petit **ping quotidien (“bip”)** qui incrémente simplement un compteur global.

### Respect de la vie privée

Aucune donnée personnelle n’est envoyée :

* ❌ Aucune IP stockée
* ❌ Aucune donnée Home Assistant
* ❌ Aucune donnée MQTT
* ❌ Aucune donnée onduleur
* ❌ Aucun numéro de série

Seul le **nombre d’installations** est compté.

### Activer / désactiver

Activé par défaut :

```yaml
send_bip: true
```

Désactiver :

```yaml
send_bip: false
```

L’add-on fonctionne exactement pareil lorsqu’il est désactivé.

---

## 📄 Liste complète des paramètres

[https://github.com/tapion69/smart-voltronic/blob/main/smart-voltronic/PARAMETERS.md](https://github.com/tapion69/smart-voltronic/blob/main/smart-voltronic/PARAMETERS.md)

---

# 🛠️ Support & Suggestions

Ouvrez une **issue GitHub** pour signaler un bug ou proposer une fonctionnalité.

---

# ❤️ Contribution

Projet open-source en évolution.
Contributions et retours bienvenus.
-
---

**Pilotage intelligent des onduleurs dans Home Assistant 🚀**

