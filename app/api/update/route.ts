import { NextResponse } from 'next/server';

// This endpoint receives data from ESP32
// URL: http://your-domain.com/api/update
// Payload: { "voltage": 230, "current": 5, "meter": 1 }

export async function POST(request: Request) {
    try {
        const data = await request.json();
        console.log("📡 Received Data from Device:", data);

        // TODO: Save to Firebase here

        return NextResponse.json({ success: true, timestamp: new Date() });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }
}
