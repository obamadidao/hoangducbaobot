require("dotenv").config();
const { REST, Routes } = require("discord.js");

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log("⏳ Bắt đầu dọn dẹp các lệnh Discord bị trùng lặp...");

        // Lấy ID ứng dụng từ token
        const client_id = process.env.CLIENT_ID;
        if (!client_id) {
            console.error("❌ Lỗi: Bạn cần cấu hình CLIENT_ID trong file .env để thực thi dọn dẹp!");
            process.exit(1);
        }

        console.log(`🧹 Đang xóa các lệnh Server cục bộ dư thừa cho ID Bot: ${client_id}...`);
        
        // Gửi mảng rỗng để reset sạch tất cả lệnh Toàn cầu
        await rest.put(Routes.applicationCommands(client_id), { body: [] });
        console.log("✅ Đã xóa hoàn toàn các lệnh cũ!");
        
        console.log("✨ Dọn dẹp thành công! Bây giờ bạn hãy bật khởi động lại Bot để hệ thống tự động đồng bộ lại duy nhất 1 lớp lệnh Toàn cầu.");
    } catch (error) {
        console.error("❌ Lỗi khi thực hiện dọn dẹp:", error);
    }
})();