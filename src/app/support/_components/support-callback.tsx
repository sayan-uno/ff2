'use client';

import { Phone, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Callback request UI — kept in its own file so the main support client stays
// untouched apart from a tiny bit of wiring.
//
//  • CallButton    — the phone icon shown in the chat header's top-right corner.
//  • CallbackDialog — the "Do you want to request a callback?" confirm popup.
//
// The popup is a self-contained fixed overlay (z-[90]) rather than a Radix
// Dialog, matching the file's existing overlay pattern and guaranteeing it sits
// above the full-screen chat overlay (z-[60]) and image viewer (z-[70]).
// ---------------------------------------------------------------------------

// Phone icon button for the chat header (top-right corner).
export function CallButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="ml-auto p-2 rounded-full hover:bg-white/10 transition-colors"
            aria-label="Request a callback"
            title="Request a callback"
        >
            <Phone className="h-5 w-5" />
        </button>
    );
}

// The "request a callback" confirmation popup.
export function CallbackDialog({
    open,
    submitting,
    onConfirm,
    onClose,
}: {
    open: boolean;
    submitting: boolean;
    onConfirm: () => void;
    onClose: () => void;
}) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4"
            onClick={submitting ? undefined : onClose}
        >
            <div
                className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-[#075E54] text-white px-5 py-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                        <Phone className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="font-semibold text-[15px] leading-tight">Request a callback</p>
                        <p className="text-[12px] text-white/80">Talk with a support member</p>
                    </div>
                </div>

                <div className="px-5 py-4 text-[13.5px] leading-relaxed text-gray-700">
                    Do you want to request a callback from our support team? We&apos;ll review
                    your report and share a way to talk with you (such as a Google Meet or call
                    link) right here in this chat.
                </div>

                <div className="flex items-center justify-end gap-2 px-5 pb-4">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        disabled={submitting}
                        className="text-gray-600"
                    >
                        No
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={submitting}
                        className="bg-[#075E54] hover:bg-[#0a7d6f] min-w-[88px]"
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes, request'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
