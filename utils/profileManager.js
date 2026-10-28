const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require("discord.js");
const { loadData, saveData, formatBirthday } = require("./db");

const REGULAR_MEMBER_ROLE = "1207064301957947443";
const INVESTOR_ROLE = "1258567277695995904";
const HOANG_DE_ROLE = "1206317832674086944";

async function saveImagesPermanently(guild, client, targetId, urls) {
    if (!urls || urls.length === 0) return [];
    try {
        let storageChannel = guild.channels.cache.find(c => c.name === "profile-images-storage");
        if (!storageChannel) {
            storageChannel = await guild.channels.create({
                name: "profile-images-storage",
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }
                ]
            }).catch(() => null);
        }
        if (!storageChannel) return urls;

        const savedMessage = await storageChannel.send({
            content: `🖼️ Kho ảnh lưu trữ trọn đời của thành viên <@${targetId}> (ID: ${targetId})`,
            files: urls.map(url => ({ attachment: url }))
        });
        return savedMessage.attachments.map(att => att.url);
    } catch (err) {
        console.error("❌ Lỗi khi sao lưu ảnh vĩnh viễn:", err);
        return urls;
    }
}

async function refreshDiscordUrls(token, urls) {
    if (!urls || urls.length === 0) return {};
    const targetUrls = urls.filter(url => 
        url && (url.includes("cdn.discordapp.com/attachments/") || url.includes("media.discordapp.net/attachments/"))
    ).map(url => url.replace("media.discordapp.net/attachments/", "cdn.discordapp.com/attachments/"));
    
    if (targetUrls.length === 0) return {};

    try {
        const response = await fetch("https://discord.com/api/v10/attachments/refresh-urls", {
            method: "POST",
            headers: { "Authorization": `Bot ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ attachment_urls: targetUrls })
        });
        if (!response.ok) return {};

        const json = await response.json();
        const mapping = {};
        if (json.refreshed_urls) {
            for (const item of json.refreshed_urls) {
                const originalCdn = item.original.replace("media.discordapp.net/attachments/", "cdn.discordapp.com/attachments/");
                mapping[originalCdn] = item.refreshed;
            }
        }
        return mapping;
    } catch (error) {
        return {};
    }
}

async function sendProfileCardToHall(guild, client, targetId, userData, footerText = "Sảnh danh vọng 🏆") {
    const userObj = await client.users.fetch(targetId).catch(() => null);
    if (!userObj) return false;

    let member = guild.members.cache.get(targetId) || await guild.members.fetch(targetId).catch(() => null);
    const isRegularMember = member ? member.roles.cache.has(REGULAR_MEMBER_ROLE) : false;
    const isInvestor = member ? member.roles.cache.has(INVESTOR_ROLE) : false;
    const isHoangDe = member ? member.roles.cache.has(HOANG_DE_ROLE) : false;

    const shouldHide = !isRegularMember && !isInvestor && !isHoangDe;
    const profileChannel = await guild.channels.fetch(process.env.PROFILE_CHANNEL_ID).catch(() => null);
    if (!profileChannel) return false;

    const data = loadData();
    const currentProfile = data[targetId] || userData;

    const messages = await profileChannel.messages.fetch({ limit: 100 }).catch(() => null);
    let existingMsg = null;
    if (messages) {
        existingMsg = messages.find(m => 
            m.author.id === client.user.id && 
            m.embeds.length > 0 && 
            m.embeds[0].footer?.text?.includes(`ID: ${targetId}`)
        );
    }

    if (shouldHide) {
        if (existingMsg) await existingMsg.delete().catch(() => null);
        currentProfile.messageId = null;
        currentProfile.hidden = true;
        data[targetId] = currentProfile;
        saveData(data);
        return false;
    }

    let imageUrls = currentProfile.images || (currentProfile.image ? [currentProfile.image] : []) || [];
    if (imageUrls.length > 0) {
        const refreshedMapping = await refreshDiscordUrls(process.env.TOKEN, imageUrls);
        let hasChanged = false;
        const finalUrls = imageUrls.map(url => {
            const normalizedUrl = url.replace("media.discordapp.net/attachments/", "cdn.discordapp.com/attachments/");
            if (refreshedMapping[normalizedUrl]) {
                hasChanged = true;
                return refreshedMapping[normalizedUrl];
            }
            return url;
        });

        if (hasChanged) {
            imageUrls = finalUrls;
            currentProfile.images = finalUrls;
            currentProfile.image = finalUrls[0] || null;
        }
    }

    let joinDateText = "Chưa rõ";
    if (member && member.joinedAt) {
        const jDate = member.joinedAt;
        joinDateText = `${String(jDate.getDate()).padStart(2, '0')}/${String(jDate.getMonth() + 1).padStart(2, '0')}/${jDate.getFullYear()}`;
    }

    let descriptionText = `> 💬 *"${currentProfile.slogan}"*\n\n📌 **Nơi ở:** ${currentProfile.location}\n🩷 **Sở thích:** ${currentProfile.hobbies}`;
    if (currentProfile.day && currentProfile.month) {
        descriptionText += `\n🎂 **Ngày sinh:** ${formatBirthday(currentProfile.day, currentProfile.month, currentProfile.year)}`;
    }

    const profileEmbed = new EmbedBuilder()
        .setColor("#2F3136")
        .setTitle(`☁️ ${currentProfile.name} ☁️`)
        .setAuthor({ name: userObj.tag, iconURL: userObj.displayAvatarURL() })
        .setDescription(descriptionText)
        .setImage(imageUrls[0] || null)
        .setThumbnail(userObj.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `${footerText} | Gia nhập: ${joinDateText} | ID: ${targetId}` })
        .setTimestamp();

    const components = [];
    if (imageUrls.length > 1) {
        const total = imageUrls.length;
        components.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`slide_${targetId}_0_prev`).setLabel('<<').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('dummy').setLabel(`1/${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId(`slide_${targetId}_0_next`).setLabel('>>').setStyle(ButtonStyle.Secondary)
            )
        );
    }

    let messageSent = existingMsg ? await existingMsg.edit({ embeds: [profileEmbed], components }).catch(() => null) : null;
    if (!messageSent) {
        messageSent = await profileChannel.send({ embeds: [profileEmbed], components }).catch(() => null);
    }

    if (messageSent) {
        currentProfile.messageId = messageSent.id;
        currentProfile.hidden = false;
        data[targetId] = currentProfile;
        saveData(data);
        return true;
    }
    return false;
}

async function syncAllProfiles(guild, client) {
    const data = loadData();
    for (const targetId in data) {
        await sendProfileCardToHall(guild, client, targetId, data[targetId]).catch(() => null);
    }
}

module.exports = {
    sendProfileCardToHall,
    syncAllProfiles,
    saveImagesPermanently
};
