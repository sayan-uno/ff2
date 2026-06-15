// Shared constants & types for the Master section. Kept in a plain (non-server)
// module so both the server actions and the client component can import them —
// a 'use server' file may only export async functions.

const DAY = 24 * 60 * 60 * 1000;

// The selectable "offline for longer than …" presets, in milliseconds. Months
// are treated as 30 days and years as 365 days for the cut-off maths.
export const DURATION_OPTIONS: { key: string; label: string; ms: number }[] = [
    { key: '1d', label: 'Older than 1 day', ms: 1 * DAY },
    { key: '3d', label: 'Older than 3 days', ms: 3 * DAY },
    { key: '7d', label: 'Older than 7 days', ms: 7 * DAY },
    { key: '15d', label: 'Older than 15 days', ms: 15 * DAY },
    { key: '1mo', label: 'Older than 1 month', ms: 30 * DAY },
    { key: '2mo', label: 'Older than 2 months', ms: 60 * DAY },
    { key: '3mo', label: 'Older than 3 months', ms: 90 * DAY },
    { key: '6mo', label: 'Older than 6 months', ms: 180 * DAY },
    { key: '1y', label: 'Older than 1 year', ms: 365 * DAY },
    { key: '2y', label: 'Older than 2 years', ms: 2 * 365 * DAY },
    { key: '3y', label: 'Older than 3 years', ms: 3 * 365 * DAY },
    { key: '5y', label: 'Older than 5 years', ms: 5 * 365 * DAY },
];

export function durationMs(key: string): number | null {
    return DURATION_OPTIONS.find((o) => o.key === key)?.ms ?? null;
}

export interface MasterUserRow {
    _id: string;
    gamingId: string;
    lastSeen: string;                     // ISO string of most recent visit (or createdAt fallback)
    orderCount: number;
    promotedSide: 'old' | 'new' | null;   // Which side of the promoted list this ID sits on
    partnerIds: string[];                 // The opposite-side gaming ID(s), if promoted
}
