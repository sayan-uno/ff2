
import { getNotifications, getBroadcastNotifications } from './actions';
import NotificationList from './_components/notification-list';

export default async function UsersNotificationPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const page = typeof searchParams.page === 'string' ? Number(searchParams.page) : 1;
  const search = typeof searchParams.search === 'string' ? searchParams.search : '';
  const sort = typeof searchParams.sort === 'string' ? searchParams.sort : 'desc';
  const tab = typeof searchParams.tab === 'string' ? searchParams.tab : 'broadcasts';
  const broadcastPage = typeof searchParams.bpage === 'string' ? Number(searchParams.bpage) : 1;
  const startDate = typeof searchParams.startDate === 'string' ? searchParams.startDate : '';
  const endDate = typeof searchParams.endDate === 'string' ? searchParams.endDate : '';

  const { notifications, hasMore, total } = await getNotifications(page, search, sort, startDate, endDate);
  const { broadcasts, hasMore: broadcastHasMore, total: broadcastTotal } = await getBroadcastNotifications(broadcastPage, sort);

  return (
    <NotificationList
      initialNotifications={notifications}
      initialHasMore={hasMore}
      totalNotifications={total}
      initialBroadcasts={broadcasts}
      initialBroadcastHasMore={broadcastHasMore}
      totalBroadcasts={broadcastTotal}
      initialTab={tab}
    />
  );
}
