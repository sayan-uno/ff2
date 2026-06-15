'use client';

// --- Pending Orders list (with ID-list filter + bulk tools) ---
// A dedicated, self-contained view for the Pending Orders page. It keeps the
// existing per-order accept / fail buttons and adds:
//   * a dropdown to filter pending orders by the buyer's current ID-list status
//     (All / Visual list / Promoted old / Promoted new / No list),
//   * select-all + bulk copy of the selected orders' Gaming IDs,
//   * bulk "Mark all Completed" / "Mark all Failed" in one click.
//
// The original shared `OrderList` component is left untouched, so every other
// order page (Successful, Failed, All Orders, …) behaves exactly as before.

import { useState, useTransition, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, X, ArrowUpDown, Loader2, Search, Coins, Copy, CheckCheck, Ban } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
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
import { updateOrderStatus, getOrdersForAdmin } from '@/app/actions';
import { getPendingOrdersByIdList, bulkUpdateOrderStatus } from './pending-orders-actions';
import type { IdListCategory } from '@/lib/id-list-membership';

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

interface Props {
    initialOrders: ClientOrder[];
    initialHasMore: boolean;
    totalOrders?: number;
}

const STATUS = ['Processing'] as const;

const CATEGORY_OPTIONS: { value: IdListCategory; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'visual', label: 'Visual list' },
    { value: 'promoted-old', label: 'Promoted old' },
    { value: 'promoted-new', label: 'Promoted new' },
    { value: 'no-list', label: 'No list' },
];

const FormattedDate = ({ dateString }: { dateString: string }) => {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;
    const date = new Date(dateString);
    return <>{`${date.toLocaleDateString()} ${date.toLocaleTimeString()}`}</>;
};

