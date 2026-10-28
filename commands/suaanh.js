const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suaanh')
        .setDescription('Thay thế hoặc thêm ảnh mới trực quan cho hồ sơ'),
    async execute(interaction) {
        // Xử lý được chuyển tiếp qua interactionCreate
    }
};