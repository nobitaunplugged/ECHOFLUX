const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder, ComponentType } = require('discord.js');
const dbBridge = require('../../utils/dbBridge');

module.exports = {
    name: 'npre',
    aliases: ['np', 'noprefix'],
    description: "Manage No-Prefix access.",
    async execute(bot, message, args) {
        const isOwner = await bot.isOwner(message.author);
        if (!isOwner) return;

        const prefix = bot.getPrefix(message.guild?.id);
        const sub = args[0]?.toLowerCase();

        if (sub === 'add') {
            const userArg = args[1];
            if (!userArg) {
                return message.reply(`<:cross:1488582282020126881> Missing user! Usage: \`${prefix}np add <@user|user_id>\``);
            }

            const userId = userArg.replace(/[<@!>]/g, '');
            const member = await message.guild.members.fetch(userId).catch(() => null);
            if (!member) {
                return message.reply("<:cross:1488582282020126881> Invalid user or user not in this guild!");
            }

            const select = new StringSelectMenuBuilder()
                .setCustomId('np_duration')
                .setPlaceholder('Select No-Prefix duration...')
                .addOptions([
                    { label: "5 Minutes", description: "Short term access", value: "300" },
                    { label: "1 Hour", description: "Temporary access", value: "3600" },
                    { label: "1 Day", description: "Daily access", value: "86400" },
                    { label: "7 Days", description: "Weekly access", value: "604800" },
                    { label: "1 Week", description: "Same as 7 days", value: "604800_week" },
                    { label: "1 Month", description: "Monthly access", value: "2592000" },
                    { label: "3 Months", description: "3 Month Access", value: "7776000" },
                    { label: "6 Months", description: "6 Month Access", value: "15552000" },
                    { label: "1 Year", description: "Yearly access", value: "31536000" },
                    { label: "Permanent", description: "Never expires", value: "Permanent" }
                ]);

            const row = new ActionRowBuilder().addComponents(select);
            const msg = await message.reply({ content: `Select the No-Prefix duration for ${member}:`, components: [row] });

            const collector = msg.createMessageComponentCollector({
                componentType: ComponentType.StringSelect,
                time: 60000
            });

            collector.on('collect', async interaction => {
                if (interaction.user.id !== message.author.id) {
                    return interaction.reply({ content: "<:cross:1488582282020126881> You are not allowed to interact with this menu.", ephemeral: true });
                }

                const value = interaction.values[0];
                const parseVal = value.replace("_week", "");
                const targetIdStr = String(member.id);

                let expires;
                let textDuration;
                if (parseVal === "Permanent") {
                    expires = "Permanent";
                    textDuration = "Permanently";
                } else {
                    const durationSecs = parseInt(parseVal);
                    expires = String(Math.floor(Date.now() / 1000) + durationSecs);
                    const labelMap = {
                        "300": "5 Minutes",
                        "3600": "1 Hour",
                        "86400": "1 Day",
                        "604800": "7 Days",
                        "604800_week": "1 Week",
                        "2592000": "1 Month",
                        "7776000": "3 Months",
                        "15552000": "6 Months",
                        "31536000": "1 Year"
                    };
                    const labelUsed = labelMap[value] || "selected duration";
                    textDuration = `for ${labelUsed}`;
                }

                await dbBridge.addNoPrefix(targetIdStr, expires);

                await interaction.update({
                    content: `<:tick:1488582269298807024>  ${member} has been given No-Prefix access **${textDuration}**!`,
                    components: []
                });
                collector.stop();
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    await msg.edit({ content: "⏰ **No-Prefix selection timed out.**", components: [] }).catch(() => {});
                }
            });
            return;
        }

        if (sub === 'remove') {
            const userArg = args[1];
            if (!userArg) {
                return message.reply(`<:cross:1488582282020126881> Missing user! Usage: \`${prefix}np remove <@user|user_id>\``);
            }

            const userId = userArg.replace(/[<@!>]/g, '');
            const member = await message.guild.members.fetch(userId).catch(() => null);
            if (!member) {
                return message.reply("<:cross:1488582282020126881> Invalid user or user not in this guild!");
            }

            const targetIdStr = String(member.id);

            const hasAccess = dbBridge.hasNoPrefixAccess(targetIdStr);
            if (hasAccess) {
                await dbBridge.removeNoPrefix(targetIdStr);
                return message.reply(`<:tick:1488582269298807024>  Removed No-Prefix access from ${member}.`);
            } else {
                return message.reply(`<:cross:1488582282020126881> ${member} does not currently have No-Prefix access.`);
            }
        }

        if (sub === 'list') {
            const data = dbBridge.getNoPrefixData();
            if (Object.keys(data).length === 0) {
                return message.reply("<:cross:1488582282020126881> No users currently have No-Prefix access.");
            }

            const embed = new EmbedBuilder()
                .setTitle("Users with No-Prefix Access")
                .setColor(0x00d2ff);

            const descriptionLines = [];
            let index = 1;

            for (const [userIdStr, expiresAt] of Object.entries(data)) {
                const user = await bot.users.fetch(userIdStr).catch(() => null);
                const username = user ? user.username : "Unknown User";

                let durationText;
                if (expiresAt === "Permanent") {
                    durationText = "Permanent";
                } else {
                    try {
                        const expVal = parseFloat(expiresAt);
                        if (Math.floor(Date.now() / 1000) > expVal) {
                            durationText = "Expired";
                        } else {
                            durationText = `Expires: <t:${Math.floor(expVal)}:R>`;
                        }
                    } catch (e) {
                        durationText = String(expiresAt);
                    }
                }

                descriptionLines.push(`**${index}.** **${username}** (\`${userIdStr}\`) - ${durationText}`);
                index++;
            }

            let desc = descriptionLines.join("\n");
            if (desc.length > 4000) {
                desc = desc.slice(0, 4000) + "\n...and more.";
            }

            embed.setDescription(desc);
            return message.reply({ embeds: [embed] });
        }

        return message.reply(`Usage: \`${prefix}np add @user\` or \`${prefix}np remove @user\` or \`${prefix}np list\`.`);
    }
};
