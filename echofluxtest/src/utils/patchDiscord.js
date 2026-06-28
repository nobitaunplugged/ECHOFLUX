const discord = require('discord.js');
const V2EmbedBuilder = require('./V2EmbedBuilder');

// 1. Override EmbedBuilder
discord.EmbedBuilder = V2EmbedBuilder;

// 2. Intercept MessagePayload.create
const { MessagePayload, MessageFlags } = discord;
const originalCreate = MessagePayload.create;

MessagePayload.create = function(target, options, extra = {}) {
    let resolvedOptions = typeof options !== 'object' || options === null 
        ? { content: options, ...extra } 
        : { ...options, ...extra };

    const isWebhook = target && (
        target.constructor?.name === 'WebhookClient' || 
        target.constructor?.name === 'Webhook' || 
        target.constructor?.name === 'InteractionWebhook'
    );

    if (isWebhook) {
        return originalCreate.call(this, target, resolvedOptions);
    }

    if (resolvedOptions.embeds && Array.isArray(resolvedOptions.embeds) && resolvedOptions.embeds.length > 0) {
        let containsV2 = false;
        const newEmbeds = [];
        let convertedComponents = [];

        for (const embed of resolvedOptions.embeds) {
            if (embed && typeof embed.toContainer === 'function') {
                containsV2 = true;
                
                const actionRows = (resolvedOptions.components || []).filter(c => {
                    if (!c) return false;
                    const type = c.data?.type ?? c.type;
                    return type !== 19 && type !== 'Container' && c.constructor?.name !== 'ContainerBuilder' && !(c instanceof discord.ContainerBuilder);
                });
                const client = target.client || global.client;
                const clientUser = client?.user;
                
                let clientColor = null;
                try {
                    const { getEmbedColor } = require('./embedHelpers');
                    clientColor = getEmbedColor();
                } catch (e) {
                    clientColor = process.env.EMBED_COLOR || "#00d2ff";
                }

                let author = null;
                if (target.interaction) {
                    author = target.interaction.user;
                } else if (target.mentions && target.mentions.repliedUser) {
                    author = target.mentions.repliedUser;
                } else {
                    author = target.author || target.user || (target.message ? (target.message.author || target.message.user) : null);
                }
                if (author && clientUser && author.id === clientUser.id) {
                    if (target.message && target.message.mentions && target.message.mentions.repliedUser) {
                        author = target.message.mentions.repliedUser;
                    }
                }

                const guild = target.guild || (target.message ? target.message.guild : null) || null;

                const container = embed.toContainer(clientColor, author, guild, clientUser, actionRows);
                convertedComponents.push(container);
            } else {
                newEmbeds.push(embed);
            }
        }

        if (containsV2) {
            resolvedOptions.embeds = newEmbeds;
            resolvedOptions.components = convertedComponents;
            
            let isComponentsV2Flag = MessageFlags.IsComponentsV2;
            if (typeof isComponentsV2Flag === 'bigint') {
                if (resolvedOptions.flags === undefined) {
                    resolvedOptions.flags = isComponentsV2Flag;
                } else {
                    if (typeof resolvedOptions.flags === 'bigint') {
                        resolvedOptions.flags |= isComponentsV2Flag;
                    } else if (typeof resolvedOptions.flags === 'number') {
                        resolvedOptions.flags |= Number(isComponentsV2Flag);
                    } else if (resolvedOptions.flags && typeof resolvedOptions.flags.add === 'function') {
                        resolvedOptions.flags.add(isComponentsV2Flag);
                    }
                }
            } else {
                if (resolvedOptions.flags === undefined) {
                    resolvedOptions.flags = isComponentsV2Flag;
                } else {
                    if (typeof resolvedOptions.flags === 'number') {
                        resolvedOptions.flags |= isComponentsV2Flag;
                    } else if (resolvedOptions.flags && typeof resolvedOptions.flags.add === 'function') {
                        resolvedOptions.flags.add(isComponentsV2Flag);
                    }
                }
            }
        }
    }

    // Auto-wrap raw component messages (like select menus/buttons) into V2 containers
    if (resolvedOptions.components && resolvedOptions.components.length > 0) {
        const hasContainer = resolvedOptions.components.some(c => {
            if (!c) return false;
            const type = c.data?.type ?? c.type;
            return type === 19 || type === 'Container' || c.constructor?.name === 'ContainerBuilder' || c instanceof discord.ContainerBuilder;
        });

        if (!hasContainer) {
            const client = target.client || global.client;
            const clientUser = client?.user;
            
            let clientColor = null;
            try {
                const { getEmbedColor } = require('./embedHelpers');
                clientColor = getEmbedColor();
            } catch (e) {
                clientColor = process.env.EMBED_COLOR || "#00d2ff";
            }

            let author = null;
            if (target.interaction) {
                author = target.interaction.user;
            } else if (target.mentions && target.mentions.repliedUser) {
                author = target.mentions.repliedUser;
            } else {
                author = target.author || target.user || (target.message ? (target.message.author || target.message.user) : null);
            }
            if (author && clientUser && author.id === clientUser.id) {
                if (target.message && target.message.mentions && target.message.mentions.repliedUser) {
                    author = target.message.mentions.repliedUser;
                }
            }

            const guild = target.guild || (target.message ? target.message.guild : null) || null;

            const embed = new V2EmbedBuilder()
                .setDescription(resolvedOptions.content || "")
                .setColor(clientColor);

            const container = embed.toContainer(clientColor, author, guild, clientUser, resolvedOptions.components);
            
            delete resolvedOptions.content;
            resolvedOptions.components = [container];
            
            let isComponentsV2Flag = MessageFlags.IsComponentsV2;
            if (typeof isComponentsV2Flag === 'bigint') {
                if (resolvedOptions.flags === undefined) {
                    resolvedOptions.flags = isComponentsV2Flag;
                } else {
                    if (typeof resolvedOptions.flags === 'bigint') {
                        resolvedOptions.flags |= isComponentsV2Flag;
                    } else if (typeof resolvedOptions.flags === 'number') {
                        resolvedOptions.flags |= Number(isComponentsV2Flag);
                    } else if (resolvedOptions.flags && typeof resolvedOptions.flags.add === 'function') {
                        resolvedOptions.flags.add(isComponentsV2Flag);
                    }
                }
            } else {
                if (resolvedOptions.flags === undefined) {
                    resolvedOptions.flags = isComponentsV2Flag;
                } else {
                    if (typeof resolvedOptions.flags === 'number') {
                        resolvedOptions.flags |= isComponentsV2Flag;
                    } else if (resolvedOptions.flags && typeof resolvedOptions.flags.add === 'function') {
                        resolvedOptions.flags.add(isComponentsV2Flag);
                    }
                }
            }
        }
    }

    // Strip MessageFlags.IsComponentsV2 if the payload has no V2 elements (neither V2 embeds nor V2 components)
    let hasV2 = false;
    if (resolvedOptions.embeds && Array.isArray(resolvedOptions.embeds)) {
        hasV2 = resolvedOptions.embeds.some(e => e && typeof e.toContainer === 'function');
    }
    if (resolvedOptions.components && Array.isArray(resolvedOptions.components)) {
        const hasContainer = resolvedOptions.components.some(c => {
            if (!c) return false;
            const type = c.data?.type ?? c.type;
            return type === 19 || type === 'Container' || c.constructor?.name === 'ContainerBuilder' || c instanceof discord.ContainerBuilder;
        });
        if (hasContainer) hasV2 = true;
    }

    const isComponentsV2Flag = MessageFlags.IsComponentsV2 || 32768;

    // Check if the target message already has the V2 flag set
    let messageHasV2 = false;
    const targetMsg = target && (target.message || (target.constructor?.name === 'Message' ? target : null));
    if (targetMsg && targetMsg.flags) {
        const bitfield = typeof targetMsg.flags.bitfield === 'number' 
            ? targetMsg.flags.bitfield 
            : (typeof targetMsg.flags === 'number' ? targetMsg.flags : 0);
        if (bitfield & Number(isComponentsV2Flag)) {
            messageHasV2 = true;
        }
    }

    if (messageHasV2) {
        // We MUST keep the flag set to avoid the DiscordAPIError
        hasV2 = true;
        if (resolvedOptions.flags === undefined) {
            resolvedOptions.flags = isComponentsV2Flag;
        } else {
            if (typeof resolvedOptions.flags === 'bigint') {
                resolvedOptions.flags |= BigInt(isComponentsV2Flag);
            } else if (typeof resolvedOptions.flags === 'number') {
                resolvedOptions.flags |= Number(isComponentsV2Flag);
            } else if (resolvedOptions.flags && typeof resolvedOptions.flags.add === 'function') {
                resolvedOptions.flags.add(isComponentsV2Flag);
            }
        }
    }

    if (hasV2 && resolvedOptions.content) {
        const client = target.client || global.client;
        const clientUser = client?.user;
        
        let clientColor = null;
        try {
            const { getEmbedColor } = require('./embedHelpers');
            clientColor = getEmbedColor();
        } catch (e) {
            clientColor = process.env.EMBED_COLOR || "#00d2ff";
        }

        let author = null;
        if (target.interaction) {
            author = target.interaction.user;
        } else if (target.mentions && target.mentions.repliedUser) {
            author = target.mentions.repliedUser;
        } else {
            author = target.author || target.user || (target.message ? (target.message.author || target.message.user) : null);
        }
        if (author && clientUser && author.id === clientUser.id) {
            if (target.message && target.message.mentions && target.message.mentions.repliedUser) {
                author = target.message.mentions.repliedUser;
            }
        }

        const guild = target.guild || (target.message ? target.message.guild : null) || null;

        const embed = new V2EmbedBuilder()
            .setDescription(resolvedOptions.content)
            .setColor(clientColor);

        const origComponents = (resolvedOptions.components || []).filter(c => {
            if (!c) return false;
            const type = c.data?.type ?? c.type;
            return type !== 19 && type !== 'Container' && c.constructor?.name !== 'ContainerBuilder' && !(c instanceof discord.ContainerBuilder);
        });
        const container = embed.toContainer(clientColor, author, guild, clientUser, origComponents);
        
        delete resolvedOptions.content;
        resolvedOptions.components = [container];
    }

    if (!hasV2) {
        let currentFlags = resolvedOptions.flags;
        if (currentFlags === undefined && target && target.message && target.message.flags) {
            currentFlags = target.message.flags.bitfield;
        }
        if (currentFlags !== undefined) {
            if (typeof currentFlags === 'bigint') {
                resolvedOptions.flags = currentFlags & ~BigInt(isComponentsV2Flag);
            } else if (typeof currentFlags === 'number') {
                resolvedOptions.flags = currentFlags & ~Number(isComponentsV2Flag);
            }
        }
    }

    return originalCreate.call(this, target, resolvedOptions);
};

