const path = require('path');
const fs = require('fs-extra');
const { WebhookClient } = require('discord.js');

const WEBHOOK_FILE = path.join(__dirname, '..', '..', 'data', 'webhooks.json');

function getWebhookUrl(key) {
    try {
        if (!fs.existsSync(WEBHOOK_FILE)) return null;
        const data = fs.readJsonSync(WEBHOOK_FILE);
        
        // Find key case-insensitively
        const searchKey = String(key).toLowerCase();
        let matchedKey = null;
        for (const k of Object.keys(data)) {
            if (k.toLowerCase() === searchKey) {
                matchedKey = k;
                break;
            }
        }
        
        if (!matchedKey) return null;
        const urls = data[matchedKey];
        if (Array.isArray(urls) && urls.length > 0) {
            const url = urls[0];
            if (typeof url === 'string' && url.startsWith('http')) {
                return url;
            }
        }
    } catch (error) {
        // Silent catch
    }
    return null;
}

function convertToLegacyEmbed(embed) {
    if (!embed) return null;
    
    // If it has toJSON, but it has been overridden to return V2 Container, reconstruct standard embed
    if (typeof embed.toJSON === 'function') {
        const json = embed.toJSON();
        if (json.type === 17 || json.type === 'Container' || json.type === 19 || (json.components && json.type === undefined)) {
            const legacy = {};
            if (embed.title) legacy.title = embed.title;
            if (embed.description) legacy.description = embed.description;
            if (embed.color !== undefined && embed.color !== null) {
                // Convert hex string color to decimal integer if necessary
                if (typeof embed.color === 'string') {
                    legacy.color = parseInt(embed.color.replace('#', ''), 16);
                } else {
                    legacy.color = embed.color;
                }
            }
            if (embed.url) legacy.url = embed.url;
            if (embed.author) {
                legacy.author = {
                    name: embed.author.name,
                    icon_url: embed.author.iconURL || embed.author.icon_url,
                    url: embed.author.url
                };
            }
            if (embed.thumbnail) {
                legacy.thumbnail = { url: typeof embed.thumbnail === 'string' ? embed.thumbnail : embed.thumbnail.url };
            }
            if (embed.image) {
                legacy.image = { url: typeof embed.image === 'string' ? embed.image : embed.image.url };
            }
            if (embed.footer) {
                legacy.footer = {
                    text: embed.footer.text,
                    icon_url: embed.footer.iconURL || embed.footer.icon_url
                };
            }
            if (embed.timestamp) {
                legacy.timestamp = new Date(embed.timestamp).toISOString();
            }
            if (embed.fields && embed.fields.length > 0) {
                legacy.fields = embed.fields.map(f => ({
                    name: f.name,
                    value: f.value,
                    inline: f.inline
                }));
            }
            return legacy;
        }
        return json;
    }
    
    return embed;
}

function cleanObjectEmojis(obj) {
    if (!obj) return obj;
    if (typeof obj === 'string') {
        return obj.replace(/<a?:\w+:\d+>/g, '').trim();
    }
    if (Array.isArray(obj)) {
        return obj.map(cleanObjectEmojis);
    }
    if (typeof obj === 'object') {
        const cleaned = {};
        for (const [key, val] of Object.entries(obj)) {
            cleaned[key] = cleanObjectEmojis(val);
        }
        return cleaned;
    }
    return obj;
}

async function sendWebhookLog(key, embed, components = []) {
    const url = getWebhookUrl(key);
    if (!url) return;

    try {
        const client = new WebhookClient({ url });
        const legacyEmbed = convertToLegacyEmbed(embed);
        const cleanedEmbed = cleanObjectEmojis(legacyEmbed);
        await client.send({
            embeds: [cleanedEmbed],
            components: components,
            username: "EchoFluxTest Logger"
        });
    } catch (error) {
        console.error(`\x1b[1;31m[WEBHOOK]\x1b[0m Failed to send ${key}:`, error);
    }
}

module.exports = {
    getWebhookUrl,
    sendWebhookLog
};
