module.exports = {
    name: 'join',
    aliases: ['j', 'summon'],
    description: 'Summons the bot to your current voice channel.',
    async execute(bot, message, args) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return await message.reply("<:cross:1488582282020126881> You need to be in a voice channel to use this command!");
        }

        if (!bot.lavalink) {
            return await message.reply("<:cross:1488582282020126881> Lavalink client is not initialized!");
        }

        const player = bot.lavalink.players.get(message.guild.id);
        if (player && player.connection && player.connection.channelId) {
            if (String(player.connection.channelId) === String(voiceChannel.id)) {
                return await message.reply("<:cross:1488582282020126881> I am already in your voice channel!");
            } else {
                return await message.reply("<:cross:1488582282020126881> I am already connected to another voice channel!");
            }
        }

        const newPlayer = await bot.lavalink.joinVoiceChannel({
            guildId: message.guild.id,
            channelId: voiceChannel.id,
            shardId: message.guild.shardId,
            deaf: true
        });

        const { registerPlayerEvents } = require('../../events/playerLifecycle');
        registerPlayerEvents(bot, newPlayer);

        newPlayer.store('channel', message.channel.id);
        newPlayer.textChannelId = message.channel.id;

        await message.reply(`<:tick:1488582269298807024> Joined **${voiceChannel.name}**`);
    }
};
