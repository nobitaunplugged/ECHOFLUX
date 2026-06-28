const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'ping',
    description: "Check bot latency",
    async execute(bot, message, args) {
        const wsLatency = Math.round(bot.ws.ping);

        const start = Date.now();
        const msg = await message.reply("Pinging...");
        const messageLatency = Math.round(Date.now() - start);

        const dbStart = Date.now();
        let dbLatency = "Error";
        try {
            const db = require('../../utils/db');
            await db.get("SELECT 1");
            dbLatency = `${Math.round(Date.now() - dbStart)}ms`;
        } catch (e) {
            dbLatency = "N/A";
        }

        const embed = new EmbedBuilder()
            .setTitle("Pong! 🏓")
            .setColor(0x00d2ff)
            .addFields(
                { name: "Websocket", value: `\`${wsLatency}ms\``, inline: true },
                { name: "Message Roundtrip", value: `\`${messageLatency}ms\``, inline: true },
                { name: "Database", value: `\`${dbLatency}\``, inline: true }
            )
            .setFooter({ text: "Bot latency information" })
            .setTimestamp();

        await msg.edit({ content: null, embeds: [embed] });
    }
};
