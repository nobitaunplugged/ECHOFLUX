const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags
} = require("discord.js");

class V2EmbedBuilder {
  constructor(data = {}) {
    this.title = data.title || null;
    this.description = data.description || null;
    this.color = data.color || null;
    this.fields = data.fields ? [...data.fields] : [];
    this.author = data.author || null;
    this.thumbnail = data.thumbnail || null;
    this.image = data.image || null;
    this.footer = data.footer || null;
    this.timestamp = data.timestamp || null;
    this.url = data.url || null;
  }

  setTitle(title) {
    this.title = title;
    return this;
  }

  setDescription(description) {
    this.description = description;
    return this;
  }

  setColor(color) {
    this.color = color;
    return this;
  }

  setURL(url) {
    this.url = url;
    return this;
  }

  setAuthor(author) {
    this.author = author;
    return this;
  }

  setThumbnail(url) {
    this.thumbnail = url;
    return this;
  }

  setImage(url) {
    this.image = url;
    return this;
  }

  setFooter(footer) {
    this.footer = footer;
    return this;
  }

  setTimestamp(timestamp) {
    this.timestamp = timestamp || new Date();
    return this;
  }

  addFields(...fields) {
    if (fields.length === 1 && Array.isArray(fields[0])) {
      this.fields.push(...fields[0]);
    } else {
      this.fields.push(...fields);
    }
    return this;
  }

  spliceFields(index, deleteCount, ...fields) {
    this.fields.splice(index, deleteCount, ...fields);
    return this;
  }

  setFields(...fields) {
    this.fields = fields.length === 1 && Array.isArray(fields[0]) ? fields[0] : fields;
    return this;
  }

  toContainer(clientColor = null, author = null, guild = null, clientUser = null, actionRows = []) {
    const container = new ContainerBuilder();

    let finalColor = this.color;
    if (!finalColor && clientColor) {
      finalColor = clientColor;
    }
    if (finalColor) {
      let resolvedColor = null;
      if (typeof finalColor === "number") {
        resolvedColor = finalColor;
      } else if (typeof finalColor === "string") {
        if (finalColor.startsWith("#")) {
          resolvedColor = parseInt(finalColor.slice(1), 16);
        } else {
          const discordColors = {
            "Default": 0x000000,
            "White": 0xffffff,
            "Aqua": 0x1abc9c,
            "Green": 0x57f287,
            "Blue": 0x3498db,
            "Yellow": 0xfee75c,
            "Purple": 0x9b59b6,
            "LuminousVividPink": 0xe91e63,
            "Fuchsia": 0xeb459e,
            "Gold": 0xf1c40f,
            "Orange": 0xe67e22,
            "Red": 0xed4245,
            "Grey": 0x95a5a6,
            "Navy": 0x34495e,
            "DarkAqua": 0x11806a,
            "DarkGreen": 0x1f8b4c,
            "DarkBlue": 0x206694,
            "DarkPurple": 0x71368a,
            "DarkVividPink": 0xad1457,
            "DarkGold": 0xc27c0e,
            "DarkOrange": 0xa84300,
            "DarkRed": 0x992d22,
            "DarkGrey": 0x979c9f,
            "DarkerGrey": 0x7f8c8d,
            "LightGrey": 0xbcc0c0,
            "DarkNavy": 0x2c3e50,
            "Blurple": 0x5865f2,
            "Greyple": 0x99aab5,
            "DarkButNotBlack": 0x2c2f33,
            "NotQuiteBlack": 0x23272a
          };
          const cleanColor = finalColor.toLowerCase();
          const match = Object.keys(discordColors).find(k => k.toLowerCase() === cleanColor);
          if (match) {
            resolvedColor = discordColors[match];
          } else {
            resolvedColor = parseInt(finalColor, 10);
            if (isNaN(resolvedColor)) resolvedColor = null;
          }
        }
      }
      if (resolvedColor !== null && !isNaN(resolvedColor)) {

        if (resolvedColor === 0x2b2d31 || resolvedColor === 2829617) {
          resolvedColor = 0xff0000;
        }
        container.setAccentColor(resolvedColor);
      } else {
        container.setAccentColor(0xff0000);
      }
    } else {
      container.setAccentColor(0xff0000);
    }

    const addSeparatorIfNeeded = () => {
      if (container.components.length === 0) return;
      const last = container.components[container.components.length - 1];
      const lastType = last.data?.type ?? last.type;
      if (lastType === 14 || lastType === "Separator") return;
      container.addSeparatorComponents(new SeparatorBuilder());
    };

    let headerText = "";
    if (this.author?.name) {
      const authName = this.author.name.length > 256 ? this.author.name.slice(0, 253) + "..." : this.author.name;
      headerText += `### **${authName}**\n`;
    }
    if (this.title) {
      const ttl = this.title.length > 256 ? this.title.slice(0, 253) + "..." : this.title;
      headerText += `## **${ttl}**\n`;
    }

    let headerIconUrl = null;
    if (this.author?.iconURL) {
      headerIconUrl = typeof this.author.iconURL === "string" ? this.author.iconURL : this.author.iconURL.url;
    } else if (author && typeof author.displayAvatarURL === "function") {
      headerIconUrl = author.displayAvatarURL({ extension: "png", size: 256 });
    } else if (clientUser) {
      headerIconUrl = clientUser.displayAvatarURL({ extension: "png", size: 256 });
    }

    if (headerText.trim()) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(headerText.trim())
      );

