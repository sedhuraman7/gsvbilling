"use client";

import { useState } from 'react';
import { db } from '@/lib/firebase';
import { ref, set, child } from "firebase/database";
import { Lock } from 'lucide-react';

export default function SuperAdmin() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [adminCode, setAdminCode] = useState('');

    const [newHouseId, setNewHouseId] = useState('');
    const [ownerPass, setOwnerPass] = useState('');
    const [ownerEmail, setOwnerEmail] = useState('');
    const [deviceId, setDeviceId] = useState(''); // New Device ID / MAC

    const handleAuth = (e: React.FormEvent) => {
        e.preventDefault();
        if (adminCode === 'admin123') setIsAuthenticated(true);
        else alert('Invalid Admin Code');
    };

    const handleCreateHouse = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newHouseId || !ownerEmail || !ownerPass) return;

        try {
            const config = {
                password: ownerPass,
                email: ownerEmail,
                device_id: deviceId, // Store Unique ID for binding
                created_at: new Date().toISOString(),
                active: true
            };

            // Save to DB
            const dbRef = ref(db);
            await set(child(dbRef, `houses/${newHouseId.toUpperCase()}/config`), config);

            // SEND EMAIL
            await fetch('/api/admin/welcome-owner', {
                method: 'POST',
                body: JSON.stringify({
                    email: ownerEmail,
                    houseId: newHouseId.toUpperCase(),
                    password: ownerPass
                })
            });

            alert(`✅ House ${newHouseId} Created! Device ID Linked.`);
            setNewHouseId(''); setOwnerPass(''); setOwnerEmail(''); setDeviceId('');
        } catch (e) {
            console.error(e);
            alert("Error creating house");
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <form onSubmit={handleAuth} className="bg-slate-800 p-8 rounded-lg text-center space-y-4">
                    <Lock className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                    <h2 className="text-white font-bold text-xl">Super Admin Access</h2>
                    <input
                        type="password"
                        placeholder="Enter Code"
                        className="p-2 rounded w-full bg-slate-700 text-white text-center tracking-widest"
                        value={adminCode}
                        onChange={e => setAdminCode(e.target.value)}
                    />
                    <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-500 w-full font-bold">
                        Unlock
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 text-white p-8">
            <h1 className="text-3xl font-bold mb-8 text-blue-400">⚡ Super Admin Console</h1>

            <div className="bg-slate-800 p-6 rounded-lg max-w-xl">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <span className="bg-blue-600 text-xs px-2 py-1 rounded">NEW</span> Create House & Bind Device
                </h2>
                <form onSubmit={handleCreateHouse} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs text-slate-400">House Identifier</label>
                        <input
                            className="w-full p-3 bg-slate-700 rounded text-white font-mono uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="e.g. GSV07"
                            value={newHouseId} onChange={e => setNewHouseId(e.target.value)} required
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-slate-400">Device Hardware ID (MAC)</label>
                        <input
                            className="w-full p-3 bg-slate-700 rounded text-yellow-300 font-mono tracking-wide focus:ring-2 focus:ring-yellow-500 outline-none"
                            placeholder="e.g. A1:B2:C3:D4:E5:F6"
                            value={deviceId} onChange={e => setDeviceId(e.target.value)}
                        />
                        <p className="text-[10px] text-slate-500">Copy this from ESP32 Serial Monitor during setup.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                            <label className="text-xs text-slate-400">Owner Email</label>
                            <input className="w-full p-3 bg-slate-700 rounded focus:ring-2 focus:ring-blue-500 outline-none" placeholder="owner@email.com" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} required />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-400">Login Password</label>
                            <input className="w-full p-3 bg-slate-700 rounded focus:ring-2 focus:ring-blue-500 outline-none" type="password" placeholder="******" value={ownerPass} onChange={e => setOwnerPass(e.target.value)} required />
                        </div>
                    </div>

                    <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-bold shadow-lg transition-transform hover:scale-[1.02]">
                        Generate Assets & Link Device
                    </button>
                </form>
            </div>
        </div>
    );
}
