
import { NextResponse } from 'next/server';
import TelegramBot from 'node-telegram-bot-api';
import { supabase } from '@/lib/supabase';

// Initialize Bot
// FORCE VALID TOKEN (Bypassing potential stale Env Var on Vercel)
// FORCE VALID TOKEN
const token = "8537233654:AAGxhu2rsL6CNEOurDGLfrtNSt0FeDPmPVI";
// IMPORTANT: polling must be FALSE for Vercel (Webhooks mode)
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

            // SEARCH SUPABASE
            const { data: tenants, error } = await supabase.from('tenants').select('*').eq('link_code', inputCode);

            if (error || !tenants || tenants.length === 0) {
                if (inputCode.includes("HOUSE_")) {
                    await bot.sendMessage(chatId, "⚠️ Try asking Owner for the 4-digit Link Code from Dashboard.");
                } else {
                    await bot.sendMessage(chatId, "❌ Invalid 4-Digit Code.");
                }
                return NextResponse.json({ status: 'not_found' });
            }

            const foundUser = tenants[0];

            // UPDATE SUPABASE
            await supabase.from('tenants').update({
                chat_id: String(chatId),
                type: 'LINKED_USER',
                link_code: null // Clear code
            }).eq('id', foundUser.id);

            await bot.sendMessage(chatId, `✅ Connected! Hello ${foundUser.name}. Alerts Enabled.`);
            console.log(`✅ Linked ${foundUser.name} to ChatID ${chatId}`);
        }

        return NextResponse.json({ status: 'success' });

    } catch (error) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ status: 'error', error: String(error) });
    }
}
