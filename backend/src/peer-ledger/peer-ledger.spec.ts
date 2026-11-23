import { ConflictException } from '@nestjs/common';
import { validateLedger, MAX_LEDGER_BYTES } from './peer-ledger.validate';
import { PeerLedgerService, firstRow } from './peer-ledger.service';

describe('validateLedger', () => {
  it('accepts the expected shape and fills missing lists', () => {
    const r = validateLedger({ contacts: [{ id: 'c1', displayName: 'Gauri' }], entries: [] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc).toEqual({ contacts: [{ id: 'c1', displayName: 'Gauri' }], entries: [], storedAllocations: [], tombstones: [] });
  });

  it('refuses the wrong shape, items without ids, and oversized ledgers', () => {
    expect(validateLedger(null).ok).toBe(false);
    expect(validateLedger({ contacts: 'x' }).ok).toBe(false);
    expect(validateLedger({ entries: [{ amount: 5 }] }).ok).toBe(false);
    const big = Array.from({ length: 2000 }, (_, i) => ({ id: `c${i}`, note: 'x'.repeat(800) }));
    expect(validateLedger({ contacts: big }).ok).toBe(false);
    expect(MAX_LEDGER_BYTES).toBeLessThan(2_000_000); // under the 2 MB request limit
  });
});

describe('firstRow', () => {
  it('reads INSERT and UPDATE results', () => {
    expect(firstRow([{ version: 1 }])).toEqual({ version: 1 });
    expect(firstRow([[{ version: 4 }], 1])).toEqual({ version: 4 });
    expect(firstRow([[], 0])).toBeUndefined();
    expect(firstRow([])).toBeUndefined();
  });
});

describe('PeerLedgerService', () => {
  const cipher = {
    encryptText: jest.fn(async (_u, _t, _c, _r, text: string) => Buffer.from(text)),
    decryptText: jest.fn(async (_u, _t, _c, _r, env: Buffer) => env.toString()),
  };

  it('saves when the version matches, refuses with the current copy when it does not', async () => {
    let stored: { enc: Buffer; version: number } | null = null;
    const ds = {
      query: jest.fn(async (sql: string, params: any[]) => {
        if (sql.includes('SELECT')) return stored ? [{ enc_data: stored.enc, version: stored.version, updated_at: 1 }] : [];
        if (sql.includes('INSERT')) {
          if (stored) return [];
          stored = { enc: params[1], version: 1 };
          return [{ version: 1 }];
        }
        if (sql.includes('UPDATE')) {
          if (!stored || stored.version !== params[4]) return [[], 0];
          stored = { enc: params[1], version: params[2] };
          return [[{ version: params[2] }], 1];
        }
        return [];
      }),
    };
    const svc = new PeerLedgerService(ds as any, cipher as any);
    const data = { contacts: [{ id: 'c1' }], entries: [], storedAllocations: [], tombstones: [] };

    expect((await svc.get('u1')).version).toBe(0);
    expect((await svc.save('u1', { data, baseVersion: 0 })).version).toBe(1);
    expect((await svc.save('u1', { data, baseVersion: 1 })).version).toBe(2);
    // A second phone still on version 1:
    await expect(svc.save('u1', { data, baseVersion: 1 })).rejects.toBeInstanceOf(ConflictException);
    expect((await svc.get('u1')).data).toEqual(data);
  });
});
