const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const dbBridge = require('../../utils/dbBridge');

module.exports = {
    name: 'toggle_247',
    aliases: ['247'],
    description: "Manage 24/7 mode in the current voice channel.",
    async execute(bot, message, args) {
        const member = message.member;
        if (!member) return;

        // Permissions check
        if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            const embed = new EmbedBuilder()
                .setDescription("<:cross:1488582282020126881> You need `Manage Server` Permission to execute this command.")
                .setColor(0x00d2ff);
            return message.reply({ embeds: [embed] });
        }

        const guildId = message.guild.id;
        const activeChannel = dbBridge.get247Channel(guildId);
        
        const isActive = !!activeChannel;
        const status = isActive ? "🟢 Enabled" : "🔴 Disabled";

        const embed = new EmbedBuilder()
            .setTitle("♾️ 24/7 Voice Channel Mode")
            .setDescription(`**Current Status:** ${status}\n\nWhen enabled, the bot will persistently stay in the voice channel and automatically reconnect after restarts.`)
            .setColor(0x00d2ff);

        const turnOnBtn = new ButtonBuilder()
            .setCustomId('247_turn_on')
            .setLabel('Turn 24/7 On')
            .setStyle(ButtonStyle.Success)
            .setEmoji('♾️');

        const turnOffBtn = new ButtonBuilder()
            .setCustomId('247_turn_off')
            .setLabel('Turn 24/7 Off')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('<:report:1502014120344682556>');

        if (isActive) {
            turnOnBtn.setDisabled(true);
        } else {
            turnOffBtn.setDisabled(true);
        }

        const row = new ActionRowBuilder().addComponents(turnOnBtn, turnOffBtn);

        const responseMsg = await message.reply({ embeds: [embed], components: [row] });

        const authorId = message.author ? message.author.id : message.user.id;
        const collector = responseMsg.createMessageComponentCollector({
            time: 120000
        });

        collector.on('collect', async (interaction) => {
            const customId = interaction.customId;

            if (customId === '247_turn_on') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: "You need `Manage Server` permissions to use this!", ephemeral: true });
                }

                const player = bot.lavalink.players.get(guildId);
                if (!player || !player.connection.channelId) {
                    return interaction.reply({ content: "I am not connected to a voice channel! Please use `.join` or `.play` first.", ephemeral: true });
                }

                await dbBridge.set247Channel(guildId, player.connection.channelId, true);

                const successEmbed = new EmbedBuilder()
                    .setDescription("♾️ **24/7 Mode Enabled!**\nI will stay in this channel persistently, even across restarts.")
                    .setColor(0x00d2ff);

                await interaction.update({ embeds: [successEmbed], components: [] });
                collector.stop();
            }

            else if (customId === '247_turn_off') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                    return interaction.reply({ content: "You need `Manage Server` permissions to use this!", ephemeral: true });
                }

                const activeChannelNow = dbBridge.get247Channel(guildId);
                if (!activeChannelNow) {
                    return interaction.reply({ content: "24/7 mode is not active!", ephemeral: true });
                }

                const confirmEmbed = new EmbedBuilder()
                    .setTitle("<:report:1502014120344682556> Turn Off 24/7 Mode?")
                    .setDescription("Are you sure you want to turn off 24/7 mode? I will leave the voice channel when idle.")
                    .setColor(0x00d2ff);

                const yesBtn = new ButtonBuilder()
                    .setCustomId('247_confirm_off')
                    .setLabel('Yes, Turn Off')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('<:report:1502014120344682556>');

                const cancelBtn = new ButtonBuilder()
                    .setCustomId('247_cancel')
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('<:cross:1488582282020126881>');

                const confirmRow = new ActionRowBuilder().addComponents(yesBtn, cancelBtn);

                await interaction.update({ embeds: [confirmEmbed], components: [confirmRow] });
            }

            else if (customId === '247_confirm_off') {
                if (interaction.user.id !== authorId) {
                    return interaction.reply({ content: "This is not for you!", ephemeral: true });
                }

                await dbBridge.set247Channel(guildId, "", false);

                const disabledEmbed = new EmbedBuilder()
                    .setDescription("<:report:1502014120344682556> **24/7 Mode Disabled!**\nI will now leave the voice channel when stopped or disconnected.")
                    .setColor(0x00d2ff);

                await interaction.update({ embeds: [disabledEmbed], components: [] });
                collector.stop();
            }

            else if (customId === '247_cancel') {
                if (interaction.user.id !== authorId) {
                    return interaction.reply({ content: "This is not for you!", ephemeral: true });
                }

                const cancelEmbed = new EmbedBuilder()
                    .setDescription("<:tick:1488582269298807024> **Cancelled.** 24/7 mode remains active.")
                    .setColor(0x00d2ff);

                await interaction.update({ embeds: [cancelEmbed], components: [] });
                collector.stop();
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                try {
                    const disabledRow = new ActionRowBuilder().addComponents(
                        ButtonBuilder.from(turnOnBtn).setDisabled(true),
                        ButtonBuilder.from(turnOffBtn).setDisabled(true)
                    );
                    await responseMsg.edit({ components: [disabledRow] }).catch(() => {});
                } catch (e) {}
            }
        });
    }
};
