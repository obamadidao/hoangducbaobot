require("dotenv").config();
const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
    REST, Routes, SlashCommandBuilder, PermissionFlagsBits,
    StringSelectMenuBuilder, ChannelType
} = require("discord.js");
const cron = require("node-cron");
const fs = require("fs");

// Import lệnh ẩn danh độc lập
const andanhCommand = require("./andanh.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent 
    ]
});

// ID các vai trò đặc biệt trong Server
const REGULAR_MEMBER_ROLE = "1207064301957947443";
const INVESTOR_ROLE = "1258567277695995904";
const HOANG_DE_ROLE = "1206317832674086944";

// TỰ ĐỘNG PHÁT HIỆN RAILWAY VOLUME KHÔNG LO MẤT DATA KHI DEPLOY
const FILE = fs.existsSync("/data") ? "/data/birthdays.json" : "./birthdays.json";
const STICKY_FILE = fs.existsSync("/data") ? "/data/sticky.json" : "./sticky.json";
const EVENTS_FILE = fs.existsSync("/data") ? "/data/events.json" : "./events.json";

const tempImages = new Map();
const tempEventRoles = new Map();
const processingChannels = new Set();

function readJson(path) {
    if (!fs.existsSync(path)) return {};
    try {
        const content = fs.readFileSync(path, "utf-8").trim();
        return content ? JSON.parse(content) : {};
    } catch (err) {
        console.error(`⚠️ Lỗi định dạng file ${path}, tự động reset.`);
        return {};
    }
}

function writeJson(path, data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 4));
}

const loadData = () => readJson(FILE);
const saveData = (data) => writeJson(FILE, data);
const loadStickyData = () => readJson(STICKY_FILE);
const saveStickyData = (data) => writeJson(STICKY_FILE, data);
const loadEventsData = () => readJson(EVENTS_FILE);
const saveEventsData = (data) => writeJson(EVENTS_FILE, data);

// Kiểm tra quyền tự thao tác cấu hình cá nhân
function isSelfAllowed(member) {
    if (member.roles.cache.has(HOANG_DE_ROLE)) return true;
    const roleEnv = process.env.ROLE_IDS || "";
    const allowedRoles = roleEnv.split(',').map(r => r.trim()).filter(r => r !== "");
    if (allowedRoles.length === 0) return true;
    return allowedRoles.some(roleId => member.roles.cache.has(roleId));
}

function getDaysUntilBirthday(day, month) {
    const now = new Date();
    const currentYear = now.getFullYear();
    let bdayTest = new Date(currentYear, month - 1, day);
    if (bdayTest < now && bdayTest.toDateString() !== now.toDateString()) {
        bdayTest.setFullYear(currentYear + 1);
    }
    return Math.ceil((bdayTest - now) / (1000 * 60 * 60 * 24));
}

function formatBirthday(day, month, year) {
    if (!day || !month) return "";
    const d = String(day).padStart(2, '0');
    const m = String(month).padStart(2, '0');
    return `${d}/${m}${year ? `/${year}` : ""}`;
}

async function saveImagesPermanently(guild, targetId, urls) {
    if (!urls || urls.length === 0) return [];
    
    try {
        // Tìm hoặc tự tạo kênh lưu trữ ẩn không gây phiền hà cho Server
        let storageChannel = guild.channels.cache.find(c => c.name === "profile-images-storage");
        if (!storageChannel) {
            storageChannel = await guild.channels.create({
                name: "profile-images-storage",
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel],
                    },
                    {
                        id: client.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
                    }
                ]
            }).catch(() => null);
        }

        if (!storageChannel) {
            console.error("❌ Không thể khởi tạo kho lưu trữ ảnh bảo mật!");
            return urls; // Backup trả về URL gốc nếu gặp lỗi tạo kênh
        }

        // Đẩy toàn bộ tệp đính kèm tạm vào kênh ẩn để sao lưu vĩnh viễn
        const savedMessage = await storageChannel.send({
            content: `🖼️ Kho ảnh lưu trữ trọn đời của thành viên <@${targetId}> (ID: ${targetId})`,
            files: urls.map(url => ({ attachment: url }))
        });

        // Trích xuất các URL đính kèm đã được lưu cố định trên CDN của Discord
        return savedMessage.attachments.map(att => att.url);
    } catch (err) {
        console.error("❌ Lỗi khi tải và sao lưu ảnh vĩnh viễn:", err);
        return urls;
    }
}

