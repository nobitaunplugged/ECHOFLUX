const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const dbBridge = require('../../utils/dbBridge');
const { formatTime, getYtThumbnail } = require('../../utils/embedHelpers');
const { registerPlayerEvents, playNext } = require('../../events/playerLifecycle');

const ITEMS_PER_PAGE = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Escape [ and ] in text so they don't break Discord markdown link syntax
function escMd(text) {
    return String(text).replace(/\[/g, '\\[').replace(/]/g, '\\]');
}

function buildListEmbed(favourites, page, prefix) {
    const maxPages = Math.max(1, Math.ceil(favourites.length / ITEMS_PER_PAGE));
    const start = page * ITEMS_PER_PAGE;
    const slice = favourites.slice(start, start + ITEMS_PER_PAGE);

    const embed = new EmbedBuilder()
        .setTitle('<:heart:1507353921641779252> Your Favourites')   // plain unicode — custom emojis don't render in embed titles
        .setColor(0x00d2ff);

    if (favourites.length === 0) {
        embed.setDescription(
            '**You don\'t have any favourites yet!**\n' +
            `Use the ♡ button on the player, or click **Add Track** below.`
        );
    } else {
        const lines = slice.map((t, i) => {
            const num = start + i + 1;
            const raw = (t.title || 'Unknown').slice(0, 60);
            const title = escMd(raw);            // escape [] so the link doesn't break
            const author = t.author || 'Unknown';
            const uri = t.uri || null;

            // If no URI, render as plain bold text instead of a broken link
            const trackStr = uri
                ? `[${title}](${uri})`
                : `**${title}**`;

            return `\`${num}.\` ${trackStr} — *${escMd(author)}*`;
        });
        embed.setDescription(lines.join('\n'));
    }

    embed.setFooter({
        text: `Page ${page + 1}/${maxPages} · ${favourites.length}/10 favourite${favourites.length !== 1 ? 's' : ''}`
    });

    return embed;
}


function buildListComponents(page, favourites) {
    const maxPages = Math.max(1, Math.ceil(favourites.length / ITEMS_PER_PAGE));
    
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fav_prev')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('fav_next')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= maxPages - 1),
        new ButtonBuilder()
            .setCustomId('fav_play_all')
            .setLabel('Play All')
            .setEmoji('<:play:1488582462841028879>')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(favourites.length === 0)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fav_add_track_btn')
            .setLabel('Add Track')
            .setEmoji('➕')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('fav_remove_track_btn')
            .setLabel('Remove Track')
            .setEmoji('➖')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(favourites.length === 0)
    );

    return [row1, row2];
}

