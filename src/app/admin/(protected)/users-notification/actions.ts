
'use server';

import { isAdminAuthenticated } from '@/app/actions';
import { Notification, BroadcastNotification } from '@/lib/definitions';
import { connectToDatabase } from '@/lib/mongodb';
import { revalidatePath } from 'next/cache';
import { unstable_noStore as noStore } from 'next/cache';
import { ObjectId } from 'mongodb';

const PAGE_SIZE = 5;

// India Standard Time is a fixed UTC+05:30 offset (no daylight saving). The
// admin date/time pickers send a wall-clock value with no timezone (e.g.
// "2026-06-14T15:30") entered in IST. We pin the IST offset here so it is
// converted to the correct UTC instant before querying (createdAt is UTC).
function istLocalToUtcDate(local: string): Date | null {
    if (!local) return null;
    const withSeconds = local.length === 16 ? `${local}:00` : local;
    const date = new Date(`${withSeconds}+05:30`);
    return isNaN(date.getTime()) ? null : date;
}

// Builds the query shared by the individual-notification listing, count and
// range-deletion so that "what you see" and "what gets deleted" always match.
// Broadcast notifications are always excluded; the time frame filters on
// `createdAt` (IST).
function buildIndividualNotificationsQuery(search: string, startDate?: string, endDate?: string) {
    const query: any = {
        // Exclude broadcast notifications from the individual list
        broadcastId: { $exists: false },
    };
    if (search) {
        query.gamingId = { $regex: search, $options: 'i' };
    }
    const start = istLocalToUtcDate(startDate || '');
    const end = istLocalToUtcDate(endDate || '');
    if (start || end) {
        query.createdAt = {};
        if (start) query.createdAt.$gte = start;
        if (end) query.createdAt.$lte = end;
    }
    return query;
}

export async function getNotifications(page: number, search: string, sort: string, startDate?: string, endDate?: string): Promise<{ notifications: Notification[]; hasMore: boolean; total: number }> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { notifications: [], hasMore: false, total: 0 };
    }

    try {
        const db = await connectToDatabase();
        const skip = (page - 1) * PAGE_SIZE;

        const query = buildIndividualNotificationsQuery(search, startDate, endDate);

        const notifications = await db.collection<Notification>('notifications')
            .find(query)
            .sort({ createdAt: sort === 'desc' ? -1 : 1 })
            .skip(skip)
            .limit(PAGE_SIZE)
            .toArray();

        const total = await db.collection('notifications').countDocuments(query);
        const hasMore = skip + notifications.length < total;

        return { notifications: JSON.parse(JSON.stringify(notifications)), hasMore, total };

    } catch (error) {
        console.error("Error fetching notifications:", error);
        return { notifications: [], hasMore: false, total: 0 };
    }
}


export async function deleteNotification(notificationId: string): Promise<{ success: boolean; message: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { success: false, message: 'Unauthorized' };
    }

    try {
        const db = await connectToDatabase();
        const result = await db.collection('notifications').deleteOne({ _id: new ObjectId(notificationId) });
        if (result.deletedCount === 0) {
            return { success: false, message: 'Notification not found.' };
        }
        revalidatePath('/admin/users-notification');
        return { success: true, message: 'Notification deleted successfully.' };
    } catch (error) {
        console.error("Error deleting notification:", error);
        return { success: false, message: 'An error occurred.' };
    }
}

// Permanently deletes one or more individual notifications by their _id.
// Used for the single-row delete and the "Delete Selected" action.
export async function deleteNotifications(ids: string[]) {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized', deletedCount: 0 };

    const objectIds = ids
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));

    if (objectIds.length === 0) {
        return { success: false, message: 'No valid notifications selected.', deletedCount: 0 };
    }

    try {
        const db = await connectToDatabase();
        const result = await db.collection('notifications').deleteMany({ _id: { $in: objectIds } });
        revalidatePath('/admin/users-notification');
        return { success: true, message: `Deleted ${result.deletedCount} notification(s).`, deletedCount: result.deletedCount };
    } catch (error) {
        console.error("Error deleting notifications:", error);
        return { success: false, message: 'Failed to delete notifications.', deletedCount: 0 };
    }
}

// Permanently deletes every individual notification matching the current
// filter (search + IST time frame). Clears the whole time frame, not just the
// loaded page. Broadcast notifications are never affected.
export async function deleteNotificationsInRange(search: string, startDate?: string, endDate?: string) {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized', deletedCount: 0 };

    const query = buildIndividualNotificationsQuery(search, startDate, endDate);

    try {
        const db = await connectToDatabase();
        const result = await db.collection('notifications').deleteMany(query);
        revalidatePath('/admin/users-notification');
        return { success: true, message: `Deleted ${result.deletedCount} notification(s).`, deletedCount: result.deletedCount };
    } catch (error) {
        console.error("Error deleting notifications in range:", error);
        return { success: false, message: 'Failed to delete notifications.', deletedCount: 0 };
    }
}

// --- Broadcast Notification Actions ---

const BROADCAST_PAGE_SIZE = 10;

export async function getBroadcastNotifications(page: number, sort: string): Promise<{ broadcasts: BroadcastNotification[]; hasMore: boolean; total: number }> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { broadcasts: [], hasMore: false, total: 0 };
    }

    try {
        const db = await connectToDatabase();
        const skip = (page - 1) * BROADCAST_PAGE_SIZE;

        const broadcasts = await db.collection<BroadcastNotification>('broadcast_notifications')
            .find({})
            .sort({ createdAt: sort === 'desc' ? -1 : 1 })
            .skip(skip)
            .limit(BROADCAST_PAGE_SIZE)
            .toArray();

        const total = await db.collection('broadcast_notifications').countDocuments({});
        const hasMore = skip + broadcasts.length < total;

        return { broadcasts: JSON.parse(JSON.stringify(broadcasts)), hasMore, total };
    } catch (error) {
        console.error("Error fetching broadcast notifications:", error);
        return { broadcasts: [], hasMore: false, total: 0 };
    }
}

