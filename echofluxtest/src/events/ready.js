const { ActivityType } = require('discord.js');
const dbBridge = require('../utils/dbBridge');

module.exports = {
    name: 'ready',
    once: true,
    async execute(bot) {
        const servers = bot.guilds.cache.size;
        const tag = bot.user.tag;

        console.log(`\x1b[90m${'─'.repeat(54)}\x1b[0m`);
        console.log(`  \x1b[1;32m✓  EchoFluxTest is Online!\x1b[0m`);
        console.log(`\x1b[90m  ─────────────────────────────────────────────────────\x1b[0m`);
        console.log(`  \x1b[90mBot Tag   :\x1b[0m  \x1b[1;36m${tag}\x1b[0m`);
        console.log(`  \x1b[90mBot ID    :\x1b[0m  \x1b[33m${bot.user.id}\x1b[0m`);
        console.log(`  \x1b[90mServers   :\x1b[0m  \x1b[32m${servers}\x1b[0m`);
        console.log(`\x1b[90m${'─'.repeat(54)}\x1b[0m\n`);

        // --- Post-Restart Check ---
        const fs = require('fs-extra');
        const path = require('path');
        const restartStatusPath = path.join(process.cwd(), 'restart_status.json');
        if (fs.existsSync(restartStatusPath)) {
            try {
                const data = fs.readJsonSync(restartStatusPath);
                const { channel_id, message_id } = data;
                if (channel_id && message_id) {
                    const channel = await bot.channels.fetch(channel_id).catch(() => null);
                    if (channel) {
                        try {
                            const msg = await channel.messages.fetch(message_id);
                            await msg.edit({ content: "<:tick:1488582269298807024>  **Restart successful!**" });
                        } catch (e) {
                            await channel.send({ content: "<:tick:1488582269298807024>  **Restart successful!**" }).catch(() => { });
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to edit restart message:", e);
            } finally {
                try {
                    fs.unlinkSync(restartStatusPath);
                } catch (e) { }
            }
        }

        // --- Status Rotation ---
        let statusIndex = 0;
        const setBotPresence = () => {
            const servers = bot.guilds.cache.size;
            const users = bot.guilds.cache.reduce((acc, guild) => acc + (guild.memberCount || 0), 0);

            const statuses = [
                { type: ActivityType.Listening, name: "Made with ❤️ by Gacky & Matrix Studio" },
                { type: ActivityType.Watching, name: `${servers} servers` },
                { type: ActivityType.Watching, name: `${users} users` },
                { type: ActivityType.Listening, name: `.help | @EchoFluxTest` },
                { type: ActivityType.Listening, name: "Powered By Gacky & Matrix Studio" }
            ];

            const current = statuses[statusIndex % statuses.length];
            bot.user.setPresence({
                status: 'dnd',
                activities: [current]
            });
            statusIndex++;
        };

        // Set immediately on ready
        setBotPresence();
        // Rotate every 20s
        setInterval(setBotPresence, 20000);

        // --- 24/7 Auto-Reconnect ---
        // Helper to delay reconnects slightly to avoid rate limit spikes
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        async function reconnect247() {
            try {
                if (!bot.lavalink) return;

                // Get all 24/7 guilds from the database cache (guild_id -> channel_id)
                const allGuilds = bot.guilds.cache;
                for (const [guildIdStr, guild] of allGuilds) {
                    const channelId = dbBridge.get247Channel(guildIdStr);
                    if (!channelId) continue;

                    // Shoukaku: check if player already exists and is connected
                    const player = bot.lavalink.players.get(guildIdStr);
                    if (player && player.connection.channelId) {
                        continue; // Already connected
                    }

                    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
                    if (!channel) continue;

                    try {
                        // Create and connect player via Shoukaku connection
                        await bot.lavalink.joinVoiceChannel({
                            guildId: guild.id,
                            channelId: channel.id,
                            shardId: guild.shardId,
                            deaf: true
                        });
                        console.log(`24/7 Reconnected to ${channel.name} in ${guild.name}`);
                        await delay(500); // 0.5s delay to avoid slamming the discord API
                    } catch (e) {
                        // Fail silently
                    }
                }
            } catch (error) {
                // Fail silently
            }
        }

        // Run reconnect once on ready and then periodically every 60s
        bot.reconnect247 = reconnect247;
        await reconnect247();
        setInterval(reconnect247, 60000);

        // --- Top.gg Auto Poster ---
        const topggToken = process.env.TOPGG_API;
        if (topggToken && topggToken !== 'your_topgg_token_here') {
            const postStats = async () => {
                const botId = bot.user.id;
                const serverCount = bot.guilds.cache.size;
                try {
                    const response = await fetch(`https://top.gg/api/bots/${botId}/stats`, {
                        method: 'POST',
                        headers: {
                            'Authorization': topggToken,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            server_count: serverCount
                        })
                    });
                    if (response.ok) {
                        // console.log(`[TOP.GG] Successfully posted stats: ${serverCount} servers`);
                    } else {
                        console.error(`[TOP.GG] Failed to post stats: ${response.status} ${response.statusText}`);
                    }
                } catch (e) {
                    console.error("[TOP.GG] Error posting stats:", e);
                }
            };

            // Post on startup
            await postStats().catch(() => { });
            // Post every 30 minutes
            setInterval(postStats, 30 * 60 * 1000);
        }
    }
};
