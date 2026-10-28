const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require("discord.js");
const { loadEventsData } = require("../utils/db");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sukien')
        .setDescription('Tra cứu sự kiện trong server (Sử dụng được ở mọi nơi)'),
    async execute(interaction) {
        const eventsData = loadEventsData();
        const eventIds = Object.keys(eventsData);
        if (eventIds.length === 0) return interaction.reply({ content: "❌ Chưa có sự kiện nhắc nhở nào được lưu!", flags: 64 });

        const selectMenu = new StringSelectMenuBuilder().setCustomId("select_event_lookup").setPlaceholder("Chọn sự kiện để tra cứu...");
        eventIds.forEach(id => {
            selectMenu.addOptions({ label: eventsData[id].name.slice(0, 100), value: id, description: `Người tạo: @${eventsData[id].creatorName || "Ẩn danh"}` });
        });
        return await interaction.reply({ content: "🔔 **Chọn sự kiện bạn muốn tra cứu thông tin:**", components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }
};