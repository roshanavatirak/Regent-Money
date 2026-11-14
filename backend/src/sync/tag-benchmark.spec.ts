jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined, CronExpression: {} }));
jest.mock('pdf.js-extract', () => ({ PDFExtract: class {} }));
jest.mock('../notifications/notifications.service', () => ({ NotificationsService: class {} }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSMS } from './sms-parser.util';
import { predictTag } from './merchant-tag-rules';
import { normalizeScanCategory } from '../ai/ai.service';
import { SyncService } from './sync.service';

// Shared with the app's src/services/tagBenchmark.test.ts
const { cases } = JSON.parse(
  readFileSync(join(__dirname, '../../../src/services/__fixtures__/tag-benchmark-cases.json'), 'utf8'),
) as { cases: Array<{ name: string; expected: string; sender: string; body: string }> };

/** The tag names older code used, as the app shows them. */
const SHOWN_AS: Record<string, string> = { commute: 'transport', bill_payments: 'bills', personal_care: 'personal' };

/** Server pipeline, as in buildSmsLedgerEntity: debits via classifyCategory with the SMS text, credits via the shared rules. */
async function tagOf(sender: string, body: string): Promise<string> {
  const p = parseSMS(sender, body);
  if (!p) return '(not parsed)';
  const tag =
    p.type === 'credit'
      ? predictTag(p.merchant, body, 'credit', !!p.isSalary)
      : await (SyncService.prototype as any).classifyCategory.call({}, p.merchant, undefined, [], body);
  return SHOWN_AS[tag] ?? tag;
}

describe('server auto-tagging benchmark', () => {
  it('stays accurate on the labelled SMS', async () => {
    const misses: string[] = [];
    let wrong = 0;
    for (const c of cases) {
      const got = await tagOf(c.sender, c.body);
      if (got !== c.expected) {
        if (got !== 'miscellaneous') wrong++;
        misses.push(`${c.name}: want ${c.expected}, got ${got}`);
      }
    }
    const accuracy = (cases.length - misses.length) / cases.length;
    expect({ accuracy: accuracy >= 0.95, misses }).toEqual({ accuracy: true, misses: expect.any(Array) });
    expect(wrong / cases.length).toBeLessThanOrEqual(0.02);
  });
});

describe('AI scan categories', () => {
  it('keeps only real tags, mapping the words older prompts used', () => {
    expect(normalizeScanCategory('food')).toBe('food');
    expect(normalizeScanCategory('Groceries')).toBe('groceries');
    expect(normalizeScanCategory('health')).toBe('medical');
    expect(normalizeScanCategory('transfer')).toBe('money_transfer');
    expect(normalizeScanCategory('general')).toBe('miscellaneous');
    expect(normalizeScanCategory('pets')).toBeNull();
    expect(normalizeScanCategory(undefined)).toBeNull();
  });

  it('uses keyword rules first, then the AI, and never a debit tag for money in', async () => {
    const scan = (tx: any) => (SyncService.prototype as any).scanCategory.call(
      { classifyCategory: (SyncService.prototype as any).classifyCategory },
      tx,
      'u1',
      [],
    );
    expect(await scan({ merchant: 'Swiggy', category: 'shopping', type: 'debit' })).toBe('food');
    expect(await scan({ merchant: 'Ramesh Traders', category: 'groceries', type: 'debit' })).toBe('groceries');
    expect(await scan({ merchant: 'Ramesh Traders', category: 'general', type: 'debit' })).toBe('miscellaneous');
    expect(await scan({ merchant: 'Ramesh Traders', category: 'salary', type: 'debit' })).toBe('miscellaneous');
    expect(await scan({ merchant: 'ACME', category: 'food', type: 'credit' })).toBe('money_received');
    expect(await scan({ merchant: 'ACME Salary', category: 'salary', type: 'credit' })).toBe('salary');
  });
});
