
'use client';

import { useMemo, useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Search, TrendingUp, CalendarDays, IndianRupee, CheckCircle2, X } from 'lucide-react';
import { getEarningHistory, type DailyEarning } from '../actions';
import { useToast } from '@/hooks/use-toast';

interface EarningHistoryViewProps {
    initialDays: DailyEarning[];
    grandTotalEarning: number;
    grandTotalApproved: number;
}

// Formats a "YYYY-MM-DD" IST date into a friendly label like
// "Monday, 15 June 2026" without ever shifting the day across timezones (we
// build the parts manually, so no Date()/UTC conversion can move it).
function formatIstDate(dateStr: string): { weekday: string; pretty: string } {
    const [y, m, d] = dateStr.split('-').map(Number);
    // Noon UTC keeps us safely inside the same calendar day for naming purposes.
    const ref = new Date(Date.UTC(y, m - 1, d, 12));
    const weekday = ref.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });
    const day = ref.toLocaleDateString('en-IN', { day: 'numeric', timeZone: 'UTC' });
    const month = ref.toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' });
    return { weekday, pretty: `${day} ${month} ${y}` };
}

const inr = (n: number) =>
    n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });

export default function EarningHistoryView({
    initialDays,
    grandTotalEarning,
    grandTotalApproved,
}: EarningHistoryViewProps) {
    const [days, setDays] = useState<DailyEarning[]>(initialDays);
    const [totals, setTotals] = useState({ earning: grandTotalEarning, approved: grandTotalApproved });
    const [search, setSearch] = useState('');
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const handleCalculate = () => {
        startTransition(async () => {
            const result = await getEarningHistory();
            setDays(result.days);
            setTotals({ earning: result.grandTotalEarning, approved: result.grandTotalApproved });
            toast({
                title: 'Earnings recalculated',
                description: `Found earnings across ${result.days.length} day(s).`,
            });
        });
    };

    // Filter days by the search box. We match against both the raw IST date
    // ("2026-06-15") and the human-friendly label so admins can type "15 June",
    // "june", "monday", "2026-06-15", etc.
    const filteredDays = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return days;
        return days.filter((d) => {
            const { weekday, pretty } = formatIstDate(d.date);
            return (
                d.date.toLowerCase().includes(q) ||
                pretty.toLowerCase().includes(q) ||
                weekday.toLowerCase().includes(q)
            );
        });
    }, [days, search]);

    const filteredEarning = useMemo(
        () => Math.round(filteredDays.reduce((s, d) => s + d.totalEarning, 0) * 100) / 100,
        [filteredDays]
    );
    const filteredApproved = useMemo(
        () => filteredDays.reduce((s, d) => s + d.approvedCount, 0),
        [filteredDays]
    );

    const isFiltering = search.trim().length > 0;

    return (
        <div className="space-y-6">
            {/* Header with the "Earn History" calculate button */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <TrendingUp className="h-6 w-6" />
                            </div>
                            <div>
                                <CardTitle className="text-2xl">Earning History</CardTitle>
                                <CardDescription>
                                    Daily income from approved payment sessions, calculated per day
                                    (12&nbsp;AM&nbsp;–&nbsp;12&nbsp;AM, Indian Standard Time).
                                </CardDescription>
                            </div>
                        </div>
                        <Button onClick={handleCalculate} disabled={isPending} size="lg">
                            {isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            Earn History
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            {/* Grand total summary cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card className="border-green-500/30 bg-gradient-to-br from-green-500/10 to-transparent">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <IndianRupee className="h-4 w-4" /> Total Earning
                        </CardDescription>
                        <CardTitle className="text-3xl text-green-600 dark:text-green-400">
                            ₹{inr(totals.earning)}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card className="border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-transparent">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" /> Total Approved Payments
                        </CardDescription>
                        <CardTitle className="text-3xl text-blue-600 dark:text-blue-400">
                            {inr(totals.approved)}
                        </CardTitle>
                    </CardHeader>
                </Card>
                <Card className="border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-transparent">
                    <CardHeader className="pb-2">
                        <CardDescription className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4" /> Days With Earnings
                        </CardDescription>
                        <CardTitle className="text-3xl text-purple-600 dark:text-purple-400">
                            {inr(days.length)}
                        </CardTitle>
                    </CardHeader>
                </Card>
            </div>

            {/* Search + daily breakdown */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col gap-3">
                        <CardTitle className="text-lg">Daily Breakdown</CardTitle>
                        <div className="relative max-w-md">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search a date e.g. 2026-06-15, 15 June, Monday..."
                                className="pl-9 pr-9"
                            />
                            {isFiltering && (
                                <button
                                    type="button"
                                    onClick={() => setSearch('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    aria-label="Clear search"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                        {isFiltering && (
                            <p className="text-sm text-muted-foreground">
                                Showing {filteredDays.length} day(s) · ₹{inr(filteredEarning)} earned ·{' '}
                                {filteredApproved} approved payment(s).
                            </p>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {filteredDays.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                            <CalendarDays className="h-10 w-10 opacity-40" />
                            <p>
                                {days.length === 0
                                    ? 'No approved payments found yet.'
                                    : 'No days match your search.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredDays.map((d) => {
                                const { weekday, pretty } = formatIstDate(d.date);
                                return (
                                    <div
                                        key={d.date}
                                        className="flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-12 w-12 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                <CalendarDays className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="font-semibold">{pretty}</p>
                                                <p className="text-sm text-muted-foreground">{weekday}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 sm:gap-6">
                                            <div className="text-right">
                                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                                    Approved
                                                </p>
                                                <Badge
                                                    variant="secondary"
                                                    className="mt-1 bg-blue-500/15 text-blue-700 dark:text-blue-300"
                                                >
                                                    {d.approvedCount} payment{d.approvedCount === 1 ? '' : 's'}
                                                </Badge>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                                    Earning
                                                </p>
                                                <p className="text-xl font-bold text-green-600 dark:text-green-400">
                                                    ₹{inr(d.totalEarning)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
