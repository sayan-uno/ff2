import { NextRequest, NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { cookies } from 'next/headers';
import { Readable } from 'stream';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminAuthenticated } from '@/app/actions';
import { getSupportBucket, SUPPORT_FILES_BUCKET, type SupportFileMetadata } from '@/lib/support-files';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Streams a support attachment (video/file) back from GridFS.
//
// - Videos/images render inline; other files download as attachments.
// - HTTP Range requests are honoured (206) so videos can seek/play on mobile
//   browsers (Safari refuses to play a video without range support).
// - Access is private: only the ticket owner (gaming_id cookie) or an admin may
//   read a file. Cookies ride along automatically on <video>/<img>/<a> requests.
// ---------------------------------------------------------------------------

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        if (!ObjectId.isValid(id)) {
            return new NextResponse('Not found', { status: 404 });
        }
        const fileId = new ObjectId(id);

        const db = await connectToDatabase();
        const fileDoc = await db
            .collection(`${SUPPORT_FILES_BUCKET}.files`)
            .findOne({ _id: fileId });
        if (!fileDoc) {
            return new NextResponse('Not found', { status: 404 });
        }

        const meta = (fileDoc.metadata || {}) as Partial<SupportFileMetadata>;

        // --- Authorise ---
        const isAdmin = await isAdminAuthenticated();
        const gamingIdCookie = cookies().get('gaming_id')?.value;
        const allowed = isAdmin || (!!gamingIdCookie && gamingIdCookie === meta.gamingId);
        if (!allowed) {
            return new NextResponse('Forbidden', { status: 403 });
        }

        const total: number = fileDoc.length || 0;
        const contentType = meta.contentType || fileDoc.contentType || 'application/octet-stream';
        const rawName = String(fileDoc.filename || 'file');
        const safeName = rawName.replace(/[^\w.\- ]+/g, '_');
        // Inline for media so it renders in the chat; attachment otherwise.
        const disposition =
            contentType.startsWith('video/') || contentType.startsWith('image/')
                ? 'inline'
                : 'attachment';

        const bucket = getSupportBucket(db);
        const rangeHeader = req.headers.get('range');

        // --- Ranged request (video seeking / partial fetch) ---
        if (rangeHeader) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
            if (match) {
                let start = match[1] ? parseInt(match[1], 10) : 0;
                let end = match[2] ? parseInt(match[2], 10) : total - 1;
                if (Number.isNaN(start)) start = 0;
                if (Number.isNaN(end) || end >= total) end = total - 1;

                if (start > end || start >= total) {
                    return new NextResponse('Range Not Satisfiable', {
                        status: 416,
                        headers: { 'Content-Range': `bytes */${total}` },
                    });
                }

                // GridFS end is exclusive.
                const nodeStream = bucket.openDownloadStream(fileId, { start, end: end + 1 });
                const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

                return new NextResponse(webStream, {
                    status: 206,
                    headers: {
                        'Content-Type': contentType,
                        'Content-Length': String(end - start + 1),
                        'Content-Range': `bytes ${start}-${end}/${total}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Disposition': `${disposition}; filename="${safeName}"`,
                        'Cache-Control': 'private, max-age=86400',
                    },
                });
            }
        }

        // --- Full download ---
        const nodeStream = bucket.openDownloadStream(fileId);
        const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

        return new NextResponse(webStream, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': String(total),
                'Accept-Ranges': 'bytes',
                'Content-Disposition': `${disposition}; filename="${safeName}"`,
                'Cache-Control': 'private, max-age=86400',
            },
        });
    } catch (error) {
        console.error('Support file stream failed:', error);
        return new NextResponse('Server error', { status: 500 });
    }
}
