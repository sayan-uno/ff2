

'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Search, History, Fingerprint, Eraser, Copy, X } from 'lucide-react';
import { getIpHistory, clearSecurityLogUsers, clearSecurityLogUsersInRange } from '../actions';
import { Input } from '@/components/ui/input';
import { type User } from '@/lib/definitions';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface IpLogListProps {
  initialUsers: any[];
  initialHasMore: boolean;
  totalUsers: number;
}

const FormattedDate = ({ dateString }: { dateString?: string }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted || !dateString) return <span className="text-muted-foreground">N/A</span>;
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

export default function IpLogList({ initialUsers, initialHasMore, totalUsers }: IpLogListProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    
    const [users, setUsers] = useState(initialUsers);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isPending, startTransition] = useTransition();
    const [isDeleting, startDeleting] = useTransition();
    const { toast } = useToast();

    const searchIp = searchParams.get('ip') || '';
    const searchId = searchParams.get('id') || '';
    const searchFingerprint = searchParams.get('fingerprint') || '';
    const activeStartDate = searchParams.get('startDate') || '';
    const activeEndDate = searchParams.get('endDate') || '';
    const hasFilter = Boolean(searchIp || searchId || searchFingerprint || activeStartDate || activeEndDate);

    useEffect(() => {
        setUsers(initialUsers);
        setHasMore(initialHasMore);
        setPage(1);
        setSelectedIds(new Set());
    }, [initialUsers, initialHasMore]);

    const handleLoadMore = async () => {
        startTransition(async () => {
            const nextPage = page + 1;
            const { users: newUsers, hasMore: newHasMore } = await getIpHistory(nextPage, searchId, searchIp, searchFingerprint, activeStartDate, activeEndDate);
            setUsers(prev => [...prev, ...newUsers]);
            setHasMore(newHasMore);
            setPage(nextPage);
        });
    };

    const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const ipQuery = formData.get('ip') as string;
        const idQuery = formData.get('id') as string;
        const fingerprintQuery = formData.get('fingerprint') as string;
        const startQuery = formData.get('startDate') as string;
        const endQuery = formData.get('endDate') as string;
        const params = new URLSearchParams();
        if (ipQuery) params.set('ip', ipQuery);
        if (idQuery) params.set('id', idQuery);
        if (fingerprintQuery) params.set('fingerprint', fingerprintQuery);
        if (startQuery) params.set('startDate', startQuery);
        if (endQuery) params.set('endDate', endQuery);
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleClearFilters = () => {
        router.push(pathname);
    };

    const allLoadedSelected = users.length > 0 && users.every(u => selectedIds.has(u._id.toString()));

    const toggleSelectAll = (checked: boolean) => {
        if (checked) setSelectedIds(new Set(users.map(u => u._id.toString())));
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
        const ids = users.filter(u => selectedIds.has(u._id.toString())).map(u => u.gamingId);
        if (ids.length === 0) return;
        try {
            await navigator.clipboard.writeText(ids.join(','));
            toast({ title: 'Copied', description: `Copied ${ids.length} Gaming ID(s) to clipboard.` });
        } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not access the clipboard.' });
        }
    };

    const handleClearOne = (id: string) => {
        startDeleting(async () => {
            const result = await clearSecurityLogUsers([id], activeStartDate, activeEndDate);
            if (result.success) {
                toast({ title: 'Cleared', description: result.message });
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
                router.refresh();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };

    const handleClearSelected = () => {
        const ids = Array.from(selectedIds);
        startDeleting(async () => {
            const result = await clearSecurityLogUsers(ids, activeStartDate, activeEndDate);
            if (result.success) {
                toast({ title: 'Cleared', description: result.message });
                setSelectedIds(new Set());
                router.refresh();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };

    const handleClearAllInRange = () => {
        startDeleting(async () => {
            const result = await clearSecurityLogUsersInRange(searchId, searchIp, searchFingerprint, activeStartDate, activeEndDate);
            if (result.success) {
                toast({ title: 'Cleared', description: result.message });
                setSelectedIds(new Set());
                router.refresh();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-2">
                           <CardTitle>User Security Logs</CardTitle>
                            {totalUsers !== undefined && (
                                <Badge variant="secondary">{totalUsers} Users</Badge>
                            )}
                        </div>
                        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-2">
                            <div className="flex-grow space-y-1">
                                <Label htmlFor="search-id">Gaming ID</Label>
                                <Input name="id" id="search-id" placeholder="Search by Gaming ID..." defaultValue={searchId} className="w-full sm:w-40"/>
                            </div>
                            <div className="flex-grow space-y-1">
                                <Label htmlFor="search-ip">IP Address</Label>
                                <Input name="ip" id="search-ip" placeholder="Search by IP..." defaultValue={searchIp} className="w-full sm:w-40"/>
                            </div>
                            <div className="flex-grow space-y-1">
                                <Label htmlFor="search-fingerprint">Fingerprint ID</Label>
                                <Input name="fingerprint" id="search-fingerprint" placeholder="Search by Fingerprint..." defaultValue={searchFingerprint} className="w-full sm:w-40"/>
                            </div>
                            <div className="flex-grow space-y-1">
                                <Label htmlFor="search-start">From (IST)</Label>
                                <Input name="startDate" id="search-start" type="datetime-local" defaultValue={activeStartDate} className="w-full sm:w-48"/>
                            </div>
                            <div className="flex-grow space-y-1">
                                <Label htmlFor="search-end">To (IST)</Label>
                                <Input name="endDate" id="search-end" type="datetime-local" defaultValue={activeEndDate} className="w-full sm:w-48"/>
                            </div>
                            <Button type="submit" variant="outline" size="icon"><Search className="h-4 w-4" /></Button>
                            {hasFilter && (
                                <Button type="button" variant="ghost" size="icon" onClick={handleClearFilters} aria-label="Clear filters"><X className="h-4 w-4" /></Button>
                            )}
                        </form>
                    </div>
                </CardHeader>
                <CardContent>
                    {users.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">No users found for this search.</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="select-all-security"
                                        checked={allLoadedSelected}
                                        onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                                    />
                                    <Label htmlFor="select-all-security" className="cursor-pointer text-sm">
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
                                                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eraser className="mr-2 h-4 w-4" />}
                                                    Clear Selected ({selectedIds.size})
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Clear security history?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This clears the IP &amp; device history for the {selectedIds.size} selected user(s)
                                                        {activeStartDate || activeEndDate ? ' (only entries within the selected IST time frame)' : ''}. The user account(s) are kept. This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleClearSelected}>Yes, Clear</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                    {hasFilter && totalUsers > 0 && (
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={isDeleting}>
                                                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eraser className="mr-2 h-4 w-4" />}
                                                    Clear All in Filter ({totalUsers})
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Clear security history for all {totalUsers} users in this filter?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This clears the IP &amp; device history for every user matching your current filter
                                                        {activeStartDate || activeEndDate ? ' (only entries within the selected IST time frame)' : ''}, including any not shown on this page. The user accounts are kept. This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleClearAllInRange}>Yes, Clear All</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                </div>
                            </div>
                            {users.map(user => (
                                <Card key={user._id.toString()}>
                                    <CardHeader className="pb-4">
                                        <div className="flex justify-between items-center gap-3">
                                            <div className="flex items-center gap-3">
                                                <Checkbox
                                                    checked={selectedIds.has(user._id.toString())}
                                                    onCheckedChange={(checked) => toggleSelectOne(user._id.toString(), Boolean(checked))}
                                                    aria-label="Select user"
                                                />
                                                <CardTitle className="text-base font-mono">{user.gamingId}</CardTitle>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                        <Button variant="outline" size="sm" className="gap-2">
                                                            <History className="h-4 w-4"/>
                                                            IP History ({user.ipHistory?.length || 0})
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent>
                                                        <DialogHeader>
                                                            <DialogTitle>IP History for {user.gamingId}</DialogTitle>
                                                            <DialogDescription>
                                                                A log of all IPs used by this user, most recent first.
                                                            </DialogDescription>
                                                        </DialogHeader>
                                                        <ScrollArea className="h-72">
                                                            <div className="space-y-2 pr-4">
                                                                {user.ipHistory && user.ipHistory.length > 0 ? (
                                                                    user.ipHistory.slice().reverse().map((entry: any, index: number) => (
                                                                        <div key={index} className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                                                                            <p className="font-mono">{entry.ip}</p>
                                                                            <p className="text-xs text-muted-foreground"><FormattedDate dateString={entry.timestamp} /></p>
                                                                        </div>
                                                                    ))
                                                                ) : (
                                                                    <p className="text-muted-foreground text-center py-8">No IP history for this user.</p>
                                                                )}
                                                            </div>
                                                        </ScrollArea>
                                                    </DialogContent>
                                                </Dialog>
                                                <Dialog>
                                                    <DialogTrigger asChild>
                                                         <Button variant="outline" size="sm" className="gap-2">
                                                            <Fingerprint className="h-4 w-4"/>
                                                            Devices ({user.fingerprintHistory?.length || 0})
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent>
                                                        <DialogHeader>
                                                            <DialogTitle>Device History for {user.gamingId}</DialogTitle>
                                                            <DialogDescription>
                                                                A log of all device fingerprints used by this user, most recent first.
                                                            </DialogDescription>
                                                        </DialogHeader>
                                                        <ScrollArea className="h-72">
                                                            <div className="space-y-2 pr-4">
                                                                {user.fingerprintHistory && user.fingerprintHistory.length > 0 ? (
                                                                    user.fingerprintHistory.slice().reverse().map((entry: any, index: number) => (
                                                                        <div key={index} className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                                                                            <p className="font-mono text-xs truncate">{entry.fingerprint}</p>
                                                                            <p className="text-xs text-muted-foreground shrink-0 ml-2"><FormattedDate dateString={entry.timestamp} /></p>
                                                                        </div>
                                                                    ))
                                                                ) : (
                                                                    <p className="text-muted-foreground text-center py-8">No device history for this user.</p>
                                                                )}
                                                            </div>
                                                        </ScrollArea>
                                                    </DialogContent>
                                                </Dialog>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={isDeleting} aria-label="Clear security history">
                                                            <Eraser className="h-4 w-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Clear security history?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This clears the IP &amp; device history for <span className="font-mono">{user.gamingId}</span>
                                                                {activeStartDate || activeEndDate ? ' (only entries within the selected IST time frame)' : ''}. The user account is kept. This action cannot be undone.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={() => handleClearOne(user._id.toString())}>Yes, Clear</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </div>
                                    </CardHeader>
                                </Card>
                            ))}
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