async function refreshDiscordUrls(urls) {
    if (!urls || urls.length === 0) return {};
    
    const targetUrls = urls.filter(url => 
        url && (url.includes("cdn.discordapp.com/attachments/") || 
                url.includes("media.discordapp.net/attachments/"))
    ).map(url => url.replace("media.discordapp.net/attachments/", "cdn.discordapp.com/attachments/"));
    
    if (targetUrls.length === 0) return {};

    try {
        const response = await fetch("https://discord.com/api/v10/attachments/refresh-urls", {
            method: "POST",
            headers: {
                "Authorization": `Bot ${process.env.TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                attachment_urls: targetUrls
            })
        });

        if (!response.ok) {
            console.error(`⚠️ Lỗi yêu cầu refresh CDN từ Discord API: ${response.status} ${response.statusText}`);
            return {};
        }

        const json = await response.json();
        const mapping = {};
        if (json.refreshed_urls && Array.isArray(json.refreshed_urls)) {
            for (const item of json.refreshed_urls) {
                const originalCdn = item.original.replace("media.discordapp.net/attachments/", "cdn.discordapp.com/attachments/");
                mapping[originalCdn] = item.refreshed;
            }
        }
        return mapping;
    } catch (error) {
        console.error("❌ Gặp sự cố kết nối khi làm mới CDN ảnh Discord:", error);
        return {};
    }
}

client.once("ready", async () => {
    console.log(`✅ Bot online: ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('birthdays')
            .setDescription('Xem danh sách sinh nhật của tất cả thành viên (Chỉ dùng ở kênh Setup)'),
        new SlashCommandBuilder()
            .setName('birthday')
            .setDescription('Tra cứu sinh nhật của một thành viên bất kỳ (Sử dụng được ở mọi nơi)'),
        new SlashCommandBuilder()
            .setName('taoprofile')
            .setDescription('Tạo hồ sơ cá nhân và điền ngày sinh nhật')
            .addAttachmentOption(option => option.setName('anh1').setDescription('Ảnh profile 1').setRequired(true))
            .addAttachmentOption(option => option.setName('anh2').setDescription('Ảnh profile 2').setRequired(false))
            .addAttachmentOption(option => option.setName('anh3').setDescription('Ảnh profile 3').setRequired(false))
            .addAttachmentOption(option => option.setName('anh4').setDescription('Ảnh profile 4').setRequired(false))
            .addAttachmentOption(option => option.setName('anh5').setDescription('Ảnh profile 5').setRequired(false)),
        new SlashCommandBuilder()
            .setName('taohoprofile')
            .setDescription('Tạo hộ hồ sơ cá nhân cho thành viên khác (Chỉ dùng cho QTV)')
            .addUserOption(option => option.setName('user').setDescription('Thành viên muốn tạo hộ').setRequired(true))
            .addAttachmentOption(option => option.setName('anh1').setDescription('Ảnh profile 1').setRequired(true))
            .addAttachmentOption(option => option.setName('anh2').setDescription('Ảnh profile 2').setRequired(false))
            .addAttachmentOption(option => option.setName('anh3').setDescription('Ảnh profile 3').setRequired(false))
            .addAttachmentOption(option => option.setName('anh4').setDescription('Ảnh profile 4').setRequired(false))
            .addAttachmentOption(option => option.setName('anh5').setDescription('Ảnh profile 5').setRequired(false))
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
        new SlashCommandBuilder()
            .setName('suaprofile')
            .setDescription('Sửa hồ sơ cá nhân và ngày sinh dạng chữ (Siêu gọn gàng)'),
        new SlashCommandBuilder()
            .setName('suaanh')
            .setDescription('Thay thế hoặc thêm ảnh mới trực quan cho hồ sơ'),
        new SlashCommandBuilder()
            .setName('xoaprofile')
            .setDescription('Xóa hồ sơ cá nhân và ngày sinh khỏi danh sách'),
        new SlashCommandBuilder()
            .setName('taosukien')
            .setDescription('Tạo sự kiện nhắc nhở mới (Chỉ dùng ở kênh Setup)')
            .addRoleOption(option => option.setName('role1').setDescription('Vai trò nhận thông báo 1').setRequired(false))
            .addRoleOption(option => option.setName('role2').setDescription('Vai trò nhận thông báo 2').setRequired(false)),
        new SlashCommandBuilder()
            .setName('sukien')
            .setDescription('Tra cứu sự kiện trong server (Sử dụng được ở mọi nơi)'),
        new SlashCommandBuilder()
            .setName('danhsachsukien')
            .setDescription('Xem danh sách tất cả các sự kiện đã được lưu (Chỉ dùng ở kênh Setup)'),
        new SlashCommandBuilder()
            .setName('suasukien')
            .setDescription('Chỉnh sửa sự kiện đã tạo (Chỉ dùng ở kênh Setup)'),
        new SlashCommandBuilder()
            .setName('xoasukien')
            .setDescription('Xóa sự kiện đã tạo khỏi hệ thống (Chỉ dùng ở kênh Setup)'),
        new SlashCommandBuilder()
            .setName('sticky')
            .setDescription('Tạo cấu hình tin nhắn ghim dính ở cuối kênh chat thông qua bảng Modal')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages), 
        new SlashCommandBuilder()
            .setName('unsticky')
            .setDescription('Gỡ bỏ tin nhắn ghim dính tại kênh này')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
        
        andanhCommand.data.toJSON()
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        console.log('🔄 Đang đồng bộ hóa cấu hình lệnh toàn cầu (Global) duy nhất...');
        
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        const guilds = await client.guilds.fetch();
        for (const [guildId] of guilds) {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guildId),
                { body: [] }
            ).catch(() => null);
        }
        
        console.log('✅ Dọn sạch các lệnh trùng lặp cấp Guild và đồng bộ Global thành công!');
    } catch (error) {
        console.error('❌ Lỗi đăng ký lệnh:', error);
    }

    // KHỞI ĐỘNG ĐỒNG BỘ TRƠN TRU
    try {
        const guilds = await client.guilds.fetch();
        for (const [guildId] of guilds) {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (guild) {
                console.log("⏳ Bắt đầu làm mới và đồng bộ Sảnh Danh Vọng...");
                await syncAllProfiles(guild);
            }
        }
        console.log("✅ Hoàn tất quá trình đồng bộ ảnh khi khởi động!");
    } catch (startSyncErr) {
        console.error("❌ Lỗi đồng bộ ảnh lúc khởi động:", startSyncErr);
    }

    // Cron job đồng bộ lúc 1:00 AM UTC (Tức 8:00 AM giờ Việt Nam)
    cron.schedule("0 1 * * *", async () => {
        const guilds = await client.guilds.fetch();
        for (const [guildId] of guilds) {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (guild) await syncAllProfiles(guild);
        }
    });

    const loiChucMacDinh = [
        "Ôi dời ơi **{name}**! ăn cứt đi nhá :zzzzz_tom_blushh: hehe",
        "Tới công chuyện luôn :tom_creepylaugh: ! Sinh nhật của **{name}**. Liên hệ ngay cho anh zai @fowf.ongggg278 gửi qr để nhận ngay 2 lít trong sinh nhật của mình nhé",
        "Happy Birthday! Chúc **{name}** có một ngày sinh nhật thật ấm áp bên gia biệt, bạn bè và luôn giữ vững ngọn lửa đam mê với những sở thích của mình! 🩷✨",
        "**{name}** lắm tiền vậy sinh nhật không thấy bank mấy ae ít xèng nhể :CBuwu:. Thôi thì nửa bill bữa nướng Oishi cũng được",
        "Thế mà lại hay anh em ạ, vì **{name}** tuổi mới chắc chắn sẽ có người yêu mới :_emoji_: 🎉",
        "Chúc mừng sinh nhật **{name}**! Tuổi mới ăn khỏe, ngủ ngon, học tập và làm việc thật năng suất, sớm thành công rực rỡ nha bạn tôi! 🌟🍰",
        "Chúc mừng sinh nhật. Tuổi mới chúc **{name}** roll 5 tiền toàn 3 sao, bắn toàn vào đầu và mở thẻ toàn max nhé :raging_pepe:",
        "Đcm sướng nhá :tt_clapCat_OwO:, được cả Hoàng Đức B*o chúc sinh nhật **{name}**. Tuổi mới gắng để mà được như anh nhé",
        "Chào cậu bé sinh nhật, hôm nay bạn là vua đấy muốn gì cũng được, cho làm hoàng đế luôn **{name}**! 👑"
    ];

    const loiChucDocQuyenMyNu = [
        "**{name}** Mong là cuộc sống sẽ ngày càng dịu dàng và xinh đẹp hơn như chính cậu vậy đó :742539mymelodyemojidiscord: thứ này là dành cho cậu nè 🌹",
        "Happy Birthday :460860mymelodyemojidiscord: công chúa **{name}**! Chúc cậu tuổi mới luôn rạng rỡ, xinh đẹp và có nhiều người yêu nhá :784982mymelodyemojidiscord: 🎀",
        "Này cô bé **{name}** nhắn ngay cho anh @fowf.ongggg278 để nhận túi mù nhaaaaa. Yeeuuuuu <3 🩷🩷🩷"
    ];

    cron.schedule("0 0 * * *", async () => {
        const data = loadData();
        const eventsData = loadEventsData();
        const now = new Date();
        const day = now.getDate();
        const month = now.getMonth() + 1;

        const guilds = await client.guilds.fetch();
        for (const [guildId] of guilds) {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) continue;

            for (const userId in data) {
                const userData = data[userId];
                if (userData.day === day && userData.month === month && !userData.hidden) {
                    const tagContent = `Nay là sinh nhật của **${userData.name}** (<@${userId}>) đấy anh em ạ <@&1207064301957947443>, <@&1258567277695995904> ơi✨🎉`;
                    let danhSachQuay = [...loiChucMacDinh];
                    
                    const member = await guild.members.fetch(userId).catch(() => null);
                    if (member && member.roles.cache.has("1206357280937873489")) {
                        danhSachQuay = danhSachQuay.concat(loiChucDocQuyenMyNu);
                    }

                    const cauChucNgauNhien = danhSachQuay[Math.floor(Math.random() * danhSachQuay.length)];
                    const loiChucHoanChinh = cauChucNgauNhien.replace(/{name}/g, userData.name);

                    const birthdayChannel = await guild.channels.fetch(process.env.BIRTHDAY_CHANNEL_ID || "1313150267881033739").catch(() => null);
                    if (birthdayChannel) {
                        const displayImg = userData.images ? userData.images[0] : userData.image;
                        const bdayEmbed = new EmbedBuilder()
                            .setColor("#FFB6C1") 
                            .setTitle(`🎉 CHÚC MỪNG SINH NHẬT 🎉`)
                            .setDescription(loiChucHoanChinh)
                            .setImage(displayImg || null)
                            .setTimestamp();
                        await birthdayChannel.send({ content: tagContent, embeds: [bdayEmbed] });
                    }

                    const generalChatChannel = await guild.channels.fetch("1206335749864296560").catch(() => null);
                    if (generalChatChannel) {
                        await generalChatChannel.send({ content: `📢 Hôm nay là sinh nhật của <@${userId}> nè mọi người ơi! Ghé qua kênh <#1313150267881033739> để gửi những lời chúc tốt đẹp nhất nhé! :tom_jerry_2:` });
                    }
                }
            }

            for (const eventId in eventsData) {
                const event = eventsData[eventId];
                if (event.day === day && event.month === month) {
                    const rolesTagText = event.roles && event.roles.length > 0 ? event.roles.map(rId => `<@&${rId}>`).join(" ") : "";
                    const newsChannel = await guild.channels.fetch("1313150267881033739").catch(() => null);
                    if (newsChannel) {
                        const eventEmbed = new EmbedBuilder()
                            .setColor("#00F0FF")
                            .setTitle(`🔔 SỰ KIỆN: ${event.name} 🔔`)
                            .setDescription(event.message || "Hôm nay diễn ra sự kiện đặc biệt trong Server của chúng ta!")
                            .addFields(
                                { name: "📆 Ngày diễn ra:", value: `${event.day}/${event.month}`, inline: true },
                                { name: "✍️ Người tạo:", value: `<@${event.creatorId}>`, inline: true }
                            )
                            .setTimestamp();
                        
                        await newsChannel.send({ content: rolesTagText ? `📢 ${rolesTagText}` : null, embeds: [eventEmbed] });
                    }
                }
            }
        }
    });
});

