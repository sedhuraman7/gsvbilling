require('dotenv').config({ path: '.env.local' });
const nodemailer = require('nodemailer');

async function sendTestEmail() {
    const email = process.env.SMTP_EMAIL;
    const pass = process.env.SMTP_PASSWORD;

    console.log(`📧 Attempting to send email to: ${email}...`);

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: email, pass: pass },
    });

    try {
        const info = await transporter.sendMail({
            from: `"Smart Grid System" <${email}>`,
            to: "sedhu123sedhu@gmail.com",
            subject: "🚀 Test Email Success!",
            html: "<h1>It Works!</h1><p>If you are seeing this, your Billing System email configuration is PERFECT.</p>",
        });
        console.log("✅ Success! Message ID:", info.messageId);
        console.log("Please check your Inbox (and Spam folder just in case).");
    } catch (error) {
        console.error("❌ Failed:", error.message);
        if (error.message.includes("Username and Password not accepted")) {
            console.log("👉 Hint: Check if 'App Password' is correct and 2FA is ON.");
        }
    }
}

sendTestEmail();
