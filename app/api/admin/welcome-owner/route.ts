import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { email, houseId, password } = body;

        const subject = `Smart Grid - House Credentials: ${houseId}`;
        const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
            <h2 style="color: #dc2626;">Welcome to Smart Grid System</h2>
            <p>Your property setup is complete.</p>
            
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #e2e8f0;">
                <p><strong>🏠 House ID:</strong> ${houseId}</p>
                <p><strong>🔑 Password:</strong> ${password}</p>
            </div>

            <p>Login URL: <a href="http://localhost:3000/login">http://localhost:3000/login</a></p>
            
            <p style="color: #64748b; font-size: 12px; margin-top: 20px;">Keep these credentials safe.</p>
        </div>
    `;

        await sendEmail(email, subject, html);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Owner Welcome Email Error:", error);
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
