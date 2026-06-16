require("dotenv").config();
const { REST, Routes } = require("discord.js");

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log("⏳ Đang tiến hành xóa sạch các lệnh ẩn bị trùng lặp...");
        
        // Thay ID Bot của bạn vào chuỗi dưới đây nếu cần thiết
        const BOT_ID = "1514087690738471092"; 

        // Xóa sạch lệnh Toàn cầu (Global)
        await rest.put(Routes.applicationCommands(BOT_ID), { body: [] });
        console.log("🧹 Đã xóa sạch các lệnh Toàn cầu (Global) cũ!");
        
        console.log("✨ Xử lý xong! Hãy tắt file này đi.");
    } catch (error) {
        console.error("❌ Lỗi dọn dẹp:", error);
    }
})();