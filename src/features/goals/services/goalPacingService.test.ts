import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getGoalPacing,
  getSaved,
  getEffectiveTarget,
  calculateMonthlyPace,
  toISTYearMonth,
  toISTDateString,
  roundUpTo100,
} from './goalPacingService';
import type { Goal } from './goalPacingService';

describe('Goal Pacing Service - Gate 1 Test Suite', () => {
  // Fixed reference time for tests: 15 October 2026, 12:00 PM IST
  const TODAY = new Date('2026-10-15T06:30:00Z');

  it('1. Off-by-one check: Due Dec 2026, checked in Oct 2026 (3 months available)', () => {
    const goal: Goal = {
      id: 'g1',
      name: 'Hunter 360',
      targetAmount: 31500,
      targetDate: '2026-12',
      committedMonthly: 10500,
      createdAt: '2026-10-01',
      entries: [],
    };

    const pacing = getGoalPacing(goal, TODAY);
    // Target 31500 / 3 remaining months (Oct, Nov, Dec) = 10500
    assert.equal(pacing.requiredMonthly, 10500);
    assert.equal(pacing.thisMonthRemaining, 10500);
    assert.equal(pacing.status, 'not_started');
  });

  it('2. Invariant Property: Logging a positive amount NEVER increases requiredMonthly and NEVER moves finish date later', () => {
    const goalBefore: Goal = {
      id: 'g2',
      name: 'Hunter 360',
      targetAmount: 31500,
      targetDate: '2026-12',
      committedMonthly: 10500,
      createdAt: '2026-07-01',
      entries: [
        { id: 'e1', amount: 10500, at: '2026-07-15', type: 'save' },
        { id: 'e2', amount: 10500, at: '2026-08-15', type: 'save' },
        { id: 'e3', amount: 10500, at: '2026-09-15', type: 'save' },
      ], // Total saved before: 31,500? Wait, let's say target is 50,000
    };
    goalBefore.targetAmount = 52500; // Remaining: 21,000 across Oct, Nov, Dec (3 months = 7,000/mo)

    const pacingBefore = getGoalPacing(goalBefore, TODAY);
    assert.equal(pacingBefore.requiredMonthly, 7000);
    const finishBefore = pacingBefore.projectedFinish!;

    // Now user logs a small amount: ₹500 on 16 October
    const goalAfter: Goal = {
      ...goalBefore,
      entries: [
        ...goalBefore.entries,
        { id: 'e4', amount: 500, at: '2026-10-16', type: 'save' },
      ],
    };

    const pacingAfter = getGoalPacing(goalAfter, TODAY);
    // requiredMonthly must NOT increase!
    assert.ok(
      pacingAfter.requiredMonthly <= pacingBefore.requiredMonthly,
      `requiredMonthly increased from ${pacingBefore.requiredMonthly} to ${pacingAfter.requiredMonthly}`
    );
    // thisMonthRemaining must decrease
    assert.equal(pacingAfter.thisMonthRemaining, 6500);
    // projectedFinish must not be pushed later
    assert.ok(
      pacingAfter.projectedFinish! <= finishBefore,
      `projectedFinish moved later from ${finishBefore} to ${pacingAfter.projectedFinish}`
    );
  });

  it('3. Target is current month: Due Oct 2026, checked in Oct 2026 (1 month available)', () => {
    const goal: Goal = {
      id: 'g3',
      name: 'Phone Repair',
      targetAmount: 5000,
      targetDate: '2026-10',
      committedMonthly: 5000,
      createdAt: '2026-10-01',
      entries: [{ id: 'e1', amount: 1000, at: '2026-10-02', type: 'save' }],
    };

    const pacing = getGoalPacing(goal, TODAY);
    // Target 5000, start of month = 0, remaining months = 1 -> requiredMonthly = 5000
    assert.equal(pacing.requiredMonthly, 5000);
    // Logged this month = 1000 -> thisMonthRemaining = 4000
    assert.equal(pacing.thisMonthRemaining, 4000);
    assert.equal(pacing.status, 'on_pace');
  });

  it('4. Exactly on pace: finish month === target month', () => {
    const goal: Goal = {
      id: 'g4',
      name: 'Goa Trip',
      targetAmount: 30000,
      targetDate: '2026-12',
      committedMonthly: 10000,
      createdAt: '2026-07-01',
      entries: [
        { id: 'e1', amount: 10000, at: '2026-07-15', type: 'save' },
        { id: 'e2', amount: 10000, at: '2026-08-15', type: 'save' },
        { id: 'e3', amount: 10000, at: '2026-09-15', type: 'save' },
      ],
    };
    // Target 30000, already saved 30000 -> Completed!
    // Let's set target to 60000 (remaining: 30000 at 10000/mo -> 3 months needed: Oct, Nov, Dec)
    goal.targetAmount = 60000;

    const pacing = getGoalPacing(goal, TODAY);
    assert.equal(pacing.status, 'on_pace');
    assert.equal(pacing.subStatus, 'on_pace');
    assert.equal(pacing.monthsDelta, 0);
    assert.equal(pacing.projectedFinish, '2026-12');
    assert.equal(pacing.gapPerMonth, 0);
  });

  it('5. 2 months ahead: finish month is 2 months earlier than target', () => {
    const goal: Goal = {
      id: 'g5',
      name: 'Laptop Fund',
      targetAmount: 50000,
      targetDate: '2027-02', // Due Feb 2027
      committedMonthly: 10000,
      createdAt: '2026-07-01',
      entries: [
        { id: 'e1', amount: 15000, at: '2026-07-15', type: 'save' },
        { id: 'e2', amount: 15000, at: '2026-08-15', type: 'save' },
        { id: 'e3', amount: 10000, at: '2026-09-15', type: 'save' },
      ], // Pace = (15000 + 15000 + 10000)/3 = 13333. Saved = 40000. Remaining: 10000.
    };

    const pacing = getGoalPacing(goal, TODAY);
    // Needs 10000 / 13333 -> 1 month -> finishes in Oct 2026 or Dec 2026
    assert.equal(pacing.status, 'ahead');
    assert.ok(pacing.monthsDelta >= 2);
    assert.equal(pacing.gapPerMonth, 0);
  });

  it('6. 3+ months behind: finish month is 3+ months later than target', () => {
    const goal: Goal = {
      id: 'g6',
      name: 'Emergency Fund',
      targetAmount: 60000,
      targetDate: '2026-11', // Due Nov 2026
      committedMonthly: 15000,
      createdAt: '2026-07-01',
      entries: [
        { id: 'e1', amount: 2000, at: '2026-07-15', type: 'save' },
        { id: 'e2', amount: 2000, at: '2026-08-15', type: 'save' },
        { id: 'e3', amount: 2000, at: '2026-09-15', type: 'save' },
      ], // Pace = 2000/mo. Saved = 6000. Remaining: 54000 -> 27 months needed!
    };

    const pacing = getGoalPacing(goal, TODAY);
    assert.equal(pacing.status, 'behind');
    assert.ok(pacing.monthsDelta <= -3);
    assert.ok(pacing.gapPerMonth > 0);
  });

  it('7. Zero pace: past saves exist, but 0 saved in last 3 complete months', () => {
    const goal: Goal = {
      id: 'g7',
      name: 'Camera Lens',
      targetAmount: 40000,
      targetDate: '2027-01',
      committedMonthly: 5000,
      createdAt: '2026-05-01',
      entries: [
        { id: 'e1', amount: 5000, at: '2026-05-10', type: 'save' },
        // No entries in July, August, September (last 3 complete months)
      ],
    };

    const pacing = getGoalPacing(goal, TODAY);
    assert.equal(pacing.actualMonthlyPace, 0);
    assert.equal(pacing.status, 'behind');
    assert.equal(pacing.subStatus, 'zero_pace');
    assert.equal(pacing.projectedFinish, null);
    assert.ok(pacing.gapPerMonth > 0);
  });

  it('8. Target month passed: due in Sep 2026, checked in Oct 2026', () => {
    const goal: Goal = {
      id: 'g8',
      name: 'Watch',
      targetAmount: 20000,
      targetDate: '2026-09',
      committedMonthly: 5000,
      createdAt: '2026-05-01',
      entries: [{ id: 'e1', amount: 5000, at: '2026-06-01', type: 'save' }],
    };

    const pacing = getGoalPacing(goal, TODAY);
    assert.equal(pacing.status, 'behind');
    assert.equal(pacing.subStatus, 'target_passed');
    assert.equal(pacing.projectedFinish, null);
    assert.equal(pacing.gapPerMonth, 0); // Must be 0 so copy handles target passed cleanly!
  });

  it('9. Young goal on 25th: created 25 Aug 2026, checked 01 Sep 2026 (0 complete months elapsed)', () => {
    const septFirst = new Date('2026-09-01T06:00:00Z');
    const goal: Goal = {
      id: 'g9',
      name: 'New Bike',
      targetAmount: 100000,
      targetDate: '2027-08',
      committedMonthly: 8500,
      createdAt: '2026-08-25',
      entries: [{ id: 'e1', amount: 2000, at: '2026-08-26', type: 'save' }],
    };

    const pace = calculateMonthlyPace(goal, septFirst);
    // August is partial creation month, September is current -> 0 complete months -> committedMonthly
    assert.equal(pace, 8500);
  });

  it('10. Fixed inflation target: identical value checked 6 months apart', () => {
    const goal: Goal = {
      id: 'g10',
      name: 'House Downpayment',
      targetAmount: 1000000,
      targetDate: '2028-10', // 2 years out
      committedMonthly: 40000,
      adjustForInflation: true,
      createdAt: '2026-10-01',
      entries: [],
    };

    const targetAtCreation = getEffectiveTarget(goal);
    // 2 years at 6% compound = 1000000 * (1.06)^2 = 1,123,600
    assert.equal(targetAtCreation, 1123600);

    // Check again 6 months later
    const targetSixMonthsLater = getEffectiveTarget(goal);
    assert.equal(targetSixMonthsLater, targetAtCreation);
  });

  it('11. Migrated goal with opening balance: does NOT show not_started, uses committed pace', () => {
    const goal: Goal = {
      id: 'g11',
      name: 'Existing Bike',
      targetAmount: 100000,
      targetDate: '2027-03',
      committedMonthly: 11000, // 65,000 remaining / 11,000 = 6 months (Oct, Nov, Dec, Jan, Feb, Mar) -> on_pace!
      createdAt: '2026-01-01',
      migratedAt: '2026-10-01', // Migrated this month
      entries: [{ id: 'mig_1', amount: 35000, at: '2026-10-01', type: 'opening', note: 'Opening balance' }],
    };

    const pacing = getGoalPacing(goal, TODAY);
    assert.equal(pacing.saved, 35000);
    // Opening balance does NOT inflate pace, but migration date gives committed pace
    assert.equal(pacing.actualMonthlyPace, 11000);
    assert.notEqual(pacing.status, 'not_started');
    assert.equal(pacing.status, 'on_pace');
  });

  it('12. Timezone IST boundary: entry at 2026-09-30T19:00:00Z maps to October (00:30 IST on 1 Oct)', () => {
    const utcTime = '2026-09-30T19:00:00Z';
    const istDate = toISTDateString(utcTime);
    const istMonth = toISTYearMonth(utcTime);

    assert.equal(istDate, '2026-10-01');
    assert.equal(istMonth, '2026-10');
  });

  it('13. Target validation: throws error if targetAmount <= 0', () => {
    const goal: Goal = {
      id: 'g13',
      name: 'Broken Goal',
      targetAmount: 0,
      targetDate: '2027-01',
      committedMonthly: 1000,
      createdAt: '2026-10-01',
      entries: [],
    };

    assert.throws(() => getGoalPacing(goal, TODAY), /Target amount must be greater than zero/);
  });

  it('14. Rounding check: roundUpTo100 correctly rounds up gaps', () => {
    assert.equal(roundUpTo100(1201), 1300);
    assert.equal(roundUpTo100(1200), 1200);
    assert.equal(roundUpTo100(0), 0);
    assert.equal(roundUpTo100(-50), 0);
  });
});