async function showAddModal(interaction, userId, msg, page, prefix) {
    const modal = new ModalBuilder()
        .setCustomId('fav_add_modal')
        .setTitle('Add Song to Favourites');
        
    const trackInput = new TextInputBuilder()
        .setCustomId('fav_track_input')
        .setLabel('Song Name or Link')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter song name, YouTube URL, Spotify link, etc.')
        .setRequired(true);
        
    const row = new ActionRowBuilder().addComponents(trackInput);
    modal.addComponents(row);
    
    await interaction.showModal(modal);
    
    // Listen for modal submission
    try {
        const submission = await interaction.awaitModalSubmit({
            filter: i => i.customId === 'fav_add_modal' && i.user.id === interaction.user.id,
            time: 60_000
        });
        
        await submission.deferReply({ ephemeral: true });
        
        const query = submission.fields.getTextInputValue('fav_track_input').trim();
        if (!query) {
            return submission.followUp({ content: '<:cross:1488582282020126881> Song name/link cannot be empty!', ephemeral: true });
        }
        
        const currentFavs = await dbBridge.getUserFavourites(userId);
        if (currentFavs.length >= 10) {
            return submission.followUp({ content: '<:cross:1488582282020126881> **Limit Reached:** You can only save up to **10** tracks.', ephemeral: true });
        }
        
        const bot = interaction.client;
        const node = bot.lavalink.nodes.get('matrix_node') || [...bot.lavalink.nodes.values()][0];
        if (!node) {
            return submission.followUp({ content: '<:cross:1488582282020126881> Music node is currently offline!', ephemeral: true });
        }
        
        const result = await node.rest.resolve(query);
        if (!result || result.loadType === 'empty' || result.loadType === 'error') {
            return submission.followUp({ content: '<:cross:1488582282020126881> Could not find any songs matching your input.', ephemeral: true });
        }
        
        const track = result.loadType === 'search' ? result.data[0] : (result.loadType === 'playlist' ? result.data.tracks[0] : result.data);
        if (!track) {
            return submission.followUp({ content: '<:cross:1488582282020126881> Could not resolve track.', ephemeral: true });
        }
        
        const info = track.info || track;
        const trackData = {
            title: info.title,
            uri: info.uri,
            author: info.author,
            duration: info.length || info.duration,
            identifier: info.identifier
        };
        
        const added = await dbBridge.addFavourite(userId, trackData);
        const embed = new EmbedBuilder().setColor(0x00d2ff);
        if (added) {
            embed.setDescription(`♡ Added [**${escMd(info.title)}**](${info.uri}) to your favourites!`);
        } else {
            embed.setDescription(`<:cross:1488582282020126881> [**${escMd(info.title)}**](${info.uri}) is already in your favourites!`);
        }
        
        await submission.followUp({ embeds: [embed], ephemeral: true });
        
        const freshFavsList = await dbBridge.getUserFavourites(userId);
        await msg.edit({
            embeds: [buildListEmbed(freshFavsList, page, prefix)],
            components: buildListComponents(page, freshFavsList)
        }).catch(() => {});
    } catch (err) {
        // Timeout or other error
    }
}

// ─── Subcommand: list ─────────────────────────────────────────────────────────

