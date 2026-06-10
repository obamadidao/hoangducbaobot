require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("setbirthday")
    .setDescription("Nhập ngày sinh của bạn")
    .addStringOption(option =>
      option.setName("date")
        .setDescription("dd-mm (VD: 25-12)")
        .setRequired(true)
    )
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );

  console.log("✅ Slash command deployed");
})();