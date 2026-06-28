const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatTime, getYtThumbnail } = require('../../utils/embedHelpers');

// Helper validation
function getPlayer(bot, guildId) {
    return bot.lavalink.players.get(guildId);
}

async function validateVC(bot, message) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        await message.reply("<:cross:1488582282020126881> You need to join a voice channel first!");
        return null;
    }
    return voiceChannel;
}

// Pagination UI class / helper
class QueuePagination {
    constructor(bot, message, player) {
        this.bot = bot;
        this.message = message;
        this.player = player;
        this.currentPage = 0;
        this.itemsPerPage = 10;

        this.prevEmoji = bot.getEmoji("arrow_left", "⬅️");
        this.stopEmoji = bot.getEmoji("stop", "<:stop:1502013562300665977>");
        this.nextEmoji = bot.getEmoji("arrow_right", "➡️");
    }

    getButtons() {
        const queue = this.player.queue || [];
        const maxPages = Math.max(1, Math.ceil(queue.length / this.itemsPerPage));

        const prevBtn = new ButtonBuilder()
            .setCustomId('queue_prev')
            .setStyle(ButtonStyle.Primary)
            .setEmoji(this.prevEmoji)
            .setDisabled(this.currentPage === 0);

        const stopBtn = new ButtonBuilder()
            .setCustomId('queue_stop')
            .setStyle(ButtonStyle.Danger)
            .setEmoji(this.stopEmoji);

        const nextBtn = new ButtonBuilder()
            .setCustomId('queue_next')
            .setStyle(ButtonStyle.Primary)
            .setEmoji(this.nextEmoji)
            .setDisabled(this.currentPage >= maxPages - 1 || queue.length === 0);

        return new ActionRowBuilder().addComponents(prevBtn, stopBtn, nextBtn);
    }

    generateEmbed() {
        const queue = this.player.queue || [];
        const embed = new EmbedBuilder().setColor(0x00d2ff);

        if (this.bot.user) {
            embed.setAuthor({
                name: `${this.message.guild.name} Music Queue`,
                iconURL: this.message.guild.iconURL() || this.bot.user.displayAvatarURL()
            });
        }

        let desc = "";
        if (this.player.current) {
            const currentInfo = this.player.current.info || this.player.current;
            desc += `**Currently Playing:**\n<:Music:1488582297321214081> [${currentInfo.title}](${currentInfo.uri})\n\n`;
        } else {
            embed.setDescription("There is nothing playing right now!");
            return embed;
        }

        if (!queue || queue.length === 0) {
            desc += "**Up Next:**\nThe queue is currently empty!";
            embed.setDescription(desc);
            return embed;
        }

        const maxPages = Math.max(1, Math.ceil(queue.length / this.itemsPerPage));
        if (this.currentPage >= maxPages) {
            this.currentPage = maxPages - 1;
        }

        const start = this.currentPage * this.itemsPerPage;
        const end = start + this.itemsPerPage;

        let qList = "";
        const pageTracks = queue.slice(start, end);
        pageTracks.forEach((track, idx) => {
            const info = track.info || track;
            const title = info.title.length > 60 ? info.title.substring(0, 60) + "..." : info.title;
            qList += `\`${start + idx + 1}.\` [${title}](${info.uri})\n`;
        });

        desc += `**Up Next:**\n${qList || 'No tracks on this page.'}`;
        embed.setDescription(desc);

        let totalDur = queue.reduce((acc, t) => acc + (t.info?.length || t.info?.duration || t.length || t.duration || 0), 0);
        if (this.player.current) {
            const curInfo = this.player.current.info || this.player.current;
            totalDur += (curInfo.length || curInfo.duration || 0) - (this.player.position || 0);
        }

        embed.setFooter({
            text: `Page ${this.currentPage + 1}/${maxPages} | ${queue.length} tracks | Duration: ${formatTime(totalDur)}`,
            iconURL: this.message.author.displayAvatarURL()
        });

        return embed;
    }
}

