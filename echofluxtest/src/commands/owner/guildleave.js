const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'gleave',
    aliases: ['guildleave'],
    description: 'Makes the bot leave the specified guild. (Owner only)',
    async execute(bot, message, args) {
        const isOwner = await bot.isOwner(message.author);
        if (!isOwner) return;

        const prefix = bot.getPrefix(message.guild?.id);
        const guildId = args[0];
        if (!guildId) {
            return message.reply(`<:cross:1488582282020126881> Guild ID missing! Usage: \`${prefix}gleave <guild_id>\``);
        }

        try {
            const guild = bot.guilds.cache.get(guildId);
            if (!guild) {
                return message.reply("<:cross:1488582282020126881> Guild not found! Please check the guild ID.");
            }

            const embed = new EmbedBuilder()
                .setTitle("<:exit:1502013119390810282> Leaving Guild")
                .setDescription(`Leaving **${guild.name}** (${guild.id})`)
                .setColor(0x00d2ff);

            await message.reply({ embeds: [embed] });
            await guild.leave();
        } catch (e) {
            await message.reply(`<:cross:1488582282020126881> An error occurred: ${e.message}`);
        }
    }
};
