
'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Search, ArrowUpDown, ArrowRight, Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getPromotedIdLogs, deletePromotedIdLogs, deletePromotedIdLogsInRange } from '../actions';
import type { VisualIdPromotionLog } from '@/lib/definitions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface PromotedIdListProps {
  initialLogs: VisualIdPromotionLog[];
  initialHasMore: boolean;
  initialTotal: number;
}

const FormattedDate = ({ dateString }: { dateString: string }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
}

const HighlightedId = ({ oldId, newId }: { oldId: string, newId: string }) => {
  const newIdChars = newId.split('');
  const oldIdChars = oldId.split('');

  return (
    <span className="font-mono font-bold text-primary">
      {newIdChars.map((char, index) => {
        if (char !== oldIdChars[index]) {
          return <span key={index} className="text-blue-600">{char}</span>;
        }
        return <span key={index}>{char}</span>;
      })}
    </span>
  );
};

export default function PromotedIdList({ initialLogs, initialHasMore, initialTotal }: PromotedIdListProps) {
  const [logs, setLogs] = useState(initialLogs);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [total, setTotal] = useState(initialTotal);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const sort = searchParams.get('sort') || 'desc';
  const activeStartDate = searchParams.get('startDate') || '';
  const activeEndDate = searchParams.get('endDate') || '';
  const activeSearch = searchParams.get('search') || '';
  const hasFilter = Boolean(activeSearch || activeStartDate || activeEndDate);

  useEffect(() => {
    setLogs(initialLogs);
    setHasMore(initialHasMore);
    setTotal(initialTotal);
    setPage(1);
    setSelectedIds(new Set());
  }, [initialLogs, initialHasMore, initialTotal]);

  const handleLoadMore = async () => {
    startTransition(async () => {
      const nextPage = page + 1;
      const { logs: newLogs, hasMore: newHasMore, total: newTotal } = await getPromotedIdLogs(activeSearch, nextPage, sort, activeStartDate, activeEndDate);
      setLogs(prev => [...prev, ...newLogs]);
      setHasMore(newHasMore);
      setTotal(newTotal);
      setPage(nextPage);
    });
  };

  const handleFilter = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams(searchParams);

    const setOrDelete = (key: string, value: string) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };
    setOrDelete('search', (formData.get('search') as string)?.trim() || '');
    setOrDelete('startDate', (formData.get('startDate') as string) || '');
    setOrDelete('endDate', (formData.get('endDate') as string) || '');
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleClearFilters = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('search');
    params.delete('startDate');
    params.delete('endDate');
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSortToggle = () => {
    const newSort = sort === 'asc' ? 'desc' : 'asc';
    const params = new URLSearchParams(searchParams);
    params.set('sort', newSort);
    router.push(`${pathname}?${params.toString()}`);
  };

  const allLoadedSelected = logs.length > 0 && logs.every(log => selectedIds.has(log._id.toString()));

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(logs.map(log => log._id.toString())));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleDeleteOne = (id: string) => {
    startDeleting(async () => {
      const result = await deletePromotedIdLogs([id]);
      if (result.success) {
        toast({ title: 'Deleted', description: result.message });
        setLogs(prev => prev.filter(log => log._id.toString() !== id));
        setTotal(prev => Math.max(0, prev - result.deletedCount));
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    });
  };

  const handleDeleteSelected = () => {
    const ids = Array.from(selectedIds);
    startDeleting(async () => {
      const result = await deletePromotedIdLogs(ids);
      if (result.success) {
        toast({ title: 'Deleted', description: result.message });
        setLogs(prev => prev.filter(log => !selectedIds.has(log._id.toString())));
        setTotal(prev => Math.max(0, prev - result.deletedCount));
        setSelectedIds(new Set());
        router.refresh();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    });
  };

  const handleDeleteAllInRange = () => {
    startDeleting(async () => {
      const result = await deletePromotedIdLogsInRange(activeSearch, activeStartDate, activeEndDate);
      if (result.success) {
        toast({ title: 'Deleted', description: result.message });
        setSelectedIds(new Set());
        router.refresh();
      } else {
        toast({ variant: 'destructive', title: 'Error', description: result.message });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              Promoted ID Logs
              <span className="inline-flex items-center justify-center rounded-full bg-primary px-2.5 py-0.5 text-sm font-semibold text-primary-foreground">
                {total}
              </span>
            </CardTitle>
            <CardDescription>
              {total === 1 ? '1 UID has' : `${total} UIDs have`} been promoted to their real ID upon logout
              {hasFilter ? ' (matching your filter)' : ''}.
            </CardDescription>
          </div>

          <form onSubmit={handleFilter} className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="search">Search ID</Label>
                <Input
                  id="search"
                  name="search"
                  placeholder="Old or new ID..."
                  defaultValue={activeSearch}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="startDate">From (IST)</Label>
                <Input
                  id="startDate"
                  name="startDate"
                  type="datetime-local"
                  defaultValue={activeStartDate}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endDate">To (IST)</Label>
                <Input
                  id="endDate"
                  name="endDate"
                  type="datetime-local"
                  defaultValue={activeEndDate}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="outline">
                <Search className="mr-2 h-4 w-4" />
                Apply Filter
              </Button>
              {hasFilter && (
                <Button type="button" variant="ghost" onClick={handleClearFilters}>
                  <X className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              )}
              <Button type="button" variant="outline" onClick={handleSortToggle}>
                <ArrowUpDown className="mr-2 h-4 w-4" />
                {sort === 'desc' ? 'Newest First' : 'Oldest First'}
              </Button>
            </div>
          </form>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {logs.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No promotion logs found.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="select-all"
                  checked={allLoadedSelected}
                  onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                />
                <Label htmlFor="select-all" className="cursor-pointer text-sm">
                  Select all on this page
                  {selectedIds.size > 0 ? ` (${selectedIds.size} selected)` : ''}
                </Label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedIds.size > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={isDeleting}>
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Delete Selected ({selectedIds.size})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete selected logs?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently deletes the {selectedIds.size} selected promotion log(s). This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteSelected}>Yes, Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                {hasFilter && total > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" disabled={isDeleting}>
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Delete All in Filter ({total})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete all {total} logs in this filter?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently deletes every promotion log matching your current filter
                          {activeStartDate || activeEndDate ? ' (the selected IST time frame)' : ''}, including any not shown on this page. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteAllInRange}>Yes, Delete All</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {logs.map((log) => {
                const id = log._id.toString();
                return (
                  <Card key={id} className="p-4 bg-muted/50">
                    <div className="flex items-center gap-4">
                      <Checkbox
                        checked={selectedIds.has(id)}
                        onCheckedChange={(checked) => toggleSelectOne(id, Boolean(checked))}
                        aria-label="Select log"
                      />
                      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4 text-sm sm:text-base">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Old ID</p>
                            <p className="font-mono font-semibold">{log.oldGamingId}</p>
                          </div>
                          <ArrowRight className="w-5 h-5 text-primary shrink-0" />
                          <div>
                            <p className="text-xs text-muted-foreground">New ID</p>
                            <HighlightedId oldId={log.oldGamingId} newId={log.newGamingId} />
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-sm text-muted-foreground sm:text-right">
                            <p className="text-xs">Promoted On (IST)</p>
                            <p><FormattedDate dateString={log.promotionDate as unknown as string} /></p>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={isDeleting}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this log?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This permanently deletes the promotion log for {log.oldGamingId} → {log.newGamingId}. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteOne(id)}>Yes, Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
       {hasMore && (
        <CardFooter className="justify-center">
            <Button onClick={handleLoadMore} disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Load More
            </Button>
        </CardFooter>
      )}
    </Card>
  );
}
