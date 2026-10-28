const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suaprofile')
        .setDescription('Sửa hồ sơ cá nhân và ngày sinh dạng chữ (Siêu gọn gàng)'),
    async execute(interaction) {
        // Xử lý được chuyển tiếp qua interactionCreate
    }
};