"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { ref, set, onValue } from "firebase/database";
import { Lock, LayoutGrid, PlusCircle, ShieldAlert, Trash2 } from 'lucide-react';

export default function SuperAdmin() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [adminCode, setAdminCode] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [pass, setPass] = useState('');

    const [houseId, setHouseId] = useState('');
    const [ownerPass, setOwnerPass] = useState('');
    const [ownerEmail, setOwnerEmail] = useState('');
    const [deviceId, setDeviceId] = useState(''); // New Device ID / MAC

    const [loading, setLoading] = useState(false);
    const [houses, setHouses] = useState<any[]>([]);

    // FETCH ALL HOUSES
    useEffect(() => {
        const housesRef = ref(db, 'houses');
        const unsub = onValue(housesRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                // Convert object to array for display
                const houseList = Object.keys(data).map(key => ({
                    id: key,
                    ...data[key]?.config // Access config node
                }));
                setHouses(houseList);
            } else {
                setHouses([]);
            }
        });
        return () => unsub();
    }, []);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (pass === 'admin123') setIsAdmin(true);
        else alert('Invalid Password');
    };

    const handleCreateHouse = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const houseData = {
            owner_email: ownerEmail,
            owner_pass: ownerPass,
            device_id: deviceId || 'MAC_UNKNOWN',
            created_at: new Date().toISOString()
        };

        try {
            // Save config
            await set(ref(db, `houses/${houseId}/config`), houseData);

            // Initialize system status
            await set(ref(db, `houses/${houseId}/system_status`), {
                voltage: 0, current: 0, power: 0, energy_kwh: 0, active_meter: 1
            });

            alert(`✅ House ${houseId} Created! Device ID: ${houseData.device_id}`);
            setHouseId(''); setOwnerEmail(''); setOwnerPass(''); setDeviceId('');
        } catch (error) {
            alert("Failed to create house");
        }
        setLoading(false);
    };

    // DELETE HOUSE
    const handleDeleteHouse = async (id: string) => {
        if (!confirm(`⚠️ DANGER: Are you sure you want to DELETE House: ${id}?\nThis removes all data, tenants, and logs for this owner.`)) return;

        const key = prompt(`Type "${id}" to confirm deletion:`);
        if (key !== id) return alert("Deletion Cancelled.");

        try {
            await set(ref(db, `houses/${id}`), null); // Wipe entire node
            alert(`🗑️ House ${id} Deleted.`);
        } catch (e) { alert("Delete failed"); }
    };

    if (!isAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-100 font-sans">
                <div className="bg-white p-8 rounded-2xl shadow-xl w-96">
                    <div className="flex justify-center mb-6">
                        <div className="bg-blue-100 p-3 rounded-full">
                            <ShieldAlert className="h-8 w-8 text-blue-600" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-center text-slate-800 mb-6">Super Admin</h1>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input
                            type="password"
                            className="w-full p-3 border rounded-xl bg-slate-50 focus:ring-2 ring-blue-500 outline-none"
                            placeholder="Enter Admin Code"
                            value={pass}
                            onChange={(e) => setPass(e.target.value)}
                        />
                        <button className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition">
                            Unlock Console
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans p-6 md:p-10">
            <header className="max-w-4xl mx-auto flex items-center gap-3 mb-8">
                <div className="bg-blue-600 text-white p-2 rounded-lg"><LayoutGrid className="h-6 w-6" /></div>
                <h1 className="text-2xl font-bold text-slate-800">Super Admin Console</h1>
            </header>

            <main className="max-w-4xl mx-auto space-y-8">

                {/* 1. CREATE HOUSE CARD */}
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <PlusCircle className="text-green-500" /> Create New House Owner
                    </h2>
                    <form onSubmit={handleCreateHouse} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="col-span-1 md:col-span-2">
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1">House ID (Unique)</label>
                            <input
                                className="w-full p-3 border rounded-xl bg-slate-50 font-mono text-blue-600 font-bold"
                                placeholder="GSV01"
                                value={houseId}
                                onChange={(e) => setHouseId(e.target.value.toUpperCase())}
                                required
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1">Owner Email</label>
                            <input className="w-full p-3 border rounded-xl" placeholder="owner@gmail.com" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required type="email" />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1">Password</label>
                            <input className="w-full p-3 border rounded-xl" placeholder="Pass123" value={ownerPass} onChange={(e) => setOwnerPass(e.target.value)} required />
                        </div>
                        <div className="col-span-1 md:col-span-2">
                            <label className="text-xs font-bold text-slate-400 uppercase ml-1">Device ID (MAC Address from ESP32)</label>
                            <input
                                className="w-full p-3 border rounded-xl font-mono text-slate-600"
                                placeholder="E.g. A4:CF:12:..."
                                value={deviceId}
                                onChange={(e) => setDeviceId(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" disabled={loading} className="col-span-1 md:col-span-2 py-4 mt-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-black transition shadow-lg">
                            {loading ? 'Creating...' : 'Create House Account & Bind Device'}
                        </button>
                    </form>
                </div>

                {/* 2. MANAGE HOUSES LIST */}
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <ShieldAlert className="text-blue-500" /> Managed Houses ({houses.length})
                    </h2>

                    <div className="space-y-3">
                        {houses.length === 0 && <p className="text-slate-400 text-center py-4">No houses registered yet.</p>}

                        {houses.map((house) => (
                            <div key={house.id} className="flex flex-col md:flex-row justify-between items-center p-4 border rounded-xl bg-slate-50 hover:bg-white transition shadow-sm">
                                <div className="mb-2 md:mb-0">
                                    <div className="flex items-center gap-2">
                                        <div className="font-bold text-lg text-blue-700">{house.id}</div>
                                        <div className="text-[10px] bg-slate-200 px-2 rounded-full font-mono text-slate-600">{house.device_id || 'No MAC'}</div>
                                    </div>
                                    <div className="text-sm text-slate-500">{house.owner_email} | Pass: <span className="font-mono bg-slate-200 px-1 rounded">{house.owner_pass}</span></div>
                                </div>
                                <button
                                    onClick={() => handleDeleteHouse(house.id)}
                                    className="px-4 py-2 bg-white border border-red-200 text-red-500 font-bold rounded-lg hover:bg-red-50 text-sm flex items-center gap-2"
                                >
                                    <Trash2 className="h-4 w-4" /> Remove Access
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

            </main>
        </div>
    );

}
