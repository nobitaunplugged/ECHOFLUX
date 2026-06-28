const dbBridge = require('./dbBridge');

function loadPremiumConfig() {
    return dbBridge.getPremiumConfig();
}

async function savePremiumConfig(data) {
    const db = require('./db');
    await db.run("DELETE FROM premium");
    for (const [gid, exp] of Object.entries(data)) {
        await dbBridge.setGuildPremium(gid, exp);
    }
}

function isGuildPremium(guildId) {
    return dbBridge.isGuildPremium(guildId);
}

module.exports = {
    loadPremiumConfig,
    savePremiumConfig,
    isGuildPremium
};
