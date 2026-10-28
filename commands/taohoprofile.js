const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('taohoprofile')
        .setDescription('Tạo hộ hồ sơ cá nhân cho thành viên khác (Chỉ dùng cho QTV)')
        .addUserOption(option => option.setName('user').setDescription('Thành viên muốn tạo hộ').setRequired(true))
        .addAttachmentOption(option => option.setName('anh1').setDescription('Ảnh profile 1').setRequired(true))
        .addAttachmentOption(option => option.setName('anh2').setDescription('Ảnh profile 2').setRequired(false))
        .addAttachmentOption(option => option.setName('anh3').setDescription('Ảnh profile 3').setRequired(false))
        .addAttachmentOption(option => option.setName('anh4').setDescription('Ảnh profile 4').setRequired(false))
        .addAttachmentOption(option => option.setName('anh5').setDescription('Ảnh profile 5').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
        // Xử lý được chuyển tiếp qua interactionCreate
    }
};