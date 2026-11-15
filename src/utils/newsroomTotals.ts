// Month totals for the admin newsroom list. A newsroom without a price has a null cost: it is
// left out of the sum and counted, so the header never presents a partial sum as the full cost.

export interface NewsroomTotalsInput {
  status: string;
  month: { publications: number; totalCostUsd: number | null };
}

export interface NewsroomTotals {
  active: number;
  publications: number;
  cost: number | null;
  unpricedCount: number;
}

export function summarizeNewsrooms(newsrooms: NewsroomTotalsInput[]): NewsroomTotals {
  return newsrooms.reduce<NewsroomTotals>(
    (acc, n) => ({
      active: acc.active + (n.status === 'active' ? 1 : 0),
      publications: acc.publications + n.month.publications,
      cost: n.month.totalCostUsd === null ? acc.cost : (acc.cost ?? 0) + n.month.totalCostUsd,
      unpricedCount: acc.unpricedCount + (n.month.totalCostUsd === null ? 1 : 0),
    }),
    { active: 0, publications: 0, cost: null, unpricedCount: 0 }
  );
}

export function describeTotalCost(totals: NewsroomTotals, formatUsd: (cost: number) => string): string {
  if (totals.cost === null) return '—';
  if (totals.unpricedCount === 0) return formatUsd(totals.cost);
  const unpriced = totals.unpricedCount === 1 ? '1 medio sin precio' : `${totals.unpricedCount} medios sin precio`;
  return `${formatUsd(totals.cost)} · ${unpriced}`;
}
