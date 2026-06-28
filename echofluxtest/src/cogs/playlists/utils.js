const { loadJson, saveJson } = require('../../utils/dataManager');

const PLAYLIST_FILE = "playlist.json";

function loadPlaylists() {
    return loadJson(PLAYLIST_FILE, {});
}

function savePlaylists(data) {
    saveJson(PLAYLIST_FILE, data);
}

function userHasPlaylist(userId, playlistName) {
    const data = loadPlaylists();
    return playlistName in (data[String(userId)] || {});
}

function createPlaylist(userId, playlistName) {
    const data = loadPlaylists();
    const uId = String(userId);
    if (!data[uId]) {
        data[uId] = {};
    }
    if (data[uId][playlistName]) {
        return false;
    }
    data[uId][playlistName] = [];
    savePlaylists(data);
    return true;
}

function deletePlaylist(userId, playlistName) {
    const data = loadPlaylists();
    const uId = String(userId);
    if (data[uId] && data[uId][playlistName]) {
        delete data[uId][playlistName];
        savePlaylists(data);
        return true;
    }
    return false;
}

function addTrackToPlaylist(userId, playlistName, trackData) {
    const data = loadPlaylists();
    const uId = String(userId);
    if (data[uId] && data[uId][playlistName]) {
        data[uId][playlistName].push(trackData);
        savePlaylists(data);
        return true;
    }
    return false;
}

function removeTrackFromPlaylist(userId, playlistName, index) {
    const data = loadPlaylists();
    const uId = String(userId);
    if (data[uId] && data[uId][playlistName]) {
        const list = data[uId][playlistName];
        if (index >= 0 && index < list.length) {
            list.splice(index, 1);
            savePlaylists(data);
            return true;
        }
    }
    return false;
}

function getPlaylist(userId, playlistName) {
    const data = loadPlaylists();
    const uId = String(userId);
    return data[uId] && data[uId][playlistName] ? data[uId][playlistName] : null;
}

function getUserPlaylists(userId) {
    const data = loadPlaylists();
    const uId = String(userId);
    return data[uId] || {};
}

module.exports = {
    loadPlaylists,
    savePlaylists,
    userHasPlaylist,
    createPlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    getPlaylist,
    getUserPlaylists
};
