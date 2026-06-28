const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const os = require('os');

function formatBytes(bytesInt) {
    let size = bytesInt;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIdx = 0;
    while (size >= 1024.0 && unitIdx < units.length - 1) {
        size /= 1024.0;
        unitIdx++;
    }
    return `${size.toFixed(2)} ${units[unitIdx]}`;
}

function formatTime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const pad = (n) => String(n).padStart(2, '0');
    if (d > 0) {
        return `${d} day${d > 1 ? 's' : ''}, ${pad(h)}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function getCpuUsageSample() {
    const cpus = os.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
    for (let cpu of cpus) {
        user += cpu.times.user;
        nice += cpu.times.nice;
        sys += cpu.times.sys;
        idle += cpu.times.idle;
        irq += cpu.times.irq;
    }
    const total = user + nice + sys + idle + irq;
    return { idle, total };
}

function getCpuUsage() {
    return new Promise((resolve) => {
        const start = getCpuUsageSample();
        setTimeout(() => {
            const end = getCpuUsageSample();
            const idleDifference = end.idle - start.idle;
            const totalDifference = end.total - start.total;
            if (totalDifference === 0) return resolve(0);
            const percentage = 100 - Math.round(100 * idleDifference / totalDifference);
            resolve(percentage);
        }, 100);
    });
}

module.exports = {
    name: 'stats',
    aliases: ['shard', 'status', 'stat'],
    description: "Shows bot's shard stats",
    async execute(bot, message, args) {
        const loadingEmbed = new EmbedBuilder()
            .setDescription("<a:stolen_emoji:1518017525844017236> **Fetching details please wait . . . **")
            .setColor(0x00d2ff);

        const msg = await message.reply({ embeds: [loadingEmbed] });

        // Calculate CPU usage asynchronously
        const cpuUsage = await getCpuUsage();
        const ramUsage = process.memoryUsage().rss;
        const uptime = bot.uptime ? Math.floor(bot.uptime / 1000) : Math.floor((Date.now() - (bot.uptimeStart || Date.now())) / 1000);

        // Gather Lavalink/Shoukaku Stats
        let activePlayers = 0;
        let totalPlayers = 0;
        if (bot.lavalink && bot.lavalink.players) {
            const players = [...bot.lavalink.players.values()];
            activePlayers = players.filter(p => p.playing || (p.track && !p.paused)).length;
            totalPlayers = players.length;
        }

        // Gather Discord Stats
        const totalServers = bot.guilds.cache.size;
        const totalUsers = bot.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);

        // -- EMBED 1: Bot Stats --
        const statsEmbed = new EmbedBuilder()
            .setTitle("<:information:1502013167830827048> EchoFluxTest System Status")
            .setDescription("Here is the current system and network status of the bot.")
            .setColor(0x00d2ff)
            .setFooter({ text: "Page : [1/3] • Powered by Gacky & Matrix Studio" });

        if (bot.user.displayAvatarURL()) {
            statsEmbed.setThumbnail(bot.user.displayAvatarURL());
        }

        const ping = Math.round(bot.ws.ping);
        statsEmbed.addFields(
            {
                name: "<:folder:1502013152961761342> Performance",
                value: `**Version:** \`v2.2.0\`\n**Ping:** \`${ping}ms\`\n**Uptime:** \`${formatTime(uptime)}\`\n**CPU:** \`${cpuUsage.toFixed(1)}%\`\n**RAM:** \`${formatBytes(ramUsage)}\``,
                inline: true
            },
            {
                name: "<:Queue:1488582309895602196> Network Stats",
                value: `**Servers:** \`${totalServers.toLocaleString()}\`\n**Users:** \`${totalUsers.toLocaleString()}\`\n**Active Players:** \`${activePlayers}/${totalPlayers}\``,
                inline: true
            }
        );

        // -- EMBED 2: Team Info --
        const teamEmbed = new EmbedBuilder()
            .setTitle("EchoFluxTest Team Information")
            .setColor(0x00d2ff)
            .setDescription(
                "**__Owner__ <:owner:1399680827914453026>**\n" +
                "[`1`] [Mr.CuteBoy](https://discord.com/users/1125130243045326949)\n" +
                "[`2`] [Mayaa](https://discord.com/users/888706502632816650)\n" +
                "**__Co Owners__ <:activedev:1399680843156291604>**\n" +
                "[`1`] [Mr.Nobita](https://discord.com/users/1197873154094288966)\n" +
                "[`2`] [Mr.Viperr](https://discord.com/users/1065202222771752990)\n"
            )
            .setFooter({ text: "Page : [2/3] • Powered by Gacky & Matrix Studio" });

        if (bot.user.displayAvatarURL()) {
            teamEmbed.setThumbnail(bot.user.displayAvatarURL());
        }

        // -- EMBED 3: Node Stats --
        const nodeStatsEmbed = new EmbedBuilder()
            .setTitle(`${bot.user.username} Node Status :`)
            .setColor(0x00d2ff)
            .setFooter({ text: "Page : [3/3] • Powered by Gacky & Matrix Studio" });

        const nodeDesc = [];
        if (bot.lavalink && bot.lavalink.nodes) {
            const nodes = [...bot.lavalink.nodes.values()];
            for (const node of nodes) {
                const stats = node.stats;
                if (!stats) {
                    nodeDesc.push(`**__<:config:1502013109836185600> [${node.name}](https://matrixdevelopment.pages.dev/)__**\n**⠀⠀⠀• Status:** \`Disconnected/No Stats\``);
                    continue;
                }

                const lavalinkCpu = (stats.cpu.lavalinkLoad || 0) * 100;
                const systemCpu = (stats.cpu.systemLoad || 0) * 100;
                const cores = stats.cpu.cores || 0;
                const playingPlayers = stats.playingPlayers || 0;
                const totalPlayersOnNode = stats.players || 0;
                const nodeUptime = Math.floor((stats.uptime || 0) / 1000);

                nodeDesc.push(
                    `**__[${node.name}](https://matrixdevelopment.pages.dev/)__**\n` +
                    `**• Players : **\`Playing: ${playingPlayers} / Total: ${totalPlayersOnNode}\`\n` +
                    `**• CPU : **\`Lavalink: ${lavalinkCpu.toFixed(2)}% | System: ${systemCpu.toFixed(2)}% (${cores} Cores)\`\n` +
                    `**• RAM : **\`${formatBytes(stats.memory.used || 0)} / ${formatBytes(stats.memory.allocated || 0)}\`\n` +
                    `**• Uptime : **\`${formatTime(nodeUptime)}\``
                );
            }
        }

        nodeStatsEmbed.setDescription(nodeDesc.join('\n\n') || "No Lavalink nodes connected.");

        const embeds = [statsEmbed, teamEmbed, nodeStatsEmbed];

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('stats_page_0')
                .setLabel('Stat')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('stats_page_1')
                .setLabel('Team Info')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('stats_page_2')
                .setLabel('Node')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('stats_stop')
                .setLabel('✗')
                .setStyle(ButtonStyle.Danger)
        );

        await msg.edit({ embeds: [embeds[0]], components: [row] });

        const filter = (interaction) => {
            if (interaction.user.id === message.author.id) {
                return true;
            }
            interaction.reply({
                content: `<:cross:1488582282020126881> Only **${message.author.username}** can use this.`,
                ephemeral: true
            }).catch(() => { });
            return false;
        };

        const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

        let currentPage = 0;

        collector.on('collect', async (interaction) => {
            const customId = interaction.customId;
            if (customId === 'stats_stop') {
                const disabledRow = new ActionRowBuilder().addComponents(
                    row.components.map(btn => ButtonBuilder.from(btn).setDisabled(true))
                );
                await interaction.update({ embeds: [embeds[currentPage]], components: [disabledRow] });
                collector.stop();
            } else {
                const pageIdx = parseInt(customId.split('_').pop());
                currentPage = pageIdx;
                await interaction.update({ embeds: [embeds[pageIdx]], components: [row] });
            }
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                const disabledRow = new ActionRowBuilder().addComponents(
                    row.components.map(btn => ButtonBuilder.from(btn).setDisabled(true))
                );
                msg.edit({ embeds: [embeds[currentPage]], components: [disabledRow] }).catch(() => { });
            }
        });
    }
};
