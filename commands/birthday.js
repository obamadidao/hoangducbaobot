const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const { loadData } = require("../utils/db");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('birthday')
        .setDescription('Tra cứu sinh nhật của một thành viên bất kỳ (Sử dụng được ở mọi nơi)'),
    async execute(interaction, client) {
        const data = loadData();
        const userIds = Object.keys(data);
        if (userIds.length === 0) return interaction.reply({ content: "❌ Chưa có hồ sơ sinh nhật nào!", flags: 64 });

        const selectMenu = new StringSelectMenuBuilder().setCustomId("select_birthday_lookup").setPlaceholder("Chọn thành viên để xem ngày sinh nhật...");
        for (const id of userIds) {
            const userData = data[id];
            const userObj = client.users.cache.get(id) || await client.users.fetch(id).catch(() => null);
            selectMenu.addOptions({
                label: `${userData.name}${userObj ? ` (@${userObj.username})` : ""}`.slice(0, 100),
                value: id,
                description: `Discord ID: ${id}`
            });
        }
        return await interaction.reply({ content: "🎂 **Chọn thành viên bạn muốn xem thông tin sinh nhật:**", components: [new ActionRowBuilder().addComponents(selectMenu)] });
    }
};