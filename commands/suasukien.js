const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, PermissionFlagsBits } = require("discord.js");
const { loadEventsData } = require("../utils/db");

const HOANG_DE_ROLE = "1206317832674086944";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suasukien')
        .setDescription('Chỉnh sửa sự kiện đã tạo (Chỉ dùng ở kênh Setup)'),
    async execute(interaction) {
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) || interaction.member.roles.cache.has(HOANG_DE_ROLE);
        const eventsData = loadEventsData();
        const editableEvents = Object.keys(eventsData).filter(id => isAdmin || eventsData[id].creatorId === interaction.user.id);

        if (editableEvents.length === 0) return interaction.reply({ content: "❌ Bạn không có sự kiện nào để sửa!", flags: 64 });

        const selectMenu = new StringSelectMenuBuilder().setCustomId("select_event_edit").setPlaceholder("Chọn sự kiện bạn muốn chỉnh sửa...");
        editableEvents.forEach(id => {
            selectMenu.addOptions({ label: eventsData[id].name.slice(0, 100), value: id, description: `Ngày: ${eventsData[id].day}/${eventsData[id].month}` });
        });
        return await interaction.reply({ content: "⚙️ **Chọn sự kiện bạn muốn sửa thông tin:**", components: [new ActionRowBuilder().addComponents(selectMenu)], flags: 64 });
    }
};