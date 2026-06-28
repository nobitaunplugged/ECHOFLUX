const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'enhance',
    description: 'Optimize for best audio quality.',
    async execute(bot, message, args) {
        try {
            // --- Voice & Player Checks ---
            const voiceChannel = message.member.voice?.channel;
            if (!voiceChannel) {
                return message.reply("You must be in a voice channel to use this.");
            }

            const player = bot.lavalink.players.get(message.guild.id);
            if (!player || !player.connection.channelId || !player.current) {
                return message.reply("The bot is not currently playing anything.");
            }

            if (String(voiceChannel.id) !== String(player.connection.channelId)) {
                return message.reply("You must be in the same voice channel as the bot.");
            }

            // --- Bitrate Logic ---
            const tier = message.guild.premiumTier;
            let bitrate = 64000;
            if (tier === 0 || tier === 'NONE') {
                bitrate = 96000;
            } else if (tier === 1 || tier === 'TIER_1') {
                bitrate = 128000;
            } else if (tier === 2 || tier === 'TIER_2') {
                bitrate = 256000;
            } else if (tier === 3 || tier === 'TIER_3') {
                bitrate = 384000;
            }

            let res = "";
            try {
                await voiceChannel.setBitrate(bitrate);
                res = `<:tick:1488582269298807024>  Set voice channel bitrate to **${bitrate / 1000}kbps**`;
            } catch (e) {
                if (e.code === 50013 || e.message?.toLowerCase().includes("missing permission")) {
                    res = "<:cross:1488582282020126881> *Please set the vc bitrate to max manually*";
                } else {
                    res = "<:cross:1488582282020126881> *Failed to modify voice channel.*";
                }
            }

            // --- Equalizer Logic ---
            // Build a Harman Target 2019-style EQ (bands 0-14)
            const bands = [
                { band: 0, gain: 0.05 * 0.5 },
                { band: 1, gain: 0.06 * 0.5 },
                { band: 2, gain: 0.12 * 0.5 },
                { band: 3, gain: 0.02 * 0.5 },
                { band: 4, gain: 0.125 * 0.5 },
                { band: 5, gain: 0.025 * 0.5 },
                { band: 6, gain: -0.05 * 0.5 },
                { band: 7, gain: -0.1 * 0.5 },
                { band: 8, gain: -0.05 * 0.5 },
                { band: 9, gain: 0.02 * 0.5 },
                { band: 10, gain: 0.01 * 0.5 },
                { band: 11, gain: 0.065 * 0.5 },
                { band: 12, gain: 0.1 * 0.5 },
                { band: 13, gain: 0.14 * 0.5 },
                { band: 14, gain: 0.08 * 0.5 }
            ];

            await player.setFilters({ equalizer: bands });

            // Set volume to 80% (which in Shoukaku is 80)
            try {
                await player.setVolume(80);
            } catch (volErr) {
                console.error("Failed to set volume:", volErr);
            }

            // --- Message / Embed Logic ---
            const initialEmbed = new EmbedBuilder()
                .setDescription("⚙️ **Adjusting EchoFluxTest for a richer and fuller sound !**")
                .setColor(0x00d2ff);

            const msg = await message.reply({ embeds: [initialEmbed] });

            // Wait 2 seconds
            await new Promise(resolve => setTimeout(resolve, 2000));

            const finalDesc = `${res}\n` +
                `<:tick:1488582269298807024>  Set vol to **80%** to reduce distortions\n` +
                `<:tick:1488582269298807024>  Optimized params for best experience\n` +
                `<:tick:1488582269298807024>  Audio spectrum - **Harman target 2019**\n`;

            const finalEmbed = new EmbedBuilder()
                .setDescription(finalDesc)
                .setColor(0x00d2ff);

            try {
                await msg.edit({ embeds: [finalEmbed] });
            } catch (err) {
                // Catch potential errors if message was deleted
            }
        } catch (e) {
            await message.reply(`<:cross:1488582282020126881> Enhance failed: \`${e.name}: ${e.message}\``).catch(() => {});
        }
    }
};
