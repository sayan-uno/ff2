'use client';

// --- Support Inbox: user identity header strip ---
// A small, self-contained strip that sits directly under the conversation
// header and tells the admin who the report's UID really is — live. It resolves
// the status every time a different report is opened (and whenever the ticket's
// UID changes underneath it, e.g. after a promotion), so the badge always
// reflects the *current* reality:
//   V  -> currently a Visual ID   (shows the original / real UID)
//   N  -> Promoted ID, new side   (shows the old UID it came from)
//   O  -> Promoted ID, old side   (shows the new UID it became)
//   ?  -> not found in any list
//
// It is purely additive: it only reads via the new identity action and never
// touches any existing support behaviour.

import { useEffect, useState } from 'react';
import { Loader2, Eye, ArrowUpRight, History, HelpCircle, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getSupportUserIdentity } from '../identity-actions';
import type { SupportUserIdentity, SupportIdStatus } from '@/lib/support-identity-types';

interface Props {
    // The ticket being viewed. Changing either value re-resolves the identity.
    ticketId: string;
    // The ticket's current canonical gamingId (the UID the messages come from).
    sourceUid: string;
}

// Visual styling + copy for each status.
const STATUS_META: Record<
    SupportIdStatus,
    {
        letter: string;
        label: string;
        relatedLabel: string;
        Icon: typeof Eye;
        badgeClass: string;
        ringClass: string;
    }
> = {
    visual: {
        letter: 'V',
        label: 'Visual ID',
        relatedLabel: 'Original UID',
        Icon: Eye,
        badgeClass: 'bg-blue-100 text-blue-700 border-blue-200',
        ringClass: 'bg-blue-600',
    },
    'promoted-new': {
        letter: 'N',
        label: 'Promoted ID (new)',
        relatedLabel: 'Old UID',
        Icon: ArrowUpRight,
        badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        ringClass: 'bg-emerald-600',
    },
    'promoted-old': {
        letter: 'O',
        label: 'Promoted ID (old)',
        relatedLabel: 'New UID',
        Icon: History,
        badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
        ringClass: 'bg-amber-600',
    },
    'not-found': {
        letter: '?',
        label: 'Not found',
        relatedLabel: '',
        Icon: HelpCircle,
        badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
        ringClass: 'bg-gray-500',
    },
};

function CopyableUid({ value }: { value: string }) {
    const { toast } = useToast();
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
            toast({ title: 'Copied', description: `Copied ${value} to clipboard.` });
        } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not access the clipboard.' });
        }
    };

    return (
        <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 font-mono font-semibold text-gray-800 hover:text-black"
            title="Copy UID"
        >
            {value}
            {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 opacity-50" />}
        </button>
    );
}

export default function SupportUserIdentityHeader({ ticketId, sourceUid }: Props) {
    const [identity, setIdentity] = useState<SupportUserIdentity | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setIdentity(null);
        getSupportUserIdentity(sourceUid)
            .then((result) => {
                if (!cancelled) setIdentity(result);
            })
            .catch(() => {
                if (!cancelled) setIdentity({ sourceUid, status: 'not-found' });
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // Re-resolve whenever the open report or its UID changes so the status is
        // always the live one (e.g. flips V -> N once a user is promoted).
    }, [ticketId, sourceUid]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 bg-[#F6F6F6] border-b px-3 py-1.5 text-[12px] text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking user identity…
            </div>
        );
    }

    if (!identity) return null;

    const meta = STATUS_META[identity.status];
    const { Icon } = meta;

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-[#F6F6F6] border-b px-3 py-1.5 text-[12px]">
            {/* Status badge */}
            <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${meta.badgeClass}`}
            >
                <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white ${meta.ringClass}`}
                >
                    {meta.letter}
                </span>
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
            </span>

            {/* The UID the message comes from */}
            <span className="text-gray-500">
                Message from:&nbsp;<CopyableUid value={identity.sourceUid} />
            </span>

            {/* For a visual ID, also show the visual id currently displayed to the user. */}
            {identity.status === 'visual' && identity.visualUid && (
                <span className="text-gray-500">
                    Visual ID:&nbsp;<CopyableUid value={identity.visualUid} />
                </span>
            )}

            {/* The related UID (original / old / new) depending on the status. */}
            {identity.relatedUid && meta.relatedLabel && (
                <span className="text-gray-500">
                    {meta.relatedLabel}:&nbsp;<CopyableUid value={identity.relatedUid} />
                </span>
            )}

            {/* Not-found hint. */}
            {identity.status === 'not-found' && (
                <span className="text-gray-400">This UID is not in the visual or promoted lists.</span>
            )}
        </div>
    );
}
