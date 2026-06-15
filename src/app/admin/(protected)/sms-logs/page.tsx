
import { getSmsLogs } from './actions';
import SmsLogList from './_components/sms-log-list';

export default async function SmsLogsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const page = typeof searchParams.page === 'string' ? Number(searchParams.page) : 1;
  const search = typeof searchParams.search === 'string' ? searchParams.search : '';
  const startDate = typeof searchParams.startDate === 'string' ? searchParams.startDate : '';
  const endDate = typeof searchParams.endDate === 'string' ? searchParams.endDate : '';

  const { logs, hasMore, total } = await getSmsLogs(page, search, startDate, endDate);

  return (
    <SmsLogList
      initialLogs={logs}
      initialHasMore={hasMore}
      totalLogs={total}
    />
  );
}