client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const stickyData = loadStickyData();
    if (!stickyData[message.channel.id]) return;

    if (processingChannels.has(message.channel.id)) return;
    processingChannels.add(message.channel.id);

    const channelSticky = stickyData[message.channel.id];
    const stickyEmbed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setTitle("📌 Tin nhắn ghim:") 
        .setDescription(channelSticky.text)
        .setTimestamp();

    if (channelSticky.lastMessageId) {
        const oldMsg = await message.channel.messages.fetch(channelSticky.lastMessageId).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => null);
    }

    try {
        const newMsg = await message.channel.send({ embeds: [stickyEmbed] });
        stickyData[message.channel.id].lastMessageId = newMsg.id;
        saveStickyData(stickyData);
    } catch (err) {
        console.error("Lỗi gửi tin Sticky:", err);
    }

    processingChannels.delete(message.channel.id);
});

client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const oldRegular = oldMember.roles.cache.has(REGULAR_MEMBER_ROLE);
    const newRegular = newMember.roles.cache.has(REGULAR_MEMBER_ROLE);
    const oldInvestor = oldMember.roles.cache.has(INVESTOR_ROLE);
    const newInvestor = newMember.roles.cache.has(INVESTOR_ROLE);
    const oldHoangDe = oldMember.roles.cache.has(HOANG_DE_ROLE);
    const newHoangDe = newMember.roles.cache.has(HOANG_DE_ROLE);

    if (oldRegular !== newRegular || oldInvestor !== newInvestor || oldHoangDe !== newHoangDe) {
        const data = loadData();
        if (data[newMember.id]) {
            await sendProfileCardToHall(newMember.guild, newMember.id, data[newMember.id]);
        }
    }
});

async function syncAllProfiles(guild) {
    const data = loadData();
    for (const targetId in data) {
        console.log(`🔄 [Khởi chạy] Đang làm mới ảnh đại diện cho thành viên: ${data[targetId].name}`);
        await sendProfileCardToHall(guild, targetId, data[targetId]).catch(() => null);
    }
}

