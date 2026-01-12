"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, push, set, onValue } from 'firebase/database';
import { Shield, Plus, Building, Key, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPage() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');

    // Form Data
    const [newHouseId, setNewHouseId] = useState('');
    const [ownerPass, setOwnerPass] = useState('');
    const [ownerEmail, setOwnerEmail] = useState('');
    const [ownerTeleId, setOwnerTeleId] = useState(''); // Optional: To auto-link owner telegram

    const [houses, setHouses] = useState<any>({});

    // 1. Auth Check (Simple)
    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (password === 'sedhu_admin_2026') setIsAuthenticated(true);
        else alert("Wrong Security Code!");
    };

    // 2. Load Houses
    useEffect(() => {
        if (!isAuthenticated) return;
        const houseRef = ref(db, 'houses');
        onValue(houseRef, (snap) => {
            if (snap.exists()) setHouses(snap.val());
        });
    }, [isAuthenticated]);

    // 3. Create House
    const handleCreateHouse = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Structure: houses/HOUSE_ID/config...
            const config = {
                password: ownerPass,
                email: ownerEmail,
                telegramId: ownerTeleId,
                createdAt: new Date().toISOString(),
                active: true
            };

            // Save Config
            await set(ref(db, `houses/${newHouseId.toUpperCase()}/config`), config);

            // SEND EMAIL TO OWNER
            await fetch('/api/admin/welcome-owner', {
                method: 'POST',
                body: JSON.stringify({
                    email: ownerEmail,
                    houseId: newHouseId.toUpperCase(),
                    password: ownerPass
                })
            });

            alert(`✅ House ${newHouseId} Created! Email Sent to Owner.`);
            setNewHouseId(''); setOwnerPass(''); setOwnerEmail('');
        } catch (e) {
            alert("Error creating house");
        }
    };

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
                <form onSubmit={handleLogin} className="p-8 bg-slate-800 rounded-xl border border-slate-700 text-center">
                    <Shield className="h-10 w-10 mx-auto text-red-500 mb-4" />
                    <h1 className="text-xl font-bold mb-4">CONFIDENTIAL: COMPANY ACCESS</h1>
                    <input
                        type="password"
                        placeholder="Enter Security Code"
                        className="w-full p-2 rounded text-black mb-4"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                    />
                    <button className="bg-red-600 px-6 py-2 rounded font-bold w-full">Unlock DB</button>
                </form>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 p-8 font-sans">
            <header className="mb-8 flex items-center gap-3">
                <div className="bg-red-600 p-2 rounded text-white"><Shield className="h-6 w-6" /></div>
                <h1 className="text-2xl font-bold text-slate-800">Super Admin Console</h1>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* CREATE HOUSE */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Grant New Access</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreateHouse} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">House ID (Unique)</label>
                                <input className="w-full p-2 border rounded text-black uppercase font-mono" placeholder="Ex: HOUSE_001" value={newHouseId} onChange={e => setNewHouseId(e.target.value)} required />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Owner Password</label>
                                <input className="w-full p-2 border rounded text-black" placeholder="Set Password" value={ownerPass} onChange={e => setOwnerPass(e.target.value)} required />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Owner Email</label>
                                <input className="w-full p-2 border rounded text-black" placeholder="owner@gmail.com" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} required />
                            </div>

                            <button className="w-full bg-slate-900 text-white py-3 rounded font-bold hover:bg-black transition">Generate Assets</button>
                        </form>
                    </CardContent>
                </Card>

                {/* LIST HOUSES */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Building className="h-5 w-5" /> Active Deployments ({Object.keys(houses).length})</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                            {Object.entries(houses).map(([id, data]: any) => (
                                <div key={id} className="p-3 border rounded bg-slate-50 flex justify-between items-center text-sm">
                                    <div>
                                        <div className="font-bold text-slate-800">{id}</div>
                                        <div className="text-xs text-slate-500">{data.config?.email}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold mb-1">Active</div>
                                        <div className="text-xs text-slate-400 font-mono">Pass: {data.config?.password}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
