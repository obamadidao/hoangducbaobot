require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Collection } = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent 
    ]
});

client.commands = new Collection();
client.tempImages = new Map();
client.tempEventRoles = new Map();

// 1. Tự động load toàn bộ file lệnh trong thư mục commands/
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if (command.data && command.data.name) {
            client.commands.set(command.data.name, command);
            console.log(`✔ Loaded Command: /${command.data.name}`);
        }
    }
}

// 2. Tự động load toàn bộ file event trong thư mục events/
const eventsPath = path.join(__dirname, "events");
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith(".js"));
    for (const file of eventFiles) {
        const event = require(path.join(eventsPath, file));
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
    }
}

client.login(process.env.TOKEN);