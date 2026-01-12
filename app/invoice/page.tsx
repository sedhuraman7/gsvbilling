"use client";

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useEffect } from 'react';

function InvoiceContent() {
    const searchParams = useSearchParams();
    const houseId = searchParams.get('houseId') || 'HOUSE_XXX';
    const amount = searchParams.get('amount') || '0';
    const user = searchParams.get('user') || 'Tenant';
    const date = new Date().toLocaleDateString();

    // Fix Hydration Error: Generate Random ID only on Client
    const [invId, setInvId] = useState('...');
    useEffect(() => {
        setInvId(Math.floor(1000 + Math.random() * 9000).toString());
    }, []);

    return (
        <div className="min-h-screen bg-slate-100 p-8 flex justify-center items-start print:bg-white print:p-0">
            <div className="bg-white w-[210mm] min-h-[297mm] shadow-2xl p-12 relative flex flex-col justify-between print:shadow-none print:w-full">

                {/* HEADER */}
                <div>
                    <div className="flex justify-between items-start border-b-2 border-slate-800 pb-8">
                        <div>
                            <h1 className="text-4xl font-bold text-slate-900 tracking-wider">INVOICE</h1>
                            <p className="text-slate-500 mt-1">#INV-{invId}</p>
                        </div>
                        <div className="text-right">
                            <h2 className="text-2xl font-bold text-blue-600">SMART GRID</h2>
                            <p className="text-sm text-slate-500">Automated Energy Billing System</p>
                            <p className="text-sm text-slate-500">Chennai, India</p>
                        </div>
                    </div>

                    {/* BILL TO */}
                    <div className="mt-12 flex justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Bill To</p>
                            <h3 className="text-xl font-bold text-slate-800">{user}</h3>
                            <p className="text-slate-600">House: {houseId}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Date</p>
                            <h3 className="text-lg font-bold text-slate-800">{date}</h3>
                            <p className="text-red-500 font-bold text-sm mt-1">Due in 5 Days</p>
                        </div>
                    </div>

                    {/* TABLE */}
                    <div className="mt-12">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="py-4 px-4 font-bold text-slate-600 uppercase text-xs">Description</th>
                                    <th className="py-4 px-4 font-bold text-slate-600 uppercase text-xs text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-slate-100">
                                    <td className="py-4 px-4 text-slate-800">
                                        <p className="font-bold">Electricity Usage Charge</p>
                                        <p className="text-xs text-slate-500">Shared utility cost for {houseId}</p>
                                    </td>
                                    <td className="py-4 px-4 text-right font-mono text-slate-800">₹{amount}</td>
                                </tr>
                                <tr className="border-b border-slate-100">
                                    <td className="py-4 px-4 text-slate-800">
                                        <p className="font-bold">Maintenance / Platform Fee</p>
                                    </td>
                                    <td className="py-4 px-4 text-right font-mono text-slate-800">₹0.00</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* TOTAL */}
                    <div className="mt-8 flex justify-end">
                        <div className="w-64 bg-slate-50 p-6 rounded-lg">
                            <div className="flex justify-between mb-2">
                                <span className="text-slate-500 text-sm">Subtotal</span>
                                <span className="font-mono text-slate-700">₹{amount}</span>
                            </div>
                            <div className="flex justify-between pt-4 border-t border-slate-200">
                                <span className="font-bold text-slate-900 text-xl">Total Due</span>
                                <span className="font-bold text-blue-600 text-xl">₹{amount}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* FOOTER */}
                <div className="text-center border-t border-slate-200 pt-8 mt-12">
                    <p className="text-slate-900 font-bold mb-2">Thank you for your timely payment!</p>
                    <p className="text-xs text-slate-400">This is a system-generated invoice.</p>

                    <button
                        onClick={() => window.print()}
                        className="mt-8 bg-black text-white px-6 py-2 rounded-full font-bold text-sm hover:scale-105 transition shadow-lg print:hidden"
                    >
                        🖨️ Download / Print PDF
                    </button>
                </div>

            </div>
        </div>
    );
}

export default function InvoicePage() {
    return (
        <Suspense fallback={<div>Loading Invoice...</div>}>
            <InvoiceContent />
        </Suspense>
    );
}
