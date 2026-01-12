import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { ref, remove, child } from "firebase/database";

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const chatId = searchParams.get('chatId');
        const houseId = searchParams.get('houseId');

        if (!chatId || !houseId) return NextResponse.json({ success: false }, { status: 400 });

        await remove(ref(db, `houses/${houseId}/tenants/${chatId}`));
        return NextResponse.json({ success: true, message: "Tenant removed" });
    } catch (error) {
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
