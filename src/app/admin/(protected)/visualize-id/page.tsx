import VisualizeIdManager from './_components/visualize-id-manager';
import { getVisualizedUsers } from './actions';
import { unstable_noStore as noStore } from 'next/cache';

export default async function VisualizeIdPage({
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

  const { users, hasMore, totalUsers } = await getVisualizedUsers(page, search, sort, startDate, endDate);
  
  return (
    <VisualizeIdManager
      initialUsers={users}
      initialHasMore={hasMore}
      totalUsers={totalUsers}
    />
  );
}
