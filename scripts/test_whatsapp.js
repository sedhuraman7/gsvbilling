require('dotenv').config({ path: '.env.local' });

async function testWhatsApp() {
    const apiKey = process.env.WHATSAPP_API_KEY;
    const phone = process.env.WHATSAPP_PHONE_NUMBER;

    if (!apiKey || !phone) {
        console.log("❌ Missing Keys! Please provide WhatsApp Number & API Key.");
        return;
    }

    console.log(`📱 Sending WhatsApp to ${phone}...`);

    const message = "✅ Smart Meter: WhatsApp Alert System is Working!";
    const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encodeURIComponent(message)}&apikey=${apiKey}`;

    try {
        const fetch = (await import('node-fetch')).default; // Dynamic import for node-fetch
        const res = await fetch(url);
        if (res.ok) {
            console.log("✅ Message Sent!");
        } else {
            console.log("❌ Failed. Status:", res.status);
        }
    } catch (err) {
        console.error("❌ Error:", err.message);
    }
}

testWhatsApp();
