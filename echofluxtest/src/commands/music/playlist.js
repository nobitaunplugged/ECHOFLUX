const playlistCommand = require('../../cogs/playlists/playlist');

module.exports = {
    name: playlistCommand.name,
    aliases: playlistCommand.aliases,
    description: playlistCommand.description,
    async execute(bot, message, args) {
        return playlistCommand.execute(bot, message, args);
    }
};
