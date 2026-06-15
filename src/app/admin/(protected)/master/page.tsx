import { getOfflineUsers } from './actions';
import MasterList from './_components/master-list';
import { unstable_noStore as noStore } from 'next/cache';

export default async function MasterPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  noStore();
  const duration = typeof searchParams.duration === 'string' ? searchParams.duration : '';
  const page = typeof searchParams.page === 'string' ? Number(searchParams.page) : 1;
  const search = typeof searchParams.search === 'string' ? searchParams.search : '';
  const sort = typeof searchParams.sort === 'string' ? searchParams.sort : 'desc';

  // Only query once the admin has chosen a duration — the section opens on an
  // empty state prompting the selection.
  const { users, hasMore, total } = duration
    ? await getOfflineUsers(duration, page, search, sort)
    : { users: [], hasMore: false, total: 0 };

  return (
    <MasterList
      initialUsers={users}
      initialHasMore={hasMore}
      total={total}
      duration={duration}
    />
  );
}
