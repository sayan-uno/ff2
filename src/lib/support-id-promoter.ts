import { type ClientSession } from 'mongodb';
import { type MongoDbWithClient } from '@/lib/mongodb';
import type { SupportTicket, SupportImage } from '@/lib/support-definitions';

const TICKET_COLLECTION = 'support_tickets';
const IMAGE_COLLECTION = 'support_images';
const BLOCK_COLLECTION = 'support_blocks';

/**
 * Migrates every support-feature record (reports, their images, and any support
 * block) from a soon-to-be-deleted old gaming ID over to the promoted gaming ID.
 *
 * This mirrors the migration the visual-ID promoter already performs for orders,
 * notifications, etc. It is intentionally a plain helper (not a server action) so
 * it can run inside the promoter's existing MongoDB transaction `session`, keeping
 * the whole promotion atomic.
 *
 * @param db           The connected database.
 * @param session      The active transaction session from the promoter.
 * @param oldGamingId  The original gaming ID that is about to be deleted.
 * @param newGamingId  The promoted (formerly "visual") gaming ID to keep.
 */
export async function migrateSupportDataToPromotedId(
  db: MongoDbWithClient,
  session: ClientSession,
  oldGamingId: string,
  newGamingId: string
): Promise<void> {
  // Move the reports (tickets) themselves. The visual ID has now become the real
  // ID, so we point gamingId at the new ID and clear the now-redundant
  // visualGamingId field (matching how the promoted user document drops it).
  await db.collection<SupportTicket>(TICKET_COLLECTION).updateMany(
    { gamingId: oldGamingId },
    { $set: { gamingId: newGamingId }, $unset: { visualGamingId: '' } },
    { session }
  );

  // Move the stored images attached to those reports.
  await db.collection<SupportImage>(IMAGE_COLLECTION).updateMany(
    { gamingId: oldGamingId },
    { $set: { gamingId: newGamingId } },
    { session }
  );

  // Carry over any support block so a blocked user cannot escape it via promotion.
  await db.collection(BLOCK_COLLECTION).updateMany(
    { gamingId: oldGamingId },
    { $set: { gamingId: newGamingId } },
    { session }
  );
}
