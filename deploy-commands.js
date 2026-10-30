require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const commands = [];
const commandsPath = path.join(__dirname, "commands");

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));

        if (command.data) {
            const commandData = typeof command.data.toJSON === "function" ? command.data.toJSON() : command.data;
            commands.push(commandData);
            console.log(`📌 Đã đọc lệnh: /${commandData.name}`);
        }
    }
}

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
    try {
        const clientId = process.env.CLIENT_ID;
        const guildId = process.env.GUILD_ID;

        if (!clientId || !guildId) {
            console.error("❌ THIẾU CLIENT_ID HOẶC GUILD_ID TRONG FILE .ENV!");
            return;
        }

        console.log(`⏳ Đang tiến hành đồng bộ ${commands.length} lệnh lên Discord Server...`);

        // Đẩy thẳng danh sách lệnh mới nhất vào Server (Guild)
        const result = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );

        console.log(`✅ ĐÃ ĐỒNG BỘ THÀNH CÔNG ${result.length} LỆNH LÊN SERVER DISCORD!`);
    } catch (err) {
        console.error("❌ Lỗi khi đăng ký lệnh:", err);
    }
})();