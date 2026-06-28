const { EmbedBuilder } = require('discord.js');
const { sendWebhookLog } = require('../utils/webhooks');

class Queue extends Array {
    constructor(...items) {
        super(...items);
    }

    // Helper methods for advanced queue management if needed by new systems
    shuffle() {
        for (let i = this.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this[i], this[j]] = [this[j], this[i]];
        }
        return this;
    }

    clear() {
        this.length = 0;
    }

    remove(index) {
        if (index >= 0 && index < this.length) {
            return this.splice(index, 1)[0];
        }
        return null;
    }

    move(from, to) {
        if (from >= 0 && from < this.length && to >= 0 && to < this.length) {
            const [item] = this.splice(from, 1);
            this.splice(to, 0, item);
            return true;
        }
        return false;
    }
}

/**
 * Decorates a Shoukaku player instance with advanced features,
 * state preservation, smart queue management, and reconnection hooks
 */
function decoratePlayer(player, bot) {
    if (player.advancedDecorated) return player;
    player.advancedDecorated = true;

    // Preserve original structures
    player.queue = new Queue(...(player.queue || []));
    player.current = player.current || null;
    player.dataStore = player.dataStore || new Map();
    player.loop = player.loop ?? 0; // 0 = off, 1 = track, 2 = queue

    // Custom data store helpers
    player.store = (key, val) => player.dataStore.set(key, val);
    player.fetch = (key, def) => player.dataStore.has(key) ? player.dataStore.get(key) : def;

    // Advanced autoplay / recommendations
    player.resolveAutoplay = async function(seedTrack) {
        const autoplayEnabled = player.fetch("autoplay", false);
        if (!autoplayEnabled || !seedTrack) return null;

        const info = seedTrack.info || seedTrack;
        const seedAuthor = info.author || "";
        const seedTitle = info.title || "";
        const history = player.fetch("play_history", []);

        // Build robust queries with fallbacks
        const queries = [
            `ytmsearch:songs similar to ${seedTitle} ${seedAuthor}`,
            `ytsearch:${seedTitle} ${seedAuthor} recommendation`,
            `scsearch:${seedTitle} ${seedAuthor}`
        ];

        for (const query of queries) {
            try {
                const result = await player.node.rest.resolve(query);
                if (result && result.data && result.data.length > 0) {
                    // Filter out tracks already in play history or currently playing
                    let choices = result.data.filter(t => {
                        const tInfo = t.info || t;
                        return !history.includes(tInfo.identifier) && tInfo.identifier !== info.identifier;
                    });

                    if (choices.length > 0) {
                        // Pick from top choices randomly to add variety
                        const choice = choices[Math.floor(Math.random() * Math.min(choices.length, 5))];
                        choice.requester = bot.user.id;
                        return choice;
                    }
                }
            } catch (err) {
                console.error(`[AUTOPLAY] Autoplay resolve failed for query "${query}":`, err.message);
            }
        }
        return null;
    };

    // Safe reconnection status updater
    player.on('closed', async (payload) => {
        // Alert owner via webhook if abnormal termination
        if (payload.code !== 1000 && payload.code !== 1006) {
            const embed = new EmbedBuilder()
                .setTitle("⚠️ Player Socket Connection Closed")
                .setDescription(`Abnormal socket close in Guild \`${player.guildId}\`.\nReason code: \`${payload.code}\`\nReason: \`${payload.reason || 'Unknown'}\``)
                .setColor(0xffaa00)
                .setTimestamp();
            await sendWebhookLog("Lavalink_Error", embed);
        }
    });

    return player;
}

module.exports = {
    decoratePlayer,
    Queue
};
