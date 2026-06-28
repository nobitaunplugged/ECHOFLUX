const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { formatTime, getYtThumbnail } = require('../../utils/embedHelpers');
const { detectSource, getSourceEmoji } = require('../../utils/playerEmbed');

async function resolveSearch(node, query) {
    try {
        const result = await node.rest.resolve(query);
        if (result && result.loadType === 'search' && Array.isArray(result.data)) {
            return result.data.filter(t => {
                const info = t.info || t;
                return info.isStream || (info.length || info.duration || 0) >= 15000;
            });
        }
        return [];
    } catch (e) {
        return [];
    }
}

module.exports = {
    name: 'search',
    aliases: ['find'],
    description: 'Searches for tracks on YouTube, Spotify, SoundCloud, JioSaavn, and Apple Music.',
    async execute(bot, message, args) {
        const query = args.join(' ').trim();
        if (!query) {
            return await message.reply("<:cross:1488582282020126881> You need to provide a search query! Try `.search <song name>`");
        }

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return await message.reply("<:cross:1488582282020126881> You need to join a voice channel first!");
        }

        let player = bot.lavalink.players.get(message.guild.id);
        if (!player) {
            player = await bot.lavalink.joinVoiceChannel({
                guildId: message.guild.id,
                channelId: voiceChannel.id,
                shardId: message.guild.shardId,
                deaf: true
            });
            const { registerPlayerEvents } = require('../../events/playerLifecycle');
            registerPlayerEvents(bot, player);
        } else if (String(player.connection.channelId) !== String(voiceChannel.id)) {
            return await message.reply("<:cross:1488582282020126881> You need to be in the same voice channel as me to play music!");
        }

        player.store('channel', message.channel.id);
        player.textChannelId = message.channel.id;

        const msg = await message.reply(`<a:loading1:1488582519304618236> Searching for \`${query}\` across all platforms...`);

        try {
            const node = bot.lavalink.nodes.get('default-node') || bot.lavalink.nodes.values().next().value;

            const [ytTracks, scTracks, spTracks, jsTracks, amTracks] = await Promise.all([
                resolveSearch(node, `ytsearch:${query}`),
                resolveSearch(node, `scsearch:${query}`),
                resolveSearch(node, `spsearch:${query}`),
                resolveSearch(node, `jssearch:${query}`),
                resolveSearch(node, `amsearch:${query}`)
            ]);

            const combinedTracks = [];
            const sourcesOrder = [
                { name: "YouTube", tracks: ytTracks },
                { name: "Spotify", tracks: spTracks },
                { name: "SoundCloud", tracks: scTracks },
                { name: "JioSaavn", tracks: jsTracks },
                { name: "Apple Music", tracks: amTracks }
            ];

            let remainingSlots = 25;
            for (const src of sourcesOrder) {
                const take = Math.min(src.tracks.length, Math.min(5, remainingSlots));
                combinedTracks.push(...src.tracks.slice(0, take));
                remainingSlots -= take;
                if (remainingSlots <= 0) break;
            }

            if (combinedTracks.length === 0) {
                return await msg.edit({ content: '<:cross:1488582282020126881> No results found on any platform. Try a different query!' });
            }

            const options = [];
            combinedTracks.forEach((track, i) => {
                const info = track.info || track;
                const source = info.sourceName || "";
                const uri = info.uri || "";

                let emoji;
                if (source === 'youtube' || uri.includes('youtube.com') || uri.includes('youtu.be')) {
                    emoji = "<:youtube:1502210708459360347>";
                } else if (source === 'spotify' || uri.includes('spotify.com')) {
                    emoji = "<:spotify:1502012709460250746>";
                } else if (source === 'soundcloud' || uri.includes('soundcloud.com')) {
                    emoji = "<:SoundCloud:1488582309895602196>";
                } else if (source === 'jiosaavn' || uri.includes('jiosaavn.com') || uri.includes('saavn.com')) {
                    emoji = "<:jiosaavn:1507353942848180224>";
                } else if (source === 'applemusic' || uri.includes('apple.com')) {
                    emoji = "<:apple:1507614014597763093>";
                } else {
                    emoji = "<:Music:1488582297321214081>";
                }

                const srcName = detectSource(track);
                const description = info.author ? `${srcName} • ${info.author.substring(0, 80)}` : srcName;

                options.push({
                    label: info.title.substring(0, 100),
                    description: description,
                    value: String(i),
                    emoji: emoji
                });
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('search_select')
                .setPlaceholder('Select tracks to play...')
                .setMinValues(1)
                .setMaxValues(Math.min(combinedTracks.length, 25))
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await msg.edit({
                content: "Select one or more tracks from the dropdown below:\n" +
                         "<:youtube:1502210708459360347> YouTube  •  <:spotify:1502012709460250746> Spotify  •  <:SoundCloud:1488582309895602196> SoundCloud  •  <:jiosaavn:1507353942848180224> JioSaavn  •  <:apple:1507614014597763093> Apple Music",
                components: [row]
            });

            const collector = msg.createMessageComponentCollector({
                filter: (i) => i.user.id === message.author.id && i.customId === 'search_select',
                time: 180000
            });

            collector.on('collect', async (interaction) => {
                const selectedIndices = interaction.values.map(v => parseInt(v, 10));
                const addedTracks = [];
                selectedIndices.forEach(idx => {
                    const track = combinedTracks[idx];
                    track.requester = message.author.id;
                    player.queue.push(track);
                    addedTracks.push(track);
                });

                const embed = new EmbedBuilder().setColor(0x00d2ff);

                if (addedTracks.length === 1) {
                    const track = addedTracks[0];
                    const info = track.info || track;
                    embed.setTitle('<:Music:1488582297321214081> Track Enqueued!');
                    embed.setDescription(`[${info.title}](${info.uri})`);

                    const thumb = getYtThumbnail(info);
                    if (thumb) embed.setThumbnail(thumb);

                    const source = detectSource(track);
                    const sourceEmoji = getSourceEmoji(track, bot);

                    embed.addFields(
                        { name: "Channel/Author", value: info.author || "Unknown", inline: true },
                        { name: "Source", value: `${sourceEmoji} ${source}`, inline: true },
                        { name: "Duration", value: `\`${formatTime(info.length || info.duration || 0)}\``, inline: true }
                    );
                } else {
                    embed.setTitle('<:Music:1488582297321214081> Tracks Enqueued!');
                    embed.setDescription(`Added **${addedTracks.length}** tracks to the queue!`);

                    const totalDuration = addedTracks.reduce((acc, t) => acc + (t.info?.length || t.info?.duration || t.length || t.duration || 0), 0);
                    embed.addFields(
                        { name: "Tracks", value: `\`${addedTracks.length}\``, inline: true },
                        { name: "Total Duration", value: `\`${formatTime(totalDuration)}\``, inline: true }
                    );

                    const thumb = getYtThumbnail(addedTracks[0].info || addedTracks[0]);
                    if (thumb) embed.setThumbnail(thumb);
                }

                const disabledMenu = new StringSelectMenuBuilder()
                    .setCustomId('search_select')
                    .setPlaceholder('Selection made!')
                    .addOptions(options.slice(0, 1))
                    .setDisabled(true);
                const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);

                await interaction.update({
                    content: "Selection made!",
                    embeds: [embed],
                    components: [disabledRow]
                }).catch(() => {});

                collector.stop();

                if (!player.current) {
                    const { playNext } = require('../../events/playerLifecycle');
                    await playNext(bot, player);
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    const disabledMenu = new StringSelectMenuBuilder()
                        .setCustomId('search_select')
                        .setPlaceholder('Search timed out.')
                        .addOptions(options.slice(0, 1))
                        .setDisabled(true);
                    const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);
                    await msg.edit({
                        content: "Search timed out.",
                        components: [disabledRow]
                    }).catch(() => {});
                }
            });

        } catch (e) {
            return await msg.edit({ content: `<:cross:1488582282020126881> An error occurred while searching: ${e.message}` });
        }
    }
};
