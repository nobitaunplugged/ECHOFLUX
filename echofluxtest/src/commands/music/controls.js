const { formatTime } = require('../../utils/embedHelpers');

function getPlayer(bot, guildId) {
    return bot.lavalink.players.get(guildId);
}

async function validate(bot, message, needPlaying = true) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        await message.reply("<:cross:1488582282020126881> You need to be in a voice channel to use this command!");
        return null;
    }

    const player = getPlayer(bot, message.guild.id);
    if (!player || !player.connection || !player.connection.channelId) {
        await message.reply("<:cross:1488582282020126881> I am not connected to a voice channel!");
        return null;
    }

    if (String(voiceChannel.id) !== String(player.connection.channelId)) {
        await message.reply("<:cross:1488582282020126881> You need to be in my voice channel!");
        return null;
    }

    if (needPlaying && !player.current && !player.paused) {
        await message.reply("<:cross:1488582282020126881> There is no music playing right now!");
        return null;
    }

    return player;
}

async function updateVcStatus(bot, player, status) {
    const channelId = player.connection.channelId;
    if (!channelId) return;
    try {
        await bot.rest.put(`/channels/${channelId}/voice-status`, {
            body: { status: status || "" }
        });
    } catch (e) {}
}

function parseTime(timeStr) {
    timeStr = timeStr.toLowerCase().trim();
    if (timeStr.includes(':')) {
        const parts = timeStr.split(':');
        let seconds = 0;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[parts.length - 1 - i];
            if (/^\d+$/.test(part)) {
                seconds += parseInt(part, 10) * Math.pow(60, i);
            } else {
                return -1;
            }
        }
        return seconds * 1000;
    }

    const match = timeStr.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (match && (match[1] || match[2] || match[3])) {
        const h = parseInt(match[1] || 0, 10);
        const m = parseInt(match[2] || 0, 10);
        const s = parseInt(match[3] || 0, 10);
        return (h * 3600 + m * 60 + s) * 1000;
    }

    if (/^\d+$/.test(timeStr)) {
        return parseInt(timeStr, 10) * 1000;
    }

    return -1;
}

