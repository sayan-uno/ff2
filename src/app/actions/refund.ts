'use server';

import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminAuthenticated } from '@/app/actions';
import { sendPushNotification } from '@/lib/push-notifications';
import type { Order, Notification, User } from '@/lib/definitions';
import type { SupportTicket, SupportMessage } from '@/lib/support-definitions';
import { RefundRequest, RefundStatus, REFUND_WINDOW_DAYS } from '@/lib/refund-definitions';

const REFUND_COLLECTION = 'refund_requests';
const ORDER_COLLECTION = 'orders';
const SUPPORT_COLLECTION = 'support_tickets';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function getCurrentGamingId(): Promise<string | undefined> {
    return (await cookies()).get('gaming_id')?.value;
}

// A trimmed, client-safe shape for an order the admin can pick to refund.
export interface AdminFailedOrder {
    orderId: string;
    productName: string;
    productImageUrl?: string;
    amount: number;
    paymentMethod?: string;
    utr?: string;
    createdAt: string;
    orderStatus: Order['status'];    // The order's own status (Failed / Completed / Processing)
    alreadyRefunding: boolean;       // A refund is already in progress for this order
    refundStatus?: RefundStatus;
}

// The order statuses an admin is allowed to accept a refund for.
const REFUNDABLE_ORDER_STATUSES: Order['status'][] = ['Failed', 'Completed', 'Processing'];

// ---------------------------------------------------------------------------
// USER-FACING
// ---------------------------------------------------------------------------

// All refund requests belonging to the currently logged-in user, newest first.
// Drives the /refundstatus page and the floating banner on /refund-request.
export async function getMyRefundRequests(): Promise<RefundRequest[]> {
    noStore();
    const gamingId = await getCurrentGamingId();
    if (!gamingId) return [];

    try {
        const db = await connectToDatabase();
        const requests = await db
            .collection<RefundRequest>(REFUND_COLLECTION)
            .find({ gamingId })
            .sort({ acceptedAt: -1 })
            .toArray();
        return JSON.parse(JSON.stringify(requests));
    } catch (error) {
        console.error('Refund: failed to fetch user refund requests', error);
        return [];
    }
}

// ---------------------------------------------------------------------------
// ADMIN-FACING
// ---------------------------------------------------------------------------

// The refundable orders for a given gaming id (Failed, Completed or Processing),
// with a flag for each one telling the admin whether a refund is already running.
// Used by the "Accept refund request" dialog so the admin can pick which order(s)
// to refund.
export async function getUserFailedOrders(gamingId: string): Promise<AdminFailedOrder[]> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin || !gamingId) return [];

    try {
        const db = await connectToDatabase();
        const orders = await db
            .collection<Order>(ORDER_COLLECTION)
            .find({ gamingId, status: { $in: REFUNDABLE_ORDER_STATUSES } })
            .sort({ createdAt: -1 })
            .toArray();

        const orderIds = orders.map((o) => o._id.toString());
        const existingRefunds = await db
            .collection<RefundRequest>(REFUND_COLLECTION)
            .find({ gamingId, orderId: { $in: orderIds } })
            .toArray();
        const refundByOrder = new Map(existingRefunds.map((r) => [r.orderId, r]));

        return orders.map((o) => {
            const existing = refundByOrder.get(o._id.toString());
            return {
                orderId: o._id.toString(),
                productName: o.productName,
                productImageUrl: o.productImageUrl,
                amount: o.finalPrice ?? o.productPrice ?? 0,
                paymentMethod: o.paymentMethod,
                utr: o.utr,
                createdAt: (o.createdAt as unknown as Date).toString(),
                orderStatus: o.status,
                alreadyRefunding: existing?.status === 'in_progress',
                refundStatus: existing?.status,
            };
        });
    } catch (error) {
        console.error('Refund: failed to fetch user failed orders', error);
        return [];
    }
}

// ---------------------------------------------------------------------------
// ADMIN — REFUND MANAGEMENT LIST
// ---------------------------------------------------------------------------

// Client-safe shape of an accepted refund row shown in the admin refund list.
export interface AdminRefundListItem {
    _id: string;
    gamingId: string;
    visualGamingId?: string;
    orderId: string;
    productName: string;
    productImageUrl?: string;
    amount: number;
    paymentMethod?: string;
    utr?: string;
    status: 'in_progress' | 'completed' | 'failed';
    acceptedAt: string;
    completeBy: string;
}

const REFUNDS_PER_PAGE = 10;

