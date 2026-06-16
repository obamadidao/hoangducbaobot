require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
    new SlashCommandBuilder()
        .setName("taoprofile")
        .setDescription("Tạo hồ sơ cá nhân (Tải ảnh trước, điền thông tin ở Popup sau)")
        // Chỉ giữ lại duy nhất các tùy chọn tải file ảnh
        .addAttachmentOption(o => o.setName("anh1").setDescription("Ảnh số 1 (Bắt buộc)").setRequired(true))
        .addAttachmentOption(o => o.setName("anh2").setDescription("Ảnh số 2 (Tùy chọn)").setRequired(false))
        .addAttachmentOption(o => o.setName("anh3").setDescription("Ảnh số 3 (Tùy chọn)").setRequired(false))
        .addAttachmentOption(o => o.setName("anh4").setDescription("Ảnh số 4 (Tùy chọn)").setRequired(false))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log("Đang đồng bộ giao diện lệnh /taoprofile (Chỉ giữ lại ô up ảnh)...");
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log("✅ Đã cập nhật thành công! Thanh gõ lệnh bây giờ chỉ còn đúng chỗ up ảnh.");
    } catch (err) {
        console.error("Lỗi:", err);
    }
})();