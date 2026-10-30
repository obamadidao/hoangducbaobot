const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { syncAllProfiles } = require("../utils/profileManager");
const { initCronJobs } = require("../utils/cronJobs");

module.exports = {
    name: "ready",
    once: true,
    async execute(client) {
        console.log(`✅ Bot hoangducbao online: ${client.user.tag}`);

        // --- 1. TỰ ĐỘNG ĐĂNG KÝ (DEPLOY) SLASH COMMANDS VỚI DISCORD ---
        try {
            const commands = [];
            const commandsPath = path.join(__dirname, "..", "commands");
            
            if (fs.existsSync(commandsPath)) {
                const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));
                for (const file of commandFiles) {
                    const command = require(path.join(commandsPath, file));
                    if (command.data) {
                        commands.push(command.data.toJSON());
                    }
                }
            }

            const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
            console.log("🔄 Đang tiến hành đồng bộ Slash Commands lên Discord...");

            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands }
            );

            console.log(`✅ Đã đồng bộ thành công ${commands.length} lệnh Slash Command lên Discord API!`);
        } catch (err) {
            console.error("❌ Lỗi khi đồng bộ Slash Commands:", err);
        }

        // --- 2. ĐỒNG BỘ HÌNH ẢNH SẢNH DANH VỌNG ---
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

        // --- 3. KHỞI CHẠY CRON JOBS ---
        initCronJobs(client);
    }
};