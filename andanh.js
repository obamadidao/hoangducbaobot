const { SlashCommandBuilder } = require("discord.js");

module.exports = {
    // 1. Định nghĩa Slash Command /andanh
    data: new SlashCommandBuilder()
        .setName("andanh")
        .setDescription("Gửi tin nhắn ẩn danh bảo mật vào kênh chat hiện tại (Ai cũng dùng được)")
        .addStringOption(option => 
            option.setName("noidung")
                .setDescription("Nhập nội dung tin nhắn ẩn danh (Có thể tag người dùng, role bằng cấu trúc chuẩn)")
                .setRequired(true)
        )
        .addAttachmentOption(option => 
            option.setName("anh")
                .setDescription("Tải lên ảnh đính kèm cho tin nhắn ẩn danh (Không bắt buộc)")
                .setRequired(false)
        ),

    // 2. Xử lý Logic khi thực thi lệnh ẩn danh
    async execute(interaction) {
        // Trả lời ẩn (Ephemeral) lập tức để tránh lỗi timeout của Discord và giấu danh tính người gửi
        await interaction.deferReply({ flags: ['Ephemeral'] });

        const content = interaction.options.getString("noidung");
        const attachment = interaction.options.getAttachment("anh");
        const channel = interaction.channel;

        if (!channel) {
            return await interaction.editReply({ content: "❌ Không thể xác định được kênh chat hiện tại để gửi tin nhắn!" });
        }

        // Tạo payload tin nhắn gửi đi dưới danh nghĩa của Bot
        const messagePayload = {
            content: `**[/andanh]:** ${content}`,
            files: []
        };

        // Nếu có đính kèm ảnh thì truyền ảnh vào file gửi đi
        if (attachment) {
            messagePayload.files.push({
                attachment: attachment.url,
                name: attachment.name
            });
        }

        try {
            // Gửi tin nhắn trực tiếp vào kênh chat thông qua tài khoản Bot
            await channel.send(messagePayload);

            // Báo cáo thành công riêng tư chỉ một mình người dùng nhìn thấy
            return await interaction.editReply({ content: "✅ Đã gửi tin nhắn ẩn danh thành công!" });
        } catch (error) {
            console.error("❌ Lỗi khi gửi tin nhắn ẩn danh:", error);
            return await interaction.editReply({ content: "❌ Không thể gửi tin nhắn ẩn danh. Vui lòng kiểm tra quyền hạn viết tin nhắn của Bot tại kênh này!" });
        }
    }
};