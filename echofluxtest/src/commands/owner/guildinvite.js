const { EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
    name: 'ginvite',
    aliases: ['guildinvite'],
    description: 'Creates a permanent invite for a specific server. (Owner only)',
    async execute(bot, message, args) {
        const isOwner = await bot.isOwner(message.author);
        if (!isOwner) return;

        const guildId = args[0];

        // --- Missing Argument Embed ---
        if (!guildId) {
            const usageEmbed = new EmbedBuilder()
                .setTitle("<:setup:1502014141957672980>️ Command: ginvite")
                .setDescription("Creates a permanent, unlimited invite link for a specific server the bot is in.")
                .setColor(0x00d2ff)
                .addFields(
                    { name: "Usage", value: `\`.ginvite <server_id>\``, inline: false },
                    { name: "Aliases", value: `\`.guildinvite\``, inline: false },
                    { name: "Example", value: `\`.ginvite 123456789012345678\``, inline: false }
                );
            return message.reply({ embeds: [usageEmbed] });
        }

        // --- Guild Fetching ---
        const guild = bot.guilds.cache.get(guildId);
        if (!guild) {
            return message.reply("<:cross:1488582282020126881> I am not in a server with that ID, or the ID is invalid.");
        }

        let invite = null;

        // Loop through text channels to find one where we have permission to make an invite
        const textChannels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
        for (const [id, channel] of textChannels) {
            if (channel.permissionsFor(guild.members.me).has('CreateInstantInvite')) {
                try {
                    invite = await channel.createInvite({
                        maxAge: 0,
                        maxUses: 0,
                        unique: true,
                        reason: `Requested by bot owner: ${message.author.tag}`
                    });
                    break;
                } catch (e) {
                    continue;
                }
            }
        }

        // --- Send Result ---
        if (invite) {
            await message.reply(`<:tick:1488582269298807024>  Here is the permanent invite for **${guild.name}**:\n${invite.url}`);
        } else {
            await message.reply(`<:cross:1488582282020126881> I couldn't create an invite for **${guild.name}**. I likely lack the 'Create Invite' permission in all of its text channels.`);
        }
    }
};
