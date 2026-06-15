'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Search, ArrowUpDown, PersonStanding, Trash2, BadgeAlert, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { findUserForVisualId, setVisualId, removeVisualId, getVisualizedUsers, removeVisualIdsForUsers, removeVisualIdsInRange } from '../actions';
import type { User } from '@/lib/definitions';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';


interface VisualizeIdManagerProps {
  initialUsers: User[];
  initialHasMore: boolean;
  totalUsers: number;
}

const FormattedDate = ({ dateString }: { dateString?: string }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted || !dateString) return null;
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


export default function VisualizeIdManager({ initialUsers, initialHasMore, totalUsers }: VisualizeIdManagerProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    
    const [users, setUsers] = useState(initialUsers);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [realGamingId, setRealGamingId] = useState('');
    const [visualGamingId, setVisualGamingId] = useState('');
    const [foundUser, setFoundUser] = useState<User | null>(null);

    const [isSearching, startSearchTransition] = useTransition();
    const [isSubmitting, startSubmitTransition] = useTransition();
    const [isLoadingMore, startLoadMoreTransition] = useTransition();
    const [isRemoving, startRemoveTransition] = useTransition();

    const sort = searchParams.get('sort') || 'desc';
    const search = searchParams.get('search') || '';
    const activeStartDate = searchParams.get('startDate') || '';
    const activeEndDate = searchParams.get('endDate') || '';
    const hasFilter = Boolean(search || activeStartDate || activeEndDate);

    useEffect(() => {
        setUsers(initialUsers);
        setHasMore(initialHasMore);
        setPage(1);
        setSelectedIds(new Set());
    }, [initialUsers, initialHasMore]);

    const handleSearchUser = async () => {
        if (!realGamingId) {
            toast({ variant: 'destructive', title: 'Error', description: 'Please enter a real Gaming ID to search.' });
            return;
        }
        startSearchTransition(async () => {
            const result = await findUserForVisualId(realGamingId);
            if (result.success && result.user) {
                setFoundUser(result.user);
                setVisualGamingId(result.user.visualGamingId || '');
                toast({ title: 'User Found', description: `You can now set a visual ID for ${result.user.gamingId}.` });
            } else {
                setFoundUser(null);
                toast({ variant: 'destructive', title: 'Not Found', description: result.message });
            }
        });
    };

    const handleSetVisualId = async () => {
        if (!foundUser) return;
        startSubmitTransition(async () => {
            const result = await setVisualId(foundUser.gamingId, visualGamingId);
            if (result.success) {
                toast({ title: 'Success', description: result.message });
                // Refresh the list
                router.refresh();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };

    const handleRemoveVisualId = async (gamingId: string) => {
        startSubmitTransition(async () => {
            const result = await removeVisualId(gamingId);
            if (result.success) {
                toast({ title: 'Success', description: result.message });
                setUsers(prev => prev.filter(u => u.gamingId !== gamingId));
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };
    
    const handleSortToggle = () => {
        const newSort = sort === 'asc' ? 'desc' : 'asc';
        const params = new URLSearchParams(searchParams);
        params.set('sort', newSort);
        router.push(`${pathname}?${params.toString()}`);
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

    const handleLoadMore = async () => {
        startLoadMoreTransition(async () => {
            const nextPage = page + 1;
            const { users: newUsers, hasMore: newHasMore } = await getVisualizedUsers(nextPage, search, sort, activeStartDate, activeEndDate);
            setUsers(prev => [...prev, ...newUsers]);
            setHasMore(newHasMore);
            setPage(nextPage);
        });
    };

    const allLoadedSelected = users.length > 0 && users.every(u => selectedIds.has(u.gamingId));

    const toggleSelectAll = (checked: boolean) => {
        if (checked) setSelectedIds(new Set(users.map(u => u.gamingId)));
        else setSelectedIds(new Set());
    };

    const toggleSelectOne = (gamingId: string, checked: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (checked) next.add(gamingId);
            else next.delete(gamingId);
            return next;
        });
    };

    const handleRemoveSelected = () => {
        const ids = Array.from(selectedIds);
        startRemoveTransition(async () => {
            const result = await removeVisualIdsForUsers(ids);
            if (result.success) {
                toast({ title: 'Removed', description: result.message });
                setUsers(prev => prev.filter(u => !selectedIds.has(u.gamingId)));
                setSelectedIds(new Set());
                router.refresh();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };

    const handleRemoveAllInRange = () => {
        startRemoveTransition(async () => {
            const result = await removeVisualIdsInRange(search, activeStartDate, activeEndDate);
            if (result.success) {
                toast({ title: 'Removed', description: result.message });
                setSelectedIds(new Set());
                router.refresh();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };


    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><PersonStanding />Set Visual Gaming ID</CardTitle>
                    <CardDescription>Assign a display-only ID to a user. This visual ID will be shown on their order page and purchase confirmations, but the real ID will be used for all backend operations.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-end gap-2">
                        <div className="flex-grow space-y-2">
                            <Label htmlFor="realGamingId">Real Gaming ID</Label>
                            <Input id="realGamingId" value={realGamingId} onChange={(e) => setRealGamingId(e.target.value)} placeholder="Search for a user by their real ID"/>
                        </div>
                        <Button type="button" onClick={handleSearchUser} disabled={isSearching}>
                            {isSearching ? <Loader2 className="animate-spin"/> : <Search />}
                            Search User
                        </Button>
                    </div>

                    {foundUser && (
                        <div className="p-4 border rounded-md bg-muted/50 space-y-4">
                             <div className="flex items-start justify-between">
                                <div>
                                    <p className="font-semibold">Editing User: <span className="font-mono">{foundUser.gamingId}</span></p>
                                    <p className="text-sm text-muted-foreground">This is the real ID used for purchases.</p>
                                </div>
                                {foundUser.visualGamingId && (
                                    <Badge variant="secondary">Visual ID Active</Badge>
                                )}
                            </div>
                           
                            <div className="space-y-2">
                                <Label htmlFor="visualGamingId">Visual Gaming ID</Label>
                                <Input id="visualGamingId" value={visualGamingId} onChange={(e) => setVisualGamingId(e.target.value)} placeholder="Enter the ID to display to the user"/>
                            </div>
                            <div className="flex justify-end">
                                <Button type="button" onClick={handleSetVisualId} disabled={isSubmitting}>
                                    {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : null}
                                    Set Visual ID
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                           <CardTitle>Users with Visual IDs</CardTitle>
                           <Badge variant="secondary" className="text-sm">{totalUsers}</Badge>
                        </div>
                        <form onSubmit={handleFilter} className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="listSearch">Search ID</Label>
                                    <Input id="listSearch" name="search" placeholder="Real or visual ID..." defaultValue={search} />
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
                <CardContent>
                     {users.length === 0 ? (
                        <p className="text-muted-foreground text-center py-4">No users with visual IDs found.</p>
                    ) : (
                        <div className="space-y-3">
                           <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="select-all-visual"
                                        checked={allLoadedSelected}
                                        onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                                    />
                                    <Label htmlFor="select-all-visual" className="cursor-pointer text-sm">
                                        Select all on this page
                                        {selectedIds.size > 0 ? ` (${selectedIds.size} selected)` : ''}
                                    </Label>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {selectedIds.size > 0 && (
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={isRemoving}>
                                                    {isRemoving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                                    Remove Selected ({selectedIds.size})
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Remove visual ID from selected users?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This removes the visual ID from the {selectedIds.size} selected user(s). They will see their real ID again. This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleRemoveSelected}>Yes, Remove</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                    {hasFilter && totalUsers > 0 && (
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={isRemoving}>
                                                    {isRemoving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                                    Remove All in Filter ({totalUsers})
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Remove visual ID from all {totalUsers} users in this filter?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This removes the visual ID from every user matching your current filter
                                                        {activeStartDate || activeEndDate ? ' (the selected IST time frame)' : ''}, including any not shown on this page. This action cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={handleRemoveAllInRange}>Yes, Remove All</AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    )}
                                </div>
                           </div>
                           {users.map(user => (
                                <div key={user._id.toString()} className="flex items-center justify-between gap-4 p-4 border rounded-md bg-muted/20">
                                    <div className="flex items-center gap-4">
                                        <Checkbox
                                            checked={selectedIds.has(user.gamingId)}
                                            onCheckedChange={(checked) => toggleSelectOne(user.gamingId, Boolean(checked))}
                                            aria-label="Select user"
                                        />
                                        <div>
                                            <p><strong>Real ID:</strong> <span className="font-mono">{user.gamingId}</span></p>
                                            <p><strong>Visual ID:</strong> <span className="font-mono font-bold text-primary">{user.visualGamingId}</span></p>
                                            <p className="text-xs text-muted-foreground">Set On (IST): <FormattedDate dateString={user.visualIdSetAt as unknown as string} /></p>
                                        </div>
                                    </div>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="destructive" size="icon" disabled={isSubmitting}><Trash2/></Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                                <AlertDialogDescription>This will remove the visual ID for user <span className="font-mono">{user.gamingId}</span>. They will see their real ID again.</AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction onClick={() => handleRemoveVisualId(user.gamingId)}>Remove Visual ID</AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                           ))}
                        </div>
                    )}
                </CardContent>
                {hasMore && (
                    <CardFooter className="justify-center">
                        <Button onClick={handleLoadMore} disabled={isLoadingMore}>
                            {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Load More
                        </Button>
                    </CardFooter>
                )}
            </Card>

        </div>
    );
}
