const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');


module.exports = {
    name: 'setprefix',
    aliases: ['prefix'],
    description: "Change the bot's prefix for this server.",
    async execute(bot, message, args) {
        // Permissions check
        const member = message.member;
        if (!member) return;

        // Check manage guild permission
        if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            const embed = new EmbedBuilder()
                .setDescription("<:cross:1488582282020126881> You need `Manage Server` permission to use this command.")
                .setColor(0x00d2ff);
            return message.reply({ embeds: [embed] });
        }

        const dbBridge = require('../../utils/dbBridge');
        const guildId = message.guild.id;
        const defaultPrefix = ".";

        const newPrefix = args[0];

        if (!newPrefix) {
            const currentPrefix = dbBridge.getPrefix(guildId, defaultPrefix);
            const embed = new EmbedBuilder()
                .setTitle("Prefix Configuration")
                .setDescription(`The current prefix for this server is \`${currentPrefix}\`\n\nTo change it, use: \`${currentPrefix}prefix <new_prefix>\`\nTo reset to default, use: \`${currentPrefix}prefix reset\``)
                .setColor(0x00d2ff);
            return message.reply({ embeds: [embed] });
        }

        if (newPrefix.toLowerCase() === "reset") {
            const db = require('../../utils/db');
            await db.run("DELETE FROM prefixes WHERE guild_id = ?", [String(guildId)]);
            
            // Delete from local cache directly or reload caches
            await dbBridge.loadCaches();
            
            const embed = new EmbedBuilder()
                .setDescription(`<:tick:1488582269298807024>  Prefix has been reset to the default: \`${defaultPrefix}\``)
                .setColor(0x00d2ff);
            return message.reply({ embeds: [embed] });
        }

        if (newPrefix.length > 5) {
            const embed = new EmbedBuilder()
                .setDescription("<:cross:1488582282020126881> Prefix cannot be longer than 5 characters.")
                .setColor(0x00d2ff);
            return message.reply({ embeds: [embed] });
        }
        
        await dbBridge.setPrefix(guildId, newPrefix);

        const embed = new EmbedBuilder()
            .setDescription(`<:tick:1488582269298807024>  Prefix has been updated to \`${newPrefix}\``)
            .setColor(0x00d2ff);
        await message.reply({ embeds: [embed] });
    }
};
