import assert from 'node:assert';
import { test } from 'node:test';
import { planSalaryCycleRenewal, cyclePeriodLabel } from './cycleBudgets.ts';
import { resolveCycle } from './moneyCycle.ts';

const ts = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const mid = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
const salary = (y: number, m: number, d: number) => ({ timestamp: ts(y, m, d, 10), amount: 50000 });

const novBudget = {
  id: 'nov',
  name: 'Monthly budget (November 2026)',
  category: 'all',
  limitAmount: 30000,
  period: 'November 2026',
  periodType: 'monthly',
  startDate: mid(2026, 10, 31),
  endDate: mid(2026, 11, 30) - 1,
  isOverall: true,
};
const novFood = {
  id: 'nov_food',
  name: 'Food',
  category: 'food',
  limitAmount: 8000,
  period: 'November 2026',
  periodType: 'monthly',
  startDate: novBudget.startDate,
  endDate: novBudget.endDate,
  isOverall: false,
  parentBudgetId: 'nov',
};

test('calendar mode plans nothing', () => {
  const plan = planSalaryCycleRenewal([novBudget], resolveCycle(ts(2026, 12, 5), 0));
  assert.deepStrictEqual(plan, { updates: [], create: null });
});

test('labels: month-end salary names the cycle after next month', () => {
  assert.strictEqual(cyclePeriodLabel(resolveCycle(ts(2026, 11, 10), 31)), 'November 2026');
  assert.strictEqual(cyclePeriodLabel(resolveCycle(ts(2026, 11, 10), 7)), 'November 2026');
});

test('salary landing creates next budget with the same split, and closes the last one', () => {
  const cycle = resolveCycle(ts(2026, 11, 30), 31, [salary(2026, 10, 31), salary(2026, 11, 30)]);
  assert.strictEqual(cyclePeriodLabel(cycle), 'December 2026');
  const plan = planSalaryCycleRenewal([novBudget, novFood], cycle);
  assert.ok(plan.create);
  assert.strictEqual(plan.create!.period, 'December 2026');
  assert.strictEqual(plan.create!.name, 'Monthly budget (December 2026)');
  assert.strictEqual(plan.create!.startDate, mid(2026, 11, 30));
  assert.strictEqual(plan.create!.endDate, mid(2026, 12, 31) - 1);
  assert.deepStrictEqual(plan.create!.children.map((c) => c.id), ['nov_food']);
  // November already ends the day before; nothing to change.
  assert.deepStrictEqual(plan.updates, []);
});

test('early salary trims last budget and starts the new one that day', () => {
  const cycle = resolveCycle(ts(2026, 11, 28), 31, [salary(2026, 10, 31), salary(2026, 11, 27)]);
  const plan = planSalaryCycleRenewal([novBudget, novFood], cycle);
  assert.strictEqual(plan.create!.startDate, mid(2026, 11, 27));
  const ends = plan.updates.map((u) => [u.id, u.endDate]);
  assert.deepStrictEqual(ends, [['nov', mid(2026, 11, 27) - 1], ['nov_food', mid(2026, 11, 27) - 1]]);
});

test('late salary stretches the current budget instead of starting a new one', () => {
  const credits = [salary(2026, 9, 30), salary(2026, 10, 31)];
  // Due Mon 30 Nov. On 2 Dec it's 2 days over: still "due" (a bank holiday could explain it).
  const cycle = resolveCycle(ts(2026, 12, 2), 31, credits);
  assert.strictEqual(cycle.lateDays, 0);
  assert.strictEqual(cycle.daysLeft, 0);
  const plan = planSalaryCycleRenewal([novBudget, novFood], cycle);
  assert.strictEqual(plan.create, null);
  assert.deepStrictEqual(plan.updates.map((u) => u.id), ['nov', 'nov_food']);
  assert.strictEqual(plan.updates[0].endDate, mid(2026, 12, 3) - 1);
  // On 3 Dec it is properly late.
  assert.strictEqual(resolveCycle(ts(2026, 12, 3), 31, credits).lateDays, 3);
});

test('custom budget name is kept; paused or long-abandoned budgets are not renewed', () => {
  const cycle = resolveCycle(ts(2026, 11, 30), 31, [salary(2026, 11, 30)]);
  const named = planSalaryCycleRenewal([{ ...novBudget, name: 'Household' }], cycle);
  assert.strictEqual(named.create!.name, 'Household');
  assert.strictEqual(planSalaryCycleRenewal([{ ...novBudget, isPaused: true }], cycle).create, null);
  const old = { ...novBudget, period: 'June 2026', startDate: mid(2026, 5, 31), endDate: mid(2026, 6, 30) - 1 };
  assert.strictEqual(planSalaryCycleRenewal([old], cycle).create, null);
});

test('an existing budget for this cycle is reshaped, not duplicated', () => {
  // Made in calendar mode for 1–30 Nov, then the user switched to salary on the 31st.
  const calendarNov = { ...novBudget, startDate: mid(2026, 11, 1), endDate: mid(2026, 12, 1) - 1 };
  const cycle = resolveCycle(ts(2026, 11, 10), 31, [salary(2026, 10, 31)]);
  const plan = planSalaryCycleRenewal([calendarNov], cycle);
  assert.strictEqual(plan.create, null);
  assert.deepStrictEqual(plan.updates, [{ id: 'nov', startDate: mid(2026, 10, 31), endDate: mid(2026, 11, 30) - 1 }]);
});
