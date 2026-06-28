const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

async function apply8dFilters(player) {
    await player.clearFilters();

    const eqBands = [
        { band: 0, gain: 0.25 },
        { band: 1, gain: 0.15 },
        { band: 2, gain: 0.05 },
        { band: 3, gain: -0.05 },
        { band: 6, gain: -0.05 },
        { band: 12, gain: 0.05 },
        { band: 13, gain: 0.10 },
        { band: 14, gain: 0.15 }
    ];

    await player.setFilters({
        equalizer: eqBands,
        rotation: { rotationHz: 0.015 },
        channelMix: { leftToLeft: 0.8, leftToRight: 0.2, rightToLeft: 0.2, rightToRight: 0.8 },
        echo: { delay: 0.01, decay: 0.1, feedback: 0.1 },
        reverb: { roomSize: 0.7, dampening: 0.7, wetLevel: 0.15, dryLevel: 0.85, stereoDepth: 1.0 }
    });

    player.store('is8DEnabled', true);
    player.store('is16DEnabled', false);
}

async function apply16dFilters(player) {
    await player.clearFilters();

    const eqBands = [
        { band: 0, gain: 0.30 },
        { band: 1, gain: 0.20 },
        { band: 2, gain: 0.10 },
        { band: 3, gain: -0.05 },
        { band: 6, gain: -0.05 },
        { band: 11, gain: 0.05 },
        { band: 13, gain: 0.15 },
        { band: 14, gain: 0.25 }
    ];

    await player.setFilters({
        equalizer: eqBands,
        rotation: { rotationHz: 0.02 },
        channelMix: { leftToLeft: 0.9, leftToRight: 0.1, rightToLeft: 0.1, rightToRight: 0.9 },
        tremolo: { frequency: 2.0, depth: 0.15 },
        echo: { delay: 0.02, decay: 0.15, feedback: 0.2 },
        reverb: { roomSize: 0.85, dampening: 0.6, wetLevel: 0.25, dryLevel: 0.75, stereoDepth: 1.0 }
    });

    player.store('is16DEnabled', true);
    player.store('is8DEnabled', false);
}

async function clearAllFilters(player) {
    await player.clearFilters();
    player.store('is8DEnabled', false);
    player.store('is16DEnabled', false);
}

function getDolbyComponents(player) {
    const is8d = player.fetch('is8DEnabled', false);
    const is16d = player.fetch('is16DEnabled', false);

    const btn8d = new ButtonBuilder()
        .setCustomId('dolby_8d')
        .setLabel('8D Filter')
        .setStyle(is8d ? ButtonStyle.Success : ButtonStyle.Secondary);

    const btn16d = new ButtonBuilder()
        .setCustomId('dolby_16d')
        .setLabel('16D Filter')
        .setStyle(is16d ? ButtonStyle.Success : ButtonStyle.Secondary);

    const btnDisable = new ButtonBuilder()
        .setCustomId('dolby_disable')
        .setLabel('Disable All')
        .setStyle(ButtonStyle.Danger);

    return [new ActionRowBuilder().addComponents(btn8d, btn16d, btnDisable)];
}

function createEmbed(bot, desc) {
    return new EmbedBuilder()
        .setDescription(desc)
        .setColor(0x00d2ff)
        .setThumbnail(bot.user.displayAvatarURL())
        .setFooter({ text: "Dolby Filters • © Powered By Gacky & Matrix Studio", iconURL: bot.user.displayAvatarURL() });
}

