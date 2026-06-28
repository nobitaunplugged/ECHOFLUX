const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPlayerEmbed, getPlayerComponents } = require('../utils/playerEmbed');
const dbBridge = require('../utils/dbBridge');
const { buildThanksEmbed } = require('../utils/embedHelpers');

// Helper to delete old Now Playing messages
async function deleteOldNpMessages(player, guild) {
    const oldMsgId = player.fetch("np_message_id");
    const channelId = player.fetch("channel");
    if (oldMsgId && channelId) {
        try {
            let channel = guild.channels.cache.get(channelId);
            if (!channel) {
                channel = await guild.channels.fetch(channelId).catch(() => null);
            }
            if (channel) {
                const oldMsg = await channel.messages.fetch(oldMsgId).catch(() => null);
                if (oldMsg) {
                    await oldMsg.delete().catch(() => {});
                }
            }
        } catch (e) {}
    }

    const oldVcMsgId = player.fetch("np_vc_message_id");
    const vcChannelId = player.connection.channelId;
    if (oldVcMsgId && vcChannelId) {
        try {
            let vcChannel = guild.channels.cache.get(vcChannelId);
            if (!vcChannel) {
                vcChannel = await guild.channels.fetch(vcChannelId).catch(() => null);
            }
            if (vcChannel) {
                const oldVcMsg = await vcChannel.messages.fetch(oldVcMsgId).catch(() => null);
                if (oldVcMsg) {
                    await oldVcMsg.delete().catch(() => {});
                }
            }
        } catch (e) {}
    }

    player.store("np_message_id", null);
    player.store("np_vc_message_id", null);
}

// Function to play next song in queue with robust retries and error recovery
async function playNext(bot, player, retries = 3) {
    if (!player.queue || player.queue.length === 0) {
        // Queue is empty. Trigger autoplay or cleanup.
        await handleQueueEnd(bot, player);
        return;
    }

    const nextTrack = player.queue.shift();
    player.current = nextTrack;
    const trackString = nextTrack.encoded || nextTrack.track;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await player.playTrack({ track: { encoded: trackString } });
            return; // Successfully playing
        } catch (error) {
            if (attempt === retries) {
                // If it failed completely, notify the text channel and skip to next track
                const channelId = player.fetch("channel");
                const guild = bot.guilds.cache.get(player.guildId);
                if (channelId && guild) {
                    const textCh = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
                    if (textCh) {
                        await textCh.send({
                            content: `<:cross:1488582282020126881> Failed to play **${nextTrack.info?.title || nextTrack.title}** due to a playback error. Skipping to next song...`
                        }).catch(() => {});
                    }
                }
                player.current = null;
                // Move to next
                await playNext(bot, player);
            } else {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    }
}

async function handleQueueEnd(bot, player) {
    const guild = bot.guilds.cache.get(player.guildId);
    if (!guild) return;

    const is247 = !!dbBridge.get247Channel(String(guild.id));
    const now = Date.now();

    // Cancel any existing queue end timeout to avoid race conditions
    const existingTimeout = player.fetch("queue_end_timeout");
    if (existingTimeout) {
        clearTimeout(existingTimeout);
        player.store("queue_end_timeout", null);
    }

    // Clear voice status immediately when queue ends
    const vcId = player.connection.channelId;
    if (vcId) {
        try {
            await bot.rest.put(`/channels/${vcId}/voice-status`, {
                body: { status: "" }
            });
        } catch (e) {}
    }

    if (is247) {
        const lastNotice = player.fetch("last_247_notice", 0);
        if (now - lastNotice > 5000) {
            const channelId = player.fetch("channel");
            const textCh = channelId ? guild.channels.cache.get(channelId) : null;
            if (textCh) {
                const embed = new EmbedBuilder()
                    .setDescription("♾️ **24/7 Mode is ON**: I will stay in the voice channel.")
                    .setColor(0x00d2ff);
                textCh.send({ embeds: [embed] }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                }).catch(() => {});
                player.store("last_247_notice", now);
            }
        }
        return; // Exit early, never disconnect if 24/7 is enabled
    }

    // Wait 30 seconds for any new track, if not disconnect
    const timeout = setTimeout(async () => {
        player.store("queue_end_timeout", null);
        if (player.current) return; // Something started playing

        await player.stopTrack();
        const finalVcId = player.connection.channelId;
        if (finalVcId) {
            // Re-verify status is clear
            try {
                await bot.rest.put(`/channels/${finalVcId}/voice-status`, {
                    body: { status: "" }
                });
            } catch (e) {}
            await bot.lavalink.leaveVoiceChannel(guild.id);
        }

        await deleteOldNpMessages(player, guild);

        const channelId = player.fetch("channel");
        let textCh = null;
        if (channelId) {
            textCh = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        }
        if (textCh) {
            const { embed, row } = buildThanksEmbed(bot);
            const reason = player.fetch("disconnect_reason");
            if (reason === "empty_vc") {
                const desc = embed.data?.description || embed.description || "";
                embed.setDescription("Everyone left the voice channel, so I stopped playing. " + desc.split("!").slice(1).join("!"));
                player.store("disconnect_reason", null);
            }
            await textCh.send({ embeds: [embed], components: [row] }).catch(() => {});
        }
    }, 30000);

    player.store("queue_end_timeout", timeout);
}

