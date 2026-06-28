const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, TextDisplayBuilder, ThumbnailBuilder } = require("discord.js");
const dbBridge = require("../../utils/dbBridge");
const { fetchUserPlaylists, fetchPlaylistTracks } = require("../../utils/SpotifyManager");
const { registerPlayerEvents, playNext } = require("../../events/playerLifecycle");

const PLAYLISTS_PER_PAGE = 5;
const TRACKS_PER_PAGE = 5;

module.exports = {
    name: "spotify-playlists",
    aliases: ["sp-pl", "sppl", "playlists"],
    description: "View and play your linked Spotify playlists with advanced navigation",
    async execute(bot, message, args) {
        return this._handlePlaylists(bot, message);
    },

    async _handlePlaylists(bot, context) {
        try {
            const userId = context.user?.id || context.author?.id;
            const guild = context.guild;

            const spotifyProfile = dbBridge.getSpotifyProfile(userId);
            if (!spotifyProfile) {
                return this._reply(context, this._createNotLinkedContainer(bot));
            }

            const loadingMessage = await this._reply(
                context,
                this._createLoadingContainer(bot),
            );

            const playlists = await fetchUserPlaylists(spotifyProfile.profileUrl);

            if (!playlists || playlists.length === 0) {
                return this._editReply(
                    loadingMessage,
                    this._createNoPlaylistsContainer(bot),
                );
            }

            const messageInstance = await this._editReply(
                loadingMessage,
                this._createPlaylistsContainer(bot, playlists, 1),
            );

            if (messageInstance) {
                this._setupPlaylistsCollector(bot, messageInstance, userId, playlists, guild);
            }
        } catch (error) {
            console.error("[SPOTIFY] Error in _handlePlaylists:", error);
            const errorContainer = this._createErrorContainer(bot, "An error occurred while fetching your playlists. Please try again.");

            if (context.replied || context.deferred) {
                await context.editReply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            } else {
                await this._reply(context, errorContainer).catch(() => {});
            }
        }
    },

    _createNotLinkedContainer(bot) {
        const container = new ContainerBuilder();
        const infoEmoji = bot.getEmoji("info", "ℹ️");
        const crossEmoji = bot.getEmoji("cross", "❌");
        const addEmoji = bot.getEmoji("add", "➕");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${infoEmoji} **Spotify Playlists**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const content = `**No Spotify Profile Linked**\n\n` +
            `**${crossEmoji} Status:** Not Connected\n\n` +
            `You need to link your Spotify profile to access your playlists.\n\n` +
            `**${addEmoji} To get started:**\n` +
            `├─ Use \`link-spotify <profile_url>\`\n` +
            `├─ Get your profile URL from Spotify\n` +
            `├─ Make your playlists public\n` +
            `└─ Access all your playlists here\n\n` +
            `*Link your profile to view and play your playlists*`;

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

    _createLoadingContainer(bot) {
        const container = new ContainerBuilder();
        const loadingEmoji = bot.getEmoji("loading", "<a:loading1:1488582519304618236>");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${loadingEmoji} **Loading Playlists**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const content = `**Fetching Your Spotify Playlists**\n\n` +
            `**${loadingEmoji} Status:** Connecting to Spotify\n\n` +
            `Please wait while we fetch your public playlists from Spotify.\n\n` +
            `*This may take a few seconds...*`;

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

    _createNoPlaylistsContainer(bot) {
        const container = new ContainerBuilder();
        const crossEmoji = bot.getEmoji("cross", "❌");
        const infoEmoji = bot.getEmoji("info", "ℹ️");
        const resetEmoji = bot.getEmoji("reset", "🔄");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${crossEmoji} **No Playlists Found**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const content = `**No Public Playlists Available**\n\n` +
            `**${crossEmoji} Status:** No playlists found\n\n` +
            `No public playlists were found in your Spotify profile.\n\n` +
            `**${infoEmoji} To fix this:**\n` +
            `├─ Open Spotify and go to your playlists\n` +
            `├─ Right-click each playlist you want to use\n` +
            `├─ Select "Make public"\n` +
            `└─ Run this command again\n\n` +
            `**${resetEmoji} Note:**\n` +
            `├─ Only public playlists can be accessed\n` +
            `├─ Private playlists won't appear here\n` +
            `└─ You can change playlist visibility anytime\n\n` +
            `*Make your playlists public to see them here*`;

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

    _createPlaylistsContainer(bot, playlists, page) {
        const container = new ContainerBuilder();
        const totalPages = Math.ceil(playlists.length / PLAYLISTS_PER_PAGE);
        const startIdx = (page - 1) * PLAYLISTS_PER_PAGE;
        const endIdx = startIdx + PLAYLISTS_PER_PAGE;
        const pagePlaylist = playlists.slice(startIdx, endIdx);

        const folderEmoji = bot.getEmoji("folder", "📁");
        const musicEmoji = bot.getEmoji("music", "🎵");
        const infoEmoji = bot.getEmoji("info", "ℹ️");
        const checkEmoji = bot.getEmoji("check", "✅");
        const leftEmoji = bot.getEmoji("left", "⬅️");
        const rightEmoji = bot.getEmoji("right", "➡️");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${folderEmoji} **Your Spotify Playlists**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        let playlistContent = `**Available Playlists**\n\n`;

        pagePlaylist.forEach((playlist, index) => {
            const globalIndex = startIdx + index + 1;
            playlistContent += `**${musicEmoji} ${globalIndex}.** ${playlist.name}\n`;
            playlistContent += `├─ **${infoEmoji} Tracks:** ${playlist.trackCount}\n`;
            playlistContent += `└─ **${checkEmoji} Owner:** ${playlist.owner || 'Unknown'}\n\n`;
        });

        playlistContent += `**${infoEmoji} Page Information:**\n` +
            `├─ **Current:** Page ${page} of ${totalPages}\n` +
            `├─ **Total Playlists:** ${playlists.length}\n` +
            `└─ **Showing:** ${pagePlaylist.length} playlists\n\n` +
            `*Select a playlist below to view tracks*`;

        const thumbnailUrl = pagePlaylist[0]?.coverUrl || bot.user.displayAvatarURL();

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(playlistContent))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

        container.addSectionComponents(section);

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId("playlist_select")
            .setPlaceholder("Choose a playlist to view tracks")
            .setMaxValues(1);

        pagePlaylist.forEach((playlist) => {
            selectMenu.addOptions({
                label: playlist.name.length > 100 ? playlist.name.slice(0, 97) + "..." : playlist.name,
                description: `${playlist.trackCount} tracks by ${playlist.owner || 'Unknown'}`,
                value: playlist.id,
                emoji: musicEmoji.match(/:(\d+)>/)?.[1] ? { id: musicEmoji.match(/:(\d+)>/)[1] } : undefined,
            });
        });

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);
        container.addActionRowComponents(actionRow);

        if (totalPages > 1) {
            const buttonRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("playlists_prev")
                    .setLabel("Previous")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(leftEmoji)
                    .setDisabled(page <= 1),
                new ButtonBuilder()
                    .setCustomId("playlists_next")
                    .setLabel("Next")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji(rightEmoji)
                    .setDisabled(page >= totalPages),
            );

            container.addActionRowComponents(buttonRow);
        }

        return container;
    },

    _createPlaylistTracksContainer(bot, playlist, tracks, page, totalPages) {
        const container = new ContainerBuilder();
        const startIdx = (page - 1) * TRACKS_PER_PAGE;
        const endIdx = startIdx + TRACKS_PER_PAGE;
        const pageTracks = tracks.slice(startIdx, endIdx);

        const folderEmoji = bot.getEmoji("folder", "📁");
        const musicEmoji = bot.getEmoji("music", "🎵");
        const infoEmoji = bot.getEmoji("info", "ℹ️");
        const checkEmoji = bot.getEmoji("check", "✅");
        const leftEmoji = bot.getEmoji("left", "⬅️");
        const rightEmoji = bot.getEmoji("right", "➡️");
        const resetEmoji = bot.getEmoji("reset", "🔄");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${folderEmoji} **${playlist.name}**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        let tracksContent = `**Playlist Tracks**\n\n`;

        pageTracks.forEach((track, index) => {
            const globalIndex = startIdx + index + 1;
            const duration = track.duration ? this._formatDuration(track.duration) : 'Unknown';
            tracksContent += `**${musicEmoji} ${globalIndex}.** ${track.name}\n`;
            tracksContent += `├─ **${checkEmoji} Artist:** ${track.artists || track.artist || 'Unknown'}\n`;
            tracksContent += `├─ **${folderEmoji} Album:** ${track.album || 'Unknown'}\n`;
            tracksContent += `└─ **${infoEmoji} Duration:** ${duration}\n\n`;
        });

        tracksContent += `**${infoEmoji} Playlist Information:**\n` +
            `├─ **Owner:** ${playlist.owner || 'Unknown'}\n` +
            `├─ **Total Tracks:** ${tracks.length}\n` +
            `├─ **Current Page:** ${page} of ${totalPages}\n` +
            `└─ **Showing:** ${pageTracks.length} tracks\n\n` +
            `*Use the buttons below to navigate or play the playlist*`;

        const thumbnailUrl = playlist.coverUrl || bot.user.displayAvatarURL();

        const section = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(tracksContent))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl));

        container.addSectionComponents(section);

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const buttonRow1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("tracks_prev")
                .setLabel("Previous")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(leftEmoji)
                .setDisabled(page <= 1),
            new ButtonBuilder()
                .setCustomId("tracks_next")
                .setLabel("Next")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(rightEmoji)
                .setDisabled(page >= totalPages),
            new ButtonBuilder()
                .setCustomId("play_playlist")
                .setLabel("Play Playlist")
                .setStyle(ButtonStyle.Success)
                .setEmoji(musicEmoji),
        );

        const buttonRow2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("back_to_playlists")
                .setLabel("Back to Playlists")
                .setStyle(ButtonStyle.Primary)
                .setEmoji(resetEmoji),
        );

        container.addActionRowComponents(buttonRow1, buttonRow2);

        return container;
    },

    _createProcessingContainer(bot, playlistName, processedCount, totalCount) {
        const container = new ContainerBuilder();
        const loadingEmoji = bot.getEmoji("loading", "<a:loading1:1488582519304618236>");
        const folderEmoji = bot.getEmoji("folder", "📁");
        const infoEmoji = bot.getEmoji("info", "ℹ️");
        const checkEmoji = bot.getEmoji("check", "✅");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${loadingEmoji} **Processing Playlist**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const progress = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

        const content = `**Adding Songs to Queue**\n\n` +
            `**${folderEmoji} Playlist:** ${playlistName}\n` +
            `**${loadingEmoji} Progress:** ${processedCount}/${totalCount} tracks (${progress}%)\n` +
            `**${infoEmoji} Status:** Searching and adding tracks\n\n` +
            `**${checkEmoji} Process:**\n` +
            `├─ Searching each track on music sources\n` +
            `├─ Adding found tracks to queue\n` +
            `├─ Checking queue limits\n` +
            `└─ Applying premium/free tier restrictions\n\n` +
            `*Please wait while we process your playlist...*`;

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

    _createSuccessContainer(bot, playlist, addedCount, totalCount, failedCount, premiumStatus, limitWarning, wasPlaying) {
        const container = new ContainerBuilder();

        const checkEmoji = bot.getEmoji("check", "✅");
        const musicEmoji = bot.getEmoji("music", "🎵");
        const addEmoji = bot.getEmoji("add", "➕");
        const folderEmoji = bot.getEmoji("folder", "📁");
        const infoEmoji = bot.getEmoji("info", "ℹ️");
        const crossEmoji = bot.getEmoji("cross", "❌");

        const title = wasPlaying ? "Playlist Playing" : "Playlist Queued";
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${checkEmoji} **${title}**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        let statusText = wasPlaying ? "Started playing" : "Added to queue";

        const content = `**Playlist Successfully Processed**\n\n` +
            `**${folderEmoji} Playlist:** ${playlist.name}\n` +
            `**${checkEmoji} Added:** ${addedCount} tracks\n` +
            `**${infoEmoji} Total:** ${totalCount} tracks\n` +
            `**${crossEmoji} Failed:** ${failedCount} tracks\n` +
            `**${musicEmoji} Status:** ${statusText}\n\n` +
            `**${addEmoji} Queue Information:**\n` +
            `├─ **Type:** ${premiumStatus.hasPremium ? 'Premium' : 'Free'}\n` +
            `├─ **Limit:** ${premiumStatus.maxSongs} songs maximum\n` +
            `└─ **Status:** ${premiumStatus.hasPremium ? 'Premium active' : 'Free tier'}\n\n` +
            `${limitWarning ? `**${infoEmoji} Notice:** ${limitWarning}\n\n` : ''}` +
            `${failedCount > 0 ? `*${failedCount} tracks could not be found on music sources*` : '*All tracks processed successfully*'}`;

        const thumbnailUrl = playlist.coverUrl || bot.user.displayAvatarURL();

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
        const resetEmoji = bot.getEmoji("reset", "🔄");

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${infoEmoji} **Interaction Expired**`)
        );

        container.addSeparatorComponents(
            new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
        );

        const content = `**This interaction has expired**\n\n` +
            `**${resetEmoji} Status:** Session timed out\n\n` +
            `Run the command again to view your Spotify playlists.\n\n` +
            `**${infoEmoji} Available Commands:**\n` +
            `├─ \`spotify-playlists\`\n` +
            `├─ \`sp-pl\`\n` +
            `└─ \`sppl\`\n\n` +
            `*Commands expire after 5 minutes of inactivity*`;

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

    _getPremiumStatus(bot, guildId, userId) {
        const { isGuildPremium } = require("../../utils/premium");
        const hasPremium = isGuildPremium(guildId);
        return {
            hasPremium,
            type: hasPremium ? "premium" : "free",
            maxSongs: hasPremium ? 1000 : 100,
        };
    },

    _checkQueueLimit(bot, currentQueueSize, tracksToAdd, guildId, userId) {
        const premiumStatus = this._getPremiumStatus(bot, guildId, userId);
        const availableSlots = premiumStatus.maxSongs - currentQueueSize;

        if (availableSlots <= 0) {
            const limitMessage = premiumStatus.hasPremium
                ? `Premium queue is full (${premiumStatus.maxSongs} songs maximum)`
                : `Free tier queue is full (${premiumStatus.maxSongs} songs maximum). Upgrade to premium for 1000 songs`;

            return {
                allowed: false,
                message: limitMessage,
                currentSize: currentQueueSize,
                maxSize: premiumStatus.maxSongs,
                premiumStatus,
            };
        }

        const canAddAll = tracksToAdd <= availableSlots;
        const tracksToAddActual = canAddAll ? tracksToAdd : availableSlots;

        let limitWarning = null;
        if (!canAddAll) {
            limitWarning = premiumStatus.hasPremium
                ? `Only ${tracksToAddActual} of ${tracksToAdd} tracks added (premium queue limit reached)`
                : `Only ${tracksToAddActual} of ${tracksToAdd} tracks added. Upgrade to premium for 1000 song limit`;
        }

        return {
            allowed: true,
            canAddAll,
            tracksToAdd: tracksToAddActual,
            availableSlots,
            premiumStatus,
            limitWarning,
        };
    },

    _setupPlaylistsCollector(bot, message, userId, playlists, guild) {
        const filter = (i) => i.user.id === userId;
        const collector = message.createMessageComponentCollector({
            filter,
            time: 300000,
        });

        let currentPage = 1;
        let currentPlaylist = null;
        let currentTracks = null;
        let currentTracksPage = 1;

        collector.on("collect", async (interaction) => {
            try {
                await interaction.deferUpdate();

                switch (interaction.customId) {
                    case "playlists_prev":
                        if (currentPage > 1) {
                            currentPage--;
                            await interaction.editReply({
                                components: [this._createPlaylistsContainer(bot, playlists, currentPage)],
                                flags: MessageFlags.IsComponentsV2,
                            });
                        }
                        break;

                    case "playlists_next": {
                        const totalPlaylistPages = Math.ceil(playlists.length / PLAYLISTS_PER_PAGE);
                        if (currentPage < totalPlaylistPages) {
                            currentPage++;
                            await interaction.editReply({
                                components: [this._createPlaylistsContainer(bot, playlists, currentPage)],
                                flags: MessageFlags.IsComponentsV2,
                            });
                        }
                        break;
                    }

                    case "playlist_select": {
                        const playlistId = interaction.values[0];
                        currentPlaylist = playlists.find((p) => p.id === playlistId);

                        if (!currentPlaylist) {
                            const crossEmoji = bot.getEmoji("cross", "❌");
                            await interaction.followUp({
                                content: `${crossEmoji} Playlist not found.`,
                                ephemeral: true,
                            });
                            return;
                        }

                        try {
                            currentTracks = await fetchPlaylistTracks(playlistId);
                            if (!currentTracks || currentTracks.length === 0) {
                                await interaction.editReply({
                                    components: [this._createErrorContainer(bot,
                                        `**No Playable Tracks Found**\n\nThe playlist "${currentPlaylist.name}" has no playable tracks or all tracks are local files.`
                                    )],
                                    flags: MessageFlags.IsComponentsV2,
                                });
                                return;
                            }

                            currentTracksPage = 1;
                            const totalTracksPages = Math.ceil(currentTracks.length / TRACKS_PER_PAGE);

                            await interaction.editReply({
                                components: [this._createPlaylistTracksContainer(
                                    bot,
                                    currentPlaylist,
                                    currentTracks,
                                    currentTracksPage,
                                    totalTracksPages,
                                )],
                                flags: MessageFlags.IsComponentsV2,
                            });
                        } catch (error) {
                            console.error("[SPOTIFY] Error fetching playlist tracks:", error);
                            await interaction.editReply({
                                components: [this._createErrorContainer(bot,
                                    "**Error Loading Tracks**\n\nFailed to fetch playlist tracks. The playlist may be private or temporarily unavailable."
                                )],
                                flags: MessageFlags.IsComponentsV2,
                            });
                        }
                        break;
                    }

                    case "tracks_prev":
                        if (currentTracksPage > 1) {
                            currentTracksPage--;
                            const totalTracksPages = Math.ceil(currentTracks.length / TRACKS_PER_PAGE);
                            await interaction.editReply({
                                components: [this._createPlaylistTracksContainer(
                                    bot,
                                    currentPlaylist,
                                    currentTracks,
                                    currentTracksPage,
                                    totalTracksPages,
                                )],
                                flags: MessageFlags.IsComponentsV2,
                            });
                        }
                        break;

                    case "tracks_next": {
                        const totalTracksPages = Math.ceil(currentTracks.length / TRACKS_PER_PAGE);
                        if (currentTracksPage < totalTracksPages) {
                            currentTracksPage++;
                            await interaction.editReply({
                                components: [this._createPlaylistTracksContainer(
                                    bot,
                                    currentPlaylist,
                                    currentTracks,
                                    currentTracksPage,
                                    totalTracksPages,
                                )],
                                flags: MessageFlags.IsComponentsV2,
                            });
                        }
                        break;
                    }

                    case "back_to_playlists":
                        await interaction.editReply({
                            components: [this._createPlaylistsContainer(bot, playlists, currentPage)],
                            flags: MessageFlags.IsComponentsV2,
                        });
                        break;

                    case "play_playlist":
                        await this._handlePlayPlaylist(
                            interaction,
                            bot,
                            guild,
                            currentPlaylist,
                            currentTracks,
                            userId,
                        );
                        break;
                }
            } catch (error) {
                console.error("[SPOTIFY] Error in collector:", error);
                try {
                    const crossEmoji = bot.getEmoji("cross", "❌");
                    await interaction.followUp({
                        content: `${crossEmoji} An error occurred while processing your request. Please try again.`,
                        ephemeral: true,
                    });
                } catch (followUpError) {
                    console.error("[SPOTIFY] Error sending followup:", followUpError);
                }
            }
        });

        collector.on("end", async () => {
            try {
                const expiredContainer = this._createExpiredContainer(bot);
                await message.edit({
                    components: [expiredContainer],
                    flags: MessageFlags.IsComponentsV2,
                });
            } catch (error) {
                if (error.code !== 10008) {
                    console.error("[SPOTIFY] Error updating expired message:", error);
                }
            }
        });
    },

    async _handlePlayPlaylist(interaction, bot, guild, playlist, tracks, userId) {
        try {
            const voiceChannel = interaction.member?.voice?.channel;
            const crossEmoji = bot.getEmoji("cross", "❌");

            if (!voiceChannel) {
                await interaction.editReply({
                    components: [this._createErrorContainer(bot,
                        `**Voice Channel Required**\n\n${crossEmoji} You need to join a voice channel to play music.\n\nJoin a voice channel and try again.`
                    )],
                    flags: MessageFlags.IsComponentsV2,
                });
                return;
            }

            const permissions = voiceChannel.permissionsFor(guild.members.me);
            if (!permissions.has(["Connect", "Speak"])) {
                await interaction.editReply({
                    components: [this._createErrorContainer(bot,
                        `**Missing Permissions**\n\n${crossEmoji} I need permission to join and speak in your voice channel.\n\nPlease grant the necessary permissions and try again.`
                    )],
                    flags: MessageFlags.IsComponentsV2,
                });
                return;
            }

            let player = bot.lavalink.players.get(guild.id);
            const wasEmpty = !player || (player.queue.length === 0 && !player.current);

            const currentQueueSize = wasEmpty ? 0 : (player?.queue.length || 0);
            const queueCheck = this._checkQueueLimit(bot, currentQueueSize, tracks.length, guild.id, userId);

            if (!queueCheck.allowed) {
                await interaction.editReply({
                    components: [this._createErrorContainer(bot,
                        `**Queue Limit Reached**\n\n${crossEmoji} ${queueCheck.message}\n\nClear some songs from the queue or upgrade your plan.`
                    )],
                    flags: MessageFlags.IsComponentsV2,
                });
                return;
            }

            if (!player) {
                player = await bot.lavalink.joinVoiceChannel({
                    guildId: guild.id,
                    channelId: voiceChannel.id,
                    shardId: guild.shardId,
                    deaf: true
                });
                registerPlayerEvents(bot, player);
            }

            player.store('channel', interaction.channel.id);
            player.textChannelId = interaction.channel.id;

            const tracksToProcess = queueCheck.canAddAll ? tracks : tracks.slice(0, queueCheck.tracksToAdd);
            let addedCount = 0;
            let failedCount = 0;
            let lastUpdateTime = Date.now();

            await interaction.editReply({
                components: [this._createProcessingContainer(bot, playlist.name, 0, tracksToProcess.length)],
                flags: MessageFlags.IsComponentsV2,
            });

            const node = bot.lavalink.nodes.get('matrix_node') || bot.lavalink.nodes.values().next().value;
            if (!node) {
                throw new Error("Lavalink node matrix_node not found or offline");
            }

            for (let i = 0; i < tracksToProcess.length; i++) {
                const track = tracksToProcess[i];

                try {
                    const searchQuery = `ytmsearch:${track.artists || track.artist} ${track.name}`;
                    const searchResult = await node.rest.resolve(searchQuery);

                    if (searchResult && searchResult.data && (searchResult.loadType === 'search' || searchResult.loadType === 'track')) {
                        const foundTrack = searchResult.loadType === 'search' ? searchResult.data[0] : searchResult.data;
                        foundTrack.requester = userId;
                        player.queue.push(foundTrack);
                        addedCount++;
                    } else {
                        failedCount++;
                    }
                } catch (error) {
                    console.error("[SPOTIFY] Error adding track:", track.name, error.message);
                    failedCount++;
                }

                if (Date.now() - lastUpdateTime > 3000) {
                    try {
                        await interaction.editReply({
                            components: [this._createProcessingContainer(bot, playlist.name, i + 1, tracksToProcess.length)],
                            flags: MessageFlags.IsComponentsV2,
                        });
                        lastUpdateTime = Date.now();
                    } catch (updateError) {
                        console.warn("[SPOTIFY] Could not update progress:", updateError.message);
                    }
                }

                if (i < tracksToProcess.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }

            if (wasEmpty && addedCount > 0) {
                await playNext(bot, player).catch(err => {
                    console.error("[SPOTIFY] Error starting playback:", err);
                });
            }

            const premiumStatus = this._getPremiumStatus(bot, guild.id, userId);

            await interaction.editReply({
                components: [this._createSuccessContainer(
                    bot,
                    playlist,
                    addedCount,
                    tracks.length,
                    failedCount,
                    premiumStatus,
                    queueCheck.limitWarning,
                    wasEmpty && addedCount > 0
                )],
                flags: MessageFlags.IsComponentsV2,
            });

        } catch (error) {
            console.error("[SPOTIFY] Error playing playlist:", error);
            await interaction.editReply({
                components: [this._createErrorContainer(bot,
                    `**Error Processing Playlist**\n\n${crossEmoji} Failed to add playlist to queue. This could be due to:\n\n├─ Network connectivity issues\n├─ Music service unavailability\n├─ Invalid track data\n└─ Player connection problems\n\nPlease try again in a moment.`
                )],
                flags: MessageFlags.IsComponentsV2,
            });
        }
    },

    _formatDuration(ms) {
        if (!ms || ms < 0) return "Live";
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    },

    async _reply(context, container) {
        const payload = {
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        };

        try {
            if (context.replied || context.deferred) {
                return context.editReply({ ...payload, fetchReply: true });
            } else if (typeof context.reply === "function") {
                return context.reply({ ...payload, fetchReply: true });
            } else {
                return context.channel.send(payload);
            }
        } catch (error) {
            console.error("[SPOTIFY] Error in _reply:", error);
            return null;
        }
    },

    async _editReply(message, container) {
        try {
            if (!message) return null;
            return message.edit({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (error) {
            console.error("[SPOTIFY] Error in _editReply:", error);
            return null;
        }
    }
};
