import { type ClientSession } from 'mongodb';
import { type MongoDbWithClient } from '@/lib/mongodb';
import type { RefundRequest } from '@/lib/refund-definitions';

const REFUND_COLLECTION = 'refund_requests';

/**
 * Migrates every accepted refund request from a soon-to-be-deleted old gaming ID
 * over to the promoted gaming ID.
 *
 * This mirrors the migration the visual-ID promoter already performs for orders,
 * notifications and support data. It is intentionally a plain helper (not a server
 * action) so it can run inside the promoter's existing MongoDB transaction
 * `session`, keeping the whole promotion atomic.
 *
 * A refund request is keyed by (gamingId + orderId). Because the related orders
 * are migrated to the new gaming ID in the same transaction (and the orderId — the
 * order's _id — never changes), simply re-pointing gamingId keeps each refund
 * matched to its order with no key conflict. The now-redundant visualGamingId is
 * cleared, matching how the promoted user document and support reports drop it.
 *
 * @param db           The connected database.
 * @param session      The active transaction session from the promoter.
 * @param oldGamingId  The original gaming ID that is about to be deleted.
 * @param newGamingId  The promoted (formerly "visual") gaming ID to keep.
 */
export async function migrateRefundDataToPromotedId(
  db: MongoDbWithClient,
  session: ClientSession,
  oldGamingId: string,
  newGamingId: string
): Promise<void> {
  await db.collection<RefundRequest>(REFUND_COLLECTION).updateMany(
    { gamingId: oldGamingId },
    { $set: { gamingId: newGamingId }, $unset: { visualGamingId: '' } },
    { session }
  );
}
