// ---------------------------------------------------------------------------
// Master purge — "destroy the whole house"
//
// Given a set of gaming IDs, this permanently removes EVERY trace of those IDs
// from the database: the user document itself plus every record across every
// collection that is keyed to (or merely references) the gaming ID, including
// the GridFS support-file bytes and the ID's footprint inside OTHER users'
// login history.
//
// This is a self-contained server-side helper (NOT a server action and NOT a
// route) used only by the admin "Master" section. It never touches the legacy
// wallet-account system (`legacy_users` / `withdrawals`), which is keyed by a
// separate username, not the gaming ID.
//
// Deletion is intentionally NOT wrapped in a single transaction: the dataset
// can be large and GridFS deletes are not transactional. Instead each step is
// best-effort and isolated, so one failing collection never aborts the rest;
// every step's outcome is recorded in the returned report.
// ---------------------------------------------------------------------------

import type { MongoDbWithClient } from '@/lib/mongodb';
import { ObjectId, type GridFSBucket } from 'mongodb';
import { SUPPORT_FILES_BUCKET, getSupportBucket } from '@/lib/support-files';

export interface PurgeReport {
    // Number of gaming IDs that were processed.
    gamingIds: string[];
    // Per-collection count of documents (or files) removed.
    deleted: Record<string, number>;
    // Per-collection count of documents that were modified (e.g. login-history scrub).
    modified: Record<string, number>;
    // Non-fatal errors encountered, keyed by the step that failed.
    errors: Record<string, string>;
}

// Run a single delete step, record its count, and swallow/record any error so
// the overall purge always continues to the next collection.
async function step(
    report: PurgeReport,
    key: string,
    fn: () => Promise<number>,
    bucket: 'deleted' | 'modified' = 'deleted',
): Promise<void> {
    try {
        const n = await fn();
        report[bucket][key] = (report[bucket][key] || 0) + n;
    } catch (err) {
        report.errors[key] = err instanceof Error ? err.message : String(err);
        console.error(`[master-purge] step "${key}" failed:`, err);
    }
}

// Delete every GridFS support-file whose metadata ties it to one of the given
// gaming IDs or their tickets. Returns the number of files removed.
async function purgeSupportFiles(
    db: MongoDbWithClient,
    gamingIds: string[],
    ticketIds: string[],
): Promise<number> {
    const filter: any = { $or: [{ 'metadata.gamingId': { $in: gamingIds } }] };
    if (ticketIds.length > 0) {
        filter.$or.push({ 'metadata.ticketId': { $in: ticketIds } });
    }
    const files = await db
        .collection(`${SUPPORT_FILES_BUCKET}.files`)
        .find(filter, { projection: { _id: 1 } })
        .toArray();
    if (files.length === 0) return 0;

    const bucket: GridFSBucket = getSupportBucket(db);
    let removed = 0;
    for (const f of files) {
        try {
            await bucket.delete(f._id as ObjectId);
            removed++;
        } catch {
            /* already gone — count it as handled */
        }
    }
    return removed;
}

/**
 * Permanently and completely delete every trace of the given gaming IDs.
 */
