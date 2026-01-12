require('dotenv').config({ path: '.env.local' });
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// V2 Token
const token = "8265634188:AAEIbyRVIlKJ8cF87F33hKsCUivQNsVBQVo";
const bot = new TelegramBot(token, { polling: true });

// FIREBASE
const DB_URL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

console.log("🤖 Telegram Smart Bot V2 Linker...");

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "👋 Welcome! Send your Link Code to connect.\nExample: /join 5544");
});

// LINK COMMAND: /join <CODE>
bot.onText(/\/join (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    // Remove "HOUSE_001" etc details from input if user typed, just take Last 4 digits logic or full match?
    // Let's assume user sends JUST the code "5544" 
    let inputCode = match[1].trim();

    // CLEAN INPUT: Remove "LINK-" or "CODE-" user might type
    inputCode = inputCode.replace('LINK-', '').replace('CODE-', '').trim();

    console.log(`User ${chatId} trying to join with code: ${inputCode}`);

    // We need to SEARCH across All Houses to find this code.
    // Since we don't know House ID, we scan "houses"
    try {
        const allHousesRes = await axios.get(`${DB_URL}/houses.json`);
        const allHouses = allHousesRes.data || {};

        let foundUser = null;
        let foundHouseId = null;
        let foundUserId = null;

        // Deep Search
        for (const houseId in allHouses) {
            const tenants = allHouses[houseId].tenants || {};
            for (const userId in tenants) {
                // Check if code matches (convert to string to be safe)
                if (String(tenants[userId].link_code) === inputCode) {
                    foundUser = tenants[userId];
                    foundHouseId = houseId;
                    foundUserId = userId;
                    break;
                }
            }
            if (foundUser) break;
        }

        if (foundUser) {
            // UPDATE USER with Chat ID
            const updateData = {
                ...foundUser,
                chatId: chatId,
                type: 'LINKED_USER', // Upgrade status
                link_code: null // Consume code (One time use logic optional, but safe to keep)
            };

            await axios.put(`${DB_URL}/houses/${foundHouseId}/tenants/${foundUserId}.json`, updateData);
            bot.sendMessage(chatId, `✅ Connected! Hello ${foundUser.label}. Alerts Enabled.`);
        } else {
            // If code not found, check if it is OLD FORMAT "HOUSE_001"
            if (inputCode.includes("HOUSE_")) {
                bot.sendMessage(chatId, "⚠️ Try asking Owner for the 4-digit Link Code from Dashboard.");
            } else {
                bot.sendMessage(chatId, "❌ Invalid 4-Digit Code.");
            }
        }

    } catch (e) {
        console.log(e);
        bot.sendMessage(chatId, "❌ Server Error.");
    }
});
