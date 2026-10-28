const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { loadData, getDaysUntilBirthday, formatBirthday } = require("../utils/db");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('birthdays')
        .setDescription('Xem danh sách sinh nhật của tất cả thành viên (Chỉ dùng ở kênh Setup)'),
    async execute(interaction) {
        await interaction.deferReply();
        const data = loadData();
        let listText = ""; let index = 1;
        for (const userId in data) {
            const userData = data[userId];
            if (userData.day && userData.month) {
                const daysLeft = getDaysUntilBirthday(userData.day, userData.month);
                listText += `#${index} 👤 **${userData.name}** - 🎂 ${formatBirthday(userData.day, userData.month, userData.year)} (Còn **${daysLeft} ngày**)\n\n`;
                index++;
            }
        }
        const listEmbed = new EmbedBuilder().setColor("#FFB6C1").setTitle("🎂 DANH SÁCH SINH NHẬT THÀNH VIÊN 🎂").setDescription(listText || "Chưa có thành viên nào cập nhật hồ sơ sinh nhật.").setTimestamp();
        return await interaction.editReply({ embeds: [listEmbed] });
    }
};