'use server';

// ---------------------------------------------------------------------------
// Master section — powerful offline-ID cleanup.
//
// Lists every gaming ID that has been OFFLINE for longer than an admin-selected
// duration (older than 1 day … up to 5 years), then lets the admin completely
// destroy the selected IDs and everything attached to them.
//
// The "catch": an ID that appears in the Promoted ID list (visual_id_promotions)
// — on either the old or the new side — only shows up when its opposite side is
// ALSO offline beyond the threshold. If the opposite side has been active more
// recently than the threshold, neither side is listed. A missing/deleted
// opposite side counts as offline (there is nothing left to protect). IDs that
// are NOT in the promoted list always show up when they are offline.
//
// Self-contained: only this folder + src/lib/master-purge.ts implement the
// feature; no existing files are modified except one nav link.
// ---------------------------------------------------------------------------

import { isAdminAuthenticated } from '@/app/actions';
import { connectToDatabase } from '@/lib/mongodb';
import { purgeGamingIdsCompletely, type PurgeReport } from '@/lib/master-purge';
import { durationMs, type MasterUserRow } from './shared';
import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';

const PAGE_SIZE = 20;

// A lightweight candidate: an offline user with the fields needed to apply the
// promoted-list gate before paginating.
interface Candidate {
    _id: string;
    gamingId: string;
    lastSeen: Date;
}

// Pull every user whose most recent activity is older than the cut-off. Uses
// max(visits) as the "last seen", falling back to createdAt for accounts with
// no recorded visits (so genuinely dormant IDs are still catchable).
async function loadOfflineCandidates(
    db: Awaited<ReturnType<typeof connectToDatabase>>,
    cutoff: Date,
    search: string,
): Promise<Candidate[]> {
    const baseMatch: any = {};
    if (search) baseMatch.gamingId = { $regex: search, $options: 'i' };

    const docs = await db
        .collection('users')
        .aggregate([
            { $match: baseMatch },
            { $addFields: { lastSeen: { $ifNull: [{ $max: '$visits' }, '$createdAt'] } } },
            { $match: { lastSeen: { $ne: null, $lte: cutoff } } },
            { $project: { _id: 1, gamingId: 1, lastSeen: 1 } },
        ])
        .toArray();

    return docs.map((d) => ({
        _id: d._id.toString(),
        gamingId: d.gamingId,
        lastSeen: new Date(d.lastSeen),
    }));
}

/**
 * Get the page of offline IDs after applying the promoted-list both-sides gate.
 */
