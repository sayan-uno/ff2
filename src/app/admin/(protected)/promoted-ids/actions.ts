'use server';

import { isAdminAuthenticated } from '@/app/actions';
import { VisualIdPromotionLog } from '@/lib/definitions';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { unstable_noStore as noStore } from 'next/cache';

const PAGE_SIZE = 10;

// India Standard Time is a fixed UTC+05:30 offset (no daylight saving).
// The date/time pickers in the admin UI send a wall-clock value with no
// timezone (e.g. "2026-06-14T15:30") which the admin enters in IST. We pin
// the IST offset here so the value is converted to the correct UTC instant
// before querying MongoDB (which stores promotionDate as a UTC Date).
function istLocalToUtcDate(local: string): Date | null {
    if (!local) return null;
    // datetime-local values are "YYYY-MM-DDTHH:mm" (and sometimes include seconds).
    const withSeconds = local.length === 16 ? `${local}:00` : local;
    const date = new Date(`${withSeconds}+05:30`);
    return isNaN(date.getTime()) ? null : date;
}

// Builds the MongoDB query shared by listing, counting and range-deletion so
// that "what you see" and "what gets deleted" always stay in sync.
function buildPromotionQuery(search: string, startDate?: string, endDate?: string) {
    const query: any = {};

    if (search) {
        query.$or = [
            { oldGamingId: { $regex: search, $options: 'i' } },
            { newGamingId: { $regex: search, $options: 'i' } }
        ];
    }

    const start = istLocalToUtcDate(startDate || '');
    const end = istLocalToUtcDate(endDate || '');
    if (start || end) {
        query.promotionDate = {};
        if (start) query.promotionDate.$gte = start;
        if (end) query.promotionDate.$lte = end;
    }

    return query;
}

export async function getPromotedIdLogs(
    search: string,
    page: number,
    sort: string,
    startDate?: string,
    endDate?: string,
) {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { logs: [], hasMore: false, total: 0 };
    }

    const query = buildPromotionQuery(search, startDate, endDate);

    try {
        const db = await connectToDatabase();
        const skip = (page - 1) * PAGE_SIZE;

        const logsFromDb = await db.collection<VisualIdPromotionLog>('visual_id_promotions')
            .find(query)
            .sort({ promotionDate: sort === 'asc' ? 1 : -1 })
            .skip(skip)
            .limit(PAGE_SIZE)
            .toArray();

        const totalLogs = await db.collection('visual_id_promotions').countDocuments(query);
        const hasMore = skip + logsFromDb.length < totalLogs;

        const logs = JSON.parse(JSON.stringify(logsFromDb));

        return { logs, hasMore, total: totalLogs };
    } catch (error) {
        console.error("Error fetching promoted ID logs:", error);
        return { logs: [], hasMore: false, total: 0 };
    }
}

// Deletes one or more specific promotion logs by their _id. Used for the
// single-row delete button and the "Delete Selected" action.
export async function deletePromotedIdLogs(ids: string[]) {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { success: false, message: 'Not authorized.', deletedCount: 0 };
    }

    const objectIds = ids
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));

    if (objectIds.length === 0) {
        return { success: false, message: 'No valid logs selected.', deletedCount: 0 };
    }

    try {
        const db = await connectToDatabase();
        const result = await db.collection('visual_id_promotions').deleteMany({ _id: { $in: objectIds } });
        revalidatePath('/admin/promoted-ids');
        return { success: true, message: `Deleted ${result.deletedCount} log(s).`, deletedCount: result.deletedCount };
    } catch (error) {
        console.error("Error deleting promoted ID logs:", error);
        return { success: false, message: 'Failed to delete logs.', deletedCount: 0 };
    }
}

// Deletes every log matching the current filter (search + IST time frame).
// This guarantees the whole time frame is cleared, not just the loaded page.
export async function deletePromotedIdLogsInRange(search: string, startDate?: string, endDate?: string) {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { success: false, message: 'Not authorized.', deletedCount: 0 };
    }

    const query = buildPromotionQuery(search, startDate, endDate);

    try {
        const db = await connectToDatabase();
        const result = await db.collection('visual_id_promotions').deleteMany(query);
        revalidatePath('/admin/promoted-ids');
        return { success: true, message: `Deleted ${result.deletedCount} log(s).`, deletedCount: result.deletedCount };
    } catch (error) {
        console.error("Error deleting promoted ID logs in range:", error);
        return { success: false, message: 'Failed to delete logs.', deletedCount: 0 };
    }
}
