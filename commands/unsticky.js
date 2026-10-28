const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unsticky')
        .setDescription('Gỡ bỏ tin nhắn ghim dính tại kênh này')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    async execute(interaction) {
        // Xử lý được chuyển tiếp qua interactionCreate
    }
};