module.exports = [
    {
        name: 'pause',
        description: 'Pauses the currently playing track.',
        async execute(bot, message, args) {
            const player = await validate(bot, message);
            if (!player) return;

            if (player.paused) {
                return await message.reply("<:cross:1488582282020126881> The music is already paused! Use `.resume` to continue playing.");
            }

            await player.setPaused(true);
            if (player.current) {
                const info = player.current.info || player.current;
                await updateVcStatus(bot, player, `<:pause:1488582449100488876> Paused: ${info.title}`);
            }
            await message.reply("<:tick:1488582269298807024> **Paused the music.**");
        }
    },
    {
        name: 'resume',
        aliases: ['continue', 'unpause'],
        description: 'Resumes the currently paused track.',
        async execute(bot, message, args) {
            const player = await validate(bot, message);
            if (!player) return;

            if (!player.paused) {
                return await message.reply("<:cross:1488582282020126881> The music is already playing! Use `.pause` to pause it.");
            }

            await player.setPaused(false);
            if (player.current) {
                const info = player.current.info || player.current;
                await updateVcStatus(bot, player, `<:play:1488582462841028879> playing: ${info.title}`);
            }
            await message.reply("<:tick:1488582269298807024> **Resumed the music.**");
        }
    },
    {
        name: 'stop',
        description: 'Stops the music and clears the queue.',
        async execute(bot, message, args) {
            const player = await validate(bot, message, false);
            if (!player) return;

            player.store("manually_stopped", true);
            player.queue = [];
            await player.stopTrack();

            await updateVcStatus(bot, player, null);

            // Delete old NP messages
            const oldMsgId = player.fetch("np_message_id");
            const channelId = player.fetch("channel");
            if (oldMsgId && channelId) {
                try {
                    let channel = message.guild.channels.cache.get(channelId);
                    if (!channel) {
                        channel = await message.guild.channels.fetch(channelId).catch(() => null);
                    }
                    if (channel) {
                        const oldMsg = await channel.messages.fetch(oldMsgId).catch(() => null);
                        if (oldMsg) {
                            await oldMsg.delete().catch(() => {});
                        }
                    }
                } catch (e) {}
            }

            const oldVcMsgId = player.fetch("np_vc_message_id");
            const vcChannelId = player.connection.channelId;
            if (oldVcMsgId && vcChannelId) {
                try {
                    let vcChannel = message.guild.channels.cache.get(vcChannelId);
                    if (!vcChannel) {
                        vcChannel = await message.guild.channels.fetch(vcChannelId).catch(() => null);
                    }
                    if (vcChannel) {
                        const oldVcMsg = await vcChannel.messages.fetch(oldVcMsgId).catch(() => null);
                        if (oldVcMsg) {
                            await oldVcMsg.delete().catch(() => {});
                        }
                    }
                } catch (e) {}
            }

            player.store("np_message_id", null);
            player.store("np_vc_message_id", null);

            await message.reply("<:stop:1502013562300665977>  **Music stopped and queue cleared.**");
        }
    },
    {
        name: 'skip',
        aliases: ['s', 'next'],
        description: 'Skips the currently playing track.',
        async execute(bot, message, args) {
            const player = await validate(bot, message);
            if (!player) return;

            player.store("manually_skipped", true);
            await player.stopTrack();
            await message.reply("<:tick:1488582269298807024> **Skipped the current track.**");
        }
    },
    {
        name: 'volume',
        aliases: ['vol'],
        description: "Changes the player's volume (0-100).",
        async execute(bot, message, args) {
            const player = await validate(bot, message, false);
            if (!player) return;

            if (args[0] === undefined) {
                return await message.reply(`<:volume_high:1502013638251122789> **Current volume:** \`${player.volume ?? 80}%\``);
            }

            const vol = parseInt(args[0], 10);
            if (isNaN(vol) || vol < 0 || vol > 100) {
                return await message.reply("<:cross:1488582282020126881> Please provide a volume level between `0` and `100`.");
            }

            await player.setVolume(vol);
            await message.reply(`<:volume_high:1502013638251122789> **Volume set to:** \`${vol}%\``);
        }
    },
    {
        name: 'shuffle',
        description: 'Shuffles the current music queue.',
        async execute(bot, message, args) {
            const player = await validate(bot, message, false);
            if (!player) return;

            if (!player.queue || player.queue.length === 0) {
                return await message.reply("<:cross:1488582282020126881> The queue is empty! There is nothing to shuffle.");
            }
            if (player.queue.length < 2) {
                return await message.reply("<:cross:1488582282020126881> There are not enough tracks in the queue to shuffle.");
            }

            for (let i = player.queue.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [player.queue[i], player.queue[j]] = [player.queue[j], player.queue[i]];
            }

            await message.reply("<:tick:1488582269298807024> **Successfully shuffled the queue!**");
        }
    },
    {
        name: 'seek',
        aliases: ['ff', 'rewind'],
        description: 'Seeks to a specific position. Examples: `.seek 1m30s`, `.seek 1:30`, `.seek 90`',
        async execute(bot, message, args) {
            const time = args.join(' ');
            if (!time) {
                return await message.reply("<:cross:1488582282020126881> Please provide a time to seek to (e.g., `1m30s`, `1:30`, `90`).");
            }

            const player = await validate(bot, message);
            if (!player) return;

            const info = player.current?.info || player.current;
            if (!info) {
                return await message.reply("<:cross:1488582282020126881> Nothing is currently playing!");
            }

            if (info.isStream) {
                return await message.reply("<:cross:1488582282020126881> This track cannot be seeked (it might be a livestream)!");
            }

            const seekMs = parseTime(time);
            if (seekMs < 0) {
                return await message.reply("<:cross:1488582282020126881> Invalid time format! Please use formats like `1m30s`, `1:30`, or `90`.");
            }

            const duration = info.length || info.duration || 0;
            if (seekMs > duration) {
                return await message.reply(`<:cross:1488582282020126881> The track is only \`${formatTime(duration)}\` long!`);
            }

            await player.seekTo(seekMs);
            await message.reply(`<:tick:1488582269298807024> **Seeked to:** \`${formatTime(seekMs)}\``);
        }
    }
];
