require("dotenv").config();
const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
    REST, Routes, SlashCommandBuilder, PermissionFlagsBits,
    StringSelectMenuBuilder
} = require("discord.js");
const cron = require("node-cron");
const fs = require("fs");

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

const tempImages = new Map();
const processingChannels = new Set(); // Chặn tình trạng spam loop khi nhiều người nhắn cùng lúc

// ==========================================
// HÀM TIỆN ÍCH DÙNG CHUNG (DATABASE & TRỢ GIÚP)
// ==========================================
function readJson(path) {
    if (!fs.existsSync(path)) return {};
    try {
        const content = fs.readFileSync(path, "utf-8").trim();
        return content ? JSON.parse(content) : {};
    } catch (err) {
        console.error(`⚠️ Lỗi định dạng file ${path}, đang tự động reset.`);
        return {};
    }
}

function writeJson(path, data) {
    fs.writeFileSync(path, JSON.stringify(data, null, 4));
}

// Bọc gọn gàng các hàm để truy xuất dữ liệu nhanh chóng
const loadData = () => readJson(FILE);
const saveData = (data) => writeJson(FILE, data);
const loadStickyData = () => readJson(STICKY_FILE);
const saveStickyData = (data) => writeJson(STICKY_FILE, data);

// Kiểm tra xem thành viên có quyền thao tác cấu hình của chính mình hay không
function isSelfAllowed(member) {
    // Nếu là Hoàng Đế thì được toàn quyền bypass check
    if (member.roles.cache.has(HOANG_DE_ROLE)) return true;
    
    const roleEnv = process.env.ROLE_IDS || "";
    const allowedRoles = roleEnv.split(',').map(r => r.trim()).filter(r => r !== "");
    if (allowedRoles.length === 0) return true; // Nếu không cài đặt ROLE_IDS thì mở cho tất cả
    return allowedRoles.some(roleId => member.roles.cache.has(roleId));
}

function getDaysUntilBirthday(day, month) {
    const now = new Date();
    const currentYear = now.getFullYear();
    let bdayTest = new Date(currentYear, month - 1, day);
    
    if (bdayTest < now && bdayTest.toDateString() !== now.toDateString()) {
        bdayTest.setFullYear(currentYear + 1);
    }
    
    const diffTime = bdayTest - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ==========================================
// SỰ KIỆN BOT READY & ĐĂNG KÝ SLASH COMMANDS
// ==========================================
client.once("ready", async () => {
    console.log(`✅ Bot online: ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('birthdays')
            .setDescription('Xem danh sách sinh nhật của tất cả thành viên (Chỉ dùng ở kênh Setup)'),
        new SlashCommandBuilder()
            .setName('birthday')
            .setDescription('Tra cứu sinh nhật của một thành viên cụ thể (Có thể dùng ở mọi kênh)'),
        new SlashCommandBuilder()
            .setName('taoprofile')
            .setDescription('Tạo hồ sơ cá nhân và điền ngày sinh nhật')
            .addAttachmentOption(option => option.setName('anh1').setDescription('Ảnh profile 1').setRequired(true))
            .addAttachmentOption(option => option.setName('anh2').setDescription('Ảnh profile 2').setRequired(false))
            .addAttachmentOption(option => option.setName('anh3').setDescription('Ảnh profile 3').setRequired(false))
            .addAttachmentOption(option => option.setName('anh4').setDescription('Ảnh profile 4').setRequired(false)),
        new SlashCommandBuilder()
            .setName('taohoprofile')
            .setDescription('Tạo hộ hồ sơ cá nhân cho thành viên khác (Chỉ dùng cho QTV)')
            .addUserOption(option => option.setName('user').setDescription('Thành viên muốn tạo hộ').setRequired(true))
            .addAttachmentOption(option => option.setName('anh1').setDescription('Ảnh profile 1').setRequired(true))
            .addAttachmentOption(option => option.setName('anh2').setDescription('Ảnh profile 2').setRequired(false))
            .addAttachmentOption(option => option.setName('anh3').setDescription('Ảnh profile 3').setRequired(false))
            .addAttachmentOption(option => option.setName('anh4').setDescription('Ảnh profile 4').setRequired(false))
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
            .setName('sticky')
            .setDescription('Tạo cấu hình tin nhắn dính ở cuối kênh chat thông qua bảng Modal')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages), 
        new SlashCommandBuilder()
            .setName('unsticky')
            .setDescription('Gỡ bỏ tin nhắn dính tại kênh này')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
        console.log('🔄 Đang làm mới và đồng bộ lại các lệnh cấp Server (Guild)...');
        const guilds = await client.guilds.fetch();
        for (const [guildId] of guilds) {
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, guildId),
                { body: commands },
            );
        }
        console.log('✅ Đã đồng bộ xong! Menu lệnh đã được làm sạch.');
    } catch (error) {
        console.error('❌ Lỗi khi đăng ký lệnh:', error);
    }

    // Tự động kiểm tra trạng thái ẩn/hiện profile của toàn server hàng ngày lúc 1:00 AM
    cron.schedule("0 1 * * *", async () => {
        console.log("⏳ Bắt đầu quét đồng bộ trạng thái ẩn/hiện sảnh danh vọng...");
        const guilds = await client.guilds.fetch();
        for (const [guildId] of guilds) {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) continue;
            await syncAllProfiles(guild);
        }
    });

    // ==========================================
    // CẤU HÌNH LỜI CHÚC & CRON JOB SINH NHẬT
    // ==========================================
    const loiChucMacDinh = [
        "Ôi dời ơi **{name}**! ăn cứt đi nhá :zzzzz_tom_blushh: hehe",
        "Tới công chuyện luôn :tom_creepylaugh: ! Sinh nhật của **{name}**. Liên hệ ngay cho anh zai @fowf.ongggg278 gửi qr để nhận ngay 2 lít trong sinh nhật của mình nhé",
        "Happy Birthday! Chúc **{name}** có một ngày sinh nhật thật ấm áp bên gia đình, bạn bè và luôn giữ vững ngọn lửa đam mê với những sở thích của mình! 🩷✨",
        "**{name}** lắm tiền vậy sinh nhật không thấy bank mấy ae ít xèng nhể :CBuwu:. Thôi thì nửa bill bữa nướng Oishi cũng được",
        "Thế mà lại hay anh em ạ, vì **{name}** tuổi mới chắc chắn sẽ có người yêu mới :_emoji_: 🎉",
        ":pepedance46: :pepedance46:Chúc mừng sinh nhật **{name}**! Tuổi mới ăn khỏe, ngủ ngon, học tập và làm việc thật năng suất, sớm thành công rực rỡ nha bạn tôi! 🌟🍰",
        " :raging_pepe: Chúc mừng sinh nhật. Tuổi mới chúc **{name}** roll 5 tiền toàn 3 sao, bắn toàn vào đầu và mở thẻ toàn max nhé :raging_pepe:",
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
        const now = new Date();
        const day = now.getDate();
        const month = now.getMonth() + 1;

        const guilds = await client.guilds.fetch();
        for (const [guildId] of guilds) {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) continue;

            for (const userId in data) {
                const userData = data[userId];
                // Chỉ chúc sinh nhật nếu profile của họ không bị ẩn
                if (userData.day === day && userData.month === month && !userData.hidden) {
                    const tagContent = `Nay là sinh nhật của **${userData.name}** (<@${userId}>) đấy anh em ạ <@&1207064301957947443>, <@&1258567277695995904> ơi✨🎉`;
                    let danhSachQuay = [...loiChucMacDinh];
                    
                    try {
                        const member = await guild.members.fetch(userId).catch(() => null);
                        if (member && member.roles.cache.has("1206357280937873489")) {
                            danhSachQuay = danhSachQuay.concat(loiChucDocQuyenMyNu);
                        }
                    } catch (err) { console.error(err); }

                    const cauChucNgauNhien = danhSachQuay[Math.floor(Math.random() * danhSachQuay.length)];
                    const loiChucHoanChinh = cauChucNgauNhien.replace(/{name}/g, userData.name);

                    try {
                        const birthdayChannelId = process.env.BIRTHDAY_CHANNEL_ID || "1313150267881033739";
                        const birthdayChannel = await guild.channels.fetch(birthdayChannelId).catch(() => null);
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
                    } catch (err) { console.error(err); }

                    try {
                        const generalChatChannel = await guild.channels.fetch("1206335749864296560").catch(() => null);
                        if (generalChatChannel) {
                            await generalChatChannel.send({ content: `📢 Hôm nay là sinh nhật của <@${userId}> nè mọi người ơi! Ghé qua kênh <#1313150267881033739> để gửi những lời chúc tốt đẹp nhất nhé! :tom_jerry_2:` });
                        }
                    } catch (err) { console.error(err); }
                }
            }
        }
    });
});

