const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { EMOJI_ARROW } = require('../utils/constants');

module.exports = {
    name: 'mention',
    async execute(bot, message) {
        if (message.author.bot || !message.guild) return;

        const prefix = bot.getPrefix(message.guild.id);

        const embed = new EmbedBuilder()
            .setTitle(`**${message.guild.name}**`)
            .setColor(0x00d2ff)
            .setDescription(
                `Thanks for mentioning EchoFluxTest !!\n\n` +
                ` ${EMOJI_ARROW} Hey <@${message.author.id}>,\n` +
                ` ${EMOJI_ARROW} My prefix for this server is \`${prefix}\`\n` +
                ` ${EMOJI_ARROW} Server ID: ${message.guild.id}\n` +
                ` ${EMOJI_ARROW} Type \`${prefix}help\` to see my commands!`
            )
            .setThumbnail(bot.user.displayAvatarURL())
            .setFooter({
                text: "EchoFluxTest | © Powered By Gacky & Matrix Studio",
                iconURL: bot.user.displayAvatarURL()
            });

        const supportUrl = process.env.SUPPORT_INVITE || "";
        const botId = process.env.BOT_ID || bot.user.id;
        const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot%20applications.commands`;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Support Server")
                .setURL(supportUrl)
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel("Invite Me")
                .setURL(inviteUrl)
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel("Vote Me")
                .setURL("https://top.gg/bot/1345368395289202729/vote")
                .setStyle(ButtonStyle.Link)
        );

        await message.channel.send({ embeds: [embed], components: [row] }).catch(() => { });
    }
};