      addSeparatorIfNeeded();
    }

    let descriptionText = "";
    if (this.description) {
      const desc = this.description.length > 4096 ? this.description.slice(0, 4093) + "..." : this.description;
      descriptionText += `${desc}\n\n`;
    }

    let fieldsText = "";
    if (this.fields.length > 0) {
      let i = 0;
      while (i < this.fields.length) {
        const field = this.fields[i];
        const fName = field.name ? (field.name.length > 256 ? field.name.slice(0, 253) + "..." : field.name) : "";
        const fValue = field.value ? (field.value.length > 1024 ? field.value.slice(0, 1021) + "..." : field.value) : "";

        if (field.inline) {
          fieldsText += `**${fName}**: ${fValue}\n`;
          i++;
        } else {
          fieldsText += `**${fName}**\n${fValue}\n`;
          i++;
        }
      }
    }

    let bodyThumbUrl = null;
    if (this.thumbnail) {
      bodyThumbUrl = typeof this.thumbnail === "string" ? this.thumbnail : this.thumbnail.url;
      if (guild && clientUser && bodyThumbUrl && typeof bodyThumbUrl === "string" && bodyThumbUrl.includes(`/avatars/${clientUser.id}/`)) {
        const member = guild.members?.me || guild.members?.cache?.get(clientUser.id);
        if (member) {
          bodyThumbUrl = member.displayAvatarURL({ extension: "png", size: 256 });
        }
      }
    }

    let bottomString = "";
    if (this.footer) {
      const footerText = this.footer.text ? (this.footer.text.length > 1024 ? this.footer.text.slice(0, 1021) + "..." : this.footer.text) : "";
      bottomString += footerText;
    }

    if (this.timestamp) {
      const timeStr = `<t:${Math.floor(new Date(this.timestamp).getTime() / 1000)}:t>`;
      if (bottomString) {
        bottomString += ` • ${timeStr}`;
      } else {
        const requester = author ? (author.username || author.globalName || author.tag) : null;
        if (requester) {
          bottomString += `Requested by ${requester} • ${timeStr}`;
        } else {
          bottomString += `• ${timeStr}`;
        }
      }
    } else if (!this.footer?.text) {
      const requester = author ? (author.username || author.globalName || author.tag) : null;
      if (requester) {
        bottomString += `Requested by ${requester} • <t:${Math.floor(Date.now() / 1000)}:t>`;
      }
    }

    if (bottomString && !bottomString.startsWith("-#")) {
      bottomString = `-# ${bottomString}`;
    }

    const maxCombinedLength = Math.max(1000, 3600 - headerText.length - bottomString.length);
    let combinedText = [descriptionText.trim(), fieldsText.trim()].filter(Boolean).join("\n\n");
    
    // Auto-convert legacy text divider lines into native V2 Separators
    combinedText = combinedText.replace(/^[\s\u200b]*[-_━═─▬~*⎯]{3,}[\s\u200b]*$/gm, '<V2_SEPARATOR>');

    if (combinedText.length > maxCombinedLength) {
      combinedText = combinedText.slice(0, maxCombinedLength - 3) + "...";
    }

    if (combinedText) {
      const parts = combinedText.split("<V2_SEPARATOR>");
      
      for (let pIndex = 0; pIndex < parts.length; pIndex++) {
        const partText = parts[pIndex].trim();
        if (!partText) continue;

        if (bodyThumbUrl && pIndex === 0) {

          const bodySection = new SectionBuilder();
          bodySection.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(partText)
          );
          bodySection.setThumbnailAccessory((thumb) => thumb.setURL(bodyThumbUrl));
          container.addSectionComponents(bodySection);
        } else {

          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(partText)
          );
        }

        if (pIndex < parts.length - 1) {
          addSeparatorIfNeeded();
        }
      }
    }

    const imgUrl = this.image ? (typeof this.image === "string" ? this.image : this.image.url) : null;
    if (imgUrl && (imgUrl.startsWith("http") || imgUrl.startsWith("attachment://"))) {
      addSeparatorIfNeeded();
      const gallery = new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(imgUrl)
      );
      container.addMediaGalleryComponents(gallery);
    }

    if (actionRows && actionRows.length > 0) {
      addSeparatorIfNeeded();
      for (const row of actionRows) {
        container.addActionRowComponents(row);
      }
      if (bottomString) {
        addSeparatorIfNeeded();
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(bottomString)
        );
      }
      return container;
    }

    if (bottomString) {
      addSeparatorIfNeeded();

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(bottomString)
      );
    }

    return container;
  }

  toJSON() {
    const res = this.toContainer();
    if (Array.isArray(res)) {
      return res.map(c => typeof c.toJSON === 'function' ? c.toJSON() : c);
    }
    return res.toJSON();
  }
}

module.exports = V2EmbedBuilder;
