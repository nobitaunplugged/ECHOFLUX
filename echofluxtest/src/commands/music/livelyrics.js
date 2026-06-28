const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { formatTime, getYtThumbnail } = require('../../utils/embedHelpers');

// Helper to fetch with timeout
async function fetchWithTimeout(url, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

// Helper to fetch synced lyrics from LRCLIB
async function fetchSyncedLyrics(artist, title) {
    const clean_title = title.replace(/\(.*?\)|\[.*?\]/g, '').trim();
    const clean_artist = artist.replace(/\(.*?\)|\[.*?\]/g, '').trim();
    
    // Strategy 1: Exact match get (only if both artist and title are present)
    if (clean_artist && clean_title) {
        const params = new URLSearchParams({
            artist_name: clean_artist,
            track_name: clean_title,
        });
        const url = `https://lrclib.net/api/get?${params.toString()}`;
        try {
            const resp = await fetchWithTimeout(url, 5000);
            if (resp.ok) {
                const data = await resp.json();
                if (data.syncedLyrics) {
                    return data.syncedLyrics;
                }
            }
        } catch(e) {}
    }
    
    // Strategy 2: Search API fallback
    const query = `${clean_artist} ${clean_title}`.trim();
    if (query) {
        const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
        try {
            const resp = await fetchWithTimeout(searchUrl, 5000);
            if (resp.ok) {
                const data = await resp.json();
                if (Array.isArray(data)) {
                    for (const item of data) {
                        if (item.syncedLyrics) return item.syncedLyrics;
                    }
                }
            }
        } catch(e) {}
    }
    return null;
}

// Fetch timed lyrics natively from Lavalink v4.x (Lavasrc or LavaLyrics)
async function fetchLavalinkTimedLyrics(player, track) {
    const encoded_track = encodeURIComponent(track.track || track.encoded || '');
    const sessionId = player.node.sessionId || player.node.session_id;
    const guildId = player.guildId;
    
    const endpoints = [
        `lyrics?track=${encoded_track}`,
        `lyrics?videoId=${encoded_track}`,
        `lyrics/${encoded_track}`,
    ];
    if (sessionId) {
        endpoints.push(
            `sessions/${sessionId}/players/${guildId}/lyrics`,
            `sessions/${sessionId}/players/${guildId}/tracks/${encoded_track}/lyrics`
        );
    }

    for (const endpoint of endpoints) {
        try {
            let res;
            if (player.node.rest && typeof player.node.rest.makeRequest === 'function') {
                res = await player.node.rest.makeRequest('GET', endpoint.startsWith('/') ? endpoint : `/${endpoint}`);
            } else {
                const secure = player.node.secure || false;
                let baseUrl = player.node.url || '';
                if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
                    baseUrl = `${secure ? 'https:' : 'http:'}//${baseUrl}`;
                }
                const url = `${baseUrl}/${endpoint}`;
                const response = await fetchWithTimeout(url, 5000);
                if (response.ok) {
                    res = await response.json();
                }
            }

            if (res && typeof res === 'object') {
                const type = res.type || res.Type;
                if (type === 'timed' || type === 'Timed') {
                    const lines = res.lines || [];
                    return lines.map(line => {
                        const timeMs = line.time || line.range?.start || 0;
                        const text = line.line || line.text || "";
                        return { time: timeMs, text };
                    });
                }
            }
        } catch (e) {
            // ignore
        }
    }
    return null;
}

// Parse LRC timestamps into milliseconds and text lines
function parseLRC(lrcText) {
    const lines = lrcText.split('\n');
    const result = [];
    const timeRegex = /\[(\d+):(\d+)\.(\d+)\]/;
    for (const line of lines) {
        const match = timeRegex.exec(line);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseInt(match[2]);
            const fractionStr = match[3];
            const milliseconds = parseFloat("0." + fractionStr) * 1000;
            const timeMs = (minutes * 60 + seconds) * 1000 + milliseconds;
            const text = line.replace(timeRegex, '').trim();
            result.push({ time: timeMs, text });
        }
    }
    return result;
}

