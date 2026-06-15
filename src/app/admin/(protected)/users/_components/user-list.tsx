

'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ArrowUpDown, Loader2, Search, Coins, Eye, ShieldBan, ShieldCheck, History, Users, EyeOff, Bell, BellOff, Calendar, Trash2, Copy, X } from 'lucide-react';
import { banUser, getUsersForAdmin, unbanUser, hideUser, deleteAdminUsers, deleteAdminUsersInRange } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { type User } from '@/lib/definitions';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

interface UserListProps {
    initialUsers: User[];
    initialHasMore: boolean;
    totalUsers?: number;
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

export default function UserList({ initialUsers, initialHasMore, totalUsers }: UserListProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    
    const [users, setUsers] = useState<User[]>(initialUsers);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [isPending, startTransition] = useTransition();
    const [isDeleting, startDeleting] = useTransition();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [banMessage, setBanMessage] = useState('');
    const [isBanModalOpen, setIsBanModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const { toast } = useToast();

    const sort = searchParams.get('sort') || 'visits';
    const search = searchParams.get('search') || '';
    const since = searchParams.get('since') || '';
    const activeStartDate = searchParams.get('startDate') || '';
    const activeEndDate = searchParams.get('endDate') || '';
    const hasFilter = Boolean(search || activeStartDate || activeEndDate);

    const [sinceDate, setSinceDate] = useState<Date | undefined>(since ? new Date(since) : undefined);

    useEffect(() => {
        setUsers(initialUsers);
        setHasMore(initialHasMore);
        setPage(1);
        setSelectedIds(new Set());
    }, [initialUsers, initialHasMore]);
    
    useEffect(() => {
        // When sort changes away from 'visits', clear the date
        if (sort !== 'visits' && sinceDate) {
            setSinceDate(undefined);
        }
    }, [sort, sinceDate]);

    const handleLoadMore = async () => {
        startTransition(async () => {
            const nextPage = page + 1;
            const { users: newUsers, hasMore: newHasMore } = await getUsersForAdmin(nextPage, sort, search, since, activeStartDate, activeEndDate);
            setUsers(prev => [...prev, ...newUsers]);
            setHasMore(newHasMore);
            setPage(nextPage);
        });
    };

    const handleDateFilter = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const params = new URLSearchParams(searchParams);
        const setOrDelete = (key: string, value: string) => {
            if (value) params.set(key, value);
            else params.delete(key);
        };
        setOrDelete('startDate', (formData.get('startDate') as string) || '');
        setOrDelete('endDate', (formData.get('endDate') as string) || '');
        params.delete('page');
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleClearDateFilter = () => {
        const params = new URLSearchParams(searchParams);
        params.delete('startDate');
        params.delete('endDate');
        params.delete('page');
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
        const ids = users.filter(u => selectedIds.has(u._id.toString())).map(u => u.gamingId);
        if (ids.length === 0) return;
        try {
            await navigator.clipboard.writeText(ids.join(','));
            toast({ title: 'Copied', description: `Copied ${ids.length} Gaming ID(s) to clipboard.` });
        } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not access the clipboard.' });
        }
    };

    const handleDeleteOne = (id: string) => {
        startDeleting(async () => {
            const result = await deleteAdminUsers([id]);
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
            const result = await deleteAdminUsers(ids);
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
            const result = await deleteAdminUsersInRange(search, activeStartDate, activeEndDate);
            if (result.success) {
                toast({ title: 'Deleted', description: result.message });
                setSelectedIds(new Set());
                router.refresh();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };
    
    const applyFilters = () => {
        const params = new URLSearchParams(searchParams);
        params.set('sort', sort);
        params.set('search', search);

        if (sort === 'visits' && sinceDate) {
            params.set('since', sinceDate.toISOString());
        } else {
            params.delete('since');
        }
        
        params.delete('page');
        router.push(`${pathname}?${params.toString()}`);
    }

    const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const searchQuery = formData.get('search') as string;
        const params = new URLSearchParams(searchParams);
        params.set('search', searchQuery);
        params.delete('page');
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleBan = async () => {
        if (!selectedUser) return;
        startTransition(async () => {
            const result = await banUser(selectedUser._id.toString(), banMessage);
            if (result.success) {
                setUsers(prevUsers => prevUsers.map(user => 
                    user._id.toString() === selectedUser._id.toString() ? { ...user, isBanned: true, banMessage: banMessage } : user
                ));
                toast({ title: 'Success', description: result.message });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
            setIsBanModalOpen(false);
            setBanMessage('');
            setSelectedUser(null);
        });
    };

    const handleUnban = async (userId: string) => {
        startTransition(async () => {
            const result = await unbanUser(userId);
             if (result.success) {
                setUsers(prevUsers => prevUsers.map(user => 
                    user._id.toString() === userId ? { ...user, isBanned: false, banMessage: undefined } : user
                ));
                toast({ title: 'Success', description: result.message });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };
    
    const handleHide = async (userId: string) => {
        startTransition(async () => {
            const result = await hideUser(userId);
            if (result.success) {
                setUsers(prev => prev.filter(user => user._id.toString() !== userId));
                toast({ title: 'Success', description: result.message });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };

    const sortOptions = [
        { value: 'visits', label: 'Most Visits' },
        { value: 'desc', label: 'Newest First' },
        { value: 'asc', label: 'Oldest First' },
    ];

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-2">
                           <CardTitle>User Management</CardTitle>
                            {totalUsers !== undefined && (
                                <Badge variant="secondary" className="text-sm">{totalUsers}</Badge>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                             <form onSubmit={handleSearch} className="flex items-center gap-2">
                                <Input name="search" placeholder="Search Gaming/Referral ID..." defaultValue={searchParams.get('search') || ''} className="w-48"/>
                                <Button type="submit" variant="outline" size="icon"><Search className="h-4 w-4" /></Button>
                            </form>
                             <select value={sort} onChange={(e) => {
                                 const newSort = e.target.value;
                                 const params = new URLSearchParams(searchParams);
                                 params.set('sort', newSort);
                                 if (newSort !== 'visits') {
                                     params.delete('since');
                                 }
                                 router.push(`${pathname}?${params.toString()}`);
                             }} className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                                {sortOptions.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            
                            {sort === 'visits' && (
                                <div className="flex items-center gap-2">
                                     <Popover>
                                        <PopoverTrigger asChild>
                                          <Button
                                            variant={"outline"}
                                            className={cn(
                                              "w-[240px] justify-start text-left font-normal",
                                              !sinceDate && "text-muted-foreground"
                                            )}
                                          >
                                            <CalendarIcon className="mr-2 h-4 w-4" />
                                            {sinceDate ? sinceDate.toLocaleString() : <span>Visits since...</span>}
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <CalendarComponent
                                                mode="single"
                                                selected={sinceDate}
                                                onSelect={setSinceDate}
                                                initialFocus
                                            />
                                            <div className="p-2 border-t">
                                                <Input type="time" step="1" onChange={(e) => {
                                                    const [h, m, s] = e.target.value.split(':').map(Number);
                                                    setSinceDate(prev => {
                                                        const newDate = prev ? new Date(prev) : new Date();
                                                        newDate.setHours(h, m, s || 0);
                                                        return newDate;
                                                    })
                                                }}/>
                                            </div>
                                        </PopoverContent>
                                     </Popover>
                                     <Button onClick={applyFilters}>Apply</Button>
                                </div>
                            )}

                        </div>
                    </div>
                    <form onSubmit={handleDateFilter} className="mt-4 flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="startDate">Joined from (IST)</Label>
                                <Input id="startDate" name="startDate" type="datetime-local" defaultValue={activeStartDate} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="endDate">Joined to (IST)</Label>
                                <Input id="endDate" name="endDate" type="datetime-local" defaultValue={activeEndDate} />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="submit" variant="outline">
                                <Search className="mr-2 h-4 w-4" />
                                Apply Time Filter
                            </Button>
                            {(activeStartDate || activeEndDate) && (
                                <Button type="button" variant="ghost" onClick={handleClearDateFilter}>
                                    <X className="mr-2 h-4 w-4" />
                                    Clear
                                </Button>
                            )}
                            <p className="text-xs text-muted-foreground">Filters by join date in Indian Standard Time (IST).</p>
                        </div>
                    </form>
                </CardHeader>
                <CardContent>
                    {users.length === 0 ? (
                        <p className="text-muted-foreground">No users to display.</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="select-all-users"
                                        checked={allLoadedSelected}
                                        onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                                    />
                                    <Label htmlFor="select-all-users" className="cursor-pointer text-sm">
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
                                    {hasFilter && totalUsers !== undefined && totalUsers > 0 && (
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
                                                        {activeStartDate || activeEndDate ? ' (the selected IST join-date frame)' : ''}, including any not shown on this page. This action cannot be undone.
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
                                <Card key={user._id.toString()} className={user.isBanned ? 'bg-destructive/10 border-destructive' : ''}>
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-3">
                                                <Checkbox
                                                    checked={selectedIds.has(user._id.toString())}
                                                    onCheckedChange={(checked) => toggleSelectOne(user._id.toString(), Boolean(checked))}
                                                    aria-label="Select user"
                                                />
                                                <CardTitle className="text-base font-mono">{user.gamingId}</CardTitle>
                                            </div>
                                             {user.isBanned && <Badge variant="destructive">Banned</Badge>}
                                        </div>
                                        <CardDescription>
                                            Joined (IST): <FormattedDate dateString={user.createdAt as unknown as string} />
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                            <p className="flex items-center gap-2 font-semibold"><Coins className="w-4 h-4 text-amber-500" /> {user.coins}</p>
                                            <p className="flex items-center gap-2 font-semibold"><Users className="w-4 h-4"/> <strong>Visits:</strong> {(user.visits || []).length}</p>
                                            <p><strong>Referred By:</strong> {user.referredByCode || 'N/A'}</p>
                                            <p className={cn(
                                                "flex items-center gap-2 font-semibold",
                                                user.fcmToken ? 'text-green-600' : 'text-muted-foreground'
                                            )}>
                                                {user.fcmToken ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                                                {user.fcmToken ? 'Subscribed' : 'Not Subscribed'}
                                            </p>
                                             {user.isBanned && user.banMessage && <p className="sm:col-span-2 md:col-span-4"><strong>Ban Reason:</strong> {user.banMessage}</p>}
                                        </div>
                                    </CardContent>
                                    <CardFooter className="flex justify-end gap-2">
                                         <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" size="icon" disabled={(user.visits || []).length === 0}>
                                                    <History className="h-4 w-4"/>
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Visit History for {user.gamingId}</DialogTitle>
                                                </DialogHeader>
                                                <ScrollArea className="h-72">
                                                    <div className="space-y-2 pr-4">
                                                        {(user.visits || []).slice().reverse().map((visit, index) => (
                                                            <div key={index} className="flex justify-between items-center text-sm p-2 rounded-md bg-muted/50">
                                                                <p>Visit { (user.visits || []).length - index}</p>
                                                                <p className="font-mono"><FormattedDate dateString={visit as unknown as string} /></p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ScrollArea>
                                            </DialogContent>
                                        </Dialog>
                                        <Button asChild variant="outline" size="icon">
                                            <Link href={`/admin/all-orders?search=${user.gamingId}`} target="_blank">
                                                <Eye className="h-4 w-4" />
                                            </Link>
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" disabled={isPending}>
                                                    <EyeOff className="h-4 w-4" />
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This will hide the user from this list. You can unhide them from the "Hidden Users" section.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleHide(user._id.toString())}>
                                                        Confirm Hide
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                        {user.isBanned ? (
                                            <Button variant="secondary" size="icon" onClick={() => handleUnban(user._id.toString())} disabled={isPending}>
                                                <ShieldCheck className="h-4 w-4" />
                                            </Button>
                                        ) : (
                                            <Button variant="destructive" size="icon" onClick={() => { setSelectedUser(user); setIsBanModalOpen(true); }} disabled={isPending}>
                                                <ShieldBan className="h-4 w-4" />
                                            </Button>
                                        )}
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={isDeleting}>
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
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isBanModalOpen} onOpenChange={setIsBanModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ban User: {selectedUser?.gamingId}</DialogTitle>
                        <DialogDescription>
                            Please provide a reason for banning this user. This message will be shown to them if they try to log in.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-2">
                        <Label htmlFor="ban-message">Ban Message</Label>
                        <Textarea id="ban-message" value={banMessage} onChange={(e) => setBanMessage(e.target.value)} placeholder="e.g., Violation of terms of service." />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsBanModalOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleBan} disabled={isPending || !banMessage}>
                            {isPending ? <Loader2 className="animate-spin" /> : 'Confirm Ban'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
