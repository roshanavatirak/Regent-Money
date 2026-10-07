import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getGoalCardCopy } from './goalNudgeTemplates';
import type { GoalPacing, GoalSubStatus } from './goalPacingService';

describe('Goal Nudge Templates & Copy Tests', () => {
  const BANNED_WORDS_REGEX = /\b(deposit|add money|critical|lag|fail|feasibility|net worth)\b/i;

  const samplePacing = (subStatus: GoalSubStatus): GoalPacing => ({
    saved: 15000,
    savedAtStartOfMonth: 15000,
    loggedThisMonth: 0,
    thisMonthRemaining: 5000,
    effectiveTarget: 50000,
    pctSaved: 30,
    requiredMonthly: 5000,
    actualMonthlyPace: 4000,
    projectedFinish: '2027-05',
    monthsDelta: subStatus === 'ahead' ? 2 : subStatus === 'slightly_behind' ? -1 : 0,
    status: subStatus === 'completed' ? 'completed' : subStatus === 'not_started' ? 'not_started' : 'behind',
    subStatus,
    gapPerMonth: 1200,
  });

  const allSubStatuses: GoalSubStatus[] = [
    'completed',
    'not_started',
    'target_passed',
    'zero_pace',
    'ahead',
    'on_pace',
    'slightly_behind',
    'behind',
  ];

  it('1. Generates valid non-empty copy for every one of the 8 sub-statuses', () => {
    for (const sub of allSubStatuses) {
      const copy = getGoalCardCopy(samplePacing(sub));
      assert.ok(copy.statusText.length > 5, `Empty copy for ${sub}`);
      assert.ok(copy.primaryActionLabel.length > 3, `Missing primary action for ${sub}`);
      assert.ok(['green', 'amber', 'grey', 'gold'].includes(copy.statusDot));
    }
  });

  it('2. Zero banned words across all template outputs', () => {
    for (const sub of allSubStatuses) {
      const copy = getGoalCardCopy(samplePacing(sub));
      const fullText = `${copy.statusText} ${copy.primaryActionLabel} ${copy.secondaryActionLabel || ''}`;
      const match = fullText.match(BANNED_WORDS_REGEX);
      assert.equal(
        match,
        null,
        `Found banned word "${match?.[0]}" in template for subStatus "${sub}": "${fullText}"`
      );
    }
  });

  it('3. Actions say "Log savings", never "Deposit"', () => {
    const copy = getGoalCardCopy(samplePacing('on_pace'));
    assert.equal(copy.primaryActionLabel, 'Log savings');
    assert.ok(!copy.primaryActionLabel.toLowerCase().includes('deposit'));
  });
});
