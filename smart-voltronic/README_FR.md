# 🔋 Smart Voltronic – Add-on Home Assistant

Contrôlez et surveillez vos **onduleurs Voltronic / Axpert** directement depuis Home Assistant grâce à un système avancé d’apprentissage des commandes, des modes de compatibilité configurables et des fonctionnalités Premium optionnelles.

➡️ Documentation anglaise :  
https://github.com/jean-luc1203/voltronic-rs232-addon/blob/main/smart-voltronic/README.md

## ☕ Supporter le développement

Smart Voltronic est un projet open-source développé sur le temps libre.

Si ce projet vous est utile vous pouvez soutenir le développement et débloquer les fonctionnalités Premium :

<a href="https://ko-fi.com/tapion69">
<img src="https://raw.githubusercontent.com/tapion69/smart-voltronic/main/smart-voltronic/docs/images/kofi-button.png" width="300">
</a>

![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Addon-blue)
![Voltronic](https://img.shields.io/badge/Onduleur-Voltronic-compatible-orange)
![MQTT](https://img.shields.io/badge/MQTT-Auto%20Discovery-green)
![Premium](https://img.shields.io/badge/Premium-Disponible-gold)

---

# 🚀 Nouveautés

## ⭐ Fonctionnalités Premium

Smart Voltronic Premium débloque des capteurs avancés et des valeurs calculées lorsque certaines données ne sont pas fournies par l’onduleur.

L’add-on reste totalement fonctionnel sans Premium.

Le Premium permet :

* Calcul des énergies PV mensuelles et annuelles si l’onduleur ne les fournit pas
* Calcul des énergies Load mensuelles et annuelles si l’onduleur ne les fournit pas
* Calcul des énergies batterie mensuelles et annuelles
* Indicateur santé batterie
* Indicateur santé onduleur
* Répartition journalière solaire / batterie / réseau
* Dashboard Premium avancé

---

# 🔑 Comment activer le Premium

Le Premium est lié à votre **Install ID Home Assistant**.

## Étape 1 — Trouver votre Install ID

Aller dans :

**Paramètres → Appareils et services → MQTT**

Puis ouvrir :

**Smart Voltronic System**

Vous trouverez le capteur :

**Install ID**

---

## Étape 2 — Acheter le Premium

Acheter le Premium via Ko-fi :

https://ko-fi.com/tapion69

Lors de l’achat, envoyez votre **Install ID**.

---

## Étape 3 — Activer le Premium

Ajouter votre clé dans la configuration de l’add-on :

premium_key: VOTRE_CLE

Redémarrer l’add-on.

Le Premium s’active automatiquement.

---

# 📊 Logique Free vs Premium

Smart Voltronic utilise toujours en priorité les valeurs natives de l’onduleur.

Le Premium intervient uniquement si la donnée n’existe pas.

---

## Énergies PV

PV journalier :
✔ Free

PV mensuel :
✔ Free si l’onduleur fournit la valeur  
⭐ Premium sinon

PV annuel :
✔ Free si l’onduleur fournit la valeur  
⭐ Premium sinon

---

## Énergies Load

Load journalier :
✔ Free

Load mensuel :
✔ Free si l’onduleur fournit la valeur  
⭐ Premium sinon

Load annuel :
✔ Free si l’onduleur fournit la valeur  
⭐ Premium sinon

---

## Énergies batterie

Charge / décharge batterie journalière :
✔ Free

Charge batterie mensuelle :
⭐ Premium uniquement

Charge batterie annuelle :
⭐ Premium uniquement

---

## Énergies Grid

Les valeurs Grid sont disponibles uniquement si l’onduleur fournit les données réseau.

Grid journalier :
✔ Free si supporté

Grid mensuel :
✔ Free si supporté  
⭐ Premium fallback sinon

Grid annuel :
✔ Free si supporté  
⭐ Premium fallback sinon

Si l’onduleur ne fournit pas les données réseau, Smart Voltronic ne peut pas calculer de valeurs fiables.

---

## ❤️ Indicateurs de santé

Le Premium ajoute :

* Score santé batterie
* Score santé onduleur

⚠️ Ces valeurs sont fournies **à titre indicatif uniquement**.

---

## 📊 Répartition énergétique journalière

Le Premium ajoute des capteurs indiquant comment votre consommation a été alimentée :

* % solaire
* % batterie
* % réseau

---

## 🎨 Dashboard Premium

Le Premium active automatiquement un dashboard avancé comprenant :

* Graphiques de répartition énergétique
* Énergies journalières / mensuelles / annuelles
* Historique des puissances
* Indicateurs de santé
* Diagnostics avancés

Le dashboard est créé automatiquement lorsque le Premium est actif.

---

## 🧠 Apprentissage automatique des commandes

Smart Voltronic intègre un moteur intelligent capable d’identifier automatiquement les commandes réellement supportées par votre onduleur.

Cela permet :

* Une meilleure compatibilité entre variantes firmware Voltronic
* D’éviter les commandes non supportées
* Une adaptation automatique des réglages disponibles
* La création d’un profil de compatibilité onduleur
* Des modifications de paramètres plus sûres

Aucune action utilisateur nécessaire.

---

## 🧩 Modes de compatibilité configurables

Les différents modèles et firmwares Voltronic peuvent se comporter différemment.

Smart Voltronic propose des modes de compatibilité pour adapter son comportement interne à votre onduleur.

Ces modes sont configurables dans les paramètres de l’add-on.

---

### Mode Modern

Recommandé pour les modèles récents et les firmwares récents.

Fonctionnalités :

* Utilise le système d’apprentissage automatique
* Comportement adapté aux firmwares récents
* Compatibilité améliorée avec les modèles récents
* Protection contre les commandes invalides

---

### Mode Legacy

Recommandé pour les anciens modèles ou les anciens firmwares.

Fonctionnalités :

* Utilise également le système d’apprentissage automatique
* Comportement adapté aux anciennes logiques onduleur
* Meilleure compatibilité avec les appareils legacy
* Protection contre les commandes invalides

---

### Mode priorité source 2 choix

Certains onduleurs supportent seulement 2 modes de priorité au lieu de 3.

Ce mode permet :

* D’adapter les options disponibles dans Home Assistant
* D’éviter les réglages non supportés
* De garder une interface cohérente avec le comportement réel de l’onduleur

À activer uniquement si votre onduleur le nécessite.

---

# ⭐ Pourquoi Smart Voltronic est différent

Smart Voltronic ne fait pas qu’envoyer des commandes.

Il s’adapte à votre onduleur.

Avantages :

* Meilleure compatibilité
* Moins d’erreurs de configuration
* Moins de réglages manuels
* Support de nombreuses variantes firmware
* Installation plus fiable

Objectif :

**Rendre l’intégration la plus plug & play possible.**

---

# 📸 Captures d’écran

## Informations onduleur

![Device](https://raw.githubusercontent.com/tapion69/smart-voltronic/main/smart-voltronic/docs/images/dashboard-overview.png)

---

## Paramètres

![Settings](https://raw.githubusercontent.com/tapion69/smart-voltronic/main/smart-voltronic/docs/images/inverter-settings.png)

---

## Monitoring puissance

![Power](https://raw.githubusercontent.com/tapion69/smart-voltronic/main/smart-voltronic/docs/images/inverter-power.png)

---

## Production solaire

![PV](https://raw.githubusercontent.com/tapion69/smart-voltronic/main/smart-voltronic/docs/images/inverter-pv.png)

---

# 🔌 Méthodes de connexion

Deux types de connexion sont supportés.

## Connexion série

Connexion RS232 directe.

Onduleur RJ45  
↓  
Câble RJ45 → DB9  
↓  
Adaptateur USB RS232  
↓  
Home Assistant  

Chipsets recommandés :

* FTDI
* Prolific PL2303

---

## Connexion gateway réseau

Permet une communication distante via le réseau.

Modules supportés :

* Elfin EE10A
* Elfin EW10A

Connexion :

Onduleur  
↓  
RS232  
↓  
Gateway  
↓  
Réseau  
↓  
Home Assistant  

Configuration gateway :

Serial :

2400 baud  
8 bits  
1 stop  
Pas de parité  

Network :

TCP Server  
Port 8899  

---

# ⚙️ Configuration

Exemple :

inv1_link: serial  
inv1_serial_port: /dev/serial/by-id/...  

inv2_link: gateway  
inv2_gateway_host: 192.168.1.40  
inv2_gateway_port: 8899  

premium_key: VOTRE_CLE  

Topics MQTT :

voltronic/1/  
voltronic/2/  
voltronic/3/  

---

# ✨ Fonctionnalités

## Monitoring complet

Capteurs automatiques :

* Production PV
* Puissance batterie
* Consommation réseau
* Puissance Load
* Tensions
* Courants
* SOC batterie
* Température
* Warnings
* Status

Fréquence :

≈ 4 secondes

---

## Contrôle onduleur

Paramètres configurables :

* Priorité sortie
* Priorité charge
* Type batterie
* Voltages charge
* Limites courant
* Paramètres réseau

Chaque modification est :

* Vérifiée
* Confirmée
* Synchronisée

---

# 🏠 Intégration Home Assistant

Création automatique via MQTT discovery :

* Sensors
* Numbers
* Select
* Switch
* Binary sensors

Aucun YAML manuel requis.

---

# 🔧 Compatibilité

Compatible avec la plupart des onduleurs Voltronic :

* Axpert
* VM
* MKS
* MAX
* MAX II
* MAX IV
* Clones compatibles

---

# 🛠 Support

Ouvrir une issue GitHub pour :

* Bugs
* Compatibilité
* Suggestions

---

# ❤️ Contribuer

Projet open-source.

Contributions bienvenues :

* Tests
* Retours
* Documentation
* Améliorations

---

# 🚀 Roadmap

Améliorations prévues :

* Support nouvelles marques
* Améliorations compatibilité
* Version Windows standalone
* Diagnostics avancés
* Interface graphique
* Évolution Premium

---

# ⭐ Si ce projet vous aide

Vous pouvez :

* Mettre une étoile ⭐
* Partager votre retour
* Soutenir le développement

---

# 🔋 Contrôle complet des onduleurs Voltronic intégré dans Home Assistant
