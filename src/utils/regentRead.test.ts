import assert from 'node:assert';
import { test } from 'node:test';
import { readInsights, regentRead, type ReadInput } from './regentRead.ts';
import type { Health, MonthRow } from './netWorth.ts';

const row = (i: number, changeMinor: number, inMinor: number, outMinor: number, isCurrent = false): MonthRow => ({
  monthStart: i,
  fromTs: i,
  endTs: i,
  days: 30,
  openMinor: 0,
  closeMinor: changeMinor,
  changeMinor,
  pct: null,
  inMinor,
  outMinor,
  isCurrent,
  isPartial: false,
});

const health = (over: Partial<Health> = {}): Health => ({
  avgGrowthMinor: null,
  avgMonths: 0,
  typicalGrowthMinor: null,
  bestGrowthMinor: null,
  streakMonths: 0,
  keptPct: null,
  runwayDays: null,
  ...over,
});

const input = (rows: MonthRow[], over: Partial<ReadInput> = {}): ReadInput => ({
  rows,
  health: health(),
  plan: null,
  fmt: (m) => `₹${m / 100}`,
  periodName: (r) => `P${r.monthStart}`,
  dateName: () => 'Jun 2027',
  one: 'salary',
  many: 'salaries',
  ...over,
});

test('flat periods with no money moving point to a sync problem first', () => {
  const rows = [row(1, 0, 0, 0), row(2, 0, 0, 0), row(3, 0, 0, 0), row(4, -50_000, 100_000, 150_000), row(5, 400_000, 500_000, 100_000), row(6, 0, 0, 0, true)];
  const text = readInsights(input(rows))[0];
  assert.match(text, /Nothing moved in 3 of your last 5 salaries/);
});

test('different situations give different reads', () => {
  const steady = [row(1, 300_000, 3_000_000, 2_700_000), row(2, 350_000, 3_000_000, 2_650_000), row(3, 320_000, 3_000_000, 2_680_000), row(4, 100_000, 1_000_000, 900_000, true)];
  const a = regentRead(input(steady, { health: health({ streakMonths: 4, keptPct: 10 }) }));
  assert.match(a, /4 salaries in a row of growth/);

  const overspent = [row(1, 300_000, 3_000_000, 2_700_000), row(2, 300_000, 3_000_000, 2_700_000), row(3, -500_000, 3_000_000, 3_500_000), row(4, -200_000, 1_000_000, 1_200_000, true)];
  const b = regentRead(input(overspent));
  assert.match(b, /This salary you're down ₹2000 so far/);
  assert.match(b, /P3 fell ₹5000: you spent ₹8000 more than your usual salary/);
  assert.notStrictEqual(a, b);
});

test('a milestone behind pace is called out', () => {
  const rows = [row(1, 0, 100, 100), row(2, 10_000, 100_000, 90_000), row(3, 0, 100, 100), row(4, 0, 0, 0, true)];
  const plan = {
    targetMinor: 10_000_000,
    progress: 0.25,
    toGoMinor: 7_500_000,
    reached: false,
    historyPeriods: 3,
    needsHistory: false,
    periodsAtPace: null,
    byTs: 1,
    periodsLeft: 7,
    requiredPerPeriodMinor: 1_071_429,
  };
  const text = regentRead(input(rows, { plan, health: health({ typicalGrowthMinor: 0, avgMonths: 3 }) }));
  assert.match(text, /To reach ₹100000 by Jun 2027 you need ₹10714.29 a month. Your usual is ₹0./);
});
