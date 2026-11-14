import { CASH_WITHDRAWAL_KEYS, planCashTopups, reconcileCashTopups, TopupEntry } from './cash-wallet-topups';

interface Tx {
  id: string;
  amount: number | null;
  category: string;
  timestamp: number;
  bankProfileId: string;
  rowVersion: number;
  isDeleted?: boolean;
}

/** A tiny in-memory stand-in for the three tables the reconcile touches. */
function fakeDb(opts: { hasCash?: boolean; since?: number | null; balance?: number } = {}) {
  const state = {
    cash: opts.hasCash === false ? null : { id: 'cash_u1', since: opts.since ?? null, balance: opts.balance ?? 0 },
    txs: [] as Tx[],
    ledger: new Map<string, { amount: number; rowVersion: string }>(),
    locks: 0,
  };
  const norm = (c: string) => c.toLowerCase().trim().replace(/[\s-]+/g, '_');
  const m = {
    query: async (sql: string, p: any[] = []): Promise<any[]> => {
      if (sql.includes('pg_advisory_xact_lock')) {
        state.locks++;
        return [];
      }
      if (sql.includes('SELECT id, cash_tracking_since')) {
        return state.cash ? [{ id: state.cash.id, cash_tracking_since: state.cash.since }] : [];
      }
      if (sql.includes('SET cash_tracking_since')) {
        if (state.cash && state.cash.since == null) state.cash.since = p[2];
        return [];
      }
      if (sql.includes('FROM finance.transactions')) {
        const [, since, cashId, keys] = p;
        return state.txs
          .filter((t) => !t.isDeleted && t.timestamp >= since && t.bankProfileId !== cashId && keys.includes(norm(t.category)))
          .map((t) => ({ id: t.id, amount: t.amount, enc_amount: t.amount == null ? 'enc' : null, enc_text: null, row_version: String(t.rowVersion) }));
      }
      if (sql.includes('SELECT transaction_id')) {
        return [...state.ledger].map(([id, v]) => ({ transaction_id: id, amount: String(v.amount), row_version: v.rowVersion }));
      }
      if (sql.startsWith('DELETE FROM finance.cash_wallet_topups')) {
        state.ledger.delete(p[0]);
        return [];
      }
      if (sql.includes('INSERT INTO finance.cash_wallet_topups')) {
        state.ledger.set(p[0], { amount: p[2], rowVersion: p[3] });
        return [];
      }
      if (sql.includes('SET current_balance')) {
        if (state.cash && p[0] === state.cash.id) state.cash.balance = Math.round((state.cash.balance + p[2]) * 100) / 100;
        return [];
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  return { state, m };
}

/** Plain amounts are read directly; null ones stand for a row that can't be decrypted. */
const readAmount = async (row: any) => (row.amount == null ? null : Math.abs(Number(row.amount)));

const T0 = 1_800_000_000_000;
const atm = (id: string, amount: number | null, extra: Partial<Tx> = {}): Tx => ({
  id,
  amount,
  category: 'cash_withdrawals',
  timestamp: T0 + 1000,
  bankProfileId: 'hdfc_1',
  rowVersion: 1,
  ...extra,
});

describe('reconcileCashTopups', () => {
  it('starts tracking on the first run and does not add older withdrawals', async () => {
    const { state, m } = fakeDb({ since: null, balance: 500 });
    state.txs.push(atm('old', 2000, { timestamp: T0 - 86_400_000 }));
    expect(await reconcileCashTopups(m, 'u1', readAmount, T0)).toBe(0);
    expect(state.cash!.since).toBe(T0);
    expect(state.cash!.balance).toBe(500);
  });

  it('adds a tagged withdrawal once, however many times it runs', async () => {
    const { state, m } = fakeDb({ since: T0, balance: 500 });
    state.txs.push(atm('w1', 2000));
    expect(await reconcileCashTopups(m, 'u1', readAmount, T0 + 5000)).toBe(2000);
    expect(await reconcileCashTopups(m, 'u1', readAmount, T0 + 6000)).toBe(0);
    expect(await reconcileCashTopups(m, 'u1', readAmount, T0 + 7000)).toBe(0);
    expect(state.cash!.balance).toBe(2500);
    expect(state.locks).toBe(3);
  });

  it('moves by the difference when the amount is edited', async () => {
    const { state, m } = fakeDb({ since: T0, balance: 0 });
    const w = atm('w1', 2000);
    state.txs.push(w);
    await reconcileCashTopups(m, 'u1', readAmount, T0 + 5000);
    Object.assign(w, { amount: 1500, rowVersion: 2 });
    expect(await reconcileCashTopups(m, 'u1', readAmount, T0 + 6000)).toBe(-500);
    expect(state.cash!.balance).toBe(1500);
  });

  it('takes the cash back off when the tag is removed or the withdrawal deleted', async () => {
    const { state, m } = fakeDb({ since: T0, balance: 0 });
    const a = atm('a', 2000);
    const b = atm('b', 500);
    state.txs.push(a, b);
    await reconcileCashTopups(m, 'u1', readAmount, T0 + 5000);
    expect(state.cash!.balance).toBe(2500);

    a.category = 'money_transfer'; // untagged
    b.isDeleted = true; // deleted
    expect(await reconcileCashTopups(m, 'u1', readAmount, T0 + 6000)).toBe(-2500);
    expect(state.cash!.balance).toBe(0);
    expect(state.ledger.size).toBe(0);
  });

  it('matches every name a cash withdrawal may be stored under', async () => {
    const { state, m } = fakeDb({ since: T0, balance: 0 });
    state.txs.push(atm('a', 100, { category: 'ATM' }), atm('b', 200, { category: 'Cash withdrawal' }), atm('c', 300, { category: 'food' }));
    expect(await reconcileCashTopups(m, 'u1', readAmount, T0 + 5000)).toBe(300);
    expect(CASH_WITHDRAWAL_KEYS).toContain('atm');
  });

  it('ignores a withdrawal saved on the Cash account itself', async () => {
    const { state, m } = fakeDb({ since: T0, balance: 0 });
    state.txs.push(atm('w1', 2000, { bankProfileId: 'cash_u1' }));
    expect(await reconcileCashTopups(m, 'u1', readAmount, T0 + 5000)).toBe(0);
  });

  it('never takes cash off because an amount could not be read', async () => {
    const { state, m } = fakeDb({ since: T0, balance: 0 });
    const w = atm('w1', 2000);
    state.txs.push(w);
    await reconcileCashTopups(m, 'u1', readAmount, T0 + 5000);
    Object.assign(w, { amount: null, rowVersion: 2 }); // edited, and now unreadable
    expect(await reconcileCashTopups(m, 'u1', readAmount, T0 + 6000)).toBe(0);
    expect(state.cash!.balance).toBe(2000);
    // A new withdrawal that can't be read yet is not added until it can be
    state.txs.push(atm('w2', null));
    expect(await reconcileCashTopups(m, 'u1', readAmount, T0 + 7000)).toBe(0);
  });

  it('does nothing for a user without a Cash wallet', async () => {
    const { state, m } = fakeDb({ hasCash: false });
    state.txs.push(atm('w1', 2000));
    expect(await reconcileCashTopups(m, 'u1', readAmount, T0)).toBe(0);
    expect(state.ledger.size).toBe(0);
  });
});

describe('planCashTopups', () => {
  const e = (amount: number, rowVersion = '1'): TopupEntry => ({ amount, rowVersion });

  it('adds new, adjusts changed, removes gone and leaves unreadable ones alone', () => {
    const desired = new Map([['new', e(100)], ['same', e(50)], ['edited', e(80, '2')]]);
    const applied = new Map([['same', e(50)], ['edited', e(100)], ['gone', e(30)], ['unreadable', e(70)]]);
    const plan = planCashTopups(desired, applied, new Set(['unreadable']));
    expect(plan.delta).toBe(100 - 20 - 30);
    expect(plan.upserts.map((u) => u.id).sort()).toEqual(['edited', 'new']);
    expect(plan.deletes).toEqual(['gone']);
  });

  it('keeps paise exact', () => {
    const plan = planCashTopups(new Map([['a', e(0.1)], ['b', e(0.2)]]), new Map());
    expect(plan.delta).toBe(0.3);
  });
});
