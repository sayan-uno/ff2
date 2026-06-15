'use server';

import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminAuthenticated } from '@/app/actions';
import type { SupportTicket, SupportMessage, SupportImage } from '@/lib/support-definitions';
import { deleteSupportFilesByIds } from '@/lib/support-files';

// ---------------------------------------------------------------------------
// Admin-only per-message controls for the support inbox: silently edit any
// message, delete any message, or strip just a message's attachment (purging
// the bytes from the DB while leaving a small tombstone behind).
//
// All of these are gated on `isAdminAuthenticated()`; nothing here is reachable
// by a normal user. Kept in their own file so the existing support actions are
// untouched.
// ---------------------------------------------------------------------------

const COLLECTION = 'support_tickets';
const IMAGE_COLLECTION = 'support_images';
const MAX_TEXT_LENGTH = 2000;

// Purge the byte payloads of a message's attachments (inline images + GridFS
// videos/files) and report what kinds were removed, for the tombstone icons.
async function purgeMessageAttachments(
    db: Awaited<ReturnType<typeof connectToDatabase>>,
    msg: SupportMessage
): Promise<('image' | 'video' | 'file')[]> {
    const kinds: ('image' | 'video' | 'file')[] = [];

    // Inline images (legacy base64 path).
    const imageIds = (msg.imageIds || []).filter((id) => ObjectId.isValid(id));
    if (imageIds.length > 0) {
        await db
            .collection<SupportImage>(IMAGE_COLLECTION)
            .deleteMany({ _id: { $in: imageIds.map((id) => new ObjectId(id)) } });
        for (let i = 0; i < imageIds.length; i++) kinds.push('image');
    }

    // GridFS videos/files/photos.
    const fileIds = (msg.fileIds || []).filter((id) => ObjectId.isValid(id));
    if (fileIds.length > 0) {
        const removed = await deleteSupportFilesByIds(db, fileIds);
        kinds.push(...removed);
    }

    return kinds;
}

// Silently edit a message's text (no "edited" marker). Works on any message,
// from either side. If the message carried a rich HTML body, it's cleared so the
// admin's new plain text is what shows.
export async function adminEditMessage(
    ticketId: string,
    messageId: string,
    newText: string
): Promise<{ success: boolean; message: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized.' };
    if (!ObjectId.isValid(ticketId) || !ObjectId.isValid(messageId)) {
        return { success: false, message: 'Invalid message.' };
    }

    const text = (newText || '').trim();
    if (text.length > MAX_TEXT_LENGTH) {
        return { success: false, message: 'Message is too long.' };
    }

    try {
        const db = await connectToDatabase();
        const result = await db.collection<SupportTicket>(COLLECTION).updateOne(
            { _id: new ObjectId(ticketId) },
            {
                $set: { 'messages.$[m].text': text },
                $unset: { 'messages.$[m].html': '' },
            },
            { arrayFilters: [{ 'm._id': new ObjectId(messageId) }] }
        );
        if (result.matchedCount === 0) return { success: false, message: 'Report not found.' };

        revalidatePath('/admin/support');
        return { success: true, message: 'Saved.' };
    } catch (error) {
        console.error('Support: admin failed to edit message', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}

// Strip a message's attachment(s): purge the bytes from the DB and leave a
// tombstone (the message + any text stay, attachments become small icons).
export async function adminDeleteMessageAttachments(
    ticketId: string,
    messageId: string
): Promise<{ success: boolean; message: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized.' };
    if (!ObjectId.isValid(ticketId) || !ObjectId.isValid(messageId)) {
        return { success: false, message: 'Invalid message.' };
    }

    try {
        const db = await connectToDatabase();
        const ticket = await db
            .collection<SupportTicket>(COLLECTION)
            .findOne({ _id: new ObjectId(ticketId) }, { projection: { messages: 1 } });
        if (!ticket) return { success: false, message: 'Report not found.' };

        const msg = ticket.messages.find((m) => m._id?.toString() === messageId);
        if (!msg) return { success: false, message: 'Message not found.' };

        const removedKinds = await purgeMessageAttachments(db, msg);
        if (removedKinds.length === 0) {
            return { success: false, message: 'This message has no attachment.' };
        }

        // Keep any pre-existing tombstones, append the newly-removed ones, and
        // clear the now-dangling attachment id references.
        const existing = (msg.deletedAttachmentKinds || []) as ('image' | 'video' | 'file')[];
        await db.collection<SupportTicket>(COLLECTION).updateOne(
            { _id: new ObjectId(ticketId) },
            {
                $set: {
                    'messages.$[m].deletedAttachmentKinds': [...existing, ...removedKinds],
                    'messages.$[m].imageIds': [],
                    'messages.$[m].fileIds': [],
                },
            },
            { arrayFilters: [{ 'm._id': new ObjectId(messageId) }] }
        );

        revalidatePath('/admin/support');
        return { success: true, message: 'Attachment deleted.' };
    } catch (error) {
        console.error('Support: admin failed to delete attachment', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}

// Delete an entire message from the conversation, purging any attachment bytes.
export async function adminDeleteMessage(
    ticketId: string,
    messageId: string
): Promise<{ success: boolean; message: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized.' };
    if (!ObjectId.isValid(ticketId) || !ObjectId.isValid(messageId)) {
        return { success: false, message: 'Invalid message.' };
    }

    try {
        const db = await connectToDatabase();
        const ticket = await db
            .collection<SupportTicket>(COLLECTION)
            .findOne({ _id: new ObjectId(ticketId) }, { projection: { messages: 1 } });
        if (!ticket) return { success: false, message: 'Report not found.' };

        const msg = ticket.messages.find((m) => m._id?.toString() === messageId);
        if (!msg) return { success: false, message: 'Message not found.' };

        // Free any attached bytes, then remove the message from the thread.
        await purgeMessageAttachments(db, msg);
        await db.collection<SupportTicket>(COLLECTION).updateOne(
            { _id: new ObjectId(ticketId) },
            { $pull: { messages: { _id: new ObjectId(messageId) } } }
        );

        // Keep lastSenderRole consistent with whatever message is now last.
        const after = await db
            .collection<SupportTicket>(COLLECTION)
            .findOne({ _id: new ObjectId(ticketId) }, { projection: { messages: { $slice: -1 } } });
        const last = after?.messages?.[0];
        if (last) {
            await db.collection<SupportTicket>(COLLECTION).updateOne(
                { _id: new ObjectId(ticketId) },
                { $set: { lastSenderRole: last.sender === 'admin' ? 'admin' : 'user' } }
            );
        }

        revalidatePath('/admin/support');
        return { success: true, message: 'Message deleted.' };
    } catch (error) {
        console.error('Support: admin failed to delete message', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}
