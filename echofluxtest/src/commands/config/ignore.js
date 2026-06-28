const { EmbedBuilder, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const dbBridge = require('../../utils/dbBridge');

module.exports = {
    name: 'ignore',
    aliases: [],
    description: "Ignore commands in selected text channels.",
    async execute(bot, message, args) {
        const member = message.member;
        if (!member) return;

        // Permissions check
        if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            const embed = new EmbedBuilder()
                .setDescription("You need Manage Channels Permission to Execute This Command.")
                .setColor(0x00d2ff);
            return message.reply({ embeds: [embed] });
        }

        const guildId = message.guild.id;
        const ignoredChannels = dbBridge.getIgnoredChannels(guildId);

        const embed = new EmbedBuilder()
            .setTitle("Ignore Channels Configuration")
            .setDescription("Select the text channels where bot commands should be ignored from the dropdown below.")
            .setColor(0x00d2ff);

        // Build Channel Select Menu
        const selectMenu = new ChannelSelectMenuBuilder()
            .setCustomId('ignore_select')
            .setPlaceholder('Select channels to ignore')
            .setMinValues(0)
            .setMaxValues(25)
            .setChannelTypes([ChannelType.GuildText]);

        // In discord.js, setDefaultChannels can be set if ignoredChannels has items
        if (ignoredChannels.length > 0) {
            selectMenu.setDefaultChannels(ignoredChannels.slice(0, 25));
        }

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const responseMsg = await message.reply({ embeds: [embed], components: [row] });

        // Component Collector
        const authorId = message.author ? message.author.id : message.user.id;
        const collector = responseMsg.createMessageComponentCollector({
            filter: (i) => i.customId === 'ignore_select' && i.user.id === authorId,
            time: 60000
        });

        collector.on('collect', async (interaction) => {
            const selectedChannels = interaction.values; // Array of channel IDs
            
            const db = require('../../utils/db');
            await db.run("DELETE FROM ignored_channels WHERE guild_id = ?", [guildId]);
            for (const cid of selectedChannels) {
                await db.run("INSERT INTO ignored_channels (guild_id, channel_id) VALUES (?, ?)", [guildId, cid]);
            }
            await dbBridge.loadCaches();

            const updatedEmbed = new EmbedBuilder()
                .setTitle("Ignored Channels Updated")
                .setDescription(`Commands will now be ignored in ${selectedChannels.length} channels.`)
                .setColor(0x00d2ff);

            const mentions = selectedChannels.map(cid => `<#${cid}>`);
            if (mentions.length > 0) {
                updatedEmbed.addFields({ name: "Selected Channels", value: mentions.join(", ").slice(0, 1024) });
            }

            await interaction.update({ embeds: [updatedEmbed], components: [] });
            collector.stop();
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                // Disable components
                try {
                    const disabledSelect = ChannelSelectMenuBuilder.from(selectMenu).setDisabled(true);
                    const disabledRow = new ActionRowBuilder().addComponents(disabledSelect);
                    await responseMsg.edit({ components: [disabledRow] }).catch(() => {});
                } catch (e) {}
            }
        });
    }
};
