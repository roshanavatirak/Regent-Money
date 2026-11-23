import { cleanMoneyCycleData, parseMoneyCycleData } from './money-cycle-data';

describe('cleanMoneyCycleData', () => {
  const now = Date.now();

  it('keeps valid costs and marks', () => {
    const out = cleanMoneyCycleData({
      updatedAt: now,
      yearlyCosts: [{ id: 'yc_1', name: 'School fees', amount: 40000, month: 5, category: 'education' }],
      salaryMarks: [now - 86_400_000],
    });
    expect(out).toEqual({
      updatedAt: now,
      yearlyCosts: [{ id: 'yc_1', name: 'School fees', amount: 40000, month: 5, category: 'education' }],
      salaryMarks: [now - 86_400_000],
    });
  });

  it('drops bad entries and caps sizes', () => {
    const out = cleanMoneyCycleData({
      updatedAt: now,
      yearlyCosts: [
        { id: 'a', name: 'Ok', amount: 100, month: 0 },
        { id: 'b', name: 'Bad month', amount: 100, month: 12 },
        { id: 'c', name: '', amount: 100, month: 1 },
        { id: 'd', name: 'Negative', amount: -5, month: 1 },
        ...Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, name: 'n'.repeat(80), amount: 1, month: 1 })),
      ],
      salaryMarks: [...Array.from({ length: 50 }, (_, i) => now - i * 1000), 'soon', 12],
    })!;
    expect(out.yearlyCosts[0]).toEqual({ id: 'a', name: 'Ok', amount: 100, month: 0, category: null });
    expect(out.yearlyCosts.every((c) => c.name.length <= 40)).toBe(true);
    expect(out.yearlyCosts.length).toBeLessThanOrEqual(20);
    expect(out.salaryMarks.length).toBe(36);
  });

  it('rejects input with no valid timestamp', () => {
    expect(cleanMoneyCycleData({ yearlyCosts: [] })).toBeNull();
    expect(cleanMoneyCycleData({ updatedAt: now + 10 * 86_400_000 })).toBeNull();
    expect(cleanMoneyCycleData('x')).toBeNull();
    expect(parseMoneyCycleData('{bad')).toBeNull();
  });
});
