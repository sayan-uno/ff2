
'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Loader2, Activity, ShoppingCart, ArrowUpDown, Search, Trash2, Copy, X } from 'lucide-react';
import { getActiveUsers, deleteActiveUsers, deleteActiveUsersInRange } from '../actions';
import { type User } from '@/lib/definitions';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


type ActiveUser = User & { lastVisit: string, orderCount: number };

interface ActiveUserListProps {
    initialUsers: ActiveUser[];
    initialHasMore: boolean;
    totalUsers: number;
}

const TimeAgo = ({ dateString }: { dateString: string }) => {
    const [timeAgo, setTimeAgo] = useState('');
    const [isRecent, setIsRecent] = useState(false);

    useEffect(() => {
        const update = () => {
            const now = new Date();
            const visitDate = new Date(dateString);
            const seconds = Math.floor((now.getTime() - visitDate.getTime()) / 1000);

            setIsRecent(seconds < 60);

            if (seconds < 60) {
                setTimeAgo(`${seconds}s ago`);
                return;
            }
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) {
                setTimeAgo(`${minutes}m ago`);
                return;
            }
            const hours = Math.floor(minutes / 60);
            if (hours < 24) {
                setTimeAgo(`${hours}h ago`);
                return;
            }
            const days = Math.floor(hours / 24);
            setTimeAgo(`${days}d ago`);
        }

        update();
        const interval = setInterval(update, 5000); // update every 5 seconds
        return () => clearInterval(interval);

    }, [dateString]);

    return (
        <div className="flex items-center gap-2">
            <span className={cn("text-xs", isRecent ? "text-green-600 font-bold" : "text-muted-foreground")}>{timeAgo}</span>
            {isRecent && <Badge className="bg-green-500 hover:bg-green-500 text-white">Active</Badge>}
        </div>
    );
}

const LastVisitIST = ({ dateString }: { dateString: string }) => {
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
}

export default function ActiveUserList({ initialUsers, initialHasMore, totalUsers }: ActiveUserListProps) {
    const [users, setUsers] = useState<ActiveUser[]>(initialUsers);
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
    const sort = searchParams.get('sort') || 'desc';
    const activeStartDate = searchParams.get('startDate') || '';
    const activeEndDate = searchParams.get('endDate') || '';
    const hasFilter = Boolean(search || activeStartDate || activeEndDate);

    useEffect(() => {
        setUsers(initialUsers);
        setHasMore(initialHasMore);
        setPage(1);
        setSelectedIds(new Set());
    }, [initialUsers, initialHasMore]);

    const handleLoadMore = async () => {
        startTransition(async () => {
            const nextPage = page + 1;
            const { users: newUsers, hasMore: newHasMore } = await getActiveUsers(nextPage, search, sort, activeStartDate, activeEndDate);
            setUsers(prev => [...prev, ...newUsers]);
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

    const handleSortToggle = () => {
        const newSort = sort === 'asc' ? 'desc' : 'asc';
        const params = new URLSearchParams(searchParams);
        params.set('sort', newSort);
        router.push(`${pathname}?${params.toString()}`);
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
        // Preserve the on-screen order and copy the selected gaming IDs.
        const ids = users.filter(u => selectedIds.has(u._id.toString())).map(u => u.gamingId);
        if (ids.length === 0) return;
        const text = ids.join(',');
        try {
            await navigator.clipboard.writeText(text);
            toast({ title: 'Copied', description: `Copied ${ids.length} Gaming ID(s) to clipboard.` });
        } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not access the clipboard.' });
        }
    };

    const handleDeleteOne = (id: string) => {
        startDeleting(async () => {
            const result = await deleteActiveUsers([id]);
            if (result.success) {
                toast({ title: 'Deleted', description: result.message });
                setUsers(prev => prev.filter(u => u._id.toString() !== id));
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
            const result = await deleteActiveUsers(ids);
            if (result.success) {
                toast({ title: 'Deleted', description: result.message });
                setUsers(prev => prev.filter(u => !selectedIds.has(u._id.toString())));
                setSelectedIds(new Set());
                router.refresh();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };

    const handleDeleteAllInRange = () => {
        startDeleting(async () => {
            const result = await deleteActiveUsersInRange(search, activeStartDate, activeEndDate);
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
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                           <CardTitle>Active Users</CardTitle>
                            {totalUsers !== undefined && (
                                <Badge variant="secondary">{totalUsers}</Badge>
                            )}
                        </div>
                        <form onSubmit={handleFilter} className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="search">Search Gaming ID</Label>
                                    <Input id="search" name="search" placeholder="Gaming ID..." defaultValue={search} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="startDate">Last visit from (IST)</Label>
                                    <Input id="startDate" name="startDate" type="datetime-local" defaultValue={activeStartDate} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="endDate">Last visit to (IST)</Label>
                                    <Input id="endDate" name="endDate" type="datetime-local" defaultValue={activeEndDate} />
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
                                    {sort === 'asc' ? 'Oldest First' : 'Newest First'}
                                </Button>
                            </div>
                        </form>
                    </div>
                    <CardDescription>
                        Users are sorted by their most recent visit. An "Active" badge is shown for users seen in the last minute. Time frame filtering uses Indian Standard Time (IST).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {users.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">No active users found.</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="select-all-active"
                                        checked={allLoadedSelected}
                                        onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                                    />
                                    <Label htmlFor="select-all-active" className="cursor-pointer text-sm">
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
                                                    <AlertDialogTitle>Delete selected users?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This permanently deletes the {selectedIds.size} selected user account(s). This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleDeleteSelected}>Yes, Delete</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                    {hasFilter && totalUsers > 0 && (
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={isDeleting}>
                                                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                                    Delete All in Filter ({totalUsers})
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Delete all {totalUsers} users in this filter?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This permanently deletes every user account matching your current filter
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
                                                <p className="font-mono font-semibold">{user.gamingId}</p>
                                            </div>
                                            <TimeAgo dateString={user.lastVisit} />
                                        </div>
                                        <p className="text-xs text-muted-foreground pl-7">Last visit: <LastVisitIST dateString={user.lastVisit} /></p>
                                    </CardHeader>
                                    <CardFooter className="flex justify-between items-center text-sm text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                            <ShoppingCart className="w-4 h-4"/>
                                            <span>{user.orderCount} Orders</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button size="sm" variant="outline" asChild>
                                                <Link href={`/admin/users?search=${user.gamingId}`}>View Profile</Link>
                                            </Button>
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" disabled={isDeleting}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete this user?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This permanently deletes the user account <span className="font-mono">{user.gamingId}</span>. This action cannot be undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteOne(user._id.toString())}>Yes, Delete</AlertDialogAction>
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
