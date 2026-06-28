const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder 
} = require('discord.js');
const dbBridge = require('../../utils/dbBridge');

async function getUserFavourites(userId) {
    return await dbBridge.getUserFavourites(userId);
}

async function addFavourite(userId, trackData) {
    return await dbBridge.addFavourite(userId, trackData);
}

async function removeFavourite(userId, uri) {
    return await dbBridge.removeFavourite(userId, uri);
}

async function removeFavouriteByIndex(userId, index) {
    return await dbBridge.removeFavouriteByIndex(userId, index);
}

async function isFavourite(userId, uri) {
    const list = await dbBridge.getUserFavourites(userId);
    return list.some(t => t.uri === uri);
}

async function clearFavourites(userId) {
    return await dbBridge.clearFavourites(userId);
}

// Helper for replying to messages/interactions
async function replyOrEdit(messageOrInteraction, options) {
    const isInteraction = messageOrInteraction.user !== undefined;
    if (isInteraction) {
        if (messageOrInteraction.replied || messageOrInteraction.deferred) {
            return await messageOrInteraction.followUp(options);
        }
        return await messageOrInteraction.reply(options);
    } else {
        return await messageOrInteraction.reply(options);
    }
}

// ─── Cog Execute ──────────────────────────────────────────────────────────────

