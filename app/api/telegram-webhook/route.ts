
import { NextResponse } from 'next/server';
import TelegramBot from 'node-telegram-bot-api';
import { db } from '@/lib/firebase'; // Ensure this points to your client config
import { ref, get, update, child } from "firebase/database";

// Initialize Bot
// FORCE VALID TOKEN (Bypassing potential stale Env Var on Vercel)
const token = "8537233654:AAGxhu2rsL6CNEOurDGLfrtNSt0FeDPmPVI";
const bot = new TelegramBot(token, { polling: false });

// This handles the INCOMING message from Telegram
export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Ensure it's a message
        if (!body.message) {
            return NextResponse.json({ status: 'No message found' });
        }

        const msg = body.message;
        const chatId = msg.chat.id;
        const text = msg.text || "";

        console.log(`📩 Webhook Msg: ${text} from ${chatId}`);

        // LOGIC 1: /start
        if (text.startsWith('/start')) {
            await bot.sendMessage(chatId, "👋 Welcome! Send your Link Code to connect.\nExample: /join 5544");
            return NextResponse.json({ status: 'handled' });
        }

        // LOGIC 2: /join <CODE>
        if (text.startsWith('/join')) {
            // Extract code
            let inputCode = text.replace('/join', '').trim();
            inputCode = inputCode.replace('LINK-', '').replace('CODE-', '').trim();

            if (!inputCode) {
                await bot.sendMessage(chatId, "❌ Please send the code. Example: /join 5544");
                return NextResponse.json({ status: 'missing_code' });
            }

            console.log(`User ${chatId} joining with code: ${inputCode}`);

            // SEARCH FIREBASE (Replicated Logic)
            const dbRef = ref(db);
            const allHousesSnap = await get(child(dbRef, 'houses'));

            if (!allHousesSnap.exists()) {
                await bot.sendMessage(chatId, "❌ System Error: No houses found.");
                return NextResponse.json({ status: 'no_data' });
            }

            const allHouses = allHousesSnap.val();
            let foundUser = null;
            let foundHouseId = null;
            let foundUserId = null;

            // Deep Search
            for (const houseId in allHouses) {
                const tenants = allHouses[houseId].tenants || {};
                for (const userId in tenants) {
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
                // UPDATE FIREBASE
                const userRef = child(dbRef, `houses/${foundHouseId}/tenants/${foundUserId}`);
                await update(userRef, {
                    chatId: chatId,
                    type: 'LINKED_USER',
                    link_code: null // Optional: Clear code
                });

                await bot.sendMessage(chatId, `✅ Connected! Hello ${foundUser.label}. Alerts Enabled.`);
                console.log(`✅ Linked ${foundUser.label} to ChatID ${chatId}`);
            } else {
                if (inputCode.includes("HOUSE_")) {
                    await bot.sendMessage(chatId, "⚠️ Try asking Owner for the 4-digit Link Code from Dashboard.");
                } else {
                    await bot.sendMessage(chatId, "❌ Invalid 4-Digit Code.");
                }
            }
        }

        return NextResponse.json({ status: 'success' });

    } catch (error) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ status: 'error', error: String(error) });
    }
}
