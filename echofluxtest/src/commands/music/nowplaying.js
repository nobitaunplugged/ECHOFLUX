const { EmbedBuilder } = require('discord.js');
const { formatTime, getYtThumbnail } = require('../../utils/embedHelpers');
const { detectSource, getSourceEmoji } = require('../../utils/playerEmbed');

module.exports = {
    name: 'nowplaying',
    aliases: ['now'],
    description: 'Displays information about the currently playing track.',
    async execute(bot, message, args) {
        if (!bot.lavalink) {
            return await message.reply("<:cross:1488582282020126881> Lavalink client is not initialized!");
        }

        const player = bot.lavalink.players.get(message.guild.id);
        if (!player || !player.connection || !player.connection.channelId) {
            return await message.reply("<:cross:1488582282020126881> I am not connected to a voice channel!");
        }
        if (!player.current) {
            return await message.reply("<:cross:1488582282020126881> There is no music playing right now!");
        }

        const track = player.current;
        const info = track.info || track;
        const embed = new EmbedBuilder()
            .setColor(0x00d2ff)
            .setTitle("<:Music:1488582297321214081> Now Playing")
            .setDescription(`[${info.title}](${info.uri})`);

        const thumb = getYtThumbnail(info);
        if (thumb) {
            embed.setThumbnail(thumb);
        }

        const source = detectSource(track);
        const sourceEmoji = getSourceEmoji(track, bot);

        const duration = info.length || info.duration || 0;
        const pStr = formatTime(player.position);
        const dStr = formatTime(duration);

        embed.addFields(
            { name: "Channel/Author", value: info.author || "Unknown", inline: true },
            { name: "Source", value: `${sourceEmoji} ${source}`, inline: true },
            { name: "Progress", value: `\`${pStr} / ${dStr}\``, inline: true }
        );

        // Progress bar
        const barLength = 20;
        const ratio = duration > 0 ? Math.max(0.0, Math.min(1.0, player.position / duration)) : 0;
        const filled = Math.floor(ratio * barLength);
        const empty = barLength - filled;
        const bar = empty > 0 
            ? ("▬".repeat(filled) + "🔘" + "▬".repeat(Math.max(0, empty - 1))) 
            : ("▬".repeat(barLength - 1) + "🔘");

        embed.addFields({ name: "\u200b", value: `\`${bar}\``, inline: false });

        embed.setFooter({
            text: `Requested by ${message.author.tag}`,
            iconURL: message.author.displayAvatarURL()
        });

        await message.reply({ embeds: [embed] });
    }
};
