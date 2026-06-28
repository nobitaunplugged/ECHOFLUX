const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const {
    getUserPlaylists, getPlaylist, createPlaylist,
    deletePlaylist, addTrackToPlaylist, removeTrackFromPlaylist
} = require('./utils');

let interactionListenerRegistered = false;

function registerInteractionListener(bot) {
    if (interactionListenerRegistered) return;
    interactionListenerRegistered = true;

    bot.on('interactionCreate', async (interaction) => {
        const customId = interaction.customId;
        if (!customId || !customId.startsWith('playlist_')) return;

        const parts = customId.split(':');
        const action = parts[0];
        const targetUserId = parts[1];
        const playlistName = parts[2];

        if (interaction.user.id !== targetUserId) {
            return interaction.reply({ content: "<:cross:1488582282020126881> This menu is not for you!", ephemeral: true });
        }

        try {
            if (action === 'playlist_create') {
                const modal = new ModalBuilder()
                    .setCustomId(`playlist_modal_create:${targetUserId}`)
                    .setTitle("Create New Playlist");

                const nameInput = new TextInputBuilder()
                    .setCustomId('name')
                    .setLabel("Playlist Name")
                    .setPlaceholder("e.g. My Favorites")
                    .setStyle(TextInputStyle.Short)
                    .setMinLength(1)
                    .setMaxLength(50);

                modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
                return interaction.showModal(modal);
            }

            if (action === 'playlist_modal_create') {
                const playlistNameVal = interaction.fields.getTextInputValue('name').trim();
                if (createPlaylist(targetUserId, playlistNameVal)) {
                    await interaction.reply({ content: `<:tick:1488582269298807024>  Playlist **${playlistNameVal}** created!`, ephemeral: true });
                } else {
                    await interaction.reply({ content: `<:cross:1488582282020126881> A playlist named **${playlistNameVal}** already exists.`, ephemeral: true });
                }
                return;
            }

            if (action === 'playlist_refresh_dash') {
                const view = new DashboardView(bot, targetUserId);
                return interaction.update({ embeds: [view.generateEmbed()], components: view.getComponents() });
            }

            if (action === 'playlist_manage_select') {
                const selectedPlaylist = interaction.values[0];
                const view = new PlaylistDetailView(bot, targetUserId, selectedPlaylist);
                return interaction.update({ embeds: [view.generateEmbed()], components: view.getComponents() });
            }

            if (action === 'playlist_delete_select') {
                const selectedPlaylist = interaction.values[0];
                const embed = new EmbedBuilder()
                    .setTitle("<:report:1502014120344682556> Delete Playlist?")
                    .setDescription(`Are you sure you want to delete the playlist **${selectedPlaylist}**?\n\n**This action cannot be undone!**`)
                    .setColor(0x00d2ff);
                const view = new DeletePlaylistConfirmView(bot, targetUserId, selectedPlaylist);
                return interaction.update({ embeds: [embed], components: view.getComponents() });
            }

            if (action === 'playlist_confirm_delete') {
                if (deletePlaylist(targetUserId, playlistName)) {
                    const view = new DashboardView(bot, targetUserId);
                    return interaction.update({ content: `<:trash:1502013580634226718> Deleted playlist **${playlistName}**.`, embeds: [view.generateEmbed()], components: view.getComponents() });
                } else {
                    return interaction.reply({ content: `<:cross:1488582282020126881> Failed to delete **${playlistName}**.`, ephemeral: true });
                }
            }

            if (action === 'playlist_cancel_delete') {
                const view = new DashboardView(bot, targetUserId);
                return interaction.update({ content: "<:tick:1488582269298807024> **Cancelled.**", embeds: [view.generateEmbed()], components: view.getComponents() });
            }

            if (action === 'playlist_play') {
                await interaction.deferReply({ ephemeral: false });
                const voiceChannel = interaction.member.voice?.channel;
                if (!voiceChannel) {
                    return interaction.followup({ content: "<:cross:1488582282020126881> Join a Voice Channel first!", ephemeral: true });
                }

                const tracks = getPlaylist(targetUserId, playlistName);
                if (!tracks || tracks.length === 0) {
                    return interaction.followup({ content: "<:cross:1488582282020126881> Playlist is empty!", ephemeral: true });
                }

                let player = bot.lavalink.players.get(interaction.guildId);
                if (!player) {
                    player = await bot.lavalink.joinVoiceChannel({
                        guildId: interaction.guildId,
                        channelId: voiceChannel.id,
                        shardId: interaction.guild.shardId,
                        deaf: true
                    });
                    const { registerPlayerEvents } = require('../../events/playerLifecycle');
                    registerPlayerEvents(bot, player);
                } else if (String(player.connection.channelId) !== String(voiceChannel.id)) {
                    return interaction.followup({ content: "<:cross:1488582282020126881> I am in another voice channel!", ephemeral: true });
                }

                player.store('channel', interaction.channelId);
                player.textChannelId = interaction.channelId;

                try {
                    const { playNext } = require('../../events/playerLifecycle');
                    const node = bot.lavalink.nodes.get('default-node') || bot.lavalink.nodes.values().next().value;
                    let added = 0;
                    for (const t of tracks) {
                        const query = t.uri || t.identifier;
                        if (!query) continue;
                        const res = await node.rest.resolve(query);
                        if (res && res.data) {
                            const track = res.loadType === 'playlist' ? res.data.tracks[0] : (res.loadType === 'search' ? res.data[0] : res.data);
                            if (track) {
                                track.requester = interaction.user.id;
                                if (!player.queue) player.queue = [];
                                player.queue.push(track);
                                added++;
                            }
                        }
                    }

                    if (added === 0) {
                        return interaction.followup({ content: "<:cross:1488582282020126881> Failed to load any valid tracks. They might be private or unavailable.", ephemeral: true });
                    }

                    if (!player.current) {
                        await playNext(bot, player);
                    }

                    await interaction.followup({ content: `<:tick:1488582269298807024> Loaded **${added} tracks** from **${playlistName}** to the queue!`, ephemeral: false });
                } catch (e) {
                    await interaction.followup({ content: `<:cross:1488582282020126881> Oops, an error occurred while queuing your playlist: ${e.message}`, ephemeral: true });
                }
                return;
            }

            if (action === 'playlist_add_track') {
                const modal = new ModalBuilder()
                    .setCustomId(`playlist_modal_add:${targetUserId}:${playlistName}`)
                    .setTitle("Add Song to Playlist");

                const queryInput = new TextInputBuilder()
                    .setCustomId('query')
                    .setLabel("Song/Playlist URL or Search Query")
                    .setPlaceholder("e.g. Never gonna give you up...")
                    .setStyle(TextInputStyle.Paragraph)
                    .setMinLength(1);

                modal.addComponents(new ActionRowBuilder().addComponents(queryInput));
                return interaction.showModal(modal);
            }

            if (action === 'playlist_modal_add') {
                await interaction.deferReply({ ephemeral: true });
                let queryText = interaction.fields.getTextInputValue('query').trim().replace(/[<>]/g, '');
                if (!/https?:\/\/(?:www\.)?.+/.test(queryText)) {
                    queryText = `ytsearch:${queryText}`;
                }

                try {
                    const node = bot.lavalink.nodes.get('default-node') || bot.lavalink.nodes.values().next().value;
                    const results = await node.rest.resolve(queryText);

                    if (!results || !results.data || results.loadType === 'empty') {
                        return interaction.followup({ content: "<:cross:1488582282020126881> No results found.", ephemeral: true });
                    }

                    let added = 0;
                    let skipped = 0;

                    if (results.loadType === 'playlist') {
                        const tracks = results.data.tracks || [];
                        const playlistTitle = results.data.info.name;
                        for (const track of tracks) {
                            const info = track.info;
                            const duration = info.length || info.duration || 0;
                            if (!info.isStream && duration < 15000) {
                                skipped++;
                                continue;
                            }
                            if (addTrackToPlaylist(targetUserId, playlistName, {
                                title: info.title,
                                uri: info.uri,
                                author: info.author,
                                duration: duration,
                                identifier: info.identifier
                            })) {
                                added++;
                            }
                        }
                        let msg = `<:tick:1488582269298807024>  Added **${added} tracks** from **${playlistTitle}** to **${playlistName}**!`;
                        if (skipped > 0) {
                            msg += ` *(Skipped ${skipped} tracks under 15s)*`;
                        }
                        await interaction.followup({ content: msg, ephemeral: true });
                    } else {
                        const track = results.loadType === 'search' ? results.data[0] : results.data;
                        if (!track) {
                            return interaction.followup({ content: "<:cross:1488582282020126881> No results found.", ephemeral: true });
                        }
                        const info = track.info || track;
                        const duration = info.length || info.duration || 0;
                        if (!info.isStream && duration < 15000) {
                            const isOwner = await bot.isOwner(interaction.user);
                            if (!isOwner) {
                                const { ratelimitHandler, autoBlacklistUser, logRatelimitAttempt } = require('../../utils/ratelimit');
                                if (ratelimitHandler.checkShortSongRatelimit(interaction.user.id)) {
                                    autoBlacklistUser(interaction.user, "Auto-blacklisted: Triggered Track Duration Rate Limit");
                                    await logRatelimitAttempt({
                                        bot: bot,
                                        user: interaction.user,
                                        guild: interaction.guild,
                                        channel: interaction.channel,
                                        message: interaction.message,
                                        reason: "Short-Song Rate Limit Exceeded",
                                        detailAnalysis: `User ${interaction.user.username} tried to add more than ${ratelimitHandler.SONG_LIMIT || ratelimitHandler.SONG_LIMIT_COUNT} micro-songs (<15s) to playlists in ${ratelimitHandler.SONG_WINDOW / 1000} seconds.`
                                    });
                                    return interaction.followup({ content: "<:cross:1488582282020126881> You have been automatically blacklisted.", ephemeral: true });
                                }
                            }
                            return interaction.followup({ content: "<:cross:1488582282020126881> Track is too short (under 15s) and cannot be added.", ephemeral: true });
                        }

                        if (addTrackToPlaylist(targetUserId, playlistName, {
                            title: info.title,
                            uri: info.uri,
                            author: info.author,
                            duration: duration,
                            identifier: info.identifier
                        })) {
                            await interaction.followup({ content: `<:tick:1488582269298807024>  Added [**${info.title}**](${info.uri}) to **${playlistName}**!`, ephemeral: true });
                        } else {
                            await interaction.followup({ content: "<:cross:1488582282020126881> Failed to add track.", ephemeral: true });
                        }
                    }
                } catch (e) {
                    await interaction.followup({ content: `<:cross:1488582282020126881> Search error: ${e.message}`, ephemeral: true });
                }
                return;
            }

            if (action === 'playlist_remove_track') {
                const tracks = getPlaylist(targetUserId, playlistName);
                if (!tracks || tracks.length === 0) {
                    return interaction.reply({ content: "<:cross:1488582282020126881> Nothing to remove!", ephemeral: true });
                }

                const view = new RemoveTrackView(bot, targetUserId, playlistName);
                const embed = new EmbedBuilder()
                    .setTitle(`<:trash:1502013580634226718> Remove from ${playlistName}`)
                    .setDescription("Select a track below to throw it out:")
                    .setColor(0x00d2ff);
                return interaction.update({ embeds: [embed], components: view.getComponents() });
            }

            if (action === 'playlist_remove_select') {
                const idx = parseInt(interaction.values[0]);
                removeTrackFromPlaylist(targetUserId, playlistName, idx);
                const view = new PlaylistDetailView(bot, targetUserId, playlistName);
                return interaction.update({ embeds: [view.generateEmbed()], components: view.getComponents() });
            }

            if (action === 'playlist_remove_back') {
                const view = new PlaylistDetailView(bot, targetUserId, playlistName);
                return interaction.update({ embeds: [view.generateEmbed()], components: view.getComponents() });
            }

            if (action === 'playlist_refresh_detail') {
                const view = new PlaylistDetailView(bot, targetUserId, playlistName);
                return interaction.update({ embeds: [view.generateEmbed()], components: view.getComponents() });
            }

            if (action === 'playlist_back_hub') {
                const view = new DashboardView(bot, targetUserId);
                return interaction.update({ embeds: [view.generateEmbed()], components: view.getComponents() });
            }

        } catch (e) {
            console.error(e);
            return interaction.reply({ content: `<:cross:1488582282020126881> An error occurred: ${e.message}`, ephemeral: true }).catch(() => {});
        }
    });
}

