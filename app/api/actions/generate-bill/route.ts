import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, get, child } from "firebase/database";
import { sendEmail } from '@/lib/email';
import TelegramBot from 'node-telegram-bot-api';

const botToken = "8265634188:AAEIbyRVIlKJ8cF87F33hKsCUivQNsVBQVo";
const bot = new TelegramBot(botToken, { polling: false });

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { totalAmount, month } = body;

        // 0. Fetch Settings (Tenant Count) from Database
        const dbRef = ref(db);
        // Note: We need Tenant Count logic, but in Multi-house, we just count actual tenants list length ideally.
        // For now, let's keep it simple: Split by registered tenants count.

        // 1. Fetch Tenants for this House
        const houseId = body.houseId || 'HOUSE_001';
        const usersSnap = await get(child(dbRef, `houses/${houseId}/tenants`));

        let users: any = {};
        if (usersSnap.exists()) users = usersSnap.val();

        // Calculate Split based on ACTIVE users count
        const activeTenantCount = Object.keys(users).length || 1;
        const splitAmount = (totalAmount / activeTenantCount).toFixed(2);

        const notificationLog = [];

        // 2. Generate Assets
        const upiLink = `upi://pay?pa=owner@upi&pn=SmartGridOwner&am=${splitAmount}&cu=INR`;
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiLink)}`;

        // 3. Loop through users
        for (const userId in users) {
            const user = users[userId];
            const message = `🏠 **BILL ALERT: ${user.label}**\n\n` +
                `📅 Month: ${month}\n` +
                `💸 **Your Share: ₹${splitAmount}**\n` +
                `[Pay Now via UPI](${upiLink})`;

            // CASE A: Telegram User
            if (user.chatId) {
                try {
                    await bot.sendMessage(user.chatId, message, { parse_mode: 'Markdown' });
                    await bot.sendPhoto(user.chatId, qrCodeUrl);
                    notificationLog.push(`Sent Telegram to ${user.label}`);
                } catch (e) { console.error("Tele Fail", e); }
            }

            // CASE B: Email User (or Both)
            // PREMIUM TEMPLATE
            if (user.email) {
                try {
                    const emailHtml = `
                    <!DOCTYPE html>
                    <html>
                    <body style="margin:0; padding:0; background-color:#f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                        <center>
                            <div style="max-width: 600px; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin: 40px auto;">
                                
                                <div style="background: #1e293b; padding: 30px; text-align: center;">
                                    <h1 style="color: #60a5fa; margin: 0; font-size: 24px; letter-spacing: 2px;">⚡ SMART GRID</h1>
                                    <p style="color: #94a3b8; margin: 5px 0 0;">Monthly Energy Billing</p>
                                </div>

                                <div style="padding: 40px 30px;">
                                    <h2 style="color: #0f172a; margin-top: 0;">Hello ${user.label},</h2>
                                    <p style="color: #64748b; line-height: 1.6;">Here is your electricity bill breakdown for <strong>${month}</strong>.</p>

                                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 30px 0;">
                                        <table width="100%" style="border-collapse: collapse;">
                                            <tr>
                                                <td style="padding: 10px; color: #64748b;">House Total Bill</td>
                                                <td style="padding: 10px; color: #0f172a; font-weight: bold; text-align: right;">₹${totalAmount}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 10px; color: #64748b;">Active Tenants</td>
                                                <td style="padding: 10px; color: #0f172a; font-weight: bold; text-align: right;">${activeTenantCount}</td>
                                            </tr>
                                            <tr style="border-top: 2px dashed #cbd5e1;">
                                                <td style="padding: 15px 10px; color: #0f172a; font-size: 18px; font-weight: bold;">YOUR SHARE</td>
                                                <td style="padding: 15px 10px; color: #2563eb; font-size: 24px; font-weight: bold; text-align: right;">₹${splitAmount}</td>
                                            </tr>
                                        </table>
                                    </div>

                                    <div style="text-align: center;">
                                        <a href="${upiLink}" style="background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.4);">
                                            💸 Pay Now (UPI)
                                        </a>
                                        <a href="http://localhost:3000/invoice?houseId=${houseId}&user=${encodeURIComponent(user.label)}&amount=${splitAmount}" target="_blank" style="display:block; margin-top:15px; color:#2563eb; text-decoration:underline; font-size:14px; font-weight: bold;">
                                            📄 View / Download Official Invoice
                                        </a>
                                    </div>
                                </div>

                                <div style="background: #f1f5f9; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">
                                    <p>House ID: ${houseId} | Automated by Antigravity AI</p>
                                </div>
                            </div>
                        </center>
                    </body>
                    </html>
                `;

                    await sendEmail(
                        user.email,
                        `⚡ Statement: ₹${splitAmount} Due`,
                        emailHtml
                    );
                    notificationLog.push(`Sent Email to ${user.label}`);
                } catch (e) { console.error("Email Fail", e); }
            }
        }

        return NextResponse.json({ success: true, logs: notificationLog });

    } catch (error) {
        console.error('Error generating bill:', error);
        return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
    }
}
