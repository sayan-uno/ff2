import { GridFSBucket, ObjectId, Binary } from 'mongodb';
import type { MongoDbWithClient } from '@/lib/mongodb';
import type { SupportFileRef, SupportUploadLimit } from '@/lib/support-definitions';

// ---------------------------------------------------------------------------
// Large-attachment storage for the support inbox (videos & documents).
//
// Unlike the inline base64 image path (capped at ~8MB and stored in a single
// `support_images` doc), big files would blow past MongoDB's 16MB BSON document
// limit. So videos/files are streamed into GridFS, which transparently splits
// them into 255KB chunks across `support_files.files` + `support_files.chunks`.
//
// Uploads also have to survive the hosting platform's per-request body cap
// (Cloud Run ~32MB), so the browser sends the file in small chunks to
// `/api/support/upload`; each chunk is parked in `support_upload_chunks` and,
// once the final chunk arrives, the whole thing is assembled into GridFS in
// order (one chunk in memory at a time). This module owns all of that plumbing
// so the rest of the app never touches GridFS directly.
// ---------------------------------------------------------------------------

export const SUPPORT_FILES_BUCKET = 'support_files';
export const UPLOAD_CHUNKS_COLLECTION = 'support_upload_chunks';
export const UPLOAD_LIMITS_COLLECTION = 'support_upload_limits';

// The two upload tiers. Everyone starts at 10MB for videos/files; an admin can
// raise a single user to the 250MB ceiling.
export const DEFAULT_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;   // 10 MB
export const MAX_UPLOAD_LIMIT_BYTES = 250 * 1024 * 1024;      // 250 MB

// The browser uploads in 4MB pieces — comfortably under both the server-action
// and Cloud Run request-size limits, while keeping the number of requests sane
// even for a 250MB file (~63 chunks).
export const UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;

// Abandoned partial uploads (temp chunks) are swept after this long.
const STALE_CHUNK_MS = 6 * 60 * 60 * 1000; // 6 hours

export function getSupportBucket(db: MongoDbWithClient): GridFSBucket {
    return new GridFSBucket(db, { bucketName: SUPPORT_FILES_BUCKET });
}

// Classify an attachment from its MIME type so the chat can render it correctly:
// images as a zoomable album, videos with a player, everything else as a file card.
export function classifyKind(contentType: string): 'image' | 'video' | 'file' {
    const ct = (contentType || '').toLowerCase();
    if (ct.startsWith('image/')) return 'image';
    if (ct.startsWith('video/')) return 'video';
    return 'file';
}

// The metadata we stash on each GridFS file so we can authorise access and
// render the bubble without ever loading the bytes.
export interface SupportFileMetadata {
    ticketId: string;
    gamingId: string;
    uploadedBy: 'user' | 'admin';
    kind: 'image' | 'video' | 'file';
    contentType: string;
}

// Read a user's current per-file upload limit (defaults to the 10MB tier).
export async function getUploadLimitBytes(
    db: MongoDbWithClient,
    gamingId: string
): Promise<number> {
    if (!gamingId) return DEFAULT_UPLOAD_LIMIT_BYTES;
    const doc = await db
        .collection<SupportUploadLimit>(UPLOAD_LIMITS_COLLECTION)
        .findOne({ gamingId });
    const limit = doc?.limitBytes;
    if (typeof limit !== 'number' || limit <= 0) return DEFAULT_UPLOAD_LIMIT_BYTES;
    // Never honour anything above the hard ceiling, even if the DB says otherwise.
    return Math.min(limit, MAX_UPLOAD_LIMIT_BYTES);
}

// Ensure the temp-chunk + limit indexes exist (idempotent, run once per process).
// Keeps chunk lookup during assembly O(log n) and limit lookups fast on Atlas.
let indexesEnsured = false;
async function ensureIndexes(db: MongoDbWithClient): Promise<void> {
    if (indexesEnsured) return;
    indexesEnsured = true;
    try {
        await db
            .collection(UPLOAD_CHUNKS_COLLECTION)
            .createIndex({ uploadId: 1, index: 1 });
        await db
            .collection(UPLOAD_LIMITS_COLLECTION)
            .createIndex({ gamingId: 1 }, { unique: true });
    } catch {
        // Index creation is best-effort; never block an upload on it.
        indexesEnsured = false;
    }
}

// Store one incoming chunk of an in-progress upload.
export async function saveUploadChunk(
    db: MongoDbWithClient,
    params: {
        uploadId: string;
        index: number;
        gamingId: string;
        ticketId: string;
        data: Buffer;
    }
): Promise<void> {
    await ensureIndexes(db);
    await db.collection(UPLOAD_CHUNKS_COLLECTION).insertOne({
        uploadId: params.uploadId,
        index: params.index,
        gamingId: params.gamingId,
        ticketId: params.ticketId,
        data: new Binary(params.data),
        createdAt: new Date(),
    });
}

