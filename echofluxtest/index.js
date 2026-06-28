const dotenv = require('dotenv');
dotenv.config();

require('./src/utils/patchDiscord');

const MusicBot = require('./src/core/bot');
const { setupLavalink } = require('./src/core/lavalink');

const EchoFluxTest_LOGO = String.raw`
  ______      _           ______  _                 
 |  ____|    | |         |  ____|| |                
 | |__   ___ | |__   ___ | |__   | |  ___ __      __
 |  __| / __|| '_ \ / _ \|  __|  | | / _ \\ \ /\ / /
 | |___| (__ | | | | (_) | |     | || (_) |\ V  V / 
 |______\___||_| |_|\___/|_|     |_| \___/  \_/\_/  
`;

function setupTerminal() {
    try {
        if (process.platform === 'win32') {
            process.stdout.write('\u001b]0;EchoFluxTest Music Bot\u0007');
        }
        process.stdout.write('\u001b[2J\u001b[3J\u001b[H');
    } catch (e) { }

    console.log(`\x1b[1;36m${EchoFluxTest_LOGO}\x1b[0m`);
    console.log(`\x1b[90m${'─'.repeat(54)}\x1b[0m`);
    console.log(`\x1b[1;34m  EchoFluxTest Music Bot\x1b[0m  \x1b[90m│\x1b[0m  \x1b[33mStarting up...\x1b[0m`);
    console.log(`\x1b[90m${'─'.repeat(54)}\x1b[0m\n`);
}

async function main() {
    setupTerminal();

    const bot = new MusicBot();
    const token = process.env.TOKEN;

    if (!token) {
        console.error('\x1b[1;31m[ERROR]\x1b[0m No TOKEN found in .env file. Please add your bot token.');
        return;
    }

    // ── Database ──────────────────────────────────────────────
    process.stdout.write('\x1b[90m  ◈\x1b[0m \x1b[33mDatabase\x1b[0m  Initializing SQLite...');
    const { initDb } = require('./src/utils/db');
    const { loadCaches } = require('./src/utils/dbBridge');
    try {
        await initDb();
        await loadCaches();
        console.log('\r\x1b[90m  ◈\x1b[0m \x1b[33mDatabase\x1b[0m  \x1b[32m✓ Ready\x1b[0m                    ');
    } catch (dbErr) {
        console.log('\r\x1b[90m  ◈\x1b[0m \x1b[33mDatabase\x1b[0m  \x1b[31m✗ Failed\x1b[0m                   ');
        console.error('\x1b[1;31m[DB ERROR]\x1b[0m', dbErr.message);
        process.exit(1);
    }

    // ── Events & Commands ─────────────────────────────────────
    process.stdout.write('\x1b[90m  ◈\x1b[0m \x1b[33mModules\x1b[0m   Loading events & commands...');
    await bot.loadEvents();
    await bot.loadCommands();

    // ── Lavalink ──────────────────────────────────────────────
    setupLavalink(bot);

    bot.on('error', (error) => {
        console.error('\x1b[1;31m[ERROR]\x1b[0m Discord client error:', error);
    });

    bot.login(token).catch(err => {
        console.error('\x1b[1;31m[ERROR]\x1b[0m Failed to login to Discord:', err);
    });

    process.on('unhandledRejection', (error) => {
        console.error('\x1b[90m[WARN]\x1b[0m Unhandled promise rejection:', error);
    });

    process.on('uncaughtException', (error) => {
        console.error('\x1b[1;31m[ERROR]\x1b[0m Uncaught exception:', error);
    });
}

main().catch(err => {
    console.error('Critical error in main loop:', err);
});
