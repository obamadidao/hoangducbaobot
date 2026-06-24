const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");

// CẤU HÌNH THEO DÕI AN NINH
const crossChannelSpamTracker = new Map();
const SPAM_WINDOW_MS = 10000;         // Đã nới lỏng lên 10 giây (10000ms) để dễ thao tác bằng tay khi test
const SPAM_CROSS_CHANNEL_THRESHOLD = 3; // Điều kiện 1: Số kênh khác nhau bị spam
const SPAM_SAME_CHANNEL_THRESHOLD = 5;  // Điều kiện 2: Số tin nhắn spam liên tục trong cùng 1 kênh

/**
 * Hàm phân tích và chặn đứng hành vi Spam/Raid phá hoại chéo kênh và cùng kênh
 * @param {import("discord.js").Message} message 
 * @param {import("discord.js").Client} client 
 * @param {string} HOANG_DE_ROLE_ID 
 * @returns {Promise<boolean>} True nếu phát hiện Spam Bot và đã thực thi BAN dọn dẹp xong
 */
async function handleAntiRaid(message, client, HOANG_DE_ROLE_ID) {
    const isWhitelisted = message.member && (
        message.member.permissions.has(PermissionFlagsBits.Administrator) || 
        message.member.roles.cache.has(HOANG_DE_ROLE_ID)
    );

    if (isWhitelisted) return false;

    const now = Date.now();
    const userId = message.author.id;
    
    // Tạo mã chữ ký độc bản (Gộp nội dung văn bản chuẩn hóa + Thuộc tính tệp đính kèm)
    const textSig = message.content ? message.content.trim().toLowerCase() : "";
    const attachSig = message.attachments.map(a => a.name + "_" + a.size).join(",");
    const messageSignature = `${textSig}||${attachSig}`;

    // Chỉ rà soát các tin nhắn có độ dài nội dung thực tế (> 5 ký tự) hoặc đính kèm ảnh bet/link cờ bạc
    if (messageSignature.length > 5) {
        if (!crossChannelSpamTracker.has(userId)) {
            crossChannelSpamTracker.set(userId, []);
        }

        let userRecords = crossChannelSpamTracker.get(userId);
        // Quét dọn các bản ghi đã quá thời gian 10 giây để giải phóng bộ nhớ RAM
        userRecords = userRecords.filter(rec => now - rec.timestamp < SPAM_WINDOW_MS);

        // Đẩy thông tin tin nhắn hiện tại vào bộ đếm
        userRecords.push({
            messageId: message.id,
            channelId: message.channel.id,
            signature: messageSignature,
            timestamp: now
        });
        crossChannelSpamTracker.set(userId, userRecords);

        // Lọc ra các tin nhắn giống hệt chữ ký này gửi đi trong vòng 10 giây
        const identicalSpams = userRecords.filter(rec => rec.signature === messageSignature);
        
        // Đếm số lượng các kênh chat khác nhau nhận cùng một nội dung tin nhắn này
        const uniqueChannels = new Set(identicalSpams.map(rec => rec.channelId));

        // PHÂN TÍCH ĐIỀU KIỆN BAN
        const isCrossChannelSpam = uniqueChannels.size >= SPAM_CROSS_CHANNEL_THRESHOLD;
        const isSameChannelSpam = identicalSpams.length >= SPAM_SAME_CHANNEL_THRESHOLD;

        if (isCrossChannelSpam || isSameChannelSpam) {
            const spamTypeStr = isCrossChannelSpam 
                ? `phát tán chéo ${uniqueChannels.size} kênh` 
                : `spam liên tục ${identicalSpams.length} lần vào cùng một kênh`;

            console.log(`🚨 PHÁT HIỆN RAID: ${message.author.tag} (${userId}) ${spamTypeStr}.`);

            const memberToBan = message.member || await message.guild.members.fetch(userId).catch(() => null);
            
            // KIỂM TRA QUYỀN HẠN CỦA BOT TRƯỚC KHI BAN
            if (memberToBan && memberToBan.bannable) {
                // 1. Tự động xóa (delete) nhanh các tin nhắn spam chéo vừa ghi nhận
                for (const rec of identicalSpams) {
                    const targetChan = await message.guild.channels.fetch(rec.channelId).catch(() => null);
                    if (targetChan && targetChan.isTextBased()) {
                        const targetMsg = await targetChan.messages.fetch(rec.messageId).catch(() => null);
                        if (targetMsg) await targetMsg.delete().catch(() => null);
                    }
                }

                // 2. Thực hiện BAN vĩnh viễn và xóa sạch tin trong 7 ngày
                await memberToBan.ban({
                    deleteMessageSeconds: 7 * 24 * 60 * 60,
                    reason: `🚨 Chặn đứng hành động Spam Bot/Raid (${spamTypeStr}).`
                }).catch(err => console.error("❌ Không thể ban spam bot:", err));

                // 3. Tự động gửi báo cáo khẩn cấp về kênh chat chung
                const logChannel = await message.guild.channels.fetch("1206335749864296560").catch(() => null);
                if (logChannel) {
                    const alertEmbed = new EmbedBuilder()
                        .setColor("#FF0000")
                        .setTitle("🛡️ HỆ THỐNG AN NINH: ĐÃ BAN SPAM BOT 🛡️")
                        .setDescription(`Đã kích hoạt chế độ tự vệ khẩn cấp, chặn đứng cuộc tấn công Spam/Raid của tài khoản phá hoại.`)
                        .addFields(
                            { name: "👤 Tài khoản phá hoại:", value: `<@${userId}> | **${message.author.tag}**\n(ID: \`${userId}\`)` },
                            { name: "📊 Hành vi bị bắt quả tang:", value: `Phát hiện **${spamTypeStr}** trong thời gian ngắn.` },
                            { name: "🧹 Trạng thái dọn dẹp:", value: `Đã tự động xóa sạch **100% tin nhắn** của tài khoản này gửi ở tất cả các kênh trong vòng **7 ngày qua**.` },
                            { name: "📝 Nội dung bị chặn đứng:", value: `\`\`\`${message.content ? message.content.slice(0, 500) : "[Tập tin hình ảnh quảng cáo]"}\`\`\`` }
                        )
                        .setFooter({ text: "Hệ thống bảo vệ an ninh tự động" })
                        .setTimestamp();
                    await logChannel.send({ embeds: [alertEmbed] }).catch(() => null);
                }

                crossChannelSpamTracker.delete(userId);
                return true;
            } else {
                // IN CẢNH BÁO BẤT LỰC RA CONSOLE (LOG RAILWAY) NẾU BOT THIẾU QUYỀN
                console.log(`⚠️ BẤT LỰC: Đã phát hiện ${message.author.tag} spam nhưng Bot KHÔNG THỂ BAN.`);
                console.log(`👉 Lý do: Role của Bot nằm DƯỚI role của người này, hoặc tài khoản này là Chủ Server.`);
            }
        }
    }
    return false;
}

module.exports = {
    handleAntiRaid
};