class DashboardView {
    constructor(bot, userId) {
        this.bot = bot;
        this.userId = String(userId);
        registerInteractionListener(bot);
    }

    generateEmbed() {
        const playlists = getUserPlaylists(this.userId);
        const embed = new EmbedBuilder()
            .setTitle("<:playlists:1502013365847855325> Unified Playlist Hub")
            .setDescription("Manage all your custom playlists seamlessly from this dashboard.")
            .setColor(0x00d2ff);

        const playlistNames = Object.keys(playlists);
        if (playlistNames.length === 0) {
            embed.addFields({
                name: "Your Playlists",
                value: "You don't have any playlists yet.\nClick **Create Playlist** below to start!"
            });
        } else {
            let desc = "";
            for (const name of playlistNames) {
                desc += `• **${name}** (${playlists[name].length} songs)\n`;
            }
            embed.addFields({
                name: "Your Playlists",
                value: desc.slice(0, 1024)
            });
        }

        return embed;
    }

    getComponents() {
        const rows = [];
        const playlists = getUserPlaylists(this.userId);
        const playlistNames = Object.keys(playlists);

        if (playlistNames.length > 0) {
            const manageSelect = new StringSelectMenuBuilder()
                .setCustomId(`playlist_manage_select:${this.userId}`)
                .setPlaceholder("Manage a playlist...")
                .addOptions(
                    playlistNames.slice(0, 25).map(name => ({
                        label: name,
                        description: `${playlists[name].length} songs`,
                        value: name
                    }))
                );
            rows.push(new ActionRowBuilder().addComponents(manageSelect));

            const deleteSelect = new StringSelectMenuBuilder()
                .setCustomId(`playlist_delete_select:${this.userId}`)
                .setPlaceholder("Delete a playlist...")
                .addOptions(
                    playlistNames.slice(0, 25).map(name => ({
                        label: name,
                        description: `${playlists[name].length} songs`,
                        value: name
                    }))
                );
            rows.push(new ActionRowBuilder().addComponents(deleteSelect));
        }

        const createBtn = new ButtonBuilder()
            .setCustomId(`playlist_create:${this.userId}`)
            .setLabel("Create Playlist")
            .setStyle(ButtonStyle.Success)
            .setEmoji(this.bot.getEmoji("add", "<:add:1502013026583183480>"));

        const refreshBtn = new ButtonBuilder()
            .setCustomId(`playlist_refresh_dash:${this.userId}`)
            .setLabel("Refresh")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(this.bot.getEmoji("refresh", "<:loop:1502012311257481388>"));

        rows.push(new ActionRowBuilder().addComponents(createBtn, refreshBtn));

        return rows;
    }
}

