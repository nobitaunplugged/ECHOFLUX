const { EmbedBuilder } = require('discord.js');
const { formatTime, getYtThumbnail } = require('../../utils/embedHelpers');
const { detectSource, getSourceEmoji } = require('../../utils/playerEmbed');
const { registerPlayerEvents, playNext } = require('../../events/playerLifecycle');
const { ratelimitHandler, autoBlacklistUser, logRatelimitAttempt } = require('../../utils/ratelimit');

module.exports = {
    name: 'play',
    aliases: ['p'],
    description: 'Searches and plays a song from a given query or URL.',
    async execute(bot, message, args) {
        let query = args.join(' ');
        if (!query) {
            return message.reply("<:cross:1488582282020126881> Missing input! Please provide a search query or URL to play a track.");
        }

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply("<:cross:1488582282020126881> You need to join a voice channel first!");
        }

        // Get or create player
        let player = bot.lavalink.players.get(message.guild.id);
        if (!player) {
            player = await bot.lavalink.joinVoiceChannel({
                guildId: message.guild.id,
                channelId: voiceChannel.id,
                shardId: message.guild.shardId,
                deaf: true
            });
            registerPlayerEvents(bot, player);
        } else if (String(player.connection.channelId) !== String(voiceChannel.id)) {
            return message.reply("<:cross:1488582282020126881> You need to be in the same voice channel as me to play music!");
        }

        player.store('channel', message.channel.id);
        player.textChannelId = message.channel.id; // Save channel id

        // Format query
        query = query.replace(/[<>]/g, '').trim();
        if (!query.startsWith('http')) {
            query = `ytmsearch:${query}`;
        }

        const msg = await message.reply("<a:loading1:1488582519304618236> Searching for your track...");

        try {
            const node = bot.lavalink.nodes.get('matrix_node') || bot.lavalink.nodes.values().next().value;
            if (!node) {
                return msg.edit({ content: '<:cross:1488582282020126881> Music node is currently offline or reconnecting. Please wait a few seconds and try again!' });
            }
            const result = await node.rest.resolve(query);

            if (!result || !result.data || result.loadType === 'empty') {
                return msg.edit({ content: '<:cross:1488582282020126881> No results found. Try a different query!' });
            }

            const embed = new EmbedBuilder().setColor(0x00d2ff);

            if (result.loadType === 'playlist') {
                const tracks = result.data.tracks || [];
                const validTracks = tracks.filter(t => t.info.isStream || t.info.length >= 15000);

                if (validTracks.length === 0) {
                    const isOwner = await bot.isOwner(message.author);
                    if (!isOwner) {
                        if (ratelimitHandler.checkShortSongRatelimit(message.author.id)) {
                            autoBlacklistUser(message.author, "Auto-blacklisted: Triggered Track Duration Rate Limit");
                            await logRatelimitAttempt({
                                bot, user: message.author, guild: message.guild, channel: message.channel, message: message,
                                reason: "Short-Song Rate Limit Exceeded",
                                detailAnalysis: `User ${message.author.username} repeatedly tried to queue playlists of micro-songs (<15s).`
                            });
                            return msg.edit({ content: "<:cross:1488582282020126881> You have been automatically blacklisted" });
                        }
                    }
                    return msg.edit({ content: '<:cross:1488582282020126881> All tracks in this playlist were too short (under 15s) and were skipped.' });
                }

                validTracks.forEach(t => {
                    t.requester = message.author.id;
                    player.queue.push(t);
                });

                embed.setTitle('<:Music:1488582297321214081> Playlist Enqueued!');
                embed.setDescription(`Added **${validTracks.length}** tracks from **${result.data.info.name}** to the queue!`);

                const totalDuration = validTracks.reduce((acc, t) => acc + (t.info.length || t.info.duration || 0), 0);
                embed.addFields(
                    { name: "Tracks", value: `\`${validTracks.length}\``, inline: true },
                    { name: "Total Duration", value: `\`${formatTime(totalDuration)}\``, inline: true }
                );

                const thumb = getYtThumbnail(validTracks[0].info || validTracks[0]);
                if (thumb) {
                    embed.setThumbnail(thumb);
                }

                await msg.edit({ content: null, embeds: [embed] });

            } else {
                const track = result.loadType === 'search' ? result.data[0] : result.data;
                const info = track.info || track;
                const duration = info.length || info.duration || 0;

                if (!info.isStream && duration < 15000) {
                    const isOwner = await bot.isOwner(message.author);
                    if (!isOwner) {
                        if (ratelimitHandler.checkShortSongRatelimit(message.author.id)) {
                            autoBlacklistUser(message.author, "Auto-blacklisted: Triggered Track Duration Rate Limit");
                            await logRatelimitAttempt({
                                bot, user: message.author, guild: message.guild, channel: message.channel, message: message,
                                reason: "Short-Song Rate Limit Exceeded",
                                detailAnalysis: `User ${message.author.username} queued too many micro-songs (<15s).`
                            });
                            return msg.edit({ content: "<:cross:1488582282020126881> You have been automatically blacklisted." });
                        }
                    }
                    return msg.edit({ content: '<:cross:1488582282020126881> Track is too short (under 15s). Please use a longer track.' });
                }

                track.requester = message.author.id;
                player.queue.push(track);

                embed.setTitle('<:Music:1488582297321214081> Track Enqueued!');
                embed.setDescription(`[${info.title}](${info.uri})`);

                const thumb = getYtThumbnail(info);
                if (thumb) {
                    embed.setThumbnail(thumb);
                }

                const source = detectSource(track);
                const sourceEmoji = getSourceEmoji(track, bot);

                embed.addFields(
                    { name: "Channel/Author", value: info.author || "Unknown", inline: true },
                    { name: "Source", value: `${sourceEmoji} ${source}`, inline: true },
                    { name: "Duration", value: `\`${formatTime(duration)}\``, inline: true }
                );

                await msg.edit({ content: null, embeds: [embed] });
            }

            if (!player.current) {
                playNext(bot, player).catch(err => {
                    console.error("Error starting playback:", err);
                });
            }
        } catch (e) {
            return msg.edit({ content: `<:cross:1488582282020126881> An error occurred while searching: ${e.message}` });
        }
    }
};
