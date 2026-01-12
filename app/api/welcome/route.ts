import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, name, houseId, linkCode, address } = body;

        const botUsername = "SmartMeterNewBot"; // Or whatever your bot name is

        const subject = `Welcome to Smart Grid: ${houseId}`;
        const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
            <h2 style="color: #2563eb;">Welcome, ${name}! 👋</h2>
            <p>You have been added to the Smart Meter System.</p>
            
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p><strong>🏠 House ID:</strong> ${houseId}</p>
                <p><strong>🚪 Address/Room:</strong> ${address || 'N/A'}</p>
            </div>

            <h3>📲 How to Enable Alerts (Telegram):</h3>
            <p>1. Open Telegram.</p>
            <p>2. Search for <strong>@${botUsername}</strong></p>
            <p>3. Send this exact command:</p>
            
            <div style="background: #eff6ff; padding: 15px; border-left: 4px solid #2563eb; font-family: monospace; font-size: 16px;">
                /join ${linkCode}
            </div>

            <p style="color: #64748b; font-size: 12px; margin-top: 20px;">Use this code to link your account instantly.</p>
        </div>
    `;

        await sendEmail(email, subject, html);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Welcome Email Error:", error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
