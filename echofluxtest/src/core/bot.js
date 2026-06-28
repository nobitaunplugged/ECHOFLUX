const { Client, GatewayIntentBits, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { loadJson } = require('../utils/dataManager');
const dbBridge = require('../utils/dbBridge');
const path = require('path');
const fs = require('fs-extra');
const { Shoukaku, Connectors, Player } = require('shoukaku');
const { ratelimitHandler, autoBlacklistUser, logRatelimitAttempt } = require('../utils/ratelimit');

// Shim player.connection for backward compatibility with translated files
Object.defineProperty(Player.prototype, 'connection', {
    get() {
        return this.node.manager.connections.get(this.guildId) || { channelId: null };
    }
});

// Shim player.setVolume to map to player.setGlobalVolume for backward compatibility with Shoukaku v3
Player.prototype.setVolume = function (volume) {
    return this.setGlobalVolume(volume);
};

class MusicBot extends Client {
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ],
            presence: {
                status: 'dnd'
            },
            allowedMentions: {
                parse: [],
                users: [],
                roles: [],
                repliedUser: false
            }
        });

        global.client = this;

        this.commands = new Collection();
        this.aliases = new Collection();
        this.uptimeStart = Date.now();

        const ownerData = loadJson('owner.json', { OWNER_IDS: [] });
        const ids = Array.isArray(ownerData) ? ownerData : (ownerData.OWNER_IDS || []);
        this.ownerIds = new Set(ids.map(id => String(id)));

        this.emojisConfig = loadJson('emojies.json', {});
    }

    get myEmojis() {
        return loadJson('emojies.json', {});
    }

    getEmoji(key, defaultValue = "") {
        return this.myEmojis[key] || defaultValue;
    }

    async isOwner(user) {
        if (this.ownerIds.has(user.id)) return true;
        // Fallback to application owners
        const app = await this.application.fetch();
        if (app.owner) {
            if (app.owner.members) {
                return app.owner.members.has(user.id);
            }
            return app.owner.id === user.id;
        }
        return false;
    }

    // Determine prefix for a guild
    getPrefix(guildId) {
        return dbBridge.getPrefix(guildId, '.');
    }

    // Determine if user has no-prefix access
    hasNoPrefixAccess(userId) {
        return dbBridge.hasNoPrefixAccess(userId);
    }

    // Check if user is blacklisted
    isBlacklisted(userId) {
        return dbBridge.isBlacklisted(userId);
    }

    // Execute global command check
    async globallyBlockBlacklisted(message) {
        if (this.isBlacklisted(message.author.id)) {
            const supportUrl = process.env.SUPPORT_INVITE || "";
            const embed = new EmbedBuilder()
                .setTitle("<:stop:1488582422646751422> You are Blacklisted")
                .setDescription("You are globally blacklisted from using EchoFluxTest.\nIf you believe this is a mistake, you can appeal in our support server.")
                .setColor(0x00d2ff);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Support Server")
                    .setURL(supportUrl)
                    .setStyle(ButtonStyle.Link)
            );
            await message.reply({ embeds: [embed], components: [row] }).catch(() => { });
            return false;
        }

        if (await this.isOwner(message.author)) {
            return true;
        }

        if (ratelimitHandler.checkCommandRatelimit(message.author.id)) {
            autoBlacklistUser(message.author, "Auto-blacklisted: Triggered Command Rate Limit (API Protection)");

            await logRatelimitAttempt({
                bot: this,
                user: message.author,
                guild: message.guild,
                channel: message.channel,
                message: message,
                reason: "Command Rate Limit Exceeded",
                detailAnalysis: `User ${message.author.username} executed more than ${ratelimitHandler.CMD_LIMIT} commands in ${ratelimitHandler.CMD_WINDOW / 1000} seconds.`
            });

            const embed = new EmbedBuilder()
                .setTitle("<:stop:1488582422646751422> You are Blacklisted")
                .setDescription("You have been automatically blacklisted.")
                .setColor(0x00d2ff);
            await message.reply({ embeds: [embed] }).catch(() => { });
            return false;
        }

        return true;
    }

    async loadCommands() {
        const commandBase = path.join(__dirname, '..', 'commands');
        if (!fs.existsSync(commandBase)) return;

        const categories = fs.readdirSync(commandBase);
        let totalCount = 0;
        const rows = [];

        for (const cat of categories) {
            const catPath = path.join(commandBase, cat);
            if (!fs.statSync(catPath).isDirectory()) continue;

            const files = fs.readdirSync(catPath).filter(f => f.endsWith('.js'));
            let catCount = 0;
            for (const file of files) {
                try {
                    const cmd = require(path.join(catPath, file));
                    const cmds = Array.isArray(cmd) ? cmd : [cmd];
                    for (const c of cmds) {
                        if (c.name) {
                            c.category = cat;
                            this.commands.set(c.name, c);
                            if (c.aliases && Array.isArray(c.aliases)) {
                                for (const alias of c.aliases) {
                                    this.aliases.set(alias, c.name);
                                }
                            }
                            catCount++;
                        }
                    }
                } catch (e) {
                    console.error(`  \x1b[31m✗\x1b[0m Failed to load ${file} in ${cat}:`, e.message);
                }
            }
            if (catCount > 0) {
                rows.push({ cat, count: catCount });
                totalCount += catCount;
            }
        }

        // Print a clean table (include events row at top)
        const evtCount = this._loadedEventCount || 0;
        const allRows = evtCount > 0 ? [{ cat: 'events', count: evtCount }, ...rows] : rows;
        const cmdTotal = totalCount + evtCount;

        console.log(`\r\x1b[90m  ◈\x1b[0m \x1b[33mModules\x1b[0m   \x1b[32m✓ Loaded\x1b[0m                    `);
        console.log(`\n\x1b[90m  ┌─────────────────────────┬───────┐\x1b[0m`);
        console.log(`\x1b[90m  │\x1b[0m \x1b[1mCategory                \x1b[0m\x1b[90m│\x1b[0m \x1b[1mCount \x1b[0m\x1b[90m│\x1b[0m`);
        console.log(`\x1b[90m  ├─────────────────────────┼───────┤\x1b[0m`);
        for (const { cat, count } of allRows) {
            const catPad = cat.padEnd(23);
            const cntPad = String(count).padStart(4);
            console.log(`\x1b[90m  │\x1b[0m \x1b[36m${catPad}\x1b[0m \x1b[90m│\x1b[0m \x1b[32m${cntPad}  \x1b[0m\x1b[90m│\x1b[0m`);
        }
        console.log(`\x1b[90m  ├─────────────────────────┼───────┤\x1b[0m`);
        console.log(`\x1b[90m  │\x1b[0m \x1b[1mTotal                   \x1b[0m\x1b[90m│\x1b[0m \x1b[1;32m${String(cmdTotal).padStart(4)}  \x1b[0m\x1b[90m│\x1b[0m`);
        console.log(`\x1b[90m  └─────────────────────────┴───────┘\x1b[0m\n`);
    }

    async loadEvents() {
        const eventBase = path.join(__dirname, '..', 'events');
        if (!fs.existsSync(eventBase)) return;

        const files = fs.readdirSync(eventBase).filter(f => f.endsWith('.js'));
        let count = 0;
        for (const file of files) {
            try {
                const event = require(path.join(eventBase, file));
                const eventName = file.split('.')[0];
                const targetName = eventName === 'ready' ? 'clientReady' : eventName;
                if (event.once) {
                    this.once(targetName, (...args) => event.execute(this, ...args));
                } else {
                    this.on(targetName, (...args) => event.execute(this, ...args));
                }
                count++;
            } catch (e) {
                console.error(`  \x1b[31m✗\x1b[0m Failed to load event ${file}:`, e.message);
            }
        }
        // Events are merged into the modules table — just store count for later
        this._loadedEventCount = count;
    }
}

module.exports = MusicBot;
