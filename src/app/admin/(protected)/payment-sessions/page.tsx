
import { getPaymentSessions } from './actions';
import PaymentSessionList from './_components/payment-session-list';

export default async function PaymentSessionsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const page = typeof searchParams.page === 'string' ? Number(searchParams.page) : 1;
  const search = typeof searchParams.search === 'string' ? searchParams.search : '';
  const startDate = typeof searchParams.startDate === 'string' ? searchParams.startDate : '';
  const endDate = typeof searchParams.endDate === 'string' ? searchParams.endDate : '';

  const { sessions, hasMore, total } = await getPaymentSessions(page, search, startDate, endDate);

  return (
    <PaymentSessionList
      initialSessions={sessions}
      initialHasMore={hasMore}
      totalSessions={total}
    />
  );
}
