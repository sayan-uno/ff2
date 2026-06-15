// --- Support Inbox User Identity ---
// Shared, framework-agnostic types describing the *live* identity status of the
// UID a support report came from. This file deliberately contains ONLY types
// (no 'use server', no DB code) so it can be imported by both the server action
// that resolves the identity and the client component that renders it.
//
// The whole feature is self-contained in its own files so none of the existing
// support-inbox behaviour is affected.

// Where the report's UID currently lives:
//  - 'visual'       : the UID is currently in the Visual ID list (a real account
//                     that has an active visual / display ID). Show a "V" badge
//                     and surface the ORIGINAL (real) UID.
//  - 'promoted-new' : the UID is on the NEW side of the Promoted ID list (it is a
//                     promoted, now-real ID). Show an "N" badge and surface the
//                     OLD UID it came from.
//  - 'promoted-old' : the UID is on the OLD side of the Promoted ID list (it was
//                     promoted away / replaced). Show an "O" badge and surface the
//                     NEW UID it became.
//  - 'not-found'    : the UID is not in any list.
export type SupportIdStatus = 'visual' | 'promoted-new' | 'promoted-old' | 'not-found';

export interface SupportUserIdentity {
    // The UID the report's messages come from (the ticket's current canonical
    // gamingId). This is what we looked the status up against.
    sourceUid: string;
    // The live status of that UID at the moment the admin opened the report.
    status: SupportIdStatus;
    // The related UID to surface, meaning depends on `status`:
    //  - 'visual'       -> the original (real) UID behind the visual ID
    //  - 'promoted-new' -> the OLD UID this promoted ID came from
    //  - 'promoted-old' -> the NEW UID this old ID became
    //  - 'not-found'    -> undefined
    relatedUid?: string;
    // For the 'visual' case only: the visual / display ID currently shown to the
    // user (and seen by the admin in the inbox list).
    visualUid?: string;
    // When the relevant promotion happened (promoted-* statuses only).
    promotionDate?: string;
}
