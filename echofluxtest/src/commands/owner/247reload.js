const { EmbedBuilder } = require('discord.js');
const dbBridge = require('../../utils/dbBridge');

module.exports = {
    name: 'force247',
    aliases: ['connect247', 'f247'],
    description: 'Connects the bot to all configured 24/7 voice channels. (Owner only)',
    async execute(bot, message, args) {
        const isOwner = await bot.isOwner(message.author);
        if (!isOwner) return;

        const embed = new EmbedBuilder()
            .setTitle("<:config:1502013109836185600> Force 24/7 Connection")
            .setDescription("Starting connection to all 24/7 voice channels...")
            .setColor(0x00d2ff);

        const statusMsg = await message.reply({ embeds: [embed] });

        // Collect all guilds that have a 24/7 channel set in the database
        const guildsData = {};
        for (const [guildId] of bot.guilds.cache) {
            const channelId = dbBridge.get247Channel(guildId);
            if (channelId) guildsData[guildId] = channelId;
        }

        if (Object.keys(guildsData).length === 0) {
            embed.setDescription("No 24/7 channels configured in database.");
            embed.setColor(0xff0000);
            return await statusMsg.edit({ embeds: [embed] });
        }

        let connected = 0;
        let alreadyConnected = 0;
        let failed = 0;
        let notFound = 0;

        for (const [guildIdStr, channelId] of Object.entries(guildsData)) {
            const guild = bot.guilds.cache.get(guildIdStr);
            if (!guild) {
                notFound++;
                continue;
            }

            const channel = guild.channels.cache.get(channelId);
            if (!channel) {
                notFound++;
                continue;
            }

            const player = bot.lavalink.players.get(guild.id);
            if (player && player.connection.channelId === String(channel.id)) {
                alreadyConnected++;
                continue;
            }

            try {
                await bot.lavalink.joinVoiceChannel({
                    guildId: guild.id,
                    channelId: channel.id,
                    shardId: guild.shardId,
                    deaf: true
                });
                connected++;
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (e) {
                failed++;
            }
        }

        embed.setDescription(
            `**24/7 Connection Results:**\n\n` +
            `<:tick:1488582269298807024> **Connected:** ${connected}\n` +
            `<:information:1502013167830827048> **Already Connected:** ${alreadyConnected}\n` +
            `<:cross:1488582282020126881> **Failed:** ${failed}\n` +
            `⚠️ **Not Found (Guild/VC):** ${notFound}\n\n` +
            `**Total Configured:** ${Object.keys(guildsData).length}`
        );
        embed.setColor(0x00ff00);
        await statusMsg.edit({ embeds: [embed] });
    }
};