async function handleList(bot, message) {
    const userId = String(message.author.id);
    const favourites = await dbBridge.getUserFavourites(userId);
    const prefix = dbBridge.getPrefix(message.guild?.id, '.');

    let page = 0;
    const embed = buildListEmbed(favourites, page, prefix);
    const components = buildListComponents(page, favourites);

    const msg = await message.reply({ embeds: [embed], components });

    const collector = msg.createMessageComponentCollector({
        time: 180_000
    });

    collector.on('collect', async interaction => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: '<:cross:1488582282020126881> This menu is not for you!', ephemeral: true });
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'fav_remove_select') {
                const idx = parseInt(interaction.values[0]);
                const freshFavs = await dbBridge.getUserFavourites(userId);
                const track = freshFavs[idx];
                if (track) {
                    await dbBridge.removeFavourite(userId, track.uri);
                }
                const updatedFavs = await dbBridge.getUserFavourites(userId);
                page = 0;
                await interaction.update({
                    embeds: [buildListEmbed(updatedFavs, page, prefix)],
                    components: buildListComponents(page, updatedFavs)
                });
            }
            return;
        }

        if (!interaction.isButton()) return;
        const customId = interaction.customId;

        if (customId === 'fav_prev') {
            page = Math.max(0, page - 1);
            const freshFavs = await dbBridge.getUserFavourites(userId);
            await interaction.update({
                embeds: [buildListEmbed(freshFavs, page, prefix)],
                components: buildListComponents(page, freshFavs)
            });

        } else if (customId === 'fav_next') {
            const freshFavs = await dbBridge.getUserFavourites(userId);
            const maxPages = Math.max(1, Math.ceil(freshFavs.length / ITEMS_PER_PAGE));
            page = Math.min(maxPages - 1, page + 1);
            await interaction.update({
                embeds: [buildListEmbed(freshFavs, page, prefix)],
                components: buildListComponents(page, freshFavs)
            });

        } else if (customId === 'fav_remove_cancel') {
            const freshFavs = await dbBridge.getUserFavourites(userId);
            await interaction.update({
                embeds: [buildListEmbed(freshFavs, page, prefix)],
                components: buildListComponents(page, freshFavs)
            });

        } else if (customId === 'fav_add_track_btn') {
            const freshFavs = await dbBridge.getUserFavourites(userId);
            if (freshFavs.length >= 10) {
                return interaction.reply({ content: '<:cross:1488582282020126881> **Limit Reached:** You can only save up to **10** tracks in your favourites. Please remove a track first!', ephemeral: true });
            }

            const player = bot.lavalink?.players.get(interaction.guildId);
            const voiceChannel = interaction.member.voice.channel;
            const songPlaying = player && player.current;

            if (songPlaying && voiceChannel) {
                const addRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('fav_add_nowplaying')
                        .setLabel('Add Now Playing')
                        .setEmoji('🎶')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('fav_add_manual')
                        .setLabel('Add by Name or Link')
                        .setEmoji('🔍')
                        .setStyle(ButtonStyle.Primary)
                );
                const promptEmbed = new EmbedBuilder()
                    .setTitle('➕ Add Track to Favourites')
                    .setDescription('Select how you would like to add a track to your favourites:')
                    .setColor(0x00d2ff);
                
                const replyMsg = await interaction.reply({ embeds: [promptEmbed], components: [addRow], ephemeral: true, fetchReply: true });
                
                const buttonCol = replyMsg.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 60_000
                });
                
                buttonCol.on('collect', async btnInt => {
                    if (btnInt.customId === 'fav_add_nowplaying') {
                        const currentTrack = player.current;
                        const info = currentTrack.info || currentTrack;
                        const trackData = {
                            title: info.title,
                            uri: info.uri,
                            author: info.author,
                            duration: info.length || info.duration,
                            identifier: info.identifier
                        };
                        const currentFavs = await dbBridge.getUserFavourites(userId);
                        if (currentFavs.length >= 10) {
                            return btnInt.update({ content: '<:cross:1488582282020126881> **Limit Reached:** You can only save up to **10** tracks.', embeds: [], components: [] });
                        }
                        const added = await dbBridge.addFavourite(userId, trackData);
                        const resEmbed = new EmbedBuilder().setColor(0x00d2ff);
                        if (added) {
                            resEmbed.setDescription(`♡ Added [**${escMd(info.title)}**](${info.uri}) to your favourites!`);
                        } else {
                            resEmbed.setDescription(`<:cross:1488582282020126881> [**${escMd(info.title)}**](${info.uri}) is already in your favourites!`);
                        }
                        await btnInt.update({ embeds: [resEmbed], components: [] });
                        
                        const freshFavsList = await dbBridge.getUserFavourites(userId);
                        await msg.edit({
                            embeds: [buildListEmbed(freshFavsList, page, prefix)],
                            components: buildListComponents(page, freshFavsList)
                        }).catch(() => {});
                    } else if (btnInt.customId === 'fav_add_manual') {
                        await showAddModal(btnInt, userId, msg, page, prefix);
                    }
                    buttonCol.stop();
                });
            } else {
                await showAddModal(interaction, userId, msg, page, prefix);
            }

        } else if (customId === 'fav_remove_track_btn') {
            const freshFavs = await dbBridge.getUserFavourites(userId);
            if (freshFavs.length === 0) {
                return interaction.reply({ content: '<:cross:1488582282020126881> You don\'t have any favourites to remove!', ephemeral: true });
            }
            
            const selectEmbed = new EmbedBuilder()
                .setTitle('♡ Remove a Favourite')
                .setDescription('Select a track from the dropdown below to remove it from your favourites.')
                .setColor(0x00d2ff);
                
            const options = freshFavs.slice(0, 10).map((t, i) => {
                const rawTitle = (t.title || 'Unknown').replace(/[\[\]]/g, '');
                const label = `${i + 1}. ${rawTitle}`.slice(0, 100);
                const desc = (t.author || 'Unknown').slice(0, 100);
                return { label, description: desc, value: String(i) };
            });
            
            const select = new StringSelectMenuBuilder()
                .setCustomId('fav_remove_select')
                .setPlaceholder('Select a track to remove...')
                .addOptions(options);
                
            const cancelBtn = new ButtonBuilder()
                .setCustomId('fav_remove_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary);
                
            const selectRow = new ActionRowBuilder().addComponents(select);
            const buttonRow = new ActionRowBuilder().addComponents(cancelBtn);
            
            await interaction.update({
                embeds: [selectEmbed],
                components: [selectRow, buttonRow]
            });

        } else if (customId === 'fav_play_all') {
            const freshFavs = await dbBridge.getUserFavourites(userId);
            if (freshFavs.length === 0) {
                return interaction.reply({ content: '<:cross:1488582282020126881> No favourites to play!', ephemeral: true });
            }

            const voiceChannel = interaction.member.voice.channel;
            if (!voiceChannel) {
                return interaction.reply({ content: '<:cross:1488582282020126881> Join a voice channel first!', ephemeral: true });
            }

            await interaction.deferUpdate();

            let player = bot.lavalink.players.get(interaction.guildId);
            if (!player) {
                try {
                    player = await bot.lavalink.joinVoiceChannel({
                        guildId: interaction.guildId,
                        channelId: voiceChannel.id,
                        shardId: interaction.guild.shardId,
                        deaf: true
                    });
                    registerPlayerEvents(bot, player);
                } catch (e) {
                    return interaction.followUp({ content: `<:cross:1488582282020126881> Could not connect to your voice channel: ${e.message}`, ephemeral: true });
                }
            } else if (String(player.connection.channelId) !== String(voiceChannel.id)) {
                return interaction.followUp({ content: '<:cross:1488582282020126881> I am already in a different voice channel!', ephemeral: true });
            }

            player.store('channel', interaction.channelId);

            const node = bot.lavalink.nodes.get('matrix_node') || [...bot.lavalink.nodes.values()][0];
            if (!node) {
                return interaction.followUp({ content: '<:cross:1488582282020126881> Music node is currently offline!', ephemeral: true });
            }

            let added = 0;
            const statusMsg = await interaction.followUp({ content: `<a:loading1:1488582519304618236> Loading **${freshFavs.length}** favourite tracks...`, ephemeral: false });

            for (const t of freshFavs) {
                const query = t.uri || t.identifier;
                if (!query) continue;
                try {
                    const result = await node.rest.resolve(query);
                    if (!result || result.loadType === 'empty' || result.loadType === 'error') continue;
                    const track = result.loadType === 'search' ? result.data[0] : (result.loadType === 'playlist' ? result.data.tracks[0] : result.data);
                    if (!track) continue;
                    track.requester = interaction.user.id;
                    player.queue.push(track);
                    added++;
                } catch (e) {
                    continue;
                }
            }

            if (added === 0) {
                return statusMsg.edit({ content: '<:cross:1488582282020126881> Failed to load any tracks from your favourites.' });
            }

            await statusMsg.edit({ content: `<:tick:1488582269298807024> Loaded **${added}** tracks from your favourites into the queue!` });

            if (!player.current) {
                playNext(bot, player).catch(() => { });
            }
        }
    });

    collector.on('end', async () => {
        const freshFavs = await dbBridge.getUserFavourites(userId);
        await msg.edit({ embeds: [buildListEmbed(freshFavs, page, prefix)], components: [] }).catch(() => { });
    });
}

