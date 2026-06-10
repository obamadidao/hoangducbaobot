require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const cron = require("node-cron");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

// =====================
// LOAD DATA
// =====================
let birthdays = {};
if (fs.existsSync("birthdays.json")) {
  birthdays = JSON.parse(fs.readFileSync("birthdays.json"));
}

// =====================
// SAVE DATA
// =====================
function saveData() {
  fs.writeFileSync("birthdays.json", JSON.stringify(birthdays, null, 2));
}

// =====================
// BOT READY
// =====================
client.once("ready", () => {
  console.log(`Bot ready: ${client.user.tag}`);
});

// =====================
// SLASH COMMAND (NHẬP NGÀY SINH)
// =====================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "setbirthday") {
    const date = interaction.options.getString("date");

    // format: dd-mm
    const regex = /^\d{2}-\d{2}$/;
    if (!regex.test(date)) {
      return interaction.reply("❌ Nhập đúng format dd-mm (VD: 25-12)");
    }

    birthdays[interaction.user.id] = date;
    saveData();

    interaction.reply(`✅ Đã lưu ngày sinh: ${date}`);
  }
});

// =====================
// CHECK SINH NHẬT MỖI NGÀY
// =====================
cron.schedule("0 0 * * *", async () => {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, "0");
  const month = String(today.getMonth() + 1).padStart(2, "0");

  const todayStr = `${day}-${month}`;

  console.log("Checking birthdays:", todayStr);

  for (const userId in birthdays) {
    if (birthdays[userId] === todayStr) {
      const user = await client.users.fetch(userId);

      const channel = client.channels.cache.get(process.env.CHANNEL_ID);

      if (channel) {
        channel.send(`🎉 Chúc mừng sinh nhật <@${userId}>!`);
      }
    }
  }
});

// =====================
// CHECK NGÀY LỄ
// =====================
const holidays = {
  "14-02": "💖 Lễ tình nhân!",
  "08-03": "🌸 Quốc tế phụ nữ!",
  "20-10": "💐 Phụ nữ Việt Nam!",
  "01-01": "🎆 Năm mới!"
};

cron.schedule("5 0 * * *", async () => {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, "0");
  const month = String(today.getMonth() + 1).padStart(2, "0");

  const todayStr = `${day}-${month}`;

  if (holidays[todayStr]) {
    const channel = client.channels.cache.get(process.env.CHANNEL_ID);

    if (channel) {
      channel.send(`📢 Hôm nay là ${holidays[todayStr]}`);
    }
  }
});

// =====================
// LOGIN
// =====================
client.login(process.env.TOKEN);