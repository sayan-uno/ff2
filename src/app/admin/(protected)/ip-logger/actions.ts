
'use server';

import { isAdminAuthenticated } from '@/app/actions';
import { User } from '@/lib/definitions';
import { connectToDatabase } from '@/lib/mongodb';
import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';
import { ObjectId } from 'mongodb';

const PAGE_SIZE = 20;

// India Standard Time is a fixed UTC+05:30 offset (no daylight saving). The
// admin date/time pickers send a wall-clock value with no timezone (e.g.
// "2026-06-14T15:30") entered in IST. We pin the IST offset here so it is
// converted to the correct UTC instant before matching the stored history
// timestamps (which are UTC).
function istLocalToUtcDate(local: string): Date | null {
    if (!local) return null;
    const withSeconds = local.length === 16 ? `${local}:00` : local;
    const date = new Date(`${withSeconds}+05:30`);
    return isNaN(date.getTime()) ? null : date;
}

// Builds the query shared by the listing, count and range-deletion so that
// "what you see" and "what gets deleted" always match. The time frame matches
// users that have an IP or device-fingerprint history entry whose timestamp
// falls within the chosen IST window.
function buildSecurityLogQuery(searchId: string, searchIp: string, searchFingerprint: string, startDate?: string, endDate?: string) {
    const query: any = {};
    const andConditions: any[] = [];

    if (searchId) {
        andConditions.push({ gamingId: { $regex: searchId, $options: 'i' } });
    }
    if (searchIp) {
        andConditions.push({ 'ipHistory.ip': { $regex: searchIp.replace(/\./g, '\\.'), $options: 'i' } });
    }
    if (searchFingerprint) {
        andConditions.push({ 'fingerprintHistory.fingerprint': { $regex: searchFingerprint, $options: 'i' } });
    }

    const start = istLocalToUtcDate(startDate || '');
    const end = istLocalToUtcDate(endDate || '');
    if (start || end) {
        const range: any = {};
        if (start) range.$gte = start;
        if (end) range.$lte = end;
        andConditions.push({
            $or: [
                { ipHistory: { $elemMatch: { timestamp: range } } },
                { fingerprintHistory: { $elemMatch: { timestamp: range } } },
            ],
        });
    }

    if (andConditions.length > 0) {
        query.$and = andConditions;
    } else {
        // If no search, only show users with some history
        query.$or = [
            { ipHistory: { $exists: true, $not: { $size: 0 } } },
            { fingerprintHistory: { $exists: true, $not: { $size: 0 } } }
        ];
    }

    return query;
}

export async function getIpHistory(page: number, searchId: string, searchIp: string, searchFingerprint: string, startDate?: string, endDate?: string) {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { users: [], hasMore: false, totalUsers: 0 };
    }

    const db = await connectToDatabase();
    const skip = (page - 1) * PAGE_SIZE;

    const query = buildSecurityLogQuery(searchId, searchIp, searchFingerprint, startDate, endDate);

    const usersFromDb = await db.collection<User>('users')
        .find(query)
        .sort({ 'visits.0': -1 }) // Sort by most recent visit
        .skip(skip)
        .limit(PAGE_SIZE)
        .project({ gamingId: 1, ipHistory: 1, fingerprintHistory: 1 })
        .toArray();
    
    const totalUsers = await db.collection('users').countDocuments(query);
    const hasMore = skip + usersFromDb.length < totalUsers;
    const users = JSON.parse(JSON.stringify(usersFromDb));

    return { users, hasMore, totalUsers };
}

export async function searchUsersByIp(ip: string) {
     noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { users: [] };
    }
    const db = await connectToDatabase();
    const usersFromDb = await db.collection<User>('users')
        .find({ 'ipHistory.ip': ip })
        .project({ gamingId: 1 })
        .toArray();

    return { users: JSON.parse(JSON.stringify(usersFromDb)) };
}

// Builds the update that clears a user's security history. When an IST time
// frame is given, only the IP/fingerprint entries whose timestamp falls inside
// that window are pulled out; otherwise the whole history is wiped. The user
// account itself is always kept.
function buildClearHistoryUpdate(startDate?: string, endDate?: string) {
    const start = istLocalToUtcDate(startDate || '');
    const end = istLocalToUtcDate(endDate || '');
    if (start || end) {
        const tsCond: any = {};
        if (start) tsCond.$gte = start;
        if (end) tsCond.$lte = end;
        return {
            $pull: {
                ipHistory: { timestamp: tsCond },
                fingerprintHistory: { timestamp: tsCond },
            },
        };
    }
    return { $set: { ipHistory: [], fingerprintHistory: [] } };
}

// Clears the security history (IP + device fingerprint logs) for one or more
// users by their _id. The user account is kept. Used for the single-row clear
// and the "Clear Selected" action. Respects the IST time frame when given.
export async function clearSecurityLogUsers(ids: string[], startDate?: string, endDate?: string) {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized', modifiedCount: 0 };

    const objectIds = ids
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id));

    if (objectIds.length === 0) {
        return { success: false, message: 'No valid users selected.', modifiedCount: 0 };
    }

    try {
        const db = await connectToDatabase();
        const update = buildClearHistoryUpdate(startDate, endDate);
        const result = await db.collection('users').updateMany({ _id: { $in: objectIds } }, update as any);
        revalidatePath('/admin/ip-logger');
        return { success: true, message: `Cleared security history for ${result.modifiedCount} user(s).`, modifiedCount: result.modifiedCount };
    } catch (error) {
        console.error('Error clearing security log history:', error);
        return { success: false, message: 'Failed to clear security history.', modifiedCount: 0 };
    }
}

// Clears the security history for every user matching the current filter
// (search + IST time frame), not just the loaded page. The user accounts are
// kept; only the IP/fingerprint logs are removed.
export async function clearSecurityLogUsersInRange(searchId: string, searchIp: string, searchFingerprint: string, startDate?: string, endDate?: string) {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized', modifiedCount: 0 };

    const query = buildSecurityLogQuery(searchId, searchIp, searchFingerprint, startDate, endDate);

    try {
        const db = await connectToDatabase();
        const update = buildClearHistoryUpdate(startDate, endDate);
        const result = await db.collection('users').updateMany(query, update as any);
        revalidatePath('/admin/ip-logger');
        return { success: true, message: `Cleared security history for ${result.modifiedCount} user(s).`, modifiedCount: result.modifiedCount };
    } catch (error) {
        console.error('Error clearing security log history in range:', error);
        return { success: false, message: 'Failed to clear security history.', modifiedCount: 0 };
    }
}
