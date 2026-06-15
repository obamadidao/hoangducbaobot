require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const cron = require("node-cron");
const fs = require("fs");

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const FILE = "./birthdays.json";

// ======================
// HÀM LƯU / ĐỌC DỮ LIỆU
// ======================
function loadData() {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, "utf-8"));
}

function saveData(data) {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 4));
}

// ======================
// HÀM ĐẾM NGƯỢC NGÀY SINH
// ======================
function getCountdown(day, month) {
    const now = new Date();
    const year = now.getFullYear();
    let next = new Date(year, month - 1, day);

    if (next < now) {
        next = new Date(year + 1, month - 1, day);
    }

    const diff = next - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// ======================
// BOT SẴN SÀNG (Đã sửa thành clientReady)
// ======================
client.once("clientReady", () => {
    console.log(`✅ Bot online: ${client.user.tag}`);

    // Lên lịch chúc sinh nhật tự động vào 00:00 mỗi ngày
    cron.schedule("0 0 * * *", async () => {
        const data = loadData();
        const now = new Date();
        const day = now.getDate();
        const month = now.getMonth() + 1;

        for (const userId in data) {
            const userData = data[userId];

            if (userData.day === day && userData.month === month) {
                try {
                    const birthdayChannel = await client.channels.fetch(process.env.BIRTHDAY_CHANNEL_ID);
                    if (birthdayChannel) {
                        const bdayEmbed = new EmbedBuilder()
                            .setColor("#FFB6C1") // Đã sửa màu Pink thành Hex
                            .setTitle(`🎉 CHÚC MỪNG SINH NHẬT 🎉`)
                            .setDescription(`Hôm nay là sinh nhật của <@${userId}>! Chúc bạn tuổi mới thật nhiều niềm vui và hạnh phúc! 🎂🎁🎈`)
                            .setImage(userData.image)
                            .setTimestamp();

                        birthdayChannel.send({ content: `<@${userId}>`, embeds: [bdayEmbed] });
                    }
                } catch (err) {
                    console.error("Lỗi gửi tin sinh nhật:", err);
                }
            }
        }
    });
});

// ======================
// XỬ LÝ LỆNH TỪ NGƯỜI DÙNG
// ======================
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const data = loadData();

    // 1. LỆNH TẠO PROFILE
    if (interaction.commandName === "taoprofile") {
        
        // Báo cho Discord biết: "Đợi tôi xử lý một xíu nhé" (Chống lỗi không phản hồi)
        await interaction.deferReply({ ephemeral: true });

        // Kiểm tra Kênh
        if (interaction.channelId !== process.env.SETUP_CHANNEL_ID) {
            return interaction.editReply({ content: `❌ Lệnh này chỉ dùng được ở kênh <#${process.env.SETUP_CHANNEL_ID}>!` });
        }

        // Kiểm tra Role (Đã vá lỗi sập bot khi quên ID)
        const roleEnv = process.env.ROLE_IDS || ""; 
        const allowedRoles = roleEnv.split(',');
        const hasPermission = allowedRoles.some(roleId => interaction.member.roles.cache.has(roleId.trim()));
        
        if (!hasPermission) {
            return interaction.editReply({ content: "❌ Bạn không có quyền sử dụng lệnh này!" });
        }

        // Lấy dữ liệu người dùng nhập
        const name = interaction.options.getString("ten");
        const day = interaction.options.getInteger("ngay");
        const month = interaction.options.getInteger("thang");
        const year = interaction.options.getInteger("nam");
        const location = interaction.options.getString("noio");
        const hobbies = interaction.options.getString("sothich");
        const image = interaction.options.getAttachment("anh");

        // Lưu vào file JSON
        data[interaction.user.id] = { name, day, month, year, location, hobbies, image: image.url };
        saveData(data);

        // Tạo khung Profile đẹp mắt
        const profileEmbed = new EmbedBuilder()
            .setColor("#2F3136")
            .setAuthor({ name: `☁️ ${name} ☁️`, iconURL: interaction.user.displayAvatarURL() })
            .setDescription(`🍧 *Nơi ở:* ${location}\n🎮 *Sở thích/Game:* ${hobbies}\n🎂 *Ngày sinh:* ${day}/${month}/${year}`)
            .setImage(image.url) 
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true })) 
            .setFooter({ text: "Hồ sơ thành viên" })
            .setTimestamp();

        // Gửi sang KÊNH PROFILE
        try {
            const profileChannel = await interaction.guild.channels.fetch(process.env.PROFILE_CHANNEL_ID);
            await profileChannel.send({ embeds: [profileEmbed] });
            
            // Báo thành công (Dùng editReply vì đã deferReply ở trên)
            await interaction.editReply({ content: `✅ Đã tạo Profile và lưu ngày sinh thành công! Qua kênh <#${process.env.PROFILE_CHANNEL_ID}> để xem nhé.` });
        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: "❌ Lỗi: Bot không tìm thấy Kênh Profile, hãy kiểm tra lại ID trong file .env" });
        }
    }

    // 2. LỆNH XEM DANH SÁCH SINH NHẬT
    if (interaction.commandName === "birthdays") {
        await interaction.deferReply(); 

        if (Object.keys(data).length === 0) {
            return interaction.editReply("❌ Chưa có thành viên nào tạo Profile.");
        }

        let desc = "";
        let i = 1;

        for (const userId in data) {
            const { day, month, year } = data[userId];
            const left = getCountdown(day, month);

            desc += `**#${i}** 👤 <@${userId}>\n`;
            desc += `🎂 ${day}/${month}/${year}\n`;
            desc += `⏳ Còn **${left} ngày**\n\n`;
            i++;
        }

        const embed = new EmbedBuilder()
            .setTitle("🎂 DANH SÁCH SINH NHẬT")
            .setColor("#FFB6C1") // Đã sửa màu Pink thành Hex
            .setDescription(desc)
            .setFooter({ text: "Hệ thống tự động" });

        return interaction.editReply({ embeds: [embed] });
    }
});

client.login(process.env.TOKEN);