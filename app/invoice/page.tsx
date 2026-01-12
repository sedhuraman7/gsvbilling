"use client";

import React, { useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Zap, Download } from 'lucide-react';

export default function Invoice() {
  const searchParams = useSearchParams();
  const houseId = searchParams.get('houseId');
  const user = searchParams.get('user');
  const amount = searchParams.get('amount') || '0';
  const month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
  const invoiceDate = new Date().toLocaleDateString();
  const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString(); // +7 Days

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 flex justify-center items-start">
      
      {/* INVOICE PAPER */}
      <div className="bg-white p-8 md:p-12 shadow-xl rounded-none md:rounded-lg w-full max-w-3xl print:shadow-none print:w-full print:max-w-none">
        
        {/* HEADER */}
        <div className="flex justify-between items-start border-b-2 border-slate-800 pb-8 mb-8">
          <div>
             <div className="flex items-center gap-2 text-blue-600 mb-2">
                 <Zap className="h-8 w-8 fill-current" />
                 <span className="text-2xl font-extrabold tracking-tight text-slate-900">SMART GRID</span>
             </div>
             <div className="text-slate-500 text-sm space-y-1">
                 <p>Automated Metering Infrastructure</p>
                 <p>Chennai, Tamil Nadu</p>
                 <p>support@smartgrid.com</p>
             </div>
          </div>
          <div className="text-right">
              <h1 className="text-4xl font-light text-slate-300 uppercase tracking-widest">Invoice</h1>
              <p className="font-bold text-slate-700 mt-2">#INV-{Math.floor(100000 + Math.random() * 900000)}</p>
              <p className="text-sm text-slate-500">Date: {invoiceDate}</p>
          </div>
        </div>

        {/* BILL TO */}
        <div className="flex justify-between mb-12">
            <div>
                <p className="text-xs uppercase font-bold text-slate-400 mb-2">Bill To</p>
                <h2 className="text-xl font-bold text-slate-800">{user || 'Valued Customer'}</h2>
                <p className="text-slate-600">House ID: {houseId}</p>
                <p className="text-slate-600">Tenant / Resident</p>
            </div>
            <div className="text-right">
                <p className="text-xs uppercase font-bold text-slate-400 mb-2">Billing Period</p>
                <h2 className="text-lg font-bold text-slate-800">{month}</h2>
                <p className="text-red-500 font-bold text-sm mt-1">Due Date: {dueDate}</p>
            </div>
        </div>

        {/* TABLE */}
        <table className="w-full mb-12 border-collapse">
            <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left py-4 px-2 font-bold text-slate-600 uppercase text-xs">Description</th>
                    <th className="text-center py-4 px-2 font-bold text-slate-600 uppercase text-xs">Units / Usage</th>
                    <th className="text-right py-4 px-2 font-bold text-slate-600 uppercase text-xs">Rate</th>
                    <th className="text-right py-4 px-2 font-bold text-slate-600 uppercase text-xs">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr className="border-b border-slate-100">
                    <td className="py-6 px-2">
                        <p className="font-bold text-slate-800">Electricity Charges</p>
                        <p className="text-xs text-slate-500">Monthly consumption split</p>
                    </td>
                    <td className="text-center py-6 px-2 text-slate-600">-</td>
                    <td className="text-right py-6 px-2 text-slate-600">-</td>
                    <td className="text-right py-6 px-2 font-bold text-slate-800">₹{amount}</td>
                </tr>
                <tr>
                    <td className="py-6 px-2">
                        <p className="font-bold text-slate-800">Maintenance / Service</p>
                    </td>
                    <td className="text-center py-6 px-2 text-slate-600">Fixed</td>
                    <td className="text-right py-6 px-2 text-slate-600">₹0.00</td>
                    <td className="text-right py-6 px-2 font-bold text-slate-800">₹0.00</td>
                </tr>
            </tbody>
        </table>

        {/* TOTAL */}
        <div className="flex justify-end mb-12">
            <div className="w-1/2">
                <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="font-bold text-slate-800">₹{amount}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Tax (0%)</span>
                    <span className="font-bold text-slate-800">₹0.00</span>
                </div>
                <div className="flex justify-between py-4 text-xl">
                    <span className="font-bold text-slate-900">Total Due</span>
                    <span className="font-bold text-blue-600">₹{amount}</span>
                </div>
            </div>
        </div>

        {/* FOOTER */}
        <div className="border-t-2 border-slate-100 pt-8 text-center bg-slate-50 -mx-12 -mb-12 p-8 md:rounded-b-lg print:bg-white">
            <p className="font-bold text-slate-800 mb-2">Thank you for your timely payment.</p>
            <p className="text-sm text-slate-500 mb-6">This is a system generated invoice.</p>
            
            <button 
                onClick={handlePrint}
                className="bg-slate-900 text-white px-6 py-2 rounded-full font-bold flex items-center gap-2 mx-auto hover:bg-slate-800 transition-colors print:hidden"
            >
                <Download className="h-4 w-4" /> Download PDF
            </button>
        </div>

      </div>
    </div>
  );
}
