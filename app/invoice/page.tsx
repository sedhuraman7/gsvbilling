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

    // Auto-Print Trigger
    useEffect(() => {
        if (searchParams.get('autoPrint') === 'true') {
            const timer = setTimeout(() => {
                window.print();
            }, 1000); // 1s delay for styles to load
            return () => clearTimeout(timer);
        }
    }, [searchParams]);

    return (
        <div className="min-h-screen glass-panel-inner p-8 flex justify-center items-start print:glass-panel text-white print:p-0">
            <div className="glass-panel text-white w-[210mm] min-h-[297mm] shadow-2xl p-12 relative flex flex-col justify-between print:shadow-none print:w-full">

                {/* HEADER */}
                <div>
                    <div className="flex justify-between items-start border-b-2 border-slate-800 pb-8">
                        <div>
                            <h1 className="text-4xl font-bold text-white tracking-wider">INVOICE</h1>
                            <p className="text-blue-300 mt-1">#INV-{invId}</p>
                        </div>
                        <div className="text-right">
                            <h2 className="text-2xl font-bold text-blue-600">SMART GRID</h2>
                            <p className="text-sm text-blue-300">Automated Energy Billing System</p>
                            <p className="text-sm text-blue-300">Chennai, India</p>
                        </div>
                    </div>

                    {/* BILL TO */}
                    <div className="mt-12 flex justify-between">
                        <div>
                            <p className="text-xs font-bold text-blue-300 uppercase tracking-widest mb-1">Bill To</p>
                            <h3 className="text-xl font-bold text-white">{user}</h3>
                            <p className="text-blue-200">House: {houseId}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs font-bold text-blue-300 uppercase tracking-widest mb-1">Date</p>
                            <h3 className="text-lg font-bold text-white">{date}</h3>
                            <p className="text-red-500 font-bold text-sm mt-1">Due in 5 Days</p>
                        </div>
                    </div>

                    {/* TABLE */}
                    <div className="mt-12">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-transparent text-white border-b border-white/10">
                                    <th className="py-4 px-4 font-bold text-blue-200 uppercase text-xs">Description</th>
                                    <th className="py-4 px-4 font-bold text-blue-200 uppercase text-xs text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-white/10">
                                    <td className="py-4 px-4 text-white">
                                        <p className="font-bold">Electricity Usage Charge</p>
                                        <p className="text-xs text-blue-300">Shared utility cost for {houseId}</p>
                                    </td>
                                    <td className="py-4 px-4 text-right font-mono text-white">₹{amount}</td>
                                </tr>
                                <tr className="border-b border-white/10">
                                    <td className="py-4 px-4 text-white">
                                        <p className="font-bold">Maintenance / Platform Fee</p>
                                    </td>
                                    <td className="py-4 px-4 text-right font-mono text-white">₹0.00</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* TOTAL */}
                    <div className="mt-8 flex justify-end">
                        <div className="w-64 bg-transparent text-white p-6 rounded-lg">
                            <div className="flex justify-between mb-2">
                                <span className="text-blue-300 text-sm">Subtotal</span>
                                <span className="font-mono text-blue-100">₹{amount}</span>
                            </div>
                            <div className="flex justify-between pt-4 border-t border-white/10">
                                <span className="font-bold text-white text-xl">Total Due</span>
                                <span className="font-bold text-blue-600 text-xl">₹{amount}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* FOOTER */}
                <div className="text-center border-t border-white/10 pt-8 mt-12">
                    <p className="text-white font-bold mb-2">Thank you for your timely payment!</p>
                    <p className="text-xs text-blue-300">This is a system-generated invoice.</p>

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
