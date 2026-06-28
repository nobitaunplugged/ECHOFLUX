const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } = require('discord.js');
const { getPlayerEmbed, getPlayerComponents } = require('../utils/playerEmbed');
const { fetchLyrics, LyricsPaginationView, _lavalink_get_lyrics } = require('../cogs/music/lyrics');
const dbBridge = require('../utils/dbBridge');

module.exports = {
    name: 'interactionCreate',
    async execute(bot, interaction) {
        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            const cmd = bot.commands.get(interaction.commandName);
            if (!cmd) return;

            // Globally block blacklisted/rate-limited users (adapted for interactions)
            if (bot.isBlacklisted(interaction.user.id)) {
                return interaction.reply({ content: "You are blacklisted from using this bot.", ephemeral: true });
            }

            // Check ignored channels
            if (interaction.guild && interaction.commandName !== 'ignore') {
                const dbBridge = require('../utils/dbBridge');
                const ignoredChannels = dbBridge.getIgnoredChannels(interaction.guildId);
                if (ignoredChannels.includes(interaction.channelId)) {
                    const embed = new EmbedBuilder()
                        .setDescription("bot cmds are ignored in this channels")
                        .setColor(0x00d2ff);
                    return interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
                }
            }

            // Adapt interaction to behave like message for compatibility with prefix commands
            Object.defineProperty(interaction, 'author', {
                get() { return this.user; },
                configurable: true
            });

            const args = [];
            const buildArgs = (options) => {
                for (const option of options) {
                    if (option.value !== undefined) {
                        if (typeof option.value === 'string') {
                            args.push(...option.value.split(/\s+/));
                        } else {
                            args.push(String(option.value));
                        }
                    }
                    if (option.options) {
                        buildArgs(option.options);
                    }
                }
            };
            buildArgs(interaction.options.data);

            Object.defineProperty(interaction, 'content', {
                get() { 
                    return `/${this.commandName} ${args.join(' ')}`;
                },
                configurable: true
            });

            const originalReply = interaction.reply.bind(interaction);
            interaction.reply = async function(options) {
                if (typeof options === 'string') {
                    options = { content: options };
                }
                if (interaction.replied || interaction.deferred) {
                    return await interaction.followUp(options);
                }
                options.fetchReply = true;
                return await originalReply(options);
            };

            try {
                await cmd.execute(bot, interaction, args);
            } catch (error) {
                console.error(`Error executing slash command ${interaction.commandName}:`, error);
                await interaction.reply({ content: `An error occurred: ${error.message}`, ephemeral: true }).catch(() => {});
            }
            return;
        }

        // Handle Report button click
        if (interaction.isButton() && interaction.customId === 'report_btn') {
            const modal = new ModalBuilder()
                .setCustomId('report_modal')
                .setTitle("Submit a Report");

            const commandInput = new TextInputBuilder()
                .setCustomId('command_name')
                .setLabel("Command Name")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Which command caused the issue? (or 'General')")
                .setRequired(true)
                .setMaxLength(50);

            const issueInput = new TextInputBuilder()
                .setCustomId('issue')
                .setLabel("Issue / Bug Description")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Briefly describe the issue...")
                .setRequired(true)
                .setMaxLength(100);

            const commentsInput = new TextInputBuilder()
                .setCustomId('comments')
                .setLabel("Additional Comments")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("Provide any steps to reproduce or additional context...")
                .setRequired(false)
                .setMaxLength(1000);

            modal.addComponents(
                new ActionRowBuilder().addComponents(commandInput),
                new ActionRowBuilder().addComponents(issueInput),
                new ActionRowBuilder().addComponents(commentsInput)
            );

            return interaction.showModal(modal);
        }

        // Handle Report Modal Submit
        if (interaction.isModalSubmit() && interaction.customId === 'report_modal') {
            await interaction.deferReply({ ephemeral: true });
            const commandName = interaction.fields.getTextInputValue('command_name');
            const issue = interaction.fields.getTextInputValue('issue');
            const comments = interaction.fields.getTextInputValue('comments');

            const { getWebhookUrl } = require('../utils/webhooks');
            const webhookUrl = getWebhookUrl("Report");

            if (!webhookUrl) {
                return interaction.followUp({ content: '<:cross:1488582282020126881> The report webhook is not configured by the owner.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle("New Bug Report")
                .setColor(0xff0000)
                .setTimestamp()
                .addFields(
                    { name: "Submitter", value: `${interaction.user.tag} (\`${interaction.user.id}\`)`, inline: false },
                    { name: "Server", value: interaction.guild ? `${interaction.guild.name} (\`${interaction.guild.id}\`)` : "DMs", inline: false },
                    { name: "Command", value: commandName, inline: false },
                    { name: "Issue", value: issue, inline: false }
                );

            if (comments) {
                embed.addFields({ name: "Comments", value: comments, inline: false });
            }

            embed.setThumbnail(interaction.user.displayAvatarURL({ forceStatic: false }));

            try {
                const { WebhookClient } = require('discord.js');
                const webhook = new WebhookClient({ url: webhookUrl });
                await webhook.send({ embeds: [embed] });
                return interaction.followUp({ content: '<:tick:1488582269298807024> Your report has been submitted successfully! Thank you.', ephemeral: true });
            } catch (e) {
                return interaction.followUp({ content: `<:cross:1488582282020126881> Failed to send report: ${e.message}`, ephemeral: true });
            }
        }

        // Handle buttons / select menus / modals for Player controls
        if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
            const customId = interaction.customId;
            if (!customId.startsWith('player_')) return;

            // Voice channel checks (must be in same voice channel as bot)
            if (interaction.isButton() || interaction.isStringSelectMenu()) {
                const voiceChannel = interaction.member.voice.channel;
                if (!voiceChannel) {
                    return interaction.reply({ content: "<:cross:1488582282020126881> You need to be in a voice channel to use these controls!", ephemeral: true });
                }
                const botVoiceChannelId = bot.lavalink.players.get(interaction.guildId)?.connection.channelId;
                if (botVoiceChannelId && voiceChannel.id !== String(botVoiceChannelId)) {
                    return interaction.reply({ content: "<:cross:1488582282020126881> You must be in the same voice channel as me to use this!", ephemeral: true });
                }
            }

            const player = bot.lavalink.players.get(interaction.guildId);
            if (!player) {
                return interaction.reply({ content: "<:cross:1488582282020126881> Active player not found.", ephemeral: true });
            }

            const updateEmbed = async () => {
                if (!player.current) {
                    try {
                        await interaction.message.delete();
                    } catch (e) {}
                    return;
                }
                const embed = getPlayerEmbed(player, bot);
                const components = getPlayerComponents(player, bot);
                await interaction.update({ embeds: [embed], components: components }).catch(() => {});
            };

            // Play / Pause toggle
            if (customId === 'player_play_pause') {
                await player.setPaused(!player.paused);
                // Update channel status
                const vcId = player.connection.channelId;
                if (vcId) {
                    try {
                        const status = player.paused ? `<:pause:1488582449100488876> Paused: ${player.current.info.title}` : `<:play:1488582462841028879> playing: ${player.current.info.title}`;
                        await bot.rest.put(`/channels/${vcId}/voice-status`, {
                            body: { status: status }
                        });
                    } catch (e) {}
                }
                return updateEmbed();
            }

            // Skip
            if (customId === 'player_skip') {
                player.store("manually_skipped", true);
                // Shoukaku: stop current track and Shoukaku's start event will trigger next track
                await player.stopTrack();
                return interaction.deferUpdate();
            }

            // Stop
            if (customId === 'player_stop') {
                await interaction.deferReply({ ephemeral: true });
                player.store("manually_stopped", true);
                if (player.queue) player.queue = [];
                await player.stopTrack();

                // Clear voice status
                const vcId = player.connection.channelId;
                if (vcId) {
                    try {
                        await bot.rest.put(`/channels/${vcId}/voice-status`, {
                            body: { status: "" }
                        });
                    } catch (e) {}
                }

                // Delete NP messages
                const oldMsgId = player.fetch("np_message_id");
                const channelId = player.fetch("channel");
                if (oldMsgId && channelId) {
                    try {
                        const channel = interaction.guild.channels.cache.get(channelId);
                        if (channel) {
                            const oldMsg = await channel.messages.fetch(oldMsgId);
                            await oldMsg.delete();
                        }
                    } catch (e) {}
                }

                const oldVcMsgId = player.fetch("np_vc_message_id");
                const vcChannelId = player.connection.channelId;
                if (oldVcMsgId && vcChannelId) {
                    try {
                        const vcChannel = interaction.guild.channels.cache.get(vcChannelId);
                        if (vcChannel) {
                            const oldVcMsg = await vcChannel.messages.fetch(oldVcMsgId);
                            await oldVcMsg.delete();
                        }
                    } catch (e) {}
                }

                player.store("np_message_id", null);
                player.store("np_vc_message_id", null);

                await bot.lavalink.leaveVoiceChannel(interaction.guildId);
                return interaction.followUp({ content: "<:stop:1502013562300665977> **Music stopped and queue cleared.**", ephemeral: true });
            }

            // Volume down
            if (customId === 'player_vol_down') {
                const vol = Math.max(0, (player.volume || 80) - 10);
                await player.setVolume(vol);
                return updateEmbed();
            }

            // Volume up
            if (customId === 'player_vol_up') {
                const vol = Math.min(100, (player.volume || 80) + 10);
                await player.setVolume(vol);
                return updateEmbed();
            }

            // Seeks
            if (customId.startsWith('player_seek_')) {
                if (!player.current) {
                    return interaction.reply({ content: "❌ There is no song currently playing to seek!", ephemeral: true });
                }
                const pos = player.position || 0;
                let newPos = pos;
                const trackLen = player.current.info?.length || player.current.info?.duration || 0;

                if (customId === 'player_seek_back_20') newPos = Math.max(0, pos - 20000);
                else if (customId === 'player_seek_back_10') newPos = Math.max(0, pos - 10000);
                else if (customId === 'player_seek_fwd_10') newPos = Math.min(trackLen, pos + 10000);
                else if (customId === 'player_seek_fwd_20') newPos = Math.min(trackLen, pos + 20000);

                await player.seekTo(newPos);
                return updateEmbed();
            }

            // Autoplay
            if (customId === 'player_autoplay') {
                const current = player.fetch("autoplay", false);
                player.store("autoplay", !current);
                return updateEmbed();
            }

            // Loop
            if (customId === 'player_loop') {
                const loop = player.loop ?? 0;
                player.loop = (loop + 1) % 3;
                return updateEmbed();
            }

            // Favourite
            if (customId === 'player_favourite') {
                const track = player.current;
                const info = track.info || track;
                const userIdStr = String(interaction.user.id);

                // Check if already a favourite via DB
                const userFavs = await dbBridge.getUserFavourites(userIdStr);
                const isFav = userFavs.some(t => t.uri === info.uri);

                if (isFav) {
                    // Remove from favourites
                    await dbBridge.removeFavourite(userIdStr, info.uri);
                    return interaction.reply({ content: `<:tick:1488582269298807024> Removed **${info.title}** from your favourites!`, ephemeral: true });
                } else {
                    // Add to favourites
                    await dbBridge.addFavourite(userIdStr, {
                        title: info.title,
                        uri: info.uri,
                        author: info.author,
                        duration: info.length || info.duration,
                        identifier: info.identifier
                    });
                    return interaction.reply({ content: `<:heart:1507353921641779252> Added **${info.title}** to your favourites!`, ephemeral: true });
                }
            }

            // Lyrics
            if (customId === 'player_lyrics') {
                await interaction.deferReply({ ephemeral: true });
                if (!player.current) {
                    return interaction.followUp({ content: '<:cross:1488582282020126881> Nothing is playing!', ephemeral: true });
                }
                const track = player.current;
                const info  = track.info || track;
                const { getYtThumbnail } = require('../utils/embedHelpers');
                const thumb = getYtThumbnail(track);

                try {
                    // Try Lavalink-native lyrics first, then LRCLIB fallback
                    let lyricsText = await _lavalink_get_lyrics(player, track);
                    if (!lyricsText) {
                        lyricsText = await fetchLyrics(info.author || '', info.title || '');
                    }

                    if (!lyricsText) {
                        return interaction.followUp({ content: `<:cross:1488582282020126881> Could not find lyrics for **${info.title}**. Try \`.lyrics <song name>\` for a manual search.`, ephemeral: true });
                    }

                    const iconUrl = interaction.guild?.iconURL() || null;
                    const view = new LyricsPaginationView(info.title, lyricsText, interaction.user.id, info.author, thumb, iconUrl);

                    const lyricsMsg = await interaction.followUp({
                        embeds: [view.generateEmbed()],
                        components: view.pages.length > 1 ? [view.getRow()] : [],
                        ephemeral: true
                    });

                    if (view.pages.length > 1) {
                        const lyricsColl = lyricsMsg.createMessageComponentCollector({
                            componentType: ComponentType.Button,
                            time: 180_000
                        });
                        lyricsColl.on('collect', async li => {
                            if (li.user.id !== interaction.user.id) {
                                return li.reply({ content: '<:cross:1488582282020126881> This is not for you!', ephemeral: true });
                            }
                            if (li.customId === 'lyrics_prev') {
                                view.currentPage = Math.max(0, view.currentPage - 1);
                                await li.update({ embeds: [view.generateEmbed()], components: [view.getRow()] });
                            } else if (li.customId === 'lyrics_next') {
                                view.currentPage = Math.min(view.pages.length - 1, view.currentPage + 1);
                                await li.update({ embeds: [view.generateEmbed()], components: [view.getRow()] });
                            } else if (li.customId === 'lyrics_close') {
                                lyricsColl.stop('closed');
                                await li.update({ components: [] }).catch(() => {});
                            }
                        });
                        lyricsColl.on('end', async (_, reason) => {
                            if (reason === 'closed') return;
                            await lyricsMsg.edit({ components: [] }).catch(() => {});
                        });
                    }
                } catch (e) {
                    await interaction.followUp({ content: `<:cross:1488582282020126881> Lyrics fetch failed: ${e.message}`, ephemeral: true });
                }
                return;
            }

            // Queue View
            if (customId === 'player_queue_view') {
                const embed = new EmbedBuilder().setColor(0x00d2ff);
                let desc = "";

                if (player.current) {
                    desc += `**Now Playing:**\n<:Music:1488582297321214081> [${player.current.info.title}](${player.current.info.uri})\n\n`;
                }

                if (player.queue && player.queue.length > 0) {
                    desc += "**Up Next:**\n";
                    player.queue.slice(0, 15).forEach((track, i) => {
                        const info = track.info || track;
                        const title = info.title.length > 55 ? info.title.slice(0, 55) + "..." : info.title;
                        desc += `\`${i + 1}.\` [${title}](${info.uri})\n`;
                    });
                    if (player.queue.length > 15) {
                        desc += `\n*...and ${player.queue.length - 15} more tracks.*`;
                    }
                } else {
                    desc += "**Up Next:**\nThe queue is empty!";
                }

                embed.setDescription(desc);
                embed.setFooter({ text: `${player.queue ? player.queue.length : 0} tracks in queue` });

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // Speed Select (timescale filter)
            if (customId === 'player_speed_select') {
                const speed = parseFloat(interaction.values[0]);
                player.store("speed", speed);

                // Set timescale filter
                // In Shoukaku, filters are set on the player
                await player.setFilters({
                    timescale: { speed: speed, pitch: 1.0, rate: 1.0 }
                });

                await interaction.reply({ content: `<:asd:1507356155637137562> Playback speed set to **${speed === 1.0 ? '1x (Normal)' : speed + 'x'}**`, ephemeral: true });
                return updateEmbed();
            }

            // Add next (modal)
            if (customId === 'player_add_next') {
                const modal = new ModalBuilder()
                    .setCustomId('player_add_next_modal')
                    .setTitle("Add Song to Queue");

                const queryInput = new TextInputBuilder()
                    .setCustomId('query')
                    .setLabel("Song/Playlist URL or Search Query")
                    .setPlaceholder("e.g. Never gonna give you up...")
                    .setStyle(TextInputStyle.Paragraph)
                    .setMinLength(1);

                const row = new ActionRowBuilder().addComponents(queryInput);
                modal.addComponents(row);

                return interaction.showModal(modal);
            }

            // Add next Modal submit
            if (customId === 'player_add_next_modal') {
                await interaction.deferReply({ ephemeral: true });
                let query = interaction.fields.getTextInputValue('query').trim();
                if (!query.startsWith('http')) {
                    query = `ytsearch:${query}`;
                }

                try {
                    const result = await player.node.rest.resolve(query);
                    if (!result || !result.data || result.loadType === 'empty') {
                        return interaction.followUp({ content: '<:cross:1488582282020126881> No results found.', ephemeral: true });
                    }

                    if (result.loadType === 'playlist') {
                        const tracks = result.data.tracks || [];
                        tracks.reverse().forEach(t => {
                            t.requester = interaction.user.id;
                            player.queue.unshift(t);
                        });
                        await interaction.followUp({ content: `<:tick:1488582269298807024> Added **${tracks.length}** tracks from playlist **${result.data.info.name}** to the front of the queue.`, ephemeral: true });
                    } else {
                        const track = result.loadType === 'search' ? result.data[0] : result.data;
                        track.requester = interaction.user.id;
                        player.queue.unshift(track);
                        await interaction.followUp({ content: `<:tick:1488582269298807024> Added [**${track.info.title}**](${track.info.uri}) to the front of the queue.`, ephemeral: true });
                    }
                } catch (e) {
                    await interaction.followUp({ content: `<:cross:1488582282020126881> Search error: ${e.message}`, ephemeral: true });
                }
                return;
            }

            // Remove track from queue dropdown
            if (customId === 'player_remove_track') {
                if (!player.queue || player.queue.length === 0) {
                    return interaction.reply({ content: "<:cross:1488582282020126881> The queue is empty! Nothing to remove.", ephemeral: true });
                }

                const options = player.queue.slice(0, 25).map((t, idx) => {
                    const info = t.info || t;
                    return {
                        label: `${idx + 1}. ${info.title.slice(0, 90)}`,
                        value: String(idx)
                    };
                });

                const select = new StringSelectMenuBuilder()
                    .setCustomId('player_remove_select')
                    .setPlaceholder("Select a track to remove...")
                    .addOptions(options);

                const row = new ActionRowBuilder().addComponents(select);
                return interaction.reply({ content: "Select a track to remove from the queue:", components: [row], ephemeral: true });
            }

            // Remove select dropdown submit
            if (customId === 'player_remove_select') {
                const idx = parseInt(interaction.values[0]);
                if (player.queue && player.queue[idx]) {
                    const removed = player.queue.splice(idx, 1)[0];
                    await interaction.update({ content: `<:tick:1488582269298807024> Removed **${removed.info.title}** from the queue.`, components: [] });
                } else {
                    await interaction.update({ content: "Failed to remove track from queue.", components: [] });
                }
                return;
            }

            // Playlist dashboard trigger
            if (customId === 'player_playlist') {
                // Invoke playlists UI dashboard
                const { DashboardView } = require('../cogs/playlists/playlist');
                const view = new DashboardView(bot, interaction.user.id);
                return interaction.reply({ embeds: [view.generateEmbed()], components: view.getComponents(), ephemeral: true });
            }
        }
    }
};
