const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getEmbedColor } = require('../../utils/embedHelpers');

const specifiedCats = ["config", "favourites", "filter", "information", "lyrics", "music", "playlists", "sportify", "premium", "report"];

const commandTexts = {
    music: "`autoplay`, `dc`, `join`, `loop`, `lyrics`, `nowplaying`, `pause`, `play`, `queue`, `queueadd`, `queueremove`, `resume`, `search`, `seek`, `shuffle`, `skip`, `stop`, `volume`",
    filter: "`enhance`",
    playlists: "`playlist`",
    favourites: "`fav add`, `fav clear`, `fav list`, `fav remove`",
    lyrics: "`lyrics`, `lyrics <song name>`",
    sportify: "**<:vote:1502014001238773830> Under Development / Coming Soon (BETA)**",
    config: "`247`, `ignore`, `prefix`",
    information: "`help`, `invite`, `ping`, `serverinfo`, `stats`, `support`, `uptime`, `userinfo`, `vote`",
    premium: "`custombot`, `premium`",
    report: "`report`"
};

const categoryEmojis = {
    music: "<:folder:1502013152961761342>",
    filter: "<:folder:1502013152961761342>",
    playlists: "<:folder:1502013152961761342>",
    sportify: "<:song:1488582503630377113>",
    admin: "<:admin:1502013035160797434>",
    config: "<:folder:1502013152961761342>",
    information: "<:folder:1502013152961761342>",
    owner: "👑",
    premium: "<:folder:1502013152961761342>",
    report: "<:folder:1502013152961761342>",
    favourites: "<:heart:1507353921641779252>",
    lyrics: "<:lyrics:1507601925321920583>"
};

