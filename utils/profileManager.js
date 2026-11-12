const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    PermissionFlagsBits
} = require("discord.js");
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
    const targetUrls = urls
        .filter(url => url && (url.includes("cdn.discordapp.com/attachments/") || url.includes("media.discordapp.net/attachments/")))
        .map(url => url.replace("media.discordapp.net/attachments/", "cdn.discordapp.com/attachments/"));

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
        joinDateText = `${String(jDate.getDate()).padStart(2, "0")}/${String(jDate.getMonth() + 1).padStart(2, "0")}/${jDate.getFullYear()}`;
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
                new ButtonBuilder().setCustomId(`slide_${targetId}_0_prev`).setLabel("<<").setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId("dummy").setLabel(`1/${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId(`slide_${targetId}_0_next`).setLabel(">>").setStyle(ButtonStyle.Secondary)
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

async function deleteProfileCard(guild, client, targetId) {
    const data = loadData();
    const profileChannel = await guild.channels.fetch(process.env.PROFILE_CHANNEL_ID).catch(() => null);

    if (profileChannel) {
        if (data[targetId]?.messageId) {
            const msgById = await profileChannel.messages.fetch(data[targetId].messageId).catch(() => null);
            if (msgById) await msgById.delete().catch(() => null);
        }

        const messages = await profileChannel.messages.fetch({ limit: 100 }).catch(() => null);
        if (messages) {
            const existingMsg = messages.find(m =>
                m.author.id === client.user.id &&
                m.embeds.length > 0 &&
                m.embeds[0].footer?.text?.includes(`ID: ${targetId}`)
            );
            if (existingMsg) await existingMsg.delete().catch(() => null);
        }
    }

    if (data[targetId]) {
        delete data[targetId];
        saveData(data);
    }
    return true;
}

async function openEditProfileModal(interaction, targetId) {
    const data = loadData();
    const userData = data[targetId];
    if (!userData) {
        return interaction.reply({ content: "❌ Không tìm thấy dữ liệu hồ sơ của thành viên này!", flags: 64 });
    }

    let bdayDefault = "";
    if (userData.day && userData.month) {
        bdayDefault = `${String(userData.day).padStart(2, "0")}/${String(userData.month).padStart(2, "0")}${userData.year ? `/${userData.year}` : ""}`;
    }

    const tenInput = new TextInputBuilder()
        .setCustomId("modal_ten")
        .setLabel("Họ và tên")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
    if (userData.name) tenInput.setValue(userData.name.slice(0, 100));

    const sloganInput = new TextInputBuilder()
        .setCustomId("modal_slogan")
        .setLabel("Slogan cá nhân")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
    if (userData.slogan) sloganInput.setValue(userData.slogan.slice(0, 100));

    const noioInput = new TextInputBuilder()
        .setCustomId("modal_noio")
        .setLabel("Nơi ở hiện tại")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
    if (userData.location) noioInput.setValue(userData.location.slice(0, 100));

    const sothichInput = new TextInputBuilder()
        .setCustomId("modal_sothich")
        .setLabel("Sở thích")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
    if (userData.hobbies) sothichInput.setValue(userData.hobbies.slice(0, 1000));

    const ngaysinhInput = new TextInputBuilder()
        .setCustomId("modal_ngaysinh")
        .setLabel("Ngày sinh (Vd: 15/06 hoặc 15/06/2005)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
    if (bdayDefault) ngaysinhInput.setValue(bdayDefault);

    const modal = new ModalBuilder()
        .setCustomId(`edit_profile_modal_${targetId}`)
        .setTitle("Chỉnh Sửa Hồ Sơ Cá Nhân")
        .addComponents(
            new ActionRowBuilder().addComponents(tenInput),
            new ActionRowBuilder().addComponents(sloganInput),
            new ActionRowBuilder().addComponents(noioInput),
            new ActionRowBuilder().addComponents(sothichInput),
            new ActionRowBuilder().addComponents(ngaysinhInput)
        );

    return await interaction.showModal(modal);
}

async function openPhotoEditorDashboard(interaction, targetId) {
    const data = loadData();
    const userData = data[targetId];
    if (!userData) {
        const errPayload = { content: "❌ Không tìm thấy dữ liệu hồ sơ của thành viên này!", components: [], flags: 64 };
        return interaction.isStringSelectMenu() ? interaction.update(errPayload) : interaction.reply(errPayload);
    }

    const images = userData.images || (userData.image ? [userData.image] : []) || [];
    const listText = images.length > 0
        ? images.map((url, idx) => `• **Ảnh ${idx + 1}:** [Xem ảnh gốc](${url})`).join("\n")
        : "*Chưa có ảnh nào*";

    const embed = new EmbedBuilder()
        .setColor("#3498DB")
        .setTitle(`🖼️ QUẢN LÝ ẢNH HỒ SƠ: ${userData.name || targetId}`)
        .setDescription(`Hiện đang có **${images.length}/5** ảnh trong hồ sơ của <@${targetId}>:\n\n${listText}`)
        .setImage(images[0] || null)
        .setFooter({ text: "Chọn thao tác bên dưới để thêm, thay mới hoặc xóa từng ảnh" });

    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`photo_add_${targetId}`)
            .setLabel("➕ Thêm ảnh mới")
            .setStyle(ButtonStyle.Success)
            .setDisabled(images.length >= 5),
        new ButtonBuilder()
            .setCustomId(`photo_replace_${targetId}`)
            .setLabel("🔄 Thay toàn bộ ảnh")
            .setStyle(ButtonStyle.Primary)
    );

    const components = [buttonRow];

    if (images.length > 1) {
        const deleteSelect = new StringSelectMenuBuilder()
            .setCustomId(`photo_delete_select_${targetId}`)
            .setPlaceholder("🗑️ Chọn ảnh muốn xóa bớt...")
            .addOptions(
                images.map((_, idx) => ({
                    label: `Xóa Ảnh số ${idx + 1}`,
                    description: idx === 0 ? "Ảnh bìa chính hiện tại" : `Ảnh phụ thứ ${idx + 1}`,
                    value: String(idx)
                }))
            );
        components.push(new ActionRowBuilder().addComponents(deleteSelect));
    }

    const payload = { content: null, embeds: [embed], components, flags: 64 };
    if (interaction.isStringSelectMenu()) {
        return await interaction.update(payload);
    }
    return await interaction.reply(payload);
}

async function syncAllProfiles(guild, client) {
    const data = loadData();
    for (const targetId in data) {
        await sendProfileCardToHall(guild, client, targetId, data[targetId]).catch(() => null);
    }
}

module.exports = {
    sendProfileCardToHall,
    deleteProfileCard,
    openEditProfileModal,
    openPhotoEditorDashboard,
    syncAllProfiles,
    saveImagesPermanently
};