# ⚠️ Smart Voltronic – Development Branch

## 🚧 This branch is for developers only

This **develop** branch contains **experimental features, breaking changes and work in progress**.

It is used to:

* test new features before release
* debug issues
* validate upcoming changes

👉 **This version is NOT stable.**

---

## ❌ Do NOT install this version if you are a normal user

If you just want the add-on to work reliably,
please install the stable version from the **main branch**:

```
https://github.com/jean-luc1203/voltronic-rs232-addon
```

---

## 🧪 Who should use this branch?

This branch is intended only for:

* developers
* testers
* users willing to report bugs
* users comfortable with breaking changes

You may experience:

* bugs
* incomplete features
* configuration changes
* temporary instability

---

## 🐛 Reporting issues

If you are testing this branch and find a problem, please open an issue on GitHub with logs and details.

Your feedback helps make the stable release better ❤️

---

## 🔒 Stable release

When features are validated, they will be merged into the **main branch** and released officially.

---

Thanks for helping test Smart Voltronic 🙌


## ESP32: file d'attente des paramètres HA

La file d'attente n'est activée que si `invN_link: esp32` et ne modifie pas
les connexions `serial` ou `gateway`. Elle passe par les mêmes entités
Home Assistant et le même moteur d'apprentissage/écriture vérifiée que les
commandes immédiates.

- Par onduleur, au maximum **5 paramètres distincts**, conservés **60 minutes**.
- Une nouvelle valeur du même paramètre remplace l'ancienne (sauf opération déjà
  transmise, impossible à annuler).
- La file est conservée dans le contexte Node-RED `persistent` (localfilesystem).
  Une écriture potentiellement en cours lors d'un redémarrage est classée
  **incertaine et jamais automatiquement renvoyée**.
- Reprise uniquement avec connexion ESP32 opérationnelle, données QPIRI récentes,
  écritures ESP activées et aucune session d'apprentissage déjà active.
- Une demande déjà appliquée dans les paramètres QPIRI peut être acquittée sans
  écriture supplémentaire. Une confirmation positive nécessite la relecture
  native vérifiée par l'ESP32; les échecs incertains ne sont pas rejoués.
- Le bouton purge les demandes **non envoyées**, pas une transaction RS232
  éventuellement déjà démarrée. Les expirations/rejets/incertitudes sont suivis.
- L'interruption Wi-Fi ou HTTP ne suspend pas le polling RS232 local de l'ESP32.
- Les automatisations horaires doivent continuer à vérifier leurs propres
  conditions avant de demander un réglage: la file ne peut pas connaître
  rétrospectivement l'évolution de conditions externes (Tempo, plage HC).

Pour chaque onduleur utilisant ESP32, MQTT Discovery publie automatiquement :
- Capteur avec unique ID
  `smart_voltronic_invN_esp_queue_state_v1` : **Vide / Attente / Pleine**,
  avec attributs de comptage, expiration et dernière anomalie.
- Bouton avec unique ID
  `smart_voltronic_invN_esp_queue_purge_v1` : purge de la file.
- Topics internes : `voltronic/N/esp_queue/state`,
  `voltronic/N/esp_queue/attributes`,
  `voltronic/N/esp_queue/purge/set`.

Ces découvertes sont retirées par publication MQTT retained vide lorsque le
transport passe à `serial` ou `gateway`. Le flow versionné contient tous
les nœuds ESP32; le patch de démarrage rétablit la liaison historique MQTT → SET
pour les transports non ESP.

Seuls les **9 paramètres d'écriture sémantique validée** du firmware ESP sont
admis dans la file : Bulk, Float, tension basse, retour réseau, retour batterie,
courant de charge maximal, courant secteur maximal, priorité sortie et priorité
charge. Les commandes brutes et autres SET ne sont pas stockés.
