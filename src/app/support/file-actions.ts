'use server';

import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminAuthenticated } from '@/app/actions';
import type { SupportTicket, SupportMessage, SupportUploadLimit } from '@/lib/support-definitions';
import type { Notification, User } from '@/lib/definitions';
import { sendPushNotification } from '@/lib/push-notifications';
import {
    getUploadLimitBytes,
    DEFAULT_UPLOAD_LIMIT_BYTES,
    MAX_UPLOAD_LIMIT_BYTES,
    UPLOAD_LIMITS_COLLECTION,
} from '@/lib/support-files';

// ---------------------------------------------------------------------------
// Server actions for the large-attachment (video/file) support feature.
// Kept in their own file so the existing support/actions.ts is untouched. The
// actual file bytes are uploaded/downloaded through the /api/support routes;
// these actions only handle the small bits: the per-user limit, the system
// notices, and appending the file message once an upload finishes.
// ---------------------------------------------------------------------------

const COLLECTION = 'support_tickets';
const MAX_TEXT_LENGTH = 2000;
const SUPPORT_BLOCKED_MESSAGE = 'You are blocked from this feature. Please use email for support.';

function getCurrentGamingId(): string | undefined {
    return cookies().get('gaming_id')?.value;
}

async function isGamingIdSupportBlocked(
    db: Awaited<ReturnType<typeof connectToDatabase>>,
    gamingId: string
): Promise<boolean> {
    const found = await db.collection('support_blocks').findOne({ gamingId });
    return !!found;
}