async function sendProfileCardToHall(guild, targetId, userData, footerText = "Sảnh danh vọng 🏆") {
    const userObj = await client.users.fetch(targetId).catch(() => null);
    if (!userObj) return false;

    let member = guild.members.cache.get(targetId) || await guild.members.fetch(targetId).catch(() => null);
    
    const isRegularMember = member ? member.roles.cache.has(REGULAR_MEMBER_ROLE) : false;
    const isInvestor = member ? member.roles.cache.has(INVESTOR_ROLE) : false;
    const isHoangDe = member ? member.roles.cache.has(HOANG_DE_ROLE) : false;

    const shouldHide = !isRegularMember && !isInvestor && !isHoangDe;
    const profileChannel = await guild.channels.fetch(process.env.PROFILE_CHANNEL_ID).catch(() => null);
    if (!profileChannel) return false;

    // Tải tệp dữ liệu tươi mới nhất từ đĩa cứng từ đầu hàm
    const data = loadData();
    const currentProfile = data[targetId] || userData;

    // --- CƠ CHẾ QUÉT EMBED TRÙNG LẶP SỬ DỤNG FOOTER-ID MATCHING ---
    const messages = await profileChannel.messages.fetch({ limit: 100 }).catch(() => null);
    let existingMsg = null;
    if (messages) {
        existingMsg = messages.find(m => 
            m.author.id === client.user.id && 
            m.embeds.length > 0 && 
            m.embeds[0].footer && 
            m.embeds[0].footer.text && 
            m.embeds[0].footer.text.includes(`ID: ${targetId}`)
        );
    }

    if (shouldHide) {
        if (existingMsg) {
            await existingMsg.delete().catch(() => null);
        } else if (currentProfile.messageId) {
            const oldMsg = await profileChannel.messages.fetch(currentProfile.messageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => null);
        }
        currentProfile.messageId = null;
        currentProfile.hidden = true;
        data[targetId] = currentProfile;
        saveData(data);
        return false;
    }

    // --- TỰ ĐỘNG CHUẨN HÓA VÀ LÀM MỚI CHỮ KÝ ẢNH DISCORD (CDN REFRESH) ---
    let imageUrls = currentProfile.images || (currentProfile.image ? [currentProfile.image] : []) || [];
    if (imageUrls.length > 0) {
        const refreshedMapping = await refreshDiscordUrls(imageUrls);
        let hasChanged = false;
        const finalUrls = imageUrls.map(url => {
            // Chuẩn hóa định dạng cdn để đối chiếu chuẩn xác với mapping kết quả
            const normalizedUrl = url.replace("media.discordapp.net/attachments/", "cdn.discordapp.com/attachments/");
            if (refreshedMapping[normalizedUrl]) {
                hasChanged = true;
                return refreshedMapping[normalizedUrl];
            }
            return url;
        });

        if (hasChanged) {
            imageUrls = finalUrls;
            currentProfile.images = finalUrls;
            currentProfile.image = finalUrls[0] || null;
        }
    }
    // -----------------------------------------------------------------------

    // Trích xuất và định dạng ngày gia nhập Server của thành viên
    let joinDateText = "Chưa rõ";
    if (member && member.joinedAt) {
        const jDate = member.joinedAt;
        const jd = String(jDate.getDate()).padStart(2, '0');
        const jm = String(jDate.getMonth() + 1).padStart(2, '0');
        const jy = jDate.getFullYear();
        joinDateText = `${jd}/${jm}/${jy}`;
    }

    let descriptionText = `> 💬 *"${currentProfile.slogan}"*\n\n📌 **Nơi ở:** ${currentProfile.location}\n🩷 **Sở thích:** ${currentProfile.hobbies}`;
    if (currentProfile.day && currentProfile.month) {
        descriptionText += `\n🎂 **Ngày sinh:** ${formatBirthday(currentProfile.day, currentProfile.month, currentProfile.year)}`;
    }

    const profileEmbed = new EmbedBuilder()
        .setColor("#2F3136")
        .setTitle(`☁️ ${currentProfile.name} ☁️`)
        .setAuthor({ name: userObj.tag, iconURL: userObj.displayAvatarURL() })
        .setDescription(descriptionText)
        .setImage(imageUrls[0] || null)
        .setThumbnail(userObj.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: `${footerText} | Gia nhập: ${joinDateText} | ID: ${targetId}` }) // Hiện ngày gia nhập & giữ ID ẩn ở cuối để đối chiếu
        .setTimestamp();

    const components = [];
    if (imageUrls.length > 1) {
        const total = imageUrls.length;
        components.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`slide_${targetId}_${total - 1}_prev`).setLabel('<<').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('dummy').setLabel(`1/${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId(`slide_${targetId}_1_next`).setLabel('>>').setStyle(ButtonStyle.Secondary)
            )
        );
    }

    let messageSent = null;
    if (existingMsg) {
        messageSent = await existingMsg.edit({ embeds: [profileEmbed], components }).catch(() => null);
    } else if (currentProfile.messageId) {
        const oldMsg = await profileChannel.messages.fetch(currentProfile.messageId).catch(() => null);
        if (oldMsg) {
            messageSent = await oldMsg.edit({ embeds: [profileEmbed], components }).catch(() => null);
        }
    }

    if (!messageSent) {
        messageSent = await profileChannel.send({ embeds: [profileEmbed], components }).catch(() => null);
    }

    if (messageSent) {
        currentProfile.messageId = messageSent.id;
        currentProfile.hidden = false;
        data[targetId] = currentProfile;
        
        saveData(data);
        return true;
    }
    return false;
}

async function deleteProfileCard(guild, targetId) {
    const data = loadData();
    const userData = data[targetId];
    
    const profileChannel = await guild.channels.fetch(process.env.PROFILE_CHANNEL_ID).catch(() => null);
    if (profileChannel) {
        const messages = await profileChannel.messages.fetch({ limit: 100 }).catch(() => null);
        if (messages) {
            const existingMsg = messages.find(m => 
                m.author.id === client.user.id && 
                m.embeds.length > 0 && 
                m.embeds[0].footer && 
                m.embeds[0].footer.text && 
                m.embeds[0].footer.text.includes(`ID: ${targetId}`)
            );
            if (existingMsg) {
                await existingMsg.delete().catch(() => null);
            }
        }
    }

    delete data[targetId];
    saveData(data);
}

async function openEditProfileModal(interaction, targetId) {
    const data = loadData();
    const existing = data[targetId];

    if (!existing) {
        return interaction.reply({ content: `❌ Thành viên <@${targetId}> chưa tạo hồ sơ cá nhân!`, flags: ['Ephemeral'] });
    }

    const modal = new ModalBuilder().setCustomId(`edit_profile_modal_${targetId}`).setTitle(`Sửa Hồ Sơ: ${existing.name || "Thành viên"}`);
    modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_ten").setLabel("Họ và tên").setStyle(TextInputStyle.Short).setValue(existing.name || "").setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_slogan").setLabel("Câu nói tâm đắc / Slogan").setStyle(TextInputStyle.Short).setValue(existing.slogan || "").setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_noio").setLabel("Nơi ở hiện tại").setStyle(TextInputStyle.Short).setValue(existing.location || "").setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_sothich").setLabel("Sở thích").setStyle(TextInputStyle.Paragraph).setValue(existing.hobbies || "").setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_ngaysinh").setLabel("Ngày sinh (Vd: 15/06)").setStyle(TextInputStyle.Short).setValue(existing.day && existing.month ? formatBirthday(existing.day, existing.month, existing.year) : "").setRequired(false))
    );
    await interaction.showModal(modal);
}

async function createRegisteredUsersSelectMenu(customId, placeholder) {
    const data = loadData();
    const userIds = Object.keys(data);
    if (userIds.length === 0) return null;

    const options = [];
    for (const id of userIds) {
        const userData = data[id];
        const userObj = client.users.cache.get(id) || await client.users.fetch(id).catch(() => null);
        options.push({
            label: `${userData.name}${userObj ? ` (@${userObj.username})` : ""}`.slice(0, 100),
            value: id,
            description: `Slogan: ${userData.slogan || "Chưa có"}`.slice(0, 100)
        });
    }

    return new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(placeholder).addOptions(options.slice(0, 25));
}

async function openPhotoEditorDashboard(interaction, targetId) {
    const data = loadData();
    const existing = data[targetId];

    if (!existing) {
        return interaction.reply({ content: `❌ Thành viên <@${targetId}> chưa tạo hồ sơ cá nhân!`, flags: ['Ephemeral'] });
    }

    const imageUrls = existing.images || (existing.image ? [existing.image] : []) || [];
    const dashboardEmbed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setTitle(`📸 Trình chỉnh ảnh: ${existing.name}`)
        .setDescription("Bấm nút ở **Hàng 1** để Sửa hoặc Thêm ảnh mới (Tối đa 5 ảnh).\nBấm nút ở **Hàng 2** để Xóa bớt ảnh slide khỏi album.")
        .setTimestamp();

    if (imageUrls.length > 0) {
        dashboardEmbed.setThumbnail(imageUrls[0]);
        let imgListText = "";
        imageUrls.forEach((url, i) => { imgListText += `🖼️ **Ảnh ${i + 1}:** [Xem ảnh cũ](${url})\n`; });
        dashboardEmbed.addFields({ name: "Bộ sưu tập ảnh hiện tại:", value: imgListText });
    }

    // Hàng 1: Sửa hoặc Thêm ảnh
    const editRow = new ActionRowBuilder();
    for (let i = 0; i < imageUrls.length; i++) {
        editRow.addComponents(new ButtonBuilder().setCustomId(`changephoto_${targetId}_${i}`).setLabel(`Sửa ảnh ${i + 1}`).setStyle(ButtonStyle.Primary));
    }
    if (imageUrls.length < 5) {
        editRow.addComponents(new ButtonBuilder().setCustomId(`changephoto_${targetId}_${imageUrls.length}`).setLabel(`Thêm ảnh phụ`).setStyle(ButtonStyle.Success));
    }

    // Hàng 2: Xóa ảnh
    const deleteRow = new ActionRowBuilder();
    if (imageUrls.length > 1) {
        for (let i = 0; i < imageUrls.length; i++) {
            deleteRow.addComponents(new ButtonBuilder().setCustomId(`deletephoto_${targetId}_${i}`).setLabel(`Xóa ảnh ${i + 1}`).setStyle(ButtonStyle.Danger));
        }
    }

    const components = [editRow];
    if (deleteRow.components.length > 0) {
        components.push(deleteRow);
    }

    if (interaction.isStringSelectMenu() || interaction.isButton()) {
        await interaction.update({ embeds: [dashboardEmbed], components, content: null });
    } else {
        await interaction.reply({ embeds: [dashboardEmbed], components, flags: ['Ephemeral'] });
    }
}

client.on("interactionCreate", async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName, channelId, guild, member, user } = interaction;

            if (commandName === "andanh") {
                return await andanhCommand.execute(interaction);
            }

            const restrictedCommands = [
                "birthdays", "taoprofile", "taohoprofile", "suaprofile", "suaanh", "xoaprofile",
                "taosukien", "danhsachsukien", "suasukien", "xoasukien"
            ];
            if (restrictedCommands.includes(commandName) && channelId !== process.env.SETUP_CHANNEL_ID) {
                return interaction.reply({ content: `❌ Lệnh này chỉ dùng được ở kênh <#${process.env.SETUP_CHANNEL_ID}>!`, flags: ['Ephemeral'] });
            }

            const isAdmin = member.permissions.has(PermissionFlagsBits.ManageMessages) || member.roles.cache.has(HOANG_DE_ROLE);

            if (commandName === "suaprofile") {
                if (isAdmin) {
                    const selectMenu = await createRegisteredUsersSelectMenu("select_edit_profile", "Chọn thành viên cần sửa hồ sơ...");
                    if (!selectMenu) return interaction.reply({ content: "❌ Chưa có thành viên nào đăng ký hồ sơ cả!", flags: ['Ephemeral'] });
                    return await interaction.reply({ content: "⚙️ **Chọn thành viên bạn muốn chỉnh sửa hồ sơ:**", components: [new ActionRowBuilder().addComponents(selectMenu)], flags: ['Ephemeral'] });
                } else {
                    if (!isSelfAllowed(member)) return interaction.reply({ content: "❌ Bạn không có quyền chỉnh sửa hồ sơ!", flags: ['Ephemeral'] });
                    const data = loadData();
                    if (!data[user.id]) return interaction.reply({ content: "❌ Bạn chưa có hồ sơ! Hãy tạo bằng lệnh `/taoprofile`.", flags: ['Ephemeral'] });
                    return await openEditProfileModal(interaction, user.id);
                }
            }

            if (commandName === "suaanh") {
                if (isAdmin) {
                    const selectMenu = await createRegisteredUsersSelectMenu("select_edit_photos", "Chọn thành viên để chỉnh sửa ảnh...");
                    if (!selectMenu) return interaction.reply({ content: "❌ Chưa có ai khởi tạo hồ sơ để chỉnh sửa ảnh!", flags: ['Ephemeral'] });
                    return await interaction.reply({ content: "📸 **Chọn thành viên bạn muốn thay đổi ảnh hồ sơ:**", components: [new ActionRowBuilder().addComponents(selectMenu)], flags: ['Ephemeral'] });
                } else {
                    if (!isSelfAllowed(member)) return interaction.reply({ content: "❌ Bạn không có quyền sửa ảnh hồ sơ cá nhân!", flags: ['Ephemeral'] });
                    const data = loadData();
                    if (!data[user.id]) return interaction.reply({ content: "❌ Bạn chưa có hồ sơ cá nhân! Hãy dùng `/taoprofile` trước.", flags: ['Ephemeral'] });
                    return await openPhotoEditorDashboard(interaction, user.id);
                }
            }

            if (commandName === "xoaprofile") {
                if (isAdmin) {
                    const selectMenu = await createRegisteredUsersSelectMenu("select_delete_profile", "Chọn thành viên cần xóa hồ sơ vĩnh viễn...");
                    if (!selectMenu) return interaction.reply({ content: "❌ Không thể xóa vì danh sách hiện đang trống!", flags: ['Ephemeral'] });
                    return await interaction.reply({ content: "🚨 **Chọn thành viên bạn muốn xóa hồ sơ:**", components: [new ActionRowBuilder().addComponents(selectMenu)], flags: ['Ephemeral'] });
                } else {
                    if (!isSelfAllowed(member)) return interaction.reply({ content: "❌ Bạn không có quyền xóa hồ sơ cá nhân!", flags: ['Ephemeral'] });
                    const data = loadData();
                    if (!data[user.id]) return interaction.reply({ content: "❌ Bạn chưa có hồ sơ cá nhân để xóa.", flags: ['Ephemeral'] });

                    const confirmRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`confirm_delete_${user.id}`).setLabel("Xác Nhận Xóa").setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId("cancel_delete").setLabel("Hủy Bỏ").setStyle(ButtonStyle.Secondary)
                    );
                    return interaction.reply({ content: "⚠️ Bạn có chắc chắn muốn xóa hồ sơ cá nhân của mình khỏi Sảnh Danh Vọng không?", components: [confirmRow], flags: ['Ephemeral'] });
                }
            }

            if (commandName === "sticky") {
                const modal = new ModalBuilder().setCustomId("sticky_modal").setTitle("Cấu hình Tin nhắn Ghim Kênh");
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId("modal_sticky_content").setLabel("Nhập nội dung ghim (Xuống dòng tự do)").setStyle(TextInputStyle.Paragraph).setRequired(true)
                ));
                return await interaction.showModal(modal);
            }

            if (commandName === "unsticky") {
                await interaction.deferReply({ flags: ['Ephemeral'] });
                const stickyData = loadStickyData();
                if (!stickyData[channelId]) return await interaction.editReply({ content: "❌ Kênh này hiện tại không có tin nhắn dính nào cả." });

                if (stickyData[channelId].lastMessageId) {
                    const oldMsg = await interaction.channel.messages.fetch(stickyData[channelId].lastMessageId).catch(() => null);
                    if (oldMsg) await oldMsg.delete().catch(() => null);
                }
                delete stickyData[channelId];
                saveStickyData(stickyData);
                return await interaction.editReply({ content: "✅ Đã gỡ bỏ tính năng tin nhắn dính thành công tại kênh này!" });
            }

            if (commandName === "birthdays") {
                await interaction.deferReply();
                const data = loadData();
                let listText = ""; let index = 1;
                for (const userId in data) {
                    const userData = data[userId];
                    if (userData.day && userData.month) {
                        const daysLeft = getDaysUntilBirthday(userData.day, userData.month);
                        listText += `#${index} 👤 **${userData.name}** - 🎂 ${formatBirthday(userData.day, userData.month, userData.year)} (Còn **${daysLeft} ngày**)\n\n`;
                        index++;
                    }
                }
                const listEmbed = new EmbedBuilder().setColor("#FFB6C1").setTitle("🎂 DANH SÁCH SINH NHẬT THÀNH VIÊN 🎂").setDescription(listText || "Chưa có thành viên nào cập nhật hồ sơ sinh nhật.").setTimestamp();
                return await interaction.editReply({ embeds: [listEmbed] });
            }

            if (commandName === "birthday") {
                const data = loadData();
                const userIds = Object.keys(data);
                if (userIds.length === 0) return interaction.reply({ content: "❌ Chưa có hồ sơ sinh nhật nào!", flags: ['Ephemeral'] });

                const selectMenu = new StringSelectMenuBuilder().setCustomId("select_birthday_lookup").setPlaceholder("Chọn thành viên để xem ngày sinh nhật...");
                for (const id of userIds) {
                    const userData = data[id];
                    const userObj = client.users.cache.get(id) || await client.users.fetch(id).catch(() => null);
                    selectMenu.addOptions({
                        label: `${userData.name}${userObj ? ` (@${userObj.username})` : ""}`.slice(0, 100),
                        value: id,
                        description: `Discord ID: ${id}`
                    });
                }
                return await interaction.reply({ content: "🎂 **Chọn thành viên bạn muốn xem thông tin sinh nhật:**", components: [new ActionRowBuilder().addComponents(selectMenu)] });
            }

            if (commandName === "taoprofile") {
                if (!isSelfAllowed(member)) return interaction.reply({ content: "❌ Bạn không có quyền sử dụng lệnh này!", flags: ['Ephemeral'] });
                
                const data = loadData();
                if (data[user.id]) {
                    return interaction.reply({ content: "❌ Bạn đã có hồ sơ! Dùng `/suaprofile` để sửa hoặc `/xoaprofile` để xóa.", flags: ['Ephemeral'] });
                }

                const imageUrls = [1, 2, 3, 4, 5].map(i => interaction.options.getAttachment(`anh${i}`)?.url).filter(Boolean);
                tempImages.set(user.id, imageUrls);

                const modal = new ModalBuilder().setCustomId(`profile_modal_${user.id}`).setTitle("Thông Tin Hồ Sơ Cá Nhân");
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_ten").setLabel("Họ và tên").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_slogan").setLabel("Slogan cá nhân").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_noio").setLabel("Nơi ở hiện tại").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_sothich").setLabel("Sở thích").setStyle(TextInputStyle.Paragraph).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_ngaysinh").setLabel("Ngày sinh (Vd: 15/06)").setStyle(TextInputStyle.Short).setRequired(false))
                );
                return await interaction.showModal(modal);
            }

            if (commandName === "taohoprofile") {
                if (!isAdmin) return interaction.reply({ content: "❌ Chỉ QTV mới được dùng lệnh tạo hộ này!", flags: ['Ephemeral'] });
                
                const targetUser = interaction.options.getUser("user");
                const data = loadData();
                if (data[targetUser.id]) {
                    return interaction.reply({ content: `❌ Thành viên <@${targetUser.id}> đã có hồ sơ cá nhân trên hệ thống!`, flags: ['Ephemeral'] });
                }
                
                const imageUrls = [1, 2, 3, 4, 5].map(i => interaction.options.getAttachment(`anh${i}`)?.url).filter(Boolean);
                tempImages.set(targetUser.id, imageUrls);

                const modal = new ModalBuilder().setCustomId(`profile_modal_${targetUser.id}`).setTitle(`Tạo hộ hồ sơ: ${targetUser.username}`);
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_ten").setLabel("Họ và tên").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_slogan").setLabel("Slogan cá nhân").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_noio").setLabel("Nơi ở hiện tại").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_sothich").setLabel("Sở thích").setStyle(TextInputStyle.Paragraph).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_ngaysinh").setLabel("Ngày sinh (Vd: 15/06)").setStyle(TextInputStyle.Short).setRequired(false))
                );
                return await interaction.showModal(modal);
            }

            if (commandName === "taosukien") {
                const role1 = interaction.options.getRole("role1");
                const role2 = interaction.options.getRole("role2");
                const rolesSelected = [role1, role2].filter(Boolean).map(r => r.id);

                tempEventRoles.set(user.id, rolesSelected);

                const modal = new ModalBuilder().setCustomId(`create_event_modal`).setTitle("Tạo Sự Kiện Nhắc Nhở");
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_sukien_name").setLabel("Tên sự kiện").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_sukien_date").setLabel("Ngày diễn ra (Vd: 14/02)").setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_sukien_msg").setLabel("Nội dung lời nhắn thông báo").setStyle(TextInputStyle.Paragraph).setRequired(true))
                );
                return await interaction.showModal(modal);
            }

            if (commandName === "suasukien") {
                const eventsData = loadEventsData();
                const editableEvents = Object.keys(eventsData).filter(id => isAdmin || eventsData[id].creatorId === user.id);

                if (editableEvents.length === 0) return interaction.reply({ content: "❌ Bạn không có sự kiện nào để sửa!", flags: ['Ephemeral'] });

                const selectMenu = new StringSelectMenuBuilder().setCustomId("select_event_edit").setPlaceholder("Chọn sự kiện bạn muốn chỉnh sửa...");
                editableEvents.forEach(id => {
                    selectMenu.addOptions({ label: eventsData[id].name.slice(0, 100), value: id, description: `Ngày: ${eventsData[id].day}/${eventsData[id].month}` });
                });
                return await interaction.reply({ content: "⚙️ **Chọn sự kiện bạn muốn sửa thông tin:**", components: [new ActionRowBuilder().addComponents(selectMenu)], flags: ['Ephemeral'] });
            }

            if (commandName === "xoasukien") {
                const eventsData = loadEventsData();
                const deletableEvents = Object.keys(eventsData).filter(id => isAdmin || eventsData[id].creatorId === user.id);

                if (deletableEvents.length === 0) return interaction.reply({ content: "❌ Bạn không sở hữu sự kiện nào để tiến hành xóa!", flags: ['Ephemeral'] });

                const selectMenu = new StringSelectMenuBuilder().setCustomId("select_event_delete").setPlaceholder("Chọn sự kiện bạn muốn xóa bỏ...");
                deletableEvents.forEach(id => {
                    selectMenu.addOptions({ label: eventsData[id].name.slice(0, 100), value: id, description: `Ngày: ${eventsData[id].day}/${eventsData[id].month}` });
                });
                return await interaction.reply({ content: "🚨 **Chọn sự kiện bạn muốn xóa vĩnh viễn khỏi server:**", components: [new ActionRowBuilder().addComponents(selectMenu)], flags: ['Ephemeral'] });
            }

            if (commandName === "danhsachsukien") {
                await interaction.deferReply();
                const eventsData = loadEventsData();
                let listText = ""; let index = 1;
                for (const id in eventsData) {
                    const event = eventsData[id];
                    const daysLeft = getDaysUntilBirthday(event.day, event.month);
                    listText += `#${index} 🔔 **${event.name}** - 📆 Ngày: ${event.day}/${event.month} (Còn **${daysLeft} ngày**) - ✍️ Người tạo: <@${event.creatorId}>\n\n`;
                    index++;
                }
                const listEmbed = new EmbedBuilder().setColor("#F1C40F").setTitle("✨ DANH SÁCH SỰ KIỆN TRONG SERVER ✨").setDescription(listText || "Chưa có sự kiện nào được tạo lập nhắc nhở.").setTimestamp();
                return await interaction.editReply({ embeds: [listEmbed] });
            }

            if (commandName === "sukien") {
                const eventsData = loadEventsData();
                const eventIds = Object.keys(eventsData);
                if (eventIds.length === 0) return interaction.reply({ content: "❌ Chưa có sự kiện nhắc nhở nào được lưu!", flags: ['Ephemeral'] });

                const selectMenu = new StringSelectMenuBuilder().setCustomId("select_event_lookup").setPlaceholder("Chọn sự kiện để tra cứu...");
                eventIds.forEach(id => {
                    selectMenu.addOptions({ label: eventsData[id].name.slice(0, 100), value: id, description: `Người tạo: @${eventsData[id].creatorName || "Ẩn danh"}` });
                });
                return await interaction.reply({ content: "🔔 **Chọn sự kiện bạn muốn tra cứu thông tin:**", components: [new ActionRowBuilder().addComponents(selectMenu)] });
            }
        }

        if (interaction.isStringSelectMenu()) {
            const { customId, values, guild } = interaction;
            const targetId = values[0];

            if (customId === "select_edit_profile") return await openEditProfileModal(interaction, targetId);
            if (customId === "select_edit_photos") return await openPhotoEditorDashboard(interaction, targetId);

            if (customId === "select_delete_profile") {
                const data = loadData();
                if (!data[targetId]) return interaction.reply({ content: "❌ Lỗi: Hồ sơ không tồn tại.", flags: ['Ephemeral'] });
                const targetName = data[targetId].name || targetId;
                await deleteProfileCard(guild, targetId);
                return await interaction.update({ content: `✅ Đã xóa thành công hồ sơ cá nhân của **${targetName}** (<@${targetId}>)!`, components: [] });
            }

            if (customId === "select_birthday_lookup") {
                await interaction.deferReply();
                const data = loadData();
                const userData = data[targetId];
                if (!userData) return await interaction.editReply({ content: "❌ Không tìm thấy thông tin hồ sơ của thành viên này." });

                const userObj = client.users.cache.get(targetId) || await client.users.fetch(targetId).catch(() => null);
                const daysLeft = getDaysUntilBirthday(userData.day, userData.month);
                const countdownText = daysLeft === 0 ? "🎂 Hôm nay luôn! Chúc mừng sinh nhật nhé!" : `Còn **${daysLeft} ngày**`;

                const bdayEmbed = new EmbedBuilder()
                    .setColor("#FFB6C1")
                    .setTitle("🎂 THÔNG TIN SINH NHẬT THÀNH VIÊN 🎂")
                    .setDescription(`👤 **${userData.name}** (${userObj ? `@${userObj.username}` : "Thành viên"})\n🎂 Ngày sinh: ${formatBirthday(userData.day, userData.month, userData.year)}\n⏳ ${countdownText}`)
                    .setThumbnail(userObj ? userObj.displayAvatarURL({ dynamic: true }) : null)
                    .setTimestamp();

                await interaction.editReply({ content: null, embeds: [bdayEmbed], components: [] });
            }

            if (customId === "select_event_edit") {
                const eventsData = loadEventsData();
                const event = eventsData[targetId];
                if (!event) return interaction.reply({ content: "❌ Sự kiện không tồn tại!", flags: ['Ephemeral'] });

                const modal = new ModalBuilder().setCustomId(`edit_event_modal_${targetId}`).setTitle("Chỉnh Sửa Sự Kiện");
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_sukien_name").setLabel("Tên sự kiện").setStyle(TextInputStyle.Short).setValue(event.name || "").setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_sukien_date").setLabel("Ngày diễn ra (Vd: 14/02)").setStyle(TextInputStyle.Short).setValue(`${event.day}/${event.month}`).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("modal_sukien_msg").setLabel("Nội dung lời nhắn thông báo").setStyle(TextInputStyle.Paragraph).setValue(event.message || "").setRequired(true))
                );
                return await interaction.showModal(modal);
            }

            if (customId === "select_event_delete") {
                await interaction.deferReply({ flags: ['Ephemeral'] });
                const eventsData = loadEventsData();
                if (!eventsData[targetId]) return await interaction.editReply({ content: "❌ Sự kiện không tồn tại!" });

                const deletedName = eventsData[targetId].name;
                delete eventsData[targetId];
                saveEventsData(eventsData);
                return await interaction.editReply({ content: `✅ Đã xóa bỏ thành công sự kiện nhắc nhở: **${deletedName}**!` });
            }

            if (customId === "select_event_lookup") {
                await interaction.deferReply();
                const eventsData = loadEventsData();
                const event = eventsData[targetId];
                if (!event) return await interaction.editReply({ content: "❌ Sự kiện không tồn tại." });

                const daysLeft = getDaysUntilBirthday(event.day, event.month);
                const rolesTagText = event.roles && event.roles.length > 0 ? event.roles.map(rId => `<@&${rId}>`).join(", ") : "Không có";

                const eventEmbed = new EmbedBuilder()
                    .setColor("#00F0FF")
                    .setTitle(`🔔 THÔNG TIN SỰ KIỆN 🔔`)
                    .setDescription(`🔔 **Tên sự kiện:** ${event.name}\n📆 Ngày diễn ra: ${event.day}/${event.month}\n⏳ ${daysLeft === 0 ? "Hôm nay luôn!" : `Còn ${daysLeft} ngày`}\n✍️ Người tạo: <@${event.creatorId}>\n👥 Nhóm nhận tin: ${rolesTagText}`)
                    .addFields({ name: "💬 Lời nhắn đặc biệt:", value: event.message || "Không có lời nhắn đi kèm." })
                    .setTimestamp();

                await interaction.editReply({ content: null, embeds: [eventEmbed], components: [] });
            }
        }

        if (interaction.isModalSubmit()) {
            const { customId, guild, fields, user } = interaction;

            if (customId.startsWith("profile_modal_")) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
                const targetId = customId.replace("profile_modal_", "");

                const name = fields.getTextInputValue("modal_ten");
                const slogan = fields.getTextInputValue("modal_slogan");
                const location = fields.getTextInputValue("modal_noio");
                const hobbies = fields.getTextInputValue("modal_sothich");
                const bdayRaw = fields.getTextInputValue("modal_ngaysinh").trim();

                let day = null, month = null, year = null;
                if (bdayRaw) {
                    const parts = bdayRaw.split(/[-/.]/);
                    if (parts.length >= 2) { 
                        day = parseInt(parts[0], 10); 
                        month = parseInt(parts[1], 10); 
                        if (parts.length >= 3) year = parseInt(parts[2], 10); 
                    }
                    if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12) {
                        return interaction.editReply({ content: "❌ Ngày sinh nhật không hợp lệ!" });
                    }
                }

                const imageUrls = tempImages.get(targetId) || [];
                if (imageUrls.length === 0) return interaction.editReply({ content: "❌ Không tìm thấy tệp ảnh tạm thời của hồ sơ." });

                // CHUYỂN TOÀN BỘ ẢNH TẠM THÀNH ẢNH LƯU TRỮ VĨNH VIỄN TRONG VAULT
                const permanentUrls = await saveImagesPermanently(guild, targetId, imageUrls);

                const data = loadData();
                data[targetId] = { name, slogan, location, hobbies, images: permanentUrls, day, month, year, messageId: null, hidden: false };
                saveData(data);
                tempImages.delete(targetId);

                const wasShown = await sendProfileCardToHall(guild, targetId, data[targetId], "Sảnh danh vọng 🏆");
                if (wasShown) {
                    return await interaction.editReply({ content: `✅ Đã lưu và hiển thị hồ sơ của <@${targetId}> lên Sảnh Danh Vọng!` });
                } else {
                    return await interaction.editReply({ content: `⚠️ Đã lưu cấu hình thành công! Tuy nhiên hồ sơ này tạm ẩn do tài khoản <@${targetId}> chưa đủ vai trò kiểm duyệt.` });
                }
            }

            if (customId.startsWith("edit_profile_modal_")) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
                const targetId = customId.replace("edit_profile_modal_", "");
                
                const name = fields.getTextInputValue("modal_ten");
                const slogan = fields.getTextInputValue("modal_slogan");
                const location = fields.getTextInputValue("modal_noio");
                const hobbies = fields.getTextInputValue("modal_sothich");
                const bdayRaw = fields.getTextInputValue("modal_ngaysinh").trim();

                let day = null, month = null, year = null;
                if (bdayRaw) {
                    const parts = bdayRaw.split(/[-/.]/);
                    if (parts.length >= 2) {
                        day = parseInt(parts[0], 10);
                        month = parseInt(parts[1], 10);
                        if (parts.length >= 3) year = parseInt(parts[2], 10);
                    }
                    if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12) {
                        return interaction.editReply({ content: "❌ Ngày sinh nhật không hợp lệ!" });
                    }
                }

                const data = loadData();
                const existing = data[targetId] || {};
                const imageUrls = existing.images || (existing.image ? [existing.image] : []) || [];

                data[targetId] = { name, slogan, location, hobbies, images: imageUrls, day, month, year, messageId: existing.messageId || null, hidden: existing.hidden || false };
                saveData(data);

                const wasShown = await sendProfileCardToHall(guild, targetId, data[targetId], "Sảnh danh vọng 🏆 (Đã cập nhật thông tin)");
                if (wasShown) {
                    return await interaction.editReply({ content: `✅ Đã cập nhật thông tin tại Sảnh Danh Vọng thành công!` });
                } else {
                    return await interaction.editReply({ content: `⚠️ Đã lưu thông tin! Tuy nhiên hồ sơ đang tạm ẩn do tài khoản chưa đủ vai trò kiểm duyệt.` });
                }
            }

            if (customId === "create_event_modal") {
                await interaction.deferReply({ flags: ['Ephemeral'] });
                const sName = fields.getTextInputValue("modal_sukien_name");
                const sDateRaw = fields.getTextInputValue("modal_sukien_date").trim();
                const sMsg = fields.getTextInputValue("modal_sukien_msg");

                let day = null, month = null;
                if (sDateRaw) {
                    const parts = sDateRaw.split(/[-/.]/);
                    if (parts.length >= 2) {
                        day = parseInt(parts[0], 10);
                        month = parseInt(parts[1], 10);
                    }
                    if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12) {
                        return interaction.editReply({ content: "❌ Định dạng ngày tháng sự kiện không hợp lệ! Nhập: ngày/tháng (Vd: 14/02)" });
                    }
                }

                const rolesSelected = tempEventRoles.get(user.id) || [];
                tempEventRoles.delete(user.id);

                const eventsData = loadEventsData();
                const eventId = `evt_${Date.now()}`;
                eventsData[eventId] = { name: sName, day, month, message: sMsg, roles: rolesSelected, creatorId: user.id, creatorName: user.username };
                saveEventsData(eventsData);

                return await interaction.editReply({ content: `✅ Đã tạo sự kiện: **${sName}** (${day}/${month})!` });
            }

            if (customId.startsWith("edit_event_modal_")) {
                await interaction.deferReply({ flags: ['Ephemeral'] });
                const targetEventId = customId.replace("edit_event_modal_", "");
                const sName = fields.getTextInputValue("modal_sukien_name");
                const sDateRaw = fields.getTextInputValue("modal_sukien_date").trim();
                const sMsg = fields.getTextInputValue("modal_sukien_msg");

                let day = null, month = null;
                if (sDateRaw) {
                    const parts = sDateRaw.split(/[-/.]/);
                    if (parts.length >= 2) {
                        day = parseInt(parts[0], 10);
                        month = parseInt(parts[1], 10);
                    }
                    if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12) {
                        return interaction.editReply({ content: "❌ Định dạng ngày sự kiện không hợp lệ!" });
                    }
                }

                const eventsData = loadEventsData();
                const existingEvent = eventsData[targetEventId];
                if (!existingEvent) return interaction.editReply({ content: "❌ Sự kiện không tồn tại." });

                eventsData[targetEventId] = { ...existingEvent, name: sName, day, month, message: sMsg };
                saveEventsData(eventsData);

                return await interaction.editReply({ content: `✅ Đã sửa thành công sự kiện: **${sName}**!` });
            }

            if (customId === "sticky_modal") {
                await interaction.deferReply({ flags: ['Ephemeral'] });
                let text = fields.getTextInputValue("modal_sticky_content").replace(/\\n/g, '\n').replace(/\|/g, '\n');

                const stickyData = loadStickyData();
                if (stickyData[interaction.channel.id]?.lastMessageId) {
                    const oldMsg = await interaction.channel.messages.fetch(stickyData[interaction.channel.id].lastMessageId).catch(() => null);
                    if (oldMsg) await oldMsg.delete().catch(() => null);
                }

                const stickyEmbed = new EmbedBuilder().setColor("#F1C40F").setTitle("📌 Tin nhắn ghim:").setDescription(text).setTimestamp();
                const newMsg = await interaction.channel.send({ embeds: [stickyEmbed] });

                stickyData[interaction.channel.id] = { text, lastMessageId: newMsg.id };
                saveStickyData(stickyData);

                return await interaction.editReply({ content: "✅ Tạo tin nhắn ghim thành công!" });
            }
        }

        if (interaction.isButton()) {
            const { customId, user, guild } = interaction;

            // Xử lý nút xóa ảnh (deletephoto_)
            if (customId.startsWith("deletephoto_")) {
                const parts = customId.split("_");
                const targetId = parts[1];
                const imgIndex = parseInt(parts[2], 10);

                const data = loadData();
                const existing = data[targetId];

                if (existing) {
                    if (!existing.images) existing.images = existing.image ? [existing.image] : [];
                    
                    if (existing.images.length <= 1) {
                        return await interaction.reply({ content: "❌ Không thể xóa ảnh cuối cùng! Hồ sơ của bạn phải có ít nhất 1 ảnh hiển thị.", flags: ['Ephemeral'] });
                    }

                    // Loại bỏ ảnh tại vị trí chỉ định
                    existing.images.splice(imgIndex, 1);
                    existing.image = existing.images[0] || null;

                    data[targetId] = existing;
                    saveData(data);

                    // Cập nhật Sảnh Danh Vọng lập tức
                    await sendProfileCardToHall(guild, targetId, existing, "Sảnh danh vọng 🏆 (Đã xóa bớt ảnh)");

                    // Cập nhật lại giao diện quản lý ảnh ngay trước mắt người dùng
                    await openPhotoEditorDashboard(interaction, targetId);

                    await interaction.followUp({ content: `✅ Đã xóa thành công **Ảnh ${imgIndex + 1}** khỏi hồ sơ!`, flags: ['Ephemeral'] }).catch(() => null);
                }
                return;
            }

            if (customId.startsWith("slide_")) {
                await interaction.deferUpdate().catch(() => null);

                const parts = customId.split("_");
                const profileUserId = parts[1];
                const targetIndex = parseInt(parts[2], 10);

                const data = loadData();
                const userData = data[profileUserId];
                const imageUrls = userData ? (userData.images || (userData.image ? [userData.image] : []) || []) : [];
                if (imageUrls.length === 0) {
                    return await interaction.followUp({ content: "❌ Không có dữ liệu ảnh trong cơ sở dữ liệu!", flags: ['Ephemeral'] }).catch(() => null);
                }

                // Cập nhật và tự gia hạn liên kết CDN ngay khi người dùng chuyển trang
                let finalUrls = imageUrls;
                try {
                    const refreshedMapping = await refreshDiscordUrls(imageUrls);
                    let hasChanged = false;
                    finalUrls = imageUrls.map(url => {
                        const normalizedUrl = url.replace("media.discordapp.net/attachments/", "cdn.discordapp.com/attachments/");
                        if (refreshedMapping[normalizedUrl]) {
                            hasChanged = true;
                            return refreshedMapping[normalizedUrl];
                        }
                        return url;
                    });

                    if (hasChanged && userData) {
                        userData.images = finalUrls;
                        userData.image = finalUrls[0] || null;
                        data[profileUserId] = userData;
                        saveData(data);
                    }
                } catch (cdnErr) {
                    console.error("❌ Lỗi tự sửa ảnh khi lướt slide:", cdnErr);
                }

                const total = finalUrls.length;
                const safeIndex = (targetIndex >= 0 && targetIndex < total) ? targetIndex : 0;
                
                const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]).setImage(finalUrls[safeIndex]);

                const prevIndex = safeIndex === 0 ? total - 1 : safeIndex - 1;
                const nextIndex = safeIndex === total - 1 ? 0 : safeIndex + 1;

                const newRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`slide_${profileUserId}_${prevIndex}_prev`).setLabel('<<').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('dummy').setLabel(`${safeIndex + 1}/${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                    new ButtonBuilder().setCustomId(`slide_${profileUserId}_${nextIndex}_next`).setLabel('>>').setStyle(ButtonStyle.Secondary)
                );

                return await interaction.editReply({ embeds: [newEmbed], components: [newRow] }).catch(() => null);
            }

            if (customId.startsWith("changephoto_")) {
                const parts = customId.split("_");
                const targetId = parts[1];
                const imgIndex = parseInt(parts[2], 10);

                await interaction.update({ content: `📸 **[ĐANG CHỜ ẢNH]** Tải lên **1 ảnh mới** vào kênh này trong 60 giây để ghi đè vào **Vị trí thứ ${imgIndex + 1}**...`, embeds: [], components: [] });

                const filter = m => m.author.id === user.id && m.attachments.size > 0;
                const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 60000 });

                collector.on("collect", async m => {
                    const attachment = m.attachments.first();
                    const newUrl = attachment.url;

                    const data = loadData();
                    const existing = data[targetId];

                    if (existing) {
                        if (!existing.images) existing.images = existing.image ? [existing.image] : [];
                        
                        // CHUYỂN ĐỔI ẢNH TẢI LÊN MỚI THÀNH ẢNH VAULT VĨNH VIỄN TRÊN SERVER
                        const permanentUrls = await saveImagesPermanently(guild, targetId, [newUrl]);
                        if (permanentUrls && permanentUrls.length > 0) {
                            existing.images[imgIndex] = permanentUrls[0];
                        } else {
                            existing.images[imgIndex] = newUrl;
                        }

                        existing.images = existing.images.filter(Boolean);
                        existing.image = existing.images[0] || null;

                        data[targetId] = existing;
                        saveData(data);

                        await m.react("✅").catch(() => null);

                        const wasShown = await sendProfileCardToHall(guild, targetId, existing, "Sảnh danh vọng 🏆 (Đã cập nhật ảnh)");
                        if (wasShown) {
                            await interaction.followUp({ content: `✅ Cập nhật bộ sưu tập ảnh thành công tại vị trí số **${imgIndex + 1}**!`, flags: ['Ephemeral'] });
                        } else {
                            await interaction.followUp({ content: `⚠️ Cập nhật ảnh thành công! Tuy nhiên hồ sơ này đang tạm ẩn do tài khoản chưa đủ vai trò kiểm duyệt.`, flags: ['Ephemeral'] });
                        }
                    }
                });

                collector.on("end", (collected, reason) => {
                    if (reason === "time") {
                        interaction.followUp({ content: "⏳ Hết thời gian chờ 60 giây.", flags: ['Ephemeral'] });
                    }
                });
                return;
            }

            if (customId.startsWith("confirm_delete_")) {
                const targetId = customId.replace("confirm_delete_", "");
                await deleteProfileCard(guild, targetId);
                return await interaction.update({ content: "✅ Đã xóa hồ sơ cá nhân thành công khỏi Sảnh Danh Vọng!", components: [] });
            }

            if (customId === "cancel_delete") {
                return await interaction.update({ content: "❌ Đã hủy thao tác xóa.", components: [] });
            }
        }
    } catch (interactError) {
        console.error("❌ Phát hiện lỗi trong trình xử lý tương tác của Bot:", interactError);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: "❌ Đã xảy ra lỗi hệ thống khi xử lý thao tác này. Vui lòng thử lại sau!", flags: ['Ephemeral'] }).catch(() => null);
            } else {
                await interaction.reply({ content: "❌ Đã xảy ra lỗi hệ thống khi xử lý thao tác này. Vui lòng thử lại sau!", flags: ['Ephemeral'] }).catch(() => null);
            }
        } catch (innerErr) {
            // Bỏ qua lỗi
        }
    }
});

client.login(process.env.TOKEN);
