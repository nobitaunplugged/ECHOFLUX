const db = require('./db');

const prefixesCache = new Map();
const blacklistsCache = new Map();
const noprefixCache = new Map();
const ignoredChannelsCache = new Map(); // guild_id -> Set of channel_ids
const twentyfoursevenCache = new Map(); // guild_id -> channel_id
const premiumCache = new Map(); // guild_id -> expires_at
const custombotCache = new Map(); // user_id -> config
const spotifyLinksCache = new Map(); // user_id -> profile data

async function loadCaches() {
    try {
        // 1. Prefixes
        const prefixesRes = await db.all("SELECT * FROM prefixes");
        prefixesCache.clear();
        for (const row of prefixesRes) {
            prefixesCache.set(row.guild_id, row.prefix);
        }

        // 2. Blacklists
        const blacklistsRes = await db.all("SELECT * FROM blacklists");
        blacklistsCache.clear();
        for (const row of blacklistsRes) {
            blacklistsCache.set(row.user_id, { reason: row.reason, addedAt: row.added_at });
        }

        // 3. NoPrefix
        const noprefixRes = await db.all("SELECT * FROM noprefix");
        noprefixCache.clear();
        for (const row of noprefixRes) {
            noprefixCache.set(row.user_id, row.expires_at);
        }

        // 4. Ignored Channels
        const ignoredRes = await db.all("SELECT * FROM ignored_channels");
        ignoredChannelsCache.clear();
        for (const row of ignoredRes) {
            if (!ignoredChannelsCache.has(row.guild_id)) {
                ignoredChannelsCache.set(row.guild_id, new Set());
            }
            ignoredChannelsCache.get(row.guild_id).add(row.channel_id);
        }

        // 5. 24/7 Channels
        const tfRes = await db.all("SELECT * FROM twentyfourseven WHERE enabled = 1");
        twentyfoursevenCache.clear();
        for (const row of tfRes) {
            twentyfoursevenCache.set(row.guild_id, row.channel_id);
        }

        // 6. Premium
        const premiumRes = await db.all("SELECT * FROM premium");
        premiumCache.clear();
        for (const row of premiumRes) {
            premiumCache.set(row.guild_id, row.expires_at);
        }

        // 7. CustomBot
        const cbRes = await db.all("SELECT * FROM custombot");
        custombotCache.clear();
        for (const row of cbRes) {
            try {
                custombotCache.set(row.user_id, JSON.parse(row.config));
            } catch (e) {
                custombotCache.set(row.user_id, {});
            }
        }

        // 8. Spotify Links
        const spotifyRes = await db.all("SELECT * FROM spotify_links");
        spotifyLinksCache.clear();
        for (const row of spotifyRes) {
            spotifyLinksCache.set(row.user_id, {
                userId: row.user_id,
                displayName: row.display_name,
                profileUrl: row.profile_url,
                linkedAt: Number(row.linked_at)
            });
        }
    } catch (error) {
        console.error("[DATABASE] Error loading database caches:", error.message);
    }
}

// ─── PREFIX METHODS ──────────────────────────────────────────────────────────

function getPrefix(guildId, defaultPrefix = '.') {
    if (!guildId) return defaultPrefix;
    return prefixesCache.get(String(guildId)) || defaultPrefix;
}

async function setPrefix(guildId, prefix) {
    const gidStr = String(guildId);
    await db.run(
        "INSERT OR REPLACE INTO prefixes (guild_id, prefix) VALUES (?, ?)",
        [gidStr, prefix]
    );
    prefixesCache.set(gidStr, prefix);
}

// ─── BLACKLIST METHODS ────────────────────────────────────────────────────────

function isBlacklisted(userId) {
    return blacklistsCache.has(String(userId));
}

async function addBlacklist(userId, reason) {
    const uidStr = String(userId);
    const now = Date.now();
    await db.run(
        "INSERT OR REPLACE INTO blacklists (user_id, reason, added_at) VALUES (?, ?, ?)",
        [uidStr, reason, now]
    );
    blacklistsCache.set(uidStr, { reason, addedAt: now });
}

async function removeBlacklist(userId) {
    const uidStr = String(userId);
    await db.run("DELETE FROM blacklists WHERE user_id = ?", [uidStr]);
    blacklistsCache.delete(uidStr);
}

function getBlacklistData() {
    const obj = {};
    for (const [key, val] of blacklistsCache.entries()) {
        obj[key] = val.reason || "";
    }
    return obj;
}

