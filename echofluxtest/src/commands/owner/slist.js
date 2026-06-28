const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    name: 'slist',
    aliases: ['serverlist'],
    description: 'List all servers the bot is in. (Owner only)',
    async execute(bot, message, args) {
        const isOwner = await bot.isOwner(message.author);
        if (!isOwner) return;

        const guilds = [...bot.guilds.cache.values()].sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0));

        if (guilds.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle("Server List")
                .setDescription("The bot is not in any servers.")
                .setColor(0x00d2ff);
            return message.reply({ embeds: [embed] });
        }

        const itemsPerPage = 10;
        const maxPages = Math.ceil(guilds.length / itemsPerPage);
        let currentPage = 0;

        function getRow(page, totalPages) {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('help_first')
                    .setEmoji(bot.getEmoji("first", "⏪"))
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentIndex === 0),
                new ButtonBuilder()
                    .setCustomId('help_prev')
                    .setEmoji(bot.getEmoji("previous", "◀️"))
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentIndex === 0),
                new ButtonBuilder()
                    .setCustomId('help_stop')
                    .setEmoji(bot.getEmoji("bin", "<:stop:1502013562300665977>"))
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('help_next')
                    .setEmoji(bot.getEmoji("skip", "▶️"))
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentIndex === pages.length - 1),
                new ButtonBuilder()
                    .setCustomId('help_last')
                    .setEmoji(bot.getEmoji("last", "⏭️"))
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentIndex === pages.length - 1)
            );
        }

        function generateEmbed(page, totalPages) {
            const startIdx = page * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageGuilds = guilds.slice(startIdx, endIdx);

            const embedColor = process.env.EMBED_COLOR ? parseInt(process.env.EMBED_COLOR.replace('#', ''), 16) : 0x5865F2;

            const embed = new EmbedBuilder()
                .setTitle(`<:owner:1502013291067609179> Server List (${guilds.length} total servers)`)
                .setColor(embedColor);

            const serverInfo = [];
            pageGuilds.forEach((guild, idx) => {
                const memberCount = guild.memberCount || 0;
                serverInfo.push(`**${startIdx + idx + 1}.** ${guild.name} \`(${guild.id})\` — 👥 **${memberCount} members**`);
            });

            embed.setDescription(
                `> **Listing all servers where EchoFluxTest is active.**\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                serverInfo.join("\n") + `\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━`
            );

            embed.setFooter({
                text: `Page ${page + 1}/${totalPages} | EchoFluxTest | © By Gacky & Matrix Studio`,
                iconURL: process.env.MATRIXDEV_LOGO || ""
            });

            if (bot.user.avatar) {
                embed.setThumbnail(bot.user.displayAvatarURL());
            }

            embed.setAuthor({
                name: message.author.username,
                iconURL: message.author.displayAvatarURL()
            });

            return embed;
        }

        const embed = generateEmbed(currentPage, maxPages);
        const row = getRow(currentPage, maxPages);
        const msg = await message.reply({ embeds: [embed], components: [row] });

        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000
        });

        collector.on('collect', async interaction => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ content: "<:cross:1488582282020126881> This menu is not for you!", ephemeral: true });
            }

            if (interaction.customId === 'slist_first') {
                currentPage = 0;
                await interaction.update({ embeds: [generateEmbed(currentPage, maxPages)], components: [getRow(currentPage, maxPages)] });
            } else if (interaction.customId === 'slist_prev') {
                currentPage = Math.max(0, currentPage - 1);
                await interaction.update({ embeds: [generateEmbed(currentPage, maxPages)], components: [getRow(currentPage, maxPages)] });
            } else if (interaction.customId === 'slist_next') {
                currentPage = Math.min(maxPages - 1, currentPage + 1);
                await interaction.update({ embeds: [generateEmbed(currentPage, maxPages)], components: [getRow(currentPage, maxPages)] });
            } else if (interaction.customId === 'slist_last') {
                currentPage = maxPages - 1;
                await interaction.update({ embeds: [generateEmbed(currentPage, maxPages)], components: [getRow(currentPage, maxPages)] });
            } else if (interaction.customId === 'slist_stop') {
                collector.stop('closed');
                await msg.delete().catch(() => { });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'closed') return;
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('slist_first').setEmoji(bot.getEmoji("first", "⏪")).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('slist_prev').setEmoji(bot.getEmoji("arrow_left", "◀️")).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('slist_stop').setEmoji(bot.getEmoji("bin", "<:stop:1502013562300665977>")).setStyle(ButtonStyle.Danger).setDisabled(true),
                new ButtonBuilder().setCustomId('slist_next').setEmoji(bot.getEmoji("arrow_right", "▶️")).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('slist_last').setEmoji(bot.getEmoji("last", "⏩")).setStyle(ButtonStyle.Secondary).setDisabled(true)
            );
            await msg.edit({ embeds: [generateEmbed(currentPage, maxPages)], components: [disabledRow] }).catch(() => { });
        });
    }
};
