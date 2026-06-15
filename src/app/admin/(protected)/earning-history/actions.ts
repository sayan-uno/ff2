
'use server';

import { isAdminAuthenticated } from '@/app/actions';
import { connectToDatabase } from '@/lib/mongodb';
import { unstable_noStore as noStore } from 'next/cache';

// One row of the earning history report: a single calendar day in Indian
// Standard Time (IST, fixed UTC+05:30) along with the totals for that day.
export interface DailyEarning {
    // Calendar date in IST, formatted as "YYYY-MM-DD" (e.g. "2026-06-15").
    date: string;
    // How many payment sessions were approved (completed) on this IST day.
    approvedCount: number;
    // Sum of the approved payment amounts on this IST day (in ₹).
    totalEarning: number;
}

export interface EarningHistoryResult {
    days: DailyEarning[];
    grandTotalEarning: number;
    grandTotalApproved: number;
}

// Calculates how much was earned on each calendar day, where a "day" runs from
// 12:00 AM to the next 12:00 AM in Indian Standard Time. An approved payment is
// a payment session (payment_locks) whose status is "completed". We group those
// completed sessions by the IST calendar date of their createdAt timestamp and
// sum the amounts.
//
// This is a read-only report. It does not modify any data and is fully
// independent of the existing payment-session features.
export async function getEarningHistory(): Promise<EarningHistoryResult> {
    noStore();

    const isAdmin = await isAdminAuthenticated();
    if (!isAdmin) {
        return { days: [], grandTotalEarning: 0, grandTotalApproved: 0 };
    }

    try {
        const db = await connectToDatabase();

        const rows = await db.collection('payment_locks').aggregate<{
            _id: string;
            approvedCount: number;
            totalEarning: number;
        }>([
            // Only approved (completed) payment sessions count as earnings.
            { $match: { status: 'completed' } },
            {
                $group: {
                    // Bucket by the IST calendar date of when the session was created.
                    // MongoDB's $dateToString honours the IANA timezone, so this
                    // correctly splits the day at IST midnight (12 AM).
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$createdAt',
                            timezone: 'Asia/Kolkata',
                        },
                    },
                    approvedCount: { $sum: 1 },
                    totalEarning: { $sum: '$amount' },
                },
            },
            // Most recent day first.
            { $sort: { _id: -1 } },
        ]).toArray();

        const days: DailyEarning[] = rows.map((r) => ({
            date: r._id,
            approvedCount: r.approvedCount,
            // Guard against any missing/non-numeric amounts.
            totalEarning: Math.round((r.totalEarning || 0) * 100) / 100,
        }));

        const grandTotalEarning = Math.round(
            days.reduce((sum, d) => sum + d.totalEarning, 0) * 100
        ) / 100;
        const grandTotalApproved = days.reduce((sum, d) => sum + d.approvedCount, 0);

        return { days, grandTotalEarning, grandTotalApproved };
    } catch (error) {
        console.error('Error calculating earning history:', error);
        return { days: [], grandTotalEarning: 0, grandTotalApproved: 0 };
    }
}
