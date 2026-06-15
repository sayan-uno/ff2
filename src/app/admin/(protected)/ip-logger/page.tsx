

import IpLogList from './_components/ip-log-list';
import { getIpHistory } from './actions';
import { unstable_noStore as noStore } from 'next/cache';

export default async function AdminIpLoggerPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  noStore();
  const page = typeof searchParams.page === 'string' ? Number(searchParams.page) : 1;
  const searchId = typeof searchParams.id === 'string' ? searchParams.id : '';
  const searchIp = typeof searchParams.ip === 'string' ? searchParams.ip : '';
  const searchFingerprint = typeof searchParams.fingerprint === 'string' ? searchParams.fingerprint : '';
  const startDate = typeof searchParams.startDate === 'string' ? searchParams.startDate : '';
  const endDate = typeof searchParams.endDate === 'string' ? searchParams.endDate : '';

  const { users, hasMore, totalUsers } = await getIpHistory(page, searchId, searchIp, searchFingerprint, startDate, endDate);

  return (
    <IpLogList
      initialUsers={users}
      initialHasMore={hasMore}
      totalUsers={totalUsers}
    />
  );
}
