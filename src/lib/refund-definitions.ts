import { type ObjectId } from 'mongodb';

// --- Refund Request Feature ---
// These types power the "Accept Refund Request" flow that an admin triggers from
// the support inbox. They are fully self-contained and live in their own
// collection ('refund_requests') so none of the existing features are affected.
//
// A refund request is keyed by (gamingId + orderId): one accepted refund per
// failed order. Re-accepting the same failed order replaces the existing request
// and resets the countdown (see acceptRefundRequest in app/actions/refund.ts).

export type RefundStatus = 'in_progress' | 'completed' | 'failed';

// How long (in days) an accepted refund takes to complete. The /refundstatus
// countdown and progress bar are derived from this window.
export const REFUND_WINDOW_DAYS = 14;

export interface RefundRequest {
  _id: ObjectId;
  gamingId: string;            // The user's Free Fire / Gaming ID
  visualGamingId?: string;     // Display-only gaming ID (if available)
  orderId: string;             // The failed order this refund is for (unique per gamingId+orderId)
  productName: string;
  productImageUrl?: string;
  amount: number;              // Amount to be refunded (the order's final price)
  paymentMethod?: string;      // How the order was originally paid
  utr?: string;                // UTR / transaction reference of the failed order
  status: RefundStatus;        // Whether the refund is still in progress
  ticketId?: string;           // The support ticket this refund was accepted from
  acceptedAt: Date;            // When the refund was (re)accepted — drives the countdown
  completeBy: Date;            // acceptedAt + REFUND_WINDOW_DAYS (denormalized for display)
  createdAt: Date;             // First time a refund was ever accepted for this order
  updatedAt: Date;
}