export async function deleteBroadcastNotification(broadcastId: string): Promise<{ success: boolean; message: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { success: false, message: 'Unauthorized' };
    }

    try {
        const db = await connectToDatabase();

        // Delete all individual notifications linked to this broadcast
        const deleteResult = await db.collection('notifications').deleteMany({ broadcastId });

        // Delete the broadcast document itself
        const broadcastDeleteResult = await db.collection('broadcast_notifications').deleteOne({ _id: new ObjectId(broadcastId) });

        if (broadcastDeleteResult.deletedCount === 0) {
            return { success: false, message: 'Broadcast notification not found.' };
        }

        revalidatePath('/admin/users-notification');
        revalidatePath('/');
        return { 
            success: true, 
            message: `Broadcast deleted. Removed ${deleteResult.deletedCount} individual notifications from all user accounts.` 
        };
    } catch (error) {
        console.error("Error deleting broadcast notification:", error);
        return { success: false, message: 'An error occurred while deleting the broadcast.' };
    }
}

// --- Broadcast Detail Actions ---

export interface BroadcastDetailUser {
    gamingId: string;
    isRead: boolean;
    pushDelivered: boolean;
}

export interface BroadcastDetails {
    totalRead: number;
    totalUnread: number;
    totalPushDelivered: number;
    users: BroadcastDetailUser[]; // read users first, then push-delivered (unread)
    removedTokenGamingIds: string[];
    hasMoreUsers: boolean;
}

const DETAIL_PAGE_SIZE = 50;

export async function getBroadcastDetails(
    broadcastId: string, 
    userPage: number
): Promise<{ success: boolean; details?: BroadcastDetails; message?: string }> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { success: false, message: 'Unauthorized' };
    }

    try {
        const db = await connectToDatabase();

        // Get the broadcast doc to get removedTokenGamingIds
        const broadcast = await db.collection<BroadcastNotification>('broadcast_notifications')
            .findOne({ _id: new ObjectId(broadcastId) });

        if (!broadcast) {
            return { success: false, message: 'Broadcast not found.' };
        }

        // Count stats
        const totalRead = await db.collection('notifications').countDocuments({ broadcastId, isRead: true });
        const totalUnread = await db.collection('notifications').countDocuments({ broadcastId, isRead: false });
        const totalPushDelivered = await db.collection('notifications').countDocuments({ broadcastId, pushDelivered: true });

        const skip = (userPage - 1) * DETAIL_PAGE_SIZE;

        // Fetch users: read first (sorted desc on isRead), then by pushDelivered desc, then gamingId
        const userNotifications = await db.collection<Notification>('notifications')
            .find({ broadcastId })
            .sort({ isRead: -1, pushDelivered: -1, gamingId: 1 })
            .skip(skip)
            .limit(DETAIL_PAGE_SIZE)
            .project({ gamingId: 1, isRead: 1, pushDelivered: 1 })
            .toArray();

        const users: BroadcastDetailUser[] = userNotifications.map(n => ({
            gamingId: n.gamingId,
            isRead: n.isRead,
            pushDelivered: !!n.pushDelivered,
        }));

        const totalUsers = totalRead + totalUnread;
        const hasMoreUsers = skip + users.length < totalUsers;

        return {
            success: true,
            details: {
                totalRead,
                totalUnread,
                totalPushDelivered,
                users,
                removedTokenGamingIds: broadcast.removedTokenGamingIds || [],
                hasMoreUsers,
            },
        };
    } catch (error) {
        console.error("Error fetching broadcast details:", error);
        return { success: false, message: 'An error occurred.' };
    }
}

// --- Search a specific user in a broadcast ---

export interface BroadcastUserSearchResult {
    found: boolean;
    gamingId: string;
    isRead?: boolean;
    pushDelivered?: boolean;
    tokenRemoved?: boolean;
    hasNotification?: boolean; // Whether the user was part of this broadcast at all
}

export async function searchBroadcastUser(
    broadcastId: string,
    gamingId: string
): Promise<{ success: boolean; result?: BroadcastUserSearchResult; message?: string }> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { success: false, message: 'Unauthorized' };
    }

    if (!gamingId.trim()) {
        return { success: false, message: 'Please enter a Gaming ID.' };
    }

    try {
        const db = await connectToDatabase();

        // Get the broadcast doc to check removedTokenGamingIds
        const broadcast = await db.collection<BroadcastNotification>('broadcast_notifications')
            .findOne({ _id: new ObjectId(broadcastId) });

        if (!broadcast) {
            return { success: false, message: 'Broadcast not found.' };
        }

        // Check if user has a notification for this broadcast
        const notification = await db.collection<Notification>('notifications')
            .findOne({ broadcastId, gamingId });

        if (!notification) {
            return {
                success: true,
                result: {
                    found: false,
                    gamingId,
                    hasNotification: false,
                },
            };
        }

        const tokenRemoved = (broadcast.removedTokenGamingIds || []).includes(gamingId);

        return {
            success: true,
            result: {
                found: true,
                gamingId,
                isRead: notification.isRead,
                pushDelivered: !!notification.pushDelivered,
                tokenRemoved,
                hasNotification: true,
            },
        };
    } catch (error) {
        console.error("Error searching broadcast user:", error);
        return { success: false, message: 'An error occurred.' };
    }
}
