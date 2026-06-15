require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
    new SlashCommandBuilder()
        .setName("taoprofile")
        .setDescription("Tạo hồ sơ cá nhân và nhập ngày sinh của bạn")
        .addStringOption(o => o.setName("ten").setDescription("Tên hiển thị").setRequired(true))
        .addIntegerOption(o => o.setName("ngay").setDescription("Ngày sinh").setRequired(true))
        .addIntegerOption(o => o.setName("thang").setDescription("Tháng sinh").setRequired(true))
        .addIntegerOption(o => o.setName("nam").setDescription("Năm sinh").setRequired(true))
        .addStringOption(o => o.setName("noio").setDescription("Nơi ở hiện tại").setRequired(true))
        .addStringOption(o => o.setName("sothich").setDescription("Sở thích / Game").setRequired(true))
        .addAttachmentOption(o => o.setName("anh").setDescription("Ảnh cá nhân").setRequired(true)),
    
    new SlashCommandBuilder()
        .setName("birthdays")
        .setDescription("Xem danh sách sinh nhật và đếm ngược")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log("Đang đăng ký lệnh lên Server...");
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log("✅ Deploy commands thành công!");
    } catch (err) {
        console.error(err);
    }
})();