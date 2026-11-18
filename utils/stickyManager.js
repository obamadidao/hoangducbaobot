const { EmbedBuilder } = require("discord.js");
const { loadStickyData, saveStickyData } = require("./db");

const channelTimers = new Map();      // Bộ đếm thời gian chờ theo kênh
const channelMsgCounts = new Map();   // Đếm số tin nhắn trôi qua
const channelLocks = new Set();       // Khóa chống gửi trùng lặp

const DEBOUNCE_MS = 2500;             // Đợi 2.5 giây sau khi ngừng chat mới đẩy xuống
const MAX_MESSAGES_BEFORE_BUMP = 4;   // Đẩy ngay lập tức nếu trôi quá 4 tin nhắn

// Chuyển đổi tên màu tiếng Việt hoặc mã Hex sang mã màu chuẩn
function resolveStickyColor(input) {
    if (!input) return "#F1C40F";
    const clean = input.trim().toLowerCase();
    const colorMap = {
        "vang": "#F1C40F",
        "do": "#ED4245",
        "xanh": "#3498DB",
        "xanhla": "#2ECC71",
        "hong": "#FFB6C1",
        "tim": "#9B59B6",
        "cam": "#E67E22",
        "trang": "#FFFFFF",
        "den": "#2F3136"
    };
    if (colorMap[clean]) return colorMap[clean];
    if (/^#?[0-9a-f]{6}$/i.test(clean)) {
        return clean.startsWith("#") ? clean : `#${clean}`;
    }
    return "#F1C40F";
}

// Tạo nội dung gửi (Embed khung hoặc Text thường)
function buildStickyPayload(stickyConfig) {
    const style = (stickyConfig.style || "embed").toLowerCase();
    const title = stickyConfig.title || "📌 TIN NHẮN GHIM";
    const text = stickyConfig.text || "";

    if (style === "text") {
        return {
            content: `**${title}**\n${text}`
        };
    }

    const embed = new EmbedBuilder()
        .setColor(resolveStickyColor(stickyConfig.color))
        .setTitle(title)
        .setDescription(text)
        .setFooter({ text: "Tin nhắn ghim tự động • Luôn hiển thị ở cuối kênh" });

    return { embeds: [embed] };
}

// Dọn dẹp bộ đếm khi gỡ ghim (/unsticky)
function clearStickyState(channelId) {
    if (channelTimers.has(channelId)) {
        clearTimeout(channelTimers.get(channelId));
        channelTimers.delete(channelId);
    }
    channelMsgCounts.delete(channelId);
}

// Hàm cốt lõi: Xóa ghim cũ và đẩy ghim mới xuống đáy kênh
async function bumpStickyMessage(channel, client) {
    if (!channel || !channel.isTextBased()) return;
    const channelId = channel.id;

    if (channelLocks.has(channelId)) return;
    channelLocks.add(channelId);

    try {
        const stickyData = loadStickyData();
        const config = stickyData[channelId];
        if (!config) return;

        // Nếu tin nhắn ghim hiện tại vẫn đang nằm dưới cùng thì không cần gửi lại
        if (config.lastMessageId && channel.lastMessageId === config.lastMessageId) {
            channelMsgCounts.set(channelId, 0);
            return;
        }

        // Xóa tin nhắn ghim cũ
        if (config.lastMessageId) {
            const oldMsg = await channel.messages.fetch(config.lastMessageId).catch(() => null);
            if (oldMsg) {
                await oldMsg.delete().catch(() => null);
            }
        }

        // Gửi tin nhắn ghim mới xuống cuối kênh
        const payload = buildStickyPayload(config);
        const newMsg = await channel.send(payload).catch(() => null);

        if (newMsg) {
            const freshData = loadStickyData();
            if (freshData[channelId]) {
                freshData[channelId].lastMessageId = newMsg.id;
                saveStickyData(freshData);
            }
            channelMsgCounts.set(channelId, 0);
        }
    } catch (err) {
        console.error(`❌ Lỗi khi đẩy tin nhắn ghim tại kênh ${channelId}:`, err);
    } finally {
        channelLocks.delete(channelId);
    }
}

// Hàm kích hoạt mỗi khi có tin nhắn mới trong kênh
async function handleStickyMessage(message, client) {
    if (!message.guild || !message.channel) return;

    const channelId = message.channel.id;
    const stickyData = loadStickyData();
    const config = stickyData[channelId];

    if (!config) return;

    // Bỏ qua chính tin nhắn ghim do bot vừa gửi ra
    if (message.id === config.lastMessageId) return;
    if (
        message.author?.id === client.user?.id &&
        message.embeds?.[0]?.footer?.text?.includes("Tin nhắn ghim tự động")
    ) {
        return;
    }

    const currentCount = (channelMsgCounts.get(channelId) || 0) + 1;
    channelMsgCounts.set(channelId, currentCount);

    if (channelTimers.has(channelId)) {
        clearTimeout(channelTimers.get(channelId));
        channelTimers.delete(channelId);
    }

    // Chat dồn dập (>= 4 tin) -> đẩy xuống ngay lập tức
    if (currentCount >= MAX_MESSAGES_BEFORE_BUMP) {
        await bumpStickyMessage(message.channel, client);
        return;
    }

    // Đợi 2.5 giây sau tin nhắn cuối cùng rồi mới đẩy xuống
    const timer = setTimeout(async () => {
        channelTimers.delete(channelId);
        await bumpStickyMessage(message.channel, client);
    }, DEBOUNCE_MS);

    channelTimers.set(channelId, timer);
}

// Đồng bộ lại tất cả tin nhắn ghim khi Bot khởi động lại
async function syncAllStickies(client) {
    const stickyData = loadStickyData();
    const channelIds = Object.keys(stickyData);

    for (const channelId of channelIds) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) continue;

        const latestMsgs = await channel.messages.fetch({ limit: 1 }).catch(() => null);
        const lastMsg = latestMsgs?.first();

        if (!lastMsg || lastMsg.id !== stickyData[channelId].lastMessageId) {
            await bumpStickyMessage(channel, client);
        }
    }
}

module.exports = {
    bumpStickyMessage,
    handleStickyMessage,
    syncAllStickies,
    clearStickyState
};