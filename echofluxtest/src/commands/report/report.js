const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'report',
    aliases: [],
    description: "Report an issue or bug regarding the bot.",
    async execute(bot, message, args) {
        const supportUrl = process.env.SUPPORT_INVITE || "https://discord.gg/";

        const embed = new EmbedBuilder()
            .setTitle("<:report:1502014120344682556> Report an Issue")
            .setDescription(
                "Found a bug or have a problem using **EchoFluxTest**?\n\n" +
                "Click the button below to fill out a report form. Our development team will review it as soon as possible.\n\n" +
                "If you need immediate assistance, please join our support server."
            )
            .setColor(0x00d2ff)
            .setFooter({ text: "EchoFluxTest Support | © By Gacky & Matrix Studio" });

        const supportBtn = new ButtonBuilder()
            .setLabel("Support Server")
            .setURL(supportUrl)
            .setStyle(ButtonStyle.Link)
            .setEmoji("<:support:1502013570328563843>");

        const reportBtn = new ButtonBuilder()
            .setCustomId('report_btn')
            .setLabel("Submit Report")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("<:report:1502014120344682556>");

        const row = new ActionRowBuilder().addComponents(supportBtn, reportBtn);

        await message.reply({ embeds: [embed], components: [row] });
    }
};