// ==========================================
// SỰ KIỆN LẮNG NGHE TIN NHẮN (GHIM TIN NHẮN)
// ==========================================
client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const stickyData = loadStickyData();
    if (!stickyData[message.channel.id]) return;

    if (processingChannels.has(message.channel.id)) return;
    processingChannels.add(message.channel.id);

    const channelSticky = stickyData[message.channel.id];

    const stickyEmbed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setTitle("📌 Tin nhắn ghim:") // Tiêu đề Unicode chuẩn cực đẹp, không bị vỡ lỗi custom emoji
        .setDescription(channelSticky.text)
        .setTimestamp();

    if (channelSticky.lastMessageId) {
        try {
            const oldMsg = await message.channel.messages.fetch(channelSticky.lastMessageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => null);
        } catch (err) {
            console.log("Tin cũ đã bị xóa trước đó.");
        }
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

// LẮNG NGHE SỰ KIỆN THAY ĐỔI ROLE ĐỂ ẨN/HIỆN PROFILE TỰ ĐỘNG
client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const oldRegular = oldMember.roles.cache.has(REGULAR_MEMBER_ROLE);
    const newRegular = newMember.roles.cache.has(REGULAR_MEMBER_ROLE);
    
    const oldInvestor = oldMember.roles.cache.has(INVESTOR_ROLE);
    const newInvestor = newMember.roles.cache.has(INVESTOR_ROLE);
    
    const oldHoangDe = oldMember.roles.cache.has(HOANG_DE_ROLE);
    const newHoangDe = newMember.roles.cache.has(HOANG_DE_ROLE);

    // Nếu có sự thay đổi về vai trò Thành viên thường trực, Nhà đầu tư, hoặc Hoàng Đế
    if (oldRegular !== newRegular || oldInvestor !== newInvestor || oldHoangDe !== newHoangDe) {
        const data = loadData();
        if (data[newMember.id]) {
            console.log(`🔄 Phát hiện thay đổi Role của ${newMember.user.tag}. Đang cập nhật trạng thái Sảnh danh vọng...`);
            await sendProfileCardToHall(newMember.guild, newMember.id, data[newMember.id]);
        }
    }
});

// ==========================================
// CÁC HÀM TRỢ GIÚP GIAO DIỆN (UI HELPERS)
// ==========================================

// Quét toàn bộ sảnh danh vọng để kiểm tra đồng bộ ẩn/hiện theo Role
async function syncAllProfiles(guild) {
    const data = loadData();
    for (const targetId in data) {
        await sendProfileCardToHall(guild, targetId, data[targetId]).catch(err => console.error(err));
    }
    console.log("✅ Đồng bộ ẩn/hiện hoàn tất!");
}

