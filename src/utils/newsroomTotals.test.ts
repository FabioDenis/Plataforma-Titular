import assert from 'node:assert/strict';
import test from 'node:test';
import { describeTotalCost, summarizeNewsrooms } from './newsroomTotals';

const row = (status: string, publications: number, totalCostUsd: number | null) => ({ status, month: { publications, totalCostUsd } });
const usd = (cost: number) => `US$ ${cost.toFixed(2)}`;

test('totals add publications, active newsrooms and the cost of every priced newsroom', () => {
  const totals = summarizeNewsrooms([row('active', 10, 1.5), row('draft', 0, 0), row('active', 4, 2.25)]);
  assert.deepEqual(totals, { active: 2, publications: 14, cost: 3.75, unpricedCount: 0 });
  assert.equal(describeTotalCost(totals, usd), 'US$ 3.75');
});

test('a total that skips unpriced newsrooms is labelled as partial', () => {
  const totals = summarizeNewsrooms([row('active', 10, 12.4), row('active', 3, null), row('suspended', 1, null)]);
  assert.deepEqual(totals, { active: 2, publications: 14, cost: 12.4, unpricedCount: 2 });
  assert.equal(describeTotalCost(totals, usd), 'US$ 12.40 · 2 medios sin precio');
  assert.equal(describeTotalCost(summarizeNewsrooms([row('active', 1, 1), row('active', 1, null)]), usd), 'US$ 1.00 · 1 medio sin precio');
});

test('no cost is shown when no newsroom has a price or there are no newsrooms', () => {
  assert.equal(describeTotalCost(summarizeNewsrooms([row('active', 3, null)]), usd), '—');
  assert.deepEqual(summarizeNewsrooms([]), { active: 0, publications: 0, cost: null, unpricedCount: 0 });
  assert.equal(describeTotalCost(summarizeNewsrooms([]), usd), '—');
});
