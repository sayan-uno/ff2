import { type ObjectId } from 'mongodb';

// --- Support Chat Feature ---
// These types power the new "Garena Support" chat feature. They are fully
// self-contained and live in their own collection ('support_tickets') so that
// none of the existing features are affected.

// A single message inside a support conversation.
export interface SupportMessage {
    _id: ObjectId;
    sender: 'user' | 'admin'; // Who wrote the message
    text: string;
    // Optional rich, self-contained HTML body (server-generated, trusted) rendered
    // inside the chat bubble instead of the plain `text`. `text` is kept as the
    // plain-text fallback (e.g. the admin inbox preview / older clients).
    html?: string;
    imageIds?: string[];      // References to SupportImage documents (what is stored)
    // Populated only when a single ticket is fetched for viewing (NOT stored in the DB).
    images?: { _id: string; url: string }[];

    // --- Large attachments (videos & files) ---
    // References to GridFS files stored in the 'support_files' bucket. Used for
    // videos and documents that are too big for the inline base64 image path.
    // Self-contained: when these are absent the message behaves exactly like
    // before, so existing image/text messages are completely unaffected.
    fileIds?: string[];
    // Populated only when a ticket is fetched for viewing (NOT stored in the DB).
    files?: SupportFileRef[];

    // --- System notices ---
    // A 'system' message is a server-generated notice rendered as a centered
    // banner in the chat (NOT a left/right bubble). `sender` is still set (to the
    // role that triggered it) so unread counting / previews keep working, but the
    // UI keys off `kind === 'system'` for rendering.
    kind?: 'system';
    systemType?: 'upload_limit_request' | 'upload_limit_granted';

    createdAt: Date;
}

// Lightweight, display-only descriptor of a GridFS attachment, attached to a
// message when a ticket is fetched for viewing. The raw bytes are streamed from
// /api/support/file/<id>; only this metadata is ever embedded in the ticket.
export interface SupportFileRef {
    _id: string;
    filename: string;
    contentType: string;
    size: number;                       // Bytes
    kind: 'video' | 'file';             // How the bubble should render it
}

// An image attached to a support message. Stored in its own collection
// ('support_images') so the ticket document never grows past MongoDB's 16MB limit.
export interface SupportImage {
    _id: ObjectId;
    ticketId: string;
    gamingId: string;
    dataUri: string;   // The full base64 data URI of the image
    uploadedBy?: 'user' | 'admin'; // Who uploaded it (defaults to 'user' for older docs)
    createdAt: Date;
}

// Per-user upload limit for large attachments (videos & files). Stored in its
// own collection ('support_upload_limits'), keyed by gamingId. Absent means the
// user is on the default 10MB tier; admins can raise a single user to 250MB.
export interface SupportUploadLimit {
    _id: ObjectId;
    gamingId: string;
    limitBytes: number;        // The user's current max per-file size for videos/files
    updatedAt: Date;
    updatedBy?: 'admin';
}

// A support "report" / conversation thread opened by a user.
export interface SupportTicket {
    _id: ObjectId;
    gamingId: string;            // The Free Fire / Gaming ID of the user who opened the report
    visualGamingId?: string;     // The display-only gaming ID (if available)
    subject: string;             // Short title of the report
    status: 'open' | 'closed';   // Whether the ticket is still open
    messages: SupportMessage[];  // The full conversation
    lastSenderRole: 'user' | 'admin'; // Who sent the latest message
    userUnread: number;          // Number of admin messages the user hasn't seen yet
    adminUnread: number;         // Number of user messages the admin hasn't seen yet
    // The last time the report owner genuinely viewed the chat (tab open & online).
    // Drives the real "seen" read-receipt for admin replies AND the 3-second
    // rule that decides whether to push a reply notification. NOT set when the
    // admin merely opens the ticket — admin read receipts are derived from replies.
    userLastReadAt?: Date;
    createdAt: Date;
    updatedAt: Date;             // Bumped whenever a new message is added
}
