const { syncAllProfiles } = require("../utils/profileManager");
const { initCronJobs } = require("../utils/cronJobs");

module.exports = {
    name: "ready",
    once: true,
    async execute(client) {
        console.log(`✅ Bot hoangducbao online: ${client.user.tag}`);

        // Đồng bộ hình ảnh sảnh danh vọng khi vừa online
        try {
            const guilds = await client.guilds.fetch();
            for (const [guildId] of guilds) {
                const guild = await client.guilds.fetch(guildId).catch(() => null);
                if (guild) await syncAllProfiles(guild, client);
            }
            console.log("✅ Hoàn tất quá trình đồng bộ ảnh lúc khởi động!");
        } catch (err) {
            console.error("❌ Lỗi đồng bộ ảnh lúc khởi động:", err);
        }

        // Khởi chạy các Cron jobs
        initCronJobs(client);
    }
};