const { handleAntiRaid } = require("../utils/antiraid");
const { handleStickyMessage } = require("../utils/stickyManager");

const HOANG_DE_ROLE = "1206317832674086944";

module.exports = {
    name: "messageCreate",
    async execute(message, client) {
        if (!message.guild) return;

        // 1. Bảo vệ Anti-Raid & Bẫy kênh (chỉ kiểm tra tin nhắn của người dùng)
        if (!message.author.bot) {
            const isSpamIntercepted = await handleAntiRaid(message, client, HOANG_DE_ROLE);
            if (isSpamIntercepted === true) return;
        }

        // 2. Đẩy tin nhắn ghim xuống cuối kênh (bao gồm cả khi bot khác nhắn tin)
        await handleStickyMessage(message, client);
    }
};