
'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, X, Trash2, Copy } from 'lucide-react';
import { getSmsLogs, deleteSmsLogs, deleteSmsLogsInRange } from '../actions';
import type { SmsWebhookLog } from '@/lib/definitions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface SmsLogListProps {
    initialLogs: SmsWebhookLog[];
    initialHasMore: boolean;
    totalLogs: number;
}

const FormattedDate = ({ dateString }: { dateString: string }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'long' });
}

export default function SmsLogList({ initialLogs, initialHasMore, totalLogs }: SmsLogListProps) {
    const [logs, setLogs] = useState<SmsWebhookLog[]>(initialLogs);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isPending, startTransition] = useTransition();
    const [isDeleting, startDeleting] = useTransition();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const search = searchParams.get('search') || '';
    const activeStartDate = searchParams.get('startDate') || '';
    const activeEndDate = searchParams.get('endDate') || '';
    const hasFilter = Boolean(search || activeStartDate || activeEndDate);

    useEffect(() => {
        setLogs(initialLogs);
        setHasMore(initialHasMore);
        setPage(1);
        setSelectedIds(new Set());
    }, [initialLogs, initialHasMore]);

    const handleLoadMore = async () => {
        startTransition(async () => {
            const nextPage = page + 1;
            const { logs: newLogs, hasMore: newHasMore } = await getSmsLogs(nextPage, search, activeStartDate, activeEndDate);
            setLogs(prev => [...prev, ...newLogs]);
            setHasMore(newHasMore);
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

    const allLoadedSelected = logs.length > 0 && logs.every(l => selectedIds.has(l._id.toString()));

    const toggleSelectAll = (checked: boolean) => {
        if (checked) setSelectedIds(new Set(logs.map(l => l._id.toString())));
        else setSelectedIds(new Set());
    };

    const toggleSelectOne = (id: string, checked: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const handleBulkCopy = async () => {
        // Copy the matched Gaming IDs of the selected logs (skipping any that
        // were never matched to a user).
        const ids = logs
            .filter(l => selectedIds.has(l._id.toString()))
            .map(l => l.matchedGamingId)
            .filter((g): g is string => Boolean(g));
        if (ids.length === 0) {
            toast({ variant: 'destructive', title: 'Nothing to copy', description: 'None of the selected logs have a matched Gaming ID.' });
            return;
        }
        try {
            await navigator.clipboard.writeText(ids.join(','));
            toast({ title: 'Copied', description: `Copied ${ids.length} Gaming ID(s) to clipboard.` });
        } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not access the clipboard.' });
        }
    };

    const handleDeleteOne = (id: string) => {
        startDeleting(async () => {
            const result = await deleteSmsLogs([id]);
            if (result.success) {
                toast({ title: 'Deleted', description: result.message });
                setLogs(prev => prev.filter(l => l._id.toString() !== id));
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
            const result = await deleteSmsLogs(ids);
            if (result.success) {
                toast({ title: 'Deleted', description: result.message });
                setLogs(prev => prev.filter(l => !selectedIds.has(l._id.toString())));
                setSelectedIds(new Set());
                router.refresh();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };

    const handleDeleteAllInRange = () => {
        startDeleting(async () => {
            const result = await deleteSmsLogsInRange(search, activeStartDate, activeEndDate);
            if (result.success) {
                toast({ title: 'Deleted', description: result.message });
                setSelectedIds(new Set());
                router.refresh();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };

    const getStatusVariant = (status: SmsWebhookLog['status']) => {
        switch (status) {
            case 'verified': return 'default';
            case 'unprocessed': return 'secondary';
            default: return 'destructive';
        }
    }
    
     const getStatusClass = (status: SmsWebhookLog['status']) => {
        switch (status) {
            case 'verified': return 'bg-green-500';
            case 'unprocessed': return 'bg-yellow-500';
            default: return 'bg-gray-500';
        }
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <CardTitle>Incoming SMS Logs</CardTitle>
                        <Badge variant="secondary">{totalLogs}</Badge>
                    </div>
                    <form onSubmit={handleFilter} className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="search">Search</Label>
                                <Input id="search" name="search" placeholder="Sender, message or Gaming ID..." defaultValue={search} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="startDate">From (IST)</Label>
                                <Input id="startDate" name="startDate" type="datetime-local" defaultValue={activeStartDate} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="endDate">To (IST)</Label>
                                <Input id="endDate" name="endDate" type="datetime-local" defaultValue={activeEndDate} />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />Apply Filter</Button>
                            {hasFilter && <Button type="button" variant="ghost" onClick={handleClearFilters}><X className="mr-2 h-4 w-4" />Clear</Button>}
                        </div>
                    </form>
                </div>
                <CardDescription>
                    A real-time log of all SMS messages received from the SMS Forwarder app. Time frame filtering uses Indian Standard Time (IST).
                </CardDescription>
            </CardHeader>
            <CardContent>
                {logs.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No SMS logs received yet.</p>
                ) : (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="select-all-sms"
                                    checked={allLoadedSelected}
                                    onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                                />
                                <Label htmlFor="select-all-sms" className="cursor-pointer text-sm">
                                    Select all on this page
                                    {selectedIds.size > 0 ? ` (${selectedIds.size} selected)` : ''}
                                </Label>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {selectedIds.size > 0 && (
                                    <Button variant="outline" size="sm" onClick={handleBulkCopy}>
                                        <Copy className="mr-2 h-4 w-4" />
                                        Bulk Copy ({selectedIds.size})
                                    </Button>
                                )}
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
                                                    This permanently deletes the {selectedIds.size} selected SMS log(s). This action cannot be undone.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={handleDeleteSelected}>Yes, Delete</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                )}
                                {hasFilter && totalLogs > 0 && (
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="sm" disabled={isDeleting}>
                                                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                                Delete All in Filter ({totalLogs})
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Delete all {totalLogs} logs in this filter?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This permanently deletes every SMS log matching your current filter
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
                        {logs.map(log => (
                            <div key={log._id.toString()} className="border p-4 rounded-lg text-sm bg-muted/40">
                                <div className="flex justify-between items-start mb-2 gap-3">
                                    <div className="flex items-start gap-3">
                                        <Checkbox
                                            className="mt-0.5"
                                            checked={selectedIds.has(log._id.toString())}
                                            onCheckedChange={(checked) => toggleSelectOne(log._id.toString(), Boolean(checked))}
                                            aria-label="Select log"
                                        />
                                        <p className="font-mono text-xs">From: {log.sender || 'Unknown'}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={getStatusVariant(log.status)} className={getStatusClass(log.status)}>
                                            {log.status}
                                        </Badge>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" disabled={isDeleting} aria-label="Delete log">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete this log?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This permanently deletes the SMS log from {log.sender || 'Unknown'}. This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDeleteOne(log._id.toString())}>Yes, Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                </div>
                                <p className="font-mono bg-background p-2 rounded-md border">{log.body}</p>
                                <div className="text-xs text-muted-foreground mt-2 flex justify-between">
                                    <span>Received: <FormattedDate dateString={log.receivedAt as unknown as string} /></span>
                                    {log.parsedAmount && (
                                        <span>Parsed Amount: <span className="font-bold font-sans text-foreground">₹{log.parsedAmount.toFixed(2)}</span></span>
                                    )}
                                </div>
                                {log.status === 'verified' && log.matchedGamingId && (
                                    <div className="text-xs mt-1 font-semibold text-green-600">
                                        Verified for Gaming ID: <span className="font-mono">{log.matchedGamingId}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
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
