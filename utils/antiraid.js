const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");

// CẤU HÌNH THEO DÕI AN NINH
const crossChannelSpamTracker = new Map();
const SPAM_WINDOW_MS = 10000;         // Khung thời gian rà soát dưới 10 giây
const SPAM_CROSS_CHANNEL_THRESHOLD = 3; // Số kênh khác nhau bị spam
const SPAM_SAME_CHANNEL_THRESHOLD = 5;  // Số tin nhắn spam liên tục 1 kênh

/**
 * Hàm phân tích và chặn đứng hành vi Spam/Raid phá hoại chéo kênh và cùng kênh
 */
async function handleAntiRaid(message, client, HOANG_DE_ROLE_ID) {
    const userId = message.author.id;

    // --- CHẾ ĐỘ SIÊU GỠ LỖI (BẮT BỆNH TẬN GỐC) ---
    console.log(`\n[DEBUG ANTI-RAID] -----------------------------`);
    console.log(`[DEBUG] 1. Nhận tin nhắn từ: ${message.author.tag}`);
    console.log(`[DEBUG] 2. Nội dung đọc được: "${message.content}"`);

    // 1. Kiểm tra lỗi thiếu Intent (Cực kỳ phổ biến)
    if (!message.content && message.attachments.size === 0) {
        console.log(`[DEBUG] ❌ THẤT BẠI: Nội dung trống rỗng. Lỗi 99% do chưa bật "Message Content Intent" trong trang Discord Developer Portal!`);
        return false;
    }

    const isWhitelisted = message.member && (
        message.member.permissions.has(PermissionFlagsBits.Administrator) || 
        message.member.roles.cache.has(HOANG_DE_ROLE_ID)
    );

    // 2. Kiểm tra quyền ẩn của nick clone
    if (isWhitelisted) {
        console.log(`[DEBUG] ❌ THẤT BẠI: Nick clone này đang có quyền Quản trị viên (Admin) do một role cơ bản nào đó gây ra. Hệ thống bỏ qua!`);
        return false;
    }

    const now = Date.now();
    const textSig = message.content ? message.content.trim().toLowerCase() : "";
    const attachSig = message.attachments.map(a => a.name + "_" + a.size).join(",");
    const messageSignature = `${textSig}||${attachSig}`;

    // 3. Kiểm tra độ dài tin nhắn
    if (messageSignature.length <= 5) {
        console.log(`[DEBUG] ❌ THẤT BẠI: Tin nhắn quá ngắn (<= 5 ký tự), hệ thống bỏ qua để tránh ban nhầm.`);
        return false;
    }

    if (!crossChannelSpamTracker.has(userId)) {
        crossChannelSpamTracker.set(userId, []);
    }

    let userRecords = crossChannelSpamTracker.get(userId);
    userRecords = userRecords.filter(rec => now - rec.timestamp < SPAM_WINDOW_MS);

    userRecords.push({
        messageId: message.id,
        channelId: message.channel.id,
        signature: messageSignature,
        timestamp: now
    });
    crossChannelSpamTracker.set(userId, userRecords);

    const identicalSpams = userRecords.filter(rec => rec.signature === messageSignature);
    const uniqueChannels = new Set(identicalSpams.map(rec => rec.channelId));

    console.log(`[DEBUG] 3. BỘ ĐẾM: Gửi ${identicalSpams.length}/${SPAM_SAME_CHANNEL_THRESHOLD} lần | Quét ${uniqueChannels.size}/${SPAM_CROSS_CHANNEL_THRESHOLD} kênh`);

    const isCrossChannelSpam = uniqueChannels.size >= SPAM_CROSS_CHANNEL_THRESHOLD;
    const isSameChannelSpam = identicalSpams.length >= SPAM_SAME_CHANNEL_THRESHOLD;

    if (isCrossChannelSpam || isSameChannelSpam) {
        const spamTypeStr = isCrossChannelSpam 
            ? `phát tán chéo ${uniqueChannels.size} kênh` 
            : `spam liên tục ${identicalSpams.length} lần vào cùng một kênh`;

        console.log(`[DEBUG] 🚨 VƯỢT MỨC CHO PHÉP! Bắt đầu tiến hành xử phạt...`);

        const memberToBan = message.member || await message.guild.members.fetch(userId).catch(() => null);
        
        // KIỂM TRA QUYỀN HẠN CỦA BOT
        console.log(`[DEBUG] 4. Quyền của Bot: Bot có thể Ban nick này không? -> ${memberToBan ? memberToBan.bannable : "LỖI TÌM USER"}`);

        if (memberToBan && memberToBan.bannable) {
            for (const rec of identicalSpams) {
                const targetChan = await message.guild.channels.fetch(rec.channelId).catch(() => null);
                if (targetChan && targetChan.isTextBased()) {
                    const targetMsg = await targetChan.messages.fetch(rec.messageId).catch(() => null);
                    if (targetMsg) await targetMsg.delete().catch(() => null);
                }
            }

            await memberToBan.ban({
                deleteMessageSeconds: 7 * 24 * 60 * 60,
                reason: `🚨 Chặn đứng hành động Spam Bot/Raid (${spamTypeStr}).`
            }).catch(err => console.error("[DEBUG] Lỗi lệnh Ban:", err));

            console.log(`[DEBUG] ✅ THÀNH CÔNG: Đã Ban tài khoản!`);

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
            console.log(`[DEBUG] ❌ BẤT LỰC: Bot ĐÃ BẮT ĐƯỢC QUẢ TANG SPAM, nhưng bị Discord cấm không cho Ban!`);
            console.log(`[DEBUG] 👉 HÃY KIỂM TRA LẠI: Bạn có chắc Role của con Bot đã được tích chọn "Cấm thành viên" (Ban Members) trong Cài đặt máy chủ chưa?`);
        }
    }
    
    console.log(`[DEBUG ANTI-RAID] Hoàn tất vòng quét. -----------------\n`);
    return false;
}

module.exports = {
    handleAntiRaid
};