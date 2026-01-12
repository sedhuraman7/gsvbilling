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
        <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                        ⚡ Super Admin
                    </h1>
                    <p className="text-slate-400 mt-2">Manage Houses & Bind Devices</p>
                </div>

                <div className="bg-slate-900/50 p-8 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-sm">
                    <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-white">
                        <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-1 rounded border border-blue-500/30">NEW</span>
                        Create & Bind
                    </h2>
                    <form onSubmit={handleCreateHouse} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-400 ml-1">HOUSE IDENTIFIER</label>
                            <input
                                className="w-full p-3 bg-slate-950/50 rounded-lg text-white font-mono uppercase border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                                placeholder="e.g. GSV07"
                                value={newHouseId} onChange={e => setNewHouseId(e.target.value)} required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-400 ml-1">DEVICE ID (MAC)</label>
                            <input
                                className="w-full p-3 bg-slate-950/50 rounded-lg text-yellow-400 font-mono tracking-wide border border-slate-700 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none transition-all placeholder:text-slate-600"
                                placeholder="A1:B2:C3:D4:E5:F6"
                                value={deviceId} onChange={e => setDeviceId(e.target.value)}
                            />
                            <p className="text-[10px] text-slate-500 text-right">From ESP32 Serial Monitor</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 ml-1">OWNER EMAIL</label>
                                <input className="w-full p-3 bg-slate-950/50 rounded-lg border border-slate-700 focus:border-blue-500 outline-none placeholder:text-slate-600" placeholder="mail@Owner.com" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} required />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-400 ml-1">PASSWORD</label>
                                <input className="w-full p-3 bg-slate-950/50 rounded-lg border border-slate-700 focus:border-blue-500 outline-none placeholder:text-slate-600" type="password" placeholder="******" value={ownerPass} onChange={e => setOwnerPass(e.target.value)} required />
                            </div>
                        </div>

                        <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-blue-900/20 active:scale-[0.98] transition-all mt-2">
                            🚀 Generate Assets
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