module.exports = {
    name: 'livelyrics',
    aliases: ['ll', 'livelyric', 'sync'],
    description: 'Display live synchronized lyrics matching the current track position.',
    async execute(bot, message, args) {
        if (!bot.lavalink) {
            return message.reply('<:cross:1488582282020126881> Lavalink client is not initialized!');
        }

        const player = bot.lavalink.players.get(message.guild.id);
        const prefix = bot.getPrefix(message.guild.id);
        if (!player || !player.current) {
            return message.reply('<:cross:1488582282020126881> There is no music playing right now!');
        }

        // Voice channel check
        const voiceChannel = message.member?.voice?.channel;
        const botVcId = player.connection?.channelId;
        if (!voiceChannel || !botVcId || String(voiceChannel.id) !== String(botVcId)) {
            return message.reply(
                '<:cross:1488582282020126881> You must be in my voice channel to use live lyrics!'
            );
        }

        const track = player.current;
        const info = track.info || track;
        const artist = info.author || '';
        const title = info.title || '';
        const thumbnail = getYtThumbnail(track);

        const loadingMsg = await message.reply(`<a:loading1:1488582519304618236> Fetching live synchronized lyrics for **${title}**...`);

        let parsedLines = [];

        // 1. Try Lavalink-native timed lyrics first
        try {
            const lavalinkTimed = await fetchLavalinkTimedLyrics(player, track);
            if (lavalinkTimed && lavalinkTimed.length > 0) {
                parsedLines = lavalinkTimed;
            }
        } catch (e) {}

        // 2. Fall back to LRCLIB synced lyrics
        if (parsedLines.length === 0) {
            const syncedLyricsText = await fetchSyncedLyrics(artist, title);
            if (syncedLyricsText) {
                parsedLines = parseLRC(syncedLyricsText);
            }
        }

        if (parsedLines.length === 0) {
            return loadingMsg.edit({
                content: `<:cross:1488582282020126881> Synchronized live lyrics are not available for **${title}**.\n` +
                    `💡 *Tip: Try standard lyrics using \`${prefix}lyrics\`!*`
            });
        }

        // Clean up previous interval/collector if they exist on the player
        if (player.liveLyricsInterval) {
            clearInterval(player.liveLyricsInterval);
            player.liveLyricsInterval = null;
        }

        let lastActiveIndex = -2;

        const getEstimatedPosition = () => {
            const pos = player.position || 0;
            // Subtract latency offset (approx 800ms) to sync nicely with the user's audio stream
            return Math.max(0, pos - 800);
        };

        const generateLiveEmbed = (currentPos, activeIndex) => {
            const displayLines = [];
            // Show from activeIndex to activeIndex + 4 (up to 5 lines). Old lines are removed completely!
            const startShow = Math.max(0, activeIndex);
            for (let i = startShow; i < Math.min(parsedLines.length, startShow + 5); i++) {
                if (i === activeIndex) {
                    displayLines.push(`**${parsedLines[i].text}**`);
                } else {
                    displayLines.push(parsedLines[i].text);
                }
            }

            const desc = displayLines.length > 0 ? displayLines.join('\n') : "*Instrumental / Silence*";
            const totalLength = info.length || info.duration || 0;

            const embed = new EmbedBuilder()
                .setTitle(`Live Lyrics - ${title}`)
                .setDescription(
                    `**Progress:** \`${formatTime(currentPos)} / ${formatTime(totalLength)}\`\n\n` +
                    desc
                )
                .setColor(0x00d2ff);

            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }

            embed.setFooter({
                text: `Line ${activeIndex >= 0 ? activeIndex + 1 : 0} of ${parsedLines.length} | Live sync active`
            });

            return embed;
        };

        const closeBtn = new ButtonBuilder()
            .setCustomId('close_live_lyrics')
            .setLabel('Close Live Sync')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('<:exit:1502013119390810282>');

        const row = new ActionRowBuilder().addComponents(closeBtn);

        // Initial render
        const initialPos = getEstimatedPosition();
        let initialActiveIndex = -1;
        for (let i = 0; i < parsedLines.length; i++) {
            if (parsedLines[i].time <= initialPos) {
                initialActiveIndex = i;
            } else {
                break;
            }
        }
        lastActiveIndex = initialActiveIndex;

        await loadingMsg.edit({
            content: null,
            embeds: [generateLiveEmbed(initialPos, initialActiveIndex)],
            components: [row]
        });

        const collector = loadingMsg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000 // 5 minutes max per session
        });

        const updateInterval = setInterval(async () => {
            // Stop if track changed or stopped
            if (!player || !player.current || player.current.track !== track.track) {
                clearInterval(updateInterval);
                collector.stop('track_ended');
                return;
            }

            const currentPos = getEstimatedPosition();
            let activeIndex = -1;
            for (let i = 0; i < parsedLines.length; i++) {
                if (parsedLines[i].time <= currentPos) {
                    activeIndex = i;
                } else {
                    break;
                }
            }

            // Only edit if the active line changes to prevent Discord rate limits/freezing
            if (activeIndex !== lastActiveIndex) {
                lastActiveIndex = activeIndex;
                await loadingMsg.edit({
                    embeds: [generateLiveEmbed(currentPos, activeIndex)]
                }).catch(() => {
                    clearInterval(updateInterval);
                    collector.stop('msg_deleted');
                });
            }
        }, 500);

        player.liveLyricsInterval = updateInterval;

        collector.on('collect', async i => {
            if (i.user.id !== message.author.id) {
                return i.reply({ content: 'This is not for you!', ephemeral: true });
            }
            if (i.customId === 'close_live_lyrics') {
                collector.stop('user_closed');
            }
        });

        collector.on('end', async (collected, reason) => {
            clearInterval(updateInterval);
            if (player.liveLyricsInterval === updateInterval) {
                player.liveLyricsInterval = null;
            }

            if (reason === 'user_closed') {
                await loadingMsg.delete().catch(() => {});
            } else {
                const disabledRow = new ActionRowBuilder().addComponents(
                    closeBtn.setDisabled(true)
                );
                const currentPos = getEstimatedPosition();
                let activeIndex = -1;
                for (let i = 0; i < parsedLines.length; i++) {
                    if (parsedLines[i].time <= currentPos) {
                        activeIndex = i;
                    } else {
                        break;
                    }
                }
                const finalEmbed = generateLiveEmbed(currentPos, activeIndex);
                finalEmbed.setFooter({ text: `Live sync ended | Reason: ${reason}` });
                await loadingMsg.edit({
                    embeds: [finalEmbed],
                    components: [disabledRow]
                }).catch(() => {});
            }
        });
    }
};
