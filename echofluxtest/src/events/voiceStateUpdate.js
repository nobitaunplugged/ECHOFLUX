const dbBridge = require('../utils/dbBridge');
const { EmbedBuilder } = require('discord.js');
const { buildThanksEmbed } = require('../utils/embedHelpers');

// Debounce map for 24/7 notices
const lastNoticeMap = new Map();

module.exports = {
    name: 'voiceStateUpdate',
    async execute(bot, oldState, newState) {
        const member = oldState.member;
        if (!member) return;

        const guild = oldState.guild;

        // ── Bot's own voice state changes ──
        if (member.id === bot.user.id) {
            // Bot was disconnected
            if (oldState.channelId && !newState.channelId) {
                // If the bot gets disconnected, disable 24/7 mode
                const activeChannelId = dbBridge.get247Channel(guild.id);
                if (activeChannelId) {
                    await dbBridge.set247Channel(guild.id, null, false);
                }
                return;
            }
            return;
        }

        // Ignore updates for other bots
        if (member.user.bot) return;

        // A user left/moved channels. Check if the bot was in the old channel and it's now empty.
        if (!oldState.channelId) return; // User just joined voice
        if (oldState.channelId === newState.channelId) return; // Mute/unmute etc.

        if (!bot.lavalink) return;
        const player = bot.lavalink.players.get(guild.id);
        if (!player) return;

        // Check if the channel left is the bot's channel
        if (String(player.connection.channelId) !== String(oldState.channelId)) return;

        const vcChannel = oldState.channel;
        if (!vcChannel) return;

        // Count non-bot members
        const humans = vcChannel.members.filter(m => !m.user.bot);
        if (humans.size > 0) return; // Still humans left

        // ── No humans left in the voice channel ──
        const now = Date.now();
        const is247 = !!dbBridge.get247Channel(guild.id);

        // Retrieve message channel from player data
        const textChannelId = player.textChannelId;
        const textChannel = textChannelId ? guild.channels.cache.get(textChannelId) : null;

        if (is247) {
            // Notify 24/7 Mode is ON (debounce to 5s)
            const lastNotice = lastNoticeMap.get(guild.id) || 0;
            if (now - lastNotice > 5000) {
                if (textChannel) {
                    const embed = new EmbedBuilder()
                        .setDescription("♾️ **24/7 Mode is ON**: I will stay in the voice channel.")
                        .setColor(0x00d2ff);
                    textChannel.send({ embeds: [embed] }).then(msg => {
                        setTimeout(() => msg.delete().catch(() => {}), 5000);
                    }).catch(() => {});
                    lastNoticeMap.set(guild.id, now);
                }
            }
        }

        // Set player state / stop playing
        if (typeof player.store === 'function') {
            player.store("disconnect_reason", "empty_vc");
        } else {
            player.disconnectReason = "empty_vc";
        }
        
        // Stop playback and clear queue
        await player.stopTrack();
        if (player.queue) {
            player.queue = [];
        }

        if (!is247) {
            // Disconnect bot
            await bot.lavalink.leaveVoiceChannel(guild.id);

            // Send "Thanks" embed to text channel
            if (textChannel) {
                const { embed, row } = buildThanksEmbed(bot);
                const desc = embed.data?.description || embed.description || "";
                embed.setDescription("Everyone left the voice channel, so I stopped playing. " + desc.split("!").slice(1).join("!"));
                await textChannel.send({ embeds: [embed], components: [row] }).catch(() => {});
            }
        }
    }
};
