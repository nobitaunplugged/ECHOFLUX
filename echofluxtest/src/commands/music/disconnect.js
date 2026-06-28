const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const dbBridge = require('../../utils/dbBridge');

async function cleanupPlayer(bot, player, message) {
    player.store("manually_stopped", true);
    player.queue = [];
    await player.stopTrack();

    // Clear voice channel status
    const vcId = player.connection.channelId;
    if (vcId) {
        try {
            await bot.rest.put(`/channels/${vcId}/voice-status`, {
                body: { status: "" }
            });
        } catch (e) {}
    }

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
}

module.exports = {
    name: 'disconnect',
    aliases: ['dc', 'leave'],
    description: 'Disconnects the bot from its current voice channel.',
    async execute(bot, message, args) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return await message.reply("<:cross:1488582282020126881> You need to be in a voice channel to use this command!");
        }

        if (!bot.lavalink) {
            return await message.reply("<:cross:1488582282020126881> Lavalink client is not initialized!");
        }

        const player = bot.lavalink.players.get(message.guild.id);
        if (!player || !player.connection || !player.connection.channelId) {
            return await message.reply("<:cross:1488582282020126881> I am not connected to a voice channel!");
        }

        if (String(voiceChannel.id) !== String(player.connection.channelId)) {
            return await message.reply("<:cross:1488582282020126881> You need to be in my voice channel to disconnect me!");
        }

        // Check 24/7 status from database
        const is247 = !!dbBridge.get247Channel(String(message.guild.id));

        if (is247) {
            if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                const embed = new EmbedBuilder()
                    .setDescription("♾️ **24/7 mode is currently active.**\nI will not leave the voice channel. You need `Manage Server` permissions to disconnect me and turn off 24/7 mode.")
                    .setColor(0x00d2ff);
                return await message.reply({ embeds: [embed] });
            }

            // Has permissions, turn off 24/7 in database
            await dbBridge.set247Channel(String(message.guild.id), dbBridge.get247Channel(String(message.guild.id)), false);

            await cleanupPlayer(bot, player, message);
            await bot.lavalink.leaveVoiceChannel(message.guild.id);

            const embed = new EmbedBuilder()
                .setDescription("<:exit:1502013119390810282> **Leaving VC. 24/7 mode has been turned off.**")
                .setColor(0x00d2ff);
            return await message.reply({ embeds: [embed] });
        }

        // Not 24/7 mode, normal disconnect
        await cleanupPlayer(bot, player, message);
        await bot.lavalink.leaveVoiceChannel(message.guild.id);
        await message.reply("<:exit:1502013119390810282> **Disconnected from the voice channel.**");
    }
};
