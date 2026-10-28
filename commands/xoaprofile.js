const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xoaprofile')
        .setDescription('Xóa hồ sơ cá nhân và ngày sinh khỏi danh sách'),
    async execute(interaction) {
        // Xử lý được chuyển tiếp qua interactionCreate
    }
};