import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { migrateGoalsV1toV2 } from './goalsMigration';
import { getSaved } from './goalPacingService';

describe('Goals Store Migration (v1 to v2)', () => {
  const TODAY = new Date('2026-10-15T12:00:00Z');

  it('1. Migrates legacy goal with currentAmount: 45000 to an opening entry without balance loss', () => {
    const legacyGoals = [
      {
        id: 'legacy_1',
        name: 'Royal Enfield',
        targetAmount: 250000,
        currentAmount: 45000,
        targetDate: '2027-10',
        createdAt: '2026-06-01',
      },
    ];

    const migrated = migrateGoalsV1toV2(legacyGoals, TODAY);
    assert.equal(migrated.length, 1);
    const g = migrated[0];

    // Preserves balance via getSaved
    assert.equal(getSaved(g), 45000);
    assert.equal(g.entries.length, 1);
    assert.equal(g.entries[0].type, 'opening');
    assert.equal(g.entries[0].amount, 45000);
    assert.equal(g.entries[0].note, 'Opening balance');

    // Populates committedMonthly from target and duration
    assert.ok(g.committedMonthly > 0);

    // Backward-compatible currentAmount matches getSaved
    assert.equal(g.currentAmount, 45000);
  });

  it('2. Does not duplicate opening entry if goal already has entries', () => {
    const modernGoal = [
      {
        id: 'modern_1',
        name: 'Japan Trip',
        targetAmount: 150000,
        committedMonthly: 10000,
        targetDate: '2027-08',
        entries: [{ id: 'e1', amount: 20000, at: '2026-09-01', type: 'save' }],
      },
    ];

    const migrated = migrateGoalsV1toV2(modernGoal, TODAY);
    assert.equal(migrated[0].entries.length, 1);
    assert.equal(migrated[0].entries[0].id, 'e1');
  });
});
