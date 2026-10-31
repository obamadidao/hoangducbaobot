const { 
    ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, 
    StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, 
    PermissionFlagsBits 
} = require("discord.js");
const { loadData, saveData, loadEventsData, saveEventsData, loadStickyData, saveStickyData, getDaysUntilBirthday, formatBirthday } = require("../utils/db");
const { sendProfileCardToHall, deleteProfileCard, openEditProfileModal, openPhotoEditorDashboard, saveImagesPermanently } = require("../utils/profileManager");

const HOANG_DE_ROLE = "1206317832674086944";

function isSelfAllowed(member) {
    if (member.roles.cache.has(HOANG_DE_ROLE)) return true;
    const roleEnv = process.env.ROLE_IDS || "";
    const allowedRoles = roleEnv.split(',').map(r => r.trim()).filter(r => r !== "");
    if (allowedRoles.length === 0) return true;
    return allowedRoles.some(roleId => member.roles.cache.has(roleId));
}

async function createRegisteredUsersSelectMenu(client, customId, placeholder) {
    const data = loadData();
    const userIds = Object.keys(data);
    if (userIds.length === 0) return null;

    const options = [];
    for (const id of userIds) {
        const userData = data[id];
        const userObj = client.users.cache.get(id) || await client.users.fetch(id).catch(() => null);
        options.push({
            label: `${userData.name}${userObj ? ` (@${userObj.username})` : ""}`.slice(0, 100),
            value: id,
            description: `Slogan: ${userData.slogan || "Chưa có"}`.slice(0, 100)
        });
    }

    return new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(options.slice(0, 25));
}

