import { getAcceptedRefunds } from '@/app/actions/refund';
import { getAcceptedRefundsCount } from '@/app/actions/refund-stats';
import RefundsClient from './_components/refunds-client';

// Admin section: all accepted refund requests, newest first by default, with a
// sort toggle, a date-time range filter and "Load more" pagination (10 per page).
// The header also shows a count of how many refunds have been accepted in total.
export default async function AdminRefundsPage() {
  const [{ refunds, hasMore }, totalCount] = await Promise.all([
    getAcceptedRefunds({ page: 1, sort: 'desc' }),
    getAcceptedRefundsCount(),
  ]);

  return (
    <RefundsClient
      initialRefunds={refunds}
      initialHasMore={hasMore}
      initialCount={totalCount}
    />
  );
}
