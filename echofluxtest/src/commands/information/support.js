const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'support',
    aliases: ['helpme', 'issue'],
    description: "Get the support server link and details on how to report an issue",
    async execute(bot, message, args) {
        const botId = process.env.BOT_ID || bot.user.id;
        const supportInvite = process.env.SUPPORT_INVITE;
        const matrixLogo = process.env.MATRIXDEV_LOGO;
        const voteLink = `https://top.gg/bot/${botId}/vote`;

        const embed = new EmbedBuilder()
            .setTitle("Need Help With the Bot?")
            .setDescription("If you are experiencing issues or need assistance, please join our support server!")
            .setColor(0x00d2ff);

        if (bot.user.displayAvatarURL()) {
            embed.setThumbnail(bot.user.displayAvatarURL());
        }

        const footerData = { text: "EchoFluxTest Support Panel | © By Gacky & Matrix Studio" };
        if (matrixLogo) {
            footerData.iconURL = matrixLogo;
        }
        embed.setFooter(footerData);

        if (supportInvite) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Support Server")
                    .setURL(supportInvite)
                    .setStyle(ButtonStyle.Link)
                    .setEmoji(bot.getEmoji("setup", "<:setup:1502014141957672980>")),
                new ButtonBuilder()
                    .setLabel("Vote Me")
                    .setURL(voteLink)
                    .setStyle(ButtonStyle.Link)
                    .setEmoji(bot.getEmoji("vote", "🗳️"))
            );
            await message.reply({ embeds: [embed], components: [row] });
        } else {
            await message.reply({ embeds: [embed] });
        }
    }
};