export async function getOfflineUsers(
    durationKey: string,
    page: number,
    search: string,
    sort: string,
): Promise<{ users: MasterUserRow[]; hasMore: boolean; total: number }> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { users: [], hasMore: false, total: 0 };

    const ms = durationMs(durationKey);
    if (ms === null) return { users: [], hasMore: false, total: 0 };

    try {
        const db = await connectToDatabase();
        const cutoff = new Date(Date.now() - ms);

        // 1. All offline candidates (matching the optional search).
        const candidates = await loadOfflineCandidates(db, cutoff, search);
        if (candidates.length === 0) return { users: [], hasMore: false, total: 0 };

        const candidateIds = candidates.map((c) => c.gamingId);
        const lastSeenByGamingId = new Map<string, Date>();
        for (const c of candidates) lastSeenByGamingId.set(c.gamingId, c.lastSeen);

        // 2. Promotions touching any candidate (on either side).
        const promotions = await db
            .collection('visual_id_promotions')
            .find(
                { $or: [{ oldGamingId: { $in: candidateIds } }, { newGamingId: { $in: candidateIds } }] },
                { projection: { oldGamingId: 1, newGamingId: 1 } },
            )
            .toArray();

        // Map each candidate to its side + opposite partner ID(s).
        const sideByGamingId = new Map<string, 'old' | 'new'>();
        const partnersByGamingId = new Map<string, Set<string>>();
        const addPartner = (id: string, partner: string, side: 'old' | 'new') => {
            sideByGamingId.set(id, side);
            if (!partnersByGamingId.has(id)) partnersByGamingId.set(id, new Set());
            if (partner) partnersByGamingId.get(id)!.add(partner);
        };
        const candidateSet = new Set(candidateIds);
        for (const p of promotions) {
            if (candidateSet.has(p.oldGamingId)) addPartner(p.oldGamingId, p.newGamingId, 'old');
            if (candidateSet.has(p.newGamingId)) addPartner(p.newGamingId, p.oldGamingId, 'new');
        }

        // 3. Resolve the offline status of every opposite partner that isn't
        // itself an offline candidate. A partner is "active" (and therefore
        // protects its pair) only if a user doc exists for it whose lastSeen is
        // MORE RECENT than the cut-off. Missing partner ⇒ offline.
        const partnersToLookup = new Set<string>();
        for (const set of partnersByGamingId.values()) {
            for (const partner of set) {
                if (!lastSeenByGamingId.has(partner)) partnersToLookup.add(partner);
            }
        }
        const activePartners = new Set<string>();
        if (partnersToLookup.size > 0) {
            const partnerDocs = await db
                .collection('users')
                .aggregate([
                    { $match: { gamingId: { $in: Array.from(partnersToLookup) } } },
                    { $addFields: { lastSeen: { $ifNull: [{ $max: '$visits' }, '$createdAt'] } } },
                    { $project: { gamingId: 1, lastSeen: 1 } },
                ])
                .toArray();
            for (const d of partnerDocs) {
                const seen = d.lastSeen ? new Date(d.lastSeen) : null;
                if (seen && seen > cutoff) activePartners.add(d.gamingId);
            }
        }

        // Helper: is a partner offline (beyond the threshold)?
        const partnerIsOffline = (partner: string): boolean => {
            if (activePartners.has(partner)) return false;          // recently active ⇒ protects pair
            const seen = lastSeenByGamingId.get(partner);
            if (seen) return seen <= cutoff;                        // offline candidate ⇒ offline
            return true;                                            // missing ⇒ counts as offline
        };

        // 4. Apply the gate: promoted candidates require EVERY partner offline.
        const passing = candidates.filter((c) => {
            const partners = partnersByGamingId.get(c.gamingId);
            if (!partners || partners.size === 0) return true;       // not promoted ⇒ always show
            return Array.from(partners).every(partnerIsOffline);
        });

        // 5. Sort by lastSeen and paginate.
        passing.sort((a, b) =>
            sort === 'asc'
                ? a.lastSeen.getTime() - b.lastSeen.getTime()
                : b.lastSeen.getTime() - a.lastSeen.getTime(),
        );
        const total = passing.length;
        const skip = (page - 1) * PAGE_SIZE;
        const pageSlice = passing.slice(skip, skip + PAGE_SIZE);

        // 6. Order counts for just this page's gaming IDs.
        const orderCounts = new Map<string, number>();
        if (pageSlice.length > 0) {
            const counts = await db
                .collection('orders')
                .aggregate([
                    { $match: { gamingId: { $in: pageSlice.map((u) => u.gamingId) } } },
                    { $group: { _id: '$gamingId', count: { $sum: 1 } } },
                ])
                .toArray();
            for (const c of counts) orderCounts.set(c._id, c.count);
        }

        const users: MasterUserRow[] = pageSlice.map((u) => ({
            _id: u._id,
            gamingId: u.gamingId,
            lastSeen: u.lastSeen.toISOString(),
            orderCount: orderCounts.get(u.gamingId) || 0,
            promotedSide: sideByGamingId.get(u.gamingId) ?? null,
            partnerIds: Array.from(partnersByGamingId.get(u.gamingId) || []),
        }));

        return { users, hasMore: skip + pageSlice.length < total, total };
    } catch (error) {
        console.error('Error fetching offline users for master section:', error);
        return { users: [], hasMore: false, total: 0 };
    }
}

/**
 * Completely destroy the given gaming IDs and everything attached to them.
 */
export async function purgeGamingIds(
    gamingIds: string[],
): Promise<{ success: boolean; message: string; report?: PurgeReport }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized.' };

    const cleaned = Array.from(new Set((gamingIds || []).filter(Boolean)));
    if (cleaned.length === 0) {
        return { success: false, message: 'No gaming IDs selected.' };
    }

    try {
        const db = await connectToDatabase();
        const report = await purgeGamingIdsCompletely(db, cleaned);

        const totalDeleted = Object.values(report.deleted).reduce((a, b) => a + b, 0);
        const errorKeys = Object.keys(report.errors);

        // Refresh the admin views whose data we just nuked.
        for (const path of [
            '/admin/master', '/admin/active-users', '/admin/users', '/admin/promoted-ids',
            '/admin/support', '/admin/refunds', '/admin/ai-logs', '/admin/all-orders',
        ]) {
            revalidatePath(path);
        }

        const base = `Destroyed ${cleaned.length} ID(s) and ${totalDeleted} attached record(s).`;
        if (errorKeys.length > 0) {
            return {
                success: true,
                message: `${base} ${errorKeys.length} step(s) had issues: ${errorKeys.join(', ')}.`,
                report,
            };
        }
        return { success: true, message: base, report };
    } catch (error) {
        console.error('Error purging gaming IDs:', error);
        return { success: false, message: 'Failed to destroy the selected IDs.' };
    }
}