// ─── NO PREFIX METHODS ────────────────────────────────────────────────────────

function hasNoPrefixAccess(userId) {
    const uidStr = String(userId);
    if (!noprefixCache.has(uidStr)) return false;
    const expiresAt = noprefixCache.get(uidStr);
    if (expiresAt === "Permanent") return true;
    
    try {
        const expTime = parseFloat(expiresAt);
        if (Date.now() < expTime * 1000) {
            return true;
        } else {
            // Asynchronously delete expired entry
            db.run("DELETE FROM noprefix WHERE user_id = ?", [uidStr]).catch(() => {});
            noprefixCache.delete(uidStr);
            return false;
        }
    } catch (e) {
        return false;
    }
}

async function addNoPrefix(userId, expiresAt) {
    const uidStr = String(userId);
    const expStr = String(expiresAt);
    await db.run(
        "INSERT OR REPLACE INTO noprefix (user_id, expires_at) VALUES (?, ?)",
        [uidStr, expStr]
    );
    noprefixCache.set(uidStr, expStr);
}

async function removeNoPrefix(userId) {
    const uidStr = String(userId);
    await db.run("DELETE FROM noprefix WHERE user_id = ?", [uidStr]);
    noprefixCache.delete(uidStr);
}

function getNoPrefixData() {
    const obj = {};
    for (const [key, val] of noprefixCache.entries()) {
        obj[key] = val;
    }
    return obj;
}

// ─── IGNORED CHANNELS ─────────────────────────────────────────────────────────

function getIgnoredChannels(guildId) {
    const gidStr = String(guildId);
    const channels = ignoredChannelsCache.get(gidStr);
    return channels ? Array.from(channels) : [];
}

async function addIgnoredChannel(guildId, channelId) {
    const gidStr = String(guildId);
    const cidStr = String(channelId);
    await db.run(
        "INSERT OR IGNORE INTO ignored_channels (guild_id, channel_id) VALUES (?, ?)",
        [gidStr, cidStr]
    );
    if (!ignoredChannelsCache.has(gidStr)) {
        ignoredChannelsCache.set(gidStr, new Set());
    }
    ignoredChannelsCache.get(gidStr).add(cidStr);
}

async function removeIgnoredChannel(guildId, channelId) {
    const gidStr = String(guildId);
    const cidStr = String(channelId);
    await db.run("DELETE FROM ignored_channels WHERE guild_id = ? AND channel_id = ?", [gidStr, cidStr]);
    if (ignoredChannelsCache.has(gidStr)) {
        ignoredChannelsCache.get(gidStr).delete(cidStr);
        if (ignoredChannelsCache.get(gidStr).size === 0) {
            ignoredChannelsCache.delete(gidStr);
        }
    }
}

// ─── 24/7 CHANNELS ────────────────────────────────────────────────────────────

function get247Channel(guildId) {
    return twentyfoursevenCache.get(String(guildId)) || null;
}

async function set247Channel(guildId, channelId, enabled) {
    const gidStr = String(guildId);
    const cidStr = String(channelId);
    if (enabled) {
        await db.run(
            "INSERT OR REPLACE INTO twentyfourseven (guild_id, channel_id, enabled) VALUES (?, ?, 1)",
            [gidStr, cidStr]
        );
        twentyfoursevenCache.set(gidStr, cidStr);
    } else {
        await db.run("DELETE FROM twentyfourseven WHERE guild_id = ?", [gidStr]);
        twentyfoursevenCache.delete(gidStr);
    }
}

// ─── PREMIUM CONFIGS ─────────────────────────────────────────────────────────

function isGuildPremium(guildId) {
    const gidStr = String(guildId);
    if (!premiumCache.has(gidStr)) return false;
    const expiresAt = premiumCache.get(gidStr);
    if (expiresAt === "Permanent") return true;

    try {
        if (Date.now() < parseFloat(expiresAt) * 1000) {
            return true;
        } else {
            db.run("DELETE FROM premium WHERE guild_id = ?", [gidStr]).catch(() => {});
            premiumCache.delete(gidStr);
            return false;
        }
    } catch (e) {
        return false;
    }
}

async function setGuildPremium(guildId, expiresAt) {
    const gidStr = String(guildId);
    const expStr = String(expiresAt);
    await db.run(
        "INSERT OR REPLACE INTO premium (guild_id, expires_at) VALUES (?, ?)",
        [gidStr, expStr]
    );
    premiumCache.set(gidStr, expStr);
}