module.exports = {
    name: "interactionCreate",
    async execute(interaction, client) {
        try {
            // A. XỬ LÝ CHẠY LỆNH SLASH COMMANDS
            if (interaction.isChatInputCommand()) {
                const { commandName, channelId, member, user } = interaction;

                // Danh sách các lệnh được xử lý Router trực tiếp tại file này
                const routerCommands = [
                    "birthdays", "taoprofile", "taohoprofile", "suaprofile", "suaanh", "xoaprofile",
                    "taosukien", "danhsachsukien", "suasukien", "xoasukien", "sticky", "unsticky"
                ];

                const command = client.commands.get(commandName);

                // CHỈ CHẠY FILE LỆNH NẾU LỆNH ĐÓ KHÔNG NẰM TRONG DANH SÁCH ROUTER PROFILE/EVENT
                if (command && !routerCommands.includes(commandName)) {
                    return await command.execute(interaction, client);
                }

                // Xử lý kiểm tra kênh cho các lệnh dạng Router
                const restrictedCommands = [
                    "birthdays", "taoprofile", "taohoprofile", "suaprofile", "suaanh", "xoaprofile",
                    "taosukien", "danhsachsukien", "suasukien", "xoasukien"
                ];
                if (restrictedCommands.includes(commandName) && channelId !== process.env.SETUP_CHANNEL_ID) {
                    return interaction.reply({ content: `❌ Lệnh này chỉ dùng được ở kênh <#${process.env.SETUP_CHANNEL_ID}>!`, flags: 64 });
                }

                const isAdmin = member.permissions.has(PermissionFlagsBits.ManageMessages) || member.roles.cache.has(HOANG_DE_ROLE);

                if (commandName === "suaprofile") {
                    if (isAdmin) {
                        const selectMenu = await createRegisteredUsersSelectMenu(client, "select_edit_profile", "Chọn thành viên cần sửa hồ sơ...");
                        if (!selectMenu) return interaction.reply({ content: "❌ Chưa có thành viên nào đăng ký hồ sơ cả!", flags: 64 });
                        return await interaction.reply({ content: "⚙️ **Chọn thành viên bạn muốn chỉnh sửa hồ sơ:**", components: [new ActionRowBuilder().addComponents(selectMenu)], flags: 64 });
                    } else {
                        if (!isSelfAllowed(member)) return interaction.reply({ content: "❌ Bạn không có quyền chỉnh sửa hồ sơ!", flags: 64 });
                        const data = loadData();
                        if (!data[user.id]) return interaction.reply({ content: "❌ Bạn chưa có hồ sơ! Hãy tạo bằng lệnh `/taoprofile`.", flags: 64 });
                        return await openEditProfileModal(interaction, user.id);
                    }
                }

                if (commandName === "suaanh") {
                    if (isAdmin) {
                        const selectMenu = await createRegisteredUsersSelectMenu(client, "select_edit_photos", "Chọn thành viên để chỉnh sửa ảnh...");
                        if (!selectMenu) return interaction.reply({ content: "❌ Chưa có ai khởi tạo hồ sơ để chỉnh sửa ảnh!", flags: 64 });
                        return await interaction.reply({ content: "📸 **Chọn thành viên bạn muốn thay đổi ảnh hồ sơ:**", components: [new ActionRowBuilder().addComponents(selectMenu)], flags: 64 });
                    } else {
                        if (!isSelfAllowed(member)) return interaction.reply({ content: "❌ Bạn không có quyền sửa ảnh hồ sơ cá nhân!", flags: 64 });
                        const data = loadData();
                        if (!data[user.id]) return interaction.reply({ content: "❌ Bạn chưa có hồ sơ cá nhân! Hãy dùng `/taoprofile` trước.", flags: 64 });
                        return await openPhotoEditorDashboard(interaction, user.id);
                    }
                }

                if (commandName === "xoaprofile") {
                    if (isAdmin) {
                        const selectMenu = await createRegisteredUsersSelectMenu(client, "select_delete_profile", "Chọn thành viên cần xóa hồ sơ vĩnh viễn...");
                        if (!selectMenu) return interaction.reply({ content: "❌ Không thể xóa vì danh sách hiện đang trống!", flags: 64 });
                        return await interaction.reply({ content: "🚨 **Chọn thành viên bạn muốn xóa hồ sơ:**", components: [new ActionRowBuilder().addComponents(selectMenu)], flags: 64 });
                    } else {
                        if (!isSelfAllowed(member)) return interaction.reply({ content: "❌ Bạn không có quyền xóa hồ sơ cá nhân!", flags: 64 });
                        const data = loadData();
                        if (!data[user.id]) return interaction.reply({ content: "❌ Bạn chưa có hồ sơ cá nhân để xóa.", flags: 64 });

                        const confirmRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`confirm_delete_${user.id}`).setLabel("Xác Nhận Xóa").setStyle(ButtonStyle.Danger),
                            new ButtonBuilder().setCustomId("cancel_delete").setLabel("Hủy Bỏ").setStyle(ButtonStyle.Secondary)
                        );
                        return interaction.reply({ content: "⚠️ Bạn có chắc chắn muốn xóa hồ sơ cá nhân của mình khỏi Sảnh Danh Vọng không?", components: [confirmRow], flags: 64 });
                    }
                }

                if (commandName === "sticky") {
                    const modal = new ModalBuilder().setCustomId("sticky_modal").setTitle("Cấu hình Tin nhắn Ghim Kênh");
                    modal.addComponents(new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId("modal_sticky_content").setLabel("Nhập nội dung ghim (Xuống dòng tự do)").setStyle(TextInputStyle.Paragraph).setRequired(true)
                    ));
                    return await interaction.showModal(modal);
                }

                if (commandName === "unsticky") {
                    await interaction.deferReply({ flags: 64 });
                    const stickyData = loadStickyData();
                    if (!stickyData[channelId]) return await interaction.editReply({ content: "❌ Kênh này hiện tại không có tin nhắn dính nào cả." });

                    if (stickyData[channelId].lastMessageId) {
                        const oldMsg = await interaction.channel.messages.fetch(stickyData[channelId].lastMessageId).catch(() => null);
                        if (oldMsg) await oldMsg.delete().catch(() => null);
                    }
                    delete stickyData[channelId];
                    saveStickyData(stickyData);
                    return await interaction.editReply({ content: "✅ Đã gỡ bỏ tính năng tin nhắn dính thành công tại kênh này!" });
                }

                if (commandName === "taoprofile") {
                    if (!isSelfAllowed(member)) return interaction.reply({ content: "❌ Bạn không có quyền sử dụng lệnh này!", flags: 64 });
                    
                    const data = loadData();
                    if (data[user.id]) {
                        return interaction.reply({ content: "❌ Bạn đã có hồ sơ! Dùng `/suaprofile` để sửa hoặc `/xoaprofile` để xóa.", flags: 64 });
                    }

                    const imageUrls = [1, 2, 3, 4, 5].map(i => interaction.options.getAttachment(`anh${i}`)?.url).filter(Boolean);
                    client.tempImages.set(user.id, imageUrls);

                    const modal = new ModalBuilder().setCustomId(`profile_modal_${user.id}`).setTitle("Thông Tin Hồ Sơ Cá Nhân");
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_ten").setLabel("Họ và tên").setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_slogan").setLabel("Slogan cá nhân").setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_noio").setLabel("Nơi ở hiện tại").setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_sothich").setLabel("Sở thích").setStyle(TextInputStyle.Paragraph).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_ngaysinh").setLabel("Ngày sinh (Vd: 15/06)").setStyle(TextInputStyle.Short).setRequired(false))
                    );
                    return await interaction.showModal(modal);
                }
            }

            // B. XỬ LÝ MENU THẢ XUỐNG (STRING SELECT MENU)
            if (interaction.isStringSelectMenu()) {
                const { customId, values, guild } = interaction;
                const targetId = values[0];

                if (customId === "select_edit_profile") return await openEditProfileModal(interaction, targetId);
                if (customId === "select_edit_photos") return await openPhotoEditorDashboard(interaction, targetId);

                if (customId === "select_delete_profile") {
                    const data = loadData();
                    if (!data[targetId]) return interaction.reply({ content: "❌ Lỗi: Hồ sơ không tồn tại.", flags: 64 });
                    const targetName = data[targetId].name || targetId;
                    await deleteProfileCard(guild, client, targetId);
                    return await interaction.update({ content: `✅ Đã xóa thành công hồ sơ cá nhân của **${targetName}** (<@${targetId}>)!`, components: [] });
                }

                if (customId === "select_birthday_lookup") {
                    await interaction.deferReply();
                    const data = loadData();
                    const userData = data[targetId];
                    if (!userData) return await interaction.editReply({ content: "❌ Không tìm thấy thông tin hồ sơ của thành viên này." });

                    const userObj = client.users.cache.get(targetId) || await client.users.fetch(targetId).catch(() => null);
                    const daysLeft = getDaysUntilBirthday(userData.day, userData.month);
                    const countdownText = daysLeft === 0 ? "🎂 Hôm nay luôn! Chúc mừng sinh nhật nhé!" : `Còn **${daysLeft} ngày**`;

                    const bdayEmbed = new EmbedBuilder()
                        .setColor("#FFB6C1")
                        .setTitle("🎂 THÔNG TIN SINH NHẬT THÀNH VIÊN 🎂")
                        .setDescription(`👤 **${userData.name}** (${userObj ? `@${userObj.username}` : "Thành viên"})\n🎂 Ngày sinh: ${formatBirthday(userData.day, userData.month, userData.year)}\n⏳ ${countdownText}`)
                        .setThumbnail(userObj ? userObj.displayAvatarURL({ dynamic: true }) : null)
                        .setTimestamp();

                    return await interaction.editReply({ content: null, embeds: [bdayEmbed], components: [] });
                }

                if (customId === "select_event_delete") {
                    await interaction.deferReply({ flags: 64 });
                    const eventsData = loadEventsData();
                    if (!eventsData[targetId]) return await interaction.editReply({ content: "❌ Sự kiện không tồn tại!" });

                    const deletedName = eventsData[targetId].name;
                    delete eventsData[targetId];
                    saveEventsData(eventsData);
                    return await interaction.editReply({ content: `✅ Đã xóa bỏ thành công sự kiện nhắc nhở: **${deletedName}**!` });
                }
            }

            // C. XỬ LÝ BẢNG POPUP (MODAL SUBMIT)
            if (interaction.isModalSubmit()) {
                const { customId, guild, fields } = interaction;

                if (customId.startsWith("profile_modal_")) {
                    await interaction.deferReply({ flags: 64 });
                    const targetId = customId.replace("profile_modal_", "");

                    const name = fields.getTextInputValue("modal_ten");
                    const slogan = fields.getTextInputValue("modal_slogan");
                    const location = fields.getTextInputValue("modal_noio");
                    const hobbies = fields.getTextInputValue("modal_sothich");
                    const bdayRaw = fields.getTextInputValue("modal_ngaysinh").trim();

                    let day = null, month = null, year = null;
                    if (bdayRaw) {
                        const parts = bdayRaw.split(/[-/.]/);
                        if (parts.length >= 2) { 
                            day = parseInt(parts[0], 10); 
                            month = parseInt(parts[1], 10); 
                            if (parts.length >= 3) year = parseInt(parts[2], 10); 
                        }
                    }

                    const imageUrls = client.tempImages.get(targetId) || [];
                    if (imageUrls.length === 0) return interaction.editReply({ content: "❌ Không tìm thấy tệp ảnh tạm thời của hồ sơ." });

                    const permanentUrls = await saveImagesPermanently(guild, client, targetId, imageUrls);

                    const data = loadData();
                    data[targetId] = {
                        name, slogan, location, hobbies, day, month, year,
                        image: permanentUrls[0] || null,
                        images: permanentUrls,
                        messageId: data[targetId]?.messageId || null,
                        hidden: false
                    };
                    saveData(data);
                    client.tempImages.delete(targetId);

                    const wasShown = await sendProfileCardToHall(guild, client, targetId, data[targetId], "Sảnh danh vọng 🏆");
                    if (wasShown) {
                        return await interaction.editReply({ content: `✅ Đã lưu cấu hình và hiển thị hồ sơ cá nhân của <@${targetId}> lên Sảnh Danh Vọng!` });
                    } else {
                        return await interaction.editReply({ content: `⚠️ Đã lưu cấu hình của <@${targetId}> thành công! Tuy nhiên, hồ sơ này đang tạm ẩn do chưa có Role phù hợp.` });
                    }
                }

                if (customId === "sticky_modal") {
                    await interaction.deferReply({ flags: 64 });
                    const text = fields.getTextInputValue("modal_sticky_content");
                    const stickyData = loadStickyData();

                    stickyData[interaction.channelId] = {
                        text,
                        lastMessageId: stickyData[interaction.channelId]?.lastMessageId || null
                    };
                    saveStickyData(stickyData);

                    const stickyEmbed = new EmbedBuilder()
                        .setColor("#F1C40F")
                        .setTitle("📌 Tin nhắn ghim:")
                        .setDescription(text)
                        .setTimestamp();

                    if (stickyData[interaction.channelId].lastMessageId) {
                        const oldMsg = await interaction.channel.messages.fetch(stickyData[interaction.channelId].lastMessageId).catch(() => null);
                        if (oldMsg) await oldMsg.delete().catch(() => null);
                    }

                    const newMsg = await interaction.channel.send({ embeds: [stickyEmbed] });
                    stickyData[interaction.channelId].lastMessageId = newMsg.id;
                    saveStickyData(stickyData);

                    return await interaction.editReply({ content: "✅ Đã thiết lập tin nhắn dính thành công cho kênh này!" });
                }
            }

            // D. XỬ LÝ NÚT BẤM (BUTTONS)
            if (interaction.isButton()) {
                const { customId, guild, message } = interaction;

                if (customId.startsWith("slide_")) {
                    const parts = customId.split("_");
                    const targetId = parts[1];
                    const currentIndex = parseInt(parts[2], 10);
                    const direction = parts[3];

                    const data = loadData();
                    const userData = data[targetId];
                    if (!userData) return interaction.reply({ content: "❌ Dữ liệu hồ sơ không tồn tại.", flags: 64 });

                    const imageUrls = userData.images || (userData.image ? [userData.image] : []) || [];
                    const total = imageUrls.length;

                    let newIndex = currentIndex;
                    if (direction === "next") newIndex = (currentIndex + 1) % total;
                    else if (direction === "prev") newIndex = (currentIndex - 1 + total) % total;

                    const profileEmbed = EmbedBuilder.from(message.embeds[0]);
                    profileEmbed.setImage(imageUrls[newIndex] || null);

                    const newRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`slide_${targetId}_${newIndex}_prev`).setLabel('<<').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId('dummy').setLabel(`${newIndex + 1}/${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId(`slide_${targetId}_${newIndex}_next`).setLabel('>>').setStyle(ButtonStyle.Secondary)
                    );

                    return await interaction.update({ embeds: [profileEmbed], components: [newRow] });
                }

                if (customId.startsWith("confirm_delete_")) {
                    const targetId = customId.replace("confirm_delete_", "");
                    await deleteProfileCard(guild, client, targetId);
                    return await interaction.update({ content: "✅ Đã xóa hồ sơ cá nhân thành công khỏi Sảnh Danh Vọng!", components: [] });
                }

                if (customId === "cancel_delete") {
                    return await interaction.update({ content: "❌ Đã hủy thao tác xóa.", components: [] });
                }
            }
        } catch (err) {
            console.error("❌ Lỗi trong interactionCreate:", err);
        }
    }
};