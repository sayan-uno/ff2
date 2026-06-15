import LogList from './_components/log-list';
import { getAiLogs } from '@/app/actions';
import { unstable_noStore as noStore } from 'next/cache';

export default async function AdminAiLogsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  noStore();
  const page = typeof searchParams.page === 'string' ? Number(searchParams.page) : 1;
  const search = typeof searchParams.search === 'string' ? searchParams.search : '';
  const sort = typeof searchParams.sort === 'string' ? searchParams.sort : 'desc';
  const startDate = typeof searchParams.startDate === 'string' ? searchParams.startDate : '';
  const endDate = typeof searchParams.endDate === 'string' ? searchParams.endDate : '';

  const { logs, hasMore, totalLogs } = await getAiLogs(page, search, sort, startDate, endDate);

  return (
    <LogList
      initialLogs={logs}
      initialHasMore={hasMore}
      totalLogs={totalLogs}
    />
  );
}
