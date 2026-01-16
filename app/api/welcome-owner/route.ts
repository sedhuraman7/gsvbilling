
import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, password, houseId, deviceId } = body;

        const subject = `Welcome Owner: House ${houseId}`;
        const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #dfe6e9; border-radius: 12px; background-color: #f8f9fa;">
            <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="color: #2563eb; margin: 0;">⚡ Smart Grid</h1>
                <p style="color: #636e72; margin-top: 5px;">Ownership Confirmation</p>
            </div>

            <div style="background: white; padding: 25px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                <h2 style="color: #2d3436; margin-top: 0;">Hello, Owner! 👋</h2>
                <p style="color: #636e72; line-height: 1.6;">
                    Your smart billing account has been successfully created.
                    A new Smart Meter device has been linked to your account.
                </p>
                
                <div style="margin: 20px 0; border-bottom: 1px dashed #b2bec3;"></div>

                <div style="background: #e0f2fe; padding: 15px; border-radius: 8px; border-left: 4px solid #0284c7;">
                    <p style="margin: 5px 0; font-size: 14px; color: #0369a1;"><strong>🏠 House ID:</strong> ${houseId}</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #0369a1;"><strong>📟 Device ID:</strong> ${deviceId}</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #0369a1;"><strong>🔑 Login ID:</strong> ${email}</p>
                    <p style="margin: 5px 0; font-size: 14px; color: #0369a1;"><strong>🔒 Password:</strong> <span style="font-family: monospace; background: rgba(255,255,255,0.5); padding: 2px 5px; rounded: 3px;">${password}</span></p>
                </div>

                <p style="margin-top: 25px; color: #2d3436;">
                    <strong>Next Steps:</strong>
                    Login to your dashboard to monitor live usage and manage tenants.
                </p>

                <div style="text-align: center; margin-top: 30px;">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://gsv-billing.vercel.app'}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Login to Dashboard</a>
                </div>
            </div>

            <div style="text-align: center; margin-top: 20px; color: #b2bec3; font-size: 12px;">
                © 2026 GSV Electrical Enterprises. Automated System.
            </div>
        </div>
    `;

        await sendEmail(email, subject, html);
        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Owner Email Error:", error);
        return NextResponse.json({ success: false, error: 'Failed' }, { status: 500 });
    }
}
