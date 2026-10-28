const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sticky')
        .setDescription('Tạo cấu hình tin nhắn ghim dính ở cuối kênh chat thông qua bảng Modal')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
        // Xử lý được chuyển tiếp qua interactionCreate
    }
};