// Paginated list of accepted refund requests for the admin section.
//  - sort: 'desc' = newest first (default), 'asc' = oldest first.
//  - from / to: optional ISO datetime range filter on acceptedAt.
//  - page is 1-based; 10 per page with a hasMore flag for the "Load more" button.
export async function getAcceptedRefunds(params: {
    page?: number;
    sort?: 'asc' | 'desc';
    from?: string;
    to?: string;
}): Promise<{ refunds: AdminRefundListItem[]; hasMore: boolean }> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { refunds: [], hasMore: false };

    const page = Math.max(1, params.page ?? 1);
    const sortDir = params.sort === 'asc' ? 1 : -1;

    const filter: Record<string, unknown> = {};
    const acceptedAtFilter: Record<string, Date> = {};
    if (params.from) {
        const d = new Date(params.from);
        if (!isNaN(d.getTime())) acceptedAtFilter.$gte = d;
    }
    if (params.to) {
        const d = new Date(params.to);
        if (!isNaN(d.getTime())) acceptedAtFilter.$lte = d;
    }
    if (Object.keys(acceptedAtFilter).length > 0) {
        filter.acceptedAt = acceptedAtFilter;
    }

    try {
        const db = await connectToDatabase();
        // Fetch one extra row to know whether there is a next page.
        const rows = await db
            .collection<RefundRequest>(REFUND_COLLECTION)
            .find(filter)
            .sort({ acceptedAt: sortDir })
            .skip((page - 1) * REFUNDS_PER_PAGE)
            .limit(REFUNDS_PER_PAGE + 1)
            .toArray();

        const hasMore = rows.length > REFUNDS_PER_PAGE;
        const refunds = rows.slice(0, REFUNDS_PER_PAGE).map((r) => ({
            _id: r._id.toString(),
            gamingId: r.gamingId,
            visualGamingId: r.visualGamingId,
            orderId: r.orderId,
            productName: r.productName,
            productImageUrl: r.productImageUrl,
            amount: r.amount,
            paymentMethod: r.paymentMethod,
            utr: r.utr,
            status: r.status,
            acceptedAt: (r.acceptedAt as unknown as Date).toString(),
            completeBy: (r.completeBy as unknown as Date).toString(),
        }));

        return { refunds, hasMore };
    } catch (error) {
        console.error('Refund: failed to fetch accepted refunds', error);
        return { refunds: [], hasMore: false };
    }
}

