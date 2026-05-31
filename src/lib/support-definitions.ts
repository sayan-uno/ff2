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
    imageIds?: string[];      // References to SupportImage documents (what is stored)
    // Populated only when a single ticket is fetched for viewing (NOT stored in the DB).
    images?: { _id: string; url: string }[];
    createdAt: Date;
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
    createdAt: Date;
    updatedAt: Date;             // Bumped whenever a new message is added
}
