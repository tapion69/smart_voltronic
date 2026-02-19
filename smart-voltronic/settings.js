module.exports = {
  uiPort: 1892,
  userDir: "/data",
  flowFile: "/data/flows.json",

  // ✅ false = Node-RED lit flows_cred.json en JSON clair (pas de chiffrement)
  credentialSecret: false,

  // 🔐 Authentification obligatoire pour accéder à l'éditeur Node-RED
  // Seul l'administrateur connaît le mot de passe (jamais visible dans HA)
  // Le hash bcrypt ci-dessous ne permet pas de retrouver le mot de passe en clair
  adminAuth: {
    type: "credentials",
    users: [{
      username: "pi",
      password: "$2a$08$uGLFsGppdWnckZpomdNQveucw.zh8bkSWDO0Gnzj4Z0asqj91KKge",
      permissions: "*"
    }]
  },

  nodesDir: ["/opt/node_modules"],
  editorTheme: {
    projects: { enabled: false }
  },

  logging: {
    console: {
      level: "warn",
      metrics: false,
      audit: false
    }
  }
};
