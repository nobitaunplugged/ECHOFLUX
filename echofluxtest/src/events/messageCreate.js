const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'messageCreate',
    async execute(bot, message) {
        if (message.author.bot) return;

        const prefix = bot.getPrefix(message.guild?.id);
        let usedPrefix = null;

        // Mention check
        const mentionRegex = new RegExp(`^<@!?${bot.user.id}>`);
        const isMentioned = mentionRegex.test(message.content);

        // Check prefix
        if (message.content.startsWith(prefix)) {
            usedPrefix = prefix;
        } else if (isMentioned) {
            usedPrefix = message.content.match(mentionRegex)[0];
        } else if (bot.hasNoPrefixAccess(message.author.id)) {
            usedPrefix = "";
        }

        if (usedPrefix === null) {
            // Check if bot was just mentioned to send prefix info
            if (isMentioned && message.content.replace(mentionRegex, '').trim().length === 0) {
                const mentionEvent = require('./mention');
                if (mentionEvent && typeof mentionEvent.execute === 'function') {
                    return mentionEvent.execute(bot, message);
                }
            }
            return;
        }

        // Parse args and command name
        const argsStr = message.content.slice(usedPrefix.length).trim();
        const args = argsStr.split(/\s+/);
        const commandName = args.shift().toLowerCase();

        if (!commandName && isMentioned) {
            const mentionEvent = require('./mention');
            if (mentionEvent && typeof mentionEvent.execute === 'function') {
                return mentionEvent.execute(bot, message);
            }
            return;
        }

        const cmd = bot.commands.get(commandName) || bot.commands.get(bot.aliases.get(commandName));
        if (!cmd) return;

        // Globally block blacklisted/rate-limited users
        const allowed = await bot.globallyBlockBlacklisted(message);
        if (!allowed) return;

        // Check ignored channels
        if (message.guild && commandName !== 'ignore') {
            const dbBridge = require('../utils/dbBridge');
            const ignoredChannels = dbBridge.getIgnoredChannels(message.guild.id);
            if (ignoredChannels.includes(message.channel.id)) {
                const embed = new EmbedBuilder()
                    .setDescription("bot cmds are ignored in this channels")
                    .setColor(0x00d2ff);
                return message.reply({ embeds: [embed] }).catch(() => { });
            }
        }

        try {
            const { sendWebhookLog } = require('../utils/webhooks');
            const logEmbed = new EmbedBuilder()
                .setTitle("Command Log")
                .setColor(0x00d2ff)
                .setDescription(
                    `**Executor Details**\n` +
                    ` └ **User:** ${message.author.username} ( \`${message.author.id}\` )\n` +
                    ` └ **Mention:** ${message.author}\n\n` +
                    `**Location Context**\n` +
                    ` └ **Server:** ${message.guild ? `${message.guild.name} ( \`${message.guild.id}\` )` : 'Direct Message'}\n` +
                    ` └ **Channel:** ${message.guild ? `${message.channel.name} ( \`${message.channel.id}\` )` : 'DM'}\n\n` +
                    `**Action Details**\n` +
                    ` └ **Command:** \`${commandName}\`\n` +
                    ` └ **Full Content:**\n\`\`\`\n${message.content}\n\`\`\``
                )
                .setFooter({ text: `${bot.user.username} Commands Monitor` })
                .setTimestamp();

            await sendWebhookLog("Command", logEmbed);

            await cmd.execute(bot, message, args);
        } catch (error) {
            console.error(`Error executing prefix command ${commandName}:`, error);
            const embed = new EmbedBuilder()
                .setTitle("<:cross:1488582282020126881> Command Error")
                .setDescription(`An error occurred while executing this command: \`${error.message}\``)
                .setColor(0x00d2ff);
            await message.reply({ embeds: [embed] }).catch(() => { });
        }
    }
};