class PlaylistDetailView {
    constructor(bot, userId, playlistName) {
        this.bot = bot;
        this.userId = String(userId);
        this.playlistName = playlistName;
        registerInteractionListener(bot);
    }

    generateEmbed() {
        const tracks = getPlaylist(this.userId, this.playlistName) || [];
        const embed = new EmbedBuilder()
            .setTitle(`<:Music:1488582297321214081> ${this.playlistName}`)
            .setColor(0x00d2ff);

        if (tracks.length === 0) {
            embed.setDescription("This playlist is empty. Add some tracks!");
        } else {
            let desc = "";
            tracks.slice(0, 15).forEach((t, i) => {
                desc += `\`${i + 1}.\` [${t.title}](${t.uri})\n`;
            });
            if (tracks.length > 15) {
                desc += `\n*...and ${tracks.length - 15} more tracks.*`;
            }
            embed.setDescription(desc);
        }

        embed.setFooter({ text: `Total Songs: ${tracks.length}` });
        return embed;
    }

    getComponents() {
        const playBtn = new ButtonBuilder()
            .setCustomId(`playlist_play:${this.userId}:${this.playlistName}`)
            .setLabel("Play All")
            .setStyle(ButtonStyle.Success)
            .setEmoji(this.bot.getEmoji("play", "▶️"));

        const addTrackBtn = new ButtonBuilder()
            .setCustomId(`playlist_add_track:${this.userId}:${this.playlistName}`)
            .setLabel("Add Track")
            .setStyle(ButtonStyle.Primary)
            .setEmoji(this.bot.getEmoji("add", "<:add:1502013026583183480>"));

        const removeTrackBtn = new ButtonBuilder()
            .setCustomId(`playlist_remove_track:${this.userId}:${this.playlistName}`)
            .setLabel("Remove Track")
            .setStyle(ButtonStyle.Danger)
            .setEmoji(this.bot.getEmoji("trash", "<:trash:1502013580634226718>"));

        const refreshBtn = new ButtonBuilder()
            .setCustomId(`playlist_refresh_detail:${this.userId}:${this.playlistName}`)
            .setLabel("Refresh")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(this.bot.getEmoji("refresh", "<:loop:1502012311257481388>"));

        const backBtn = new ButtonBuilder()
            .setCustomId(`playlist_back_hub:${this.userId}:${this.playlistName}`)
            .setLabel("Back to Hub")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(this.bot.getEmoji("back", "🔙"));

        return [new ActionRowBuilder().addComponents(playBtn, addTrackBtn, removeTrackBtn, refreshBtn, backBtn)];
    }
}

