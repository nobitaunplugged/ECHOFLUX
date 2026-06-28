const { Shoukaku, Connectors } = require('shoukaku');
const { sendWebhookLog } = require('../utils/webhooks');
const { EmbedBuilder } = require('discord.js');
const { decoratePlayer } = require('./playerManager');

function setupLavalink(bot) {
    // Advanced nodes configuration (easily extendable for production grade node failover)
    const nodes = [
        {
            name: 'matrix_node',
            url: `${process.env.LAVALINK_HOST }:${process.env.LAVALINK_PORT }`,
            auth: process.env.LAVALINK_PASSWORD || 'youshallpass',
            secure: process.env.LAVALINK_SECURE === 'true or maybe false'
        }
    ];


    const shoukaku = new Shoukaku(new Connectors.DiscordJS(bot), nodes, {
        moveOnDisconnect: true, // Auto failover to other nodes
        resume: true,
        resumeTimeout: 60,
        reconnectTries: 20,
        reconnectInterval: 5000,
        restTimeout: 15000
    });

    bot.lavalink = shoukaku;

    // Wrap joinVoiceChannel to automatically decorate players and register events
    const originalJoin = shoukaku.joinVoiceChannel.bind(shoukaku);
    shoukaku.joinVoiceChannel = async function (options) {
        try {
            // Check if there is an existing player in cache but we are not in VC
            const existingPlayer = shoukaku.players.get(options.guildId);
            const guild = bot.guilds.cache.get(options.guildId);
            const inVoice = guild?.members?.me?.voice?.channel;

            if (existingPlayer && !inVoice) {
                console.log(`[LAVALINK] Desynced player found for guild ${options.guildId}. Destroying phantom player...`);
                try {
                    await shoukaku.leaveVoiceChannel(options.guildId);
                } catch (e) {}
                try {
                    existingPlayer.destroy();
                } catch (e) {}
                shoukaku.players.delete(options.guildId);
            }

            const player = await originalJoin(options);
            decoratePlayer(player, bot);
            const { registerPlayerEvents } = require('../events/playerLifecycle');
            registerPlayerEvents(bot, player);
            return player;
        } catch (err) {
            if (err.message && err.message.includes("already have an existing connection")) {
                console.log(`[LAVALINK] Connection desync detected for guild ${options.guildId}. Cleaning up and retrying...`);
                try {
                    await shoukaku.leaveVoiceChannel(options.guildId);
                } catch (e) {}
                try {
                    const ep = shoukaku.players.get(options.guildId);
                    if (ep) ep.destroy();
                } catch (e) {}
                shoukaku.players.delete(options.guildId);

                try {
                    // Retry original join
                    const player = await originalJoin(options);
                    decoratePlayer(player, bot);
                    const { registerPlayerEvents } = require('../events/playerLifecycle');
                    registerPlayerEvents(bot, player);
                    return player;
                } catch (retryErr) {
                    try {
                        await shoukaku.leaveVoiceChannel(options.guildId);
                    } catch (e) {}
                    try {
                        const ep = shoukaku.players.get(options.guildId);
                        if (ep) ep.destroy();
                    } catch (e) {}
                    shoukaku.players.delete(options.guildId);
                    throw retryErr;
                }
            }

            // Clean up voice connection and player state on connection failure
            try {
                await shoukaku.leaveVoiceChannel(options.guildId);
            } catch (e) {}
            try {
                const ep = shoukaku.players.get(options.guildId);
                if (ep) ep.destroy();
            } catch (e) {}
            shoukaku.players.delete(options.guildId);

            if (err.message && err.message.includes("Can't find any nodes")) {
                throw new Error("Lavalink music node is currently offline or reconnecting. Please wait a few seconds and try again!");
            }
            if (err.message && err.message.includes("not established in 15 seconds")) {
                throw new Error("Failed to connect to the voice channel within 15 seconds. Please make sure the bot has Join/Speak permissions or try again!");
            }
            throw err;
        }
    };

    // Node event hooks for monitoring & health checks
    shoukaku.on('ready', (name) => {
        console.log(`\x1b[90m  ◈\x1b[0m \x1b[33mLavalink\x1b[0m  \x1b[32m✓ Node \x1b[0m\x1b[36m${name}\x1b[0m\x1b[32m connected!\x1b[0m`);
        if (typeof bot.reconnect247 === 'function') {
            bot.reconnect247().catch(() => {});
        }
    });

    shoukaku.on('error', (name, error) => {
        console.error(`  \x1b[1;31m✗\x1b[0m Lavalink node error: ${name}`, error);
    });

    shoukaku.on('close', async (name, code, reason) => {
        console.log(`  \x1b[1;31m✗\x1b[0m Lavalink node disconnected: ${name} with code ${code}. Reason: ${reason}`);
        const embed = new EmbedBuilder()
            .setTitle("<:cross:1488582282020126881> Node Disconnected")
            .setDescription(`Lavalink node disconnected: \`${name}\`\nReason: \`${reason || 'No reason provided'}\` (Code: ${code})\nAutomatic reconnection/failover will be attempted.`)
            .setColor(0x00d2ff)
            .setTimestamp();
        await sendWebhookLog("Lavalink_Error", embed);
    });

    shoukaku.on('disconnect', (name, players, moved) => {
        console.log(`  \x1b[1;31m✗\x1b[0m Lavalink node disconnected fully: ${name}. Players moved: ${moved}`);
    });
}

module.exports = { setupLavalink };

