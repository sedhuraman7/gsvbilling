"use client";

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';

function InvoiceContent() {
    const searchParams = useSearchParams();

    // State
    const [houseId, setHouseId] = useState('');
    const [user, setUser] = useState('');
    const [amount, setAmount] = useState('0');

    useEffect(() => {
        const h = searchParams.get('houseId');
        const u = searchParams.get('user');
        const a = searchParams.get('amount');
        if (h) setHouseId(h);
        if (u) setUser(u);
        if (a) setAmount(a);
    }, [searchParams]);

    const handlePrint = () => {
        window.print();
    };

    // Calculate dates
    const today = new Date();
    const dueDate = new Date();
    dueDate.setDate(today.getDate() + 5);

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans print:bg-white print:p-0">
            {/* INVOICE CONTAINER */}
            <div className="max-w-3xl mx-auto bg-white shadow-2xl rounded-lg overflow-hidden border border-slate-200 print:shadow-none print:border-none">

                {/* HEADER */}
                <div className="bg-slate-900 text-white p-8 md:p-12 flex justify-between items-start print:bg-slate-900 print:text-white">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-widest text-blue-400">⚡ SMART GRID</h1>
                        <p className="text-slate-400 text-sm mt-1">Utility Billing System</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-4xl font-black text-white/10 uppercase">Invoice</h2>
                        <div className="mt-2 text-sm text-blue-200">
                            <p>Date: <span className="font-bold text-white">{today.toLocaleDateString()}</span></p>
                            <p>Due Date: <span className="font-bold text-red-300">{dueDate.toLocaleDateString()}</span></p>
                        </div>
                    </div>
                </div>

                {/* DETAILS */}
                <div className="p-8 md:p-12">
                    <div className="flex flex-col md:flex-row justify-between mb-12 border-b border-slate-100 pb-8 gap-8">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Billed To</p>
                            <h3 className="text-xl font-bold text-slate-800">{user || 'Valued Tenant'}</h3>
                            <p className="text-slate-500 text-sm mt-1">Unit ID: <span className="bg-blue-50 px-2 py-0.5 rounded text-blue-600 font-mono">{houseId}</span></p>
                            <p className="text-slate-500 text-sm">Tenant ID: #{Math.floor(Math.random() * 10000)}</p>
                        </div>
                        <div className="text-left md:text-right">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Payment Details</p>
                            <div className="space-y-1">
                                <div className="flex justify-between md:justify-end gap-4 text-sm">
                                    <span className="text-slate-500">Subtotal:</span>
                                    <span className="font-medium">₹{amount}</span>
                                </div>
                                <div className="flex justify-between md:justify-end gap-4 text-sm">
                                    <span className="text-slate-500">Tax (0%):</span>
                                    <span className="font-medium">₹0</span>
                                </div>
                                <div className="flex justify-between md:justify-end gap-4 text-xl font-extrabold text-blue-600 mt-2 border-t pt-2 border-dashed">
                                    <span>Total:</span>
                                    <span>₹{amount}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* TABLE */}
                    <div className="mb-12">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 border-y border-slate-200">
                                <tr>
                                    <th className="py-3 px-4 font-semibold uppercase text-xs">Description</th>
                                    <th className="py-3 px-4 font-semibold uppercase text-xs text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                <tr>
                                    <td className="py-4 px-4 font-medium text-slate-700">
                                        Electricity Usage Charge
                                        <div className="text-xs text-slate-400 font-normal">Based on shared meter reading for House {houseId}</div>
                                    </td>
                                    <td className="py-4 px-4 text-right font-bold text-slate-800">₹{amount}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* FOOTER */}
                    <div className="bg-slate-50 -m-8 md:-m-12 p-8 text-center border-t border-slate-200 mt-8 print:bg-white">
                        <p className="text-slate-500 text-sm mb-4">Please pay via UPI or Bank Transfer before the due date.</p>
                        <button
                            onClick={handlePrint}
                            className="bg-blue-600 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:bg-blue-700 transition active:scale-95 print:hidden"
                        >
                            Download PDF
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}

export default function Invoice() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        }>
            <InvoiceContent />
        </Suspense>
    );
}
