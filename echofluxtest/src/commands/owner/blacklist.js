const { EmbedBuilder } = require('discord.js');
const dbBridge = require('../../utils/dbBridge');

module.exports = {
    name: 'blacklist',
    aliases: ['bl'],
    description: "Manage the bot's global blacklist.",
    async execute(bot, message, args) {
        const isOwner = await bot.isOwner(message.author);
        if (!isOwner) return;

        const prefix = bot.getPrefix(message.guild?.id);
        const sub = args[0]?.toLowerCase();

        if (sub === 'add') {
            const userArg = args[1];
            if (!userArg) {
                return message.reply(`<:cross:1488582282020126881> Missing user! Usage: \`${prefix}blacklist add <@user|user_id> [reason]\``);
            }
            
            const userId = userArg.replace(/[<@!>]/g, '');
            const user = await bot.users.fetch(userId).catch(() => null);
            if (!user) {
                return message.reply("<:cross:1488582282020126881> Invalid user or ID!");
            }

            const isUserOwner = await bot.isOwner(user);
            if (isUserOwner) {
                return message.reply("<:cross:1488582282020126881> **You cannot blacklist a bot owner!**");
            }

            const userIdStr = String(user.id);
            if (dbBridge.isBlacklisted(userIdStr)) {
                return message.reply(`<:cross:1488582282020126881> **${user.username}** is already blacklisted.`);
            }

            const reason = args.slice(2).join(' ') || "No reason provided.";
            await dbBridge.addBlacklist(userIdStr, reason);

            const embed = new EmbedBuilder()
                .setTitle("<:stop:1488582422646751422> User Blacklisted")
                .setDescription(`**User:** ${user} (${user.id})\n**Reason:** ${reason}`)
                .setColor(0x00d2ff);

            return message.reply({ embeds: [embed] });
        } 
        
        if (sub === 'remove') {
            const userArg = args[1];
            if (!userArg) {
                return message.reply(`<:cross:1488582282020126881> Missing user ID! Usage: \`${prefix}blacklist remove <user_id>\``);
            }
            const userId = userArg.replace(/[<@!>]/g, '');

            if (!dbBridge.isBlacklisted(userId)) {
                return message.reply(`<:cross:1488582282020126881> User ID **${userId}** is not in the blacklist.`);
            }

            await dbBridge.removeBlacklist(userId);

            const embed = new EmbedBuilder()
                .setTitle("<:tick:1488582269298807024>  User Unblacklisted")
                .setDescription(`**User ID:** ${userId}\n**Status:** Removed from blacklist`)
                .setColor(0x00d2ff);

            return message.reply({ embeds: [embed] });
        } 
        
        if (sub === 'list') {
            const data = dbBridge.getBlacklistData();
            if (Object.keys(data).length === 0) {
                return message.reply("<:tick:1488582269298807024>  The blacklist is currently empty.");
            }

            const embed = new EmbedBuilder()
                .setTitle("<:stop:1488582422646751422> Blacklisted Users")
                .setColor(0x00d2ff);

            let count = 0;
            for (const [userId, reason] of Object.entries(data)) {
                if (count >= 25) {
                    embed.setFooter({ text: "Showing first 25 blacklisted users." });
                    break;
                }

                embed.addFields({
                    name: `User ID: ${userId}`,
                    value: `**Reason:** ${reason || "No reason provided."}`,
                    inline: false
                });
                count++;
            }

            return message.reply({ embeds: [embed] });
        }

        // Help default fallback
        return message.reply(`Usage: \`${prefix}blacklist add/remove/list\`.`);
    }
};
