import { PendingOrderList } from './_components/pending-order-list';
import { getOrdersForAdmin } from '@/app/actions';

const status: ('Processing')[] = ['Processing'];

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const page = typeof searchParams.page === 'string' ? Number(searchParams.page) : 1;
  const sort = typeof searchParams.sort === 'string' ? searchParams.sort : 'asc';
  const search = typeof searchParams.search === 'string' ? searchParams.search : '';

  const { orders, hasMore, totalOrders } = await getOrdersForAdmin(page, sort, search, status);

  return (
    <PendingOrderList
      initialOrders={orders}
      initialHasMore={hasMore}
      totalOrders={totalOrders}
    />
  );
}
