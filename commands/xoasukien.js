const { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, PermissionFlagsBits } = require("discord.js");
const { loadEventsData } = require("../utils/db");

const HOANG_DE_ROLE = "1206317832674086944";

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xoasukien')
        .setDescription('Xóa sự kiện đã tạo khỏi hệ thống (Chỉ dùng ở kênh Setup)'),
    async execute(interaction) {
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) || interaction.member.roles.cache.has(HOANG_DE_ROLE);
        const eventsData = loadEventsData();
        const deletableEvents = Object.keys(eventsData).filter(id => isAdmin || eventsData[id].creatorId === interaction.user.id);

        if (deletableEvents.length === 0) return interaction.reply({ content: "❌ Bạn không sở hữu sự kiện nào để tiến hành xóa!", flags: 64 });

        const selectMenu = new StringSelectMenuBuilder().setCustomId("select_event_delete").setPlaceholder("Chọn sự kiện bạn muốn xóa bỏ...");
        deletableEvents.forEach(id => {
            selectMenu.addOptions({ label: eventsData[id].name.slice(0, 100), value: id, description: `Ngày: ${eventsData[id].day}/${eventsData[id].month}` });
        });
        return await interaction.reply({ content: "🚨 **Chọn sự kiện bạn muốn xóa vĩnh viễn khỏi server:**", components: [new ActionRowBuilder().addComponents(selectMenu)], flags: 64 });
    }
};