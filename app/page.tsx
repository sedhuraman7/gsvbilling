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
  const [billingHistory, setBillingHistory] = useState<any[]>([]);
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
  const [includeOwner, setIncludeOwner] = useState(true);
  const [calcMode, setCalcMode] = useState<'FLAT' | 'TNEB'>('FLAT');

  // CALCULATIONS
  const totalUnits = systemData.energy_kwh || systemData.total_runtime_today || 0;

  const calculateBillValue = () => {
    if (calcMode === 'FLAT') return isNaN(totalUnits * ratePerUnit) ? "0" : (totalUnits * ratePerUnit).toFixed(0);

    // TNEB SLAB Logic (Generic TN Tariff 2024 approximation)
    // 0-100 Free, 101-200@2.25, 201-400@4.5, 401-500@6, >500@8+
    // Fixed approximation
    let u = totalUnits;
    let bill = 0;
    if (u > 100) bill += (Math.min(u, 200) - 100) * 2.25;
    if (u > 200) bill += (Math.min(u, 400) - 200) * 4.50;
    if (u > 400) bill += (Math.min(u, 500) - 400) * 6.00;
    if (u > 500) bill += (u - 500) * 8.00; // Simplified top tier
    return bill.toFixed(0);
  };
  const calculatedBill = calculateBillValue();

  const uiSplitAmount = (() => {
    const total = manualBillAmount ? Number(manualBillAmount) : Number(calculatedBill);
    const tenantCount = Object.keys(tenants).length;
    const divider = tenantCount + (includeOwner ? 1 : 0);
    return divider === 0 ? "0" : (total / divider).toFixed(0);
  })();

  // HEARTBEAT LOGIC
  const [lastUpdate, setLastUpdate] = useState(Date.now()); // Start with optimistic "Online"

  // AUTH CHECK & DATA FETCH
  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return;

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
        setLastUpdate(Date.now()); // Update heartbeat
      }
    });

    const userRef = ref(db, `houses/${activeHouse}/tenants`);
    const unsubUser = onValue(userRef, (snapshot) => {
      if (snapshot.exists()) setTenants(snapshot.val());
      else setTenants({});
    });

    const historyRef = ref(db, `houses/${activeHouse}/billing_history`);
    const unsubHistory = onValue(historyRef, (snapshot) => {
      // ... (existing history logic)
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list = Object.values(data).reverse();
        setBillingHistory(list);
      } else setBillingHistory([]);
    });

    // Heartbeat Checker (Increased Tolerance to 25s)
    const interval = setInterval(() => {
      if (Date.now() - lastUpdate > 25000) {
        setConnected(false);
      } else {
        setConnected(true);
      }
    }, 1000);

    return () => { unsubSystem(); unsubUser(); unsubHistory(); clearInterval(interval); };
  }, [router, lastUpdate]);

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

    // Message construction
    const tenantCount = Object.keys(tenants).length;
    const peopleCount = tenantCount + (includeOwner ? 1 : 0);
    const msg = `📢 Send Bill of ₹${finalAmount}?\n\nSplit among ${peopleCount} people (${tenantCount} Tenants + ${includeOwner ? 'Owner' : '0'}).\n\nEach Person Pays: ₹${uiSplitAmount}`;

    if (!confirm(msg)) return;

    setLoading(true);
    try {
      const res = await fetch('/api/actions/generate-bill', {
        method: 'POST',
        body: JSON.stringify({
          totalAmount: Number(finalAmount),
          month: currentMonth,
          houseId: houseId,
          includeOwner: includeOwner
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
              {/* MODE TOGGLE */}
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button onClick={() => setCalcMode('FLAT')} className={`flex-1 py-1 text-xs font-bold rounded-md transition-all ${calcMode === 'FLAT' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Flat Rate</button>
                <button onClick={() => setCalcMode('TNEB')} className={`flex-1 py-1 text-xs font-bold rounded-md transition-all ${calcMode === 'TNEB' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>TNEB Slab</button>
              </div>

              {calcMode === 'FLAT' && (
                <div>
                  <label className="text-xs font-bold text-slate-600 ml-1">Rate per Unit (₹)</label>
                  <input
                    type="number"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-sm focus:ring-2 ring-blue-500 outline-none transition-all"
                    value={ratePerUnit}
                    onChange={(e) => setRatePerUnit(Number(e.target.value))}
                  />
                </div>
              )}
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

            <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
              <input
                type="checkbox"
                id="includeOwner"
                checked={includeOwner}
                onChange={(e) => setIncludeOwner(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="includeOwner" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                Include Owner in Split? <span className="text-blue-500 font-normal">( Pays ₹{uiSplitAmount} )</span>
              </label>
            </div>


            <button
              onClick={handleGenerateBill}
              disabled={loading}
              className={`w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-blue-500/30 transition-all transform active:scale-[0.98] ${loading ? 'bg-slate-400' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'}`}
            >
              {loading ? 'Processing...' : `🚀 Send Bill (₹${manualBillAmount || calculatedBill})`}
            </button>

            <p className="text-[10px] text-slate-400 text-center leading-relaxed">
              * This will notify all tenants via Email & Telegram.
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

        {/* 4. BILLING HISTORY */}
        <div className="md:col-span-3 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mt-6 md:mt-0">
          <h3 className="font-bold text-lg flex items-center gap-2 text-slate-700 mb-4">
            📜 Billing History
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3">Total Bill</th>
                  <th className="px-4 py-3">Tenants</th>
                  <th className="px-4 py-3 text-right">Per Head</th>
                  <th className="px-4 py-3 text-right">Generated At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {billingHistory.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-4 text-slate-400">No history found. Generate a bill first.</td></tr>
                )}
                {billingHistory.map((h: any, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-700">{h.month}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">₹{h.total_amount}</td>
                    <td className="px-4 py-3 text-slate-500">{h.active_tenants} Active</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">₹{h.split_amount}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-400">{new Date(h.generated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div >
  );
}
