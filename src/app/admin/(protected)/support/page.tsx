import { getAllTicketsForAdmin } from '@/app/support/actions';
import AdminSupportClient from './_components/admin-support-client';
import { unstable_noStore as noStore } from 'next/cache';

export default async function AdminSupportPage() {
  noStore();
  const tickets = await getAllTicketsForAdmin();
  return <AdminSupportClient initialTickets={tickets} />;
}
