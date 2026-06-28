const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder } = require("discord.js");
const dbBridge = require("../../utils/dbBridge");

module.exports = {
    name: "unlink-spotify",
    aliases: ["spotify-unlink", "disconnect-spotify"],
    description: "Unlink your Spotify profile from the bot",
    async execute(bot, message, args) {
        try {
            const spotifyProfile = dbBridge.getSpotifyProfile(message.author.id);
            
            if (!spotifyProfile) {
                return message.reply({
                    components: [this._createNotLinkedContainer(bot)],
                    flags: MessageFlags.IsComponentsV2,
                });
            }

            const messageInstance = await message.reply({
                components: [this._createConfirmContainer(bot, spotifyProfile)],
                flags: MessageFlags.IsComponentsV2,
            });

            this._setupCollector(bot, messageInstance, message.author.id, spotifyProfile);
        } catch (error) {
            console.error("[SPOTIFY] Error in unlink prefix command:", error.message);
            await message.reply({
                components: [this._createErrorContainer(bot, "An error occurred while processing your request.")],
                flags: MessageFlags.IsComponentsV2,
            }).catch(() => {});
        }
    },

    _createNotLinkedContainer(bot) {
        const container = new ContainerBuilder();
        const infoEmoji = bot.getEmoji("info", "ℹ️");
        const crossEmoji = bot.getEmoji("cross", "❌");
        const addEmoji = bot.getEmoji("add", "➕");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${infoEmoji} **Spotify Profile**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const content = `**No Spotify Profile Linked**\n\n` +
            `**${crossEmoji} Status:** Not Connected\n\n` +
            `You don't have a Spotify profile linked to your account.\n\n` +
            `**${addEmoji} To link your profile:**\n` +
            `├─ Use \`link-spotify <profile_url>\`\n` +
            `├─ Get your profile URL from Spotify\n` +
            `└─ Access your public playlists through the bot\n\n` +
            `*Link your profile to access playlists and enhanced features*`;

        const thumbnailUrl = bot.user.displayAvatarURL();

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

        container.addSectionComponents(section);

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        return container;
    },

    _createConfirmContainer(bot, spotifyProfile) {
        const container = new ContainerBuilder();
        const resetEmoji = bot.getEmoji("reset", "🔄");
        const folderEmoji = bot.getEmoji("folder", "📁");
        const infoEmoji = bot.getEmoji("info", "ℹ️");
        const crossEmoji = bot.getEmoji("cross", "❌");
        const checkEmoji = bot.getEmoji("check", "✅");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${resetEmoji} **Unlink Spotify Profile**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const linkedDate = spotifyProfile.linkedAt 
            ? new Date(spotifyProfile.linkedAt).toLocaleDateString() 
            : 'Unknown';

        const content = `**Confirm Spotify Profile Removal**\n\n` +
            `**${folderEmoji} Current Profile:** ${spotifyProfile.displayName || 'Unknown'}\n` +
            `**${infoEmoji} Linked Since:** ${linkedDate}\n\n` +
            `**${crossEmoji} What will be removed:**\n` +
            `├─ Access to your public playlists\n` +
            `├─ Spotify profile connection\n` +
            `└─ Enhanced Spotify features\n\n` +
            `**${checkEmoji} What will be kept:**\n` +
            `├─ Your music listening history\n` +
            `├─ Bot preferences and settings\n` +
            `└─ All other bot data\n\n` +
            `*Are you sure you want to unlink your Spotify profile?*`;

        const thumbnailUrl = bot.user.displayAvatarURL();

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

        container.addSectionComponents(section);

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('unlink_confirm')
                .setLabel('Yes, Unlink')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(crossEmoji),
            new ButtonBuilder()
                .setCustomId('unlink_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(resetEmoji)
        );

        container.addActionRowComponents(buttonRow);

        return container;
    },

    _createSuccessContainer(bot) {
        const container = new ContainerBuilder();
        const checkEmoji = bot.getEmoji("check", "✅");
        const infoEmoji = bot.getEmoji("info", "ℹ️");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${checkEmoji} **Profile Unlinked**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const content = `**Spotify profile successfully unlinked**\n\n` +
            `**${checkEmoji} Status:** Disconnected\n\n` +
            `Your Spotify profile has been removed from your account.\n\n` +
            `**${infoEmoji} Details:**\n` +
            `├─ You can continue using all core playback controls\n` +
            `├─ Historical play logs and user preferences remain intact\n` +
            `└─ Re-connect at your convenience using \`link-spotify\`\n\n` +
            `*Thanks for using EchoFluxTest!*`;

        const thumbnailUrl = bot.user.displayAvatarURL();

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

        container.addSectionComponents(section);

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        return container;
    },

    _createCancelledContainer(bot) {
        const container = new ContainerBuilder();
        const infoEmoji = bot.getEmoji("info", "ℹ️");
        const checkEmoji = bot.getEmoji("check", "✅");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${infoEmoji} **Operation Cancelled**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const content = `**Spotify profile unlink cancelled**\n\n` +
            `**${checkEmoji} Status:** Still Connected\n\n` +
            `Your Spotify profile remains linked to your account.\n\n` +
            `*No changes have been made to your profile*`;

        const thumbnailUrl = bot.user.displayAvatarURL();

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

        container.addSectionComponents(section);

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        return container;
    },

    _createErrorContainer(bot, messageText) {
        const container = new ContainerBuilder();
        const crossEmoji = bot.getEmoji("cross", "❌");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${crossEmoji} **Error**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const thumbnailUrl = bot.user.displayAvatarURL();

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(messageText))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

        container.addSectionComponents(section);

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        return container;
    },

    _createExpiredContainer(bot) {
        const container = new ContainerBuilder();
        const infoEmoji = bot.getEmoji("info", "ℹ️");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${infoEmoji} **Unlink Spotify**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const content = `**This interaction has expired**\n\n` +
            `Run the command again to unlink your Spotify profile\n\n` +
            `*Commands: \`unlink-spotify\`, \`spotify-unlink\`, \`disconnect-spotify\`*`;

        const thumbnailUrl = bot.user.displayAvatarURL();

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

        container.addSectionComponents(section);

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        return container;
    },

    _setupCollector(bot, message, userId, spotifyProfile) {
        const collector = message.createMessageComponentCollector({
            filter: (i) => i.user.id === userId,
            time: 300000
        });

        collector.on('collect', async (interaction) => {
            try {
                if (interaction.customId === 'unlink_confirm') {
                    // Remove from database (PostgreSQL)
                    await dbBridge.removeSpotifyLink(userId);

                    await interaction.update({
                        components: [this._createSuccessContainer(bot)],
                        flags: MessageFlags.IsComponentsV2,
                    });
                } else if (interaction.customId === 'unlink_cancel') {
                    await interaction.update({
                        components: [this._createCancelledContainer(bot)],
                        flags: MessageFlags.IsComponentsV2,
                    });
                }
            } catch (error) {
                console.error("[SPOTIFY] Error in unlink collector:", error.message);
                await interaction.update({
                    components: [this._createErrorContainer(bot, "An error occurred while processing your request.")],
                    flags: MessageFlags.IsComponentsV2,
                }).catch(() => {});
            }
        });

        collector.on('end', async () => {
            try {
                const fetchedMessage = await message.fetch().catch(() => null);
                if (fetchedMessage && fetchedMessage.components && fetchedMessage.components.length > 0) {
                    await fetchedMessage.edit({
                        components: [this._createExpiredContainer(bot)]
                    });
                }
            } catch (error) {
                // Ignore silent logs
            }
        });
    }
};
