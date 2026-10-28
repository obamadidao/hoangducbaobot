const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('taoprofile')
        .setDescription('Tạo hồ sơ cá nhân và điền ngày sinh nhật')
        .addAttachmentOption(option => option.setName('anh1').setDescription('Ảnh profile 1').setRequired(true))
        .addAttachmentOption(option => option.setName('anh2').setDescription('Ảnh profile 2').setRequired(false))
        .addAttachmentOption(option => option.setName('anh3').setDescription('Ảnh profile 3').setRequired(false))
        .addAttachmentOption(option => option.setName('anh4').setDescription('Ảnh profile 4').setRequired(false))
        .addAttachmentOption(option => option.setName('anh5').setDescription('Ảnh profile 5').setRequired(false)),
    async execute(interaction) {
        // Xử lý được chuyển tiếp qua interactionCreate
    }
};