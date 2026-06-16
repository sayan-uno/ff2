'use client';

import { Badge } from '@/components/ui/badge';

// Small headline pill shown next to the "Accepted Refunds" title that reports
// how many refunds have been accepted. When a date filter is active it reflects
// that time frame; otherwise it is the grand total.
export function RefundCountBadge({
  count,
  filtered = false,
}: {
  count: number;
  filtered?: boolean;
}) {
  return (
    <Badge
      variant="secondary"
      className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
    >
      {count.toLocaleString('en-IN')} {filtered ? 'in filter' : 'total'}
    </Badge>
  );
}
