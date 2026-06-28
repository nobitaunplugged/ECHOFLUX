const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { isGuildPremium, loadPremiumConfig } = require('../../utils/premium');

module.exports = {
    name: 'premium',
    description: "Shows EchoFluxTest premium features and the server's premium status.",
    async execute(bot, message, args) {
        const supportLink = process.env.SUPPORT_INVITE || "https://discord.gg/";
        const websiteLink = process.env.WEBSITE || "https://google.com";
        const botId = process.env.BOT_ID || bot.user.id;
        const voteLink = `https://top.gg/bot/${botId}/vote`;

        const embed = new EmbedBuilder()
            .setTitle("<:premium:1502013376207912960> EchoFluxTest Premium")
            .setDescription("Upgrade your server's experience with EchoFluxTest Premium! Enjoy exclusive features designed to give you the ultimate control and audio quality.")
            .setColor(0x00d2ff);

        embed.addFields(
            {
                name: "<:profile:1502014060802084994> Custom Bot Profile",
                value: "Change the bot's Name, Avatar, Banner, and Bio to match your server's aesthetic. (Use `.custombot`)",
                inline: false
            },
            {
                name: "<:support:1502013570328563843> Priority Support",
                value: "Get faster responses and dedicated help from our development team.",
                inline: false
            },
            {
                name: "<a:stolen_emoji:1518017525844017236> More Features Coming Soon",
                value: "We are constantly working on new premium-exclusive filters and commands!",
                inline: false
            }
        );

        const guild = message.guild;
        let statusText = "Cannot determine premium status in DMs.";

        if (guild) {
            const isPremium = isGuildPremium(guild.id);
            if (isPremium) {
                const data = loadPremiumConfig();
                const expiresAt = data[guild.id];
                if (expiresAt === "Permanent") {
                    statusText = "<:tick:1488582269298807024> **Active (Lifetime)**";
                } else {
                    statusText = `<:tick:1488582269298807024> **Active** (Expires: <t:${Math.floor(parseFloat(expiresAt))}:R>)`;
                }
            } else {
                statusText = "<:cross:1488582282020126881> **Inactive**";
            }
        }

        embed.addFields({
            name: "Server Premium Status",
            value: statusText,
            inline: false
        });

        if (guild && guild.iconURL()) {
            embed.setThumbnail(guild.iconURL());
        }

        embed.setFooter({ text: "EchoFluxTest Premium | © By Gacky & Matrix Studio" });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel("Get Premium")
                .setURL(supportLink)
                .setStyle(ButtonStyle.Link)
                .setEmoji("<:premium:1502013376207912960>"),
            new ButtonBuilder()
                .setLabel("Website")
                .setURL(websiteLink)
                .setStyle(ButtonStyle.Link)
                .setEmoji("🌐"),
            new ButtonBuilder()
                .setLabel("Vote Me")
                .setURL(voteLink)
                .setStyle(ButtonStyle.Link)
                .setEmoji("🗳️")
        );

        await message.reply({ embeds: [embed], components: [row] });
    }
};
