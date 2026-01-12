"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { ref, onValue, push, set } from 'firebase/database';
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
    energy_kwh: 0
  });

  const [tenants, setTenants] = useState<any>({});
  const [connected, setConnected] = useState(false);

  // MANUAL ADD FORM
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantEmail, setNewTenantEmail] = useState('');
  const [newTenantRoom, setNewTenantRoom] = useState(''); // NEW FIELD
  const [showAddForm, setShowAddForm] = useState(false);

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
        setSystemData(snapshot.val());
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

    // Create a unique ID for manual user (email-based)
    const manualId = `manual_${Date.now()}`;
    // Generate Simple 4-digit code for Link
    const linkCode = Math.floor(1000 + Math.random() * 9000);

    const newTenant = {
      label: newTenantName,
      email: newTenantEmail,
      role: 'TENANT',
      registeredAt: new Date().toISOString(),
      type: 'EMAIL_ONLY',
      room_id: newTenantRoom || 'N/A',
      link_code: linkCode // Save code
    };

    try {
      // Direct Firebase Write for speed (Client Side is owned by Owner)
      await set(ref(db, `houses/${houseId}/tenants/${manualId}`), newTenant);

      // SEND WELCOME EMAIL
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

      setNewTenantName('');
      setNewTenantEmail('');
      setNewTenantRoom('');
      setShowAddForm(false);
      alert(`✅ Added! Welcome Email Sent to ${newTenantEmail}`);
    } catch (e) {
      alert("Failed to add tenant");
    }
  };

  // GENERATE BILL
  const handleGenerateBill = async () => {
    if (!houseId) return;
    const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
    const amount = prompt(`Enter Bill Amount for ${currentMonth}:`, "1500");
    if (!amount) return;

    try {
      const res = await fetch('/api/actions/generate-bill', {
        method: 'POST',
        body: JSON.stringify({
          totalAmount: Number(amount),
          month: currentMonth,
          houseId: houseId
        })
      });
      alert(`✅ Bill Sent!`);
    } catch (e) { alert("Failed"); }
  };

  const handleLogout = () => {
    sessionStorage.clear();
    router.push('/login');
  };

  if (!houseId) return <div className="p-10 text-center text-black">Loading House Data...</div>;

  const tenantList = Object.entries(tenants);
  const activeMeter = (new Date().getMonth() % 3) + 1;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10 font-sans text-slate-900">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Zap className="h-8 w-8 text-yellow-500 fill-yellow-500" />
            Smart Grid: {houseId}
          </h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
            <HomeIcon className="h-4 w-4" /> Managing: <span className="font-bold">{houseId}</span>
            {connected
              ? <span className="text-green-600 bg-green-50 px-2 rounded-full text-xs ml-2">● Online</span>
              : <span className="text-red-500 bg-red-50 px-2 rounded-full text-xs ml-2">○ Offline (Check Hardware)</span>
            }
          </p>
        </div>

        <div className="flex gap-3">
          <div className={`px-4 py-2 rounded-full font-bold flex items-center ${systemData.motor_status === 'ON' ? 'bg-green-100 text-green-700 animate-pulse' : 'bg-slate-200 text-slate-500'}`}>
            Motor: {systemData.motor_status === 'ON' ? 'RUNNING' : 'OFF'}
          </div>
          <button onClick={handleLogout} className="p-2 bg-white border rounded-full hover:bg-slate-100 text-slate-600">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* 1. Tenant Manager */}
        <div className="md:col-span-2 bg-white p-6 rounded-2xl shadow-sm border">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Tenants ({tenantList.length})
            </h3>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded font-bold hover:bg-blue-100 flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Add Manually
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleAddManualTenant} className="mb-4 bg-slate-50 p-4 rounded-xl border border-blue-100">
              <h4 className="font-bold text-sm mb-2">Add New Tenant (No Telegram)</h4>
              <div className="flex gap-2">
                <input
                  className="flex-1 p-2 border rounded text-sm text-black"
                  placeholder="Name (e.g., Ram)"
                  value={newTenantName}
                  onChange={e => setNewTenantName(e.target.value)}
                  required
                />
                <input
                  className="flex-1 p-2 border rounded text-sm text-black"
                  placeholder="Email (e.g., ram@gmail.com)"
                  value={newTenantEmail}
                  onChange={e => setNewTenantEmail(e.target.value)}
                  required
                  type="email"
                />
                <input
                  className="w-24 p-2 border rounded text-sm text-black"
                  placeholder="Room No"
                  value={newTenantRoom}
                  onChange={e => setNewTenantRoom(e.target.value)}
                  required
                />
                <button type="submit" className="bg-blue-600 text-white px-4 rounded font-bold text-sm">Save</button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {tenantList.length === 0 && !showAddForm && (
              <div className="text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-500 font-medium">No tenants yet.</p>
                <p className="text-xs text-slate-400 mt-1">Add details manually or ask them to join via Telegram.</p>
              </div>
            )}

            {tenantList.map(([id, t]: any) => (
              <div key={id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg group hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-slate-100">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold ${t.type === 'EMAIL_ONLY' ? 'bg-orange-100 text-orange-600' : 'bg-indigo-100 text-indigo-600'}`}>
                    {t.label ? t.label.charAt(0) : 'U'}
                  </div>
                  <div>
                    <div className="font-bold text-sm">{t.label || "Unknown Users"}</div>
                    <div className="text-xs text-slate-500">
                      {t.type === 'EMAIL_ONLY' ?
                        <span className="text-orange-600 bg-orange-50 px-1 rounded">
                          Link Code: {t.link_code || 'N/A'}
                        </span>
                        : `📱 Telegram User`
                      }
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.email}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteTenant(id, t.label)}
                  className="px-3 py-1 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-600 hover:text-white rounded-md transition-colors flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* --- BILL GENERATOR SECTION --- */}
        <Card className="bg-white border-l-4 border-l-blue-500 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <span className="bg-blue-100 p-1 rounded text-blue-600">⚡</span>
              Bill Calculator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-slate-50 p-2 rounded">
                <p className="text-slate-500 text-xs">Units Consumed</p>
                <p className="font-bold text-lg">{totalUnits} kWh</p>
              </div>
              <div className="bg-slate-50 p-2 rounded">
                <p className="text-slate-500 text-xs">Est. Cost</p>
                <p className="font-bold text-lg text-slate-400">₹{calculatedBill}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-700">Rate / Unit (₹)</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded font-mono"
                  value={ratePerUnit}
                  onChange={(e) => setRatePerUnit(Number(e.target.value))}
                />
              </div>
              <div className="flex-[2]">
                <label className="text-xs font-bold text-green-700">Final Bill Amount (Editable)</label>
                <input
                  type="number"
                  className="w-full p-2 border-2 border-green-400 rounded font-bold text-lg text-green-800"
                  placeholder={`₹${calculatedBill}`}
                  value={manualBillAmount}
                  onChange={(e) => setManualBillAmount(e.target.value)}
                />
              </div>
            </div>

            <button
              onClick={handleGenerateBill}
              disabled={loading}
              className={`w-full py-3 rounded-lg font-bold text-white shadow-lg transition-all ${loading ? 'bg-slate-400' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-[1.02]'}`}
            >
              {loading ? 'Sending...' : `🚀 Send Bill (₹${manualBillAmount || calculatedBill})`}
            </button>

            <div className="text-[10px] text-slate-400 text-center">
              * Includes automated alerts via Email & Telegram
            </div>
          </CardContent>
        </Card>

        {/* 3. Metrics */}
        <div className="md:col-span-3 bg-slate-900 text-white p-6 rounded-2xl shadow-lg mt-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-slate-400 text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> LIVE METRICS ({houseId})
            </h3>
            <span className="text-xs bg-slate-800 px-2 py-1 rounded">Active Meter: {activeMeter}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <span className="text-slate-400 text-xs uppercase tracking-wider block mb-1">Voltage</span>
              <span className="text-3xl font-mono">{systemData.voltage} V</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs uppercase tracking-wider block mb-1">Load</span>
              <span className="text-3xl font-mono text-yellow-500">{systemData.current} A</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs uppercase tracking-wider block mb-1">Today</span>
              <span className="text-3xl font-mono text-blue-400">{systemData.total_runtime_today || 0} h</span>
            </div>
            <div>
              <span className="text-slate-400 text-xs uppercase tracking-wider block mb-1">Total Energy</span>
              <span className="text-3xl font-mono text-green-400">{systemData.energy_kwh || 0} kwh</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