// Admin marks a refund as completed or failed (or back to in_progress). This only
// changes the refund record — the underlying order is untouched, so the user's
// order page shows the refund outcome until the refund is deleted.
export async function updateRefundStatus(
    refundId: string,
    status: 'in_progress' | 'completed' | 'failed'
): Promise<{ success: boolean; message: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized.' };
    if (!ObjectId.isValid(refundId)) return { success: false, message: 'Invalid refund.' };
    if (!['in_progress', 'completed', 'failed'].includes(status)) {
        return { success: false, message: 'Invalid status.' };
    }

    try {
        const db = await connectToDatabase();
        const result = await db.collection<RefundRequest>(REFUND_COLLECTION).updateOne(
            { _id: new ObjectId(refundId) },
            { $set: { status, updatedAt: new Date() } }
        );
        if (result.matchedCount === 0) {
            return { success: false, message: 'Refund not found.' };
        }
        revalidatePath('/admin/refunds');
        revalidatePath('/refundstatus');
        revalidatePath('/order');
        return { success: true, message: `Refund marked as ${status.replace('_', ' ')}.` };
    } catch (error) {
        console.error('Refund: failed to update refund status', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}

// Admin deletes a refund record entirely. Once gone, the user's order page falls
// back to showing the order's own status (Failed / Completed / Processing) again,
// because that override is keyed purely on the existence of a refund request.
export async function deleteRefundRequest(
    refundId: string
): Promise<{ success: boolean; message: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized.' };
    if (!ObjectId.isValid(refundId)) return { success: false, message: 'Invalid refund.' };

    try {
        const db = await connectToDatabase();
        const result = await db
            .collection<RefundRequest>(REFUND_COLLECTION)
            .deleteOne({ _id: new ObjectId(refundId) });
        if (result.deletedCount === 0) {
            return { success: false, message: 'Refund not found.' };
        }
        revalidatePath('/admin/refunds');
        revalidatePath('/refundstatus');
        revalidatePath('/order');
        return { success: true, message: 'Refund deleted.' };
    } catch (error) {
        console.error('Refund: failed to delete refund', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}

// Admin accepts a refund for one or more of a user's failed orders (chosen from
// a support ticket). For each selected order we UPSERT a refund request keyed by
// (gamingId + orderId): if one already exists for that failed product the old
// one is replaced and the 14-day countdown is RESET to now — so a user who keeps
// re-asking only pushes their own refund further out. A confirmation message is
// posted into the ticket chat and a website + push notification is sent, both
// pointing at the /refundstatus page.
export async function acceptRefundRequest(
    ticketId: string,
    orderIds: string[]
): Promise<{ success: boolean; message: string; count?: number }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { success: false, message: 'Unauthorized.' };
    }
    if (!ObjectId.isValid(ticketId)) {
        return { success: false, message: 'Invalid report.' };
    }

    const validOrderIds = (orderIds || []).filter((id) => ObjectId.isValid(id));
    if (validOrderIds.length === 0) {
        return { success: false, message: 'Please select at least one order.' };
    }

    try {
        const db = await connectToDatabase();

        const ticket = await db
            .collection<SupportTicket>(SUPPORT_COLLECTION)
            .findOne({ _id: new ObjectId(ticketId) });
        if (!ticket) {
            return { success: false, message: 'Report not found.' };
        }
        const gamingId = ticket.gamingId;

        // Only allow refunding this user's OWN refundable orders
        // (Failed, Completed or Processing).
        const orders = await db
            .collection<Order>(ORDER_COLLECTION)
            .find({
                _id: { $in: validOrderIds.map((id) => new ObjectId(id)) },
                gamingId,
                status: { $in: REFUNDABLE_ORDER_STATUSES },
            })
            .toArray();

        if (orders.length === 0) {
            return { success: false, message: 'No matching orders found for this user.' };
        }

        const now = new Date();
        const completeBy = new Date(now.getTime() + REFUND_WINDOW_DAYS * ONE_DAY_MS);

        // Upsert each refund (resetting the timer on re-accept). Doing one
        // updateOne per order keeps the "delete the old + start new + reset time"
        // behaviour the user asked for in a single atomic step per product.
        for (const order of orders) {
            await db.collection<RefundRequest>(REFUND_COLLECTION).updateOne(
                { gamingId, orderId: order._id.toString() },
                {
                    $set: {
                        gamingId,
                        visualGamingId: ticket.visualGamingId,
                        orderId: order._id.toString(),
                        productName: order.productName,
                        productImageUrl: order.productImageUrl,
                        amount: order.finalPrice ?? order.productPrice ?? 0,
                        paymentMethod: order.paymentMethod,
                        utr: order.utr,
                        status: 'in_progress',
                        ticketId,
                        acceptedAt: now,   // reset countdown
                        completeBy,        // reset countdown
                        updatedAt: now,
                    },
                    $setOnInsert: { createdAt: now },
                },
                { upsert: true }
            );
        }

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
        const statusUrl = `${baseUrl}/refundstatus`;
        const supportUrl = `${baseUrl}/support`;

        const productLines = orders
            .map((o) => `• ${o.productName} (₹${o.finalPrice ?? o.productPrice ?? 0})`)
            .join('\n');

        // 1. Post a confirmation message into the ticket chat (clickable link).
        const chatText = `✅ Your refund request has been accepted.

Refund is now in progress for:
${productLines}

It will be completed within ${REFUND_WINDOW_DAYS} days. You can track the live progress here: ${statusUrl}`;

        const adminMessage: SupportMessage = {
            _id: new ObjectId(),
            sender: 'admin',
            text: chatText,
            createdAt: now,
        };
        await db.collection<SupportTicket>(SUPPORT_COLLECTION).updateOne(
            { _id: new ObjectId(ticketId) },
            {
                $push: { messages: adminMessage },
                $set: { lastSenderRole: 'admin', status: 'open', updatedAt: now },
                $inc: { userUnread: 1 },
            }
        );

        // 2. Website notification — the bell auto-linkifies the URL.
        const notifMessage = `🎉 Good news! Your refund request was accepted and is now in progress. It will be completed within ${REFUND_WINDOW_DAYS} days. Track it here: ${statusUrl}
Need help? Reach us on the support page: ${supportUrl}`;
        const newNotification: Omit<Notification, '_id'> = {
            gamingId,
            message: notifMessage,
            isRead: false,
            createdAt: now,
            type: 'refund_status',
        };
        await db.collection<Notification>('notifications').insertOne(newNotification as Notification);

        // 3. FCM push (best-effort) — clicking opens /refundstatus.
        try {
            const user = await db.collection<User>('users').findOne({ gamingId });
            if (user?.fcmToken) {
                await sendPushNotification({
                    token: user.fcmToken,
                    title: 'Refund Accepted',
                    body: `Your refund request was accepted and will complete within ${REFUND_WINDOW_DAYS} days.`,
                    link: statusUrl,
                });
            }
        } catch (pushError) {
            console.error('Refund: push notification failed', pushError);
        }

        revalidatePath('/admin/support');
        revalidatePath('/refundstatus');
        return {
            success: true,
            message: `Refund initiated for ${orders.length} order${orders.length > 1 ? 's' : ''}.`,
            count: orders.length,
        };
    } catch (error) {
        console.error('Refund: failed to accept refund request', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}
