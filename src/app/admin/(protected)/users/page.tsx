
import UserList from './_components/user-list';
import { getUsersForAdmin } from '@/app/actions';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const page = typeof searchParams.page === 'string' ? Number(searchParams.page) : 1;
  const sort = typeof searchParams.sort === 'string' ? searchParams.sort : 'visits'; // Default to visits
  const search = typeof searchParams.search === 'string' ? searchParams.search : '';
  const since = typeof searchParams.since === 'string' ? searchParams.since : '';
  const startDate = typeof searchParams.startDate === 'string' ? searchParams.startDate : '';
  const endDate = typeof searchParams.endDate === 'string' ? searchParams.endDate : '';

  const { users, hasMore, totalUsers } = await getUsersForAdmin(page, sort, search, since, startDate, endDate);

  return (
    <UserList
      initialUsers={JSON.parse(JSON.stringify(users))}
      initialHasMore={hasMore}
      totalUsers={totalUsers}
    />
  );
}
