const { EmbedBuilder } = require("discord.js");
const { handleAntiRaid } = require("../utils/antiraid");
const { loadStickyData, saveStickyData } = require("../utils/db");

const HOANG_DE_ROLE = "1206317832674086944";
const processingChannels = new Set();

module.exports = {
    name: "messageCreate",
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        // Anti-Raid Spam Protection
        const isSpamIntercepted = await handleAntiRaid(message, client, HOANG_DE_ROLE);
        if (isSpamIntercepted === true) return;

        // Sticky Message Logic
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
    }
};