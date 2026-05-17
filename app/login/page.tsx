"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, Home, Lock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from '@/lib/supabase';

export default function Login() {
    const [mode, setMode] = useState<'OWNER' | 'TENANT'>('OWNER');

    const [houseId, setHouseId] = useState('');
    const [password, setPassword] = useState(''); // Used as Code for Tenant
    const [error, setError] = useState('');
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // BACKDOOR
        if (houseId === 'DEMO' && password === 'demo') {
            sessionStorage.setItem('active_house_id', 'HOUSE_001');
            sessionStorage.setItem('role', 'OWNER');
            router.push('/');
            return;
        }

        try {
            if (mode === 'OWNER') {
                const { data, error } = await supabase.from('houses').select('*').eq('id', houseId.toUpperCase()).single();
                
                if (data) {
                    if (data.owner_pass === password) {
                        sessionStorage.setItem('active_house_id', houseId.toUpperCase());
                        sessionStorage.setItem('role', 'OWNER');
                        router.push('/');
                    } else {
                        setError(`Password Wrong. (DB expects: ${data.owner_pass})`);
                    }
                } else {
                    setError(`House ID '${houseId.toUpperCase()}' Not Found in DB.`);
                }
            }
            else {
                // TENANT LOGIN LOGIC
                const cleanCode = password.trim();
                console.log(`Trying Login: House=${houseId}, Code=${cleanCode}`);
                
                const { data, error } = await supabase.from('tenants').select('*').eq('house_id', houseId.toUpperCase()).eq('link_code', cleanCode).single();

                if (data) {
                    sessionStorage.setItem('active_house_id', houseId.toUpperCase());
                    sessionStorage.setItem('role', 'TENANT');
                    sessionStorage.setItem('tenant_id', data.id);
                    sessionStorage.setItem('tenant_name', data.name);
                    router.push('/tenant');
                } else {
                    setError(`Code Failed. Invalid House ID or Access Code.`);
                }
            }

        } catch (e) {
            console.error(e);
            setError("Connection Failed");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center glass-panel-inner p-4">
            <Card className="w-full max-w-md shadow-xl border-t-4 border-blue-600">
                <CardHeader className="text-center pb-2">
                    <div className="flex justify-center mb-4">
                        <div className="bg-blue-100 p-3 rounded-full">
                            <Zap className="h-8 w-8 text-blue-600 fill-blue-600" />
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold text-white">Smart Grid Login</CardTitle>

                    {/* TABS */}
                    <div className="flex glass-panel-inner text-white p-1 rounded mt-4">
                        <button
                            onClick={() => setMode('OWNER')}
                            className={`flex-1 py-1 text-sm font-bold rounded ${mode === 'OWNER' ? 'glass-panel text-white shadow text-blue-600' : 'text-blue-300'}`}
                        >
                            Owner
                        </button>
                        <button
                            onClick={() => setMode('TENANT')}
                            className={`flex-1 py-1 text-sm font-bold rounded ${mode === 'TENANT' ? 'glass-panel text-white shadow text-orange-600' : 'text-blue-300'}`}
                        >
                            Tenant
                        </button>
                    </div>

                </CardHeader>
                <CardContent>
                    <form onSubmit={handleLogin} className="space-y-4">

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-blue-100 flex items-center gap-1">
                                <Home className="h-4 w-4" /> House ID
                            </label>
                            <input
                                type="text"
                                placeholder="Ex: HOUSE_001"
                                className="w-full p-3 border rounded-lg uppercase text-white glass-panel text-white"
                                value={houseId}
                                onChange={(e) => setHouseId(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-blue-100 flex items-center gap-1">
                                <Lock className="h-4 w-4" /> {mode === 'OWNER' ? 'Password' : 'Access Code (4-Digits)'}
                            </label>
                            <input
                                type="password" // or text for code
                                placeholder={mode === 'OWNER' ? "••••••" : "Ex: 5544"}
                                className="w-full p-3 border rounded-lg text-white glass-panel text-white"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        {error && <p className="text-red-500 text-sm text-center font-medium bg-red-50 p-2 rounded">{error}</p>}

                        <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all shadow-md hover:shadow-lg"
                        >
                            Access Dashboard
                        </button>

                        <div className="text-xs text-center text-blue-300 mt-4">
                            Beta Version 2.0 | Multi-House Support
                            <br />
                            <a href="/admin" className="text-slate-300 hover:text-blue-300 mt-2 inline-block">Company Admin?</a>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
