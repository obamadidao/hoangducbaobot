const cron = require("node-cron");
const { EmbedBuilder } = require("discord.js");
const { loadData, loadEventsData } = require("./db");
const { syncAllProfiles } = require("./profileManager");

const loiChucMacDinh = [
    "Ôi dời ơi **{name}**! ăn cứt đi nhá :zzzzz_tom_blushh: hehe",
    "Tới công chuyện luôn :tom_creepylaugh: ! Sinh nhật của **{name}**. Liên hệ ngay cho anh zai @fowf.ongggg278 gửi qr để nhận ngay 2 lít trong sinh nhật của mình nhé",
    "Happy Birthday! Chúc **{name}** có một ngày sinh nhật thật ấm áp bên gia đình, bạn bè và luôn giữ vững ngọn lửa đam mê với những sở thích của mình! 🩷✨",
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

function initCronJobs(client) {
    // Cron job đồng bộ lúc 1:00 AM UTC (8:00 AM VN)
    cron.schedule("0 1 * * *", async () => {
        const guilds = await client.guilds.fetch();
        for (const [guildId] of guilds) {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (guild) await syncAllProfiles(guild, client);
        }
    });

    // Cron job chúc mừng sinh nhật & nhắc sự kiện 00:00 hàng ngày
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
}

module.exports = { initCronJobs };
