const { REST, Routes } = require('discord.js');

module.exports = {
    name: 'sync',
    description: 'Synchronizes commands tree with Discord globally. (Owner only)',
    async execute(bot, message, args) {
        const isOwner = await bot.isOwner(message.author);
        if (!isOwner) return;

        try {
            const token = process.env.TOKEN || bot.token;
            if (!token) {
                return message.reply("<:cross:1488582282020126881> Failed to sync: No bot token found.");
            }

            const rest = new REST({ version: '10' }).setToken(token);
            const commandsData = [];

            for (const [name, cmd] of bot.commands.entries()) {
                commandsData.push({
                    name: cmd.name,
                    description: cmd.description || 'No description provided.'
                });
            }

            const synced = await rest.put(
                Routes.applicationCommands(bot.user.id),
                { body: commandsData }
            );

            await message.reply(`<:tick:1488582269298807024>  Successfully synced ${synced.length} global command(s). Old commands removed.`);
        } catch (e) {
            await message.reply(`Failed to sync: ${e.message}`);
        }
    }
};
