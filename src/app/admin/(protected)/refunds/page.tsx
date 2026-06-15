import { getAcceptedRefunds } from '@/app/actions/refund';
import RefundsClient from './_components/refunds-client';

// Admin section: all accepted refund requests, newest first by default, with a
// sort toggle, a date-time range filter and "Load more" pagination (10 per page).
export default async function AdminRefundsPage() {
  const { refunds, hasMore } = await getAcceptedRefunds({ page: 1, sort: 'desc' });

  return <RefundsClient initialRefunds={refunds} initialHasMore={hasMore} />;
}
