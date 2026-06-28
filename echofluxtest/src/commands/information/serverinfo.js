const { EmbedBuilder, ChannelType } = require('discord.js');
const { getEmbedColor } = require('../../utils/embedHelpers');

const verificationLevels = {
    0: "None",
    1: "Low",
    2: "Medium",
    3: "High",
    4: "Very High"
};

const boosterLevels = {
    0: "Level 0",
    1: "Level: 1",
    2: "Level: 2",
    3: "Level: 3"
};

module.exports = {
    name: 'serverinfo',
    aliases: ['si'],
    description: 'Get Information About The Server',
    async execute(bot, message, args) {
        const guild = message.guild;
        if (!guild) {
            return message.reply("<:cross:1488582282020126881> | This command can only be used in a server.");
        }

        const disabledEmoji = "<:cross:1488582282020126881>";
        const enabledEmoji = "<:tick:1488582269298807024>";

        try {
            // 1. Gather Role Data
            const roles = [...guild.roles.cache.values()]
                .filter(r => r.id !== guild.id)
                .sort((a, b) => b.position - a.position)
                .map(r => r.toString());

            let rolesDisplay = "None";
            if (roles.length < 15) {
                rolesDisplay = roles.length > 0 ? roles.join(' ') : "None";
            } else {
                rolesDisplay = "`Too many roles to show..`";
            }

            if (rolesDisplay.length > 1024) {
                rolesDisplay = roles.slice(0, 5).join(' ') + " `more..`";
            }

            // 2. Gather Emoji Data
            const emojis = [...guild.emojis.cache.values()];
            const animatedEmojis = emojis.filter(e => e.animated);
            const regularEmojis = emojis.filter(e => !e.animated);

            // 3. Fetch Bans
            let banCount = 0;
            try {
                const bans = await guild.bans.fetch();
                banCount = bans.size;
            } catch (e) {
                banCount = 0;
            }

            // 4. Gather Channel Data
            const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
            const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
            const totalChannels = guild.channels.cache.size;

            // 5. Build Embed
            const embed = new EmbedBuilder()
                .setTitle(`${guild.name}'s Information`)
                .setColor(getEmbedColor())
                .setTimestamp();

            if (guild.iconURL()) {
                embed.setThumbnail(guild.iconURL());
            }

            if (guild.bannerURL()) {
                embed.setImage(guild.bannerURL());
            }

            const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);

            // --- About Field ---
            embed.addFields({
                name: "__About__",
                value: `**Name**: ${guild.name}\n` +
                       `**ID**: ${guild.id}\n` +
                       `**Owner <a:9455yellowcrown:1285994040805822587>:** <@${guild.ownerId}> (${guild.ownerId})\n` +
                       `**Created at:** <t:${createdTimestamp}:R>\n` +
                       `**Members:** ${guild.memberCount}\n` +
                       `**Banned Members:** ${banCount}`,
                inline: false
            });

            // --- Server Information Field ---
            const afkChannel = guild.afkChannelId ? `<#${guild.afkChannelId}>` : disabledEmoji;
            const systemChannel = guild.systemChannelId ? `<#${guild.systemChannelId}>` : disabledEmoji;
            const progressBar = guild.premiumProgressBarEnabled ? enabledEmoji : disabledEmoji;
            const verification = verificationLevels[guild.verificationLevel] || "Unknown";

            embed.addFields({
                name: "__Server Information__",
                value: `**Verification Level:** ${verification}\n` +
                       `**Inactive Channel:** ${afkChannel}\n` +
                       `**Inactive Timeout:** ${Math.floor(guild.afkTimeout / 60)} mins\n` +
                       `**System Messages Channel:** ${systemChannel}\n` +
                       `**Boost Bar Enabled:** ${progressBar}`,
                inline: false
            });

            // --- Channels Field ---
            embed.addFields({
                name: "__Channels__",
                value: `**Total:** ${totalChannels}\n` +
                       `**Channels:** <:1056604817050566746:1501636440008691742> ${textChannels} | ` +
                       `<:role_vca:1488582148415029330> ${voiceChannels}`,
                inline: false
            });

            // --- Emoji Info Field ---
            embed.addFields({
                name: "__Emoji Info__",
                value: `**Regular:** ${regularEmojis.length}\n` +
                       `**Animated:** ${animatedEmojis.length}\n` +
                       `**Total:** ${emojis.length}`,
                inline: false
            });

            // --- Boost Status Field ---
            const boostTier = boosterLevels[guild.premiumTier] || "Level 0";
            const boostCount = guild.premiumSubscriptionCount || 0;
            embed.addFields({
                name: "__Boost Status__",
                value: `${boostTier} [<:894567382310354995:1501637026318127244> ${boostCount} Boosts]`,
                inline: false
            });

            // --- Server Roles Field ---
            embed.addFields({
                name: `__Server Roles__ [${roles.length}]`,
                value: rolesDisplay,
                inline: false
            });

            await message.reply({ embeds: [embed] });

        } catch (e) {
            console.error("Serverinfo command error:", e);
            const crossEmoji = bot.getEmoji("cross", "<:cross:1488582282020126881>");
            const errorEmbed = new EmbedBuilder()
                .setDescription(`${crossEmoji} | An error occurred while processing the command. Please try again later.`)
                .setColor(0xFF0000);
            await message.reply({ embeds: [errorEmbed] });
        }
    }
};
