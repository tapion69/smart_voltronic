// ===============================
// CHECK CARDS (Node-RED function node)
// 
// À insérer dans le flow ENTRE "CHECK PREMIUM" et "BUILD PREMIUM DASHBOARD"
// 
// Ce node:
// 1. Lance hacs_cards_manager.js via exec
// 2. Parse le résultat JSON
// 3. Injecte msg.cards_available pour le BUILD PREMIUM DASHBOARD
//
// ALTERNATIVE: Si tu préfères ne pas utiliser le script externe,
// ce node peut directement être un EXEC node qui appelle:
//   node /config/smart-voltronic/hacs_cards_manager.js {{auto_install}}
// suivi d'un function node qui parse la sortie.
// ===============================

// Ce code est pour un function node qui reçoit la sortie
// du EXEC node "hacs_cards_manager.js" en msg.payload (stdout)

try {
    const result = JSON.parse(msg.payload);
    
    if (!result.ok) {
        node.warn("CHECK CARDS: erreur - " + (result.error || "unknown"));
        // En cas d'erreur, on assume que toutes les cartes sont dispo
        // pour ne pas bloquer le dashboard
        msg.cards_available = {
            "mini-graph-card": true,
            "apexcharts-card": true,
            "card-mod": true,
            "bubble-card": true
        };
        return msg;
    }

    // Construire le map cards_available depuis le résultat
    const avail = {};
    for (const [cardType, info] of Object.entries(result.cards || {})) {
        avail[cardType] = info.installed === true;
    }
    msg.cards_available = avail;

    // Log pour debug
    const missing = Object.entries(avail)
        .filter(([k, v]) => !v)
        .map(([k]) => k);
    
    if (missing.length > 0) {
        node.warn("CHECK CARDS: cartes manquantes -> " + missing.join(", "));
        if (result.auto_install && result.hacs_available) {
            node.warn("CHECK CARDS: installation auto tentée via HACS");
        }
    } else {
        node.log("CHECK CARDS: toutes les cartes custom sont installées ✓");
    }

    return msg;

} catch (e) {
    node.warn("CHECK CARDS: impossible de parser la sortie - " + e.message);
    // Fallback safe: on assume tout dispo
    msg.cards_available = {
        "mini-graph-card": true,
        "apexcharts-card": true,
        "card-mod": true,
        "bubble-card": true
    };
    return msg;
}