// Gửi hoặc cập nhật trực tiếp thẻ Profile lên Sảnh Danh Vọng (Hàm dùng chung)
async function sendProfileCardToHall(guild, targetId, userData, footerText = "Sảnh danh vọng 🏆") {
    const userObj = await client.users.fetch(targetId).catch(() => null);
    if (!userObj) return false;

    // QUY TẮC HIỂN THỊ ROLE MÀ USER YÊU CẦU:
    let member = guild.members.cache.get(targetId);
    if (!member) {
        member = await guild.members.fetch(targetId).catch(err => {
            console.warn(`⚠️ Không thể fetch member ${targetId}: ${err.message}. Đảm bảo đã bật 'Server Members Intent' trong Discord Developer Portal.`);
            return null;
        });
    }
    
    const isRegularMember = member ? member.roles.cache.has(REGULAR_MEMBER_ROLE) : false;
    const isInvestor = member ? member.roles.cache.has(INVESTOR_ROLE) : false;
    const isHoangDe = member ? member.roles.cache.has(HOANG_DE_ROLE) : false;

    // Chỉ ẩn khi KHÔNG có Regular Member VÀ KHÔNG có Investor VÀ KHÔNG có Hoàng Đế
    const shouldHide = !isRegularMember && !isInvestor && !isHoangDe;

    const profileChannelId = process.env.PROFILE_CHANNEL_ID;
    const profileChannel = await guild.channels.fetch(profileChannelId).catch(() => null);
    if (!profileChannel) return false;

    const data = loadData();

    // 1. Trường hợp phải ẨN profile
    if (shouldHide) {
        if (userData.messageId) {
            const oldMsg = await profileChannel.messages.fetch(userData.messageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => null);
        }
        data[targetId].messageId = null;
        data[targetId].hidden = true;
        saveData(data);
        console.log(`🙈 Đã ẩn profile của ${userObj.tag} do không đủ Role.`);
        return false;
    }

    // 2. Trường hợp HIỂN THỊ profile (Vẽ Embed)
    let descriptionText = `> 💬 *"${userData.slogan}"*\n\n📌 **Nơi ở:** ${userData.location}\n🩷 **Sở thích:** ${userData.hobbies}`;
    if (userData.day && userData.month) {
        descriptionText += `\n🎂 **Ngày sinh:** ${userData.day}/${userData.month}${userData.year ? `/${userData.year}` : ""}`;
    }

    // Đồng bộ cấu trúc mảng ảnh cũ và mới để tránh mất ảnh
    const imageUrls = userData.images || (userData.image ? [userData.image] : []) || [];

    const profileEmbed = new EmbedBuilder()
        .setColor("#2F3136")
        .setTitle(`☁️ ${userData.name} ☁️`)
        .setAuthor({ name: userObj.tag, iconURL: userObj.displayAvatarURL() })
        .setDescription(descriptionText)
        .setImage(imageUrls[0] || null)
        .setThumbnail(userObj.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: footerText })
        .setTimestamp();

    const components = [];
    if (imageUrls.length > 1) {
        const total = imageUrls.length;
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`slide_${targetId}_${total - 1}_prev`).setLabel('<<').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('dummy').setLabel(`1/${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId(`slide_${targetId}_1_next`).setLabel('>>').setStyle(ButtonStyle.Secondary)
        );
        components.push(row);
    }

    let messageSent = null;

    // SỬA TRỰC TIẾP TIN NHẮN CŨ NẾU CÓ MESSAGE_ID TRONG FILE JSON
    if (userData.messageId) {
        const existingMsg = await profileChannel.messages.fetch(userData.messageId).catch(() => null);
        if (existingMsg) {
            messageSent = await existingMsg.edit({ embeds: [profileEmbed], components }).catch(() => null);
        }
    }

    // Nếu không sửa được hoặc chưa có tin cũ, thì gửi tin mới tinh
    if (!messageSent) {
        messageSent = await profileChannel.send({ embeds: [profileEmbed], components }).catch(() => null);
    }

    if (messageSent) {
        data[targetId].messageId = messageSent.id;
        data[targetId].hidden = false;
        saveData(data);
        return true;
    }
    return false;
}

// Hàm dọn dẹp và xóa triệt để hồ sơ (Xóa file JSON & Xóa luôn tin nhắn trên Sảnh Danh Vọng)
async function deleteProfileCard(guild, targetId) {
    const data = loadData();
    const userData = data[targetId];
    if (userData && userData.messageId) {
        const profileChannel = await guild.channels.fetch(process.env.PROFILE_CHANNEL_ID).catch(() => null);
        if (profileChannel) {
            const oldMsg = await profileChannel.messages.fetch(userData.messageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => null);
        }
    }
    delete data[targetId];
    saveData(data);
}

// Bật Modal sửa chữ (Điền sẵn toàn bộ data cũ)
async function openEditProfileModal(interaction, targetId) {
    const data = loadData();
    const existing = data[targetId];

    if (!existing) {
        return interaction.reply({ content: `❌ Thành viên <@${targetId}> chưa tạo hồ sơ cá nhân nên không thể sửa!`, flags: ['Ephemeral'] });
    }

    const modal = new ModalBuilder()
        .setCustomId(`edit_profile_modal_${targetId}`)
        .setTitle(`Sửa Hồ Sơ: ${existing.name || "Thành viên"}`);

    const nameInput = new TextInputBuilder()
        .setCustomId("modal_ten").setLabel("Họ và tên").setStyle(TextInputStyle.Short).setValue(existing.name || "").setRequired(true);

    const sloganInput = new TextInputBuilder()
        .setCustomId("modal_slogan").setLabel("Câu nói tâm đắc / Slogan cá nhân").setStyle(TextInputStyle.Short).setValue(existing.slogan || "").setRequired(true);

    const locationInput = new TextInputBuilder()
        .setCustomId("modal_noio").setLabel("Nơi ở hiện tại").setStyle(TextInputStyle.Short).setValue(existing.location || "").setRequired(true);

    const hobbiesInput = new TextInputBuilder()
        .setCustomId("modal_sothich").setLabel("Sở thích").setStyle(TextInputStyle.Paragraph).setValue(existing.hobbies || "").setRequired(true);

    const bdayInput = new TextInputBuilder()
        .setCustomId("modal_ngaysinh").setLabel("Ngày sinh (Vd: 15/06 hoặc 15/06/2004)").setStyle(TextInputStyle.Short)
        .setValue(existing.day && existing.month ? `${existing.day}/${existing.month}${existing.year ? `/${existing.year}` : ""}` : "").setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(sloganInput),
        new ActionRowBuilder().addComponents(locationInput),
        new ActionRowBuilder().addComponents(hobbiesInput),
        new ActionRowBuilder().addComponents(bdayInput)
    );

    await interaction.showModal(modal);
}

// Lọc và hiển thị danh sách Menu thả xuống chứa các User ĐÃ ĐĂNG KÝ hồ sơ
async function createRegisteredUsersSelectMenu(customId, placeholder) {
    const data = loadData();
    const userIds = Object.keys(data);

    if (userIds.length === 0) return null;

    const options = [];
    for (const id of userIds) {
        const userData = data[id];
        const userObj = client.users.cache.get(id) || await client.users.fetch(id).catch(() => null);
        const discordTag = userObj ? ` (@${userObj.username})` : "";
        
        options.push({
            label: `${userData.name}${discordTag}`.slice(0, 100),
            value: id,
            description: `Slogan: ${userData.slogan || "Chưa có"}`.slice(0, 100)
        });
    }

    return new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .addOptions(options.slice(0, 25));
}

// Trình quản lý ảnh trực quan (Hiển thị chi tiết ảnh cũ để chọn sửa)
async function openPhotoEditorDashboard(interaction, targetId) {
    const data = loadData();
    const existing = data[targetId];

    if (!existing) {
        return interaction.reply({ content: `❌ Thành viên <@${targetId}> chưa tạo hồ sơ cá nhân nên không thể sửa ảnh!`, flags: ['Ephemeral'] });
    }

    const imageUrls = existing.images || (existing.image ? [existing.image] : []) || [];
    
    const dashboardEmbed = new EmbedBuilder()
        .setColor("#F1C40F")
        .setTitle(`📸 Trình chỉnh ảnh: ${existing.name}`)
        .setDescription("Dưới đây là các ảnh hiện có trong hồ sơ của bạn. Hãy bấm vào nút bên dưới để cập nhật riêng từng ảnh:")
        .setTimestamp();

    if (imageUrls.length > 0) {
        dashboardEmbed.setThumbnail(imageUrls[0]);
        let imgListText = "";
        imageUrls.forEach((url, i) => {
            imgListText += `🖼️ **Ảnh thứ ${i + 1}:** [Xem ảnh cũ](${url})\n`;
        });
        dashboardEmbed.addFields({ name: "Bộ sưu tập ảnh hiện tại:", value: imgListText });
    } else {
        dashboardEmbed.addFields({ name: "Bộ sưu tập ảnh hiện tại:", value: "Chưa có ảnh nào." });
    }

    const rows = [];
    const buttonRow = new ActionRowBuilder();

    for (let i = 0; i < imageUrls.length; i++) {
        buttonRow.addComponents(
            new ButtonBuilder().setCustomId(`changephoto_${targetId}_${i}`).setLabel(`Sửa ảnh ${i + 1}`).setStyle(ButtonStyle.Primary)
        );
    }

    if (imageUrls.length < 4) {
        buttonRow.addComponents(
            new ButtonBuilder().setCustomId(`changephoto_${targetId}_${imageUrls.length}`).setLabel(`Thêm ảnh phụ (${imageUrls.length + 1})`).setStyle(ButtonStyle.Success)
        );
    }

    rows.push(buttonRow);

    if (interaction.isStringSelectMenu()) {
        await interaction.update({ embeds: [dashboardEmbed], components: rows, content: null });
    } else {
        await interaction.reply({ embeds: [dashboardEmbed], components: rows, flags: ['Ephemeral'] });
    }
}

// ==========================================
// KHỐI SỰ KIỆY TƯƠNG TÁC CHÍNH (CONSOLIDATED)
// ==========================================
client.on("interactionCreate", async interaction => {
    
    // ------------------------------------------
    // 1. XỬ LÝ SLASH COMMANDS (LỆNH GHÉP)
    // ------------------------------------------
    if (interaction.isChatInputCommand()) {
        const { commandName, channelId, guild, member, user } = interaction;

        // Chặn kênh setup ngoại trừ các lệnh sticky và lệnh tra cứu đơn lẻ /birthday
        if (["birthdays", "taoprofile", "taohoprofile", "suaprofile", "suaanh", "xoaprofile"].includes(commandName) && channelId !== process.env.SETUP_CHANNEL_ID) {
            return interaction.reply({ content: `❌ Lệnh này chỉ dùng được ở kênh <#${process.env.SETUP_CHANNEL_ID}>!`, flags: ['Ephemeral'] });
        }

        // Quyền Hoàng Đế hoặc ManageMessages được coi là Admin
        const isAdmin = member.permissions.has(PermissionFlagsBits.ManageMessages) || member.roles.cache.has(HOANG_DE_ROLE);

        // --- LỆNH /BIRTHDAY (TRA CỨU ĐƠN LẺ KHÔNG GIỚI HẠN KÊNH) ---
        if (commandName === "birthday") {
            const data = loadData();
            // Lọc ra danh sách user đã lưu sinh nhật
            const userIds = Object.keys(data).filter(id => data[id].day && data[id].month);
            if (userIds.length === 0) {
                return interaction.reply({ content: "❌ Hiện tại chưa có thành viên nào cập nhật hồ sơ sinh nhật cả!", flags: ['Ephemeral'] });
            }

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId("select_birthday_lookup")
                .setPlaceholder("Chọn thành viên để xem ngày sinh nhật...");

            const options = [];
            for (const id of userIds) {
                const userData = data[id];
                const userObj = client.users.cache.get(id) || await client.users.fetch(id).catch(() => null);
                const discordTag = userObj ? ` (@${userObj.username})` : "";
                
                options.push({
                    label: `${userData.name}${discordTag}`.slice(0, 100),
                    value: id,
                    description: `Discord ID: ${id}` // Thay thế dòng hiển thị ngày sinh cũ bằng ID Discord
                });
            }

            selectMenu.addOptions(options.slice(0, 25)); // Dropdown tối đa 25 tùy chọn

            const row = new ActionRowBuilder().addComponents(selectMenu);
            return await interaction.reply({ content: "🎂 **Chọn thành viên bạn muốn tra cứu ngày sinh nhật:**", components: [row] });
        }

        // --- LỆNH /SUAPROFILE ---
        if (commandName === "suaprofile") {
            if (isAdmin) {
                const selectMenu = await createRegisteredUsersSelectMenu("select_edit_profile", "Chọn thành viên cần sửa hồ sơ...");
                if (!selectMenu) return interaction.reply({ content: "❌ Chưa có thành viên nào đăng ký hồ sơ cả!", flags: ['Ephemeral'] });
                
                const row = new ActionRowBuilder().addComponents(selectMenu);
                return await interaction.reply({ content: "⚙️ **Chọn thành viên bạn muốn chỉnh sửa hồ sơ:**", components: [row], flags: ['Ephemeral'] });
            } else {
                if (!isSelfAllowed(member)) return interaction.reply({ content: "❌ Bạn không có quyền chỉnh sửa hồ sơ!", flags: ['Ephemeral'] });
                const data = loadData();
                if (!data[user.id]) return interaction.reply({ content: "❌ Bạn chưa có hồ sơ! Hãy tạo bằng lệnh `/taoprofile`.", flags: ['Ephemeral'] });
                return await openEditProfileModal(interaction, user.id);
            }
        }

        // --- LỆNH /SUAANH ---
        if (commandName === "suaanh") {
            if (isAdmin) {
                const selectMenu = await createRegisteredUsersSelectMenu("select_edit_photos", "Chọn thành viên để chỉnh sửa ảnh...");
                if (!selectMenu) return interaction.reply({ content: "❌ Chưa có ai khởi tạo hồ sơ để chỉnh sửa ảnh!", flags: ['Ephemeral'] });

                const row = new ActionRowBuilder().addComponents(selectMenu);
                return await interaction.reply({ content: "📸 **Chọn thành viên bạn muốn thay đổi ảnh hồ sơ:**", components: [row], flags: ['Ephemeral'] });
            } else {
                if (!isSelfAllowed(member)) return interaction.reply({ content: "❌ Bạn không có quyền sửa ảnh hồ sơ cá nhân!", flags: ['Ephemeral'] });
                const data = loadData();
                if (!data[user.id]) return interaction.reply({ content: "❌ Bạn chưa có hồ sơ cá nhân! Hãy dùng `/taoprofile` trước.", flags: ['Ephemeral'] });
                return await openPhotoEditorDashboard(interaction, user.id);
            }
        }

        // --- LỆNH /XOAPROFILE ---
        if (commandName === "xoaprofile") {
            if (isAdmin) {
                const selectMenu = await createRegisteredUsersSelectMenu("select_delete_profile", "Chọn thành viên cần xóa hồ sơ vĩnh viễn...");
                if (!selectMenu) return interaction.reply({ content: "❌ Không thể xóa vì danh sách hiện đang trống!", flags: ['Ephemeral'] });

                const row = new ActionRowBuilder().addComponents(selectMenu);
                return await interaction.reply({ content: "🚨 **Chọn thành viên bạn muốn xóa hồ sơ:**", components: [row], flags: ['Ephemeral'] });
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

        // --- LỆNH /STICKY ---
        if (commandName === "sticky") {
            const modal = new ModalBuilder().setCustomId("sticky_modal").setTitle("Cấu hình Tin nhắn Ghim Kênh");
            const noidungInput = new TextInputBuilder()
                .setCustomId("modal_sticky_content")
                .setLabel("Nhập nội dung ghim (Xuống dòng tự do)")
                .setStyle(TextInputStyle.Paragraph) 
                .setPlaceholder("📌 /addacc thêm acc vào kho\n📥 /panel mượn acc...")
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(noidungInput));
            return await interaction.showModal(modal);
        }

        // --- LỆNH /UNSTICKY ---
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

        // --- LỆNH /BIRTHDAYS ---
        if (commandName === "birthdays") {
            await interaction.deferReply();
            const data = loadData();
            let listText = ""; let index = 1;
            for (const userId in data) {
                const userData = data[userId];
                if (userData.day && userData.month) {
                    const daysLeft = getDaysUntilBirthday(userData.day, userData.month);
                    const countdownText = daysLeft === 0 ? "🎂 Hôm nay luôn!" : `Còn **${daysLeft} ngày**`;
                    listText += `#${index} 👤 **${userData.name}**\n🎂 ${userData.day}/${userData.month}${userData.year ? `/${userData.year}` : ""}\n⏳ ${countdownText}\n\n`;
                    index++;
                }
            }
            const listEmbed = new EmbedBuilder().setColor("#FFB6C1").setTitle("🎂 DANH SÁCH SINH NHẬT THÀNH VIÊN 🎂").setDescription(listText || "Chưa có thành viên nào cập nhật hồ sơ sinh nhật.").setTimestamp();
            return await interaction.editReply({ embeds: [listEmbed] });
        }

        // --- LỆNH /TAOPROFILE ---
        if (commandName === "taoprofile") {
            if (!isSelfAllowed(member)) return interaction.reply({ content: "❌ Bạn không có quyền sử dụng lệnh này!", flags: ['Ephemeral'] });
            
            const data = loadData();
            if (data[user.id]) {
                return interaction.reply({ content: "❌ Bạn đã có hồ sơ cá nhân trên hệ thống! Vui lòng sử dụng lệnh `/suaprofile` để chỉnh sửa hoặc `/xoaprofile` để xóa hồ sơ cũ trước khi tạo mới.", flags: ['Ephemeral'] });
            }

            const imageUrls = [
                interaction.options.getAttachment("anh1")?.url,
                interaction.options.getAttachment("anh2")?.url,
                interaction.options.getAttachment("anh3")?.url,
                interaction.options.getAttachment("anh4")?.url
            ].filter(url => url !== undefined);

            tempImages.set(user.id, imageUrls);

            const modal = new ModalBuilder().setCustomId(`profile_modal_${user.id}`).setTitle("Thông Tin Hồ Sơ Cá Nhân");
            const nameInput = new TextInputBuilder().setCustomId("modal_ten").setLabel("Họ và tên").setStyle(TextInputStyle.Short).setRequired(true);
            const sloganInput = new TextInputBuilder().setCustomId("modal_slogan").setLabel("Câu nói tâm đắc / Slogan cá nhân").setStyle(TextInputStyle.Short).setRequired(true);
            const locationInput = new TextInputBuilder().setCustomId("modal_noio").setLabel("Nơi ở hiện tại").setStyle(TextInputStyle.Short).setRequired(true);
            const hobbiesInput = new TextInputBuilder().setCustomId("modal_sothich").setLabel("Sở thích").setStyle(TextInputStyle.Paragraph).setRequired(true);
            const bdayInput = new TextInputBuilder().setCustomId("modal_ngaysinh").setLabel("Ngày sinh (Vd: 15/06 hoặc 15/06/2004)").setStyle(TextInputStyle.Short).setRequired(false);
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(nameInput),
                new ActionRowBuilder().addComponents(sloganInput),
                new ActionRowBuilder().addComponents(locationInput),
                new ActionRowBuilder().addComponents(hobbiesInput),
                new ActionRowBuilder().addComponents(bdayInput)
            );
            return await interaction.showModal(modal);
        }

        // --- LỆNH /TAOHOPROFILE (ADMIN TẠO HỘ) ---
        if (commandName === "taohoprofile") {
            if (!isAdmin) return interaction.reply({ content: "❌ Chỉ Quản trị viên mới được dùng lệnh tạo hộ này!", flags: ['Ephemeral'] });
            
            const targetUser = interaction.options.getUser("user");
            const data = loadData();
            if (data[targetUser.id]) {
                return interaction.reply({ content: `❌ Thành viên <@${targetUser.id}> đã có hồ sơ cá nhân trên hệ thống! Bạn không thể tạo hộ thêm nữa.`, flags: ['Ephemeral'] });
            }
            
            const imageUrls = [
                interaction.options.getAttachment("anh1")?.url,
                interaction.options.getAttachment("anh2")?.url,
                interaction.options.getAttachment("anh3")?.url,
                interaction.options.getAttachment("anh4")?.url
            ].filter(url => url !== undefined);

            // Lưu ảnh tạm thời gán thẳng với ID người được tạo hộ
            tempImages.set(targetUser.id, imageUrls);

            const modal = new ModalBuilder().setCustomId(`profile_modal_${targetUser.id}`).setTitle(`Tạo hộ hồ sơ: ${targetUser.username}`);
            const nameInput = new TextInputBuilder().setCustomId("modal_ten").setLabel("Họ và tên").setStyle(TextInputStyle.Short).setRequired(true);
            const sloganInput = new TextInputBuilder().setCustomId("modal_slogan").setLabel("Câu nói tâm đắc / Slogan cá nhân").setStyle(TextInputStyle.Short).setRequired(true);
            const locationInput = new TextInputBuilder().setCustomId("modal_noio").setLabel("Nơi ở hiện tại").setStyle(TextInputStyle.Short).setRequired(true);
            const hobbiesInput = new TextInputBuilder().setCustomId("modal_sothich").setLabel("Sở thích").setStyle(TextInputStyle.Paragraph).setRequired(true);
            const bdayInput = new TextInputBuilder().setCustomId("modal_ngaysinh").setLabel("Ngày sinh (Vd: 15/06 hoặc 15/06/2004)").setStyle(TextInputStyle.Short).setRequired(false);
            
            modal.addComponents(
                new ActionRowBuilder().addComponents(nameInput),
                new ActionRowBuilder().addComponents(sloganInput),
                new ActionRowBuilder().addComponents(locationInput),
                new ActionRowBuilder().addComponents(hobbiesInput),
                new ActionRowBuilder().addComponents(bdayInput)
            );
            return await interaction.showModal(modal);
        }
    }

    // ------------------------------------------
    // 2. XỬ LÝ STRING SELECT MENUS (DÀNH CHO ADMIN & USER)
    // ------------------------------------------
    if (interaction.isStringSelectMenu()) {
        const { customId, values } = interaction;
        const targetId = values[0];

        // --- XỬ LÝ MENU TRA CỨU SINH NHẬT ĐƠN LẺ (/BIRTHDAY) ---
        if (customId === "select_birthday_lookup") {
            const data = loadData();
            const userData = data[targetId];

            if (!userData) {
                return interaction.reply({ content: "❌ Hồ sơ sinh nhật của thành viên này không tồn tại!", flags: ['Ephemeral'] });
            }

            const daysLeft = getDaysUntilBirthday(userData.day, userData.month);
            const countdownText = daysLeft === 0 ? "🎂 Hôm nay luôn!" : `Còn **${daysLeft} ngày**`;

            const userObj = client.users.cache.get(targetId) || await client.users.fetch(targetId).catch(() => null);

            const lookupEmbed = new EmbedBuilder()
                .setColor("#FFB6C1")
                .setTitle("🎂 THÔNG TIN SINH NHẬT THÀNH VIÊN 🎂")
                .setDescription(`👤 **${userData.name}** (<@${targetId}>)\n🎂 ${userData.day}/${userData.month}${userData.year ? `/${userData.year}` : ""}\n⏳ ${countdownText}`)
                .setTimestamp();

            if (userObj) {
                lookupEmbed.setThumbnail(userObj.displayAvatarURL({ dynamic: true }));
            }

            // Cập nhật tin nhắn để xóa dropdown menu đi và thay thế bằng Embed thông tin sinh nhật gọn gàng
            return await interaction.update({ content: null, embeds: [lookupEmbed], components: [] });
        }

        if (customId === "select_edit_profile") {
            return await openEditProfileModal(interaction, targetId);
        }
        
        if (customId === "select_edit_photos") {
            return await openPhotoEditorDashboard(interaction, targetId);
        }

        if (customId === "select_delete_profile") {
            const data = loadData();
            if (!data[targetId]) return interaction.reply({ content: "❌ Lỗi: Hồ sơ cá nhân không tồn tại.", flags: ['Ephemeral'] });

            const targetName = data[targetId].name || targetId;
            await deleteProfileCard(interaction.guild, targetId);

            return await interaction.update({ content: `✅ Đã xóa thành công hồ sơ cá nhân của **${targetName}** (<@${targetId}>) khỏi danh sách và Sảnh Danh Vọng!`, components: [] });
        }
    }

    // ------------------------------------------
    // 3. XỬ LÝ MODALS SUBMIT FORM
    // ------------------------------------------
    if (interaction.isModalSubmit()) {
        const { customId, guild, fields } = interaction;

        // --- SUBMIT MODAL TẠO PROFILE (CẢ TỰ TẠO & ĐƯỢC TẠO HỘ) ---
        if (customId.startsWith("profile_modal_")) {
            await interaction.deferReply({ flags: ['Ephemeral'] });
            
            // Lấy ID của mục tiêu từ Suffix CustomID
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
                if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12 || (year && (year < 1900 || year > 2026))) {
                    return interaction.editReply({ content: "❌ Định dạng ngày sinh hoặc năm sinh không hợp lệ!" });
                }
            }

            const imageUrls = tempImages.get(targetId) || [];
            if (imageUrls.length === 0) return interaction.editReply({ content: "❌ Lỗi: Không tìm thấy tệp ảnh tạm thời của hồ sơ." });

            const data = loadData();
            
            // Khởi tạo Object cấu trúc có messageId để định danh sửa tin nhắn về sau
            data[targetId] = { 
                name, slogan, location, hobbies, 
                images: imageUrls, 
                day, month, year, 
                messageId: null, 
                hidden: false 
            };
            saveData(data);
            tempImages.delete(targetId);

            // Gửi hoặc cập nhật thẻ Profile lên Sảnh Danh Vọng
            const wasShown = await sendProfileCardToHall(guild, targetId, data[targetId], "Sảnh danh vọng 🏆");
            if (wasShown) {
                return await interaction.editReply({ content: `✅ Đã lưu cấu hình và hiển thị hồ sơ cá nhân của <@${targetId}> lên Sảnh Danh Vọng!` });
            } else {
                return await interaction.editReply({ content: `⚠️ Đã lưu cấu hình của <@${targetId}> thành công! Tuy nhiên, hồ sơ này đang tạm ẩn trên Sảnh Danh Vọng do tài khoản chưa có Role Thành viên thường trực hoặc Nhà đầu tư.` });
            }
        }

        // --- SUBMIT MODAL SỬA PROFILE ---
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
                if (isNaN(day) || isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12 || (year && (year < 1900 || year > 2026))) {
                    return interaction.editReply({ content: "❌ Định dạng ngày tháng sinh không hợp lệ!" });
                }
            }

            const data = loadData();
            const existing = data[targetId] || {};
            let imageUrls = existing.images || (existing.image ? [existing.image] : []) || [];

            if (imageUrls.length === 0) {
                return interaction.editReply({ content: "❌ Lỗi: Không tìm thấy ảnh cũ trong tệp hồ sơ cá nhân để hiển thị." });
            }

            // Sửa nhưng giữ nguyên vẹn messageId cũ để bot chỉnh sửa tiếp
            data[targetId] = { 
                name, slogan, location, hobbies, 
                images: imageUrls, 
                day, month, year, 
                messageId: existing.messageId || null, 
                hidden: existing.hidden || false 
            };
            saveData(data);

            const wasShown = await sendProfileCardToHall(guild, targetId, data[targetId], "Sảnh danh vọng 🏆 (Đã cập nhật thông tin)");
            if (wasShown) {
                return await interaction.editReply({ content: `✅ Đã lưu và cập nhật thông tin tại Sảnh Danh Vọng thành công!` });
            } else {
                return await interaction.editReply({ content: `⚠️ Đã lưu thông tin chữ thành công! Tuy nhiên, hồ sơ này đang tạm ẩn trên Sảnh Danh Vọng do tài khoản chưa có Role Thành viên thường trực hoặc Nhà đầu tư.` });
            }
        }

        // --- SUBMIT MODAL TIN NHẮN GHIM ---
        if (customId === "sticky_modal") {
            await interaction.deferReply({ flags: ['Ephemeral'] });
            let text = fields.getTextInputValue("modal_sticky_content");
            text = text.replace(/\\n/g, '\n').replace(/\|/g, '\n');

            const stickyData = loadStickyData();
            
            if (stickyData[interaction.channel.id]?.lastMessageId) {
                const oldMsg = await interaction.channel.messages.fetch(stickyData[interaction.channel.id].lastMessageId).catch(() => null);
                if (oldMsg) await oldMsg.delete().catch(() => null);
            }

            const stickyEmbed = new EmbedBuilder().setColor("#F1C40F").setTitle("📌 Tin nhắn ghim:").setDescription(text).setTimestamp();
            const newMsg = await interaction.channel.send({ embeds: [stickyEmbed] });

            stickyData[interaction.channel.id] = { text: text, lastMessageId: newMsg.id };
            saveStickyData(stickyData);

            return await interaction.editReply({ content: "✅ Đã tạo và ghim tin nhắn dính chuẩn xuống dòng thành công cho kênh này!" });
        }
    }

    // ------------------------------------------
    // 4. XỬ LÝ BUTTON INTERACTIONS (NÚT BẤM)
    // ------------------------------------------
    if (interaction.isButton()) {
        const { customId, user } = interaction;

        // --- PHÂN TRANG ALBUM ẢNH (SLIDE) ---
        if (customId.startsWith("slide_")) {
            const parts = customId.split("_");
            const profileUserId = parts[1];
            const targetIndex = parseInt(parts[2], 10);

            const data = loadData();
            const userData = data[profileUserId];
            
            const imageUrls = userData ? (userData.images || (userData.image ? [userData.image] : []) || []) : [];
            if (imageUrls.length === 0) return interaction.reply({ content: "❌ Không có dữ liệu ảnh phân trang!", flags: ['Ephemeral'] });

            const total = imageUrls.length;
            const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
            newEmbed.setImage(imageUrls[targetIndex]);

            const prevIndex = targetIndex === 0 ? total - 1 : targetIndex - 1;
            const nextIndex = targetIndex === total - 1 ? 0 : targetIndex + 1;

            const newRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`slide_${profileUserId}_${prevIndex}_prev`).setLabel('<<').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('dummy').setLabel(`${targetIndex + 1}/${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId(`slide_${profileUserId}_${nextIndex}_next`).setLabel('>>').setStyle(ButtonStyle.Secondary)
            );

            return await interaction.update({ embeds: [newEmbed], components: [newRow] });
        }

        // --- THAY ĐỔI ẢNH TRỰC QUAN (NÚT BẤM CHỌN SỬA ẢNH CHI TIẾT) ---
        if (customId.startsWith("changephoto_")) {
            const parts = customId.split("_");
            const targetId = parts[1];
            const imgIndex = parseInt(parts[2], 10);

            await interaction.update({ content: `📸 **[ĐANG CHỜ ẢNH]** Vui lòng kéo thả hoặc tải lên **1 ảnh mới** vào kênh này trong vòng 60 giây để ghi đè vào **Vị trí ảnh thứ ${imgIndex + 1}**...`, embeds: [], components: [] });

            const filter = m => m.author.id === user.id && m.attachments.size > 0;
            const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 60000 });

            collector.on("collect", async m => {
                const attachment = m.attachments.first();
                const newUrl = attachment.url;

                const data = loadData();
                const existing = data[targetId];

                if (existing) {
                    if (!existing.images) {
                        existing.images = existing.image ? [existing.image] : [];
                    }
                    existing.images[imgIndex] = newUrl;
                    existing.images = existing.images.filter(x => x != null);
                    existing.image = existing.images[0] || null; // fallback compatibility

                    data[targetId] = existing;
                    saveData(data);

                    // 🛠️ THAY ĐỔI LỚN SỬA LỖI CDN DISCORD: KHÔNG XÓA TIN NHẮN M ĐỂ TRÁNH LÀM LINK CDN BỊ VÔ HIỆU HÓA!
                    // Thay vì xóa, chúng ta thả biểu tượng cảm xúc cảm ơn và giữ nguyên ảnh trong kênh chat setup.
                    await m.react("✅").catch(() => null);

                    const wasShown = await sendProfileCardToHall(interaction.guild, targetId, existing, "Sảnh danh vọng 🏆 (Đã cập nhật ảnh)");
                    if (wasShown) {
                        await interaction.followUp({ content: `✅ Cập nhật bộ sưu tập ảnh thành công tại vị trí số **${imgIndex + 1}**!`, flags: ['Ephemeral'] });
                    } else {
                        await interaction.followUp({ content: `⚠️ Cập nhật ảnh thành công! Tuy nhiên, hồ sơ này đang tạm ẩn trên Sảnh Danh Vọng do tài khoản chưa có Role Thành viên thường trực hoặc Nhà đầu tư.`, flags: ['Ephemeral'] });
                    }
                }
            });

            collector.on("end", (collected, reason) => {
                if (reason === "time") {
                    interaction.followUp({ content: "⏳ Thao tác chỉnh sửa ảnh đã bị hủy do hết thời gian chờ 60 giây.", flags: ['Ephemeral'] });
                }
            });
            return;
        }

        // --- XÁC NHẬN XÓA PROFILE CỦA USER ---
        if (customId.startsWith("confirm_delete_")) {
            const targetId = customId.replace("confirm_delete_", "");
            await deleteProfileCard(interaction.guild, targetId);
            return await interaction.update({ content: "✅ Đã dọn dẹp và xóa hồ sơ cá nhân của bạn thành công khỏi sảnh danh vọng!", components: [] });
        }

        if (customId === "cancel_delete") {
            return await interaction.update({ content: "❌ Đã hủy thao tác xóa hồ sơ cá nhân.", components: [] });
        }
    }
});

client.login(process.env.TOKEN);
