const dbBridge = require('./dbBridge');
const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { sendWebhookLog } = require('./webhooks');

class RateLimitHandler {
    constructor() {
        this.commandHistory = new Map();
        this.shortSongHistory = new Map();

        this.CMD_LIMIT = 7;
        this.CMD_WINDOW = 10 * 1000; // 10 seconds in ms

        this.SONG_LIMIT = 5;
        this.SONG_WINDOW = 30 * 1000; // 30 seconds in ms
    }

    checkCommandRatelimit(userId) {
        const now = Date.now();
        if (!this.commandHistory.has(userId)) {
            this.commandHistory.set(userId, []);
        }
        let history = this.commandHistory.get(userId);
        history = history.filter(t => now - t < this.CMD_WINDOW);
        history.push(now);
        this.commandHistory.set(userId, history);

        return history.length > this.CMD_LIMIT;
    }

    checkShortSongRatelimit(userId) {
        const now = Date.now();
        if (!this.shortSongHistory.has(userId)) {
            this.shortSongHistory.set(userId, []);
        }
        let history = this.shortSongHistory.get(userId);
        history = history.filter(t => now - t < this.SONG_WINDOW);
        history.push(now);
        this.shortSongHistory.set(userId, history);

        return history.length > this.SONG_LIMIT;
    }
}

const ratelimitHandler = new RateLimitHandler();

function autoBlacklistUser(user, reason) {
    const userIdStr = String(user.id);
    if (!dbBridge.isBlacklisted(userIdStr)) {
        dbBridge.addBlacklist(userIdStr, reason).catch(() => {});
    }
}

async function logRatelimitAttempt({ bot, user, guild, channel, message, reason = "Rate Limit Triggered", detailAnalysis = "None" }) {
    const embed = new EmbedBuilder()
        .setTitle("🚨 Rate Limit Protection Triggered")
        .setDescription(`**User Blacklisted Automatically**\n**Reason:** ${reason}`)
        .setColor(0xFF0000)
        .setTimestamp();

    if (user) {
        embed.setAuthor({ name: user.tag || user.username, iconURL: user.displayAvatarURL() });
        embed.addFields({ name: "User Info", value: `**Name:** ${user.username}\n**ID:** \`${user.id}\`\n**Mention:** <@${user.id}>`, inline: true });
    }

    if (guild) {
        embed.setThumbnail(guild.iconURL());
        embed.addFields({ name: "Server Info", value: `**Name:** ${guild.name}\n**ID:** \`${guild.id}\``, inline: true });
    }

    if (channel) {
        embed.addFields({ name: "Channel & Context", value: `**Channel:** ${channel.name} (\`${channel.id}\`)\n**Mention:** <#${channel.id}>`, inline: false });
    }

    embed.addFields({ name: "Detailed Analysis", value: `\`\`\`${detailAnalysis}\`\`\`\n`, inline: false });

    const components = [];
    if (message && message.url) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Jump to Message")
                .setURL(message.url)
                .setStyle(ButtonStyle.Link)
        );
        components.push(row);
    }

    await sendWebhookLog("RateLimit", embed, components);
}

module.exports = {
    ratelimitHandler,
    autoBlacklistUser,
    logRatelimitAttempt
};