export function PendingOrderList({ initialOrders, initialHasMore, totalOrders }: Props) {
    const { toast } = useToast();
    const [orders, setOrders] = useState<ClientOrder[]>(initialOrders);
    const [total, setTotal] = useState<number | undefined>(totalOrders);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(initialHasMore);
    const [category, setCategory] = useState<IdListCategory>('all');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<'asc' | 'desc'>('asc');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isLoading, startLoading] = useTransition();
    const [isPending, startTransition] = useTransition();
    const [isBulkPending, setIsBulkPending] = useState(false);

    // Load the list for the current category + search + sort. For 'all' we use
    // the existing paginated endpoint (page 1, with Load More); for a specific
    // category we pull the whole filtered set so select-all covers everything.
    const loadList = useCallback(
        (nextCategory: IdListCategory, nextSearch: string, nextSort: 'asc' | 'desc') => {
            startLoading(async () => {
                setSelectedIds(new Set());
                if (nextCategory === 'all') {
                    const { orders: fresh, hasMore: more, totalOrders: t } = await getOrdersForAdmin(
                        1,
                        nextSort,
                        nextSearch,
                        STATUS as unknown as ('Processing')[],
                    );
                    setOrders(fresh);
                    setHasMore(more);
                    setTotal(t);
                    setPage(1);
                } else {
                    const { orders: fresh, total: t } = await getPendingOrdersByIdList(
                        nextCategory,
                        nextSearch,
                        nextSort,
                    );
                    setOrders(fresh);
                    setHasMore(false);
                    setTotal(t);
                    setPage(1);
                }
            });
        },
        [],
    );

    const handleCategoryChange = (value: string) => {
        const next = value as IdListCategory;
        setCategory(next);
        loadList(next, search, sort);
    };

    const handleSortToggle = () => {
        const next = sort === 'asc' ? 'desc' : 'asc';
        setSort(next);
        loadList(category, search, next);
    };

    const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const value = (new FormData(e.currentTarget).get('search') as string)?.trim() || '';
        setSearch(value);
        loadList(category, value, sort);
    };

    const handleLoadMore = () => {
        // Load More only applies to the paginated 'all' view.
        startTransition(async () => {
            const nextPage = page + 1;
            const { orders: more, hasMore: moreLeft } = await getOrdersForAdmin(
                nextPage,
                sort,
                search,
                STATUS as unknown as ('Processing')[],
            );
            setOrders((prev) => [...prev, ...more]);
            setHasMore(moreLeft);
            setPage(nextPage);
        });
    };

    const handleAction = (orderId: string, newStatus: 'Completed' | 'Failed') => {
        startTransition(async () => {
            const result = await updateOrderStatus(orderId, newStatus);
            if (result.success) {
                setOrders((prev) => prev.filter((o) => o._id.toString() !== orderId));
                setSelectedIds((prev) => {
                    const next = new Set(prev);
                    next.delete(orderId);
                    return next;
                });
                setTotal((t) => (t !== undefined ? Math.max(0, t - 1) : t));
                toast({ title: 'Success', description: `Order marked as ${newStatus}.` });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: 'Failed to update order status.' });
            }
        });
    };

    const allShownSelected = orders.length > 0 && orders.every((o) => selectedIds.has(o._id.toString()));

    const toggleSelectAll = (checked: boolean) => {
        if (checked) setSelectedIds(new Set(orders.map((o) => o._id.toString())));
        else setSelectedIds(new Set());
    };

    const toggleSelectOne = (id: string, checked: boolean) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const handleBulkCopy = async () => {
        // Copy the Gaming IDs of the selected orders, in the order shown,
        // comma-separated (e.g. "1111111111,2222222222").
        const ids = orders.filter((o) => selectedIds.has(o._id.toString())).map((o) => o.gamingId);
        if (ids.length === 0) return;
        try {
            await navigator.clipboard.writeText(ids.join(','));
            toast({ title: 'Copied', description: `Copied ${ids.length} Gaming ID(s) to clipboard.` });
        } catch {
            toast({ variant: 'destructive', title: 'Error', description: 'Could not access the clipboard.' });
        }
    };

    const handleBulkStatus = async (newStatus: 'Completed' | 'Failed') => {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        setIsBulkPending(true);
        const result = await bulkUpdateOrderStatus(ids, newStatus);
        setIsBulkPending(false);
        if (result.success) {
            const done = new Set(ids.filter((id) => !result.failedIds.includes(id)));
            setOrders((prev) => prev.filter((o) => !done.has(o._id.toString())));
            setSelectedIds(new Set());
            setTotal((t) => (t !== undefined ? Math.max(0, t - done.size) : t));
            toast({ title: 'Done', description: result.message });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.message });
        }
    };

    const activeCategoryLabel =
        CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? 'All';

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <CardTitle>Pending Orders</CardTitle>
                            {total !== undefined && <Badge variant="secondary" className="text-sm">{total}</Badge>}
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <div className="space-y-1">
                                <Label className="text-xs">ID list</Label>
                                <Select value={category} onValueChange={handleCategoryChange}>
                                    <SelectTrigger className="w-[170px]">
                                        <SelectValue placeholder="All" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {CATEGORY_OPTIONS.map((opt) => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <form onSubmit={handleSearchSubmit} className="flex items-end gap-2">
                                <div className="space-y-1">
                                    <Label htmlFor="pending-search" className="text-xs">Search</Label>
                                    <Input
                                        id="pending-search"
                                        name="search"
                                        placeholder="Search by Gaming/Referral ID..."
                                        defaultValue={search}
                                        className="w-56"
                                    />
                                </div>
                                <Button type="submit" variant="outline" size="icon"><Search className="h-4 w-4" /></Button>
                            </form>
                            <Button variant="outline" onClick={handleSortToggle}>
                                <ArrowUpDown className="mr-2 h-4 w-4" />
                                {sort === 'asc' ? 'Oldest First' : 'Newest First'}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex items-center justify-center py-16 text-muted-foreground">
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading {activeCategoryLabel} orders…
                        </div>
                    ) : orders.length === 0 ? (
                        <p className="text-muted-foreground">No orders to display.</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="select-all-pending"
                                        checked={allShownSelected}
                                        onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                                    />
                                    <Label htmlFor="select-all-pending" className="cursor-pointer text-sm">
                                        Select all{category === 'all' ? ' on this page' : ''}
                                        {selectedIds.size > 0 ? ` (${selectedIds.size} selected)` : ''}
                                    </Label>
                                </div>
                                {selectedIds.size > 0 && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button variant="outline" size="sm" onClick={handleBulkCopy} disabled={isBulkPending}>
                                            <Copy className="mr-2 h-4 w-4" />
                                            Bulk Copy ({selectedIds.size})
                                        </Button>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button size="sm" disabled={isBulkPending}>
                                                    {isBulkPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
                                                    Mark Completed ({selectedIds.size})
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Mark {selectedIds.size} order(s) as Completed?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This completes every selected order, paying any referral rewards and applying the
                                                        same effects as completing them one by one. This cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleBulkStatus('Completed')}>
                                                        Yes, Mark Completed
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="destructive" size="sm" disabled={isBulkPending}>
                                                    {isBulkPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                                                    Mark Failed ({selectedIds.size})
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>Mark {selectedIds.size} order(s) as Failed?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        This fails every selected order, refunding any coins used on UPI orders, exactly as
                                                        failing them one by one. This cannot be undone.
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                    <AlertDialogAction
                                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                        onClick={() => handleBulkStatus('Failed')}
                                                    >
                                                        Yes, Mark Failed
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
                                    </div>
                                )}
                            </div>

                            {orders.map((order) => (
                                <Card key={order._id}>
                                    <CardHeader>
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="flex items-start gap-3">
                                                <Checkbox
                                                    className="mt-1"
                                                    checked={selectedIds.has(order._id.toString())}
                                                    onCheckedChange={(checked) => toggleSelectOne(order._id.toString(), Boolean(checked))}
                                                    aria-label="Select order"
                                                />
                                                <CardTitle className="text-base">{order.productName}</CardTitle>
                                            </div>
                                            <Badge variant="secondary">{order.status}</Badge>
                                        </div>
                                        <CardDescription>
                                            Order Date: <FormattedDate dateString={order.createdAt} />
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
                                    <CardFooter className="flex justify-end gap-2">
                                        <Button variant="outline" size="icon" onClick={() => handleAction(order._id, 'Failed')} disabled={isPending || isBulkPending}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                        <Button size="icon" onClick={() => handleAction(order._id, 'Completed')} disabled={isPending || isBulkPending}>
                                            <Check className="h-4 w-4" />
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {hasMore && category === 'all' && !isLoading && (
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
