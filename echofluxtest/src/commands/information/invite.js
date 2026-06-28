const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'invite',
    aliases: ['inv'],
    description: "Get the bot's invite link",
    async execute(bot, message, args) {
        const botId = process.env.BOT_ID || bot.user.id;
        const supportInvite = process.env.SUPPORT_INVITE;
        const voteLink = `https://top.gg/bot/${botId}/vote`;
        const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot`;

        const embed = new EmbedBuilder()
            .setTitle("Invite me to your server!")
            .setDescription("Click the button below to add me to your Discord server.")
            .setColor(0x00d2ff)
            .addFields(
                {
                    name: "Need help?",
                    value: "If you have any questions, feel free to ask in our support server.",
                    inline: false
                },
                {
                    name: "Permissions",
                    value: "I request minimal permissions to function properly.",
                    inline: false
                }
            )
            .setFooter({ text: "Thanks for choosing us!" });

        if (bot.user.displayAvatarURL()) {
            embed.setThumbnail(bot.user.displayAvatarURL());
        }

        const row = new ActionRowBuilder();

        if (botId) {
            row.addComponents(
                new ButtonBuilder()
                    .setLabel("Invite me!")
                    .setURL(inviteUrl)
                    .setStyle(ButtonStyle.Link)
                    .setEmoji(bot.getEmoji("mail", "📨"))
            );
        }

        if (supportInvite) {
            row.addComponents(
                new ButtonBuilder()
                    .setLabel("Support Server")
                    .setURL(supportInvite)
                    .setStyle(ButtonStyle.Link)
                    .setEmoji(bot.getEmoji("setup", "<:setup:1502014141957672980>"))
            );
        }

        if (botId) {
            row.addComponents(
                new ButtonBuilder()
                    .setLabel("Vote Me")
                    .setURL(voteLink)
                    .setStyle(ButtonStyle.Link)
                    .setEmoji(bot.getEmoji("vote", "🗳️"))
            );
        }

        await message.reply({ embeds: [embed], components: row.components.length > 0 ? [row] : [] });
    }
};
