# Banc de test reel — ESP32-S3 + Smart Voltronic + APK en parallele

**Exclusivement pour la branche** `dev/esp32-s3-full-live-test` de `tapion69/smart_voltronic`.
L'application Android isolee et le firmware S3 sont construits dans
`tapion69/smart-energy-android`, branche
`experiment/esp32-s3-full-live-test`.

## Fichiers et compatibilite

- Add-on separe : `Smart Voltronic ESP32 S3 TEST`, slug
  `smart_voltronic_esp32_test`. Port *hote* 1895 / port Node-RED *conteneur* 1892.
- Firmware : ESP32-S3 N16R8, 16 Mo flash, partition OTA, MAX3232 3,3 V,
  UART1 2400 8N1, GPIO17 TX / GPIO16 RX. Jamais RS232 directement sur GPIO.
- APK de test : identifiant independant
  `fr.smartenergy.android.espbridge`, nom `Smart Energy ESP TEST`.
  Les preferences, codes et associations de l'APK officielle restent separes.
  Les mises a jour APK officielles et l'ancien binaire OTA embarque sont
  bloques dans cette APK de test pour eviter une substitution involontaire.
- Le S3 reste l'unique maitre UART. APK et Node-RED ne font que lire le cache
  HTTP `/api/v1/bridge/snapshot` (sauf operation SET confirmee).
- Sur l'onduleur *MPPT seulement*, ne tester d'abord **aucune ecriture**
  de parametre. Lire QPIGS et QPIGS2 et verifier les watts MPPT.

## Installation Home Assistant

Pour une installation independante du module habituel, copier le dossier
`smart-voltronic` de **cette branche** dans
`/addons/local/smart_voltronic_esp32_test`, puis recharger le catalogue
des modules complementaires locaux. Un simple ajout de l'URL du depot GitHub
pointe generalement sur sa branche par defaut et ne suffit donc pas a garantir
le code experimental.

**ATTENTION** : deux add-ons utilisant les memes topics MQTT discovery/state
peuvent ecraser leurs donnees mutuellement. Pour valider la parite sans changer
les identifiants d'entites Home Assistant, arreter temporairement la publication
MQTT de l'instance de production (ou employer un environnement MQTT/HA
completement isole). La separation des ports et slugs **n'isole pas MQTT**.
Sauvegarder la configuration et les flux avant le test.

Configurer un seul slot, par exemple :
`inv1_link=esp32`, `inv1_esp_host=<IP-LAN-du-S3>`,
`inv1_esp_port=18081`, `inv1_esp_code=<code-configuration>`,
`inv1_esp_write_enabled=false`.
Regler les autres emplacements `inv2_link=disabled` et `inv3_link=disabled`\n(ce mode est reserve a cette branche de test).\nNe pas connecter le meme port serie a Node-RED, une gateway et le S3.

## Protocole de validation

1. Installer le firmware d'essai S3 fourni par GitHub Actions :
   `smart-energy-voltronic-S3-FACTORY-0x0.bin` sur **ESP32-S3 N16R8**
   au decalage 0x0, ou l'image `APP-0x10000.bin` seulement si l'on sait
   conserver bootloader, table de partitions et NVS compatibles. Le flash
   factory peut effacer les identifiants Wi-Fi/provisionnement : les noter
   avant et reconfigurer apres. Ne pas flasher un ESP32 JK.
2. Ouvrir `/api/v1/info` et `/api/v1/telemetry` via le client configure,
   puis lire le cache bridge. Verifier l'age et le CRC des donnees.
3. Installer l'APK **Smart Energy ESP TEST** a cote de l'officielle,
   reconfigurer IP/code sans transferer de secrets via les captures.
   Comparer affichages solaire/MPPT, onduleur, dashboard Modern/Sunsynk/JK.
4. Demarrer l'add-on test avec MQTT isole de la production ; comparer
   Home Assistant : entites, QPIGS, QPIGS2, consommation, energie, Doctor
   et historique, sur au moins une transition jour/nuit.
5. Test concurrent : APK et add-on lisent en meme temps, tandis qu'un
   seul poller S3 emet des commandes UART ; observer erreurs et retards.
6. Tester SET et apprentissage **uniquement** plus tard, sur un parametre
   sans effet sur la securite, avec lecture prealable, valeur ancienne
   exacte, validation utilisateur et `inv1_esp_write_enabled=true`.
   Ne jamais provoquer de SET pour les seuls tests de telemetrie.

## Limites explicites

Le secours historique `MODBUS_MPPT2` du flow complet et l'ensemble des
commandes LOAD2 ne sont pas encore implementes dans la passerelle ESP32.
Les capteurs existants sont conserves, mais certaines valeurs peuvent rester
indisponibles selon l'onduleur. Les tests CI ne prouvent ni la parite MQTT
en temps reel, ni l'absence de double polling sur l'appareil physique.
Ne pas fusionner ces branches en production avant validation du materiel.
