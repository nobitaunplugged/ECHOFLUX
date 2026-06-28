const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function formatTime(ms) {
    if (!ms || isNaN(ms)) return "00:00";
    const seconds = Math.floor(ms / 1000);
    const secs = seconds % 60;
    const mins = Math.floor(seconds / 60) % 60;
    const hours = Math.floor(seconds / 3600);

    const pad = (num) => String(num).padStart(2, '0');
    if (hours > 0) {
        return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
}

function getEmbedColor() {
    const colorStr = process.env.EMBED_COLOR || "#00d2ff";
    return colorStr;
}

function getYtThumbnail(track) {
    const uri = track.uri || "";
    if (uri.includes("youtube.com") || uri.includes("youtu.be")) {
        return `https://img.youtube.com/vi/${track.identifier}/hqdefault.jpg`;
    }
    return null;
}

function buildThanksEmbed(bot) {
    const supportUrl = process.env.SUPPORT_INVITE || "";
    const botId = process.env.BOT_ID || bot.user.id;
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot%20applications.commands`;

    const embed = new EmbedBuilder()
        .setTitle("Thanks for using EchoFluxTest")
        .setDescription(`Hope you enjoyed the music! If you have any queries or need help, feel free to join our [Support Server](${supportUrl}) or [Invite Me](${inviteUrl}).`)
        .setColor(getEmbedColor() || 0x00d2ff);

    const avatarURL = bot.user.displayAvatarURL();
    embed.setFooter({ text: "EchoFluxTest Music", iconURL: avatarURL });
    embed.setThumbnail(avatarURL);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("Support Server")
            .setURL(supportUrl)
            .setStyle(ButtonStyle.Link)
            .setEmoji(bot.getEmoji("support", "<:support:1502013570328563843>")),
        new ButtonBuilder()
            .setLabel("Invite Me")
            .setURL(inviteUrl)
            .setStyle(ButtonStyle.Link)
            .setEmoji(bot.getEmoji("invite", "<:invite:1502013183446220983>")),
        new ButtonBuilder()
            .setLabel("Vote Me")
            .setURL(`https://top.gg/bot/${botId}/vote`)
            .setStyle(ButtonStyle.Link)
            .setEmoji(bot.getEmoji("vote", "🗳️"))
    );

    return { embed, row };
}

module.exports = {
    formatTime,
    getEmbedColor,
    getYtThumbnail,
    buildThanksEmbed
};