// Human-readable size, e.g. "12.4 MB" / "850 KB". Used in system notices.
function formatBytes(bytes: number): string {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

// ---------------------------------------------------------------------------
// UPLOAD LIMIT (user-facing read)
// ---------------------------------------------------------------------------

// The current user's per-file upload limit for videos/files (bytes + label).
export async function getMyUploadLimit(): Promise<{ limitBytes: number; isDefault: boolean }> {
    noStore();
    const gamingId = getCurrentGamingId();
    if (!gamingId) {
        return { limitBytes: DEFAULT_UPLOAD_LIMIT_BYTES, isDefault: true };
    }
    const db = await connectToDatabase();
    const limitBytes = await getUploadLimitBytes(db, gamingId);
    return { limitBytes, isDefault: limitBytes <= DEFAULT_UPLOAD_LIMIT_BYTES };
}

// ---------------------------------------------------------------------------
// SYSTEM NOTICE: user hit the upload limit and is requesting a bigger one
// ---------------------------------------------------------------------------

// Posts the centered "upload limit reached / higher limit requested" system
// notice into the chat when a user tries to send a file above their limit.
// Counts as a new (unread) item for the admin — with a readable preview — so the
// admin notices the request even though it's a system message, not a real chat.
export async function requestUploadLimitIncrease(
    ticketId: string,
    fileName: string,
    fileSizeBytes: number
): Promise<{ success: boolean; message: string }> {
    const gamingId = getCurrentGamingId();
    if (!gamingId) return { success: false, message: 'You are not logged in.' };
    if (!ObjectId.isValid(ticketId)) return { success: false, message: 'Invalid report.' };

    try {
        const db = await connectToDatabase();
        if (await isGamingIdSupportBlocked(db, gamingId)) {
            return { success: false, message: SUPPORT_BLOCKED_MESSAGE };
        }

        const ticket = await db.collection<SupportTicket>(COLLECTION).findOne({
            _id: new ObjectId(ticketId),
            gamingId,
        });
        if (!ticket) return { success: false, message: 'Report not found.' };

        const limitBytes = await getUploadLimitBytes(db, gamingId);

        // Don't spam: if the most recent message is already a pending request
        // notice, just bump the report's activity time instead of stacking another.
        const last = ticket.messages[ticket.messages.length - 1];
        if (last && last.kind === 'system' && last.systemType === 'upload_limit_request') {
            await db.collection<SupportTicket>(COLLECTION).updateOne(
                { _id: new ObjectId(ticketId) },
                { $set: { updatedAt: new Date() } }
            );
            revalidatePath('/admin/support');
            return { success: true, message: 'Request already pending.' };
        }

        const safeName = (fileName || 'a file').slice(0, 120);
        const preview = `⚠️ Upload limit reached — user requested a higher limit (tried: ${safeName}, ${formatBytes(fileSizeBytes)})`;

        const systemMessage: SupportMessage = {
            _id: new ObjectId(),
            sender: 'user',          // attributed to the user so it bumps adminUnread
            kind: 'system',
            systemType: 'upload_limit_request',
            text: preview,
            createdAt: new Date(),
        };

        await db.collection<SupportTicket>(COLLECTION).updateOne(
            { _id: new ObjectId(ticketId), gamingId },
            {
                $push: { messages: systemMessage },
                $set: { lastSenderRole: 'user', status: 'open', updatedAt: new Date() },
                $inc: { adminUnread: 1 },
            }
        );

        revalidatePath('/admin/support');
        return {
            success: true,
            message: `Upload limit is ${formatBytes(limitBytes)}. A higher limit has been requested.`,
        };
    } catch (error) {
        console.error('Support: failed to request upload limit increase', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}

// ---------------------------------------------------------------------------
// SEND a video/file message (after the bytes are uploaded to GridFS)
// ---------------------------------------------------------------------------

async function appendFileMessage(
    ticketId: string,
    fileIds: string[],
    caption: string,
    sender: 'user' | 'admin',
    gamingId?: string
): Promise<{ success: boolean; message: string }> {
    const validIds = (fileIds || []).filter((id) => ObjectId.isValid(id));
    if (validIds.length === 0) return { success: false, message: 'No file to send.' };

    const cleanCaption = (caption || '').trim().slice(0, MAX_TEXT_LENGTH);
    const db = await connectToDatabase();
    const now = new Date();

    const newMessage: SupportMessage = {
        _id: new ObjectId(),
        sender,
        text: cleanCaption,
        fileIds: validIds,
        createdAt: now,
    };

    const match: Record<string, unknown> = { _id: new ObjectId(ticketId) };
    if (sender === 'user' && gamingId) match.gamingId = gamingId;

    const update =
        sender === 'user'
            ? {
                  $push: { messages: newMessage },
                  $set: { lastSenderRole: 'user' as const, status: 'open' as const, updatedAt: now },
                  $inc: { adminUnread: 1 },
              }
            : {
                  $push: { messages: newMessage },
                  $set: { lastSenderRole: 'admin' as const, updatedAt: now },
                  $inc: { userUnread: 1 },
              };

    const result = await db.collection<SupportTicket>(COLLECTION).updateOne(match as any, update as any);
    if (result.matchedCount === 0) return { success: false, message: 'Report not found.' };

    revalidatePath('/admin/support');
    return { success: true, message: 'Sent.' };
}

// User posts a message referencing one or more uploaded GridFS files.
export async function sendUserFileMessage(
    ticketId: string,
    fileIds: string[],
    caption: string = ''
): Promise<{ success: boolean; message: string }> {
    const gamingId = getCurrentGamingId();
    if (!gamingId) return { success: false, message: 'You are not logged in.' };
    if (!ObjectId.isValid(ticketId)) return { success: false, message: 'Invalid report.' };

    try {
        const db = await connectToDatabase();
        if (await isGamingIdSupportBlocked(db, gamingId)) {
            return { success: false, message: SUPPORT_BLOCKED_MESSAGE };
        }
        return await appendFileMessage(ticketId, fileIds, caption, 'user', gamingId);
    } catch (error) {
        console.error('Support: failed to send user file message', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}

// Admin posts a message referencing one or more uploaded GridFS files.
export async function sendAdminFileMessage(
    ticketId: string,
    fileIds: string[],
    caption: string = ''
): Promise<{ success: boolean; message: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized.' };
    if (!ObjectId.isValid(ticketId)) return { success: false, message: 'Invalid report.' };

    try {
        return await appendFileMessage(ticketId, fileIds, caption, 'admin');
    } catch (error) {
        console.error('Support: failed to send admin file message', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}

// ---------------------------------------------------------------------------
// ADMIN: read + grant a user's upload limit
// ---------------------------------------------------------------------------

// The current upload limit for a user (admin view).
export async function getUserUploadLimit(
    gamingId: string
): Promise<{ limitBytes: number; isMax: boolean }> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin || !gamingId) {
        return { limitBytes: DEFAULT_UPLOAD_LIMIT_BYTES, isMax: false };
    }
    const db = await connectToDatabase();
    const limitBytes = await getUploadLimitBytes(db, gamingId);
    return { limitBytes, isMax: limitBytes >= MAX_UPLOAD_LIMIT_BYTES };
}

// Admin raises a user to the 250MB tier (or resets them to the 10MB default),
// posts a "limit granted" system notice in the chat, and notifies the user.
export async function setUserUploadLimit(
    ticketId: string,
    gamingId: string,
    grant: boolean
): Promise<{ success: boolean; message: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized.' };
    if (!gamingId || !ObjectId.isValid(ticketId)) {
        return { success: false, message: 'Invalid request.' };
    }

    const limitBytes = grant ? MAX_UPLOAD_LIMIT_BYTES : DEFAULT_UPLOAD_LIMIT_BYTES;

    try {
        const db = await connectToDatabase();

        await db.collection<SupportUploadLimit>(UPLOAD_LIMITS_COLLECTION).updateOne(
            { gamingId },
            { $set: { gamingId, limitBytes, updatedAt: new Date(), updatedBy: 'admin' } },
            { upsert: true }
        );

        // Only announce when actually granting the higher tier.
        if (grant) {
            const now = new Date();
            const systemMessage: SupportMessage = {
                _id: new ObjectId(),
                sender: 'admin',
                kind: 'system',
                systemType: 'upload_limit_granted',
                text: '✅ Your upload limit has been increased to 250 MB. You can now share bigger videos and files.',
                createdAt: now,
            };
            await db.collection<SupportTicket>(COLLECTION).updateOne(
                { _id: new ObjectId(ticketId) },
                {
                    $push: { messages: systemMessage },
                    $set: { lastSenderRole: 'admin', updatedAt: now },
                    $inc: { userUnread: 1 },
                }
            );

            // Tell the user (bell + push), mirroring how support replies notify.
            await notifyUserOfLimitGrant(db, gamingId, ticketId);
        }

        revalidatePath('/admin/support');
        return {
            success: true,
            message: grant ? 'Upload limit increased to 250 MB.' : 'Upload limit reset to 10 MB.',
        };
    } catch (error) {
        console.error('Support: failed to set upload limit', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}

// Website notification + FCM push letting the user know their limit was raised.
async function notifyUserOfLimitGrant(
    db: Awaited<ReturnType<typeof connectToDatabase>>,
    gamingId: string,
    ticketId: string
): Promise<void> {
    try {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:9002';
        const supportUrl = `${baseUrl}/support?ticket=${ticketId}`;
        const message = `Good news! Garena Support increased your upload limit to 250 MB. You can now share bigger videos and files: ${supportUrl}`;

        const notification: Omit<Notification, '_id'> = {
            gamingId,
            message,
            isRead: false,
            createdAt: new Date(),
            type: 'support_reply',
            supportTicketId: ticketId,
        };
        await db.collection<Notification>('notifications').insertOne(notification as Notification);

        const user = await db.collection<User>('users').findOne({ gamingId });
        if (user?.fcmToken) {
            await sendPushNotification({
                token: user.fcmToken,
                title: 'Garena Support',
                body: 'Your upload limit was increased to 250 MB. You can now share bigger files.',
                link: supportUrl,
            });
        }
    } catch (error) {
        console.error('Support: failed to notify user of limit grant', error);
    }
}
