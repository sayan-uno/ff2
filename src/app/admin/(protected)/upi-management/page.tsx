import { getAdminUpiId, getUpiChangeHistory } from './actions';
import UpiManager from './_components/upi-manager';
import { unstable_noStore as noStore } from 'next/cache';

export default async function UpiManagementPage() {
  noStore();
  const currentUpiId = await getAdminUpiId();
  const changeHistory = await getUpiChangeHistory();

  return <UpiManager currentUpiId={currentUpiId} changeHistory={changeHistory} />;
}
