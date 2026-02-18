module.exports = {
  uiPort: 1892,
  userDir: "/data",
  flowFile: "/data/flows.json",

  // ✅ false = Node-RED lit flows_cred.json en JSON clair (pas de chiffrement)
  credentialSecret: false,

  // 🔐 Authentification obligatoire pour accéder à l'éditeur Node-RED
  // Mot de passe hashé bcrypt généré au démarrage par run.sh
  // Le fichier /data/nr_adminauth.json contient le hash à jour
  adminAuth: require('/data/nr_adminauth.json'),

  nodesDir: ["/opt/node_modules"],
  editorTheme: {
    projects: { enabled: false }
  }
};
