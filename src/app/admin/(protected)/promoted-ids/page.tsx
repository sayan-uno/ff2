import { getPromotedIdLogs } from './actions';
import PromotedIdList from './_components/promoted-id-list';

export default async function PromotedIdsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const search = typeof searchParams.search === 'string' ? searchParams.search : '';
  const page = typeof searchParams.page === 'string' ? Number(searchParams.page) : 1;
  const sort = typeof searchParams.sort === 'string' ? searchParams.sort : 'desc';
  const startDate = typeof searchParams.startDate === 'string' ? searchParams.startDate : '';
  const endDate = typeof searchParams.endDate === 'string' ? searchParams.endDate : '';
  const { logs, hasMore, total } = await getPromotedIdLogs(search, page, sort, startDate, endDate);

  return <PromotedIdList initialLogs={logs} initialHasMore={hasMore} initialTotal={total} />;
}
