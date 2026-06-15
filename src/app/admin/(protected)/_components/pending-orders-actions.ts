'use server';

// --- Pending Orders: ID-list filter + bulk status actions ---
// Brand-new, self-contained server actions for the Pending Orders view. They
// only READ orders / users / promotions and reuse the existing, well-tested
// `updateOrderStatus` for any writes, so none of the existing order behaviour
// (referral rewards, gift-password eligibility, coin refunds) is changed.

import { isAdminAuthenticated, updateOrderStatus } from '@/app/actions';
import { connectToDatabase } from '@/lib/mongodb';
import { unstable_noStore as noStore } from 'next/cache';
import type { Order } from '@/lib/definitions';
import {
    classifyGamingIds,
    matchesIdListCategory,
    type IdListCategory,
} from '@/lib/id-list-membership';

const ORDERS_COLLECTION = 'orders';

/**
 * Return every pending (Processing) order whose gamingId currently matches the
 * chosen ID-list category. For 'all' it returns all matching pending orders.
 *
 * Unlike the paginated `getOrdersForAdmin`, this returns the COMPLETE filtered
 * set so the admin's "select all" and bulk actions cover the whole category,
 * not just one page. Pending orders are a naturally small working set.
 */
export async function getPendingOrdersByIdList(
    category: IdListCategory,
    search: string,
    sort: string,
): Promise<{ orders: any[]; total: number }> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { orders: [], total: 0 };

    try {
        const db = await connectToDatabase();

        const query: any = { status: 'Processing' };
        const cleanSearch = (search || '').trim();
        if (cleanSearch) {
            query.$or = [
                { gamingId: { $regex: cleanSearch, $options: 'i' } },
                { referralCode: { $regex: cleanSearch, $options: 'i' } },
            ];
        }

        const all = await db
            .collection<Order>(ORDERS_COLLECTION)
            .find(query)
            .sort({ createdAt: sort === 'asc' ? 1 : -1 })
            .toArray();

        let filtered = all;
        if (category !== 'all') {
            const membership = await classifyGamingIds(db, all.map((o) => o.gamingId));
            filtered = all.filter((o) => matchesIdListCategory(o.gamingId, category, membership));
        }

        const orders = JSON.parse(JSON.stringify(filtered));
        return { orders, total: filtered.length };
    } catch (error) {
        console.error('Pending orders: failed to filter by id list', error);
        return { orders: [], total: 0 };
    }
}

/**
 * Mark many pending orders Completed/Failed in one go. Each order is processed
 * through the existing `updateOrderStatus` so all the side effects (referral
 * payout, gift-password eligibility, coin refund on UPI failure) stay identical
 * to handling them one by one.
 */
export async function bulkUpdateOrderStatus(
    orderIds: string[],
    status: 'Completed' | 'Failed',
): Promise<{ success: boolean; message: string; updatedCount: number; failedIds: string[] }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { success: false, message: 'Unauthorized.', updatedCount: 0, failedIds: [] };
    }

    const ids = Array.from(new Set((orderIds || []).filter(Boolean)));
    if (ids.length === 0) {
        return { success: false, message: 'No orders selected.', updatedCount: 0, failedIds: [] };
    }

    let updated = 0;
    const failedIds: string[] = [];
    for (const id of ids) {
        try {
            const result = await updateOrderStatus(id, status);
            if (result.success) updated++;
            else failedIds.push(id);
        } catch (error) {
            console.error('Pending orders: bulk status update failed for', id, error);
            failedIds.push(id);
        }
    }

    return {
        success: updated > 0,
        message:
            failedIds.length === 0
                ? `Marked ${updated} order(s) as ${status}.`
                : `Marked ${updated} order(s) as ${status}; ${failedIds.length} could not be updated.`,
        updatedCount: updated,
        failedIds,
    };
}
