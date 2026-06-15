'use server';

// --- Support Inbox: live user-identity resolver ---
// Given the UID a support report came from, work out — LIVE, at the moment the
// admin opens the report — whether that UID is currently a Visual ID, a Promoted
// ID (old or new side) or not in any list. This is intentionally a brand-new,
// self-contained server action that only READS existing collections, so none of
// the existing support / visual-id / promoted-id features are affected.
//
// Because the lookup runs fresh every time the admin opens a report, a user who
// sent a message while on a visual ID and was later promoted will correctly show
// the updated status ("N" instead of "V"): the ticket's gamingId is migrated to
// the promoted ID by the existing promoter, so the resolver simply sees the new
// reality.

import { isAdminAuthenticated } from '@/app/actions';
import { connectToDatabase } from '@/lib/mongodb';
import { unstable_noStore as noStore } from 'next/cache';
import type { User, VisualIdPromotionLog } from '@/lib/definitions';
import type { SupportUserIdentity } from '@/lib/support-identity-types';

const USERS_COLLECTION = 'users';
const PROMOTIONS_COLLECTION = 'visual_id_promotions';

/**
 * Resolve the live identity status of the UID a support report came from.
 *
 * @param sourceUid The ticket's current canonical gamingId (the UID the
 *                  messages come from).
 */
export async function getSupportUserIdentity(sourceUid: string): Promise<SupportUserIdentity> {
    noStore();

    const uid = (sourceUid || '').trim();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin || !uid) {
        return { sourceUid: uid, status: 'not-found' };
    }

    try {
        const db = await connectToDatabase();

        // 1) Visual ID list — does this real UID currently have a visual / display
        //    ID set on its user account? Support tickets always store the *real*
        //    gamingId, so matching on `gamingId` is the precise check for "this UID
        //    is currently in the visual id list". We surface the real UID as the
        //    original and the visual id as the current display name.
        const visualUser = await db.collection<User>(USERS_COLLECTION).findOne({
            gamingId: uid,
            visualGamingId: { $exists: true, $ne: '' },
        });
        if (visualUser?.visualGamingId) {
            return {
                sourceUid: uid,
                status: 'visual',
                relatedUid: visualUser.gamingId, // the original (real) UID
                visualUid: visualUser.visualGamingId, // the visual id currently shown
            };
        }

        // 2) Promoted ID list — NEW side. The UID is itself a promoted (now-real)
        //    ID. Surface the OLD UID it came from. Newest promotion wins if a UID
        //    was, across chained promotions, the new side more than once.
        const asNew = await db.collection<VisualIdPromotionLog>(PROMOTIONS_COLLECTION)
            .find({ newGamingId: uid })
            .sort({ promotionDate: -1 })
            .limit(1)
            .next();
        if (asNew) {
            return {
                sourceUid: uid,
                status: 'promoted-new',
                relatedUid: asNew.oldGamingId,
                promotionDate: asNew.promotionDate
                    ? new Date(asNew.promotionDate).toISOString()
                    : undefined,
            };
        }

        // 3) Promoted ID list — OLD side. The UID was promoted away / replaced.
        //    Surface the NEW UID it became.
        const asOld = await db.collection<VisualIdPromotionLog>(PROMOTIONS_COLLECTION)
            .find({ oldGamingId: uid })
            .sort({ promotionDate: -1 })
            .limit(1)
            .next();
        if (asOld) {
            return {
                sourceUid: uid,
                status: 'promoted-old',
                relatedUid: asOld.newGamingId,
                promotionDate: asOld.promotionDate
                    ? new Date(asOld.promotionDate).toISOString()
                    : undefined,
            };
        }

        // 4) Not in any list.
        return { sourceUid: uid, status: 'not-found' };
    } catch (error) {
        console.error('Support: failed to resolve user identity', error);
        return { sourceUid: uid, status: 'not-found' };
    }
}
