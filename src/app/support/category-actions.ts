'use server';

import { ObjectId } from 'mongodb';
import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminAuthenticated } from '@/app/actions';
import type { SupportTicket, SupportMessage, SupportImage } from '@/lib/support-definitions';
import { deleteSupportFilesByIds } from '@/lib/support-files';

// ---------------------------------------------------------------------------
// Admin-only actions powering the categorised support inbox (All / Escalation /
// Blocked / Closed / Attachments). Self-contained in this file so the existing
// support actions stay untouched. Escalation/Blocked/Closed/Attachment filtering
// itself is done client-side over the already-loaded tickets; these actions just
// persist the escalation flag and run the per-category bulk operations.
// ---------------------------------------------------------------------------

const COLLECTION = 'support_tickets';
const IMAGE_COLLECTION = 'support_images';
const BLOCK_COLLECTION = 'support_blocks';

function validIds(ids: string[]): ObjectId[] {
    return (ids || []).filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
}

// All gaming IDs currently blocked from support (for the "Blocked" category).
export async function getBlockedGamingIds(): Promise<string[]> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return [];
    const db = await connectToDatabase();
    const docs = await db.collection(BLOCK_COLLECTION).find({}, { projection: { gamingId: 1 } }).toArray();
    return docs.map((d) => d.gamingId as string).filter(Boolean);
}

// Move a single report to / from the escalation list (used by the 3-dot menu).
export async function setTicketEscalation(
    ticketId: string,
    escalated: boolean
): Promise<{ success: boolean; message: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin || !ObjectId.isValid(ticketId)) {
        return { success: false, message: 'Unauthorized.' };
    }
    try {
        const db = await connectToDatabase();
        await db.collection<SupportTicket>(COLLECTION).updateOne(
            { _id: new ObjectId(ticketId) },
            escalated
                ? { $set: { escalated: true, escalatedAt: new Date() } }
                : { $set: { escalated: false }, $unset: { escalatedAt: '' } }
        );
        revalidatePath('/admin/support');
        return {
            success: true,
            message: escalated ? 'Moved to escalation list.' : 'Removed from escalation list.',
        };
    } catch (error) {
        console.error('Support: failed to set escalation', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}

// Bulk move reports to / from the escalation list.
export async function bulkSetEscalation(
    ticketIds: string[],
    escalated: boolean
): Promise<{ success: boolean; message: string; count: number }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized.', count: 0 };
    const ids = validIds(ticketIds);
    if (ids.length === 0) return { success: false, message: 'No valid reports selected.', count: 0 };

    try {
        const db = await connectToDatabase();
        const result = await db.collection<SupportTicket>(COLLECTION).updateMany(
            { _id: { $in: ids } },
            escalated
                ? { $set: { escalated: true, escalatedAt: new Date() } }
                : { $set: { escalated: false }, $unset: { escalatedAt: '' } }
        );
        revalidatePath('/admin/support');
        return {
            success: true,
            count: result.modifiedCount,
            message: escalated
                ? `Moved ${result.modifiedCount} report(s) to escalation.`
                : `Removed ${result.modifiedCount} report(s) from escalation.`,
        };
    } catch (error) {
        console.error('Support: failed to bulk set escalation', error);
        return { success: false, message: 'Something went wrong. Please try again.', count: 0 };
    }
}

// Bulk-unblock a set of gaming IDs (used by the "Blocked" category).
export async function bulkUnblockSupportUsers(
    gamingIds: string[]
): Promise<{ success: boolean; message: string; count: number }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized.', count: 0 };
    const unique = Array.from(new Set((gamingIds || []).filter(Boolean)));
    if (unique.length === 0) return { success: false, message: 'No users selected.', count: 0 };

    try {
        const db = await connectToDatabase();
        const result = await db.collection(BLOCK_COLLECTION).deleteMany({ gamingId: { $in: unique } });
        return { success: true, count: result.deletedCount, message: `Unblocked ${result.deletedCount} user(s).` };
    } catch (error) {
        console.error('Support: failed to bulk unblock', error);
        return { success: false, message: 'Something went wrong. Please try again.', count: 0 };
    }
}

// Strip every attachment from the given reports: purge the bytes (inline images +
// GridFS files) and leave a small tombstone per removed attachment, keeping each
// message and its text. Used by the "Attachments" category bulk action.
export async function bulkDeleteReportAttachments(
    ticketIds: string[]
): Promise<{ success: boolean; message: string; count: number }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized.', count: 0 };
    const ids = validIds(ticketIds);
    if (ids.length === 0) return { success: false, message: 'No valid reports selected.', count: 0 };

    try {
        const db = await connectToDatabase();
        const tickets = await db
            .collection<SupportTicket>(COLLECTION)
            .find({ _id: { $in: ids } }, { projection: { messages: 1 } })
            .toArray();

        let touched = 0;
        for (const ticket of tickets) {
            let changed = false;
            const newMessages: SupportMessage[] = [];

            for (const msg of ticket.messages) {
                const imageIds = (msg.imageIds || []).filter((id) => ObjectId.isValid(id));
                const fileIds = (msg.fileIds || []).filter((id) => ObjectId.isValid(id));
                if (imageIds.length === 0 && fileIds.length === 0) {
                    newMessages.push(msg);
                    continue;
                }

                const kinds: ('image' | 'video' | 'file')[] = [];
                if (imageIds.length > 0) {
                    await db
                        .collection<SupportImage>(IMAGE_COLLECTION)
                        .deleteMany({ _id: { $in: imageIds.map((id) => new ObjectId(id)) } });
                    for (let i = 0; i < imageIds.length; i++) kinds.push('image');
                }
                if (fileIds.length > 0) {
                    const removed = await deleteSupportFilesByIds(db, fileIds);
                    kinds.push(...removed);
                }

                changed = true;
                newMessages.push({
                    ...msg,
                    imageIds: [],
                    fileIds: [],
                    deletedAttachmentKinds: [...(msg.deletedAttachmentKinds || []), ...kinds],
                });
            }

            if (changed) {
                await db.collection<SupportTicket>(COLLECTION).updateOne(
                    { _id: ticket._id },
                    { $set: { messages: newMessages } }
                );
                touched++;
            }
        }

        revalidatePath('/admin/support');
        return { success: true, count: touched, message: `Cleared attachments from ${touched} report(s).` };
    } catch (error) {
        console.error('Support: failed to bulk delete attachments', error);
        return { success: false, message: 'Something went wrong. Please try again.', count: 0 };
    }
}