// ─── Subcommand: add ──────────────────────────────────────────────────────────

async function handleAdd(bot, message) {
    const userId = String(message.author.id);
    const favourites = await dbBridge.getUserFavourites(userId);
    if (favourites.length >= 10) {
        return message.reply('<:cross:1488582282020126881> **Limit Reached:** You can only save up to **10** tracks in your favourites. Please remove a track first!');
    }

    const player = bot.lavalink?.players.get(message.guild.id);
    if (!player || !player.current) {
        return message.reply('<:cross:1488582282020126881> There is no music playing right now!');
    }

    const track = player.current;
    const info = track.info || track;

    const trackData = {
        title: info.title,
        uri: info.uri,
        author: info.author,
        duration: info.length || info.duration,
        identifier: info.identifier
    };

    const added = await dbBridge.addFavourite(userId, trackData);

    const embed = new EmbedBuilder().setColor(0x00d2ff);
    const thumb = getYtThumbnail(info);
    if (thumb) embed.setThumbnail(thumb);

    if (added) {
        embed.setDescription(`♡ Added [**${escMd(info.title)}**](${info.uri}) to your favourites!`);
    } else {
        embed.setDescription(`<:cross:1488582282020126881> [**${escMd(info.title)}**](${info.uri}) is already in your favourites!`);
    }

    await message.reply({ embeds: [embed] });
}

