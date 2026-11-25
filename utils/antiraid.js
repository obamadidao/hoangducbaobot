const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const path = require("path");
const fs = require("fs");

// ==========================================
// CẤU HÌNH KÊNH & THÔNG SỐ BẢO MẬT
// ==========================================
const TRAP_CHANNEL_ID = "1572544015713177731";         // Kênh bẫy anti-raid (không xóa tin nhắn tại đây)
const HALL_OF_SHAME_CHANNEL_ID = "1572544068804812931"; // Kênh bảng-fong-thần
const ADMIN_LOG_CHANNEL_ID = "1206506495076732929";     // Kênh log chi tiết cho Admin
const GENERAL_CHAT_CHANNEL_ID = "1206335749864296560";  // Kênh chat chung

const crossChannelSpamTracker = new Map();
const currentlyBanning = new Set();

const SPAM_WINDOW_MS = 10000;              // Khung thời gian theo dõi 10 giây
const SPAM_CROSS_CHANNEL_THRESHOLD = 3;    // Spam nội dung giống nhau ở 3 kênh khác nhau
const SPAM_SAME_CHANNEL_THRESHOLD = 5;     // Spam nội dung giống nhau 5 lần cùng 1 kênh
const SINGLE_MSG_MENTION_THRESHOLD = 12;   // Tối đa 12 tag trong 1 tin nhắn (cho phép tag 5-10 bạn rủ chơi game)
const WINDOW_MENTION_THRESHOLD = 15;       // Tối đa 15 lượt tag cộng dồn trong 10 giây
const CLEANUP_WINDOW_MS = 10 * 60 * 1000;  // Quét xóa tin nhắn 10 phút gần nhất

const STATS_FILE_PATH = path.join(__dirname, "..", "antiraid.json");

// Đọc và tăng bộ đếm tổng số người bị ban (lưu vĩnh viễn ra file JSON)
function getAndIncrementBanCount() {
    let stats = { totalBanned: 0 };
    try {
        if (fs.existsSync(STATS_FILE_PATH)) {
            const raw = fs.readFileSync(STATS_FILE_PATH, "utf8");
            stats = JSON.parse(raw);
        }
    } catch (err) {
        console.error("⚠️ Không thể đọc antiraid.json, khởi tạo lại bộ đếm:", err);
    }

    stats.totalBanned = (Number(stats.totalBanned) || 0) + 1;

    try {
        fs.writeFileSync(STATS_FILE_PATH, JSON.stringify(stats, null, 2), "utf8");
    } catch (err) {
        console.error("❌ Lỗi khi lưu antiraid.json:", err);
    }

    return stats.totalBanned;
}

