const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { loadPremiumConfig, savePremiumConfig } = require('../../utils/premium');

async function getOrCreateInvite(guild) {
    if (!guild) return null;
    try {
        const invites = await guild.invites.fetch().catch(() => null);
        if (invites) {
            const permInvite = invites.find(inv => inv.maxAge === 0 && !inv.temporary);
            if (permInvite) return permInvite.url;
        }

        const channel = guild.rulesChannel ||
            guild.publicUpdatesChannel ||
            guild.channels.cache.find(c => c.type === 0);
        if (channel) {
            const invite = await channel.createInvite({ maxAge: 0, maxUses: 0 }).catch(() => null);
            if (invite) return invite.url;
        }
    } catch (e) { }
    return null;
}

module.exports = {
    name: 'prem',
    description: "Manage Premium access for servers.",
    async execute(bot, message, args) {
        const isOwner = await bot.isOwner(message.author);
        if (!isOwner) return;

        const prefix = bot.getPrefix(message.guild?.id);
        const sub = args[0]?.toLowerCase();

        if (sub === 'add') {
            const serverId = args[1];
            if (!serverId) {
                return message.reply(`<:cross:1488582282020126881> Missing server ID! Usage: \`${prefix}prem add <server_id>\``);
            }

            let guild = null;
            try {
                guild = bot.guilds.cache.get(serverId) || await bot.guilds.fetch(serverId).catch(() => null);
            } catch (e) { }

            const guildName = guild ? guild.name : "Unknown Server";
            const description = `Select the premium duration for **${guildName}** (\`${serverId}\`) from the dropdown below.`;

            const embed = new EmbedBuilder()
                .setTitle("<:premium:1502013376207912960> Grant Premium Access")
                .setDescription(description)
                .setColor(0x00d2ff);

            if (guild && guild.icon) {
                embed.setThumbnail(guild.iconURL());
            }

            const select = new StringSelectMenuBuilder()
                .setCustomId('premium_duration')
                .setPlaceholder('Select Premium duration...')
                .addOptions([
                    { label: "1 Month", description: "Monthly access", value: "2592000" },
                    { label: "3 Months", description: "3 Month Access", value: "7776000" },
                    { label: "6 Months", description: "6 Month Access", value: "15552000" },
                    { label: "1 Year", description: "Yearly access", value: "31536000" },
                    { label: "Permanent", description: "Never expires", value: "Permanent" }
                ]);

            const row = new ActionRowBuilder().addComponents(select);
            const msg = await message.reply({ embeds: [embed], components: [row] });

            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 60000
            });

            collector.on('collect', async interaction => {
                if (interaction.user.id !== message.author.id) {
                    return interaction.reply({ content: "<:cross:1488582282020126881> You are not allowed to interact with this menu.", ephemeral: true });
                }

                const value = interaction.values[0];
                const data = loadPremiumConfig();

                let expires;
                let textDuration;
                if (value === "Permanent") {
                    expires = "Permanent";
                    textDuration = "Permanently";
                } else {
                    const durationSecs = parseInt(value);
                    expires = Math.floor(Date.now() / 1000) + durationSecs;
                    const labelMap = {
                        "2592000": "1 Month",
                        "7776000": "3 Months",
                        "15552000": "6 Months",
                        "31536000": "1 Year"
                    };
                    const labelUsed = labelMap[value] || "selected duration";
                    textDuration = `for ${labelUsed}`;
                }

                try {
                    data[String(serverId)] = expires;
                    await savePremiumConfig(data);
                } catch (dbErr) {
                    console.error("[PREM ERROR] Failed to save premium server:", dbErr);
                    const errorEmbed = new EmbedBuilder()
                        .setDescription(`<:cross:1488582282020126881> Failed to write premium data to database: \`${dbErr.message}\`\n\nMake sure the database file has write permissions on the host server.`)
                        .setColor(0xff0000);
                    return interaction.update({
                        embeds: [errorEmbed],
                        components: []
                    }).catch(() => {});
                }

                const successEmbed = new EmbedBuilder()
                    .setDescription(`<:tick:1488582269298807024> Server **${serverId}** has been given Premium access **${textDuration}**!`)
                    .setColor(0x00d2ff);

                await interaction.update({
                    embeds: [successEmbed],
                    components: []
                });

                // --- Notify Owner & Send Webhook ---
                try {
                    const inviteUrl = await getOrCreateInvite(guild);
                    const logComponents = [];
                    if (inviteUrl) {
                        const linkBtn = new ButtonBuilder()
                            .setLabel("Join Server")
                            .setStyle(ButtonStyle.Link)
                            .setURL(inviteUrl);
                        logComponents.push(new ActionRowBuilder().addComponents(linkBtn));
                    }

                    const { sendWebhookLog } = require('../../utils/webhooks');
                    const logEmbed = new EmbedBuilder()
                        .setTitle("Premium Activated")
                        .setDescription(`Premium access has been granted to a server.`)
                        .addFields([
                            { name: "Server Name", value: guildName, inline: true },
                            { name: "Server ID", value: String(serverId), inline: true },
                            { name: "Server Owner", value: guild ? `<@${guild.ownerId}>` : "Unknown", inline: true },
                            { name: "Owner ID", value: guild ? String(guild.ownerId) : "Unknown", inline: true },
                            { name: "Duration", value: value === "Permanent" ? "Permanent" : textDuration.replace("for ", ""), inline: true },
                            { name: "Granted By", value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
                            { name: "User ID", value: message.author.id, inline: true },
                            { name: "Expiration", value: value === "Permanent" ? "Never" : `<t:${expires}:F>`, inline: true }
                        ])
                        .setColor(0x00d2ff)
                        .setTimestamp();

                    // Send webhook
                    await sendWebhookLog("Premium_Add", logEmbed, logComponents);

                    // Send DM to target user
                    const targetUser = await bot.users.fetch("1291126175971938421").catch(() => null);
                    if (targetUser) {
                        await targetUser.send({ embeds: [logEmbed], components: logComponents }).catch(() => { });
                    }
                } catch (e) { }

                collector.stop();
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    await msg.edit({ content: "⏰ **Premium duration selection timed out.**", embeds: [], components: [] }).catch(() => { });
                }
            });
            return;
        }

        if (sub === 'remove' || sub === 'rem') {
            const serverId = args[1];
            if (!serverId) {
                return message.reply(`<:cross:1488582282020126881> Missing server ID! Usage: \`${prefix}prem remove <server_id>\``);
            }

            const data = loadPremiumConfig();
            if (!(String(serverId) in data)) {
                const embed = new EmbedBuilder()
                    .setDescription(`<:cross:1488582282020126881> Server \`${serverId}\` does not currently have Premium access.`)
                    .setColor(0xff0000);
                return message.reply({ embeds: [embed] });
            }

            let guild = null;
            try {
                guild = bot.guilds.cache.get(serverId) || await bot.guilds.fetch(serverId).catch(() => null);
            } catch (e) { }

            const guildName = guild ? guild.name : "Unknown Server";

            const embed = new EmbedBuilder()
                .setTitle("<:premium:1502013376207912960> Revoke Premium Access")
                .setDescription(`Are you sure you want to revoke Premium access from **${guildName}** (\`${serverId}\`)?\n\nThis will immediately disable all premium features for this server.`)
                .setColor(0xff0000);

            if (guild) {
                if (guild.icon) embed.setThumbnail(guild.iconURL());
                if (guild.banner) embed.setImage(guild.bannerURL());
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_revoke')
                    .setLabel("Confirm Revoke")
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji("<:report:1502014120344682556>"),
                new ButtonBuilder()
                    .setCustomId('cancel_revoke')
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Secondary)
            );

            const msg = await message.reply({ embeds: [embed], components: [row] });

            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60000
            });

            collector.on('collect', async interaction => {
                if (interaction.user.id !== message.author.id) {
                    return interaction.reply({ content: "<:cross:1488582282020126881> You are not authorized to use this.", ephemeral: true });
                }

                if (interaction.customId === 'confirm_revoke') {
                    const freshData = loadPremiumConfig();
                    if (String(serverId) in freshData) {
                        delete freshData[String(serverId)];
                        try {
                            await savePremiumConfig(freshData);
                        } catch (dbErr) {
                            console.error("[PREM ERROR] Failed to revoke premium server:", dbErr);
                            const errorEmbed = new EmbedBuilder()
                                .setDescription(`<:cross:1488582282020126881> Failed to delete premium data from database: \`${dbErr.message}\`\n\nMake sure the database file has write permissions on the host server.`)
                                .setColor(0xff0000);
                            return interaction.update({
                                embeds: [errorEmbed],
                                components: []
                            }).catch(() => {});
                        }
                        const okEmbed = new EmbedBuilder()
                            .setDescription(`<:tick:1488582269298807024> Successfully revoked Premium access from server \`${serverId}\`.`)
                            .setColor(0x00d2ff);
                        await interaction.update({ embeds: [okEmbed], components: [] });

                        // --- Notify Owner & Send Webhook ---
                        try {
                            const inviteUrl = await getOrCreateInvite(guild);
                            const logComponents = [];
                            if (inviteUrl) {
                                const linkBtn = new ButtonBuilder()
                                    .setLabel("Join Server")
                                    .setStyle(ButtonStyle.Link)
                                    .setURL(inviteUrl);
                                logComponents.push(new ActionRowBuilder().addComponents(linkBtn));
                            }

                            const { sendWebhookLog } = require('../../utils/webhooks');
                            const logEmbed = new EmbedBuilder()
                                .setTitle("Premium Revoked")
                                .setDescription(`Premium access has been revoked from a server.`)
                                .addFields([
                                    { name: "Server Name", value: guildName, inline: true },
                                    { name: "Server ID", value: String(serverId), inline: true },
                                    { name: "Server Owner", value: guild ? `<@${guild.ownerId}>` : "Unknown", inline: true },
                                    { name: "Owner ID", value: guild ? String(guild.ownerId) : "Unknown", inline: true },
                                    { name: "Revoked By", value: `${message.author.tag} (<@${message.author.id}>)`, inline: true },
                                    { name: "User ID", value: message.author.id, inline: true }
                                ])
                                .setColor(0xff0000)
                                .setTimestamp();

                            // Send webhook
                            await sendWebhookLog("Premium_Remove", logEmbed, logComponents);

                            // Send DM to target user
                            const targetUser = await bot.users.fetch("1291126175971938421").catch(() => null);
                            if (targetUser) {
                                await targetUser.send({ embeds: [logEmbed], components: logComponents }).catch(() => { });
                            }
                        } catch (e) { }
                    } else {
                        const errEmbed = new EmbedBuilder()
                            .setDescription(`<:cross:1488582282020126881> Server \`${serverId}\` does not currently have Premium access.`)
                            .setColor(0xff0000);
                        await interaction.update({ embeds: [errEmbed], components: [] });
                    }
                    collector.stop();
                } else if (interaction.customId === 'cancel_revoke') {
                    const cancelEmbed = new EmbedBuilder()
                        .setDescription("<:tick:1488582269298807024> Revoke action cancelled.")
                        .setColor(0x00d2ff);
                    await interaction.update({ embeds: [cancelEmbed], components: [] });
                    collector.stop();
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    await msg.edit({ content: "⏰ **Revoke confirmation timed out.**", embeds: [], components: [] }).catch(() => { });
                }
            });
            return;
        }

        return message.reply(`Usage: \`${prefix}prem add <server_id>\` or \`${prefix}prem remove <server_id>\`.`);
    }
};