// Assemble every stored chunk for an upload (in order) into a single GridFS
// file, then delete the temp chunks. Returns the new file's id + size.
export async function assembleUpload(
    db: MongoDbWithClient,
    params: {
        uploadId: string;
        totalChunks: number;
        filename: string;
        metadata: SupportFileMetadata;
    }
): Promise<{ fileId: string; size: number }> {
    const { uploadId, totalChunks, filename, metadata } = params;
    const chunksCol = db.collection(UPLOAD_CHUNKS_COLLECTION);

    // Defensive: make sure every chunk actually arrived before assembling.
    const count = await chunksCol.countDocuments({ uploadId });
    if (count !== totalChunks) {
        throw new Error(`Upload incomplete: expected ${totalChunks} chunks, found ${count}.`);
    }

    const bucket = getSupportBucket(db);
    const uploadStream = bucket.openUploadStream(filename, {
        contentType: metadata.contentType,
        metadata,
    });

    let size = 0;
    try {
        // Surface any async stream error (e.g. a chunk-write failure deep in the
        // driver) by rejecting whichever write/end promise is currently pending.
        let streamError: Error | null = null;
        uploadStream.on('error', (err: Error) => { streamError = err; });

        for (let i = 0; i < totalChunks; i++) {
            if (streamError) throw streamError;
            const chunkDoc = await chunksCol.findOne({ uploadId, index: i });
            if (!chunkDoc) throw new Error(`Missing chunk ${i} for upload ${uploadId}.`);
            const buf = (chunkDoc.data as Binary).buffer as Buffer;
            size += buf.length;
            // Respect backpressure so we never hold the whole file in memory.
            await new Promise<void>((resolve, reject) => {
                uploadStream.write(buf, (err) => (err ? reject(err) : resolve()));
            });
        }
        await new Promise<void>((resolve, reject) => {
            uploadStream.once('error', reject);
            uploadStream.end(() => (streamError ? reject(streamError) : resolve()));
        });
    } catch (err) {
        // Best-effort cleanup of the half-written GridFS file on failure.
        try { await bucket.delete(uploadStream.id as ObjectId); } catch { /* ignore */ }
        throw err;
    } finally {
        await chunksCol.deleteMany({ uploadId });
    }

    return { fileId: (uploadStream.id as ObjectId).toString(), size };
}

// Build display-only descriptors for a set of GridFS file ids, attaching the
// matching `SupportFileRef` to each message of a ticket (mirrors how images are
// populated). Never loads file bytes — only the small `files` metadata docs.
export async function populateTicketFiles<T extends { messages: any[] }>(
    db: MongoDbWithClient,
    ticket: T
): Promise<T> {
    const ids: ObjectId[] = [];
    for (const m of ticket.messages) {
        for (const id of m.fileIds || []) {
            if (ObjectId.isValid(id)) ids.push(new ObjectId(id));
        }
    }
    if (ids.length === 0) return ticket;

    const docs = await db
        .collection(`${SUPPORT_FILES_BUCKET}.files`)
        .find({ _id: { $in: ids } })
        .toArray();

    const map = new Map<string, SupportFileRef>();
    for (const d of docs) {
        const meta = (d.metadata || {}) as Partial<SupportFileMetadata>;
        map.set(d._id.toString(), {
            _id: d._id.toString(),
            filename: d.filename || 'file',
            contentType: meta.contentType || d.contentType || 'application/octet-stream',
            size: d.length || 0,
            kind: meta.kind || 'file',
        });
    }

    ticket.messages = ticket.messages.map((m: any) => {
        if (!m.fileIds || m.fileIds.length === 0) return m;
        return {
            ...m,
            files: (m.fileIds as string[]).map((id) => map.get(id)).filter(Boolean),
        };
    });
    return ticket;
}

// Permanently delete every GridFS file attached to the given tickets. Used when
// reports are deleted so big attachments don't linger in the bucket.
export async function deleteTicketFiles(
    db: MongoDbWithClient,
    ticketIds: string[]
): Promise<void> {
    if (ticketIds.length === 0) return;
    const bucket = getSupportBucket(db);
    const files = await db
        .collection(`${SUPPORT_FILES_BUCKET}.files`)
        .find({ 'metadata.ticketId': { $in: ticketIds } }, { projection: { _id: 1 } })
        .toArray();
    for (const f of files) {
        try { await bucket.delete(f._id as ObjectId); } catch { /* already gone */ }
    }
}

// Delete specific GridFS files by id (used when an admin removes a single
// message's attachments). Returns the kind of each successfully-removed file so
// the caller can leave the matching tombstone icon. Missing/invalid ids skipped.
export async function deleteSupportFilesByIds(
    db: MongoDbWithClient,
    fileIds: string[]
): Promise<('image' | 'video' | 'file')[]> {
    const kinds: ('image' | 'video' | 'file')[] = [];
    const bucket = getSupportBucket(db);
    for (const id of fileIds || []) {
        if (!ObjectId.isValid(id)) continue;
        const _id = new ObjectId(id);
        const doc = await db
            .collection(`${SUPPORT_FILES_BUCKET}.files`)
            .findOne({ _id }, { projection: { metadata: 1 } });
        const meta = (doc?.metadata || {}) as Partial<SupportFileMetadata>;
        const kind = meta.kind === 'image' || meta.kind === 'video' ? meta.kind : 'file';
        try {
            await bucket.delete(_id);
            kinds.push(kind);
        } catch {
            /* already gone */
        }
    }
    return kinds;
}

// Opportunistic cleanup of temp chunks left behind by abandoned uploads.
export async function sweepStaleUploadChunks(db: MongoDbWithClient): Promise<void> {
    try {
        await db.collection(UPLOAD_CHUNKS_COLLECTION).deleteMany({
            createdAt: { $lt: new Date(Date.now() - STALE_CHUNK_MS) },
        });
    } catch { /* non-critical */ }
}
