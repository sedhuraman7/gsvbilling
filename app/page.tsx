"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { ref, onValue, set } from 'firebase/database';
import {
  Zap,
  Activity,
  Users,
  Settings,
  Trash2,
  LogOut,
  Home as HomeIcon,
  Plus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  const router = useRouter();
  const [houseId, setHouseId] = useState<string | null>(null);

  // REAL SYSTEM DATA
  const [systemData, setSystemData] = useState({
    voltage: 0,
    current: 0,
    motor_status: 'OFF',
    active_meter: 1,
    total_runtime_today: 0,
    energy_kwh: 0,
    unit_price: 7 // Default if not in DB
  });

  const [tenants, setTenants] = useState<any>({});
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  // MANUAL ADD FORM
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantEmail, setNewTenantEmail] = useState('');
  const [newTenantRoom, setNewTenantRoom] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // BILLING STATE
  const [ratePerUnit, setRatePerUnit] = useState(7);
  const [manualBillAmount, setManualBillAmount] = useState('');

  // CALCULATIONS
  // Use energy_kwh if available, else proxy from runtime
  const totalUnits = systemData.energy_kwh || systemData.total_runtime_today || 0;
  const calculatedBill = (totalUnits * ratePerUnit).toFixed(0);

  // AUTH CHECK & DATA FETCH
  useEffect(() => {
    const activeHouse = sessionStorage.getItem('active_house_id');
    if (!activeHouse) {
      router.push('/login');
      return;
    }
    setHouseId(activeHouse);

    const dataRef = ref(db, `houses/${activeHouse}/system_status`);
    const unsubSystem = onValue(dataRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        setSystemData(prev => ({ ...prev, ...val }));
        setConnected(true);
      } else setConnected(false);
    });

    const userRef = ref(db, `houses/${activeHouse}/tenants`);
    const unsubUser = onValue(userRef, (snapshot) => {
      if (snapshot.exists()) setTenants(snapshot.val());
      else setTenants({});
    });

    return () => { unsubSystem(); unsubUser(); };
  }, [router]);

  // DELETE TENANT
  const handleDeleteTenant = async (chatId: string, name: string) => {
    if (!confirm(`Remove ${name} from ${houseId}?`)) return;
    try {
      await fetch(`/api/tenant?chatId=${chatId}&houseId=${houseId}`, { method: 'DELETE' });
    } catch (e) { alert("Delete failed"); }
  };

  // ADD MANUAL TENANT
  const handleAddManualTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!houseId) return;

    const manualId = `manual_${Date.now()}`;
    const linkCode = Math.floor(1000 + Math.random() * 9000);

    const newTenant = {
      label: newTenantName,
      email: newTenantEmail,
      role: 'TENANT',
      registeredAt: new Date().toISOString(),
      type: 'EMAIL_ONLY',
      room_id: newTenantRoom || 'N/A',
      link_code: linkCode
    };

    try {
      await set(ref(db, `houses/${houseId}/tenants/${manualId}`), newTenant);
      await fetch('/api/welcome', {
        method: 'POST',
        body: JSON.stringify({
          email: newTenantEmail,
          name: newTenantName,
          houseId: houseId,
          linkCode: linkCode,
          address: newTenantRoom
        })
      });
      setNewTenantName(''); setNewTenantEmail(''); setNewTenantRoom(''); setShowAddForm(false);
      alert(`✅ Added! Welcome Email Sent.`);
    } catch (e) { alert("Failed to add tenant"); }
  };

  // GENERATE BILL (NEW LOGIC)
  const handleGenerateBill = async () => {
    if (!houseId) return;
    const finalAmount = manualBillAmount || calculatedBill;
    const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

    if (!confirm(`📢 Send Monthly Bill of ₹${finalAmount} to all ${Object.keys(tenants).length} tenants?`)) return;

    setLoading(true);
    try {
      const res = await fetch('/api/actions/generate-bill', {
        method: 'POST',
        body: JSON.stringify({
          totalAmount: Number(finalAmount),
          month: currentMonth,
          houseId: houseId
        })
      });
      const data = await res.json();
      if (data.success) alert(`✅ Bill Sent! Logs: \n${JSON.stringify(data.logs)}`);
      else alert('❌ Failed: ' + data.error);
    } catch (e) { console.error(e); alert('Error sending bill'); }
    setLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.clear();
    router.push('/login');
  };

  if (!houseId) return <div className="p-10 text-center text-black">Loading House Data...</div>;

  const tenantList = Object.entries(tenants);
  const activeMeter = (new Date().getMonth() % 3) + 1;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900 pb-20">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2 text-slate-800">
            <Zap className="h-8 w-8 text-yellow-500 fill-yellow-500" />
            Smart Grid: {houseId}
          </h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2 font-medium">
            <HomeIcon className="h-4 w-4" /> Managing: <span className="font-bold text-blue-600">{houseId}</span>
            {connected
              ? <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full text-xs border border-green-200">● Online</span>
              : <span className="text-red-500 bg-red-50 px-2 py-0.5 rounded-full text-xs border border-red-200">○ Offline</span>
            }
          </p>
        </div>

        <div className="flex gap-3 items-center">
          <div className="text-right hidden md:block">
            <p className="text-xs text-slate-400 font-bold uppercase">Motor Status</p>
            <p className={`font-mono font-bold ${systemData.motor_status === 'ON' ? 'text-green-600' : 'text-slate-600'}`}>
              {systemData.motor_status === 'ON' ? 'RUNNING' : 'STOPPED'}
            </p>
          </div>
          <button onClick={handleLogout} className="p-3 bg-slate-100 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* 1. TENANT LIST */}
        <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-lg flex items-center gap-2 text-slate-700">
              <Users className="h-5 w-5 text-blue-600" />
              Tenants ({tenantList.length})
            </h3>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="text-xs bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center gap-1 shadow-blue-200 shadow-lg transition-all"
            >
              <Plus className="h-3 w-3" /> Add Tenant
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddManualTenant} className="mb-6 bg-slate-50 p-5 rounded-xl border border-blue-200 shadow-inner">
              <h4 className="font-bold text-sm mb-3 text-slate-700">Add New Tenant</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input className="p-2.5 border rounded-lg text-sm outline-none focus:ring-2 ring-blue-500" placeholder="Name" value={newTenantName} onChange={e => setNewTenantName(e.target.value)} required />
                <input className="p-2.5 border rounded-lg text-sm outline-none focus:ring-2 ring-blue-500" placeholder="Email" value={newTenantEmail} onChange={e => setNewTenantEmail(e.target.value)} required type="email" />
                <input className="p-2.5 border rounded-lg text-sm outline-none focus:ring-2 ring-blue-500" placeholder="Room No" value={newTenantRoom} onChange={e => setNewTenantRoom(e.target.value)} required />
                <button type="submit" className="bg-slate-900 text-white rounded-lg font-bold text-sm hover:bg-black">Save</button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {tenantList.length === 0 && !showAddForm && (
              <div className="text-center py-10 text-slate-400 text-sm">No tenants added yet.</div>
            )}
            {tenantList.map(([id, t]: any) => (
              <div key={id} className="flex justify-between items-center p-4 bg-white border border-slate-100 rounded-xl hover:shadow-md transition-all">
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-bold text-lg ${t.type === 'EMAIL_ONLY' ? 'bg-orange-50 text-orange-600' : 'bg-indigo-50 text-indigo-600'}`}>
                    {t.label ? t.label.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">{t.label} <span className="text-slate-400 font-normal text-xs ml-1">({t.room_id || 'No Room'})</span></div>
                    <div className="text-xs text-slate-500">{t.email}</div>
                    <div className="text-[10px] mt-1 font-mono text-slate-400">
                      {t.type === 'EMAIL_ONLY' ? `Code: ${t.link_code}` : 'Telegram Active'}
                    </div>
                  </div>
                </div>
                <button onClick={() => handleDeleteTenant(id, t.label)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 2. BILL CALCULATOR */}
        <Card className="bg-white border-none shadow-xl shadow-blue-900/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
              <span className="bg-blue-100 p-1.5 rounded-lg text-blue-600"><Zap className="w-4 h-4" /></span>
              Bill Calculator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Consumption</p>
                <p className="font-bold text-xl text-slate-800">{String(totalUnits)} <span className="text-sm font-normal text-slate-500">kWh</span></p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Est. Cost</p>
                <p className="font-bold text-xl text-slate-400 line-through Decoration-slate-300">₹{calculatedBill}</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-bold text-slate-600 ml-1">Rate per Unit (₹)</label>
                <input
                  type="number"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-sm focus:ring-2 ring-blue-500 outline-none transition-all"
                  value={ratePerUnit}
                  onChange={(e) => setRatePerUnit(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-green-700 ml-1 flex justify-between">
                  <span>Final Bill Amount</span>
                  <span className="bg-green-100 text-green-700 px-1.5 rounded text-[10px]">EDITABLE</span>
                </label>
                <input
                  type="number"
                  className="w-full p-3 border-2 border-green-400 rounded-xl font-bold text-xl text-green-800 focus:ring-4 ring-green-500/20 outline-none transition-all"
                  placeholder={`₹${calculatedBill}`}
                  value={manualBillAmount}
                  onChange={(e) => setManualBillAmount(e.target.value)}
                />
              </div>
            </div>

            <button
              onClick={handleGenerateBill}
              disabled={loading}
              className={`w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-blue-500/30 transition-all transform active:scale-[0.98] ${loading ? 'bg-slate-400' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'}`}
            >
              {loading ? 'Processing...' : `🚀 Send Bill (₹${manualBillAmount || calculatedBill})`}
            </button>

            <p className="text-[10px] text-slate-400 text-center leading-relaxed">
              * This will notify all tenants via Email & Telegram with their specific split amount.
            </p>
          </CardContent>
        </Card>

        {/* 3. METRICS */}
        <div className="md:col-span-3 bg-slate-900 text-white p-8 rounded-3xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

          <div className="flex justify-between items-center mb-6 relative z-10">
            <h3 className="text-slate-400 text-sm font-bold flex items-center gap-2 uppercase tracking-widest">
              <Activity className="h-4 w-4 text-blue-500" /> Live Metrics ({houseId})
            </h3>
            <span className="text-xs bg-black/30 px-3 py-1 rounded-full border border-white/10 text-slate-300">Meter ID: {activeMeter}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 relative z-10">
            <div className="space-y-1">
              <span className="text-slate-500 text-[10px] uppercase font-bold">Voltage</span>
              <div className="text-4xl font-mono text-white">{systemData.voltage}<span className="text-lg text-slate-500 ml-1">V</span></div>
            </div>
            <div className="space-y-1">
              <span className="text-slate-500 text-[10px] uppercase font-bold">Current Load</span>
              <div className="text-4xl font-mono text-yellow-400">{systemData.current}<span className="text-lg text-yellow-600 ml-1">A</span></div>
            </div>
            <div className="space-y-1">
              <span className="text-slate-500 text-[10px] uppercase font-bold">Runtime Today</span>
              <div className="text-4xl font-mono text-blue-400">{systemData.total_runtime_today}<span className="text-lg text-blue-600 ml-1">h</span></div>
            </div>
            <div className="space-y-1">
              <span className="text-slate-500 text-[10px] uppercase font-bold">Total Energy</span>
              <div className="text-4xl font-mono text-green-400">{systemData.energy_kwh}<span className="text-lg text-green-600 ml-1">kWh</span></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
