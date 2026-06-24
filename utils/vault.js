const { ChannelType, PermissionFlagsBits } = require("discord.js");

/**
 * Tạo hoặc lấy kênh kho lưu trữ ảnh ẩn (Vault) để lưu ảnh vĩnh viễn trọn đời trên Discord
 * @param {import("discord.js").Guild} guild Đối tượng Server Discord đang hoạt động
 * @returns {Promise<import("discord.js").TextChannel|null>} Trả về kênh lưu trữ nếu tạo/lấy thành công
 */
async function getOrCreateImageVaultChannel(guild) {
    const vaultChannelName = "profile-images-storage";
    
    // Tìm kênh văn bản có tên trùng khớp trong danh sách cache của Server
    let channel = guild.channels.cache.find(c => c.name === vaultChannelName && c.type === ChannelType.GuildText);
    
    // Nếu chưa tồn tại kênh lưu trữ ẩn này, Bot sẽ tự động tạo mới
    if (!channel) {
        try {
            channel = await guild.channels.create({
                name: vaultChannelName,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionFlagsBits.ViewChannel] // Ẩn hoàn toàn kênh chat đối với mọi thành viên thông thường
                    },
                    {
                        id: guild.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel, 
                            PermissionFlagsBits.SendMessages, 
                            PermissionFlagsBits.AttachFiles
                        ] // Chỉ cho phép duy nhất tài khoản Bot xem, viết tin nhắn và gửi file đính kèm
                    }
                ],
                topic: "Kho lưu trữ hình ảnh hồ sơ cá nhân vĩnh viễn - Vui lòng không xóa kênh này!"
            });
            console.log(`📁 Đã tự động tạo thành công kênh ẩn bảo mật: #${vaultChannelName}`);
        } catch (err) {
            console.error("❌ Không thể khởi tạo tự động kênh lưu trữ ảnh ẩn:", err);
            return null;
        }
    }
    return channel;
}

/**
 * Tải danh sách tệp ảnh tạm thời lên Vault để lấy liên kết lưu trữ Discord vĩnh viễn
 * @param {import("discord.js").Guild} guild Đối tượng Server Discord đang hoạt động
 * @param {string} userId ID của người dùng Discord sở hữu bức ảnh
 * @param {string[]} tempUrls Mảng chứa các liên kết ảnh tạm thời của lệnh tương tác
 * @returns {Promise<string[]>} Mảng chứa các liên kết ảnh CDN vĩnh viễn mới
 */
async function saveToVault(guild, userId, tempUrls) {
    // Gọi hàm lấy hoặc tạo kênh ẩn
    const vaultChan = await getOrCreateImageVaultChannel(guild);
    if (!vaultChan) return [];

    const permanentUrls = [];
    
    // Quét qua từng đường link ảnh tạm thời để sao lưu vật lý
    for (const tempUrl of tempUrls) {
        // Bot tự động tải ảnh tạm về và gửi trực tiếp thành tin nhắn đính kèm trong kênh ẩn
        const msg = await vaultChan.send({ 
            content: `Backup ảnh hồ sơ vĩnh viễn cho thành viên <@${userId}> (ID: ${userId})`, 
            files: [tempUrl] 
        }).catch(() => null);

        // Lấy liên kết CDN Discord của file vừa tải lên thành công để đưa vào danh sách lưu vĩnh viễn
        if (msg && msg.attachments.first()) {
            permanentUrls.push(msg.attachments.first().url);
        }
    }
    return permanentUrls;
}

module.exports = {
    getOrCreateImageVaultChannel,
    saveToVault
};