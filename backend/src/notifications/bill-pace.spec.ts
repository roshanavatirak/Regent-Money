import { billAwarePace, detectBills } from './bill-pace';

const ist = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h) - 5.5 * 60 * 60 * 1000;
const tx = (merchant: string, amount: number, y: number, m: number, d: number, category = '') => ({
  merchant,
  amount,
  category,
  type: 'debit',
  timestamp: ist(y, m, d),
});

const history = [
  tx('Landlord Sharma', 15000, 2026, 8, 1, 'rent'),
  tx('Landlord Sharma', 15000, 2026, 9, 1, 'rent'),
  tx('Landlord Sharma', 15000, 2026, 10, 1, 'rent'),
  tx('Bajaj Finance', 6200, 2026, 9, 5, 'emi_loans'),
  tx('Bajaj Finance', 6200, 2026, 10, 5, 'emi_loans'),
  ...[3, 9, 15, 22].flatMap((d) => [tx('Swiggy', 400, 2026, 9, d, 'food'), tx('Swiggy', 380, 2026, 10, d, 'food')]),
];

describe('detectBills', () => {
  it('finds rent and EMI, not food delivery', () => {
    const bills = detectBills(history, ist(2026, 10, 25));
    expect(bills.map((b) => b.key).sort()).toEqual(['bajaj finance', 'landlord sharma']);
    expect(bills.find((b) => b.key === 'landlord sharma')!.dueDay).toBe(1);
  });
});

describe('billAwarePace', () => {
  it('rent and EMI on day 6 are on track, not a burnout', () => {
    const now = ist(2026, 11, 6);
    const txs = [...history, tx('Landlord Sharma', 15000, 2026, 11, 1, 'rent'), tx('Bajaj Finance', 6200, 2026, 11, 5, 'emi_loans')];
    const bills = detectBills(txs, now);
    const p = billAwarePace(40000, 15000 + 6200 + 1800, ist(2026, 11, 1, 0), ist(2026, 12, 1, 0) - 1, now, bills, txs);
    expect(p.billsTotal).toBe(21200);
    expect(p.billsUnpaid).toBe(0);
    expect(p.everydayPerDay).toBe(300);
    expect(p.projectedSpend).toBeLessThan(40000);
    // Spreading evenly would have said 23,000 in 6 days → 115,000 for the month.
    expect((23000 / 6) * 30).toBeGreaterThan(40000);
  });

  it('still warns when everyday spending really is too fast', () => {
    const now = ist(2026, 11, 6);
    const txs = [...history, tx('Landlord Sharma', 15000, 2026, 11, 1, 'rent')];
    const bills = detectBills(txs, now);
    const p = billAwarePace(30000, 15000 + 9000, ist(2026, 11, 1, 0), ist(2026, 12, 1, 0) - 1, now, bills, txs);
    expect(p.billsUnpaid).toBe(6200);
    expect(p.projectedSpend).toBeGreaterThan(30000);
  });
});
