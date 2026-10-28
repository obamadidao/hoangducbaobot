const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('taosukien')
        .setDescription('Tạo sự kiện nhắc nhở mới (Chỉ dùng ở kênh Setup)')
        .addRoleOption(option => option.setName('role1').setDescription('Vai trò nhận thông báo 1').setRequired(false))
        .addRoleOption(option => option.setName('role2').setDescription('Vai trò nhận thông báo 2').setRequired(false)),
    async execute(interaction, client) {
        const role1 = interaction.options.getRole("role1");
        const role2 = interaction.options.getRole("role2");
        const rolesSelected = [role1, role2].filter(Boolean).map(r => r.id);

        client.tempEventRoles.set(interaction.user.id, rolesSelected);

        const modal = new ModalBuilder().setCustomId(`create_event_modal`).setTitle("Tạo Sự Kiện Nhắc Nhở");
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_sukien_name").setLabel("Tên sự kiện").setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_sukien_date").setLabel("Ngày diễn ra (Vd: 14/02)").setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_sukien_msg").setLabel("Nội dung lời nhắn thông báo").setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        return await interaction.showModal(modal);
    }
};