module.exports = {
    name: 'dolby',
    aliases: ['d', 'dol'],
    description: 'Manages 8D and 16D audio filters for the current playback.',
    async execute(bot, message, args) {
        if (!message.member.voice || !message.member.voice.channel) {
            return message.reply("You need to be in a voice channel to use this command.");
        }

        const player = bot.lavalink.players.get(message.guild.id);
        if (!player || !player.connection.channelId) {
            const embed = new EmbedBuilder()
                .setDescription("<:cross:1488582282020126881> The player is not ready or cannot apply filters at this moment.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**")
                .setColor(0x00d2ff);
            embed.setFooter({ text: "Dolby Filters • © Powered By Gacky & Matrix Studio", iconURL: bot.user.displayAvatarURL() });
            return message.reply({ embeds: [embed] });
        }

        const is8dEnabled = player.fetch('is8DEnabled', false);
        const is16dEnabled = player.fetch('is16DEnabled', false);

        const subcommand = args[0] ? args[0].toLowerCase() : "";
        const filterType = args[1] ? args[1].toLowerCase() : "";

        if (!subcommand) {
            const embed = new EmbedBuilder()
                .setTitle("<:DolbyAtmos:1383738915726426172> **Dolby Audio Control**")
                .setDescription("Select a Dolby filter below to apply it to the current playback.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**")
                .setColor(0x00d2ff)
                .setThumbnail(bot.user.displayAvatarURL())
                .setFooter({ text: "Dolby Filters • © Powered By Gacky & Matrix Studio", iconURL: bot.user.displayAvatarURL() });

            const response = await message.reply({
                embeds: [embed],
                components: getDolbyComponents(player)
            });

            const collector = response.createMessageComponentCollector({
                filter: (i) => {
                    if (i.user.id !== message.author.id) {
                        i.reply({ content: "You cannot use this menu.", ephemeral: true }).catch(() => { });
                        return false;
                    }
                    return true;
                },
                time: 120000
            });

            collector.on('collect', async (interaction) => {
                const customId = interaction.customId;
                let desc = "";

                if (customId === 'dolby_8d') {
                    const is8d = player.fetch('is8DEnabled', false);
                    if (is8d) {
                        await clearAllFilters(player);
                        desc = "<:cross:1488582282020126881> Dolby 8D filter has been **disabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**";
                    } else {
                        await apply8dFilters(player);
                        desc = "<:tick:1488582269298807024> Dolby 8D filter has been **enabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**";
                    }
                } else if (customId === 'dolby_16d') {
                    const is16d = player.fetch('is16DEnabled', false);
                    if (is16d) {
                        await clearAllFilters(player);
                        desc = "<:cross:1488582282020126881> Dolby 16D filter has been **disabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**";
                    } else {
                        await apply16dFilters(player);
                        desc = "<:tick:1488582269298807024> Dolby 16D filter has been **enabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**";
                    }
                } else if (customId === 'dolby_disable') {
                    const is8d = player.fetch('is8DEnabled', false);
                    const is16d = player.fetch('is16DEnabled', false);
                    if (!is8d && !is16d) {
                        desc = "<:error:1383738941995020446> No Dolby filter is currently active.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**";
                    } else {
                        await clearAllFilters(player);
                        desc = "<:cross:1488582282020126881> All Dolby filters have been **disabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**";
                    }
                }

                const updatedEmbed = createEmbed(bot, desc);
                await interaction.update({
                    embeds: [updatedEmbed],
                    components: getDolbyComponents(player)
                });
            });

            collector.on('end', async () => {
                const disabledRow = getDolbyComponents(player)[0];
                disabledRow.components.forEach(btn => btn.setDisabled(true));
                try {
                    await response.edit({ components: [disabledRow] });
                } catch (e) { }
            });

            return response;
        }

        if (subcommand === '8d') {
            if (!filterType) {
                const embed = new EmbedBuilder()
                    .setTitle("8D Filter Status")
                    .setDescription(
                        is8dEnabled
                            ? "<:tick:1488582269298807024>  Dolby 8D filter is currently **enabled**. Use `8D disable` to disable.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**"
                            : "<:cross:1488582282020126881> Dolby 8D filter is currently **disabled**. Use `8D enable` to enable.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**"
                    )
                    .setColor(is8dEnabled ? 0x00d2ff : 0xFF0000)
                    .setThumbnail(bot.user.displayAvatarURL())
                    .setFooter({ text: "Dolby Filters • © Powered By Gacky & Matrix Studio", iconURL: bot.user.displayAvatarURL() });
                return message.reply({ embeds: [embed] });
            }

            if (filterType === 'enable') {
                if (is8dEnabled) {
                    const embed = createEmbed(bot, "<:stop:1488582422646751422> Dolby 8D filter is already **enabled**.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**");
                    return message.reply({ embeds: [embed] });
                }

                await apply8dFilters(player);
                const embed = createEmbed(bot, "<:tick:1488582269298807024>  Dolby 8D filter has been **enabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**");
                return message.reply({ embeds: [embed] });
            }

            if (filterType === 'disable') {
                if (!is8dEnabled) {
                    const embed = createEmbed(bot, "<:stop:1488582422646751422> Dolby 8D filter is already **disabled**.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**");
                    return message.reply({ embeds: [embed] });
                }

                if (is16dEnabled) {
                    await apply16dFilters(player);
                } else {
                    await clearAllFilters(player);
                }

                const embed = createEmbed(bot, "<:cross:1488582282020126881> Dolby 8D filter has been **disabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**");
                return message.reply({ embeds: [embed] });
            }

            const embed = createEmbed(bot, "<:cross:1488582282020126881> Invalid Dolby 8D subcommand. Use `Dolby 8D enable` or `Dolby 8D disable`.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**");
            return message.reply({ embeds: [embed] });
        }

        if (subcommand === '16d') {
            if (!filterType) {
                const embed = new EmbedBuilder()
                    .setTitle("16D Filter Status")
                    .setDescription(
                        is16dEnabled
                            ? "<:tick:1488582269298807024>  Dolby 16D filter is currently **enabled**. Use `16D disable` to disable.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**"
                            : "<:cross:1488582282020126881> Dolby 16D filter is currently **disabled**. Use `16D enable` to enable.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**"
                    )
                    .setColor(is16dEnabled ? 0x00d2ff : 0xFF0000)
                    .setThumbnail(bot.user.displayAvatarURL())
                    .setFooter({ text: "Dolby Filters • © Powered By Gacky & Matrix Studio", iconURL: bot.user.displayAvatarURL() });
                return message.reply({ embeds: [embed] });
            }

            if (filterType === 'enable') {
                if (is16dEnabled) {
                    const embed = createEmbed(bot, "<:stop:1488582422646751422> Dolby 16D filter is already **enabled**.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**");
                    return message.reply({ embeds: [embed] });
                }

                await apply16dFilters(player);
                const embed = createEmbed(bot, "<:tick:1488582269298807024>  Dolby 16D filter has been **enabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**");
                return message.reply({ embeds: [embed] });
            }

            if (filterType === 'disable') {
                if (!is16dEnabled) {
                    const embed = createEmbed(bot, "<:stop:1488582422646751422> Dolby 16D filter is already **disabled**.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**");
                    return message.reply({ embeds: [embed] });
                }

                if (is8dEnabled) {
                    await apply8dFilters(player);
                } else {
                    await clearAllFilters(player);
                }

                const embed = createEmbed(bot, "<:cross:1488582282020126881> Dolby 16D filter has been **disabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**");
                return message.reply({ embeds: [embed] });
            }

            const embed = createEmbed(bot, "<:cross:1488582282020126881> Invalid Dolby 16D subcommand. Use `Dolby 16D enable` or `Dolby 16D disable`.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**");
            return message.reply({ embeds: [embed] });
        }

        if (subcommand === 'disable') {
            if (!is8dEnabled && !is16dEnabled) {
                const embed = createEmbed(bot, "<:error:1383738941995020446> No Dolby filter is currently active.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**");
                return message.reply({ embeds: [embed] });
            }

            await clearAllFilters(player);
            const embed = createEmbed(bot, "<:cross:1488582282020126881> All Dolby filters have been **disabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**");
            return message.reply({ embeds: [embed] });
        }

        // Fallback to Interactive Base
        const embed = new EmbedBuilder()
            .setTitle("<:DolbyAtmos:1383738915726426172> **Dolby Audio Control**")
            .setDescription("Select a Dolby filter below to apply it to the current playback.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**")
            .setColor(0x00d2ff)
            .setThumbnail(bot.user.displayAvatarURL())
            .setFooter({ text: "Dolby Filters • © Powered By Gacky & Matrix Studio", iconURL: bot.user.displayAvatarURL() });

        const response = await message.reply({
            embeds: [embed],
            components: getDolbyComponents(player)
        });

        const collector = response.createMessageComponentCollector({
            filter: (i) => {
                if (i.user.id !== message.author.id) {
                    i.reply({ content: "You cannot use this menu.", ephemeral: true }).catch(() => { });
                    return false;
                }
                return true;
            },
            time: 120000
        });

        collector.on('collect', async (interaction) => {
            const customId = interaction.customId;
            let desc = "";

            if (customId === 'dolby_8d') {
                const is8d = player.fetch('is8DEnabled', false);
                if (is8d) {
                    await clearAllFilters(player);
                    desc = "<:cross:1488582282020126881> Dolby 8D filter has been **disabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**";
                } else {
                    await apply8dFilters(player);
                    desc = "<:tick:1488582269298807024> Dolby 8D filter has been **enabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**";
                }
            } else if (customId === 'dolby_16d') {
                const is16d = player.fetch('is16DEnabled', false);
                if (is16d) {
                    await clearAllFilters(player);
                    desc = "<:cross:1488582282020126881> Dolby 16D filter has been **disabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**";
                } else {
                    await apply16dFilters(player);
                    desc = "<:tick:1488582269298807024> Dolby 16D filter has been **enabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**";
                }
            } else if (customId === 'dolby_disable') {
                const is8d = player.fetch('is8DEnabled', false);
                const is16d = player.fetch('is16DEnabled', false);
                if (!is8d && !is16d) {
                    desc = "<:error:1383738941995020446> No Dolby filter is currently active.\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**";
                } else {
                    await clearAllFilters(player);
                    desc = "<:cross:1488582282020126881> All Dolby filters have been **disabled**!\n\n**__Note: To Experience This Filter Headphones Are Recommended.__**";
                }
            }

            const updatedEmbed = createEmbed(bot, desc);
            await interaction.update({
                embeds: [updatedEmbed],
                components: getDolbyComponents(player)
            });
        });

        collector.on('end', async () => {
            const disabledRow = getDolbyComponents(player)[0];
            disabledRow.components.forEach(btn => btn.setDisabled(true));
            try {
                await response.edit({ components: [disabledRow] });
            } catch (e) { }
        });

        return response;
    }
};
