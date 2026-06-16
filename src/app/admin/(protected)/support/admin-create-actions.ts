'use server';

// --- Admin-initiated support reports ---
// Lets an admin look up any UID and OPEN a brand-new support report addressed to
// that user (the first message is from the admin). This is a fully self-contained
// new module so the existing user-driven support flow is untouched: it only reads
// the existing `users` collection and inserts into the same `support_tickets`
// collection in the exact shape the rest of the app already understands.

import { ObjectId } from 'mongodb';
import { unstable_noStore as noStore } from 'next/cache';
import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/lib/mongodb';
import { isAdminAuthenticated } from '@/app/actions';
import type { SupportTicket, SupportMessage } from '@/lib/support-definitions';
import type { User } from '@/lib/definitions';
import { notifyUserOfSupportReply } from '@/lib/support-reply-notifier';

const COLLECTION = 'support_tickets';
const MAX_TEXT_LENGTH = 2000;
const MAX_SUBJECT_LENGTH = 120;

// Escape a string so it can be safely used inside a RegExp (mirrors the helper
// the existing user-facing createTicket uses for sequence numbering).
function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface AdminUserLookup {
    found: boolean;
    gamingId?: string;          // The canonical (real) UID the reports are keyed by
    visualGamingId?: string;    // The display-only UID, if the user has one
    tickets?: SupportTicket[];  // Every existing report on this UID (newest first)
    message?: string;           // Populated on failure / not-found
}

// Look up a user by their real UID (gamingId) OR their visual ID, returning the
// canonical identity plus every support report already opened on that UID. Used
// by the admin "New report" dialog so the admin can confirm who the user is and
// see their history before opening a fresh report. Admin only; read-only.
export async function lookupUserForAdminReport(query: string): Promise<AdminUserLookup> {
    noStore();
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { found: false, message: 'Unauthorized.' };

    const uid = (query || '').trim();
    if (!uid) return { found: false, message: 'Please enter a UID.' };

    try {
        const db = await connectToDatabase();
        const user = await db.collection<User>('users').findOne({
            $or: [{ gamingId: uid }, { visualGamingId: uid }],
        });
        if (!user) {
            return { found: false, message: 'No user found with this UID.' };
        }

        const tickets = await db
            .collection<SupportTicket>(COLLECTION)
            .find({ gamingId: user.gamingId })
            .sort({ updatedAt: -1 })
            .toArray();

        return {
            found: true,
            gamingId: user.gamingId,
            visualGamingId: user.visualGamingId,
            tickets: JSON.parse(JSON.stringify(tickets)),
        };
    } catch (error) {
        console.error('Support: admin user lookup failed', error);
        return { found: false, message: 'Something went wrong. Please try again.' };
    }
}

// Admin opens a brand-new support report addressed TO a specific user. The first
// message is from the admin, so the user sees a fresh "Garena" conversation and
// is notified (website bell + FCM) exactly like an admin reply. The ticket is
// stored in the same shape as a user-created one, so every existing admin/user
// view, poll, unread count and read-receipt keeps working unchanged.
export async function adminCreateTicketForUser(
    gamingId: string,
    message: string,
    subject?: string
): Promise<{ success: boolean; message: string; ticketId?: string }> {
    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) return { success: false, message: 'Unauthorized.' };

    const targetId = (gamingId || '').trim();
    const cleanMessage = (message || '').trim();
    const customSubject = (subject || '').trim();

    if (!targetId) return { success: false, message: 'Missing user UID.' };
    if (!cleanMessage) return { success: false, message: 'Please write a message.' };
    if (cleanMessage.length > MAX_TEXT_LENGTH) return { success: false, message: 'Message is too long.' };

    try {
        const db = await connectToDatabase();
        const user = await db.collection<User>('users').findOne({ gamingId: targetId });
        if (!user) return { success: false, message: 'No user found with this UID.' };

        // Use the admin's custom subject verbatim when given; otherwise auto-number
        // a "Garena Support N" subject per user (same convention as user reports).
        let finalSubject: string;
        if (customSubject) {
            finalSubject = customSubject.slice(0, MAX_SUBJECT_LENGTH);
        } else {
            const prefix = 'Garena Support';
            const existingCount = await db.collection<SupportTicket>(COLLECTION).countDocuments({
                gamingId: user.gamingId,
                subject: { $regex: `^${escapeRegex(prefix)} \\d+$` },
            });
            finalSubject = `${prefix} ${existingCount + 1}`;
        }

        const now = new Date();
        const firstMessage: SupportMessage = {
            _id: new ObjectId(),
            sender: 'admin',
            text: cleanMessage,
            createdAt: now,
        };

        const newTicket: Omit<SupportTicket, '_id'> = {
            gamingId: user.gamingId,
            visualGamingId: user.visualGamingId,
            subject: finalSubject,
            status: 'open',
            messages: [firstMessage],
            lastSenderRole: 'admin',
            userUnread: 1,   // The user has one unseen admin message (this report)
            adminUnread: 0,  // The admin just wrote it, nothing for them to read
            createdAt: now,
            updatedAt: now,
        };

        const result = await db.collection<SupportTicket>(COLLECTION).insertOne(newTicket as SupportTicket);
        const ticketId = result.insertedId.toString();

        // Notify the user (website bell + FCM) just like a reply, so they know
        // Garena reached out. Failures here never break the report creation.
        await notifyUserOfSupportReply(db, user.gamingId, finalSubject, ticketId);

        revalidatePath('/admin/support');
        return { success: true, message: 'Report created and the user was notified.', ticketId };
    } catch (error) {
        console.error('Support: admin failed to create ticket for user', error);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}
