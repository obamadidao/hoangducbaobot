const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const path = require("path");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("testbonk")
        .setDescription("Test hiển thị thông báo Anti-Raid kèm ảnh Bonk")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const bonkImagePath = path.join(__dirname, "..", "assets", "images", "bonk.png");

        const bonkEmbed = new EmbedBuilder()
            .setColor("#ED4245")
            .setTitle("NGÔNG CUỒNG?")
            .setDescription(`Quá bướng!! Thầy ở đây mà dám spam à **<@${interaction.user.id}>** (${interaction.user.tag}).\nPhệt ngay 1 chày vào mặt! 💥\n\n📌 **Cái tội** *Spam*`)
            .setImage("attachment://bonk.png")
            .setTimestamp();

        await interaction.reply({
            embeds: [bonkEmbed],
            files: [{ attachment: bonkImagePath, name: "bonk.png" }]
        });
    }
};