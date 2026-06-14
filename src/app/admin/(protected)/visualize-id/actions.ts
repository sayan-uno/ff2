'use server';

import { isAdminAuthenticated } from '@/app/actions';
import { User } from '@/lib/definitions';
import { connectToDatabase } from '@/lib/mongodb';
import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';

const PAGE_SIZE = 10;

// India Standard Time is a fixed UTC+05:30 offset (no daylight saving).
// The date/time pickers in the admin UI send a wall-clock value with no
// timezone (e.g. "2026-06-14T15:30") which the admin enters in IST. We pin
// the IST offset here so the value is converted to the correct UTC instant
// before querying MongoDB (which stores visualIdSetAt as a UTC Date).
function istLocalToUtcDate(local: string): Date | null {
    if (!local) return null;
    const withSeconds = local.length === 16 ? `${local}:00` : local;
    const date = new Date(`${withSeconds}+05:30`);
    return isNaN(date.getTime()) ? null : date;
}

// Builds the MongoDB query shared by listing, counting and range-removal so
// that "what you see" and "what gets removed" always stay in sync.
function buildVisualizedQuery(search: string, startDate?: string, endDate?: string) {
    const query: any = { visualGamingId: { $exists: true, $ne: "" } };

    if (search) {
        query.$or = [
            { gamingId: { $regex: search, $options: 'i' } },
            { visualGamingId: { $regex: search, $options: 'i' } }
        ];
    }

    const start = istLocalToUtcDate(startDate || '');
    const end = istLocalToUtcDate(endDate || '');
    if (start || end) {
        query.visualIdSetAt = {};
        if (start) query.visualIdSetAt.$gte = start;
        if (end) query.visualIdSetAt.$lte = end;
    }

    return query;
}

export async function findUserForVisualId(gamingId: string): Promise<{ success: boolean; message?: string; user?: User; }> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized' };

    if (!gamingId) return { success: false, message: 'Gaming ID is required.' };

    try {
        const db = await connectToDatabase();
        const user = await db.collection<User>('users').findOne({ gamingId });
        if (!user) {
            return { success: false, message: 'User not found.' };
        }
        return { success: true, user: JSON.parse(JSON.stringify(user)) };
    } catch (error) {
        console.error('Error finding user for visual ID:', error);
        return { success: false, message: 'An error occurred while searching for the user.' };
    }
}

export async function setVisualId(realGamingId: string, visualGamingId: string): Promise<{ success: boolean; message: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized' };

    if (!realGamingId || !visualGamingId) {
        return { success: false, message: 'Both real and visual Gaming IDs are required.' };
    }

    try {
        const db = await connectToDatabase();
        const result = await db.collection<User>('users').updateOne(
            { gamingId: realGamingId },
            { $set: { visualGamingId: visualGamingId, visualIdSetAt: new Date() } }
        );

        if (result.matchedCount === 0) {
            return { success: false, message: 'User with the specified real Gaming ID not found.' };
        }

        revalidatePath('/admin/visualize-id');
        return { success: true, message: 'Visual ID has been set successfully.' };
    } catch (error) {
        console.error('Error setting visual ID:', error);
        return { success: false, message: 'An unexpected error occurred.' };
    }
}

export async function removeVisualId(realGamingId: string): Promise<{ success: boolean; message: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized' };
    
    if (!realGamingId) {
        return { success: false, message: 'Real Gaming ID is required.' };
    }

    try {
        const db = await connectToDatabase();
        const result = await db.collection<User>('users').updateOne(
            { gamingId: realGamingId },
            { $unset: { visualGamingId: "", visualIdSetAt: "" } }
        );
        
        if (result.matchedCount === 0) {
            return { success: false, message: 'User not found.' };
        }

        revalidatePath('/admin/visualize-id');
        return { success: true, message: 'Visual ID has been removed.' };
    } catch (error) {
        console.error('Error removing visual ID:', error);
        return { success: false, message: 'An unexpected error occurred.' };
    }
}


export async function getVisualizedUsers(page: number, search: string, sort: string, startDate?: string, endDate?: string) {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { users: [], hasMore: false, totalUsers: 0 };
    }

    const db = await connectToDatabase();
    const skip = (page - 1) * PAGE_SIZE;

    const query = buildVisualizedQuery(search, startDate, endDate);

    const usersFromDb = await db.collection<User>('users')
      .find(query)
      .sort({ visualIdSetAt: sort === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      .toArray();

    const totalUsers = await db.collection('users').countDocuments(query);
    const hasMore = skip + usersFromDb.length < totalUsers;

    const users = JSON.parse(JSON.stringify(usersFromDb));

    return { users, hasMore, totalUsers };
}

// Removes the visual ID from one or more specific users by real gamingId.
// Used for the "Remove Selected" action (and works for a single selection).
export async function removeVisualIdsForUsers(gamingIds: string[]) {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized', modifiedCount: 0 };

    const ids = gamingIds.filter(Boolean);
    if (ids.length === 0) {
        return { success: false, message: 'No users selected.', modifiedCount: 0 };
    }

    try {
        const db = await connectToDatabase();
        const result = await db.collection<User>('users').updateMany(
            { gamingId: { $in: ids }, visualGamingId: { $exists: true, $ne: "" } },
            { $unset: { visualGamingId: "", visualIdSetAt: "" } }
        );
        revalidatePath('/admin/visualize-id');
        return { success: true, message: `Removed visual ID from ${result.modifiedCount} user(s).`, modifiedCount: result.modifiedCount };
    } catch (error) {
        console.error('Error removing visual IDs for users:', error);
        return { success: false, message: 'Failed to remove visual IDs.', modifiedCount: 0 };
    }
}

// Removes the visual ID from every user matching the current filter
// (search + IST time frame). Clears the whole time frame, not just the page.
export async function removeVisualIdsInRange(search: string, startDate?: string, endDate?: string) {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized', modifiedCount: 0 };

    const query = buildVisualizedQuery(search, startDate, endDate);

    try {
        const db = await connectToDatabase();
        const result = await db.collection<User>('users').updateMany(
            query,
            { $unset: { visualGamingId: "", visualIdSetAt: "" } }
        );
        revalidatePath('/admin/visualize-id');
        return { success: true, message: `Removed visual ID from ${result.modifiedCount} user(s).`, modifiedCount: result.modifiedCount };
    } catch (error) {
        console.error('Error removing visual IDs in range:', error);
        return { success: false, message: 'Failed to remove visual IDs.', modifiedCount: 0 };
    }
}