module.exports = {
    name: 'help',
    aliases: ['h'],
    description: "Shows the bot help menu.",
    async execute(bot, message, args) {
        const supportLink = process.env.SUPPORT_INVITE || "";
        const websiteLink = process.env.WEBSITE || "";
        const botId = process.env.BOT_ID || bot.user.id;
        const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${botId}&permissions=8&scope=bot`;
        const voteLink = `https://top.gg/bot/${botId}/vote`;

        const dbBridge = require('../../utils/dbBridge');
        const guildId = message.guild.id;
        const defaultPrefix = ".";

        const createHomeEmbed = () => {
            const prefix = dbBridge.getPrefix(guildId, defaultPrefix);
            const embed = new EmbedBuilder()
                .setTitle(`${message.author.tag} | Welcome to EchoFluxTest`)
                .setDescription(
                    `> **Totally enhanced and upgraded for a premium experience.**\n` +
                    `> **If you have any questions, join our support community below!**\n\n` +
                    `<:invite:1502013183446220983>  **Support Server:** [Join Here](${supportLink})\n` +
                    `**My prefix in this server is:** \`${prefix}\`\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━`
                )
                .setColor(getEmbedColor() || 0x00d2ff);

            if (bot.user.displayAvatarURL()) {
                embed.setThumbnail(bot.user.displayAvatarURL());
            }

            let catList = "";
            for (const catName of specifiedCats) {
                const rawEmoji = bot.getEmoji(catName) || categoryEmojis[catName] || "<:folder:1502013152961761342>";
                let displayName = catName.charAt(0).toUpperCase() + catName.slice(1);
                if (catName === "sportify") {
                    displayName = "Spotify <:soon1:1507605988826550364><:soon2:1507606011857473596>";
                } else if (["premium", "lyrics", "favourites"].includes(catName)) {
                    displayName = `${displayName} <:new1:1507602266058920138><:new2:1507602291581255780>`;
                }
                catList += `${rawEmoji} | **${displayName}**\n`;
            }

            if (catList) {
                embed.addFields({ name: "<:folder:1502013152961761342> Modules List", value: catList, inline: false });
            }

            embed.addFields({
                name: "Useful Links:",
                value: `[Invite Me](${inviteLink}) | [Support Server](${supportLink}) | [Website](${websiteLink}) | [Vote Me](${voteLink})`,
                inline: false
            });

            embed.setFooter({
                text: "EchoFluxTest Help Panel | © Powered By Gacky & Matrix Studio",
                iconURL: process.env.MATRIXDEV_LOGO || ""
            });

            return embed;
        };

        const createCategoryEmbed = (categoryName) => {
            const rawEmoji = bot.getEmoji(categoryName) || categoryEmojis[categoryName] || "<:folder:1502013152961761342>";
            const content = commandTexts[categoryName.toLowerCase()] || "**<:vote:1502014001238773830> Coming Soon**";

            let displayName = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
            if (categoryName.toLowerCase() === "sportify") {
                displayName = "Spotify";
            }

            let displayText = `**Commands:**\n${content}`;
            if (content.includes("Coming soon") || content.includes("Coming Soon")) {
                displayText = content;
            }

            const embed = new EmbedBuilder()
                .setTitle(`${rawEmoji} ${displayName} Module`)
                .setDescription(
                    `> **You are currently viewing the ${displayName} category.**\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `${displayText}\n\n` +
                    `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    `[Invite Me](${inviteLink}) | [Support Server](${supportLink}) | [Website](${websiteLink}) | [Vote Me](${voteLink})`
                )
                .setColor(getEmbedColor() || 0x00d2ff);

            embed.setFooter({
                text: "EchoFluxTest Help Panel | © Powered By Gacky & Matrix Studio",
                iconURL: process.env.MATRIXDEV_LOGO || ""
            });

            return embed;
        };

        const getComponents = (currentSelection) => {
            const menuOptions = [
                {
                    label: "Home",
                    emoji: bot.getEmoji("home", "🏠"),
                    description: "Return to the main help page",
                    value: "home",
                    default: currentSelection === "home"
                }
            ];

            for (const catName of specifiedCats) {
                const rawEmoji = bot.getEmoji(catName) || categoryEmojis[catName] || "<:folder:1502013152961761342>";
                let displayName = catName.charAt(0).toUpperCase() + catName.slice(1);
                if (catName === "sportify") displayName = "Spotify";

                menuOptions.push({
                    label: displayName,
                    emoji: rawEmoji,
                    description: `View ${displayName.toLowerCase()} commands`,
                    value: catName,
                    default: currentSelection === catName
                });
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('help_select')
                .setPlaceholder('Select a module to view details...')
                .addOptions(menuOptions);

            const row1 = new ActionRowBuilder().addComponents(selectMenu);

            const pages = ["home", ...specifiedCats];
            const currentIndex = pages.indexOf(currentSelection);

            const row2 = new ActionRowBuilder().addComponents(
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

            return [row1, row2];
        };

        const pages = ["home", ...specifiedCats];
        let currentPage = "home";

        const msg = await message.reply({
            embeds: [createHomeEmbed()],
            components: getComponents(currentPage)
        });

        const filter = (interaction) => {
            if (interaction.user.id === message.author.id) {
                return true;
            }
            interaction.reply({
                content: "<:cross:1488582282020126881> This menu is not for you!",
                ephemeral: true
            }).catch(() => { });
            return false;
        };

        const collector = msg.createMessageComponentCollector({ filter, time: 120000 });

        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'help_stop') {
                try {
                    await interaction.message.delete();
                } catch (e) { }
                collector.stop();
                return;
            }

            if (interaction.customId === 'help_select') {
                currentPage = interaction.values[0];
            } else if (interaction.customId === 'help_first') {
                currentPage = "home";
            } else if (interaction.customId === 'help_prev') {
                const idx = pages.indexOf(currentPage);
                currentPage = pages[Math.max(0, idx - 1)];
            } else if (interaction.customId === 'help_next') {
                const idx = pages.indexOf(currentPage);
                currentPage = pages[Math.min(pages.length - 1, idx + 1)];
            } else if (interaction.customId === 'help_last') {
                currentPage = pages[pages.length - 1];
            }

            const embed = currentPage === "home" ? createHomeEmbed() : createCategoryEmbed(currentPage);
            await interaction.update({
                embeds: [embed],
                components: getComponents(currentPage)
            });
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                const disabledRows = getComponents(currentPage).map(row => {
                    return new ActionRowBuilder().addComponents(
                        row.components.map(comp => {
                            if (comp instanceof ButtonBuilder) {
                                return ButtonBuilder.from(comp).setDisabled(true);
                            }
                            return comp.setDisabled(true);
                        })
                    );
                });
                const embed = currentPage === "home" ? createHomeEmbed() : createCategoryEmbed(currentPage);
                msg.edit({ embeds: [embed], components: disabledRows }).catch(() => { });
            }
        });
    }
};
