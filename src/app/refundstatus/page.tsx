'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  ReceiptText,
  ArrowLeft,
  PackageCheck,
} from 'lucide-react';
import { getMyRefundRequests } from '@/app/actions/refund';
import { REFUND_WINDOW_DAYS, type RefundRequest } from '@/lib/refund-definitions';

// --- Live countdown helper -------------------------------------------------

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

function getRemaining(target: number): Remaining {
  const diff = Math.max(0, target - Date.now());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    done: diff <= 0,
  };
}

function TimeBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-16 sm:w-[4.5rem] h-16 sm:h-[4.5rem] rounded-2xl bg-card border border-primary/15 shadow-sm flex items-center justify-center">
        <span className="text-2xl sm:text-3xl font-bold font-sans tabular-nums tracking-tight text-primary">
          {String(value).padStart(2, '0')}
        </span>
      </div>
      <span className="mt-2 text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </span>
    </div>
  );
}

// --- A single refund card --------------------------------------------------

function RefundCard({ refund, index }: { refund: RefundRequest; index: number }) {
  const acceptedAt = new Date(refund.acceptedAt).getTime();
  const completeBy = new Date(refund.completeBy).getTime();
  const isCompleted = refund.status === 'completed';
  const isFailed = refund.status === 'failed';

  const [remaining, setRemaining] = useState<Remaining>(() => getRemaining(completeBy));

  useEffect(() => {
    if (isCompleted || isFailed) return;
    const id = setInterval(() => setRemaining(getRemaining(completeBy)), 1000);
    return () => clearInterval(id);
  }, [completeBy, isCompleted, isFailed]);

  // Progress = how much of the 14-day window has elapsed.
  const total = Math.max(1, completeBy - acceptedAt);
  const elapsed = Math.min(total, Math.max(0, Date.now() - acceptedAt));
  const progress = isCompleted || remaining.done ? 100 : Math.round((elapsed / total) * 100);
  // The 14-day window elapsed but the admin hasn't marked it completed yet — we
  // keep it "in progress" and reassure the user instead of claiming it's done.
  const expired = !isCompleted && !isFailed && remaining.done;
  // "finished" === show the green completed UI. Only an admin completion counts;
  // a lapsed timer does NOT auto-complete the refund.
  const finished = isCompleted;

  return (
    <Card
      className="relative overflow-hidden border-0 shadow-xl opacity-0 animate-slide-in-up"
      style={{ animationDelay: `${index * 120}ms` }}
    >
      {/* Top accent strip */}
      <div
        className={`h-1.5 w-full ${
          isFailed
            ? 'bg-red-500'
            : finished
            ? 'bg-emerald-500'
            : 'bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-400'
        }`}
      />

      <div className="p-5 sm:p-6">
        {/* Product header */}
        <div className="flex items-start gap-4">
          <div className="relative h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-muted ring-1 ring-black/5">
            {refund.productImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={refund.productImageUrl} alt={refund.productName} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <ReceiptText className="h-7 w-7 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base leading-tight line-clamp-2">{refund.productName}</h3>
            <p className="mt-1 text-lg font-bold text-emerald-600">₹{refund.amount}</p>
            {refund.utr && (
              <p className="text-[11px] text-muted-foreground truncate">UTR: {refund.utr}</p>
            )}
          </div>

          {/* Status pill */}
          {isFailed ? (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2.5 py-1 text-xs font-semibold">
              <XCircle className="h-3.5 w-3.5" /> Failed
            </span>
          ) : finished ? (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-1 text-xs font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> Completed
            </span>
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 text-xs font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500 animate-refund-pulse-ring" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
              In Progress
            </span>
          )}
        </div>

        {isFailed ? (
          /* Failed note — no progress bar / countdown */
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
            <XCircle className="h-5 w-5 shrink-0" />
            <span>
              This refund could not be processed. Please{' '}
              <Link href="/support?new=1" className="font-semibold underline underline-offset-2 hover:text-red-800">
                contact support
              </Link>{' '}
              for assistance.
            </span>
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {finished ? 'Refund processed' : 'Refund under progress'}
                </span>
                <span className="font-semibold text-emerald-600">{progress}%</span>
              </div>
              <div className="relative h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-[width] duration-700 ease-out"
                  style={{ width: `${progress}%` }}
                >
                  {!finished && (
                    <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-white/40 animate-refund-shimmer" />
                  )}
                </div>
              </div>
            </div>

            {/* Completed note, post-window reassurance, or live countdown */}
            {finished ? (
              <div className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-700">
                <PackageCheck className="h-5 w-5 shrink-0" />
                Your refund has been processed successfully. Thank you for your patience.
              </div>
            ) : expired ? (
              <div className="mt-5 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-700">
                <Clock className="h-5 w-5 shrink-0" />
                We&apos;re currently experiencing some difficulty processing this refund.
                Don&apos;t worry — it will be completed soon. Thank you for your patience.
              </div>
            ) : (
              <div className="mt-5">
                <p className="text-center text-xs text-muted-foreground mb-3">
                  Estimated completion in
                </p>
                <div className="flex items-center justify-center gap-2 sm:gap-3">
                  <TimeBox value={remaining.days} label="Days" />
                  <span className="text-2xl font-bold text-primary/30 pb-5">:</span>
                  <TimeBox value={remaining.hours} label="Hrs" />
                  <span className="text-2xl font-bold text-primary/30 pb-5">:</span>
                  <TimeBox value={remaining.minutes} label="Min" />
                  <span className="text-2xl font-bold text-primary/30 pb-5">:</span>
                  <TimeBox value={remaining.seconds} label="Sec" />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

// --- Page ------------------------------------------------------------------

export default function RefundStatusPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await getMyRefundRequests();
      if (active) {
        setRefunds(data);
        setLoading(false);
      }
    })();
    // Keep the list reasonably fresh in case the admin accepts while open.
    const id = setInterval(async () => {
      const data = await getMyRefundRequests();
      if (active) setRefunds(data);
    }, 20000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const inProgress = refunds.filter((r) => r.status === 'in_progress');
  const completed = refunds.filter((r) => r.status === 'completed' || r.status === 'failed');

  return (
    <div className="min-h-[70vh] bg-gradient-to-b from-emerald-50/60 to-background">
      <div className="container mx-auto px-4 sm:px-6 py-10 max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8 animate-slide-in-up">
          <div className="relative mx-auto mb-4 h-20 w-20 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-refund-pulse-ring" />
            <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-xl animate-refund-float">
              <ShieldCheck className="h-10 w-10 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold font-headline">Refund Status</h1>
          <p className="mt-2 text-muted-foreground text-sm max-w-md mx-auto">
            Your accepted refund requests are tracked here. Approved refunds are
            completed within <span className="font-semibold text-emerald-600">{REFUND_WINDOW_DAYS} days</span>.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-3" />
            <p className="text-sm">Loading your refund status…</p>
          </div>
        ) : refunds.length === 0 ? (
          <Card className="text-center py-14 px-6 animate-slide-in-up">
            <ReceiptText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
            <h2 className="font-semibold text-lg">No refund requests yet</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm mx-auto">
              Once our team accepts a refund for a failed order, you&apos;ll be able to
              track its live progress here.
            </p>
            <Button asChild variant="outline">
              <Link href="/refund-request">
                <ArrowLeft className="h-4 w-4 mr-2" /> Go to Refund Request
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="space-y-8">
            {inProgress.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground px-1">
                  In Progress
                </h2>
                {inProgress.map((r, i) => (
                  <RefundCard key={r.orderId} refund={r} index={i} />
                ))}
              </section>
            )}

            {completed.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground px-1">
                  Processed
                </h2>
                {completed.map((r, i) => (
                  <RefundCard key={r.orderId} refund={r} index={i} />
                ))}
              </section>
            )}

            <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              Refunds are processed securely to your original payment method.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
