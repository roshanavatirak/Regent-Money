import { upcomingEmiRisks } from './signals.service';
import { renderTemplate, TEMPLATE_BANK } from './signal-templates';

const ist = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h) - 5.5 * 60 * 60 * 1000;
const emi = (m: number, d: number, extra: object = {}) => ({
  merchant: 'Bajaj Finance',
  category: 'emi_loans',
  amount: 6200,
  timestamp: ist(2026, m, d),
  bankProfileId: 'sbi',
  ...extra,
});
const banks = (sbi: number) => [
  { id: 'sbi', currentBalance: sbi, accountType: 'Savings' },
  { id: 'hdfc', currentBalance: 50000, accountType: 'Savings' },
];

describe('upcomingEmiRisks', () => {
  it('warns 3 days before an EMI the paying account cannot cover', () => {
    const risks = upcomingEmiRisks([emi(9, 5), emi(10, 5)], banks(4100), ist(2026, 11, 2));
    expect(risks).toEqual([{ merchant: 'Bajaj Finance', amount: 6200, daysLeft: 3, balance: 4100, shortBy: 2100 }]);
  });

  it('stays quiet when the account has enough', () => {
    expect(upcomingEmiRisks([emi(9, 5), emi(10, 5)], banks(9000), ist(2026, 11, 2))).toEqual([]);
  });

  it('stays quiet more than 3 days out', () => {
    expect(upcomingEmiRisks([emi(9, 5), emi(10, 5)], banks(100), ist(2026, 10, 28))).toEqual([]);
  });

  it('stays quiet once this month’s EMI is paid', () => {
    expect(upcomingEmiRisks([emi(9, 5), emi(10, 5), emi(11, 1)], banks(100), ist(2026, 11, 3))).toEqual([]);
  });

  it('needs two months of history and ignores non-EMI spending', () => {
    expect(upcomingEmiRisks([emi(10, 5)], banks(100), ist(2026, 11, 2))).toEqual([]);
    const swiggy = [9, 10].map((m) => emi(m, 5, { merchant: 'Swiggy', category: 'food' }));
    expect(upcomingEmiRisks(swiggy, banks(100), ist(2026, 11, 2))).toEqual([]);
  });

  it('due today counts', () => {
    const [r] = upcomingEmiRisks([emi(9, 5), emi(10, 5)], banks(1000), ist(2026, 11, 5, 8));
    expect(r.daysLeft).toBe(0);
  });
});

describe('bill_risk templates', () => {
  it('render with no placeholders left', () => {
    for (const t of TEMPLATE_BANK.bill_risk) {
      const out = renderTemplate(t, { merchant: 'Bajaj Finance', amount: 6200, runwayAmount: 4100, gap: 2100, dueWhen: 'in 3 days' });
      expect(out.title + out.body).not.toMatch(/\{/);
      expect(out.body).toContain('₹2,100');
    }
  });
});
