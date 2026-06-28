/**
 * Lyrics command — fetch and display song lyrics with pagination.
 * Delegates all heavy lifting to the shared lyrics library in cogs/music/lyrics.js
 */

const {
    fetchLyrics,
    LyricsPaginationView,
    _lavalink_get_lyrics,
    search_and_fetch_lyrics
} = require('../../cogs/music/lyrics');
const { getYtThumbnail } = require('../../utils/embedHelpers');

module.exports = {
    name: 'lyrics',
    aliases: ['ly'],
    description: 'Show lyrics for the currently playing song, or search by name.',
    async execute(bot, message, args) {
        const query = args && args.length > 0 ? args.join(' ').trim() : null;

        let thumbnail   = null;
        let artistDisplay = null;
        let displayTitle  = null;
        let lyricsText    = null;

        // ── No query → use current playing track ──────────────────────────
        if (!query) {
            if (!bot.lavalink) {
                return message.reply('<:cross:1488582282020126881> Lavalink client is not initialized!');
            }

            const player = bot.lavalink.players.get(message.guild.id);
            const prefix = bot.getPrefix(message.guild.id);
            if (!player || !player.current) {
                return message.reply(
                    '<:cross:1488582282020126881> There is no music playing right now!\n' +
                    `💡 *Tip: Search any song with \`${prefix}lyrics <song name>\`*`
                );
            }

            // Voice channel check
            const voiceChannel = message.member?.voice?.channel;
            const botVcId = player.connection?.channelId;
            if (!voiceChannel || !botVcId || String(voiceChannel.id) !== String(botVcId)) {
                return message.reply(
                    '<:cross:1488582282020126881> You must be in my voice channel to see the current song\'s lyrics!\n\n' +
                    `💡 *Tip: You can still search for any song using \`${prefix}lyrics <song name>\`*`
                );
            }

            const track  = player.current;
            const info   = track.info || track;
            const artist = info.author || '';
            const title  = info.title  || '';

            displayTitle  = title;
            artistDisplay = info.author;
            thumbnail     = getYtThumbnail(track);

            const msg = await message.reply(`<a:loading1:1488582519304618236> Searching for lyrics of **${title}**...`);

            // Try Lavalink-native lyrics first, then fall back to LRCLIB
            lyricsText = await _lavalink_get_lyrics(player, track);
            if (!lyricsText) {
                lyricsText = await fetchLyrics(artist, title);
            }

            return _sendLyrics(msg, lyricsText, displayTitle, artistDisplay, thumbnail, message);
        }

        // ── Query provided → search LRCLIB ────────────────────────────────
        displayTitle = query;
        const msg = await message.reply(`<a:loading1:1488582519304618236> Searching for lyrics of **${query}**...`);

        const result = await search_and_fetch_lyrics(query);
        lyricsText   = result.lyrics;
        displayTitle = result.displayTitle;

        return _sendLyrics(msg, lyricsText, displayTitle, artistDisplay, thumbnail, message);
    }
};

// ─── Shared send helper ───────────────────────────────────────────────────────

async function _sendLyrics(msg, lyrics, displayTitle, artist, thumbnail, message) {
    if (!lyrics) {
        return msg.edit({
            content: `<:cross:1488582282020126881> Could not find lyrics for **${displayTitle}**. Try a different search query!`
        });
    }

    const iconUrl = message.guild?.iconURL() || null;
    const view    = new LyricsPaginationView(displayTitle, lyrics, message.author.id, artist, thumbnail, iconUrl);

    const hasPages = view.pages.length > 1;
    const components = hasPages ? [view.getRow()] : [];

    await msg.edit({ content: null, embeds: [view.generateEmbed()], components });

    if (!hasPages) return; // Single-page — no collector needed

    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

    const collector = msg.createMessageComponentCollector({ time: 180_000 });

    collector.on('collect', async i => {
        if (i.user.id !== message.author.id) {
            return i.reply({ content: '<:cross:1488582282020126881> This is not for you!', ephemeral: true });
        }

        if (i.customId === 'lyrics_prev') {
            view.currentPage = Math.max(0, view.currentPage - 1);
            await i.update({ embeds: [view.generateEmbed()], components: [view.getRow()] });
        } else if (i.customId === 'lyrics_next') {
            view.currentPage = Math.min(view.pages.length - 1, view.currentPage + 1);
            await i.update({ embeds: [view.generateEmbed()], components: [view.getRow()] });
        } else if (i.customId === 'lyrics_close') {
            collector.stop('closed');
            await i.message.delete().catch(() => {});
        }
    });

    collector.on('end', async (_, reason) => {
        if (reason === 'closed') return;
        // Disable buttons on timeout
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('lyrics_prev').setLabel('Previous').setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('lyrics_next').setLabel('Next').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('lyrics_close').setLabel('Close').setEmoji('<:exit:1502013119390810282>').setStyle(ButtonStyle.Danger).setDisabled(true)
        );
        await msg.edit({ embeds: [view.generateEmbed()], components: [disabledRow] }).catch(() => {});
    });
}
