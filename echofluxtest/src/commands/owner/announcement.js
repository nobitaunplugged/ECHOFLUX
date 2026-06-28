const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType } = require('discord.js');

module.exports = {
    name: 'announce',
    aliases: ['announcement'],
    description: 'Create and broadcast an announcement to all servers. (Owner only)',
    async execute(bot, message, args) {
        const isOwner = await bot.isOwner(message.author);
        if (!isOwner) return;

        const embed = new EmbedBuilder()
            .setTitle("EchoFluxTest Update")
            .setDescription("Type your announcement description here...")
            .setColor(0x00d2ff)
            .setTimestamp(new Date());

        if (bot.user.avatar) {
            embed.setAuthor({ name: "EchoFluxTest Developer Team", iconURL: bot.user.displayAvatarURL() });
        } else {
            embed.setAuthor({ name: "EchoFluxTest Developer Team" });
        }
        embed.setFooter({ text: "EchoFluxTest Important Notice" });

        const row0 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('announce_edit_text').setLabel("Edit Text").setStyle(ButtonStyle.Primary).setEmoji("📝"),
            new ButtonBuilder().setCustomId('announce_edit_media').setLabel("Edit Media").setStyle(ButtonStyle.Secondary).setEmoji("🖼️"),
            new ButtonBuilder().setCustomId('announce_edit_author').setLabel("Edit Author").setStyle(ButtonStyle.Secondary).setEmoji("👤")
        );

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('announce_test_send').setLabel("Test Send").setStyle(ButtonStyle.Success).setEmoji("🧪"),
            new ButtonBuilder().setCustomId('announce_broadcast').setLabel("Broadcast All").setStyle(ButtonStyle.Danger).setEmoji("📢")
        );

        const msg = await message.reply({
            content: "**Announcement Builder**\nUse the buttons below to edit the embed. Click **Test Send** to preview the ping, or **Broadcast All** to send it to all servers.",
            embeds: [embed],
            components: [row0, row1]
        });

        const collector = msg.createMessageComponentCollector({
            time: 600000 // 10 minutes
        });

        collector.on('collect', async interaction => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ content: "<:cross:1488582282020126881> You are not authorized to use this.", ephemeral: true });
            }

            if (interaction.customId === 'announce_edit_text') {
                const modal = new ModalBuilder()
                    .setCustomId('announce_modal_text')
                    .setTitle("Edit Announcement Text");

                const titleInput = new TextInputBuilder()
                    .setCustomId('announce_title')
                    .setLabel("Title")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(256)
                    .setPlaceholder("Enter announcement title...");
                if (embed.data.title) titleInput.setValue(embed.data.title);

                const descInput = new TextInputBuilder()
                    .setCustomId('announce_desc')
                    .setLabel("Description")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(4000)
                    .setPlaceholder("Enter the main message...");
                if (embed.data.description) descInput.setValue(embed.data.description);

                const footerInput = new TextInputBuilder()
                    .setCustomId('announce_footer')
                    .setLabel("Footer Text")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(2000)
                    .setPlaceholder("Enter footer text...");
                if (embed.data.footer && embed.data.footer.text) footerInput.setValue(embed.data.footer.text);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(titleInput),
                    new ActionRowBuilder().addComponents(descInput),
                    new ActionRowBuilder().addComponents(footerInput)
                );

                await interaction.showModal(modal);

                const modalSubmit = await interaction.awaitModalSubmit({
                    filter: i => i.customId === 'announce_modal_text' && i.user.id === message.author.id,
                    time: 300000
                }).catch(() => null);

                if (modalSubmit) {
                    embed.setTitle(modalSubmit.fields.getTextInputValue('announce_title') || null);
                    embed.setDescription(modalSubmit.fields.getTextInputValue('announce_desc'));
                    const footerVal = modalSubmit.fields.getTextInputValue('announce_footer');
                    if (footerVal) {
                        embed.setFooter({ text: footerVal, iconURL: embed.data.footer?.icon_url || null });
                    } else {
                        embed.setFooter(null);
                    }
                    await modalSubmit.update({ embeds: [embed] });
                }
            } 
            
            else if (interaction.customId === 'announce_edit_media') {
                const modal = new ModalBuilder()
                    .setCustomId('announce_modal_media')
                    .setTitle("Edit Announcement Media");

                const thumbInput = new TextInputBuilder()
                    .setCustomId('announce_thumb')
                    .setLabel("Thumbnail URL")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder("https://...");
                if (embed.data.thumbnail && embed.data.thumbnail.url) thumbInput.setValue(embed.data.thumbnail.url);

                const imgInput = new TextInputBuilder()
                    .setCustomId('announce_image')
                    .setLabel("Image URL")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder("https://...");
                if (embed.data.image && embed.data.image.url) imgInput.setValue(embed.data.image.url);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(thumbInput),
                    new ActionRowBuilder().addComponents(imgInput)
                );

                await interaction.showModal(modal);

                const modalSubmit = await interaction.awaitModalSubmit({
                    filter: i => i.customId === 'announce_modal_media' && i.user.id === message.author.id,
                    time: 300000
                }).catch(() => null);

                if (modalSubmit) {
                    const thumb = modalSubmit.fields.getTextInputValue('announce_thumb');
                    const img = modalSubmit.fields.getTextInputValue('announce_image');
                    embed.setThumbnail(thumb || null);
                    embed.setImage(img || null);
                    await modalSubmit.update({ embeds: [embed] });
                }
            }

            else if (interaction.customId === 'announce_edit_author') {
                const modal = new ModalBuilder()
                    .setCustomId('announce_modal_author')
                    .setTitle("Edit Announcement Author");

                const authorNameInput = new TextInputBuilder()
                    .setCustomId('announce_author_name')
                    .setLabel("Author Name")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(256)
                    .setPlaceholder("Enter author name...");
                if (embed.data.author && embed.data.author.name) authorNameInput.setValue(embed.data.author.name);

                const authorIconInput = new TextInputBuilder()
                    .setCustomId('announce_author_icon')
                    .setLabel("Author Icon URL")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder("https://...");
                if (embed.data.author && embed.data.author.icon_url) authorIconInput.setValue(embed.data.author.icon_url);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(authorNameInput),
                    new ActionRowBuilder().addComponents(authorIconInput)
                );

                await interaction.showModal(modal);

                const modalSubmit = await interaction.awaitModalSubmit({
                    filter: i => i.customId === 'announce_modal_author' && i.user.id === message.author.id,
                    time: 300000
                }).catch(() => null);

                if (modalSubmit) {
                    const name = modalSubmit.fields.getTextInputValue('announce_author_name');
                    const icon = modalSubmit.fields.getTextInputValue('announce_author_icon');
                    if (name) {
                        embed.setAuthor({ name: name, iconURL: icon || null });
                    } else {
                        embed.setAuthor(null);
                    }
                    await modalSubmit.update({ embeds: [embed] });
                }
            }

            else if (interaction.customId === 'announce_test_send') {
                await interaction.deferReply({ ephemeral: true });
                const ping = interaction.guild?.ownerId ? `<@${interaction.guild.ownerId}>` : interaction.user.toString();
                await interaction.channel.send({ content: `**[TEST PREVIEW]**\n${ping}`, embeds: [embed] });
                await interaction.followup({ content: "<:tick:1488582269298807024> Test sent to this channel.", ephemeral: true });
            }

            else if (interaction.customId === 'announce_broadcast') {
                const disabledRow0 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('announce_edit_text').setLabel("Edit Text").setStyle(ButtonStyle.Primary).setEmoji("📝").setDisabled(true),
                    new ButtonBuilder().setCustomId('announce_edit_media').setLabel("Edit Media").setStyle(ButtonStyle.Secondary).setEmoji("🖼️").setDisabled(true),
                    new ButtonBuilder().setCustomId('announce_edit_author').setLabel("Edit Author").setStyle(ButtonStyle.Secondary).setEmoji("👤").setDisabled(true)
                );
                const disabledRow1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('announce_test_send').setLabel("Test Send").setStyle(ButtonStyle.Success).setEmoji("🧪").setDisabled(true),
                    new ButtonBuilder().setCustomId('announce_broadcast').setLabel("Broadcast All").setStyle(ButtonStyle.Danger).setEmoji("📢").setDisabled(true)
                );
                await interaction.update({ components: [disabledRow0, disabledRow1] });

                const statusMsg = await interaction.followup({ content: "<a:loading1:1488582519304618236> Starting broadcast to all servers... this may take a while.", ephemeral: true });

                let success = 0;
                let failed = 0;

                for (const guild of bot.guilds.cache.values()) {
                    let channel = guild.systemChannel;
                    
                    if (!channel || !channel.permissionsFor(guild.members.me).has(['SendMessages', 'EmbedLinks'])) {
                        channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has(['SendMessages', 'EmbedLinks']));
                    }
                    
                    if (channel) {
                        try {
                            const ping = guild.ownerId ? `<@${guild.ownerId}>` : "";
                            await channel.send({ content: ping, embeds: [embed] });
                            success++;
                        } catch (e) {
                            failed++;
                        }
                    } else {
                        failed++;
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                await statusMsg.edit({ content: `<:tick:1488582269298807024> Broadcast complete!\n**Success:** \`${success}\` servers\n**Failed:** \`${failed}\` servers` });
                collector.stop();
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                const disabledRow0 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('announce_edit_text').setLabel("Edit Text").setStyle(ButtonStyle.Primary).setEmoji("📝").setDisabled(true),
                    new ButtonBuilder().setCustomId('announce_edit_media').setLabel("Edit Media").setStyle(ButtonStyle.Secondary).setEmoji("🖼️").setDisabled(true),
                    new ButtonBuilder().setCustomId('announce_edit_author').setLabel("Edit Author").setStyle(ButtonStyle.Secondary).setEmoji("👤").setDisabled(true)
                );
                const disabledRow1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('announce_test_send').setLabel("Test Send").setStyle(ButtonStyle.Success).setEmoji("🧪").setDisabled(true),
                    new ButtonBuilder().setCustomId('announce_broadcast').setLabel("Broadcast All").setStyle(ButtonStyle.Danger).setEmoji("📢").setDisabled(true)
                );
                await msg.edit({ components: [disabledRow0, disabledRow1] }).catch(() => {});
            }
        });
    }
};