export async function purgeGamingIdsCompletely(
    db: MongoDbWithClient,
    rawGamingIds: string[],
): Promise<PurgeReport> {
    const gamingIds = Array.from(new Set((rawGamingIds || []).filter(Boolean)));
    const report: PurgeReport = { gamingIds, deleted: {}, modified: {}, errors: {} };
    if (gamingIds.length === 0) return report;

    const inIds = { $in: gamingIds };

    // Resolve the support ticket IDs up front so we can purge their GridFS
    // attachments and images even though those are keyed by ticketId, not
    // gamingId. Done before the tickets themselves are deleted.
    let ticketIds: string[] = [];
    try {
        const tickets = await db
            .collection('support_tickets')
            .find({ gamingId: inIds }, { projection: { _id: 1 } })
            .toArray();
        ticketIds = tickets.map((t) => t._id.toString());
    } catch (err) {
        report.errors['support_tickets.resolve'] = err instanceof Error ? err.message : String(err);
    }

    // --- GridFS attachment bytes first (so orphans can't linger if a later
    // step throws). ---
    await step(report, 'support_files', () => purgeSupportFiles(db, gamingIds, ticketIds));

    // --- The user documents themselves. ---
    await step(report, 'users', async () =>
        (await db.collection('users').deleteMany({ gamingId: inIds })).deletedCount,
    );

    // --- Everything keyed directly by gamingId. ---
    await step(report, 'orders', async () =>
        (await db.collection('orders').deleteMany({ gamingId: inIds })).deletedCount,
    );
    await step(report, 'ai_logs', async () =>
        (await db.collection('ai_logs').deleteMany({ gamingId: inIds })).deletedCount,
    );
    await step(report, 'user_product_controls', async () =>
        (await db.collection('user_product_controls').deleteMany({ gamingId: inIds })).deletedCount,
    );
    await step(report, 'refund_requests', async () =>
        (await db.collection('refund_requests').deleteMany({ gamingId: inIds })).deletedCount,
    );
    await step(report, 'payment_locks', async () =>
        (await db.collection('payment_locks').deleteMany({ gamingId: inIds })).deletedCount,
    );
    await step(report, 'support_blocks', async () =>
        (await db.collection('support_blocks').deleteMany({ gamingId: inIds })).deletedCount,
    );
    await step(report, 'support_upload_limits', async () =>
        (await db.collection('support_upload_limits').deleteMany({ gamingId: inIds })).deletedCount,
    );
    await step(report, 'support_upload_chunks', async () =>
        (await db.collection('support_upload_chunks').deleteMany({ gamingId: inIds })).deletedCount,
    );
    await step(report, 'sms_webhook_logs', async () =>
        (await db.collection('sms_webhook_logs').deleteMany({ matchedGamingId: inIds })).deletedCount,
    );

    // --- Support images: keyed by gamingId, but also catch any tied only by
    // ticketId (older/edge docs). ---
    await step(report, 'support_images', async () => {
        const filter: any = { $or: [{ gamingId: inIds }] };
        if (ticketIds.length > 0) filter.$or.push({ ticketId: { $in: ticketIds } });
        return (await db.collection('support_images').deleteMany(filter)).deletedCount;
    });

    // --- Support tickets themselves (after images/files resolved above). ---
    await step(report, 'support_tickets', async () =>
        (await db.collection('support_tickets').deleteMany({ gamingId: inIds })).deletedCount,
    );

    // --- Notifications: both received (gamingId) and sent gift notifications
    // (senderGamingId). ---
    await step(report, 'notifications', async () =>
        (await db.collection('notifications').deleteMany({
            $or: [{ gamingId: inIds }, { senderGamingId: inIds }],
        })).deletedCount,
    );

    // --- Promotion logs that reference either side of the ID. ---
    await step(report, 'visual_id_promotions', async () =>
        (await db.collection('visual_id_promotions').deleteMany({
            $or: [{ oldGamingId: inIds }, { newGamingId: inIds }],
        })).deletedCount,
    );

    // --- Pre-seeded login history (the ID being seeded, or the seed target). ---
    await step(report, 'pre_seeded_login_history', async () =>
        (await db.collection('pre_seeded_login_history').deleteMany({
            $or: [{ gamingIdToSeed: inIds }, { 'historyEntry.gamingId': inIds }],
        })).deletedCount,
    );

    // --- Blocked-identifier entries of type 'id'. ---
    await step(report, 'blocked_identifiers', async () =>
        (await db.collection('blocked_identifiers').deleteMany({
            type: 'id',
            value: inIds,
        })).deletedCount,
    );

    // --- Scrub the ID out of every OTHER user's login history so no dangling
    // reference survives. ---
    await step(
        report,
        'users.loginHistory',
        async () =>
            (await db.collection('users').updateMany(
                { 'loginHistory.gamingId': inIds },
                { $pull: { loginHistory: { gamingId: inIds } } as any },
            )).modifiedCount,
        'modified',
    );

    return report;
}
