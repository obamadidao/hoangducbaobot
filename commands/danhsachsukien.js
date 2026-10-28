const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { loadEventsData, getDaysUntilBirthday } = require("../utils/db");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('danhsachsukien')
        .setDescription('Xem danh sách tất cả các sự kiện đã được lưu (Chỉ dùng ở kênh Setup)'),
    async execute(interaction) {
        await interaction.deferReply();
        const eventsData = loadEventsData();
        let listText = ""; let index = 1;
        for (const id in eventsData) {
            const event = eventsData[id];
            const daysLeft = getDaysUntilBirthday(event.day, event.month);
            listText += `#${index} 🔔 **${event.name}** - 📆 Ngày: ${event.day}/${event.month} (Còn **${daysLeft} ngày**) - ✍️ Người tạo: <@${event.creatorId}>\n\n`;
            index++;
        }
        const listEmbed = new EmbedBuilder().setColor("#F1C40F").setTitle("✨ DANH SÁCH SỰ KIỆN TRONG SERVER ✨").setDescription(listText || "Chưa có sự kiện nào được tạo lập nhắc nhở.").setTimestamp();
        return await interaction.editReply({ embeds: [listEmbed] });
    }
};