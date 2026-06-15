
import { getEarningHistory } from './actions';
import EarningHistoryView from './_components/earning-history-view';

export default async function EarningHistoryPage() {
  const { days, grandTotalEarning, grandTotalApproved } = await getEarningHistory();

  return (
    <EarningHistoryView
      initialDays={days}
      grandTotalEarning={grandTotalEarning}
      grandTotalApproved={grandTotalApproved}
    />
  );
}
