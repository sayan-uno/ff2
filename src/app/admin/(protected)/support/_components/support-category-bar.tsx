'use client';

import { Inbox, AlertTriangle, Ban, Lock, Paperclip } from 'lucide-react';

// The five inbox categories. 'all' keeps the original behaviour; the rest are
// filtered views with their own bulk actions.
export type SupportCategory = 'all' | 'escalation' | 'blocked' | 'closed' | 'attachments';

const CATEGORIES: { key: SupportCategory; label: string; icon: typeof Inbox }[] = [
    { key: 'all', label: 'All', icon: Inbox },
    { key: 'escalation', label: 'Escalation', icon: AlertTriangle },
    { key: 'blocked', label: 'Blocked', icon: Ban },
    { key: 'closed', label: 'Closed', icon: Lock },
    { key: 'attachments', label: 'Attachments', icon: Paperclip },
];

// Horizontal, scrollable category selector shown above the search box. Each chip
// shows a live count for the current (time-filtered) set.
export default function SupportCategoryBar({
    category,
    counts,
    onChange,
}: {
    category: SupportCategory;
    counts: Record<SupportCategory, number>;
    onChange: (c: SupportCategory) => void;
}) {
    return (
        <div className="flex gap-1.5 overflow-x-auto p-2 border-b bg-muted/30">
            {CATEGORIES.map(({ key, label, icon: Icon }) => {
                const active = category === key;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                                ? 'bg-[#075E54] text-white border-[#075E54]'
                                : 'bg-background text-muted-foreground hover:bg-muted'
                        }`}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                        <span
                            className={`ml-0.5 rounded-full px-1.5 text-[10px] ${
                                active ? 'bg-white/20' : 'bg-muted-foreground/15'
                            }`}
                        >
                            {counts[key] ?? 0}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