// 3. Patch Interaction classes to resolve ephemeral and fetchReply deprecations and handle unknown interactions
function wrapWithIgnoreUnknownInteraction(fn) {
    return async function(...args) {
        try {
            return await fn.apply(this, args);
        } catch (err) {
            if (err && (err.code === 10062 || err.code === 50027 || err.status === 404)) {
                // Ignore unknown interaction / expired token errors silently
                return;
            }
            throw err;
        }
    };
}

const interactionClasses = [
    discord.CommandInteraction,
    discord.MessageComponentInteraction,
    discord.ModalSubmitInteraction
];

for (const cls of interactionClasses) {
    if (!cls || !cls.prototype) continue;

    if (cls.prototype.reply) {
        const originalReply = cls.prototype.reply;
        cls.prototype.reply = wrapWithIgnoreUnknownInteraction(async function(options) {
            if (options && typeof options === 'object') {
                if ('ephemeral' in options) {
                    if (options.ephemeral) {
                        if (options.flags === undefined) {
                            options.flags = 64;
                        } else if (Array.isArray(options.flags)) {
                            if (!options.flags.includes(64) && !options.flags.includes('Ephemeral')) {
                                options.flags.push(64);
                            }
                        } else if (typeof options.flags === 'number' || typeof options.flags === 'bigint') {
                            options.flags |= typeof options.flags === 'bigint' ? 64n : 64;
                        } else if (options.flags && typeof options.flags.add === 'function') {
                            options.flags.add(64);
                        }
                    }
                    delete options.ephemeral;
                }

                if ('fetchReply' in options) {
                    const fetchReply = !!options.fetchReply;
                    delete options.fetchReply;
                    if (fetchReply) {
                        await originalReply.call(this, options);
                        return this.fetchReply();
                    }
                }
            }
            return originalReply.call(this, options);
        });
    }

    if (cls.prototype.deferReply) {
        const originalDeferReply = cls.prototype.deferReply;
        cls.prototype.deferReply = wrapWithIgnoreUnknownInteraction(async function(options) {
            if (options && typeof options === 'object') {
                if ('ephemeral' in options) {
                    if (options.ephemeral) {
                        if (options.flags === undefined) {
                            options.flags = 64;
                        } else if (Array.isArray(options.flags)) {
                            if (!options.flags.includes(64) && !options.flags.includes('Ephemeral')) {
                                options.flags.push(64);
                            }
                        } else if (typeof options.flags === 'number' || typeof options.flags === 'bigint') {
                            options.flags |= typeof options.flags === 'bigint' ? 64n : 64;
                        } else if (options.flags && typeof options.flags.add === 'function') {
                            options.flags.add(64);
                        }
                    }
                    delete options.ephemeral;
                }

                if ('fetchReply' in options) {
                    const fetchReply = !!options.fetchReply;
                    delete options.fetchReply;
                    if (fetchReply) {
                        await originalDeferReply.call(this, options);
                        return this.fetchReply();
                    }
                }
            }
            return originalDeferReply.call(this, options);
        });
    }

    if (cls.prototype.followUp) {
        const originalFollowUp = cls.prototype.followUp;
        cls.prototype.followUp = wrapWithIgnoreUnknownInteraction(async function(options) {
            if (options && typeof options === 'object') {
                if ('ephemeral' in options) {
                    if (options.ephemeral) {
                        if (options.flags === undefined) {
                            options.flags = 64;
                        } else if (Array.isArray(options.flags)) {
                            if (!options.flags.includes(64) && !options.flags.includes('Ephemeral')) {
                                options.flags.push(64);
                            }
                        } else if (typeof options.flags === 'number' || typeof options.flags === 'bigint') {
                            options.flags |= typeof options.flags === 'bigint' ? 64n : 64;
                        } else if (options.flags && typeof options.flags.add === 'function') {
                            options.flags.add(64);
                        }
                    }
                    delete options.ephemeral;
                }
            }
            return originalFollowUp.call(this, options);
        });
        cls.prototype.followup = cls.prototype.followUp;
    }

    if (cls.prototype.update) {
        const originalUpdate = cls.prototype.update;
        cls.prototype.update = wrapWithIgnoreUnknownInteraction(async function(options) {
            return originalUpdate.call(this, options);
        });
    }

    if (cls.prototype.deferUpdate) {
        const originalDeferUpdate = cls.prototype.deferUpdate;
        cls.prototype.deferUpdate = wrapWithIgnoreUnknownInteraction(async function(options) {
            return originalDeferUpdate.call(this, options);
        });
    }
}

// Patch Message.prototype.reply to fallback to channel.send if lacking ReadMessageHistory permission
if (discord.Message && discord.Message.prototype && discord.Message.prototype.reply) {
    const originalMessageReply = discord.Message.prototype.reply;
    discord.Message.prototype.reply = async function(options) {
        try {
            return await originalMessageReply.call(this, options);
        } catch (error) {
            if (error && (error.code === 160002 || error.message?.includes('read message history'))) {
                try {
                    if (typeof options === 'string') {
                        return await this.channel.send({ content: options });
                    }
                    if (options && typeof options === 'object') {
                        const newOptions = { ...options };
                        delete newOptions.messageReference;
                        delete newOptions.failIfNotExists;
                        return await this.channel.send(newOptions);
                    }
                } catch (sendError) {
                    throw sendError;
                }
            }
            throw error;
        }
    };
}

// Discord.js EmbedBuilder successfully patched to V2 Components!
