import { getSupportUser, getMyTickets } from './actions';
import SupportClient from './_components/support-client';
import { unstable_noStore as noStore } from 'next/cache';

export const metadata = {
  title: 'Garena Support',
  description: 'Create a support report and chat directly with the Garena support team.',
};

export default async function SupportPage() {
  noStore();
  const user = await getSupportUser();
  const tickets = user ? await getMyTickets() : [];

  return <SupportClient initialUser={user} initialTickets={tickets} />;
}
