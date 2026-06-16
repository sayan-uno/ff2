'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminAuthenticated } from '@/app/actions';

// Standalone stats helper for the admin "Accepted Refunds" section. Kept in its
// own file so the existing refund actions/listing logic is left untouched. Every
// document in `refund_requests` represents an accepted refund, so a plain
// countDocuments over the same date filter as the listing gives the headline
// "how many refunds were accepted" number.
const REFUND_COLLECTION = 'refund_requests';

// India Standard Time is a fixed UTC+05:30 offset. The admin date/time pickers
// send a wall-clock value with no timezone (e.g. "2026-06-14T15:30") entered in
// IST, so we pin the offset before querying (acceptedAt is stored in UTC). This
// mirrors the helper used by the listing so the count and the list always agree.
function istLocalToUtcDate(local?: string): Date | null {
    if (!local) return null;
    const withSeconds = local.length === 16 ? `${local}:00` : local;
    const date = new Date(`${withSeconds}+05:30`);
    return isNaN(date.getTime()) ? null : date;
}

function buildAcceptedAtFilter(from?: string, to?: string): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    const range: Record<string, Date> = {};
    const start = istLocalToUtcDate(from);
    const end = istLocalToUtcDate(to);
    if (start) range.$gte = start;
    if (end) range.$lte = end;
    if (Object.keys(range).length > 0) filter.acceptedAt = range;
    return filter;
}

// Total number of accepted refunds. With no from/to it is the grand total; with
// a date filter it matches exactly what the listing shows for that time frame.
export async function getAcceptedRefundsCount(params: {
    from?: string;
    to?: string;
} = {}): Promise<number> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return 0;

    const filter = buildAcceptedAtFilter(params.from, params.to);

    try {
        const db = await connectToDatabase();
        return await db.collection(REFUND_COLLECTION).countDocuments(filter);
    } catch (error) {
        console.error('Refund: failed to count accepted refunds', error);
        return 0;
    }
}
