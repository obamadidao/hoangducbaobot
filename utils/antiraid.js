const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");

// CẤU HÌNH THEO DÕI AN NINH SPAM CHÉO KÊNH VÀ CÙNG KÊNH
const crossChannelSpamTracker = new Map();
const SPAM_WINDOW_MS = 10000;           // Khung thời gian rà soát trong 10 giây (dễ thao tác thủ công khi test)
const SPAM_CROSS_CHANNEL_THRESHOLD = 3; // Điều kiện 1: Spam chéo qua 3 kênh khác nhau
const SPAM_SAME_CHANNEL_THRESHOLD = 5;  // Điều kiện 2: Spam liên tục 5 lần tại cùng một kênh

/**
 * Hàm phân tích và chặn đứng hành vi Spam/Raid phá hoại chéo kênh và cùng kênh
 * @param {import("discord.js").Message} message Đối tượng tin nhắn nhận được
 * @param {import("discord.js").Client} client Đối tượng Bot Client
 * @param {string} HOANG_DE_ROLE_ID ID vai trò Hoàng Đế để bỏ qua kiểm tra an ninh
 * @returns {Promise<boolean>} Trả về true nếu phát hiện spam bot và đã xử lý ban thành công
 */
async function handleAntiRaid(message, client, HOANG_DE_ROLE_ID) {
    const userId = message.author.id;
    const guild = message.guild;

    // 1. Kiểm tra lỗi thiếu Intent (Nếu nội dung tin nhắn trống hoàn toàn)
    if (!message.content && message.attachments.size === 0) {
        return false;
    }

    const isWhitelisted = message.member && (
        message.member.permissions.has(PermissionFlagsBits.Administrator) || 
        message.member.roles.cache.has(HOANG_DE_ROLE_ID)
    );

    // 2. Bỏ qua các tài khoản nằm trong danh sách trắng (Admin, Hoàng Đế)
    if (isWhitelisted) {
        return false;
    }

    const now = Date.now();
    const textSig = message.content ? message.content.trim().toLowerCase() : "";
    const attachSig = message.attachments.map(a => a.name + "_" + a.size).join(",");
    const messageSignature = `${textSig}||${attachSig}`;

    // 3. Bỏ qua tin nhắn quá ngắn (Dưới 5 ký tự) để tránh nhận diện nhầm khi chat thông thường
    if (messageSignature.length <= 5) {
        return false;
    }

    if (!crossChannelSpamTracker.has(userId)) {
        crossChannelSpamTracker.set(userId, []);
    }

    let userRecords = crossChannelSpamTracker.get(userId);
    // Quét dọn các bản ghi cũ vượt quá khung thời gian rà soát
    userRecords = userRecords.filter(rec => now - rec.timestamp < SPAM_WINDOW_MS);

    // Lưu trữ thông tin tin nhắn hiện tại
    userRecords.push({
        messageId: message.id,
        channelId: message.channel.id,
        signature: messageSignature,
        timestamp: now
    });
    crossChannelSpamTracker.set(userId, userRecords);

    // Lọc ra các tin nhắn giống hệt nhau về nội dung/ảnh gửi đi trong 10 giây qua
    const identicalSpams = userRecords.filter(rec => rec.signature === messageSignature);
    const uniqueChannels = new Set(identicalSpams.map(rec => rec.channelId));

    // Đánh giá hành vi vi phạm dựa trên cấu hình ngưỡng
    const isCrossChannelSpam = uniqueChannels.size >= SPAM_CROSS_CHANNEL_THRESHOLD;
    const isSameChannelSpam = identicalSpams.length >= SPAM_SAME_CHANNEL_THRESHOLD;

    if (isCrossChannelSpam || isSameChannelSpam) {
        const spamTypeStr = isCrossChannelSpam 
            ? `phát tán chéo ${uniqueChannels.size} kênh` 
            : `spam liên tục ${identicalSpams.length} lần vào cùng một kênh`;

        console.log(`🚨 [HỆ THỐNG AN NINH] Phát hiện tài khoản ${message.author.tag} (${userId}) có hành vi: ${spamTypeStr}.`);

        const memberToBan = message.member || await guild.members.fetch(userId).catch(() => null);
        const botMember = guild.members.me;

        if (memberToBan && botMember) {
            // Kiểm tra phân cấp quyền và vai trò của Discord (Role Hierarchy) trước khi ban
            const isOwner = memberToBan.id === guild.ownerId;
            const botHasBanPerm = botMember.permissions.has(PermissionFlagsBits.BanMembers);
            const isBotRoleHigher = botMember.roles.highest.position > memberToBan.roles.highest.position;

            if (memberToBan.bannable) {
                // Bước 1: Tiến hành xóa toàn bộ tin nhắn spam vừa phát hiện
                for (const rec of identicalSpams) {
                    const targetChan = await guild.channels.fetch(rec.channelId).catch(() => null);
                    if (targetChan && targetChan.isTextBased()) {
                        const targetMsg = await targetChan.messages.fetch(rec.messageId).catch(() => null);
                        if (targetMsg) await targetMsg.delete().catch(() => null);
                    }
                }

                // Bước 2: Thực hiện BAN vĩnh viễn và quét sạch lịch sử tin nhắn trong 7 ngày qua
                await memberToBan.ban({
                    deleteMessageSeconds: 7 * 24 * 60 * 60, // 7 ngày (mức tối đa của Discord để dọn sạch rác)
                    reason: `🚨 Tự động chặn đứng hành vi Spam Bot/Raid (${spamTypeStr}).`
                }).catch(err => console.error("❌ Lỗi khi thực thi lệnh ban:", err));

                console.log(`✅ [HỆ THỐNG AN NINH] Đã ban thành công tài khoản phá hoại: ${message.author.tag}`);

                // Bước 3: Gửi báo cáo khẩn cấp về kênh chat chung (ID: 1206335749864296560)
                const logChannel = await guild.channels.fetch("1206335749864296560").catch(() => null);
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
                // In ra nhật ký lỗi phân cấp quyền chi tiết để quản trị viên dễ dàng rà soát cấu hình Discord
                console.log(`⚠️ [HỆ THỐNG AN NINH] BẤT LỰC: Phát hiện ${message.author.tag} spam nhưng Bot KHÔNG THỂ BAN.`);
                console.log(`[CHẨN ĐOÁN]:`);
                console.log(` - Tài khoản test có phải CHỦ SERVER (Owner) không? -> ${isOwner ? "CÓ (Chủ server không thể bị ban bởi bất kỳ bot nào)" : "KHÔNG"}`);
                console.log(` - Bot thực tế có quyền "Ban Members" trong vai trò chưa? -> ${botHasBanPerm ? "CÓ" : "KHÔNG (Hãy bật quyền ban cho Bot)"}`);
                console.log(` - Role của Bot có xếp cao hơn Role của tài khoản test không? -> ${isBotRoleHigher ? "CÓ" : "KHÔNG (Hãy kéo vị trí Role của Bot lên cao hơn)"}`);
            }
        }
    }
    return false;
}

module.exports = {
    handleAntiRaid
};