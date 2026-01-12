export type Tenant = {
    id: string;
    name: string;
    floor: number;
    lastPaidDate?: string;
};

export type MonthlyBill = {
    month: string; // "2026-01"
    totalAmount: number;
    activeMeter: number;
    totalUnits?: number;
    isPaid: boolean;
    shares: Record<string, number>; // tenantId -> amount
};

// The Rules for Splitting
export const TENANTS: Tenant[] = [
    { id: 't1', name: 'Ground Floor', floor: 0 },
    { id: 't2', name: 'First Floor', floor: 1 },
    { id: 't3', name: 'Second Floor', floor: 2 },
];

export function calculateBillSplit(totalAmount: number, method: 'EQUAL' | 'USAGE' = 'EQUAL') {
    if (method === 'EQUAL') {
        const share = totalAmount / TENANTS.length;
        // Return a map of TenantID -> Share
        return TENANTS.reduce((acc, tenant) => {
            acc[tenant.id] = parseFloat(share.toFixed(2));
            return acc;
        }, {} as Record<string, number>);
    }

    // Placeholder for future usage-based logic
    return {};
}

export function getMeterForDate(date: Date = new Date()): number {
    const monthIndex = date.getMonth(); // 0 = Jan
    // Return 1, 2, or 3 based on rotation
    return (monthIndex % 3) + 1;
}
