const { EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
    name: 'guildinfo',
    aliases: ['ginfo'],
    description: 'Get info of any server by ID. (Owner only)',
    async execute(bot, message, args) {
        const isOwner = await bot.isOwner(message.author);
        if (!isOwner) return;

        const guildId = args[0];
        if (!guildId) {
            return message.reply("<:cross:1488582282020126881> **Usage:** `.guildinfo <guild_id>`");
        }

        const guild = bot.guilds.cache.get(guildId);
        if (!guild) {
            return message.reply(`<:cross:1488582282020126881> I cannot find or I am not in a server with ID \`${guildId}\`.`);
        }

        try {
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

            const disabledEmoji = "<:cross:1488582282020126881>";
            const enabledEmoji = "<:tick:1488582269298807024>";

            // Gather Role Data
            const sortedRoles = [...guild.roles.cache.values()]
                .sort((a, b) => b.position - a.position)
                .filter(role => role.name !== '@everyone');
            
            const rolesMentions = sortedRoles.map(role => role.toString());
            let rolesDisplay = "None";
            if (rolesMentions.length > 0) {
                if (rolesMentions.length < 15) {
                    rolesDisplay = rolesMentions.join(" ");
                } else {
                    rolesDisplay = "`Too many roles to show..`";
                }
            }
            if (rolesDisplay.length > 1024) {
                rolesDisplay = rolesMentions.slice(0, 5).join(" ") + " `more..`";
            }

            // Gather Emoji Data
            const emojis = guild.emojis.cache;
            const animatedEmojis = emojis.filter(e => e.animated).size;
            const regularEmojis = emojis.filter(e => !e.animated).size;

            // Channels
            const totalChannels = guild.channels.cache.size;
            const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
            const voiceChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;

            const embedColor = bot.color || 0x00d2ff;
            const embed = new EmbedBuilder()
                .setTitle(`${guild.name}'s Information`)
                .setColor(embedColor)
                .setTimestamp(new Date());

            if (guild.icon) {
                embed.setThumbnail(guild.iconURL({ dynamic: true }));
            }
            if (guild.banner) {
                embed.setImage(guild.bannerURL({ dynamic: true }));
            }

            const createdTimestamp = Math.floor(guild.createdTimestamp / 1000);
            embed.addFields({
                name: "__About__",
                value: `**Name**: ${guild.name} \n` +
                      `**ID**: ${guild.id} \n` +
                      `**Owner <a:9455yellowcrown:1285994040805822587>:** <@${guild.ownerId}> (${guild.ownerId})\n` +
                      `**Created at:** <t:${createdTimestamp}:R>\n` +
                      `**Members:** ${guild.memberCount}\n` +
                      `**Banned Members:** Unknown`,
                inline: false
            });

            const afkChannel = guild.afkChannelId ? `<#${guild.afkChannelId}>` : disabledEmoji;
            const systemChannel = guild.systemChannelId ? `<#${guild.systemChannelId}>` : disabledEmoji;
            const progressBar = guild.premiumProgressBarEnabled ? enabledEmoji : disabledEmoji;
            const verification = verificationLevels[guild.verificationLevel] || "Unknown";

            embed.addFields({
                name: "__Server Information__",
                value: `**Verification Level:** ${verification}\n` +
                      `**Inactive Channel:** ${afkChannel}\n` +
                      `**Inactive Timeout:** ${guild.afkTimeout / 60} mins\n` +
                      `**System Messages Channel:** ${systemChannel}\n` +
                      `**Boost Bar Enabled:** ${progressBar}`,
                inline: false
            });

            embed.addFields({
                name: "__Channels__",
                value: `**Total:** ${totalChannels}\n` +
                      `**Channels:** <:1056604817050566746:1501636440008691742> ${textChannels} | ` +
                      `<:role_vca:1488582148415029330> ${voiceChannels}`,
                inline: false
            });

            embed.addFields({
                name: "__Emoji Info__",
                value: `**Regular:** ${regularEmojis}\n` +
                      `**Animated:** ${animatedEmojis}\n` +
                      `**Total:** ${emojis.size}`,
                inline: false
            });

            const boostTierVal = typeof guild.premiumTier === 'string' ? guild.premiumTier.replace('TIER_', '') : guild.premiumTier;
            const boostTier = boosterLevels[boostTierVal] || `Level ${boostTierVal || 0}`;
            const boostCount = guild.premiumSubscriptionCount || 0;
            
            embed.addFields({
                name: "__Boost Status__",
                value: `${boostTier} [<:894567382310354995:1501637026318127244> ${boostCount} Boosts]`,
                inline: false
            });

            embed.addFields({
                name: `__Server Roles__ [${sortedRoles.length}]`,
                value: rolesDisplay,
                inline: false
            });

            return message.reply({ embeds: [embed] });
        } catch (e) {
            return message.reply(`<:cross:1488582282020126881> | An error occurred: \`${e.message}\``);
        }
    }
};
