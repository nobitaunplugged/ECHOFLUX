const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function syncPlayerEmbed(bot, player) {
    const channelId = player.fetch('channel');
    const msgId = player.fetch('np_message_id');
    if (channelId && msgId) {
        try {
            const channel = bot.channels.cache.get(channelId);
            if (channel) {
                const msg = await channel.messages.fetch(msgId);
                const { getPlayerEmbed, getPlayerComponents } = require('../../utils/playerEmbed');
                await msg.edit({
                    embeds: [getPlayerEmbed(player, bot)],
                    components: getPlayerComponents(player, bot)
                });
            }
        } catch (e) {}
    }
}

function generateEmbed(bot, player) {
    const current = player.fetch('autoplay', false);
    const status = current ? "<:tick:1488582269298807024> **Enabled**" : "<:cross:1488582282020126881> **Disabled**";

    const embed = new EmbedBuilder()
        .setTitle("<:song:1488582503630377113> Infinite Music: Autoplay")
        .setDescription(
            `Status: ${status}\n\n` +
            `Autoplay ensures your music session never stops. When your queue ends, ` +
            `EchoFluxTest will automatically find and play related tracks based on the last played artist.\n\n` +
            `<:info:1488582323304796322> **Why use Autoplay?**\n` +
            `• Discover new music naturally\n` +
            `• Uninterrupted playback for hours\n` +
            `• Personalized recommendations`
        )
        .setColor(current ? 0x00d2ff : 0xCCCCCC);

    if (bot.user) {
        embed.setFooter({
            text: "EchoFluxTest Music • Personalized Experience",
            iconURL: bot.user.displayAvatarURL()
        });
    }

    return embed;
}

function getButtons(player) {
    const current = player.fetch('autoplay', false);

    const btnEnable = new ButtonBuilder()
        .setCustomId('ap_enable')
        .setLabel('Enable')
        .setStyle(current ? ButtonStyle.Success : ButtonStyle.Secondary);

    const btnDisable = new ButtonBuilder()
        .setCustomId('ap_disable')
        .setLabel('Disable')
        .setStyle(!current ? ButtonStyle.Danger : ButtonStyle.Secondary);

    return new ActionRowBuilder().addComponents(btnEnable, btnDisable);
}

module.exports = {
    name: 'autoplay',
    aliases: ['ap'],
    description: 'Interactive menu to toggle music autoplay.',
    async execute(bot, message, args) {
        if (!bot.lavalink) {
            return await message.reply("<:cross:1488582282020126881> Lavalink client is not initialized!");
        }

        const player = bot.lavalink.players.get(message.guild.id);
        if (!player) {
            return await message.reply("<:cross:1488582282020126881> No player found for this server. Start playing a song first!");
        }

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel || (player.connection && player.connection.channelId && String(voiceChannel.id) !== String(player.connection.channelId))) {
            return await message.reply("<:cross:1488582282020126881> You need to be in the same voice channel as me to use this.");
        }

        const embed = generateEmbed(bot, player);
        const buttons = getButtons(player);

        const msg = await message.reply({ embeds: [embed], components: [buttons] });

        const collector = msg.createMessageComponentCollector({
            filter: (i) => i.user.id === message.author.id && i.customId.startsWith('ap_'),
            time: 120000
        });

        collector.on('collect', async (interaction) => {
            const current = player.fetch('autoplay', false);

            if (interaction.customId === 'ap_enable') {
                if (current) {
                    return await interaction.reply({ content: "Autoplay is already enabled!", ephemeral: true });
                }
                player.store('autoplay', true);
            } else if (interaction.customId === 'ap_disable') {
                if (!current) {
                    return await interaction.reply({ content: "Autoplay is already disabled!", ephemeral: true });
                }
                player.store('autoplay', false);
            }

            await interaction.update({
                embeds: [generateEmbed(bot, player)],
                components: [getButtons(player)]
            }).catch(() => {});

            syncPlayerEmbed(bot, player).catch(() => {});
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                // Disable components
                const disabledRow = new ActionRowBuilder().addComponents(
                    getButtons(player).components.map(btn => btn.setDisabled(true))
                );
                await msg.edit({ embeds: [generateEmbed(bot, player)], components: [disabledRow] }).catch(() => {});
            }
        });
    }
};
