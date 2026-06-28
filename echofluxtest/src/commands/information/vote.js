const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'vote',
    description: "Vote for the bot",
    async execute(bot, message, args) {
        const botId = process.env.BOT_ID || bot.user.id;
        const voteLink = `https://top.gg/bot/${botId}/vote`;

        const embed = new EmbedBuilder()
            .setTitle("Support us by voting!")
            .setDescription("Help us grow by voting on top.gg. Your vote matters!")
            .setColor(0x00d2ff)
            .addFields(
                {
                    name: "Why vote?",
                    value: "Voting helps us reach more people and improves our ranking on bot listing sites.",
                    inline: false
                },
                {
                    name: "Benefits",
                    value: "Thank you for your support! 🙏",
                    inline: false
                }
            )
            .setFooter({ text: "Every vote counts!" });

        if (bot.user.displayAvatarURL()) {
            embed.setThumbnail(bot.user.displayAvatarURL());
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Vote for us!")
                .setURL(voteLink)
                .setStyle(ButtonStyle.Link)
                .setEmoji(bot.getEmoji("vote", "🗳️"))
        );

        await message.reply({ embeds: [embed], components: [row] });
    }
};