// ─── Subcommand: remove ───────────────────────────────────────────────────────

async function handleRemove(bot, message) {
    const userId = String(message.author.id);
    const favourites = await dbBridge.getUserFavourites(userId);

    if (favourites.length === 0) {
        return message.reply('<:cross:1488582282020126881> You don\'t have any favourites to remove!');
    }

    const selectEmbed = new EmbedBuilder()
        .setTitle('♡  Remove a Favourite')
        .setDescription('Select a track from the dropdown below to remove it from your favourites.')
        .setColor(0x00d2ff);

    const options = favourites.slice(0, 10).map((t, i) => {
        // Strip special characters from dropdown labels — Discord rejects labels with certain chars
        const rawTitle = (t.title || 'Unknown').replace(/[\[\]]/g, '');
        const label = `${i + 1}. ${rawTitle}`.slice(0, 100);
        const desc = (t.author || 'Unknown').slice(0, 100);
        return { label, description: desc, value: String(i) };
    });

    const select = new StringSelectMenuBuilder()
        .setCustomId('fav_remove_select')
        .setPlaceholder('Select a track to remove...')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(select);
    const msg = await message.reply({ embeds: [selectEmbed], components: [row] });

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60_000
    });

    collector.on('collect', async interaction => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: '<:cross:1488582282020126881> This menu is not for you!', ephemeral: true });
        }

        const idx = parseInt(interaction.values[0]);
        const freshFavs = await dbBridge.getUserFavourites(userId);
        const track = freshFavs[idx];

        if (!track) {
            return interaction.update({ content: '<:cross:1488582282020126881> Track not found. It may have already been removed.', embeds: [], components: [] });
        }

        const trackTitle = track.title || 'Unknown';
        const trackUri = track.uri;

        const confirmEmbed = new EmbedBuilder()
            .setTitle('<:report:1502014120344682556> Remove Favourite?')
            .setDescription(`Are you sure you want to remove **${trackTitle}** from your favourites?`)
            .setColor(0x00d2ff);

        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('fav_confirm_remove')
                .setLabel('Yes, Remove')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('<:trash:1502013580634226718>'),
            new ButtonBuilder()
                .setCustomId('fav_cancel_remove')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:cross:1488582282020126881>')
        );

        await interaction.update({ embeds: [confirmEmbed], components: [confirmRow] });
        collector.stop();

        // Second stage: confirm / cancel buttons
        const btnCollector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60_000
        });

        btnCollector.on('collect', async btnInt => {
            if (btnInt.user.id !== message.author.id) {
                return btnInt.reply({ content: '<:cross:1488582282020126881> This is not for you!', ephemeral: true });
            }

            if (btnInt.customId === 'fav_confirm_remove') {
                const removed = await dbBridge.removeFavourite(userId, trackUri);
                const doneEmbed = new EmbedBuilder().setColor(0x00d2ff).setDescription(
                    removed
                        ? `<:tick:1488582269298807024> Removed **${trackTitle}** from your favourites!`
                        : `<:cross:1488582282020126881> Failed to remove **${trackTitle}** — it may already be gone.`
                );
                await btnInt.update({ embeds: [doneEmbed], components: [] });
            } else {
                const cancelEmbed = new EmbedBuilder().setColor(0x00d2ff)
                    .setDescription('<:tick:1488582269298807024> **Cancelled.** Your favourites are safe!');
                await btnInt.update({ embeds: [cancelEmbed], components: [] });
            }
            btnCollector.stop();
        });

        btnCollector.on('end', async (_, reason) => {
            if (reason === 'time') {
                await msg.edit({ components: [] }).catch(() => { });
            }
        });
    });

    collector.on('end', async (_, reason) => {
        if (reason === 'time') {
            await msg.edit({ components: [] }).catch(() => { });
        }
    });
}

