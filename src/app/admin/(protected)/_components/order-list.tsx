'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, X, ArrowUpDown, Loader2, Search, Coins, Trash2, Copy } from 'lucide-react';
import { updateOrderStatus, getOrdersForAdmin, deleteOrders, deleteOrdersInRange } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

type ClientOrder = {
    _id: string;
    productName: string;
    status: string;
    createdAt: string;
    gamingId: string;
    paymentMethod: string;
    utr?: string;
    redeemCode?: string;
    referralCode?: string;
    productPrice: number;
    coinsUsed: number;
    finalPrice: number;
};

interface OrderListProps {
    initialOrders: ClientOrder[];
    status: ('Processing' | 'Completed' | 'Failed')[];
    title: string;
    showActions?: boolean;
    initialHasMore: boolean;
    totalOrders?: number;
    // Opt-in: enables the IST time-frame filter, select-all, bulk copy and
    // delete actions. Off by default so other order pages stay unchanged.
    enableManagement?: boolean;
}

const FormattedDate = ({ dateString, ist }: { dateString: string; ist?: boolean }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return null;
    }

    const date = new Date(dateString);
    if (ist) {
        return date.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric',
        }) + ' IST';
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export function OrderList({ initialOrders, status, title, showActions = false, initialHasMore, totalOrders, enableManagement = false }: OrderListProps) {
    const [orders, setOrders] = useState<ClientOrder[]>(initialOrders);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isPending, startTransition] = useTransition();
    const [isDeleting, startDeleting] = useTransition();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const sort = searchParams.get('sort') || 'asc';
    const search = searchParams.get('search') || '';
    const activeStartDate = searchParams.get('startDate') || '';
    const activeEndDate = searchParams.get('endDate') || '';
    const hasFilter = Boolean(search || activeStartDate || activeEndDate);

    useEffect(() => {
        setOrders(initialOrders);
        setHasMore(initialHasMore);
        setPage(1);
        setSelectedIds(new Set());
    }, [initialOrders, initialHasMore]);

    const handleLoadMore = async () => {
        startTransition(async () => {
            const nextPage = page + 1;
            const { orders: newOrders, hasMore: newHasMore } = await getOrdersForAdmin(nextPage, sort, search, status, activeStartDate, activeEndDate);
            setOrders(prev => [...prev, ...newOrders]);
            setHasMore(newHasMore);
            setPage(nextPage);
        });
    };

    const handleSortToggle = () => {
        const newSort = sort === 'asc' ? 'desc' : 'asc';
        const params = new URLSearchParams(searchParams);
        params.set('sort', newSort);
        router.push(`${pathname}?${params.toString()}`);
    }

    const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const params = new URLSearchParams(searchParams);
        const setOrDelete = (key: string, value: string) => {
            if (value) params.set(key, value);
            else params.delete(key);
        };
        setOrDelete('search', (formData.get('search') as string)?.trim() || '');
        if (enableManagement) {
            setOrDelete('startDate', (formData.get('startDate') as string) || '');
            setOrDelete('endDate', (formData.get('endDate') as string) || '');
        }
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

    const handleAction = async (orderId: string, newStatus: 'Completed' | 'Failed') => {
        startTransition(async () => {
            const result = await updateOrderStatus(orderId, newStatus);
            if (result.success) {
                setOrders(prev => prev.filter(order => order._id.toString() !== orderId));
                toast({ title: 'Success', description: `Order marked as ${newStatus}.` });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: 'Failed to update order status.' });
            }
        });
    };

    const allLoadedSelected = orders.length > 0 && orders.every(o => selectedIds.has(o._id.toString()));

    const toggleSelectAll = (checked: boolean) => {
        if (checked) setSelectedIds(new Set(orders.map(o => o._id.toString())));
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
        const ids = orders.filter(o => selectedIds.has(o._id.toString())).map(o => o.gamingId);
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
            const result = await deleteOrders([id]);
            if (result.success) {
                toast({ title: 'Deleted', description: result.message });
                setOrders(prev => prev.filter(o => o._id.toString() !== id));
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
            const result = await deleteOrders(ids);
            if (result.success) {
                toast({ title: 'Deleted', description: result.message });
                setOrders(prev => prev.filter(o => !selectedIds.has(o._id.toString())));
                setSelectedIds(new Set());
                router.refresh();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.message });
            }
        });
    };

    const handleDeleteAllInRange = () => {
        startDeleting(async () => {
            const result = await deleteOrdersInRange(search, status, activeStartDate, activeEndDate);
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
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-2">
                           <CardTitle>{title}</CardTitle>
                            {totalOrders !== undefined && (
                                <Badge variant="secondary" className="text-sm">{totalOrders}</Badge>
                            )}
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-2">
                                <div className="space-y-1">
                                    {enableManagement && <Label htmlFor="order-search" className="text-xs">Search</Label>}
                                    <Input id="order-search" name="search" placeholder="Search by Gaming/Referral ID..." defaultValue={searchParams.get('search') || ''} className="w-56"/>
                                </div>
                                {enableManagement && (
                                    <>
                                        <div className="space-y-1">
                                            <Label htmlFor="order-start" className="text-xs">From (IST)</Label>
                                            <Input id="order-start" name="startDate" type="datetime-local" defaultValue={activeStartDate} className="w-[200px]" />
                                        </div>
                                        <div className="space-y-1">
                                            <Label htmlFor="order-end" className="text-xs">To (IST)</Label>
                                            <Input id="order-end" name="endDate" type="datetime-local" defaultValue={activeEndDate} className="w-[200px]" />
                                        </div>
                                    </>
                                )}
                                <Button type="submit" variant="outline" size="icon"><Search className="h-4 w-4" /></Button>
                                {enableManagement && hasFilter && (
                                    <Button type="button" variant="ghost" size="icon" onClick={handleClearFilters} aria-label="Clear filters"><X className="h-4 w-4" /></Button>
                                )}
                            </form>
                            <Button variant="outline" onClick={handleSortToggle}>
                                <ArrowUpDown className="mr-2 h-4 w-4" />
                                {sort === 'asc' ? 'Oldest First' : 'Newest First'}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {orders.length === 0 ? (
                        <p className="text-muted-foreground">No orders to display.</p>
                    ) : (
                        <div className="space-y-4">
                            {enableManagement && (
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id="select-all-orders"
                                            checked={allLoadedSelected}
                                            onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                                        />
                                        <Label htmlFor="select-all-orders" className="cursor-pointer text-sm">
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
                                                        <AlertDialogTitle>Delete selected orders?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This permanently deletes the {selectedIds.size} selected order record(s). This action cannot be undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={handleDeleteSelected}>Yes, Delete</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                        {hasFilter && totalOrders !== undefined && totalOrders > 0 && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="destructive" size="sm" disabled={isDeleting}>
                                                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                                        Delete All in Filter ({totalOrders})
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete all {totalOrders} orders in this filter?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This permanently deletes every order matching your current filter
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
                            )}
                            {orders.map(order => (
                                <Card key={order._id}>
                                    <CardHeader>
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="flex items-start gap-3">
                                                {enableManagement && (
                                                    <Checkbox
                                                        className="mt-1"
                                                        checked={selectedIds.has(order._id.toString())}
                                                        onCheckedChange={(checked) => toggleSelectOne(order._id.toString(), Boolean(checked))}
                                                        aria-label="Select order"
                                                    />
                                                )}
                                                <CardTitle className="text-base">{order.productName}</CardTitle>
                                            </div>
                                            <Badge variant={
                                                order.status === 'Completed' ? 'default' :
                                                order.status === 'Processing' ? 'secondary' :
                                                'destructive'
                                            }>{order.status}</Badge>
                                        </div>
                                        <CardDescription>
                                            Order Date: <FormattedDate dateString={order.createdAt} ist={enableManagement} />
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                            <p><strong>Gaming ID:</strong> {order.gamingId}</p>
                                            <p><strong>Payment Method:</strong> {order.paymentMethod}</p>
                                            {order.utr && <p><strong>UTR:</strong> {order.utr}</p>}
                                            {order.redeemCode && <p><strong>Redeem Code:</strong> {order.redeemCode}</p>}
                                            {order.referralCode && <p><strong>Referral Code:</strong> {order.referralCode}</p>}
                                            <p><strong>Original Price:</strong> ₹{order.productPrice}</p>
                                            <p className="flex items-center gap-1"><strong><Coins className="w-4 h-4 text-amber-500" /> Used:</strong> {order.coinsUsed}</p>
                                            <p className="font-bold"><strong>Final Price Paid:</strong> ₹{order.finalPrice}</p>
                                        </div>
                                    </CardContent>
                                    {showActions && (
                                        <CardFooter className="flex justify-end gap-2">
                                            <Button variant="outline" size="icon" onClick={() => handleAction(order._id, 'Failed')} disabled={isPending}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                            <Button size="icon" onClick={() => handleAction(order._id, 'Completed')} disabled={isPending}>
                                                <Check className="h-4 w-4" />
                                            </Button>
                                        </CardFooter>
                                    )}
                                    {enableManagement && (
                                        <CardFooter className="flex justify-end">
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled={isDeleting}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete this order?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This permanently deletes the order record for {order.productName} ({order.gamingId}). This action cannot be undone.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction onClick={() => handleDeleteOne(order._id.toString())}>Yes, Delete</AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </CardFooter>
                                    )}
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
