// Free WhatsApp Integration using CallMeBot (Unofficial)
// Setup:
// 1. Add phone number +34 644 10 55 84 to your contacts (CallMeBot)
// 2. Send "I allow callmebot to send me messages" to that number
// 3. Get your API Key

const API_KEY = process.env.WHATSAPP_API_KEY;
const PHONE_NUMBER = process.env.WHATSAPP_PHONE_NUMBER;

export async function sendWhatsAppAlert(message: string) {
    if (!API_KEY || !PHONE_NUMBER) {
        console.log("⚠️ WhatsApp Skipped: Setup keys in .env.local first");
        return;
    }

    const url = `https://api.callmebot.com/whatsapp.php?phone=${PHONE_NUMBER}&text=${encodeURIComponent(message)}&apikey=${API_KEY}`;

    try {
        const res = await fetch(url);
        if (res.ok) {
            console.log("✅ WhatsApp sent:", message);
        } else {
            console.error("❌ WhatsApp failed:", res.statusText);
        }
    } catch (err) {
        console.error("❌ Network error sending WhatsApp", err);
    }
}
