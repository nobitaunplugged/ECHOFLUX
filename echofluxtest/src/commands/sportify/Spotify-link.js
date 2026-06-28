const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require("discord.js");
const dbBridge = require("../../utils/dbBridge");
const { parseSpotifyUrl, fetchUserData, fetchUserPlaylists } = require("../../utils/SpotifyManager");
const { getEmbedColor } = require("../../utils/embedHelpers");

module.exports = {
    name: "link-spotify",
    aliases: ["spotify-link", "connect-spotify"],
    description: "Link your Spotify profile to access your public playlists",
    async execute(bot, message, args) {
        if (!args || args.length === 0) {
            const setupRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Spotify Dashboard")
                    .setURL("https://developer.spotify.com/dashboard")
                    .setStyle(ButtonStyle.Link),
                new ButtonBuilder()
                    .setLabel("Setup Guide")
                    .setURL("https://developer.spotify.com/documentation/web-api")
                    .setStyle(ButtonStyle.Link)
            );
            return message.reply({
                embeds: [this._createUsageEmbed(bot, message.author)],
                components: [setupRow]
            });
        }

        return this._handleLink(bot, message.author, args[0], message);
    },

    async _handleLink(bot, user, profileUrl, context) {
        const parsed = parseSpotifyUrl(profileUrl);
        if (!parsed || parsed.type !== "user") {
            return this._reply(context, this._createInvalidUrlEmbed(bot, user));
        }

        const loadingMessage = await this._reply(
            context,
            this._createLoadingEmbed(bot, user),
        );

        try {
            const userData = await fetchUserData(profileUrl);

            if (!userData) {
                return this._editReply(loadingMessage, this._createNotFoundEmbed(bot, user));
            }

            // Save linked profile to database (PostgreSQL)
            await dbBridge.saveSpotifyLink(user.id, userData.displayName, userData.profileUrl);

            let playlistCount = 0;
            try {
                const playlists = await fetchUserPlaylists(profileUrl);
                playlistCount = playlists ? playlists.length : 0;
            } catch (error) {
                console.warn("[SPOTIFY] Could not fetch playlists count for user:", user.id, error.message);
            }

            return this._editReply(
                loadingMessage,
                this._createSuccessEmbed(bot, user, userData, playlistCount),
            );
        } catch (error) {
            console.error("[SPOTIFY] Error linking Spotify profile:", error.message);
            const setupRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Spotify Developer Dashboard")
                    .setURL("https://developer.spotify.com/dashboard")
                    .setStyle(ButtonStyle.Link),
                new ButtonBuilder()
                    .setLabel("Get API Keys")
                    .setURL("https://developer.spotify.com/documentation/web-api/concepts/apps")
                    .setStyle(ButtonStyle.Link)
            );
            return this._editReply(
                loadingMessage,
                this._createErrorEmbed(bot, user, "An error occurred while linking your Spotify profile. Please check if SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are correctly configured in the bot's environment (.env file)."),
                setupRow
            );
        }
    },

    _createUsageEmbed(bot, author) {
        const embed = new EmbedBuilder()
            .setTitle("<:spotify:1502012709460250746> Link Spotify Profile")
            .setColor(getEmbedColor() || 0x00d2ff)
            .setThumbnail(bot.user.displayAvatarURL())
            .setDescription(
                `**Missing Profile URL**\n` +
                `**Status:** <:cross:1488582282020126881> URL Required\n\n` +
                `Please provide your Spotify profile URL to link your account.\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `**<:information:1502013167830827048> Usage:**\n` +
                `├─ \`link-spotify <profile_url>\`\n` +
                `├─ \`spotify-link <profile_url>\`\n` +
                `└─ \`connect-spotify <profile_url>\`\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `**<:setup:1502014141957672980> Example:**\n` +
                `\`link-spotify https://open.spotify.com/user/your_username\`\n\n` +
                `*Get your profile URL from the Spotify app or web player*`
            );
        return embed;
    },

    _createLoadingEmbed(bot, author) {
        const loadingEmoji = bot.getEmoji("loading", "<a:loading1:1488582519304618236>");
        const embed = new EmbedBuilder()
            .setTitle(`${loadingEmoji} Connecting to Spotify`)
            .setColor(getEmbedColor() || 0x00d2ff)
            .setThumbnail(bot.user.displayAvatarURL())
            .setDescription(
                `**Verifying Spotify Profile**\n` +
                `**Status:** Connecting...\n\n` +
                `Please wait while we verify your Spotify profile and fetch your data.\n\n` +
                `*This may take a few seconds...*`
            );
        return embed;
    },

    _createInvalidUrlEmbed(bot, author) {
        const embed = new EmbedBuilder()
            .setTitle("<:cross:1488582282020126881> Invalid Spotify URL")
            .setColor(getEmbedColor() || 0x00d2ff)
            .setThumbnail(bot.user.displayAvatarURL())
            .setDescription(
                `**Invalid Profile URL Format**\n` +
                `**Status:** URL Invalid\n\n` +
                `Please provide a valid Spotify profile URL.\n\n` +
                `**Valid Format:**\n` +
                `├─ \`https://open.spotify.com/user/username\`\n` +
                `├─ \`https://open.spotify.com/user/123456789\`\n` +
                `└─ Must be a user profile URL\n\n` +
                `**How to get your URL:**\n` +
                `├─ Open Spotify app or web player\n` +
                `├─ Go to your profile\n` +
                `├─ Click the three dots (...)\n` +
                `└─ Select "Copy link to profile"`
            );
        return embed;
    },

    _createNotFoundEmbed(bot, author) {
        const embed = new EmbedBuilder()
            .setTitle("<:cross:1488582282020126881> Profile Not Found")
            .setColor(getEmbedColor() || 0x00d2ff)
            .setThumbnail(bot.user.displayAvatarURL())
            .setDescription(
                `**Spotify Profile Not Accessible**\n` +
                `**Status:** Profile Not Found\n\n` +
                `Could not access the Spotify profile at the provided URL.\n\n` +
                `**Possible Issues:**\n` +
                `├─ Profile URL is incorrect\n` +
                `├─ Profile is private or deleted\n` +
                `└─ Temporary Spotify API issue\n\n` +
                `**Solutions:**\n` +
                `├─ Make sure your profile is public\n` +
                `└─ Try again in a few minutes`
            );
        return embed;
    },

    _createSuccessEmbed(bot, author, userData, playlistCount) {
        const folderEmoji = bot.getEmoji("folder", "📁");
        const infoEmoji = bot.getEmoji("info", "ℹ️");
        const thumbnailUrl = userData.images?.[0]?.url || bot.user.displayAvatarURL();

        let playlistInfo = "";
        if (playlistCount > 0) {
            playlistInfo =
                `**${folderEmoji} Public Playlists:** ${playlistCount} found\n\n` +
                `**${infoEmoji} Next Steps:**\n` +
                `├─ Use \`spotify-playlists\` to view your playlists\n` +
                `└─ Access enhanced Spotify features\n\n`;
        } else {
            playlistInfo =
                `**${folderEmoji} Public Playlists:** None found\n\n` +
                `**${infoEmoji} Note:**\n` +
                `├─ Make your playlists public to use them\n` +
                `└─ Re-link anytime to refresh playlist data\n\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle("<:tick:1488582269298807024> Profile Linked Successfully")
            .setColor(getEmbedColor() || 0x00d2ff)
            .setThumbnail(thumbnailUrl)
            .setDescription(
                `**Spotify profile successfully linked**\n\n` +
                `**Profile:** ${userData.displayName || "Unknown"}\n` +
                `**Linked On:** ${new Date().toLocaleDateString()}\n\n` +
                `${playlistInfo}` +
                `*Welcome to Spotify integration!*`
            );
        return embed;
    },

    _createErrorEmbed(bot, author, messageText) {
        const embed = new EmbedBuilder()
            .setTitle("<:cross:1488582282020126881> Error")
            .setColor(getEmbedColor() || 0x00d2ff)
            .setThumbnail(bot.user.displayAvatarURL())
            .setDescription(messageText);
        return embed;
    },

    async _reply(context, embed, actionRow = null) {
        const options = { embeds: [embed] };
        if (actionRow) options.components = [actionRow];
        
        if (context.replied || context.deferred) {
            return context.editReply(options);
        } else {
            return context.reply(options);
        }
    },

    async _editReply(message, embed, actionRow = null) {
        const options = { embeds: [embed] };
        options.components = actionRow ? [actionRow] : [];
        return message.edit(options);
    }
};
