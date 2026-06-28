const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { formatTime, getYtThumbnail } = require('./embedHelpers');

function detectSource(track) {
    const uri = track.info?.uri || track.uri || "";
    const source = track.info?.sourceName || track.sourceName || "";

    if (source === "youtube" || uri.includes("youtube.com") || uri.includes("youtu.be")) {
        return "YouTube";
    } else if (source === "spotify" || uri.includes("spotify.com")) {
        return "Spotify";
    } else if (source === "soundcloud" || uri.includes("soundcloud.com")) {
        return "SoundCloud";
    } else if (source === "jiosaavn" || uri.includes("jiosaavn.com") || uri.includes("saavn.com")) {
        return "JioSaavn";
    } else if (source === "applemusic" || uri.includes("apple.com")) {
        return "Apple Music";
    } else if (source) {
        return source.charAt(0).toUpperCase() + source.slice(1);
    }
    return "Unknown";
}

function getSourceEmoji(track, bot) {
    const source = detectSource(track);
    if (source === "YouTube") return "<:youtube:1502210708459360347>";
    if (source === "Spotify") return "<:spotify:1502012709460250746>";
    if (source === "SoundCloud") return "<:SoundCloud:1488582309895602196>";
    if (source === "JioSaavn") return "<:jiosaavn:1507353942848180224>";
    if (source === "Apple Music") return "<:apple:1507614014597763093>";
    return "<:Music:1488582297321214081>";
}

function getPlayerEmbed(player, bot) {
    const track = player.current;
    if (!track) {
        return new EmbedBuilder().setDescription("Nothing is currently playing.").setColor(0x00d2ff);
    }

    const info = track.info || track;
    const position = formatTime(player.position);
    const duration = formatTime(info.length || info.duration);
    const requester = track.requester ? `<@${track.requester}>` : "Unknown";

    const barLength = 16;
    const trackLength = info.length || info.duration || 0;
    const ratio = trackLength > 0 ? Math.max(0.0, Math.min(1.0, player.position / trackLength)) : 0;
    const filled = Math.floor(ratio * barLength);
    const empty = barLength - filled;
    const bar = "▬".repeat(filled) + "🔘" + "▬".repeat(Math.max(0, empty - 1));

    const loopMode = player.loop ?? 0;
    const loopText = loopMode === 0 ? "Disabled" : (loopMode === 1 ? "Track" : "Queue");
    const autoplayText = player.fetch("autoplay", false) ? "Enabled" : "Disabled";
    const currentSpeed = player.fetch("speed", 1.0);

    const source = detectSource(track);
    const sourceEmoji = getSourceEmoji(track, bot);

    const embed = new EmbedBuilder()
        .setTitle(info.title)
        .setURL(info.uri)
        .setColor(0x00d2ff)
        .addFields(
            { name: "Author", value: info.author || "Unknown", inline: true },
            { name: "Source", value: `${sourceEmoji} ${source}`, inline: true },
            { name: "Requested By", value: requester, inline: true },
            { name: "Duration", value: `\`${position} / ${duration}\``, inline: true },
            { name: "Volume", value: `\`${player.volume ?? 80}%\``, inline: true },
            { name: "Speed", value: `\`${currentSpeed}x\``, inline: true },
            { name: "Progress", value: `\`${bar}\``, inline: false },
            { name: "Loop", value: `\`${loopText}\``, inline: true },
            { name: "Autoplay", value: `\`${autoplayText}\``, inline: true }
        );

    const thumb = getYtThumbnail(info);
    if (thumb) {
        embed.setThumbnail(thumb);
    }

    embed.setFooter({
        text: "EchoFluxTest Music",
        iconURL: bot.user.displayAvatarURL()
    });

    return embed;
}

// Build standard components row-by-row
function getPlayerComponents(player, bot) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('player_play_pause').setLabel("Play/Pause").setStyle(ButtonStyle.Secondary).setEmoji(bot.getEmoji("play_pause", "⏯️")),
        new ButtonBuilder().setCustomId('player_skip').setLabel("Skip").setStyle(ButtonStyle.Secondary).setEmoji(bot.getEmoji("skip", "⏭️")),
        new ButtonBuilder().setCustomId('player_stop').setLabel("Stop").setStyle(ButtonStyle.Danger).setEmoji(bot.getEmoji("stop", "<:stop:1502013562300665977>")),
        new ButtonBuilder().setCustomId('player_vol_down').setLabel("Vol -").setStyle(ButtonStyle.Secondary).setEmoji(bot.getEmoji("volume_low", "🔉")),
        new ButtonBuilder().setCustomId('player_vol_up').setLabel("Vol +").setStyle(ButtonStyle.Secondary).setEmoji(bot.getEmoji("volume_high", "🔊"))
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('player_seek_back_20').setLabel("-20s").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('player_seek_back_10').setLabel("-10s").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('player_seek_fwd_10').setLabel("+10s").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('player_seek_fwd_20').setLabel("+20s").setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('player_autoplay').setLabel("Autoplay").setStyle(ButtonStyle.Secondary).setEmoji(bot.getEmoji("autoplay", "♾️")),
        new ButtonBuilder().setCustomId('player_loop').setLabel("Loop").setStyle(ButtonStyle.Secondary).setEmoji(bot.getEmoji("loop", "🔁")),
        new ButtonBuilder().setCustomId('player_favourite').setLabel("Favourite").setStyle(ButtonStyle.Secondary).setEmoji("<:heart:1507353921641779252>"),
        new ButtonBuilder().setCustomId('player_lyrics').setLabel("Lyrics").setStyle(ButtonStyle.Secondary).setEmoji("<:lyrics:1507601925321920583>"),
        new ButtonBuilder().setCustomId('player_queue_view').setLabel("Queue").setStyle(ButtonStyle.Secondary).setEmoji("<:queue:1507601887703203871>")
    );

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('player_add_next').setLabel("Add Next").setStyle(ButtonStyle.Primary).setEmoji("<:add:1502013026583183480>"),
        new ButtonBuilder().setCustomId('player_remove_track').setLabel("Remove").setStyle(ButtonStyle.Danger).setEmoji("<:trash:1502013580634226718>"),
        new ButtonBuilder().setCustomId('player_playlist').setLabel("Playlist").setStyle(ButtonStyle.Secondary).setEmoji("<:playlists:1502013365847855325>")
    );

    const currentSpeed = player.fetch("speed", 1.0);
    const speedSelect = new StringSelectMenuBuilder()
        .setCustomId('player_speed_select')
        .setPlaceholder("Playback Speed")
        .addOptions(
            { label: "0.5x", value: "0.5", default: currentSpeed === 0.5, emoji: "<:asd:1507356155637137562>" },
            { label: "1x (Normal)", value: "1.0", default: currentSpeed === 1.0, emoji: "<:asd:1507356155637137562>" },
            { label: "2x", value: "2.0", default: currentSpeed === 2.0, emoji: "<:asd:1507356155637137562>" },
            { label: "3x", value: "3.0", default: currentSpeed === 3.0, emoji: "<:asd:1507356155637137562>" },
            { label: "4x", value: "4.0", default: currentSpeed === 4.0, emoji: "<:asd:1507356155637137562>" }
        );
    const row5 = new ActionRowBuilder().addComponents(speedSelect);

    return [row1, row2, row3, row4, row5];
}

module.exports = {
    detectSource,
    getSourceEmoji,
    getPlayerEmbed,
    getPlayerComponents
};
