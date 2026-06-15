
'use server';

import { isAdminAuthenticated } from '@/app/actions';
import { User } from '@/lib/definitions';
import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { unstable_noStore as noStore } from 'next/cache';

const PAGE_SIZE = 10;

// India Standard Time is a fixed UTC+05:30 offset (no daylight saving).
// The date/time pickers in the admin UI send a wall-clock value with no
// timezone (e.g. "2026-06-14T15:30") which the admin enters in IST. We pin
// the IST offset here so the value is converted to the correct UTC instant
// before matching against the stored visit dates (which are UTC).
function istLocalToUtcDate(local: string): Date | null {
    if (!local) return null;
    const withSeconds = local.length === 16 ? `${local}:00` : local;
    const date = new Date(`${withSeconds}+05:30`);
    return isNaN(date.getTime()) ? null : date;
}

// Builds the leading aggregation stages shared by listing, counting and
// range-deletion so that "what you see" and "what gets deleted" always match.
// The time frame filters on `lastVisit` (the user's most recent visit), which
// is a computed field, so it must be matched after $addFields.
function buildActiveUsersMatchStages(search: string, startDate?: string, endDate?: string): any[] {
    const baseQuery: any = {
        visits: { $exists: true, $not: { $size: 0 } },
        isHidden: { $ne: true },
        isBanned: { $ne: true }
    };
    if (search) {
        baseQuery.gamingId = { $regex: search, $options: 'i' };
    }

    const stages: any[] = [
        { $match: baseQuery },
        { $addFields: { lastVisit: { $max: "$visits" } } },
    ];

    const start = istLocalToUtcDate(startDate || '');
    const end = istLocalToUtcDate(endDate || '');
    if (start || end) {
        const lastVisitRange: any = {};
        if (start) lastVisitRange.$gte = start;
        if (end) lastVisitRange.$lte = end;
        stages.push({ $match: { lastVisit: lastVisitRange } });
    }

    return stages;
}

export async function getActiveUsers(page: number, search: string, sort: string, startDate?: string, endDate?: string): Promise<{ users: (User & { lastVisit: Date, orderCount: number })[], hasMore: boolean, totalUsers: number }> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { users: [], hasMore: false, totalUsers: 0 };
    }

    try {
        const db = await connectToDatabase();
        const skip = (page - 1) * PAGE_SIZE;

        const matchStages = buildActiveUsersMatchStages(search, startDate, endDate);

        const aggregationPipeline: any[] = [
            ...matchStages,
            // Sort by the most recent visit first
            {
                $sort: { lastVisit: sort === 'asc' ? 1 : -1 }
            },
            // Pagination
            {
                $skip: skip
            },
            {
                $limit: PAGE_SIZE
            },
            // Join with orders collection to get order count
            {
                $lookup: {
                    from: "orders",
                    localField: "gamingId",
                    foreignField: "gamingId",
                    as: "userOrders"
                }
            },
            // Add the order count field
            {
                $addFields: {
                    orderCount: { $size: "$userOrders" }
                }
            },
            // Clean up the output
            {
                $project: {
                    userOrders: 0, // Exclude the large orders array
                }
            }
        ];

        const users = await db.collection('users').aggregate(aggregationPipeline).toArray();

        const countResult = await db.collection('users').aggregate([
            ...matchStages,
            { $count: 'count' }
        ]).toArray();
        const totalUsers = countResult.length > 0 ? countResult[0].count : 0;

        const hasMore = (skip + users.length) < totalUsers;

        return { users: JSON.parse(JSON.stringify(users)), hasMore, totalUsers };

    } catch (error) {
        console.error("Error fetching active users:", error);
        return { users: [], hasMore: false, totalUsers: 0 };
    }
}

// Permanently deletes one or more user documents by their _id.
// Used for the single-row delete and the "Delete Selected" action.
export async function deleteActiveUsers(ids: string[]) {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized', deletedCount: 0 };

    const objectIds = ids
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));

    if (objectIds.length === 0) {
        return { success: false, message: 'No valid users selected.', deletedCount: 0 };
    }

    try {
        const db = await connectToDatabase();
        const result = await db.collection<User>('users').deleteMany({ _id: { $in: objectIds } });
        revalidatePath('/admin/active-users');
        return { success: true, message: `Deleted ${result.deletedCount} user(s).`, deletedCount: result.deletedCount };
    } catch (error) {
        console.error("Error deleting active users:", error);
        return { success: false, message: 'Failed to delete users.', deletedCount: 0 };
    }
}

// Permanently deletes every user matching the current filter (search + IST
// time frame). Clears the whole time frame, not just the loaded page.
export async function deleteActiveUsersInRange(search: string, startDate?: string, endDate?: string) {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized', deletedCount: 0 };

    try {
        const db = await connectToDatabase();
        const matchStages = buildActiveUsersMatchStages(search, startDate, endDate);

        // The time frame filters on a computed field, so resolve the matching
        // _ids via aggregation first, then delete them.
        const idDocs = await db.collection('users').aggregate([
            ...matchStages,
            { $project: { _id: 1 } }
        ]).toArray();

        const objectIds = idDocs.map(doc => doc._id);
        if (objectIds.length === 0) {
            return { success: true, message: 'No users matched the filter.', deletedCount: 0 };
        }

        const result = await db.collection<User>('users').deleteMany({ _id: { $in: objectIds } });
        revalidatePath('/admin/active-users');
        return { success: true, message: `Deleted ${result.deletedCount} user(s).`, deletedCount: result.deletedCount };
    } catch (error) {
        console.error("Error deleting active users in range:", error);
        return { success: false, message: 'Failed to delete users.', deletedCount: 0 };
    }
}
