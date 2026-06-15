// --- Batch ID-list membership classifier ---
// Given a batch of gaming IDs, work out — LIVE — which ones are currently in the
// Visual ID list, and which are on the old / new side of the Promoted ID list.
//
// This is a plain server-side helper (NOT a server action and NOT a route): it
// only READS the existing `users` and `visual_id_promotions` collections, so no
// existing feature is affected. It mirrors the single-UID logic used by the
// support inbox identity resolver, batched for efficiency when filtering a whole
// list of orders.

import type { MongoDbWithClient } from '@/lib/mongodb';
import type { User, VisualIdPromotionLog } from '@/lib/definitions';

// The categories the admin can filter pending orders by.
export type IdListCategory = 'all' | 'visual' | 'promoted-old' | 'promoted-new' | 'no-list';

export interface IdListMembership {
    // Gaming IDs that currently have an active visual / display ID.
    visual: Set<string>;
    // Gaming IDs present on the OLD side of the promoted list (promoted away).
    promotedOld: Set<string>;
    // Gaming IDs present on the NEW side of the promoted list (promoted, now real).
    promotedNew: Set<string>;
}

const USERS_COLLECTION = 'users';
const PROMOTIONS_COLLECTION = 'visual_id_promotions';

/**
 * Classify a batch of gaming IDs into their current list memberships.
 * Only the IDs actually passed in are ever placed in the returned sets.
 */
export async function classifyGamingIds(
    db: MongoDbWithClient,
    gamingIds: string[],
): Promise<IdListMembership> {
    const unique = Array.from(new Set((gamingIds || []).filter(Boolean)));
    if (unique.length === 0) {
        return { visual: new Set(), promotedOld: new Set(), promotedNew: new Set() };
    }

    const [visualUsers, promotions] = await Promise.all([
        db
            .collection<User>(USERS_COLLECTION)
            .find(
                { gamingId: { $in: unique }, visualGamingId: { $exists: true, $ne: '' } },
                { projection: { gamingId: 1 } },
            )
            .toArray(),
        db
            .collection<VisualIdPromotionLog>(PROMOTIONS_COLLECTION)
            .find(
                { $or: [{ oldGamingId: { $in: unique } }, { newGamingId: { $in: unique } }] },
                { projection: { oldGamingId: 1, newGamingId: 1 } },
            )
            .toArray(),
    ]);

    const uniqueSet = new Set(unique);
    const visual = new Set(visualUsers.map((u) => u.gamingId));
    const promotedOld = new Set<string>();
    const promotedNew = new Set<string>();
    for (const p of promotions) {
        if (uniqueSet.has(p.oldGamingId)) promotedOld.add(p.oldGamingId);
        if (uniqueSet.has(p.newGamingId)) promotedNew.add(p.newGamingId);
    }

    return { visual, promotedOld, promotedNew };
}

/**
 * Whether a single gaming ID belongs to the chosen category, given a previously
 * computed membership map. 'no-list' means the ID is in none of the three lists.
 */
export function matchesIdListCategory(
    gamingId: string,
    category: IdListCategory,
    membership: IdListMembership,
): boolean {
    switch (category) {
        case 'visual':
            return membership.visual.has(gamingId);
        case 'promoted-old':
            return membership.promotedOld.has(gamingId);
        case 'promoted-new':
            return membership.promotedNew.has(gamingId);
        case 'no-list':
            return (
                !membership.visual.has(gamingId) &&
                !membership.promotedOld.has(gamingId) &&
                !membership.promotedNew.has(gamingId)
            );
        case 'all':
        default:
            return true;
    }
}
