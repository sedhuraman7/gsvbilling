"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Zap,
  Activity,
  Users,
  Settings,
  Trash2,
  LogOut,
  Home as HomeIcon,
  Plus,
  Droplets,
  Power
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
    unit_price: 7,
    water_level_pct: 0 // Default if not in DB
  });

  const [tenants, setTenants] = useState<any>({});
  const [billingHistory, setBillingHistory] = useState<any[]>([]);
  const [motorLogs, setMotorLogs] = useState<any[]>([]);
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
  // HELPER: Reverse TNEB Calculation (Bill Amount -> Units)
  const getUnitsFromBill = (amount: number) => {
    let bill = amount;
    if (bill <= 0) return 0;

    // Reverse TNEB Logic
    // Slabs:
    // 0-100: 0
    // 101-200: 2.25
    // 201-400: 4.50
    // 401-500: 6.00
    // >500: 8.00

    // Max cost for first 200 units (100*0 + 100*2.25) = 225
    if (bill <= 225) {
      if (bill === 0) return 100; // Ambiguous, but let's assume if 0 cost, it's <= 100.
      return 100 + (bill / 2.25);
    }

    // Max cost for first 400 units (225 + 200*4.50) = 225 + 900 = 1125
    if (bill <= 1125) {
      return 200 + ((bill - 225) / 4.50);
    }

    // Max cost for first 500 units (1125 + 100*6.00) = 1125 + 600 = 1725
    if (bill <= 1725) {
      return 400 + ((bill - 1125) / 6.00);
    }

    // Above 500
    return 500 + ((bill - 1725) / 8.00);
  };

  const deviceUnits = systemData.energy_kwh || systemData.total_runtime_today || 0; // The actual smart meter reading

  // LOGIC BRANCHING
  let displayTotalUnits = 0; // What we show in the big "Total Units" box
  let calculatedDeviceCost = "0";

  // Branch 1: REVERSE MODE (User enters Bill Amount -> We calc units)
  if (billMode === 'REVERSE') {
    const inputBill = Number(manualBillAmount) || 0;

    if (rateType === 'TNEB') {
      const calculatedHouseUnits = getUnitsFromBill(inputBill);
      displayTotalUnits = parseFloat(calculatedHouseUnits.toFixed(2));

      // Average Rate Calculation
      const avgRate = displayTotalUnits > 0 ? (inputBill / displayTotalUnits) : 0;
      calculatedDeviceCost = (deviceUnits * avgRate).toFixed(0);
    } else {
      // Reverse + Fixed Mode (Rare, but logic: Bill / FixedRate = Units)
      const rate = ratePerUnit || 1;
      displayTotalUnits = parseFloat((inputBill / rate).toFixed(2));
      calculatedDeviceCost = (deviceUnits * rate).toFixed(0);
    }
  }
  // Branch 2: AUTO MODE (User relies on Device Units -> We calc Bill)
  else {
    displayTotalUnits = deviceUnits;

    if (rateType === 'FIXED') {
      calculatedDeviceCost = (deviceUnits * ratePerUnit).toFixed(0);
    } else {
      // Forward TNEB Calculation
      let u = deviceUnits;
      let bill = 0;
      if (u > 100) bill += (Math.min(u, 200) - 100) * 2.25;
      if (u > 200) bill += (Math.min(u, 400) - 200) * 4.50;
      if (u > 400) bill += (Math.min(u, 500) - 400) * 6.00;
      if (u > 500) bill += (u - 500) * 8.00;
      calculatedDeviceCost = bill.toFixed(0);
    }
  }

  // 2. Determine Split Amount
  const uiSplitAmount = (() => {
    const totalInput = Number(manualBillAmount) || 0;
    const devCost = Number(calculatedDeviceCost);

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

    // Supabase System Status / Sensor Data
    const fetchSystem = async () => {
      const { data } = await supabase.from('sensor_data').select('*').order('created_at', { ascending: false }).limit(1).single();
      if (data) {
        setSystemData({
          voltage: data.voltage,
          current: data.current_amps,
          motor_status: data.motor_state,
          active_meter: 1,
          total_runtime_today: 0,
          energy_kwh: data.power_w / 1000,
          unit_price: 7,
          water_level_pct: data.water_level_pct || 0
        });
        setLastUpdate(Date.now());
      }
    };
    fetchSystem();

    const fetchTenants = async () => {
      const { data } = await supabase.from('tenants').select('*').eq('house_id', activeHouse);
      if (data) {
        const tMap: any = {};
        data.forEach(d => tMap[d.id] = { label: d.name, email: d.email, room_id: d.room_id, type: d.type, link_code: d.link_code });
        setTenants(tMap);
      }
    };
    fetchTenants();

    const fetchHistory = async () => {
      const { data } = await supabase.from('billing_history').select('*').eq('house_id', activeHouse).order('created_at', { ascending: false });
      if (data) setBillingHistory(data);
    };
    fetchHistory();

    const fetchMotorLogs = async () => {
      const { data } = await supabase.from('motor_logs').select('*').order('created_at', { ascending: false }).limit(5);
      if (data) setMotorLogs(data);
    };
    fetchMotorLogs();

    // Supabase Realtime subscriptions
    const sub = supabase.channel('public:sensor_data')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sensor_data' }, (payload) => {
        const data = payload.new;
        setSystemData({
          voltage: data.voltage,
          current: data.current_amps,
          motor_status: data.motor_state,
          active_meter: 1,
          total_runtime_today: 0,
          energy_kwh: data.power_w / 1000,
          unit_price: 7,
          water_level_pct: data.water_level_pct || 0
        });
        setLastUpdate(Date.now());
      }).subscribe();

    const logsSub = supabase.channel('public:motor_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'motor_logs' }, (payload) => {
        setMotorLogs(prev => [payload.new, ...prev].slice(0, 5));
      }).subscribe();

    // Heartbeat Checker
    const interval = setInterval(() => {
      if (Date.now() - lastUpdate > 25000) setConnected(false);
      else setConnected(true);
    }, 1000);

    return () => { supabase.removeChannel(sub); supabase.removeChannel(logsSub); clearInterval(interval); };
  }, [router, lastUpdate]);

  // MOTOR CONTROL
  const toggleMotor = async () => {
    const newCmd = systemData.motor_status === 'ON' ? 'MOTOR_OFF' : 'MOTOR_ON';
    setSystemData(prev => ({ ...prev, motor_status: 'UPDATING...' }));
    await supabase.from('commands').insert([{
      action: newCmd,
      mode: 'MANUAL',
      processed: false
    }]);
  };

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
      await supabase.from('tenants').insert([{
        house_id: houseId,
        name: newTenantName,
        email: newTenantEmail,
        room_id: newTenantRoom || 'N/A',
        link_code: String(linkCode),
        type: 'EMAIL_ONLY'
      }]);

      // SEND WELCOME EMAIL
      try {
        if (newTenantEmail) {
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
        }
      } catch (err) { console.error("Welcome mail failed"); }

      setNewTenantName(''); setNewTenantEmail(''); setNewTenantRoom(''); setShowAddForm(false);
      alert(`✅ Added to Supabase & Mail Sent!`);
    } catch (e) { alert("Failed to add tenant"); }
  };

  // GENERATE BILL (NEW LOGIC)
  const handleGenerateBill = async () => {
    if (!houseId) return;

    // Determine the "Billing Amount" (The amount to be SPLIT)
    const totalInput = Number(manualBillAmount) || 0;
    const devCost = Number(calculatedDeviceCost);
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
      const { error } = await supabase.from('billing_history').insert([{
        house_id: houseId,
        month: currentMonth,
        total_amount: Number(billableAmount),
        split_amount: Number(uiSplitAmount),
        active_tenants: tenantCount
      }]);
      
      if (!error) {
          // Send Emails & Telegrams
          const res = await fetch('/api/actions/generate-bill', {
            method: 'POST',
            body: JSON.stringify({
              totalAmount: Number(billableAmount),
              month: currentMonth,
              houseId: houseId,
              includeOwner: includeOwner
            })
          });
          const data = await res.json();
          alert(`✅ Bill Saved to History & Sent via Email! Logs: \n${JSON.stringify(data.logs || [])}`);
      }
      else alert('❌ Failed: ' + error.message);
    } catch (e) { console.error(e); alert('Error saving bill'); }
    setLoading(false);
  };

  const handleLogout = () => {
    sessionStorage.clear();
    router.push('/login');
  };

  if (!houseId) return <div className="p-10 text-center text-white">Loading House Data...</div>;

  const tenantList = Object.entries(tenants);
  const activeMeter = (new Date().getMonth() % 3) + 1;

  return (
    <div className="min-h-screen bg-transparent text-white p-4 md:p-8 font-sans text-white pb-20">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 glass-panel text-white p-4 rounded-xl shadow-lg shadow-black/20 border border-white/10">
        <div>
          <h1 className="text-2xl font-extrabold flex items-center gap-2 text-white">
            <Zap className="h-8 w-8 text-blue-500 fill-blue-500" />
            AquaSync: {houseId}
          </h1>
          <p className="text-sm text-blue-300 mt-1 flex items-center gap-2 font-medium">
            <HomeIcon className="h-4 w-4" /> Managing: <span className="font-bold text-blue-600">{houseId}</span>
            {connected
              ? <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full text-xs border border-green-200">● Online</span>
              : <span className="text-red-500 bg-red-50 px-2 py-0.5 rounded-full text-xs border border-red-200">○ Offline</span>
            }
          </p>
        </div>

        <div className="flex gap-3 items-center">
          <div className="text-right hidden md:block">
            <p className="text-xs text-blue-300 font-bold uppercase">Motor Status</p>
            <p className={`font-mono font-bold ${systemData.motor_status === 'ON' ? 'text-green-600' : 'text-blue-200'}`}>
              {systemData.motor_status === 'ON' ? 'RUNNING' : 'STOPPED'}
            </p>
          </div>
          <button onClick={handleLogout} className="p-3 glass-panel-inner hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">

        {/* 0. AQUASYNC SENSORS (WATER LEVEL & MOTOR) */}
        <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6 mb-2">
            
            {/* WATER LEVEL */}
            <div className="glass-panel text-white p-6 rounded-2xl shadow-lg border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-16 bg-blue-500/10 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none"></div>
                <h3 className="font-bold text-lg flex items-center gap-2 text-blue-100 self-start mb-6">
                    <Droplets className="h-5 w-5 text-blue-400" /> Water Level
                </h3>
                
                <div className="relative flex items-center justify-center w-40 h-40">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="283" strokeDashoffset={283 - (283 * systemData.water_level_pct) / 100} className="text-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-1000 ease-out" />
                    </svg>
                    <div className="absolute text-3xl font-extrabold text-white drop-shadow-md">
                        {systemData.water_level_pct}%
                    </div>
                </div>
            </div>

            {/* MOTOR CONTROL */}
            <div className="glass-panel text-white p-6 rounded-2xl shadow-lg border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute bottom-0 left-0 p-16 bg-indigo-500/10 rounded-full blur-2xl -ml-8 -mb-8 pointer-events-none"></div>
                <h3 className="font-bold text-lg flex items-center gap-2 text-blue-100 self-start mb-6">
                    <Power className="h-5 w-5 text-indigo-400" /> Motor Control
                </h3>
                
                <button 
                    onClick={toggleMotor}
                    disabled={systemData.motor_status === 'UPDATING...'}
                    className={`relative w-40 h-40 rounded-full flex flex-col items-center justify-center transition-all duration-300 ${
                        systemData.motor_status === 'ON' 
                        ? 'bg-blue-600/20 border-4 border-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]' 
                        : systemData.motor_status === 'UPDATING...' 
                        ? 'bg-slate-800/50 border-4 border-slate-600'
                        : 'bg-transparent border-4 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                    } group hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none`}
                >
                    <Power className={`h-10 w-10 mb-2 ${systemData.motor_status === 'ON' ? 'text-blue-400' : 'text-red-400'}`} />
                    <span className="text-2xl font-extrabold text-white tracking-widest">{systemData.motor_status}</span>
                </button>
                <p className="text-xs text-blue-300 mt-6 bg-black/20 px-4 py-1.5 rounded-full border border-white/5">Tap to override ESP32</p>
            </div>
        </div>

        {/* 1. TENANT LIST */}
        <div className="md:col-span-2 glass-panel text-white p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/10">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-lg flex items-center gap-2 text-blue-100">
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
            <form onSubmit={handleAddManualTenant} className="mb-6 bg-transparent text-white p-5 rounded-xl border border-blue-200 shadow-inner">
              <h4 className="font-bold text-sm mb-3 text-blue-100">Add New Tenant</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input className="p-2.5 border rounded-lg text-sm outline-none focus:ring-2 ring-blue-500" placeholder="Name" value={newTenantName} onChange={e => setNewTenantName(e.target.value)} required />
                <input className="p-2.5 border rounded-lg text-sm outline-none focus:ring-2 ring-blue-500" placeholder="Email" value={newTenantEmail} onChange={e => setNewTenantEmail(e.target.value)} required type="email" />
                <input className="p-2.5 border rounded-lg text-sm outline-none focus:ring-2 ring-blue-500" placeholder="Room No" value={newTenantRoom} onChange={e => setNewTenantRoom(e.target.value)} required />
                <button type="submit" className="glass-panel text-white text-white rounded-lg font-bold text-sm hover:bg-black">Save</button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {tenantList.length === 0 && !showAddForm && (
              <div className="text-center py-10 text-blue-300 text-sm">No tenants added yet.</div>
            )}
            {tenantList.map(([id, t]: any) => (
              <div key={id} className="flex justify-between items-center p-4 glass-panel text-white border border-white/10 rounded-xl hover:shadow-md transition-all">
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-xl flex items-center justify-center font-bold text-lg ${t.type === 'EMAIL_ONLY' ? 'bg-orange-50 text-orange-600' : 'bg-indigo-50 text-indigo-600'}`}>
                    {t.label ? t.label.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div>
                    <div className="font-bold text-white">{t.label} <span className="text-blue-300 font-normal text-xs ml-1">({t.room_id || 'No Room'})</span></div>
                    <div className="text-xs text-blue-300">{t.email}</div>
                    <div className="text-[10px] mt-1 font-mono text-blue-300">
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
        <div className="md:col-span-1 glass-panel text-white p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/10 flex flex-col relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <span className="bg-blue-100 p-1.5 rounded-lg text-blue-600"><Zap className="w-4 h-4" /></span>
              Bill Calculator
            </CardTitle>

            {/* RATE TYPE TOGGLE */}
            <div className="flex glass-panel-inner p-1 rounded-lg">
              <button onClick={() => setRateType('FIXED')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${rateType === 'FIXED' ? 'glass-panel text-white shadow text-blue-600' : 'text-blue-300'}`}>Fixed</button>
              <button onClick={() => setRateType('TNEB')} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${rateType === 'TNEB' ? 'glass-panel text-white shadow text-purple-600' : 'text-blue-300'}`}>TNEB</button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">

            {/* MODE TOGGLE (Auto / Reverse) */}
            <div className="flex justify-center">
              <div className="flex glass-panel-inner p-1 rounded-lg shadow-inner">
                <button onClick={() => setBillMode('AUTO')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${billMode === 'AUTO' ? 'glass-panel text-white shadow text-white' : 'text-blue-300'}`}>Auto</button>
                <button onClick={() => setBillMode('REVERSE')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${billMode === 'REVERSE' ? 'bg-purple-100 text-purple-700 shadow border border-purple-200' : 'text-blue-300 hover:text-purple-500'}`}>Reverse</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* LEFT: UNITS */}
              <div className="bg-transparent text-white p-4 rounded-xl border border-white/10 flex flex-col justify-center">
                <p className="text-blue-300 text-[10px] uppercase font-bold tracking-wider mb-1">
                  {billMode === 'REVERSE' ? 'Est. Total Units' : 'Smart Meter Units'}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="font-extrabold text-3xl text-white">{String(displayTotalUnits)}</span>
                  <span className="text-sm font-medium text-blue-300">kWh</span>
                </div>
              </div>

              {/* RIGHT: BILL AMOUNT */}
              <div className={`p-4 rounded-xl border flex flex-col justify-center transition-all ${billMode === 'REVERSE' ? 'bg-green-50 border-green-200' : 'bg-transparent text-white border-white/10'}`}>
                <p className={`text-[10px] uppercase font-bold tracking-wider mb-1 ${billMode === 'REVERSE' ? 'text-green-600' : 'text-blue-300'}`}>
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
                    <span className="font-extrabold text-3xl text-white">₹{calculatedDeviceCost}</span>
                    {rateType === 'FIXED' && <span className="text-xs text-blue-300">(Fixed Rate)</span>}
                  </div>
                )}
              </div>
            </div>

            {/* DEVICE COST DISPLAY IN REVERSE MODE (CLARITY) */}
            {billMode === 'REVERSE' && (
              <div className="flex justify-between items-center bg-transparent text-white p-2 rounded-lg border border-white/10 text-xs">
                <span className="text-blue-300">Device Consumption: <b>{deviceUnits} kWh</b></span>
                <span className="text-blue-100 font-bold">Device Cost: ₹{calculatedDeviceCost}</span>
              </div>
            )}

            {/* TNEB SLAB DETAILS (Only if TNEB) */}
            {rateType === 'TNEB' && (
              <div className="bg-transparent text-white border border-white/10 rounded-lg p-3 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-blue-200">TNEB Domestic</span>
                  <span className="glass-panel-inner text-white px-2 py-0.5 rounded text-[10px] font-bold text-blue-300">Bi-Monthly</span>
                </div>
                <div className="flex justify-between text-blue-300 font-mono">
                  <span>0-100 units</span>
                  <span className="text-green-600 font-bold">FREE</span>
                </div>
                <div className="flex justify-between font-mono pt-2 border-t border-dashed border-white/10">
                  <span className="font-bold text-purple-700">Applied Slab:</span>
                  <span className="font-bold text-purple-700">
                    {displayTotalUnits > 500 ? '>500 (@ ₹8+)' :
                      displayTotalUnits > 400 ? '401-500 (@ ₹6.00)' :
                        displayTotalUnits > 200 ? '201-400 (@ ₹4.50)' :
                          displayTotalUnits > 100 ? '101-200 (@ ₹2.25)' : 'Base Slab'}
                  </span>
                </div>
              </div>
            )}

            {/* FIXED RATE INPUT (Only if Fixed) */}
            {rateType === 'FIXED' && (
              <div className="flex items-center gap-2 bg-transparent text-white p-2 rounded-lg border border-white/10">
                <label className="text-xs font-bold text-blue-300 whitespace-nowrap">Fixed Rate (₹)</label>
                <input
                  type="number"
                  className="w-full bg-transparent border-b border-white/10 text-sm font-mono focus:border-blue-500 outline-none"
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
                <label htmlFor="includeOwner" className="text-xs font-bold text-blue-100 cursor-pointer select-none">
                  Include Owner in Split?
                </label>
                <span className="text-[10px] text-blue-500 font-medium">
                  Each person pays: <span className="font-bold">₹{uiSplitAmount}</span>
                  {billMode === 'REVERSE' && <span className="text-blue-300 ml-1">(Total - Device)</span>}
                </span>
              </div>
            </div>


            <button
              onClick={handleGenerateBill}
              disabled={loading}
              className={`w-full py-4 rounded-xl font-bold text-white shadow-lg shadow-blue-500/30 transition-all transform active:scale-[0.98] ${loading ? 'bg-slate-400' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500'}`}
            >
              {loading ? 'Processing...' : `🚀 Send Bill (₹${billMode === 'REVERSE' ? manualBillAmount : calculatedDeviceCost})`}
            </button>

            <p className="text-[10px] text-blue-300 text-center leading-relaxed">
              * This will notify all tenants via Email & Telegram.
            </p>
          </CardContent>
        </div>

        {/* 3. LIVE METRICS */}
        <div className="md:col-span-3 glass-panel text-white p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/10 mt-6">
          <div className="absolute top-0 right-0 p-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

          <div className="flex justify-between items-center mb-6 relative z-10">
            <h3 className="text-blue-300 text-sm font-bold flex items-center gap-2 uppercase tracking-widest">
              <Activity className="h-4 w-4 text-blue-500" /> Live Metrics ({houseId})
            </h3>
            <span className="text-xs bg-black/30 px-3 py-1 rounded-full border border-white/10 text-slate-300">Meter ID: {activeMeter}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 relative z-10">
            <div className="space-y-1">
              <span className="text-blue-300 text-[10px] uppercase font-bold">Voltage</span>
              <div className="text-4xl font-mono text-white">{systemData.voltage}<span className="text-lg text-blue-300 ml-1">V</span></div>
            </div>
            <div className="space-y-1">
              <span className="text-blue-300 text-[10px] uppercase font-bold">Current Load</span>
              <div className="text-4xl font-mono text-yellow-400">{systemData.current}<span className="text-lg text-yellow-600 ml-1">A</span></div>
            </div>
            <div className="space-y-1">
              <span className="text-blue-300 text-[10px] uppercase font-bold">Runtime Today</span>
              <div className="text-4xl font-mono text-blue-400">{systemData.total_runtime_today}<span className="text-lg text-blue-600 ml-1">h</span></div>
            </div>
            <div className="space-y-1">
              <span className="text-blue-300 text-[10px] uppercase font-bold">Total Energy</span>
              <div className="text-4xl font-mono text-green-400">{systemData.energy_kwh}<span className="text-lg text-green-600 ml-1">kWh</span></div>
            </div>
          </div>
        </div>

        {/* 4. BILLING HISTORY */}
        <div className="md:col-span-3 glass-panel text-white p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/10 mt-6 md:mt-0">
          <h3 className="font-bold text-lg flex items-center gap-2 text-blue-100 mb-4">
            📜 Billing History
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-transparent text-white text-xs text-blue-300 uppercase border-b border-white/10">
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
                  <tr><td colSpan={5} className="text-center py-4 text-blue-300">No history found. Generate a bill first.</td></tr>
                )}
                {billingHistory.map((h: any, i) => (
                  <tr key={i} className="hover:bg-transparent text-white">
                    <td className="px-4 py-3 font-bold text-blue-100">{h.month}</td>
                    <td className="px-4 py-3 font-mono text-blue-200">₹{h.total_amount}</td>
                    <td className="px-4 py-3 text-blue-300">{h.active_tenants} Active</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">₹{h.split_amount}</td>
                    <td className="px-4 py-3 text-right text-xs text-blue-300">{new Date(h.generated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 5. MOTOR LOGS */}
        <div className="md:col-span-3 glass-panel text-white p-6 rounded-2xl shadow-lg shadow-black/20 border border-white/10 mt-6">
          <h3 className="font-bold text-lg flex items-center gap-2 text-blue-100 mb-4">
            <Power className="h-5 w-5 text-indigo-400" /> Motor Activity History
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-transparent text-white text-xs text-blue-300 uppercase border-b border-white/10">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Reason / Action</th>
                  <th className="px-4 py-3 text-right">Triggered By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/10">
                {motorLogs.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-4 text-blue-300">No recent motor logs found.</td></tr>
                )}
                {motorLogs.map((log: any, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-blue-200 text-xs">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${log.motor_state === 'ON' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
                        {log.motor_state}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-blue-100">{log.reason || 'System Action'}</td>
                    <td className="px-4 py-3 text-right text-xs font-mono text-blue-400">{log.triggered_by || 'ESP32'}</td>
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
