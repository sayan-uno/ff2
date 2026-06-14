
'use server';

import { isAdminAuthenticated } from '@/app/actions';
import { SmsWebhookLog } from '@/lib/definitions';
import { connectToDatabase } from '@/lib/mongodb';
import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';
import { ObjectId } from 'mongodb';

const PAGE_SIZE = 20;

// India Standard Time is a fixed UTC+05:30 offset (no daylight saving). The
// admin date/time pickers send a wall-clock value with no timezone (e.g.
// "2026-06-14T15:30") entered in IST. We pin the IST offset here so it is
// converted to the correct UTC instant before querying (receivedAt is UTC).
function istLocalToUtcDate(local: string): Date | null {
    if (!local) return null;
    const withSeconds = local.length === 16 ? `${local}:00` : local;
    const date = new Date(`${withSeconds}+05:30`);
    return isNaN(date.getTime()) ? null : date;
}

// Builds the query shared by the listing, count and range-deletion so that
// "what you see" and "what gets deleted" always match. The time frame filters
// on `receivedAt` (IST).
function buildSmsLogsQuery(search: string, startDate?: string, endDate?: string) {
    const query: any = {};
    if (search) {
        query.$or = [
            { sender: { $regex: search, $options: 'i' } },
            { body: { $regex: search, $options: 'i' } },
            { matchedGamingId: { $regex: search, $options: 'i' } },
        ];
    }
    const start = istLocalToUtcDate(startDate || '');
    const end = istLocalToUtcDate(endDate || '');
    if (start || end) {
        query.receivedAt = {};
        if (start) query.receivedAt.$gte = start;
        if (end) query.receivedAt.$lte = end;
    }
    return query;
}

export async function getSmsLogs(page: number, search: string = '', startDate?: string, endDate?: string) {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { logs: [], hasMore: false, total: 0 };
    }

    try {
        const db = await connectToDatabase();
        const skip = (page - 1) * PAGE_SIZE;

        const query = buildSmsLogsQuery(search, startDate, endDate);

        const logsFromDb = await db.collection<SmsWebhookLog>('sms_webhook_logs')
            .find(query)
            .sort({ receivedAt: -1 })
            .skip(skip)
            .limit(PAGE_SIZE)
            .toArray();

        const total = await db.collection('sms_webhook_logs').countDocuments(query);
        const hasMore = skip + logsFromDb.length < total;

        const logs = JSON.parse(JSON.stringify(logsFromDb));

        return { logs, hasMore, total };

    } catch (error) {
        console.error("Error fetching SMS logs:", error);
        return { logs: [], hasMore: false, total: 0 };
    }
}

// Permanently deletes one or more SMS logs by their _id. Used for the
// single-row delete and the "Delete Selected" action.
export async function deleteSmsLogs(ids: string[]) {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized', deletedCount: 0 };

    const objectIds = ids
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));

    if (objectIds.length === 0) {
        return { success: false, message: 'No valid logs selected.', deletedCount: 0 };
    }

    try {
        const db = await connectToDatabase();
        const result = await db.collection<SmsWebhookLog>('sms_webhook_logs').deleteMany({ _id: { $in: objectIds } });
        revalidatePath('/admin/sms-logs');
        return { success: true, message: `Deleted ${result.deletedCount} log(s).`, deletedCount: result.deletedCount };
    } catch (error) {
        console.error("Error deleting SMS logs:", error);
        return { success: false, message: 'Failed to delete logs.', deletedCount: 0 };
    }
}

// Permanently deletes every SMS log matching the current filter (search + IST
// time frame). Clears the whole time frame, not just the loaded page.
export async function deleteSmsLogsInRange(search: string, startDate?: string, endDate?: string) {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized', deletedCount: 0 };

    const query = buildSmsLogsQuery(search, startDate, endDate);

    try {
        const db = await connectToDatabase();
        const result = await db.collection<SmsWebhookLog>('sms_webhook_logs').deleteMany(query);
        revalidatePath('/admin/sms-logs');
        return { success: true, message: `Deleted ${result.deletedCount} log(s).`, deletedCount: result.deletedCount };
    } catch (error) {
        console.error("Error deleting SMS logs in range:", error);
        return { success: false, message: 'Failed to delete logs.', deletedCount: 0 };
    }
}