// ─── Subcommand: clear ────────────────────────────────────────────────────────

async function handleClear(bot, message) {
    const userId = String(message.author.id);
    const favourites = await dbBridge.getUserFavourites(userId);

    if (favourites.length === 0) {
        return message.reply('<:cross:1488582282020126881> You don\'t have any favourites to clear!');
    }

    const embed = new EmbedBuilder()
        .setTitle('<:report:1502014120344682556> Clear All Favourites?')
        .setDescription(
            `Are you sure you want to clear all **${favourites.length}** track${favourites.length !== 1 ? 's' : ''} from your favourites?\n\n` +
            `**This action cannot be undone!**`
        )
        .setColor(0x00d2ff);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fav_confirm_clear')
            .setLabel('Yes, Clear All')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('<:trash:1502013580634226718>'),
        new ButtonBuilder()
            .setCustomId('fav_cancel_clear')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:cross:1488582282020126881>')
    );

    const msg = await message.reply({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000
    });

    collector.on('collect', async interaction => {
        if (interaction.user.id !== message.author.id) {
            return interaction.reply({ content: '<:cross:1488582282020126881> This is not for you!', ephemeral: true });
        }

        if (interaction.customId === 'fav_confirm_clear') {
            await dbBridge.clearFavourites(userId);
            const doneEmbed = new EmbedBuilder().setColor(0x00d2ff)
                .setDescription('<:tick:1488582269298807024> **All your favourites have been cleared!**');
            await interaction.update({ embeds: [doneEmbed], components: [] });
        } else {
            const cancelEmbed = new EmbedBuilder().setColor(0x00d2ff)
                .setDescription('<:tick:1488582269298807024> **Cancelled. Your favourites are safe!**');
            await interaction.update({ embeds: [cancelEmbed], components: [] });
        }
        collector.stop();
    });

    collector.on('end', async (_, reason) => {
        if (reason === 'time') {
            await msg.edit({ components: [] }).catch(() => { });
        }
    });
}

// ─── Command Export ───────────────────────────────────────────────────────────

module.exports = {
    name: 'fav',
    aliases: ['favourite', 'favorites', 'favs', 'fev'],
    description: 'Manage your favourite tracks. Subcommands: list, add, remove, clear.',
    async execute(bot, message, args) {
        const sub = args[0]?.toLowerCase();

        if (!sub || sub === 'list') {
            return handleList(bot, message);
        }

        if (sub === 'add') {
            return handleAdd(bot, message);
        }

        if (sub === 'remove' || sub === 'rm') {
            return handleRemove(bot, message);
        }

        if (sub === 'clear') {
            return handleClear(bot, message);
        }

        // Unknown subcommand — show usage
        const prefix = dbBridge.getPrefix(message.guild?.id, '.');
        const embed = new EmbedBuilder()
            .setTitle('<:heart:1507353921641779252> Favourites — Help')
            .setColor(0x00d2ff)
            .addFields(
                { name: `\`${prefix}fav\` or \`${prefix}fav list\``, value: 'View your saved favourite tracks (paginated)', inline: false },
                { name: `\`${prefix}fav add\``, value: 'Add the currently playing track to favourites', inline: false },
                { name: `\`${prefix}fav remove\``, value: 'Pick a track from a dropdown to remove', inline: false },
                { name: `\`${prefix}fav clear\``, value: 'Clear all your favourites (with confirmation)', inline: false }
            )
            .setFooter({ text: 'EchoFluxTest Music' });

        await message.reply({ embeds: [embed] });
    }
};
