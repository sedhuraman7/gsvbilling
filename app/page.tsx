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
  const [manualBillAmount, setManualBillAmount] = useState(''); // Serves as "Total Bill" in Reverse mode
  const [includeOwner, setIncludeOwner] = useState(true);
  const [rateType, setRateType] = useState<'FIXED' | 'TNEB'>('TNEB');
  const [billMode, setBillMode] = useState<'AUTO' | 'REVERSE'>('AUTO');

  // CALCULATIONS
  // CALCULATIONS
  const totalUnits = systemData.energy_kwh || systemData.total_runtime_today || 0;

  // 1. Calculate Device Cost (Based on FIXED rate or TNEB Slab)
  const calculateDeviceCost = () => {
    // FIXED RATE
    if (rateType === 'FIXED') {
      return (totalUnits * ratePerUnit).toFixed(0);
    }
    // TNEB SLAB
    let u = totalUnits;
    let bill = 0;
    if (u === 0) return "0";
    if (u > 100) bill += (Math.min(u, 200) - 100) * 2.25;
    if (u > 200) bill += (Math.min(u, 400) - 200) * 4.50;
    if (u > 400) bill += (Math.min(u, 500) - 400) * 6.00;
    if (u > 500) bill += (u - 500) * 8.00;
    return bill.toFixed(0);
  };

  const deviceCost = calculateDeviceCost();

  // 2. Determine Split Amount
  const uiSplitAmount = (() => {
    const totalInput = Number(manualBillAmount) || 0;
    const devCost = Number(deviceCost);

    // In AUTO: We split the DEVICE COST.
    // In REVERSE: We split (TOTAL BILL - DEVICE COST).
    const amountToSplit = billMode === 'AUTO' ? devCost : Math.max(0, totalInput - devCost);

    const tenantCount = Object.keys(tenants).length;
    const divider = tenantCount + (includeOwner ? 1 : 0);
    return divider === 0 ? "0" : (amountToSplit / divider).toFixed(0);
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

    // Determine the "Billing Amount" (The amount to be SPLIT)
    const totalInput = Number(manualBillAmount) || 0;
    const devCost = Number(deviceCost);
    const billableAmount = billMode === 'AUTO' ? devCost : Math.max(0, totalInput - devCost);

    const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

    // Message construction
    const tenantCount = Object.keys(tenants).length;
    const peopleCount = tenantCount + (includeOwner ? 1 : 0);
    const msg = `📢 Send Bill for ₹${billableAmount}?\n\n` +
      (billMode === 'REVERSE' ? `(Total ₹${totalInput} - Device ₹${devCost})\n` : `(Device Usage Only)\n`) +
      `Split among ${peopleCount} people.\nEach Person Pays: ₹${uiSplitAmount}`;

    if (!confirm(msg)) return;

    setLoading(true);
    try {
      const res = await fetch('/api/actions/generate-bill', {
        method: 'POST',
        body: JSON.stringify({
          totalAmount: Number(billableAmount), // Send the SPLITTABLE amount
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
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
              <span className="bg-blue-100 p-1.5 rounded-lg text-blue-600"><Zap className="w-4 h-4" /></span>
              Bill Calculator
            </CardTitle>

            {/* RATE TYPE TOGGLE */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button onClick={() => setRateType('FIXED')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${rateType === 'FIXED' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Fixed</button>
              <button onClick={() => setRateType('TNEB')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${rateType === 'TNEB' ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}>TNEB</button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">

            {/* MODE TOGGLE (Auto / Reverse) */}
            <div className="flex justify-center">
              <div className="flex bg-slate-100 p-1 rounded-lg shadow-inner">
                <button onClick={() => setBillMode('AUTO')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${billMode === 'AUTO' ? 'bg-white shadow text-slate-800' : 'text-slate-400'}`}>Auto</button>
                <button onClick={() => setBillMode('REVERSE')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${billMode === 'REVERSE' ? 'bg-purple-100 text-purple-700 shadow border border-purple-200' : 'text-slate-400 hover:text-purple-500'}`}>Reverse</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* LEFT: UNITS */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-center">
                <p className="text-slate-400 text-[10px] uppercase font-bold tracking-wider mb-1">Total House Units</p>
                <div className="flex items-baseline gap-1">
                  <span className="font-extrabold text-3xl text-slate-800">{String(totalUnits)}</span>
                  <span className="text-sm font-medium text-slate-500">kWh</span>
                </div>
              </div>

              {/* RIGHT: BILL AMOUNT */}
              <div className={`p-4 rounded-xl border flex flex-col justify-center transition-all ${billMode === 'REVERSE' ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-100'}`}>
                <p className={`text-[10px] uppercase font-bold tracking-wider mb-1 ${billMode === 'REVERSE' ? 'text-green-600' : 'text-slate-400'}`}>
                  {billMode === 'REVERSE' ? 'Total EB Bill (Input)' : 'Device Cost'}
                </p>

                {billMode === 'REVERSE' ? (
                  <div className="flex items-center gap-1">
                    <span className="text-green-600 font-bold text-xl">₹</span>
                    <input
                      className="bg-transparent font-extrabold text-3xl text-green-700 w-full outline-none placeholder-green-700/30"
                      placeholder="0"
                      value={manualBillAmount}
                      onChange={(e) => setManualBillAmount(e.target.value)}
                      type="number"
                    />
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="font-extrabold text-3xl text-slate-800">₹{deviceCost}</span>
                    {rateType === 'FIXED' && <span className="text-xs text-slate-400">(Fixed Rate)</span>}
                  </div>
                )}
              </div>
            </div>

            {/* TNEB SLAB DETAILS (Only if TNEB) */}
            {rateType === 'TNEB' && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-600">TNEB Domestic</span>
                  <span className="bg-slate-200 px-2 py-0.5 rounded text-[10px] font-bold text-slate-500">Bi-Monthly</span>
                </div>
                <div className="flex justify-between text-slate-500 font-mono">
                  <span>0-100 units</span>
                  <span className="text-green-600 font-bold">FREE</span>
                </div>
                <div className="flex justify-between font-mono pt-2 border-t border-dashed border-slate-200">
                  <span className="font-bold text-purple-700">Applied Slab:</span>
                  <span className="font-bold text-purple-700">
                    {totalUnits > 500 ? '>500 (@ ₹8+)' :
                      totalUnits > 400 ? '401-500 (@ ₹6.00)' :
                        totalUnits > 200 ? '201-400 (@ ₹4.50)' :
                          totalUnits > 100 ? '101-200 (@ ₹2.25)' : 'Base Slab'}
                  </span>
                </div>
              </div>
            )}

            {/* FIXED RATE INPUT (Only if Fixed) */}
            {rateType === 'FIXED' && (
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                <label className="text-xs font-bold text-slate-500 whitespace-nowrap">Fixed Rate (₹)</label>
                <input
                  type="number"
                  className="w-full bg-transparent border-b border-slate-200 text-sm font-mono focus:border-blue-500 outline-none"
                  value={ratePerUnit}
                  onChange={(e) => setRatePerUnit(Number(e.target.value))}
                />
              </div>
            )}

            {/* OWNER SPLIT CHECKBOX */}
            <div className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="includeOwner"
                checked={includeOwner}
                onChange={(e) => setIncludeOwner(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <div className="flex flex-col leading-tight">
                <label htmlFor="includeOwner" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                  Include Owner in Split?
                </label>
                <span className="text-[10px] text-blue-500 font-medium">
                  Each person pays: <span className="font-bold">₹{uiSplitAmount}</span>
                  {billMode === 'REVERSE' && <span className="text-slate-400 ml-1">(Total - Device)</span>}
                </span>
              </div>
            </div>


            <button
              onClick={handleGenerateBill}
              disabled={loading}
              className={`w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-blue-500/30 transition-all transform active:scale-[0.98] ${loading ? 'bg-slate-400' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'}`}
            >
              {loading ? 'Processing...' : `🚀 Send Bill (₹${billMode === 'REVERSE' ? manualBillAmount : deviceCost})`}
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
    </div>
  );
}
