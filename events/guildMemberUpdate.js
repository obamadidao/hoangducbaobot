const { loadData } = require("../utils/db");
const { sendProfileCardToHall } = require("../utils/profileManager");

const REGULAR_MEMBER_ROLE = "1207064301957947443";
const INVESTOR_ROLE = "1258567277695995904";
const HOANG_DE_ROLE = "1206317832674086944";

module.exports = {
    name: "guildMemberUpdate",
    async execute(oldMember, newMember, client) {
        const oldRegular = oldMember.roles.cache.has(REGULAR_MEMBER_ROLE);
        const newRegular = newMember.roles.cache.has(REGULAR_MEMBER_ROLE);
        const oldInvestor = oldMember.roles.cache.has(INVESTOR_ROLE);
        const newInvestor = newMember.roles.cache.has(INVESTOR_ROLE);
        const oldHoangDe = oldMember.roles.cache.has(HOANG_DE_ROLE);
        const newHoangDe = newMember.roles.cache.has(HOANG_DE_ROLE);

        if (oldRegular !== newRegular || oldInvestor !== newInvestor || oldHoangDe !== newHoangDe) {
            const data = loadData();
            if (data[newMember.id]) {
                await sendProfileCardToHall(newMember.guild, client, newMember.id, data[newMember.id]);
            }
        }
    }
};