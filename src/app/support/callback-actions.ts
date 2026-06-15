'use server';

import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/lib/mongodb';
import type { SupportTicket, SupportMessage } from '@/lib/support-definitions';

// ---------------------------------------------------------------------------
// Callback request (user-facing).
//
// When a user taps the "Request a callback" button in the support chat header,
// this posts a centered SYSTEM notice into the conversation confirming the
// request. It's attributed to the user so it bumps the admin's unread count and
// shows up as the inbox preview — the admin then replies with whatever way to
// talk they prefer (a Google Meet link, a call link, a phone time, …).
//
// Kept fully self-contained in its own file so none of the existing support
// actions are touched. It only ADDS a new system message kind.
// ---------------------------------------------------------------------------

const COLLECTION = 'support_tickets';
const BLOCK_COLLECTION = 'support_blocks';
const SUPPORT_BLOCKED_MESSAGE = 'You are blocked from this feature. Please use email for support.';

// The single confirmation/preview line. Reads as a friendly confirmation for the
// user (shown as a centered banner) and as a clear request for the admin (shown
// as the inbox preview).
const CALLBACK_NOTICE =
    '📞 Callback requested — your request has been submitted. Our support team will review your report and share a way to talk with you (such as a Google Meet or call link) shortly. Thank you for your patience.';

function getCurrentGamingId(): string | undefined {
    return cookies().get('gaming_id')?.value;
}

async function isGamingIdSupportBlocked(
    db: Awaited<ReturnType<typeof connectToDatabase>>,
    gamingId: string
): Promise<boolean> {
    const found = await db.collection(BLOCK_COLLECTION).findOne({ gamingId });
    return !!found;
}

// Posts the "callback requested" system notice into the chat. If the most recent
// message is already a pending callback request, we don't stack another — we just
// bump the report's activity time so it floats to the top of the admin inbox.
export async function requestCallback(
    ticketId: string
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

        // Don't spam: if the latest message is already a pending callback request,
        // just refresh the activity time instead of stacking another notice.
        const last = ticket.messages[ticket.messages.length - 1];
        if (last && last.kind === 'system' && last.systemType === 'callback_request') {
            await db.collection<SupportTicket>(COLLECTION).updateOne(
                { _id: new ObjectId(ticketId) },
                { $set: { updatedAt: new Date() } }
            );
            revalidatePath('/admin/support');
            return { success: true, message: 'Your callback request is already pending.' };
        }

        const systemMessage: SupportMessage = {
            _id: new ObjectId(),
            sender: 'user',          // attributed to the user so it bumps adminUnread
            kind: 'system',
            systemType: 'callback_request',
            text: CALLBACK_NOTICE,
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
        return { success: true, message: 'Your callback request has been submitted.' };
    } catch (error) {
        console.error('Support: failed to request callback', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}
