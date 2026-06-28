const { EmbedBuilder } = require('discord.js');

const flagMap = {
    HypeSquadOnlineHouse1: "HypeSquad Bravery",
    HypeSquadOnlineHouse2: "HypeSquad Brilliance",
    HypeSquadOnlineHouse3: "HypeSquad Balance",
    Hypesquad: "HypeSquad Events",
    PremiumEarlySupporter: "Early Supporter",
    ActiveDeveloper: "Active Developer",
    VerifiedDeveloper: "Early Verified Bot Developer",
    CertifiedModerator: "Moderators Program Alumni",
    Staff: "Discord Staff",
    Partner: "Partnered Server Owner"
};

const keyPermissions = [
    { key: "Administrator", label: "Administrator" },
    { key: "ManageGuild", label: "Manage Guild" },
    { key: "ManageRoles", label: "Manage Roles" },
    { key: "ManageChannels", label: "Manage Channels" },
    { key: "KickMembers", label: "Kick Members" },
    { key: "BanMembers", label: "Ban Members" },
    { key: "ManageMessages", label: "Manage Messages" },
    { key: "MentionEveryone", label: "Mention Everyone" },
    { key: "ManageNicknames", label: "Manage Nicknames" },
    { key: "ManageWebhooks", label: "Manage Webhooks" }
];

module.exports = {
    name: 'userinfo',
    aliases: ['ui', 'whois'],
    description: "Get information about a user",
    async execute(bot, message, args) {
        let target = message.author;
        if (message.mentions.users.first()) {
            target = message.mentions.users.first();
        } else if (args[0]) {
            try {
                target = await bot.users.fetch(args[0]);
            } catch (e) {}
        }

        const guild = message.guild;
        let member = null;
        if (guild) {
            member = guild.members.cache.get(target.id) || await guild.members.fetch(target.id).catch(() => null);
        }

        // --- Badges ---
        const flags = target.flags ? target.flags.toArray() : [];
        const badgesList = flags.map(flag => flagMap[flag]).filter(Boolean);
        const badges = badgesList.length > 0 ? badgesList.join(', ') : "<:cross:1488582282020126881>";

        // --- Roles & Colors ---
        let rolesStr = "None";
        let roleCount = 0;
        let highestRole = "None";
        let displayColor = 0x2f3136; // Default #2f3136

        if (member) {
            const roles = [...member.roles.cache.values()]
                .filter(r => r.id !== guild.id)
                .sort((a, b) => b.position - a.position);

            roleCount = roles.length;
            highestRole = member.roles.highest ? member.roles.highest.toString() : "None";

            if (member.displayColor && member.displayColor !== 0) {
                displayColor = member.displayColor;
            }

            if (roleCount > 0) {
                const mentions = roles.slice(0, 10).map(r => r.toString());
                rolesStr = mentions.join(', ');
                if (roleCount > 10) {
                    rolesStr += ` + ${roleCount - 10} more...`;
                }
            }
        }

        // --- Permissions ---
        let permissionsText = "None";
        let acknowledgement = "Server Member";

        if (member) {
            if (member.id === guild.ownerId) {
                acknowledgement = "Server Owner";
            } else if (member.permissions.has('Administrator')) {
                acknowledgement = "Administrator";
            }

            const relevantPerms = keyPermissions
                .filter(p => member.permissions.has(p.key))
                .map(p => `\`${p.label}\``);

            if (relevantPerms.length > 0) {
                permissionsText = relevantPerms.join(', ');
            }
        }

        // --- Build Embed ---
        const embed = new EmbedBuilder()
            .setColor(displayColor)
            .setAuthor({
                name: `${target.username}'s Information`,
                iconURL: target.displayAvatarURL()
            })
            .setThumbnail(target.displayAvatarURL())
            .setTimestamp();

        const isBot = target.bot ? "<:tick:1488582269298807024> Yes" : "<:cross:1488582282020126881> No";
        const createdTs = Math.floor(target.createdTimestamp / 1000);

        const generalInfo = [
            `**Name:** ${target.username}`,
            `**ID:** ${target.id}`,
            `**Nickname:** ${member && member.nickname ? member.nickname : 'N/A'}`,
            `**Bot:** ${isBot}`,
            `**Badges:** ${badges}`,
            `**Account Created:** <t:${createdTs}:R> (<t:${createdTs}:D>)`
        ];

        if (member && member.joinedTimestamp) {
            const joinedTs = Math.floor(member.joinedTimestamp / 1000);
            generalInfo.push(`**Server Joined:** <t:${joinedTs}:R> (<t:${joinedTs}:D>)`);
        } else {
            generalInfo.push(`**Server Joined:** N/A`);
        }

        embed.addFields({ name: "General Information", value: generalInfo.join('\n'), inline: false });

        const roleInfo = [
            `**Highest Role:** ${highestRole}`,
            `**Roles [${roleCount}]:** ${rolesStr}`,
            `**Color:** #${displayColor.toString(16).padStart(6, '0')}`
        ];
        embed.addFields({ name: "Role Info", value: roleInfo.join('\n'), inline: false });

        const boosting = member && member.premiumSinceTimestamp ? `Since <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:D>` : "None";
        const voice = member && member.voice.channel ? member.voice.channel.toString() : "None";

        const extraInfo = [
            `**Boosting:** ${boosting}`,
            `**Voice:** ${voice}`
        ];
        embed.addFields({ name: "Extra", value: extraInfo.join('\n'), inline: false });

        embed.addFields(
            { name: "Key Permissions", value: permissionsText, inline: false },
            { name: "Acknowledgement", value: acknowledgement, inline: false }
        );

        embed.setFooter({
            text: `Requested by ${message.author.username}`,
            iconURL: message.author.displayAvatarURL()
        });

        // Try fetching user to get banner if available
        try {
            const fetchedUser = await bot.users.fetch(target.id, { force: true });
            if (fetchedUser.bannerURL()) {
                embed.setImage(fetchedUser.bannerURL({ size: 1024 }));
            }
        } catch (e) {}

        await message.reply({ embeds: [embed] });
    }
};