async function execute(bot, messageOrInteraction, args) {
    const isInteraction = messageOrInteraction.user !== undefined;
    const user = isInteraction ? messageOrInteraction.user : messageOrInteraction.author;
    const guild = messageOrInteraction.guild;

    let subcommand = null;
    if (isInteraction) {
        subcommand = messageOrInteraction.options?.getSubcommand(false) || null;
    } else {
        subcommand = args && args[0] ? args[0].toLowerCase() : null;
    }

    // Default to 'list' if no subcommand or 'list' subcommand explicitly provided
    if (!subcommand || subcommand === 'list') {
        const favourites = await getUserFavourites(user.id);
        let currentPage = 0;
        const itemsPerPage = 10;
        const maxPages = Math.max(1, Math.ceil(favourites.length / itemsPerPage));

        const generateEmbed = (page) => {
            const start = page * itemsPerPage;
            const end = start + itemsPerPage;
            const embed = new EmbedBuilder()
                .setTitle("<:heart:1507353921641779252> Your Favourites")
                .setColor(0x00d2ff);

            if (favourites.length === 0) {
                embed.setDescription("You don't have any favourites yet!\nUse the <:heart:1507353921641779252> button on the player or `.fav add` to add songs.");
            } else {
                let desc = "";
                const pageItems = favourites.slice(start, end);
                pageItems.forEach((t, i) => {
                    const index = start + i + 1;
                    const title = (t.title || 'Unknown').slice(0, 60);
                    const uri = t.uri || '';
                    const author = t.author || 'Unknown';
                    desc += `\`${index}.\` [${title}](${uri}) — *${author}*\n`;
                });
                embed.setDescription(desc);
            }
            embed.setFooter({ text: `Page ${page + 1}/${maxPages} | ${favourites.length} total favourites` });
            return embed;
        };

        const getButtons = (page) => {
            return new ActionRowBuilder().addComponents(
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
                    .setEmoji('▶️')
                    .setStyle(ButtonStyle.Success)
            );
        };

        const response = await replyOrEdit(messageOrInteraction, {
            embeds: [generateEmbed(currentPage)],
            components: favourites.length > 0 ? [getButtons(currentPage)] : []
        });

        if (favourites.length === 0) return;

        const msg = isInteraction ? await messageOrInteraction.fetchReply() : response;

        const collector = msg.createMessageComponentCollector({
            filter: (i) => {
                if (i.user.id !== user.id) {
                    i.reply({ content: "<:cross:1488582282020126881> This is not for you!", ephemeral: true }).catch(() => {});
                    return false;
                }
                return true;
            },
            time: 120000
        });

        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'fav_prev') {
                currentPage--;
                await interaction.update({
                    embeds: [generateEmbed(currentPage)],
                    components: [getButtons(currentPage)]
                });
            } else if (interaction.customId === 'fav_next') {
                currentPage++;
                await interaction.update({
                    embeds: [generateEmbed(currentPage)],
                    components: [getButtons(currentPage)]
                });
            } else if (interaction.customId === 'fav_play_all') {
                if (!interaction.member.voice?.channel) {
                    return interaction.reply({ content: "<:cross:1488582282020126881> Join a Voice Channel first!", ephemeral: true });
                }

                await interaction.deferReply({ ephemeral: false });

                let player = bot.lavalink.players.get(interaction.guildId);
                if (!player) {
                    player = await bot.lavalink.joinVoiceChannel({
                        guildId: interaction.guildId,
                        channelId: interaction.member.voice.channel.id,
                        shardId: interaction.guild.shardId,
                        deaf: true
                    });
                    const { registerPlayerEvents } = require('../../events/playerLifecycle');
                    registerPlayerEvents(bot, player);
                } else if (String(player.connection.channelId) !== String(interaction.member.voice.channel.id)) {
                    return interaction.followUp({ content: "<:cross:1488582282020126881> I am in another voice channel!", ephemeral: true });
                }

                player.store('channel', interaction.channelId);

                let added = 0;
                const node = bot.lavalink.nodes.get('default-node') || bot.lavalink.nodes.values().next().value;

                for (const t of favourites) {
                    const query = t.uri || t.identifier;
                    if (!query) continue;
                    try {
                        const res = await node.rest.resolve(query);
                        if (res && res.data) {
                            let track = null;
                            if (res.loadType === 'playlist') {
                                track = res.data.tracks?.[0];
                            } else if (res.loadType === 'search') {
                                track = res.data?.[0];
                            } else {
                                track = res.data;
                            }
                            if (track) {
                                track.requester = interaction.user.id;
                                player.queue.push(track);
                                added++;
                            }
                        }
                    } catch (e) {
                        // ignore
                    }
                }

                if (added === 0) {
                    return interaction.followUp({ content: "<:cross:1488582282020126881> Failed to load any tracks from your favourites.", ephemeral: true });
                }

                if (!player.current) {
                    const { playNext } = require('../../events/playerLifecycle');
                    await playNext(bot, player);
                }

                await interaction.followUp({ content: `<:tick:1488582269298807024> Loaded **${added} tracks** from your favourites to the queue!`, ephemeral: false });
            }
        });

        collector.on('end', async () => {
            const disabledButtons = getButtons(currentPage);
            disabledButtons.components.forEach(btn => btn.setDisabled(true));
            try {
                await msg.edit({ components: [disabledButtons] });
            } catch (e) {}
        });

    } else if (subcommand === 'add') {
        const player = bot.lavalink.players.get(guild.id);
        if (!player || !player.current) {
            return replyOrEdit(messageOrInteraction, { content: "<:cross:1488582282020126881> There is no music playing right now!" });
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

        const success = await addFavourite(user.id, trackData);
        const embed = new EmbedBuilder().setColor(0x00d2ff);
        if (success) {
            embed.setDescription(`<:heart:1507353921641779252> Added [**${info.title}**](${info.uri}) to your favourites!`);
        } else {
            embed.setDescription(`<:cross:1488582282020126881> [**${info.title}**](${info.uri}) is already in your favourites!`);
        }
        await replyOrEdit(messageOrInteraction, { embeds: [embed] });

    } else if (subcommand === 'remove' || subcommand === 'rm') {
        const favourites = await getUserFavourites(user.id);
        if (favourites.length === 0) {
            return replyOrEdit(messageOrInteraction, { content: "<:cross:1488582282020126881> You don't have any favourites to remove!" });
        }

        const embed = new EmbedBuilder()
            .setTitle("<:heart:1507353921641779252> Remove a Favourite")
            .setDescription("Select a track from the dropdown below to remove it from your favourites.")
            .setColor(0x00d2ff);

        const options = favourites.slice(0, 25).map((t, idx) => {
            const title = (t.title || 'Unknown').length > 90 ? (t.title || 'Unknown').slice(0, 90) + '...' : (t.title || 'Unknown');
            return {
                label: `${idx + 1}. ${title}`,
                value: String(idx),
                description: (t.author || 'Unknown').slice(0, 100)
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('fav_remove_select')
            .setPlaceholder('Select a track to remove...')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const response = await replyOrEdit(messageOrInteraction, { embeds: [embed], components: [row] });
        const msg = isInteraction ? await messageOrInteraction.fetchReply() : response;

        const selectCollector = msg.createMessageComponentCollector({
            filter: (i) => {
                if (i.user.id !== user.id) {
                    i.reply({ content: "<:cross:1488582282020126881> This is not for you!", ephemeral: true }).catch(() => {});
                    return false;
                }
                return true;
            },
            time: 60000,
            max: 1
        });

        selectCollector.on('collect', async (iSelect) => {
            const idx = parseInt(iSelect.values[0]);
            const track = favourites[idx];
            const trackTitle = track.title || 'Unknown';
            const trackUri = track.uri;

            const confirmEmbed = new EmbedBuilder()
                .setTitle("<:report:1502014120344682556> Remove Favourite?")
                .setDescription(`Are you sure you want to remove **${trackTitle}** from your favourites?`)
                .setColor(0x00d2ff);

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('fav_remove_yes')
                    .setLabel('Yes, Remove')
                    .setEmoji('<:trash:1502013580634226718>')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('fav_remove_no')
                    .setLabel('Cancel')
                    .setEmoji('<:cross:1488582282020126881>')
                    .setStyle(ButtonStyle.Secondary)
            );

            await iSelect.update({ embeds: [confirmEmbed], components: [confirmRow] });

            const buttonCollector = msg.createMessageComponentCollector({
                filter: (iBtn) => {
                    if (iBtn.user.id !== user.id) {
                        iBtn.reply({ content: "<:cross:1488582282020126881> This is not for you!", ephemeral: true }).catch(() => {});
                        return false;
                    }
                    return true;
                },
                time: 60000,
                max: 1
            });

            buttonCollector.on('collect', async (iBtn) => {
                if (iBtn.customId === 'fav_remove_yes') {
                    const success = await removeFavourite(user.id, trackUri);
                    const resEmbed = new EmbedBuilder().setColor(0x00d2ff);
                    if (success) {
                        resEmbed.setDescription(`<:tick:1488582269298807024> Removed **${trackTitle}** from your favourites!`);
                    } else {
                        resEmbed.setDescription(`<:cross:1488582282020126881> Failed to remove **${trackTitle}**.`);
                    }
                    await iBtn.update({ embeds: [resEmbed], components: [] });
                } else if (iBtn.customId === 'fav_remove_no') {
                    const cancelEmbed = new EmbedBuilder()
                        .setDescription("<:tick:1488582269298807024> **Cancelled.**")
                        .setColor(0x00d2ff);
                    await iBtn.update({ embeds: [cancelEmbed], components: [] });
                }
            });

            buttonCollector.on('end', async (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    try {
                        await msg.edit({ components: [] });
                    } catch (e) {}
                }
            });
        });

        selectCollector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                try {
                    await msg.edit({ components: [] });
                } catch (e) {}
            }
        });

    } else if (subcommand === 'clear') {
        const favourites = await getUserFavourites(user.id);
        if (favourites.length === 0) {
            return replyOrEdit(messageOrInteraction, { content: "<:cross:1488582282020126881> You don't have any favourites to clear!" });
        }

        const embed = new EmbedBuilder()
            .setTitle("<:report:1502014120344682556> Clear All Favourites?")
            .setDescription(`Are you sure you want to clear all **${favourites.length}** tracks from your favourites?\n\n**This action cannot be undone!**`)
            .setColor(0x00d2ff);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('fav_clear_yes')
                .setLabel('Yes, Clear All')
                .setEmoji('<:trash:1502013580634226718>')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('fav_clear_no')
                .setLabel('Cancel')
                .setEmoji('<:cross:1488582282020126881>')
                .setStyle(ButtonStyle.Secondary)
        );

        const response = await replyOrEdit(messageOrInteraction, { embeds: [embed], components: [row] });
        const msg = isInteraction ? await messageOrInteraction.fetchReply() : response;

        const collector = msg.createMessageComponentCollector({
            filter: (i) => {
                if (i.user.id !== user.id) {
                    i.reply({ content: "<:cross:1488582282020126881> This is not for you!", ephemeral: true }).catch(() => {});
                    return false;
                }
                return true;
            },
            time: 60000,
            max: 1
        });

        collector.on('collect', async (iBtn) => {
            if (iBtn.customId === 'fav_clear_yes') {
                await clearFavourites(user.id);
                const resEmbed = new EmbedBuilder()
                    .setDescription("<:tick:1488582269298807024> **All your favourites have been cleared!**")
                    .setColor(0x00d2ff);
                await iBtn.update({ embeds: [resEmbed], components: [] });
            } else if (iBtn.customId === 'fav_clear_no') {
                const cancelEmbed = new EmbedBuilder()
                    .setDescription("<:tick:1488582269298807024> **Cancelled. Your favourites are safe!**")
                    .setColor(0x00d2ff);
                await iBtn.update({ embeds: [cancelEmbed], components: [] });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                try {
                    await msg.edit({ components: [] });
                } catch (e) {}
            }
        });
    }
}

module.exports = {
    name: 'fav',
    aliases: ['favourite'],
    description: 'Manage your favourite tracks.',
    execute,
    
    // CamelCase exports
    loadFavourites,
    saveFavourites,
    getUserFavourites,
    addFavourite,
    removeFavourite,
    removeFavouriteByIndex,
    isFavourite,
    clearFavourites,

    // Snake_case exports for maximum compatibility
    _load_favourites: loadFavourites,
    _save_favourites: saveFavourites,
    get_user_favourites: getUserFavourites,
    add_favourite: addFavourite,
    remove_favourite: removeFavourite,
    remove_favourite_by_index: removeFavouriteByIndex,
    is_favourite: isFavourite,
    clear_favourites: clearFavourites
};
