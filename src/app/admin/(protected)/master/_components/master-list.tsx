'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, ShoppingCart, ArrowUpDown, Search, Trash2, Copy, X, ShieldAlert, BadgeCheck } from 'lucide-react';
import { getOfflineUsers, purgeGamingIds } from '../actions';
import { DURATION_OPTIONS, type MasterUserRow } from '../shared';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface MasterListProps {
    initialUsers: MasterUserRow[];
    initialHasMore: boolean;
    total: number;
    duration: string;
}

const LastSeenIST = ({ dateString }: { dateString: string }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;
    return (
        <span>
            {new Date(dateString).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric', month: 'short', day: 'numeric',
                hour: 'numeric', minute: 'numeric',
            })} IST
        </span>
    );
};

const OfflineFor = ({ dateString }: { dateString: string }) => {
    const days = Math.floor((Date.now() - new Date(dateString).getTime()) / (24 * 60 * 60 * 1000));
    let text: string;
    if (days >= 365) text = `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}mo`;
    else if (days >= 30) text = `${Math.floor(days / 30)}mo ${days % 30}d`;
    else text = `${days}d`;
    return <Badge variant="secondary" className="font-normal">Offline {text}</Badge>;
};

export default function MasterList({ initialUsers, initialHasMore, total, duration }: MasterListProps) {
    const [users, setUsers] = useState<MasterUserRow[]>(initialUsers);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isPending, startTransition] = useTransition();
    const [isPurging, startPurging] = useTransition();

    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'desc';
    const hasFilter = Boolean(search);

    useEffect(() => {
        setUsers(initialUsers);
        setHasMore(initialHasMore);
        setPage(1);
        setSelectedIds(new Set());
    }, [initialUsers, initialHasMore]);

    const updateParam = (mutate: (params: URLSearchParams) => void) => {
        const params = new URLSearchParams(searchParams);
        mutate(params);
        params.delete('page');
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleDurationChange = (value: string) => updateParam((p) => p.set('duration', value));

    const handleLoadMore = () => {
        startTransition(async () => {
            const nextPage = page + 1;
            const { users: newUsers, hasMore: newHasMore } = await getOfflineUsers(duration, nextPage, search, sort);
            setUsers((prev) => [...prev, ...newUsers]);
            setHasMore(newHasMore);
            setPage(nextPage);
        });
    };

    const handleFilter = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        updateParam((p) => {
            const value = (formData.get('search') as string)?.trim() || '';
            if (value) p.set('search', value);
            else p.delete('search');
        });
    };

    const handleClearFilters = () => updateParam((p) => p.delete('search'));
    const handleSortToggle = () => updateParam((p) => p.set('sort', sort === 'asc' ? 'desc' : 'asc'));

    const allLoadedSelected = users.length > 0 && users.every((u) => selectedIds.has(u.gamingId));
    const toggleSelectAll = (checked: boolean) =>
        setSelectedIds(checked ? new Set(users.map((u) => u.gamingId)) : new Set());
    const toggleSelectOne = (id: string, checked: boolean) =>
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id); else next.delete(id);
            return next;
        });

    const handleBulkCopy = async () => {
        const ids = users.filter((u) => selectedIds.has(u.gamingId)).map((u) => u.gamingId);
        if (ids.length === 0) return;
        try {
            await navigator.clipboard.writeText(ids.join(','));
            toast({ title: 'Copied', description: `Copied ${ids.length} Gaming ID(s) to clipboard.` });
        } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not access the clipboard.' });
        }
    };

    const handleDestroy = (idsToDestroy: string[]) => {
        startPurging(async () => {
            const result = await purgeGamingIds(idsToDestroy);
            if (result.success) {
                toast({ title: 'Destroyed', description: result.message });
                const destroyed = new Set(idsToDestroy);
                setUsers((prev) => prev.filter((u) => !destroyed.has(u.gamingId)));
                setSelectedIds(new Set());
                router.refresh();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };

    const selectedDurationLabel = DURATION_OPTIONS.find((o) => o.key === duration)?.label;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="h-5 w-5 text-destructive" />
                        <CardTitle>Master</CardTitle>
                        {duration && <Badge variant="secondary">{total}</Badge>}
                    </div>
                    <CardDescription>
                        Pick how long an ID must have been offline, then completely destroy the selected IDs and
                        <strong> everything</strong> attached to them (orders, AI logs &amp; images, notifications,
                        support reports/attachments, refunds, payment locks, product controls, promotion logs and more).
                        Promoted IDs only appear when their opposite side is also offline beyond the threshold.
                        Last activity is measured in IST. This cannot be undone.
                    </CardDescription>

                    <div className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Offline duration</Label>
                            <Select value={duration || undefined} onValueChange={handleDurationChange}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a range…" />
                                </SelectTrigger>
                                <SelectContent>
                                    {DURATION_OPTIONS.map((o) => (
                                        <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <form onSubmit={handleFilter} className="space-y-1.5">
                            <Label htmlFor="search">Search Gaming ID</Label>
                            <div className="flex flex-wrap gap-2">
                                <Input id="search" name="search" placeholder="Gaming ID…" defaultValue={search} className="min-w-[140px] flex-1" />
                                <Button type="submit" variant="outline"><Search className="mr-2 h-4 w-4" />Apply</Button>
                                {hasFilter && (
                                    <Button type="button" variant="ghost" onClick={handleClearFilters}><X className="mr-2 h-4 w-4" />Clear</Button>
                                )}
                                <Button type="button" variant="outline" onClick={handleSortToggle}>
                                    <ArrowUpDown className="mr-2 h-4 w-4" />{sort === 'asc' ? 'Longest offline last' : 'Longest offline first'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </CardHeader>

                <CardContent>
                    {!duration ? (
                        <p className="py-8 text-center text-muted-foreground">Select an offline duration above to begin.</p>
                    ) : users.length === 0 ? (
                        <p className="py-8 text-center text-muted-foreground">No IDs have been offline {selectedDurationLabel?.toLowerCase()}.</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="select-all-master"
                                        checked={allLoadedSelected}
                                        onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                                    />
                                    <Label htmlFor="select-all-master" className="cursor-pointer text-sm">
                                        Select all loaded{selectedIds.size > 0 ? ` (${selectedIds.size} selected)` : ''}
                                    </Label>
                                </div>
                                {selectedIds.size > 0 && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={handleBulkCopy}>
                                            <Copy className="mr-2 h-4 w-4" />Bulk Copy ({selectedIds.size})
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={isPurging}>
                                                    {isPurging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                                    Destroy Selected ({selectedIds.size})
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Destroy {selectedIds.size} ID(s) completely?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This permanently deletes the {selectedIds.size} selected Gaming ID(s) and
                                                        <strong> every record attached to them</strong> across the entire database —
                                                        orders, AI logs &amp; images, notifications, support reports &amp; attachments,
                                                        refunds, payment locks, product controls, promotion logs and login-history
                                                        references. This cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        onClick={() => handleDestroy(Array.from(selectedIds))}
                                                    >
                                                        Yes, Destroy Everything
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                )}
                            </div>

                            {users.map((user) => (
                                <Card key={user.gamingId}>
                                    <CardHeader className="pb-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <Checkbox
                                                    checked={selectedIds.has(user.gamingId)}
                                                    onCheckedChange={(checked) => toggleSelectOne(user.gamingId, Boolean(checked))}
                                                    aria-label="Select ID"
                                                />
                                                <p className="font-mono font-semibold">{user.gamingId}</p>
                                                {user.promotedSide && (
                                                    <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                                                        <BadgeCheck className="mr-1 h-3 w-3" />
                                                        Promoted ({user.promotedSide === 'old' ? 'old side' : 'new side'})
                                                    </Badge>
                                                )}
                                            </div>
                                            <OfflineFor dateString={user.lastSeen} />
                                        </div>
                                        <p className="pl-7 text-xs text-muted-foreground">
                                            Last seen: <LastSeenIST dateString={user.lastSeen} />
                                        </p>
                                        {user.partnerIds.length > 0 && (
                                            <p className="pl-7 text-xs text-muted-foreground">
                                                Linked ID: <span className="font-mono">{user.partnerIds.join(', ')}</span>
                                            </p>
                                        )}
                                    </CardHeader>
                                    <CardFooter className="flex items-center justify-between text-sm text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                            <ShoppingCart className="h-4 w-4" />
                                            <span>{user.orderCount} Orders</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button size="sm" variant="outline" asChild>
                                                <Link href={`/admin/users?search=${user.gamingId}`}>View Profile</Link>
                                            </Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" disabled={isPurging}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Destroy this ID completely?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This permanently deletes <span className="font-mono">{user.gamingId}</span> and
                                                            <strong> everything attached to it</strong>. This cannot be undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                            onClick={() => handleDestroy([user.gamingId])}
                                                        >
                                                            Yes, Destroy Everything
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    </CardFooter>
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
