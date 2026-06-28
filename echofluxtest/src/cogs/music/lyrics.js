const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getYtThumbnail } = require('../../utils/embedHelpers');

// Helper to fetch with timeout
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 10000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

/**
 * Fetch lyrics natively from Lavalink v4.x (Lavasrc >= 4.3.0 or LavaLyrics plugin).
 */
async function _lavalink_get_lyrics(player, track) {
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
                const response = await fetch(url, {
                    headers: {
                        'Authorization': player.node.auth || player.node.password || ''
                    }
                });
                if (response.ok) {
                    res = await response.json();
                }
            }

            if (res) {
                if (typeof res === 'object') {
                    const type = res.type || res.Type;
                    if (type === 'text' || type === 'Text') {
                        return res.text || res.Text || null;
                    } else if (type === 'timed' || type === 'Timed') {
                        const lines = res.lines || [];
                        return lines.map(line => line.line || '').join('\n');
                    } else if (res.text) {
                        return res.text;
                    } else if (res.lyrics) {
                        return res.lyrics;
                    }
                } else if (typeof res === 'string') {
                    return res;
                }
            }
        } catch (e) {
            // ignore and try next
        }
    }
    return null;
}

/**
 * Strip brackets, common video suffixes, and normalise whitespace.
 */
function _clean_query(text) {
    if (!text) return "";
    let cleaned = text.replace(/\(.*?\)|\[.*?\]/g, '').trim();
    const suffixes = [
        'official video', 'official audio', 'audio', 'lyrics',
        'lyric video', 'music video', 'official music video',
        'hd', 'hq', 'mv', 'full video', 'video', 'visualizer',
        'visualiser', 'official lyric video', 'official mv',
    ];
    for (const suffix of suffixes) {
        const regex = new RegExp(`\\b${suffix}\\b`, 'gi');
        cleaned = cleaned.replace(regex, '');
    }
    return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Search LRCLIB for lyrics matching query.
 */
async function _lrclib_search(query) {
    const encoded = encodeURIComponent(query);
    const url = `https://lrclib.net/api/search?q=${encoded}`;
    try {
        const resp = await fetchWithTimeout(url, { timeout: 10000 });
        if (resp.status !== 200) return null;
        const data = await resp.json();
        if (!data || !Array.isArray(data)) return null;
        for (const item of data) {
            const lyrics = item.plainLyrics;
            if (lyrics && lyrics.trim()) {
                return lyrics.trim();
            }
        }
    } catch (e) {
        // ignore
    }
    return null;
}

/**
 * Try the LRCLIB /api/get endpoint (exact match).
 */
async function _lrclib_get(artist, title) {
    const params = new URLSearchParams({
        artist_name: artist,
        track_name: title,
    });
    const url = `https://lrclib.net/api/get?${params.toString()}`;
    try {
        const resp = await fetchWithTimeout(url, { timeout: 10000 });
        if (resp.status !== 200) return null;
        const data = await resp.json();
        const lyrics = data.plainLyrics;
        if (lyrics && lyrics.trim()) {
            return lyrics.trim();
        }
    } catch (e) {
        // ignore
    }
    return null;
}

/**
 * Fetch lyrics from LRCLIB API with multiple fallback strategies.
 */
async function fetchLyrics(artist, title) {
    const clean_title = _clean_query(title) || title;
    const clean_artist = _clean_query(artist) || artist;

    // Strategy 1: exact get endpoint
    if (clean_artist && clean_title) {
        const result = await _lrclib_get(clean_artist, clean_title);
        if (result) return result;
    }

    // Strategy 2: search "artist title"
    if (clean_artist) {
        const result = await _lrclib_search(`${clean_artist} ${clean_title}`);
        if (result) return result;
    }

    // Strategy 3: search title only
    const result = await _lrclib_search(clean_title);
    if (result) return result;

    // Strategy 4: try splitting "Artist - Title" if embedded in the title
    if (title && title.includes(" - ")) {
        const parts = title.split(" - ");
        const a = _clean_query(parts[0]);
        const t = _clean_query(parts[1]);
        if (a && t) {
            const resultGet = await _lrclib_get(a, t);
            if (resultGet) return resultGet;
            const resultSearch = await _lrclib_search(`${a} ${t}`);
            if (resultSearch) return resultSearch;
        }
    }

    return null;
}

/**
 * Try to parse a query into artist/title and fetch lyrics.
 */
async function search_and_fetch_lyrics(query) {
    if (query && query.includes(" - ")) {
        const parts = query.split(" - ");
        const lyrics = await fetchLyrics(parts[0].trim(), parts[1].trim());
        if (lyrics) {
            return { lyrics, displayTitle: query };
        }
    }

    const lyrics = await fetchLyrics("", query);
    if (lyrics) {
        return { lyrics, displayTitle: query };
    }

    return { lyrics: null, displayTitle: query };
}

/**
 * Paginated lyrics display with navigation buttons.
 */
class LyricsPaginationView {
    constructor(title, lyrics, userId, artist = null, thumbnail = null, iconUrl = null) {
        this.title = title;
        this.artist = artist;
        this.userId = userId;
        this.thumbnail = thumbnail;
        this.iconUrl = iconUrl;
        this.currentPage = 0;
        this.message = null;

        this.pages = this._splitLyrics(lyrics, 3800);
    }

    _splitLyrics(lyrics, maxChars = 3800) {
        if (!lyrics) return [""];
        if (lyrics.length <= maxChars) {
            return [lyrics];
        }

        const pages = [];
        const lines = lyrics.split('\n');
        let currentPage = "";

        for (const line of lines) {
            if (currentPage.length + line.length + 1 > maxChars) {
                if (currentPage) {
                    pages.push(currentPage.trim());
                }
                currentPage = line + '\n';
            } else {
                currentPage += line + '\n';
            }
        }

        if (currentPage.trim()) {
            pages.push(currentPage.trim());
        }

        return pages.length ? pages : [lyrics.slice(0, maxChars)];
    }

    generateEmbed() {
        const embed = new EmbedBuilder()
            .setColor(0x00d2ff);

        embed.setAuthor({
            name: `Lyrics — ${this.title}`,
            iconURL: this.iconUrl || "https://cdn-icons-png.flaticon.com/512/3269/3269090.png"
        });

        const lyricsText = this.pages[this.currentPage];
        let desc = "";
        if (this.artist) {
            desc += `**<:profile:1502014060802084994> Artist:** \`${this.artist}\`\n\n`;
        }
        desc += `**<:lyrics:1507601925321920583> Lyrics:**\n${lyricsText}`;
        embed.setDescription(desc);

        if (this.thumbnail) {
            embed.setThumbnail(this.thumbnail);
        }

        const footerParts = [];
        if (this.pages.length > 1) {
            footerParts.push(`Page ${this.currentPage + 1}/${this.pages.length}`);
        }
        if (footerParts.length > 0) {
            embed.setFooter({ text: footerParts.join(" • ") });
        }

        return embed;
    }

    getRow() {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('lyrics_prev')
                .setLabel('Previous')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(this.currentPage === 0),
            new ButtonBuilder()
                .setCustomId('lyrics_next')
                .setLabel('Next')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(this.currentPage >= this.pages.length - 1),
            new ButtonBuilder()
                .setCustomId('lyrics_close')
                .setLabel('Close')
                .setEmoji('<:exit:1502013119390810282>')
                .setStyle(ButtonStyle.Danger)
        );
        return row;
    }
}