// Tự động chuyển ID thô thành Tên hiển thị rõ ràng cho Admin Log
async function cleanMentionText(guild, text) {
    if (!text) return "[Chỉ gửi tệp đính kèm / sticker / hình ảnh]";
    let cleaned = text;

    const userMatches = text.match(/<@!?(\d+)>/g);
    if (userMatches) {
        for (const match of userMatches) {
            const id = match.replace(/[<@!>]/g, "");
            const user = guild.client.users.cache.get(id) || await guild.client.users.fetch(id).catch(() => null);
            cleaned = cleaned.split(match).join(user ? `@${user.username}` : `@User_${id}`);
        }
    }

    const roleMatches = text.match(/<@&(\d+)>/g);
    if (roleMatches) {
        for (const match of roleMatches) {
            const id = match.replace(/[<@&>]/g, "");
            const role = guild.roles.cache.get(id) || await guild.roles.fetch(id).catch(() => null);
            cleaned = cleaned.split(match).join(role ? `@${role.name}` : `@Role_${id}`);
        }
    }

    const channelMatches = text.match(/<#(\d+)>/g);
    if (channelMatches) {
        for (const match of channelMatches) {
            const id = match.replace(/[<#>]/g, "");
            const channel = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
            cleaned = cleaned.split(match).join(channel ? `#${channel.name}` : `#Channel_${id}`);
        }
    }

    return cleaned;
}

// Quét xóa tin nhắn trong 10 phút qua ở TẤT CẢ các kênh khác (trừ kênh bẫy anti-raid)
async function deleteUserMessagesInOtherChannels(guild, userId, excludedChannelId) {
    const cutoffTime = Date.now() - CLEANUP_WINDOW_MS;
    const textChannels = guild.channels.cache.filter(
        ch => ch.isTextBased() && ch.id !== excludedChannelId && ch.viewable
    );

    const tasks = textChannels.map(async (channel) => {
        try {
            const recentMessages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
            if (!recentMessages) return;

            const userMessages = recentMessages.filter(
                m => m.author.id === userId && m.createdTimestamp >= cutoffTime
            );
            if (userMessages.size === 0) return;

            if (userMessages.size > 1) {
                await channel.bulkDelete(userMessages, true).catch(() => null);
            } else {
                await userMessages.first().delete().catch(() => null);
            }
        } catch (_) {
            // Bỏ qua nếu kênh không có quyền xóa
        }
    });

    await Promise.allSettled(tasks);
}

async function handleAntiRaid(message, client, HOANG_DE_ROLE_ID) {
    if (!message.guild || message.author.bot) return false;

    const userId = message.author.id;
    const guild = message.guild;

    // Bỏ qua Admin & Hoàng Đế
    const isWhitelisted = message.member && (
        message.member.permissions.has(PermissionFlagsBits.Administrator) ||
        message.member.roles.cache.has(HOANG_DE_ROLE_ID)
    );
    if (isWhitelisted) return false;

    const isTrapChannel = message.channel.id === TRAP_CHANNEL_ID;
    const now = Date.now();
    const textSig = message.content ? message.content.trim().toLowerCase() : "";
    const attachSig = message.attachments.map(a => a.name + "_" + a.size).join(",");
    const messageSignature = `${textSig}||${attachSig}`;

    let shouldTriggerBan = false;
    let adminReason = "";
    let publicReason = "";
    let identicalSpams = [];

    if (isTrapChannel) {
        // Bất kỳ tin nhắn nào trong kênh bẫy đều kích hoạt ban ngay lập tức
        shouldTriggerBan = true;
        adminReason = `Nhắn tin vào kênh bẫy (<#${TRAP_CHANNEL_ID}>)`;
        publicReason = "Xâm nhập khu vực cấm (Kênh bẫy an ninh)";
    } else {
        if (!message.content && message.attachments.size === 0) return false;

        const containsDiscordInvite = /(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i.test(textSig);
        const mentionCount = message.mentions.users.size + message.mentions.roles.size;
        const canMentionEveryone = message.member?.permissions.has(PermissionFlagsBits.MentionEveryone) ?? false;
        const hasEveryoneMention = message.mentions.everyone && !canMentionEveryone;

        if (messageSignature.length <= 5 && !containsDiscordInvite && mentionCount === 0 && !hasEveryoneMention) {
            return false;
        }

        if (!crossChannelSpamTracker.has(userId)) crossChannelSpamTracker.set(userId, []);

        let userRecords = crossChannelSpamTracker.get(userId);
        userRecords = userRecords.filter(rec => now - rec.timestamp < SPAM_WINDOW_MS);

        userRecords.push({
            messageId: message.id,
            channelId: message.channel.id,
            signature: messageSignature,
            mentionCount,
            hasEveryoneMention,
            timestamp: now
        });
        crossChannelSpamTracker.set(userId, userRecords);

        identicalSpams = userRecords.filter(rec => rec.signature === messageSignature);
        const uniqueChannels = new Set(identicalSpams.map(rec => rec.channelId));
        const totalMentionsInWindow = userRecords.reduce((sum, rec) => sum + rec.mentionCount, 0);
        const everyoneSpamCount = userRecords.filter(rec => rec.hasEveryoneMention).length;

        const isCrossChannelSpam = uniqueChannels.size >= SPAM_CROSS_CHANNEL_THRESHOLD;
        const isSameChannelSpam = identicalSpams.length >= SPAM_SAME_CHANNEL_THRESHOLD;
        const isIllegalInvite = containsDiscordInvite && userRecords.length >= 2;
        const isMassMention =
            mentionCount >= SINGLE_MSG_MENTION_THRESHOLD ||
            totalMentionsInWindow >= WINDOW_MENTION_THRESHOLD ||
            everyoneSpamCount >= 2 ||
            (hasEveryoneMention && containsDiscordInvite);

        if (isCrossChannelSpam || isSameChannelSpam || isIllegalInvite || isMassMention) {
            shouldTriggerBan = true;
            publicReason = "Phát tán tin nhắn rác / Vi phạm quy tắc an ninh";

            if (isCrossChannelSpam) adminReason = `Spam nhiều ${uniqueChannels.size} kênh`;
            else if (isSameChannelSpam) adminReason = `Spam ${identicalSpams.length} lần liên tục`;
            else if (isIllegalInvite) adminReason = "Gửi Link Server khác";
            else if (isMassMention) adminReason = `Spam Tag hàng loạt (${mentionCount} tag/tin, ${totalMentionsInWindow} tag/10s)`;
        }
    }

    if (!shouldTriggerBan) return false;

    if (currentlyBanning.has(userId)) return true;
    currentlyBanning.add(userId);

    const memberToBan = message.member || await guild.members.fetch(userId).catch(() => null);

    if (memberToBan && memberToBan.bannable) {
        try {
            if (isTrapChannel) {
                // 1. Ban với deleteMessageSeconds = 0 để GIỮ LẠI tin nhắn ở kênh bẫy anti-raid
                await memberToBan.ban({
                    deleteMessageSeconds: 0,
                    reason: `🛡️ AntiRaid Trap: ${adminReason}`
                });

                // 2. Xóa tin nhắn trong 10 phút gần nhất ở tất cả các kênh KHÁC
                await deleteUserMessagesInOtherChannels(guild, userId, TRAP_CHANNEL_ID);
            } else {
                // Xóa trực tiếp các tin nhắn spam đã ghi nhận
                for (const rec of identicalSpams) {
                    if (rec.channelId === TRAP_CHANNEL_ID) continue;
                    const targetChan = await guild.channels.fetch(rec.channelId).catch(() => null);
                    if (targetChan && targetChan.isTextBased()) {
                        const targetMsg = await targetChan.messages.fetch(rec.messageId).catch(() => null);
                        if (targetMsg) await targetMsg.delete().catch(() => null);
                    }
                }

                // Ban và tự động dọn sạch 10 phút tin nhắn
                await memberToBan.ban({
                    deleteMessageSeconds: 10 * 60,
                    reason: `🛡️ AntiRaid: ${adminReason}`
                });
            }

            // Tăng số thứ tự người bị ban
            const banNumber = getAndIncrementBanCount();
            const cleanedContent = await cleanMentionText(guild, message.content);
            const spamImage = message.attachments.first()?.url || null;
            const largeAvatarUrl = message.author.displayAvatarURL({ extension: "png", size: 1024 });

            // ==========================================
            // 1. KÊNH BẢNG-FONG-THẦN (1572544068804812931)
            // ==========================================
            const hallOfShameChannel = await guild.channels.fetch(HALL_OF_SHAME_CHANNEL_ID).catch(() => null);
            if (hallOfShameChannel) {
                const displayName = message.author.globalName || message.author.username;
                const shameEmbed = new EmbedBuilder()
                    .setColor("#ED4245")
                    .setTitle(`📜 BẢNG PHONG THẦN — ĐỐI TƯỢNG THỨ #${banNumber}`)
                    .setDescription(
                        `# **${displayName}**\n` +
                        `👤 **Tài khoản:** \`${message.author.tag}\` (<@${userId}>)\n` +
                        `🆔 **ID:** \`${userId}\`\n` +
                        `🚨 **Lý do xử lý:** ${publicReason}\n` +
                        `⚖️ **Trạng thái:** Đã trục xuất vĩnh viễn khỏi máy chủ`
                    )
                    .setImage(largeAvatarUrl)
                    .setFooter({ text: `Hệ thống An ninh Tự động • Tổng số đã xử lý: #${banNumber}` })
                    .setTimestamp();

                await hallOfShameChannel.send({ embeds: [shameEmbed] }).catch(() => null);
            }

            // ==========================================
            // 2. KÊNH LOG ADMIN CHI TIẾT (1206506495076732929)
            // ==========================================
            const logChannel = await guild.channels.fetch(ADMIN_LOG_CHANNEL_ID).catch(() => null);
            if (logChannel) {
                const alertEmbed = new EmbedBuilder()
                    .setColor("#ED4245")
                    .setTitle(`🛡️ AN NINH: ĐÃ BAN TÀI KHOẢN PHÁ HOẠI (#${banNumber})`)
                    .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: "👤 Đối tượng:", value: `**${message.author.tag}** (<@${userId}>)\nID: \`${userId}\``, inline: true },
                        { name: "🚨 Lý do kỹ thuật:", value: `\`${adminReason}\``, inline: true },
                        { name: "📍 Kênh kích hoạt:", value: `<#${message.channel.id}>`, inline: true },
                        { name: "📝 Nội dung bị chặn:", value: `\`\`\`${cleanedContent.slice(0, 500)}\`\`\``, inline: false }
                    )
                    .setFooter({
                        text: isTrapChannel
                            ? "Giữ nguyên tin nhắn tại kênh bẫy • Đã xóa tin nhắn 10 phút qua ở các kênh khác"
                            : "Tự động xóa 100% tin nhắn trong 10 phút qua"
                    })
                    .setTimestamp();

                if (spamImage) alertEmbed.setImage(spamImage);

                await logChannel.send({ embeds: [alertEmbed] }).catch(() => null);
            }

            // ==========================================
            // 3. KÊNH CHAT CHUNG (1206335749864296560)
            // ==========================================
            const generalChatChannel = await guild.channels.fetch(GENERAL_CHAT_CHANNEL_ID).catch(() => null);
            if (generalChatChannel) {
                const bonkGifPath = path.join(__dirname, "..", "assets", "images", "bonk.gif");

                const bonkEmbed = new EmbedBuilder()
                    .setColor("#ED4245")
                    .setTitle("NGÔNG CUỒNG?")
                    .setDescription(`Quá bướng!! Thầy ở đây mà dám làm loạn à **<@${userId}>** (${message.author.tag}).\nPhệt ngay 1 chày vào mặt! 💥\n\n🫵 **Cái tội:** *${publicReason}*`)
                    .setImage("attachment://bonk.gif")
                    .setTimestamp();

                await generalChatChannel.send({
                    embeds: [bonkEmbed],
                    files: [{ attachment: bonkGifPath, name: "bonk.gif" }]
                }).catch(() => null);
            }
        } catch (err) {
            console.error("❌ Lỗi AntiRaid Ban:", err);
        } finally {
            currentlyBanning.delete(userId);
            crossChannelSpamTracker.delete(userId);
        }
        return true;
    } else {
        currentlyBanning.delete(userId);
    }

    return false;
}

module.exports = { handleAntiRaid };