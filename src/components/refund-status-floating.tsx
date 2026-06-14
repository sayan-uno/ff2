'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ChevronRight, X } from 'lucide-react';
import { getMyRefundRequests } from '@/app/actions/refund';
import { REFUND_WINDOW_DAYS, type RefundRequest } from '@/lib/refund-definitions';

// A small floating pill shown on the refund-request page when the user already
// has an accepted refund in progress. It gently nudges them to track the
// existing refund (instead of submitting the same request again) and links to
// the /refundstatus page. Fully self-contained — drop it anywhere.
export default function RefundStatusFloating() {
  const router = useRouter();
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await getMyRefundRequests();
      if (active) setRefunds(data);
    })();
    return () => {
      active = false;
    };
  }, []);

  const inProgress = refunds.filter((r) => r.status === 'in_progress');
  if (dismissed || inProgress.length === 0) return null;

  // Use the most recently accepted refund for the headline progress figure.
  const latest = inProgress.reduce((a, b) =>
    new Date(a.acceptedAt).getTime() > new Date(b.acceptedAt).getTime() ? a : b
  );
  const acceptedAt = new Date(latest.acceptedAt).getTime();
  const completeBy = new Date(latest.completeBy).getTime();
  const total = Math.max(1, completeBy - acceptedAt);
  const elapsed = Math.min(total, Math.max(0, Date.now() - acceptedAt));
  const progress = Math.max(2, Math.round((elapsed / total) * 100));

  return (
    <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-5 z-50 sm:max-w-sm animate-slide-in-up">
      <button
        onClick={() => router.push('/refundstatus')}
        className="group relative w-full text-left rounded-2xl bg-white shadow-2xl ring-1 ring-emerald-200/70 overflow-hidden"
      >
        <span className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-emerald-400 to-teal-500" />
        <div className="flex items-center gap-3 p-3.5 pl-4">
          <div className="relative shrink-0">
            <span className="absolute inset-0 rounded-full bg-emerald-400/40 animate-refund-pulse-ring" />
            <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-white" />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight">
              Refund request accepted 🎉
            </p>
            <p className="text-[11px] text-muted-foreground mb-1.5">
              {inProgress.length > 1
                ? `${inProgress.length} refunds in progress · completes within ${REFUND_WINDOW_DAYS} days`
                : `In progress · completes within ${REFUND_WINDOW_DAYS} days`}
            </p>
            <div className="relative h-1.5 w-full rounded-full bg-emerald-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                style={{ width: `${progress}%` }}
              >
                <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-white/50 animate-refund-shimmer" />
              </div>
            </div>
          </div>

          <ChevronRight className="h-5 w-5 text-emerald-500 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </div>
      </button>

      <button
        onClick={() => setDismissed(true)}
        className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-md hover:bg-gray-700"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
