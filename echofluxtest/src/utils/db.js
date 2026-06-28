const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');

const DB_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DB_DIR, 'database.db');

let db = null;

function getDb() {
    if (!db) {
        fs.ensureDirSync(DB_DIR);
        db = new sqlite3.Database(DB_FILE);
    }
    return db;
}

// Promisified query helpers
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        getDb().get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function initDb() {
    fs.ensureDirSync(DB_DIR);
    try {
        fs.chmodSync(DB_DIR, 0o777);
        if (fs.existsSync(DB_FILE)) {
            fs.chmodSync(DB_FILE, 0o666);
        }
    } catch (e) {
        console.warn("[DB WARNING] Failed to set permissions for database directory or file:", e.message);
    }

    await run(`
        CREATE TABLE IF NOT EXISTS prefixes (
            guild_id TEXT PRIMARY KEY,
            prefix TEXT NOT NULL
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS spotify_links (
            user_id TEXT PRIMARY KEY,
            display_name TEXT,
            profile_url TEXT NOT NULL,
            linked_at INTEGER NOT NULL
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS blacklists (
            user_id TEXT PRIMARY KEY,
            reason TEXT,
            added_at INTEGER NOT NULL
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS noprefix (
            user_id TEXT PRIMARY KEY,
            expires_at TEXT NOT NULL
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS ignored_channels (
            guild_id TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            PRIMARY KEY (guild_id, channel_id)
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS twentyfourseven (
            guild_id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS favourites (
            user_id TEXT NOT NULL,
            track_uri TEXT NOT NULL,
            track_data TEXT NOT NULL,
            PRIMARY KEY (user_id, track_uri)
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS premium (
            guild_id TEXT PRIMARY KEY,
            expires_at TEXT NOT NULL
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS custombot (
            user_id TEXT PRIMARY KEY,
            config TEXT NOT NULL
        )
    `);
}

module.exports = {
    initDb,
    getDb,
    run,
    all,
    get
};
