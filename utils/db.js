const fs = require("fs");

const FILE = fs.existsSync("/data") ? "/data/birthdays.json" : "./birthdays.json";
const STICKY_FILE = fs.existsSync("/data") ? "/data/sticky.json" : "./sticky.json";
const EVENTS_FILE = fs.existsSync("/data") ? "/data/events.json" : "./events.json";

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

module.exports = {
    loadData: () => readJson(FILE),
    saveData: (data) => writeJson(FILE, data),
    loadStickyData: () => readJson(STICKY_FILE),
    saveStickyData: (data) => writeJson(STICKY_FILE, data),
    loadEventsData: () => readJson(EVENTS_FILE),
    saveEventsData: (data) => writeJson(EVENTS_FILE, data),
    
    // Helpers định dạng
    getDaysUntilBirthday: (day, month) => {
        const now = new Date();
        const currentYear = now.getFullYear();
        let bdayTest = new Date(currentYear, month - 1, day);
        if (bdayTest < now && bdayTest.toDateString() !== now.toDateString()) {
            bdayTest.setFullYear(currentYear + 1);
        }
        return Math.ceil((bdayTest - now) / (1000 * 60 * 60 * 24));
    },
    formatBirthday: (day, month, year) => {
        if (!day || !month) return "";
        const d = String(day).padStart(2, '0');
        const m = String(month).padStart(2, '0');
        return `${d}/${m}${year ? `/${year}` : ""}`;
    }
};
