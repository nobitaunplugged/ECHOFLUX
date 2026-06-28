const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

module.exports = {
    name: 'restart',
    aliases: ['reboot'],
    description: 'Restarts the bot completely. (Owner only)',
    async execute(bot, message, args) {
        const isOwner = await bot.isOwner(message.author);
        if (!isOwner) return;

        // Get active players
        const activePlayers = [];
        if (bot.lavalink && bot.lavalink.players) {
            try {
                let index = 1;
                for (const player of bot.lavalink.players.values()) {
                    if (player.current) {
                        const guild = bot.guilds.cache.get(player.guildId);
                        if (guild) {
                            activePlayers.push(`${index}. **${guild.name}** (${guild.id})`);
                            index++;
                        }
                    }
                }
            } catch (e) {}
        }

        const embed = new EmbedBuilder()
            .setTitle("<:loop:1502013311257481388> Bot Restart Confirmation")
            .setColor(0x00d2ff)
            .setFooter({ text: "This action will restart the bot completely. Use the buttons below to confirm or cancel." });

        if (activePlayers.length > 0) {
            embed.setDescription("Are you sure you want to restart the bot? This will disconnect all active music players.");
            embed.addFields({
                name: "<:Music:1488582297321214081> Active Players",
                value: activePlayers.join("\n"),
                inline: false
            });
        } else {
            embed.setDescription("Are you sure you want to restart the bot? No active music players will be affected.");
            embed.addFields({
                name: "<:Music:1488582297321214081> Active Players",
                value: "No active players currently.",
                inline: false
            });
        }

        const refreshEmoji = bot.getEmoji("refresh", "<:loop:1502013311257481388>");
        const cancelEmoji = bot.getEmoji("cancel", "<:cross:1488582282020126881>");

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_restart')
                .setLabel("Restart Bot")
                .setStyle(ButtonStyle.Danger)
                .setEmoji(refreshEmoji),
            new ButtonBuilder()
                .setCustomId('cancel_restart')
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(cancelEmoji)
        );

        const msg = await message.reply({ embeds: [embed], components: [row] });

        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000
        });

        collector.on('collect', async interaction => {
            if (interaction.user.id !== message.author.id) {
                return interaction.reply({ content: "Only the command author can interact with this!", ephemeral: true });
            }

            if (interaction.customId === 'confirm_restart') {
                await interaction.update({ content: "<:loop:1502013311257481388> **Restarting bot...**", embeds: [], components: [] });
                collector.stop();

                try {
                    const statusPath = path.join(process.cwd(), 'restart_status.json');
                    fs.writeJsonSync(statusPath, {
                        channel_id: message.channel.id,
                        message_id: msg.id
                    });
                } catch (e) {
                    console.error("Could not save restart status:", e);
                }

                // Cleanup lavalink players
                if (bot.lavalink && bot.lavalink.players) {
                    try {
                        for (const player of bot.lavalink.players.values()) {
                            await player.stopTrack().catch(() => {});
                        }
                    } catch (e) {}
                }

                await bot.destroy();

                const child = spawn(process.argv[0], process.argv.slice(1), {
                    detached: true,
                    stdio: 'inherit'
                });
                child.unref();
                process.exit(0);

            } else if (interaction.customId === 'cancel_restart') {
                await interaction.update({ content: "<:cross:1488582282020126881> **Restart cancelled.**", embeds: [], components: [] });
                collector.stop();
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await msg.edit({ content: "⏰ **Restart confirmation timed out.**", embeds: [], components: [] }).catch(() => {});
            }
        });
    }
};
