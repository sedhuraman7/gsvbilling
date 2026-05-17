import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';
import TelegramBot from 'node-telegram-bot-api';

// Force Valid Token for SENDING bills too (Fixes Vercel 401 issue)
const botToken = "8537233654:AAGxhu2rsL6CNEOurDGLfrtNSt0FeDPmPVI";
const bot = new TelegramBot(botToken, { polling: false });

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { totalAmount, month, houseId, includeOwner } = body;

        // 0. Fetch Settings from Database
        const targetHouseId = houseId || 'HOUSE_001';
        
        const { data: usersData } = await supabase.from('tenants').select('*').eq('house_id', targetHouseId);

        let users: any = {};
        if (usersData) {
            usersData.forEach((t: any) => {
                users[t.id] = { label: t.name, email: t.email, chatId: t.chat_id, link_code: t.link_code };
            });
        }
        
        // Also fetch owner if included
        if (includeOwner) {
            const { data: houseData } = await supabase.from('houses').select('owner_email').eq('id', targetHouseId).single();
            if (houseData && houseData.owner_email) {
                users['OWNER'] = { label: 'House Owner', email: houseData.owner_email, chatId: null, link_code: null };
            }
        }

        // Calculate Split based on ACTIVE users count
        const totalPeople = Object.keys(users).length || 1;
        const splitAmount = (totalAmount / totalPeople).toFixed(2);

        const notificationLog = [];

        // 1. Generate Assets
        // Note: & in upiLink is handled by encoding or template strings
        const upiLink = `upi://pay?pa=owner@upi&pn=SmartGridOwner&am=${splitAmount}&cu=INR`;
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiLink)}`;

        // 2. FORCE PUBLIC PROD URL (No Vercel Login Required)
        const appUrl = 'https://gsvbilling.vercel.app';

        // 3. Loop through users
        for (const userId in users) {
            const user = users[userId];
            const safeLabel = user.label ? user.label.replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'Tenant';

            // HTML Message with robust links (Escape & for Telegram HTML Parser)
            const safeInvoiceUrl = `${appUrl}/invoice?houseId=${houseId}&amp;user=${encodeURIComponent(user.label)}&amp;amount=${splitAmount}&amp;autoPrint=true`;
            const message = `🏠 <b>BILL ALERT: ${safeLabel}</b>\n\n` +
                `📅 Month: ${month}\n` +
                `💸 <b>Your Share: ₹${splitAmount}</b>\n\n` +
                `<a href="${upiLink.replace(/&/g, '&amp;')}">Pay Now via UPI</a>\n` +
                `<a href="${safeInvoiceUrl}">📄 Download Invoice</a>`;

            // CASE A: Telegram User
            if (user.chatId) {
                try {
                    await bot.sendMessage(user.chatId, message, { parse_mode: 'HTML' });
                    await bot.sendPhoto(user.chatId, qrCodeUrl);
                    notificationLog.push(`Sent Telegram to ${user.label}`);
                } catch (e) { console.error("Tele Fail", e); }
            }

            // CASE B: Email User
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
                                                <td style="padding: 10px; color: #64748b;">Split Count</td>
                                                <td style="padding: 10px; color: #0f172a; font-weight: bold; text-align: right;">${totalPeople} (Tenants${includeOwner ? '+Owner' : ''})</td>
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
                                        <a href="${appUrl}/invoice?houseId=${houseId}&user=${encodeURIComponent(user.label)}&amount=${splitAmount}&autoPrint=true" target="_blank" style="display:block; margin-top:15px; color:#2563eb; text-decoration:underline; font-size:14px; font-weight: bold;">
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

                    await sendEmail(user.email, `⚡ Statement: ₹${splitAmount} Due`, emailHtml);
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