module.exports = [
    {
        name: 'queue',
        aliases: ['q', 'list'],
        description: 'Displays the currently playing song and the queue.',
        async execute(bot, message, args) {
            if (!bot.lavalink) {
                return await message.reply("<:cross:1488582282020126881> Lavalink client is not initialized!");
            }

            const player = bot.lavalink.players.get(message.guild.id);
            if (!player || !player.connection || !player.connection.channelId) {
                return await message.reply("<:cross:1488582282020126881> I am not connected to a voice channel!");
            }
            if (!player.current && (!player.queue || player.queue.length === 0)) {
                return await message.reply("<:cross:1488582282020126881> There is no music playing right now, and the queue is empty!");
            }

            const pagination = new QueuePagination(bot, message, player);
            const embed = pagination.generateEmbed();
            const buttons = pagination.getButtons();

            const msg = await message.reply({ embeds: [embed], components: [buttons] });

            const collector = msg.createMessageComponentCollector({
                filter: (i) => i.user.id === message.author.id,
                time: 180000
            });

            collector.on('collect', async (interaction) => {
                if (interaction.customId === 'queue_prev') {
                    pagination.currentPage--;
                } else if (interaction.customId === 'queue_next') {
                    pagination.currentPage++;
                } else if (interaction.customId === 'queue_stop') {
                    collector.stop('stopped_by_user');
                    const disabledRow = new ActionRowBuilder().addComponents(
                        pagination.getButtons().components.map(btn => btn.setDisabled(true))
                    );
                    await interaction.update({ embeds: [pagination.generateEmbed()], components: [disabledRow] }).catch(() => {});
                    return;
                }

                await interaction.update({
                    embeds: [pagination.generateEmbed()],
                    components: [pagination.getButtons()]
                }).catch(() => {});
            });

            collector.on('end', async (collected, reason) => {
                if (reason !== 'stopped_by_user') {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        pagination.getButtons().components.map(btn => btn.setDisabled(true))
                    );
                    await msg.edit({ embeds: [pagination.generateEmbed()], components: [disabledRow] }).catch(() => {});
                }
            });
        }
    },
    {
        name: 'pnext',
        aliases: ['pn', 'playnext'],
        description: 'Adds a song to the very top of the queue so it plays next.',
        async execute(bot, message, args) {
            const voiceChannel = await validateVC(bot, message);
            if (!voiceChannel) return;

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
                return await message.reply("<:cross:1488582282020126881> You need to be in the same voice channel as me to queue music!");
            }

            let query = args.join(' ').replace(/[<>]/g, '').trim();
            if (!query) {
                return await message.reply("<:cross:1488582282020126881> Missing input! Please provide a search query or URL.");
            }

            if (!query.startsWith('http')) {
                query = `ytsearch:${query}`;
            }

            const msg = await message.reply("<a:loading1:1488582519304618236> Searching for your track to play next...");

            try {
                const node = bot.lavalink.nodes.get('default-node') || bot.lavalink.nodes.values().next().value;
                const result = await node.rest.resolve(query);

                if (!result || !result.data || result.loadType === 'empty') {
                    return await msg.edit({ content: '<:cross:1488582282020126881> No results found. Try a different query!' });
                }

                player.store('channel', message.channel.id);
                player.textChannelId = message.channel.id;

                const embed = new EmbedBuilder().setColor(0x00d2ff);

                if (result.loadType === 'playlist') {
                    const tracks = result.data.tracks || [];
                    for (let i = tracks.length - 1; i >= 0; i--) {
                        const t = tracks[i];
                        t.requester = message.author.id;
                        player.queue.unshift(t);
                    }

                    embed.setTitle('<:playlists:1502013365847855325> Playlist Priority Enqueued!');
                    embed.setDescription(`Added **${result.data.info.name}** to the front of the queue!`);
                    
                    const totalDur = tracks.reduce((acc, t) => acc + (t.info?.length || t.info?.duration || 0), 0);
                    embed.addFields(
                        { name: "Tracks", value: `\`${tracks.length}\``, inline: true },
                        { name: "Total Duration", value: `\`${formatTime(totalDur)}\``, inline: true }
                    );

                    const thumb = getYtThumbnail(tracks[0]?.info || tracks[0]);
                    if (thumb) {
                        embed.setThumbnail(thumb);
                    }

                    await msg.edit({ content: null, embeds: [embed] });
                } else {
                    const track = result.loadType === 'search' ? result.data[0] : result.data;
                    const info = track.info || track;
                    track.requester = message.author.id;
                    player.queue.unshift(track);

                    embed.setTitle('<:Queue:1488582309895602196> Track Priority Enqueued!');
                    embed.setDescription(`[${info.title}](${info.uri})`);

                    const thumb = getYtThumbnail(info);
                    if (thumb) {
                        embed.setThumbnail(thumb);
                    }

                    embed.addFields(
                        { name: "Channel/Author", value: info.author || "Unknown", inline: true },
                        { name: "Duration", value: `\`${formatTime(info.length || info.duration || 0)}\``, inline: true }
                    );
                    embed.setFooter({ text: "This song will play next!" });

                    await msg.edit({ content: null, embeds: [embed] });
                }

                if (!player.current) {
                    const { playNext } = require('../../events/playerLifecycle');
                    await playNext(bot, player);
                }
            } catch (e) {
                return await msg.edit({ content: `<:cross:1488582282020126881> An error occurred while searching: ${e.message}` });
            }
        }
    },
    {
        name: 'remove',
        aliases: ['rm'],
        description: 'Removes a track from the queue at the specified index.',
        async execute(bot, message, args) {
            const voiceChannel = await validateVC(bot, message);
            if (!voiceChannel) return;

            if (!bot.lavalink) {
                return await message.reply("<:cross:1488582282020126881> Lavalink client is not initialized!");
            }

            const player = bot.lavalink.players.get(message.guild.id);
            if (!player || !player.connection || !player.connection.channelId) {
                return await message.reply("<:cross:1488582282020126881> I am not connected to a voice channel!");
            }
            if (String(voiceChannel.id) !== String(player.connection.channelId)) {
                return await message.reply("<:cross:1488582282020126881> You need to be in my voice channel to remove music!");
            }
            if (!player.queue || player.queue.length === 0) {
                return await message.reply("<:cross:1488582282020126881> The queue is empty!");
            }

            if (!args[0]) {
                return await message.reply("<:cross:1488582282020126881> You need to provide the index of the track to remove! Example: `.remove 2`");
            }

            const index = parseInt(args[0], 10);
            if (isNaN(index) || index < 1 || index > player.queue.length) {
                return await message.reply(`<:cross:1488582282020126881> Invalid index! Please provide a number between 1 and ${player.queue.length}.`);
            }

            const removedTrack = player.queue.splice(index - 1, 1)[0];
            const info = removedTrack.info || removedTrack;
            await message.reply(`<:tick:1488582269298807024> **Removed:** \`${info.title}\` from the queue.`);
        }
    }
];