module.exports = {
    name: 'lyrics',
    aliases: ['ly'],
    description: 'Show lyrics for the currently playing song, or search by name/URL.',
    fetchLyrics,
    LyricsPaginationView,
    _lavalink_get_lyrics,
    search_and_fetch_lyrics,
    async execute(bot, message, args) {
        let query = args && args.length > 0 ? args.join(' ').trim() : null;
        let thumbnail = null;
        let artist_display = null;
        let display_title = null;
        let lyrics_text = null;

        if (!query) {
            if (!bot.lavalink) {
                return message.reply("<:cross:1488582282020126881> Lavalink client is not initialized!");
            }

            const player = bot.lavalink.players.get(message.guild.id);
            if (!player || !player.current) {
                return message.reply("<:cross:1488582282020126881> There is no music playing right now! Provide a song name to search for lyrics.");
            }

            const voiceChannel = message.member?.voice?.channel;
            const botVoiceChannelId = player.connection.channelId;
            if (!voiceChannel || !botVoiceChannelId || voiceChannel.id !== String(botVoiceChannelId)) {
                return message.reply("<:cross:1488582282020126881> You must be in my voice channel to see the current song's lyrics!\n\n💡 *Tip: You can still search for any song from anywhere by using `.lyrics <song name>`*");
            }

            const track = player.current;
            const info = track.info || track;
            const artist = info.author || "";
            const title = info.title || "";
            display_title = info.title;
            artist_display = info.author;
            thumbnail = getYtThumbnail(track);

            const msg = await message.reply(`<a:loading1:1488582519304618236> Searching for lyrics of **${title}**...`);

            lyrics_text = await _lavalink_get_lyrics(player, track);
            if (!lyrics_text) {
                lyrics_text = await fetchLyrics(artist, title);
            }
            
            await processLyricsResult(msg, lyrics_text, display_title, artist_display, thumbnail);
        } else {
            display_title = query;
            const msg = await message.reply(`<a:loading1:1488582519304618236> Searching for lyrics of **${query}**...`);

            const result = await search_and_fetch_lyrics(query);
            lyrics_text = result.lyrics;
            display_title = result.displayTitle;

            await processLyricsResult(msg, lyrics_text, display_title, artist_display, thumbnail);
        }

        async function processLyricsResult(msg, lyrics, displayTitle, artist, thumb) {
            if (!lyrics) {
                return msg.edit({ content: `<:cross:1488582282020126881> Could not find lyrics for **${displayTitle}**. Try a different search query!` });
            }

            const iconUrl = message.guild?.iconURL() || null;
            const view = new LyricsPaginationView(displayTitle, lyrics, message.author.id, artist, thumb, iconUrl);
            view.message = msg;

            const hasMultiplePages = view.pages.length > 1;
            const components = hasMultiplePages ? [view.getRow()] : [];

            await msg.edit({
                content: null,
                embeds: [view.generateEmbed()],
                components: components
            });

            if (hasMultiplePages) {
                const collector = msg.createMessageComponentCollector({
                    time: 180000
                });

                collector.on('collect', async i => {
                    if (i.user.id !== message.author.id) {
                        return i.reply({ content: "This is not for you!", ephemeral: true });
                    }

                    if (i.customId === 'lyrics_prev') {
                        view.currentPage--;
                        await i.update({ embeds: [view.generateEmbed()], components: [view.getRow()] });
                    } else if (i.customId === 'lyrics_next') {
                        view.currentPage++;
                        await i.update({ embeds: [view.generateEmbed()], components: [view.getRow()] });
                    } else if (i.customId === 'lyrics_close') {
                        collector.stop('closed');
                        await i.message.delete().catch(() => {});
                    }
                });

                collector.on('end', async (collected, reason) => {
                    if (reason === 'closed') return;
                    const disabledRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('lyrics_prev')
                            .setLabel('Previous')
                            .setEmoji('◀️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('lyrics_next')
                            .setLabel('Next')
                            .setEmoji('▶️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('lyrics_close')
                            .setLabel('Close')
                            .setEmoji('<:exit:1502013119390810282>')
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(true)
                    );
                    await msg.edit({ components: [disabledRow] }).catch(() => {});
                });
            }
        }
    }
};