function getPremiumConfig() {
    const obj = {};
    for (const [key, val] of premiumCache.entries()) {
        obj[key] = val;
    }
    return obj;
}

// ─── CUSTOM BOT ──────────────────────────────────────────────────────────────

function getCustomBotConfig(userId) {
    return custombotCache.get(String(userId)) || null;
}

async function setCustomBotConfig(userId, config) {
    const uidStr = String(userId);
    await db.run(
        "INSERT OR REPLACE INTO custombot (user_id, config) VALUES (?, ?)",
        [uidStr, JSON.stringify(config)]
    );
    custombotCache.set(uidStr, config);
}

async function removeCustomBotConfig(userId) {
    const uidStr = String(userId);
    await db.run("DELETE FROM custombot WHERE user_id = ?", [uidStr]);
    custombotCache.delete(uidStr);
}

// ─── SPOTIFY LINKS ───────────────────────────────────────────────────────────

function getSpotifyProfile(userId) {
    return spotifyLinksCache.get(String(userId)) || null;
}

async function saveSpotifyLink(userId, displayName, profileUrl) {
    const uidStr = String(userId);
    const now = Date.now();
    await db.run(
        "INSERT OR REPLACE INTO spotify_links (user_id, display_name, profile_url, linked_at) VALUES (?, ?, ?, ?)",
        [uidStr, displayName, profileUrl, now]
    );
    spotifyLinksCache.set(uidStr, {
        userId: uidStr,
        displayName,
        profileUrl,
        linkedAt: now
    });
}

async function removeSpotifyLink(userId) {
    const uidStr = String(userId);
    await db.run("DELETE FROM spotify_links WHERE user_id = ?", [uidStr]);
    spotifyLinksCache.delete(uidStr);
}

// ─── FAVOURITES METHODS ───────────────────────────────────────────────────────

async function getUserFavourites(userId) {
    const uidStr = String(userId);
    const rows = await db.all("SELECT track_data FROM favourites WHERE user_id = ?", [uidStr]);
    return rows.map(row => {
        try {
            return JSON.parse(row.track_data);
        } catch (e) {
            return null;
        }
    }).filter(Boolean);
}

async function addFavourite(userId, trackData) {
    const uidStr = String(userId);
    const uri = trackData.uri;
    if (!uri) return false;

    // Check duplicate
    const check = await db.get("SELECT 1 FROM favourites WHERE user_id = ? AND track_uri = ?", [uidStr, uri]);
    if (check) return false;

    await db.run(
        "INSERT INTO favourites (user_id, track_uri, track_data) VALUES (?, ?, ?)",
        [uidStr, uri, JSON.stringify(trackData)]
    );
    return true;
}

async function removeFavourite(userId, uri) {
    const uidStr = String(userId);
    const result = await db.run("DELETE FROM favourites WHERE user_id = ? AND track_uri = ?", [uidStr, uri]);
    return result.changes > 0;
}

async function removeFavouriteByIndex(userId, index) {
    const uidStr = String(userId);
    const rows = await db.all("SELECT track_uri FROM favourites WHERE user_id = ? ORDER BY track_uri", [uidStr]);
    if (index >= 0 && index < rows.length) {
        const uri = rows[index].track_uri;
        await db.run("DELETE FROM favourites WHERE user_id = ? AND track_uri = ?", [uidStr, uri]);
        return true;
    }
    return false;
}

async function clearFavourites(userId) {
    const uidStr = String(userId);
    const result = await db.run("DELETE FROM favourites WHERE user_id = ?", [uidStr]);
    return result.changes > 0;
}

module.exports = {
    loadCaches,
    getPrefix,
    setPrefix,
    isBlacklisted,
    addBlacklist,
    removeBlacklist,
    getBlacklistData,
    hasNoPrefixAccess,
    addNoPrefix,
    removeNoPrefix,
    getNoPrefixData,
    getIgnoredChannels,
    addIgnoredChannel,
    removeIgnoredChannel,
    get247Channel,
    set247Channel,
    isGuildPremium,
    setGuildPremium,
    getPremiumConfig,
    getCustomBotConfig,
    setCustomBotConfig,
    removeCustomBotConfig,
    getSpotifyProfile,
    saveSpotifyLink,
    removeSpotifyLink,
    getUserFavourites,
    addFavourite,
    removeFavourite,
    removeFavouriteByIndex,
    clearFavourites
};
