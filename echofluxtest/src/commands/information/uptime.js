const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getEmbedColor } = require('../../utils/embedHelpers');

function getUptimeStr(startTimeMs) {
    const uptimeSeconds = Math.floor((Date.now() - startTimeMs) / 1000);
    const d = Math.floor(uptimeSeconds / (3600 * 24));
    const h = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
    const m = Math.floor((uptimeSeconds % 3600) / 60);
    const s = Math.floor(uptimeSeconds % 60);

    const pad = (n) => String(n).padStart(2, '0');
    if (d > 0) {
        return `${d} day${d > 1 ? 's' : ''}, ${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

module.exports = {
    name: 'uptime',
    aliases: ['up'],
    description: "Shows how long the bot has been online.",
    async execute(bot, message, args) {
        // Fallback if bot.uptimeStart is not set
        const uptimeStart = bot.uptimeStart || Date.now();

        const createEmbed = () => {
            const embed = new EmbedBuilder()
                .setTitle("<:vote:1502014001238773830> Bot Uptime")
                .setDescription(
                    `**Uptime:** \`${getUptimeStr(uptimeStart)}\`\n` +
                    `**Started:** <t:${Math.floor(uptimeStart / 1000)}:R>`
                )
                .setColor(getEmbedColor());

            embed.setFooter({
                text: `Requested by ${message.author.username}`,
                iconURL: message.author.displayAvatarURL()
            });
            return embed;
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('uptime_refresh')
                .setLabel('Refresh')
                .setStyle(ButtonStyle.Primary)
                .setEmoji(bot.getEmoji("refresh", "<:loop:1502012311257481388>")),
            new ButtonBuilder()
                .setCustomId('uptime_close')
                .setLabel('Close')
                .setStyle(ButtonStyle.Danger)
                .setEmoji(bot.getEmoji("close", "<:cross:1488582282020126881>"))
        );

        const msg = await message.reply({ embeds: [createEmbed()], components: [row] });

        const filter = (interaction) => {
            if (interaction.user.id === message.author.id) {
                return true;
            }
            interaction.reply({
                content: `<:cross:1488582282020126881> Only **${message.author.username}** can use this.`,
                ephemeral: true
            }).catch(() => {});
            return false;
        };

        const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'uptime_refresh') {
                await interaction.update({ embeds: [createEmbed()], components: [row] });
            } else if (interaction.customId === 'uptime_close') {
                const disabledRow = new ActionRowBuilder().addComponents(
                    row.components.map(btn => ButtonBuilder.from(btn).setDisabled(true))
                );
                await interaction.update({ embeds: [createEmbed()], components: [disabledRow] });
                collector.stop();
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                const disabledRow = new ActionRowBuilder().addComponents(
                    row.components.map(btn => ButtonBuilder.from(btn).setDisabled(true))
                );
                msg.edit({ embeds: [createEmbed()], components: [disabledRow] }).catch(() => {});
            }
        });
    }
};
