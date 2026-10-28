const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const path = require("path");

const crossChannelSpamTracker = new Map();
const currentlyBanning = new Set();
const SPAM_WINDOW_MS = 10000;           // Khung thời gian 10 giây
const SPAM_CROSS_CHANNEL_THRESHOLD = 3; // Spam 3 kênh khác nhau
const SPAM_SAME_CHANNEL_THRESHOLD = 5;  // Spam 5 lần cùng 1 kênh

// Tự động chuyển ID thô thành Tên hiển thị rõ ràng
async function cleanMentionText(guild, text) {
    if (!text) return "[Chỉ gửi tệp đính kèm / hình ảnh]";
    let cleaned = text;

    const userMatches = text.match(/<@!?(\d+)>/g);
    if (userMatches) {
        for (const match of userMatches) {
            const id = match.replace(/[<@!>]/g, "");
            const user = guild.client.users.cache.get(id) || await guild.client.users.fetch(id).catch(() => null);
            cleaned = cleaned.replace(new RegExp(match, 'g'), user ? `@${user.username}` : `@User_${id}`);
        }
    }

    const roleMatches = text.match(/<@&(\d+)>/g);
    if (roleMatches) {
        for (const match of roleMatches) {
            const id = match.replace(/[<@&>]/g, "");
            const role = guild.roles.cache.get(id) || await guild.roles.fetch(id).catch(() => null);
            cleaned = cleaned.replace(new RegExp(match, 'g'), role ? `@${role.name}` : `@Role_${id}`);
        }
    }

    const channelMatches = text.match(/<#(\d+)>/g);
    if (channelMatches) {
        for (const match of channelMatches) {
            const id = match.replace(/[<#>]/g, "");
            const channel = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
            cleaned = cleaned.replace(new RegExp(match, 'g'), channel ? `#${channel.name}` : `#Channel_${id}`);
        }
    }

    return cleaned;
}

async function handleAntiRaid(message, client, HOANG_DE_ROLE_ID) {
    if (!message.guild || message.author.bot) return false;

    const userId = message.author.id;
    const guild = message.guild;

    if (!message.content && message.attachments.size === 0) return false;

    // Bỏ qua Admin & Hoàng Đế
    const isWhitelisted = message.member && (
        message.member.permissions.has(PermissionFlagsBits.Administrator) || 
        message.member.roles.cache.has(HOANG_DE_ROLE_ID)
    );
    if (isWhitelisted) return false;

    const now = Date.now();
    const textSig = message.content ? message.content.trim().toLowerCase() : "";
    const attachSig = message.attachments.map(a => a.name + "_" + a.size).join(",");
    const messageSignature = `${textSig}||${attachSig}`;

    const containsDiscordInvite = /(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i.test(textSig);
    const isMassMention = message.mentions.everyone || (message.mentions.users.size + message.mentions.roles.size) >= 5;

    if (messageSignature.length <= 5 && !containsDiscordInvite && !isMassMention) return false;

    if (!crossChannelSpamTracker.has(userId)) crossChannelSpamTracker.set(userId, []);

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

    const isCrossChannelSpam = uniqueChannels.size >= SPAM_CROSS_CHANNEL_THRESHOLD;
    const isSameChannelSpam = identicalSpams.length >= SPAM_SAME_CHANNEL_THRESHOLD;
    const isIllegalInvite = containsDiscordInvite && userRecords.length >= 2;

    if (isCrossChannelSpam || isSameChannelSpam || isIllegalInvite || isMassMention) {
        if (currentlyBanning.has(userId)) return true;
        currentlyBanning.add(userId);

        let spamReason = "Spam tin nhắn";
        if (isCrossChannelSpam) spamReason = `Spam chéo ${uniqueChannels.size} kênh`;
        else if (isSameChannelSpam) spamReason = `Spam ${identicalSpams.length} lần liên tục`;
        else if (isIllegalInvite) spamReason = `Quảng cáo Link Server khác`;
        else if (isMassMention) spamReason = `Spam Tag đại trà (@everyone/roles)`;

        const memberToBan = message.member || await guild.members.fetch(userId).catch(() => null);

        if (memberToBan && memberToBan.bannable) {
            try {
                // Xóa tin nhắn vi phạm
                for (const rec of identicalSpams) {
                    const targetChan = await guild.channels.fetch(rec.channelId).catch(() => null);
                    if (targetChan && targetChan.isTextBased()) {
                        const targetMsg = await targetChan.messages.fetch(rec.messageId).catch(() => null);
                        if (targetMsg) await targetMsg.delete().catch(() => null);
                    }
                }

                // Ban vĩnh viễn và dọn sạch 7 ngày
                await memberToBan.ban({
                    deleteMessageSeconds: 7 * 24 * 60 * 60,
                    reason: `🛡️ AntiRaid: ${spamReason}`
                });

                const cleanedContent = await cleanMentionText(guild, message.content);
                const spamImage = message.attachments.first()?.url || null;

                // 1. Log Admin (1206506495076732929)
                const logChannel = await guild.channels.fetch("1206506495076732929").catch(() => null);
                if (logChannel) {
                    const alertEmbed = new EmbedBuilder()
                        .setColor("#ED4245")
                        .setTitle("🛡️ AN NINH: ĐÃ BAN TÀI KHOẢN PHÁ HOẠI")
                        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                        .addFields(
                            { name: "👤 Đối tượng:", value: `**${message.author.tag}** (<@${userId}>)\nID: \`${userId}\``, inline: true },
                            { name: "🚨 Lý do xử lý:", value: `\`${spamReason}\``, inline: true },
                            { name: "📝 Nội dung bị chặn:", value: `\`\`\`${cleanedContent.slice(0, 500)}\`\`\``, inline: false }
                        )
                        .setFooter({ text: "Tự động xóa 100% tin nhắn trong 7 ngày qua" })
                        .setTimestamp();

                    if (spamImage) alertEmbed.setImage(spamImage);

                    await logChannel.send({ embeds: [alertEmbed] }).catch(() => null);
                }

                // 2. Chat Chung (1206335749864296560) - Đọc từ thư mục assets/images/
                const generalChatChannel = await guild.channels.fetch("1206335749864296560").catch(() => null);
                if (generalChatChannel) {
                    const bonkImagePath = path.join(__dirname, "..", "assets", "images", "bonk.png");

                    const bonkEmbed = new EmbedBuilder()
                        .setColor("#ED4245")
                        .setTitle("NGÔNG CUỒNG?")
                        .setDescription(`Quá bướng!! Thầy ở đây mà dám làm loạn à **<@${interaction.user.id}>** (${interaction.user.tag}).\nPhệt ngay 1 chày vào mặt! 💥\n\n📌 **Cái tội** *Spam*`)
                        .setImage("attachment://bonk.png")
                        .setTimestamp();

                    await generalChatChannel.send({
                        embeds: [bonkEmbed],
                        files: [{ attachment: bonkImagePath, name: "bonk.png" }]
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
    }
    return false;
}

module.exports = { handleAntiRaid };