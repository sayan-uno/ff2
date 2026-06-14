'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowUpDown,
  Loader2,
  BadgeCheck,
  XCircle,
  Trash2,
  CalendarRange,
  RotateCcw,
  ReceiptText,
} from 'lucide-react';
import {
  getAcceptedRefunds,
  updateRefundStatus,
  deleteRefundRequest,
  type AdminRefundListItem,
} from '@/app/actions/refund';

interface Props {
  initialRefunds: AdminRefundListItem[];
  initialHasMore: boolean;
}

type SortDir = 'asc' | 'desc';

const statusStyles: Record<AdminRefundListItem['status'], string> = {
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

const statusLabel: Record<AdminRefundListItem['status'], string> = {
  in_progress: 'In Progress',
  completed: 'Completed',
  failed: 'Failed',
};

function FormattedDate({ value }: { value: string }) {
  const d = new Date(value);
  return <>{`${d.toLocaleDateString()} ${d.toLocaleTimeString()}`}</>;
}

export default function RefundsClient({ initialRefunds, initialHasMore }: Props) {
  const { toast } = useToast();
  const [refunds, setRefunds] = useState<AdminRefundListItem[]>(initialRefunds);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortDir>('desc');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Reload the list from page 1 with the current sort + date filter.
  const reload = (next: { sort?: SortDir; from?: string; to?: string }) => {
    const nextSort = next.sort ?? sort;
    const nextFrom = next.from ?? from;
    const nextTo = next.to ?? to;
    startTransition(async () => {
      const { refunds: rows, hasMore: more } = await getAcceptedRefunds({
        page: 1,
        sort: nextSort,
        from: nextFrom || undefined,
        to: nextTo || undefined,
      });
      setRefunds(rows);
      setHasMore(more);
      setPage(1);
    });
  };

  const handleSortToggle = () => {
    const newSort: SortDir = sort === 'desc' ? 'asc' : 'desc';
    setSort(newSort);
    reload({ sort: newSort });
  };

  const handleApplyFilter = () => reload({});

  const handleClearFilter = () => {
    setFrom('');
    setTo('');
    reload({ from: '', to: '' });
  };

  const handleLoadMore = () => {
    startTransition(async () => {
      const nextPage = page + 1;
      const { refunds: rows, hasMore: more } = await getAcceptedRefunds({
        page: nextPage,
        sort,
        from: from || undefined,
        to: to || undefined,
      });
      setRefunds((prev) => [...prev, ...rows]);
      setHasMore(more);
      setPage(nextPage);
    });
  };

  const handleStatus = async (
    id: string,
    status: 'in_progress' | 'completed' | 'failed'
  ) => {
    setBusyId(id);
    const result = await updateRefundStatus(id, status);
    setBusyId(null);
    if (result.success) {
      setRefunds((prev) =>
        prev.map((r) => (r._id === id ? { ...r, status } : r))
      );
      toast({ title: 'Updated', description: result.message });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    const result = await deleteRefundRequest(id);
    setBusyId(null);
    if (result.success) {
      setRefunds((prev) => prev.filter((r) => r._id !== id));
      toast({ title: 'Deleted', description: result.message });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-emerald-600" /> Accepted Refunds
            </CardTitle>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:flex-wrap">
              <Button variant="outline" onClick={handleSortToggle} disabled={isPending}>
                <ArrowUpDown className="mr-2 h-4 w-4" />
                {sort === 'desc' ? 'Newest First' : 'Oldest First'}
              </Button>

              <div className="flex flex-col">
                <label className="text-[11px] text-muted-foreground mb-0.5">From</label>
                <Input
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-[200px]"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-[11px] text-muted-foreground mb-0.5">To</label>
                <Input
                  type="datetime-local"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-[200px]"
                />
              </div>

              <Button onClick={handleApplyFilter} disabled={isPending}>
                <CalendarRange className="mr-2 h-4 w-4" /> Apply
              </Button>
              {(from || to) && (
                <Button variant="ghost" onClick={handleClearFilter} disabled={isPending}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {refunds.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No accepted refunds to display.
            </p>
          ) : (
            <div className="space-y-3">
              {refunds.map((r) => {
                const isBusy = busyId === r._id;
                return (
                  <Card key={r._id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="relative h-14 w-14 shrink-0 rounded-md overflow-hidden bg-muted">
                          {r.productImageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.productImageUrl}
                              alt={r.productName}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm truncate">{r.productName}</p>
                            <Badge className={statusStyles[r.status]}>
                              {statusLabel[r.status]}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ₹{r.amount} · {r.paymentMethod}
                            {r.utr ? ` · UTR ${r.utr}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Gaming ID: {r.visualGamingId || r.gamingId}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Accepted: <FormattedDate value={r.acceptedAt} />
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 mt-3">
                        {r.status !== 'completed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                            disabled={isBusy}
                            onClick={() => handleStatus(r._id, 'completed')}
                          >
                            {isBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <BadgeCheck className="h-4 w-4 mr-1" />
                            )}
                            Complete
                          </Button>
                        )}
                        {r.status !== 'failed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-700 border-red-200 hover:bg-red-50"
                            disabled={isBusy}
                            onClick={() => handleStatus(r._id, 'failed')}
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Fail
                          </Button>
                        )}
                        {r.status !== 'in_progress' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isBusy}
                            onClick={() => handleStatus(r._id, 'in_progress')}
                          >
                            <RotateCcw className="h-4 w-4 mr-1" /> Reopen
                          </Button>
                        )}

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="destructive" disabled={isBusy}>
                              <Trash2 className="h-4 w-4 mr-1" /> Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this refund?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This permanently removes the refund record for{' '}
                                <span className="font-semibold">{r.productName}</span>. The
                                user&apos;s order page will go back to showing the order&apos;s
                                original status. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => handleDelete(r._id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {hasMore && (
        <div className="text-center">
          <Button onClick={handleLoadMore} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
