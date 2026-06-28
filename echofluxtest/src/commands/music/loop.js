const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'loop',
    aliases: ['lp'],
    description: 'Sets the loop mode (Queue, Song, None).',
    async execute(bot, message, args) {
        if (!bot.lavalink) {
            return await message.reply("<:cross:1488582282020126881> Lavalink client is not initialized!");
        }

        const player = bot.lavalink.players.get(message.guild.id);
        if (!player) {
            return await message.reply("<:cross:1488582282020126881> No player found for this server.");
        }

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel || (player.connection && player.connection.channelId && String(voiceChannel.id) !== String(player.connection.channelId))) {
            return await message.reply("<:cross:1488582282020126881> You need to be in the same voice channel as me!");
        }

        const currentLoop = player.loop ?? 0;
        const loopSingleEmoji = bot.getEmoji('loop_single', '🔂');
        const loopQueueEmoji = bot.getEmoji('loop', '🔁');
        const cancelEmoji = bot.getEmoji('cancel', '<:cross:1488582282020126881>');

        let currentStatus = "None";
        if (currentLoop === 1) {
            currentStatus = `${loopSingleEmoji} Song`;
        } else if (currentLoop === 2) {
            currentStatus = `${loopQueueEmoji} Queue`;
        }

        const embed = new EmbedBuilder()
            .setTitle("Loop Control Room")
            .setDescription(`**Current Mode**: ${currentStatus}\n\nChoose your loop type below:`)
            .setColor(0x00d2ff);

        if (bot.user) {
            embed.setFooter({
                text: "EchoFluxTest Music",
                iconURL: bot.user.displayAvatarURL()
            });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('loop_queue')
                .setLabel('Queue Loop')
                .setStyle(ButtonStyle.Primary)
                .setEmoji(loopQueueEmoji),
            new ButtonBuilder()
                .setCustomId('loop_song')
                .setLabel('Song Loop')
                .setStyle(ButtonStyle.Primary)
                .setEmoji(loopSingleEmoji),
            new ButtonBuilder()
                .setCustomId('loop_none')
                .setLabel('None')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(cancelEmoji)
        );

        const msg = await message.reply({ embeds: [embed], components: [row] });

        const collector = msg.createMessageComponentCollector({
            filter: (i) => i.user.id === message.author.id && i.customId.startsWith('loop_'),
            time: 60000
        });

        collector.on('collect', async (interaction) => {
            let desc = "";
            if (interaction.customId === 'loop_queue') {
                player.loop = 2;
                desc = "Looping the **Entire Queue**.";
            } else if (interaction.customId === 'loop_song') {
                player.loop = 1;
                desc = "Looping the **Current Song**.";
            } else if (interaction.customId === 'loop_none') {
                player.loop = 0;
                desc = "Looping is now **Disabled**.";
            }

            const resEmbed = new EmbedBuilder()
                .setTitle("Loop Mode Set")
                .setDescription(desc)
                .setColor(0x00d2ff);

            await interaction.update({ embeds: [resEmbed], components: [] }).catch(() => {});
            collector.stop();
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
            }
        });
    }
};
