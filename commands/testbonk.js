const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const path = require("path");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("testbonk")
        .setDescription("Test hiển thị thông báo Anti-Raid kèm GIF Mega Bonk")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const bonkGifPath = path.join(__dirname, "..", "assets", "images", "bonk.gif");

        const bonkEmbed = new EmbedBuilder()
            .setColor("#ED4245")
            .setTitle("NGÔNG CUỒNG?")
            .setDescription(`Quá bướng!! Thầy ở đây mà dám làm loạn à **<@${interaction.user.id}>** (${interaction.user.tag}).\nPhệt ngay 1 chày vào mặt! 💥\n\n🫵 **Cái tội:** *Spam 5 lần liên tục (MẪU TEST)*`)
            .setImage("attachment://bonk.gif")
            .setTimestamp();

        await interaction.reply({
            embeds: [bonkEmbed],
            files: [{ attachment: bonkGifPath, name: "bonk.gif" }]
        });
    }
};