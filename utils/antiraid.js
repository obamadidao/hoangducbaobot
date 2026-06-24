const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");

// CẤU HÌNH THEO DÕI AN NINH SPAM CHÉO KÊNH
const crossChannelSpamTracker = new Map();
const SPAM_WINDOW_MS = 5000;         // Khung thời gian rà soát dưới 5 giây
const SPAM_CHANNEL_THRESHOLD = 3;   // Số kênh khác nhau bị spam cùng nội dung để kích hoạt BAN

/**
 * Hàm phân tích và chặn đứng hành vi Spam/Raid phá hoại chéo kênh
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

    // Chỉ rà soát các tin nhắn có độ dài nội dung thực tế hoặc đính kèm ảnh bet/link cờ bạc
    if (messageSignature.length > 5) {
        if (!crossChannelSpamTracker.has(userId)) {
            crossChannelSpamTracker.set(userId, []);
        }

        let userRecords = crossChannelSpamTracker.get(userId);
        // Quét dọn các bản ghi đã quá thời gian 5 giây để giải phóng bộ nhớ RAM
        userRecords = userRecords.filter(rec => now - rec.timestamp < SPAM_WINDOW_MS);

        // Đẩy thông tin tin nhắn hiện tại vào bộ đếm
        userRecords.push({
            messageId: message.id,
            channelId: message.channel.id,
            signature: messageSignature,
            timestamp: now
        });
        crossChannelSpamTracker.set(userId, userRecords);

        // Lọc ra các tin nhắn giống hệt chữ ký này gửi đi trong vòng 5 giây
        const identicalSpams = userRecords.filter(rec => rec.signature === messageSignature);
        
        // Đếm số lượng các kênh chat khác nhau nhận cùng một nội dung tin nhắn này
        const uniqueChannels = new Set(identicalSpams.map(rec => rec.channelId));

        if (uniqueChannels.size >= SPAM_CHANNEL_THRESHOLD) {
            console.log(`🚨 PHÁT HIỆN RAID: Spam bot ${message.author.tag} (${userId}) phát tán chéo ${uniqueChannels.size} kênh.`);

            const memberToBan = message.member || await message.guild.members.fetch(userId).catch(() => null);
            if (memberToBan && memberToBan.bannable) {
                // 1. Tự động xóa (delete) nhanh các tin nhắn spam chéo vừa ghi nhận trong 5 giây qua để sảnh chat sạch ngay lập tức
                for (const rec of identicalSpams) {
                    const targetChan = await message.guild.channels.fetch(rec.channelId).catch(() => null);
                    if (targetChan && targetChan.isTextBased()) {
                        const targetMsg = await targetChan.messages.fetch(rec.messageId).catch(() => null);
                        if (targetMsg) await targetMsg.delete().catch(() => null);
                    }
                }

                // 2. Thực hiện BAN vĩnh viễn nick spam khỏi Server và xóa SẠCH TOÀN BỘ TIN NHẮN trong vòng 7 ngày qua của tài khoản này
                await memberToBan.ban({
                    deleteMessageSeconds: 7 * 24 * 60 * 60, // Tối ưu hóa lên 7 ngày (604800s) - Mức tối đa của Discord để dọn sạch mọi dấu vết
                    reason: "🚨 Chặn đứng hành động Spam Bot/Raid quảng cáo Bet cờ bạc chéo nhiều kênh. Hệ thống đã tự động dọn sạch mọi tin nhắn trong 7 ngày qua."
                }).catch(err => console.error("❌ Không thể ban spam bot:", err));

                // 3. Tự động gửi báo cáo khẩn cấp về kênh Log/Setup hoặc Sảnh
                const logChannel = await message.guild.channels.fetch(process.env.BIRTHDAY_CHANNEL_ID || "1313150267881033739").catch(() => null);
                if (logChannel) {
                    const alertEmbed = new EmbedBuilder()
                        .setColor("#FF0000")
                        .setTitle("🛡️ HỆ THỐNG AN NINH: ĐÃ BAN SPAM BOT 🛡️")
                        .setDescription(`Đã kích hoạt chế độ tự vệ khẩn cấp, chặn đứng cuộc tấn công Spam/Raid của tài khoản phá hoại.`)
                        .addFields(
                            { name: "👤 Tài khoản phá hoại:", value: `<@${userId}> | **${message.author.tag}**\n(ID: \`${userId}\`)` },
                            { name: "📊 Kênh bị tấn công:", value: `Phát tán đồng thời trên **${uniqueChannels.size} kênh** trong vòng 5 giây.` },
                            { name: "🧹 Trạng thái dọn dẹp:", value: `Đã tự động xóa sạch **100% tin nhắn** của tài khoản này gửi ở tất cả các kênh trong vòng **7 ngày qua**.` },
                            { name: "📝 Nội dung bị chặn đứng:", value: `\`\`\`${message.content ? message.content.slice(0, 500) : "[Tập tin hình ảnh quảng cáo]"}\`\`\`` }
                        )
                        .setFooter({ text: "Hệ thống bảo vệ an ninh tự động" })
                        .setTimestamp();
                    await logChannel.send({ embeds: [alertEmbed] }).catch(() => null);
                }

                // Giải phóng dọn dẹp bộ nhớ theo dõi của nick bị ban
                crossChannelSpamTracker.delete(userId);
                return true;
            }
        }
    }
    return false;
}

module.exports = {
    handleAntiRaid
};