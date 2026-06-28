const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } = require('discord.js');
const { isGuildPremium } = require('../../utils/premium');

module.exports = {
    name: 'custombot',
    aliases: ['cb'],
    description: "Customize EchoFluxTest's Name, Avatar, Banner, and Bio in this server!",
    async execute(bot, message, args) {
        if (!message.guild) {
            return message.reply("<:cross:1488582282020126881> This command can only be used in a server.");
        }

        // Check if the user has Manage Server or is Bot Owner
        const isOwner = await bot.isOwner(message.author);
        if (!message.member.permissions.has('ManageGuild') && !isOwner) {
            return message.reply({ content: "<:cross:1488582282020126881> You need **Manage Server** permissions to use this command.", ephemeral: true });
        }

        // Check Premium status
        if (!isGuildPremium(message.guild.id)) {
            const prefix = bot.getPrefix ? bot.getPrefix(message.guild.id) : '.';
            const embed = new EmbedBuilder()
                .setTitle("<:premium:1502013376207912960> Premium Feature")
                .setDescription(`The Custom Bot feature is exclusive to Premium servers!\n\nUse \`${prefix}premium\` to learn more about the benefits.`)
                .setColor(0xFF0000); // Red color
            return message.reply({ embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setTitle("CustomBot Settings")
            .setDescription(
                `Customize how ${message.guild.members.me.toString()} appears in **${message.guild.name.toUpperCase()}**\n\n` +
                "Available Options\n" +
                "• Change Avatar (Ready)\n" +
                "• Change Nickname (Ready)\n" +
                "• Change Banner (Ready)\n" +
                (isOwner ? "• Change Bio (Ready)\n" : "") +
                "• Reset to Default\n\n" +
                "Premium Feature | Changes apply only to this server"
            )
            .setColor(0x2b2d31);

        if (message.guild.members.me.displayAvatarURL()) {
            embed.setThumbnail(message.guild.members.me.displayAvatarURL());
        }
        embed.setFooter({ text: "EchoFluxTest Premium | © By Gacky & Matrix Studio" });

        const buttons = [
            new ButtonBuilder()
                .setCustomId('cb_avatar')
                .setLabel('Change Avatar')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('cb_name')
                .setLabel('Change Nickname')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('cb_banner')
                .setLabel('Change Banner')
                .setStyle(ButtonStyle.Secondary)
        ];

        if (isOwner) {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('cb_bio')
                    .setLabel('Change Bio')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        const row = new ActionRowBuilder().addComponents(buttons);

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('cb_reset')
                .setLabel('Reset to Default')
                .setStyle(ButtonStyle.Danger)
        );

        const msg = await message.reply({ embeds: [embed], components: [row, row2] });

        const filter = (i) => i.user.id === message.author.id;
        const collector = msg.createMessageComponentCollector({ filter, time: 180000 });

        collector.on('collect', async (interaction) => {
            const customId = interaction.customId;

            if (customId === 'cb_reset') {
                await interaction.deferReply({ ephemeral: true });
                try {
                    const { Routes } = require('discord.js');
                    await bot.rest.patch(Routes.guildMember(message.guild.id, "@me"), {
                        body: {
                            nick: null,
                            avatar: null,
                            banner: null,
                            bio: null
                        }
                    });
                    await interaction.followup({ content: "<:tick:1488582269298807024> Successfully reset the bot's Server Profile to default!", ephemeral: true });
                } catch (e) {
                    await interaction.followup({ content: `<:cross:1488582282020126881> An error occurred: \`${e.message}\``, ephemeral: true });
                }
                return;
            }

            let actionName = '';
            let label = '';
            let placeholder = '';
            let maxLength = 4000;
            let textStyle = TextInputStyle.Short;

            if (customId === 'cb_avatar') {
                actionName = 'Avatar';
                label = 'Avatar Image URL';
                placeholder = 'Paste a direct image link (PNG, JPG, GIF)...';
            } else if (customId === 'cb_name') {
                actionName = 'Name';
                label = 'New Nickname';
                placeholder = 'Enter the new nickname...';
                maxLength = 32;
            } else if (customId === 'cb_banner') {
                actionName = 'Banner';
                label = 'Banner Image URL';
                placeholder = 'Paste a direct image link (PNG, JPG, GIF)...';
            } else if (customId === 'cb_bio') {
                actionName = 'Bio';
                label = 'New Bio';
                placeholder = 'Enter the new bio...';
                maxLength = 190;
                textStyle = TextInputStyle.Paragraph;
            }

            const modal = new ModalBuilder()
                .setCustomId(`cb_modal_${actionName.toLowerCase()}`)
                .setTitle(`Change Server ${actionName}`);

            const textInput = new TextInputBuilder()
                .setCustomId('val_input')
                .setLabel(label)
                .setPlaceholder(placeholder)
                .setRequired(true)
                .setStyle(textStyle);

            if (maxLength) {
                textInput.setMaxLength(maxLength);
            }

            modal.addComponents(new ActionRowBuilder().addComponents(textInput));

            await interaction.showModal(modal);

            const submitted = await interaction.awaitModalSubmit({
                time: 60000,
                filter: (i) => i.customId === `cb_modal_${actionName.toLowerCase()}` && i.user.id === message.author.id
            }).catch(() => null);

            if (submitted) {
                await submitted.deferReply({ ephemeral: true });
                const value = submitted.fields.getTextInputValue('val_input').trim();

                try {
                    const { Routes } = require('discord.js');
                    const guildBody = {};

                    if (actionName === 'Name') {
                        guildBody.nick = value;
                    } else if (actionName === 'Bio') {
                        guildBody.bio = value;
                    } else if (actionName === 'Avatar' || actionName === 'Banner') {
                        const cleanUrl = value.trim()
                            .replace("media.discordapp.net", "cdn.discordapp.com")
                            .split("&=&")[0]
                            .replace(/[&?]+$/, "");

                        const axios = require("axios");
                        const res = await axios.get(cleanUrl, {
                            responseType: 'arraybuffer',
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                            }
                        });
                        const contentType = res.headers["content-type"] || "image/png";
                        const buffer = Buffer.from(res.data);
                        const dataUri = `data:${contentType};base64,${buffer.toString("base64")}`;

                        if (actionName === 'Avatar') {
                            guildBody.avatar = dataUri;
                        } else {
                            guildBody.banner = dataUri;
                        }
                    }

                    await bot.rest.patch(Routes.guildMember(message.guild.id, "@me"), { body: guildBody });

                    await submitted.followup({ content: `<:tick:1488582269298807024> Successfully updated the bot's Server ${actionName}!`, ephemeral: true });
                } catch (e) {
                    console.error(`[CUSTOMBOT ERROR] Failed to update ${actionName}:`, e);
                    let errMsg = e.message;
                    if (e.code === 50013) {
                        errMsg = "I don't have permission to edit my profile in this server. (Requires 'Change Nickname' permission, and the server boost level must support custom avatars/banners/bios).";
                    }
                    await submitted.followup({ content: `<:cross:1488582282020126881> Failed to update ${actionName}: \`${errMsg}\` (Error Code: ${e.code || "N/A"})`, ephemeral: true });
                }
            }
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(
                row.components.map(btn => ButtonBuilder.from(btn).setDisabled(true))
            );
            const disabledRow2 = new ActionRowBuilder().addComponents(
                row2.components.map(btn => ButtonBuilder.from(btn).setDisabled(true))
            );
            msg.edit({ embeds: [embed], components: [disabledRow, disabledRow2] }).catch(() => { });
        });
    }
};
