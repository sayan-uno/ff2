'use server';

import { ObjectId } from 'mongodb';
import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminAuthenticated } from '@/app/actions';
import type { SupportTicket } from '@/lib/support-definitions';

// ---------------------------------------------------------------------------
// Admin-only action powering the "Unread" inbox category. Kept in its own file
// so the existing support actions stay untouched. The Unread list itself is a
// client-side filter over `adminUnread` (a report is unread until the admin
// opens it, which resets adminUnread to 0). This action lets the admin push a
// report BACK into the Unread list after opening it by mistake.
// ---------------------------------------------------------------------------

const COLLECTION = 'support_tickets';

// Flag a report as "unread" again for the admin, after it was opened (opening a
// ticket auto-clears adminUnread to 0). This re-adds it to the Unread category
// without sending a message or changing the conversation. We deliberately do
// NOT touch `updatedAt`, so the report keeps its chronological place in every
// list — only the admin-side unread flag is restored.
export async function markTicketUnreadByAdmin(
    ticketId: string
): Promise<{ success: boolean; message: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin || !ObjectId.isValid(ticketId)) {
        return { success: false, message: 'Unauthorized.' };
    }
    try {
        const db = await connectToDatabase();
        const ticket = await db
            .collection<SupportTicket>(COLLECTION)
            .findOne({ _id: new ObjectId(ticketId) }, { projection: { adminUnread: 1 } });
        if (!ticket) return { success: false, message: 'Report not found.' };

        // Preserve any genuine pending count; otherwise mark a single unread item
        // so the report surfaces in the Unread list and shows the green badge.
        const nextUnread = (ticket.adminUnread || 0) > 0 ? ticket.adminUnread : 1;
        await db.collection<SupportTicket>(COLLECTION).updateOne(
            { _id: new ObjectId(ticketId) },
            { $set: { adminUnread: nextUnread } }
        );
        revalidatePath('/admin/support');
        return { success: true, message: 'Marked as unread.' };
    } catch (error) {
        console.error('Support: failed to mark ticket unread', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}
