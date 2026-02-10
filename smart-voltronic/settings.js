module.exports = {
  uiPort: 1880,
  userDir: "/data",

  // IMPORTANT : chemin absolu
  flowFile: "/data/flows.json",

  // ✅ Rend le chiffrement des credentials STABLE entre redémarrages
  // Mets une valeur unique à toi (longue) pour éviter tout souci
  credentialSecret: "CHANGE_ME__smart_voltronic__long_random_secret",

  nodesDir: ["/opt/node_modules"],

  editorTheme: {
    projects: { enabled: false }
  }
};