class RemoveTrackView {
    constructor(bot, userId, playlistName) {
        this.bot = bot;
        this.userId = String(userId);
        this.playlistName = playlistName;
        registerInteractionListener(bot);
    }

    getComponents() {
        const rows = [];
        const tracks = getPlaylist(this.userId, this.playlistName) || [];

        if (tracks.length > 0) {
            const options = tracks.slice(0, 25).map((t, i) => {
                const title = t.title.length > 90 ? t.title.slice(0, 90) + '...' : t.title;
                return {
                    label: `${i + 1}. ${title}`,
                    value: String(i)
                };
            });

            const select = new StringSelectMenuBuilder()
                .setCustomId(`playlist_remove_select:${this.userId}:${this.playlistName}`)
                .setPlaceholder("Select a song to drop...")
                .addOptions(options);

            rows.push(new ActionRowBuilder().addComponents(select));
        }

        const backBtn = new ButtonBuilder()
            .setCustomId(`playlist_remove_back:${this.userId}:${this.playlistName}`)
            .setLabel("Back")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(this.bot.getEmoji("back", "🔙"));

        rows.push(new ActionRowBuilder().addComponents(backBtn));

        return rows;
    }
}

class DeletePlaylistConfirmView {
    constructor(bot, userId, playlistName) {
        this.bot = bot;
        this.userId = String(userId);
        this.playlistName = playlistName;
        registerInteractionListener(bot);
    }

    getComponents() {
        const confirmBtn = new ButtonBuilder()
            .setCustomId(`playlist_confirm_delete:${this.userId}:${this.playlistName}`)
            .setLabel("Yes, Delete")
            .setStyle(ButtonStyle.Danger)
            .setEmoji(this.bot.getEmoji("trash", "<:trash:1502013580634226718>"));

        const cancelBtn = new ButtonBuilder()
            .setCustomId(`playlist_cancel_delete:${this.userId}:${this.playlistName}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(this.bot.getEmoji("cross", "<:cross:1488582282020126881>"));

        return [new ActionRowBuilder().addComponents(confirmBtn, cancelBtn)];
    }
}

module.exports = {
    name: 'playlist',
    aliases: ['pl', 'playlists'],
    description: 'Open the interactive Playlist Hub',
    async execute(bot, message, args) {
        const view = new DashboardView(bot, message.author ? message.author.id : message.user.id);
        const replyPayload = { embeds: [view.generateEmbed()], components: view.getComponents() };
        if (message.reply) {
            await message.reply(replyPayload);
        } else {
            await message.reply(replyPayload);
        }
    },
    DashboardView,
    PlaylistDetailView,
    RemoveTrackView,
    DeletePlaylistConfirmView
};
