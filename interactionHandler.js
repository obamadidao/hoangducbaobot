// File: interactionHandler.js
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Require các hàm tiện ích của bạn ở đây (loadData, loadEventsData, saveEventsData, v.v.)
// Nếu các hàm này đang nằm ở index.js, tốt nhất bạn nên chuyển chúng sang 1 file utils.js riêng.

module.exports = async (interaction, client) => {
    try {
        // ==========================================
        // 1. XỬ LÝ LỆNH SLASH (COMMANDS)
        // ==========================================
        if (interaction.isChatInputCommand()) {
            const { commandName, user } = interaction;
            const isAdmin = interaction.member.permissions.has("Administrator"); // Ví dụ check admin

            // Dán toàn bộ if (commandName === "...") vào đây
            // Gồm: taosukien, suasukien, xoasukien, danhsachsukien, sukien...
        }

        // ==========================================
        // 2. XỬ LÝ MENU THẢ XUỐNG (SELECT MENUS)
        // ==========================================
        if (interaction.isStringSelectMenu()) {
            const { customId, values, guild } = interaction;
            const targetId = values[0];

            // Dán toàn bộ if (customId === "select_...") vào đây
            // Gồm: select_edit_profile, select_delete_profile, select_birthday_lookup, select_event_edit...
        }

        // ==========================================
        // 3. XỬ LÝ BẢNG BIỂU (MODALS)
        // ==========================================
        if (interaction.isModalSubmit()) {
            const { customId, guild, fields, user } = interaction;

            // Dán toàn bộ if (customId === "...") của Modal vào đây
            // Gồm: profile_modal_*, edit_profile_modal_*, sticky_modal, create_event_modal, edit_event_modal_*...
        }

        // ==========================================
        // 4. XỬ LÝ NÚT BẤM (BUTTONS)
        // ==========================================
        if (interaction.isButton()) {
            const { customId, guild, message, user } = interaction;

            // Dán toàn bộ if (customId === "...") của Button vào đây
            // Gồm: slide_*, changephoto_*, deletephoto_*, confirm_delete_*, cancel_delete...
        }

    } catch (interactError) {
        console.error("❌ Phát hiện lỗi trong trình xử lý tương tác của Bot:", interactError);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: "❌ Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!", flags: ['Ephemeral'] }).catch(() => null);
            } else {
                await interaction.reply({ content: "❌ Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau!", flags: ['Ephemeral'] }).catch(() => null);
            }
        } catch (innerErr) {
            // Bỏ qua lỗi
        }
    }
};