// Registers events on Shoukaku player with robust error tolerance
function registerPlayerEvents(bot, player) {
    if (player.eventsRegistered) return;
    player.eventsRegistered = true;

    const guild = bot.guilds.cache.get(player.guildId);

    // ── Start ──
    player.on('start', async (payload) => {
        // Clear disconnect timeouts if a track started playing
        const existingTimeout = player.fetch("queue_end_timeout");
        if (existingTimeout) {
            clearTimeout(existingTimeout);
            player.store("queue_end_timeout", null);
        }

        if (!player.current) {
            return;
        }
        const track = player.current;
        const info = track.info || track;

        // Reset player speed and audio filters for the new track (non-blocking)
        player.store("speed", 1.0);
        player.setFilters({}).catch(() => {});

        // Update voice channel status
        const vcId = player.connection.channelId;
        if (vcId) {
            try {
                await bot.rest.put(`/channels/${vcId}/voice-status`, {
                    body: { status: `<:play:1488582462841028879> playing: ${info.title}` }
                });
            } catch (e) {}
        }

        await deleteOldNpMessages(player, guild);

        const channelId = player.fetch("channel");
        if (!channelId) return;
        let channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel) return;

        const embed = getPlayerEmbed(player, bot);
        const components = getPlayerComponents(player, bot);

        try {
            const msg = await channel.send({ embeds: [embed], components: components });
            player.store("np_message_id", msg.id);
        } catch (e) {
            console.error("Failed to send NP message:", e);
        }
    });

    // ── End ──
    player.on('end', async (payload) => {
        const reason = payload.reason; // FINISHED, STOPPED, REPLACED, LOAD_FAILED
        if (reason === 'REPLACED') return;

        const track = player.current;
        if (track) {
            const info = track.info || track;
            // Track history
            const history = player.fetch("play_history", []);
            if (!history.includes(info.identifier)) {
                history.push(info.identifier);
                if (history.length > 100) history.shift();
                player.store("play_history", history);
            }
        }

        const loopMode = player.loop ?? 0;
        player.current = null;

        // Handle loop (skip if manually skipped by user)
        const manuallySkipped = player.fetch("manually_skipped", false);
        const manuallyStopped = player.fetch("manually_stopped", false);

        if (manuallyStopped) {
            player.store("manually_stopped", false);
        } else if (manuallySkipped) {
            player.store("manually_skipped", false);
        } else {
            // Apply loop logic if not skipped/stopped
            if (loopMode === 1 && track) { // loop track
                player.queue.unshift(track);
            } else if (loopMode === 2 && track) { // loop queue
                player.queue.push(track);
            }
        }

        // Trigger autoplay if queue is empty and autoplay is active
        if (player.queue.length === 0 && !manuallyStopped) {
            try {
                const autoTrack = await player.resolveAutoplay(track);
                if (autoTrack) {
                    player.queue.push(autoTrack);
                }
            } catch (err) {
                console.error("[AUTOPLAY] Autoplay error:", err);
            }
        }

        await playNext(bot, player);
    });

    // ── Exception ──
    player.on('exception', (payload) => {
        console.error("Lavalink player exception:", payload.exception || payload);
        player.current = null;
        playNext(bot, player).catch(() => {});
    });

    // ── Stuck ──
    player.on('stuck', (payload) => {
        console.error("Lavalink player stuck:", payload);
        player.stopTrack().catch(() => {});
    });
}

module.exports = {
    registerPlayerEvents,
    playNext
};

