jest.mock('pdf.js-extract', () => ({
  PDFExtract: class {
    extract = jest.fn();
  },
}));

jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {
    sendNotification = jest.fn();
    resolveNotification = jest.fn();
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { SyncService, RejectOp } from './sync.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BankProfile } from './entities/bank-profile.entity';
import { Transaction } from './entities/transaction.entity';
import { BudgetDeclaration } from './entities/budget-declaration.entity';
import { SavingsGoal } from './entities/savings-goal.entity';
import { GoalHistory } from './entities/goal-history.entity';
import { NetWorthSnapshot } from './entities/net-worth-snapshot.entity';
import { IncomeRecord } from './entities/income-record.entity';
import { UserMerchantTag } from './entities/user-merchant-tag.entity';
import { BudgetTransactionExclusion } from './entities/budget-exclusion.entity';
import { User } from '../users/entities/user.entity';
import { AiService } from '../ai/ai.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FieldCipherService } from '../crypto/field-cipher.service';

describe('SyncService - Offline Outbox (applyOutbox)', () => {
  let service: SyncService;
  let appliedOps: Map<string, { userId: string; appliedAt: Date }>;
  let mockTransactions: Map<string, any>;
  let mockIncomeRecords: Map<string, any>;
  let mockBankProfiles: Map<string, any>;
  let invalidateCacheCalls: string[];

  beforeEach(async () => {
    appliedOps = new Map();
    mockTransactions = new Map();
    mockIncomeRecords = new Map();
    mockBankProfiles = new Map();
    invalidateCacheCalls = [];

    // Pre-populate bank profile for tests
    mockBankProfiles.set('bank_hdfc_123', {
      id: 'bank_hdfc_123',
      user_id: 'user_A',
    });

    const mockEntityManager = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        const cleanSql = sql.replace(/\s+/g, ' ').trim();

        // 1. applied_ops INSERT
        if (cleanSql.includes('INSERT INTO finance.applied_ops')) {
          const [idemKey, userId] = params;
          if (appliedOps.has(idemKey)) {
            return []; // Conflict: DO NOTHING RETURNING 1 returns empty
          }
          appliedOps.set(idemKey, { userId, appliedAt: new Date() });
          return [{ '?column?': 1 }];
        }

        // 2. Lock row check (SELECT user_id, updated_at FROM ... WHERE id=$1 FOR UPDATE)
        if (cleanSql.includes('FOR UPDATE')) {
          const [id] = params;
          const table = cleanSql.includes('finance.transactions')
            ? mockTransactions
            : mockIncomeRecords;
          const row = table.get(id);
          return row ? [row] : [];
        }

        // 3. Bank profile check
        if (cleanSql.includes('SELECT 1 FROM core.bank_profiles')) {
          const [id, userId] = params;
          const bank = mockBankProfiles.get(id);
          if (bank && bank.user_id === userId) {
            return [{ '?column?': 1 }];
          }
          return [];
        }

        // 4. DELETE (tombstone)
        if (cleanSql.includes('SET is_deleted=true')) {
          const [id, userId, updatedAt, nextVer] = params;
          const table = cleanSql.includes('finance.transactions')
            ? mockTransactions
            : mockIncomeRecords;
          const row = table.get(id);
          if (row && row.user_id === userId) {
            row.is_deleted = true;
            row.updated_at = updatedAt;
            row.row_version = nextVer;
            return [{ '?column?': 1 }];
          }
          return [];
        }

        // 5. INSERT
        if (cleanSql.includes('INSERT INTO finance.transactions') || cleanSql.includes('INSERT INTO finance.income_records')) {
          const isTx = cleanSql.includes('finance.transactions');
          const table = isTx ? mockTransactions : mockIncomeRecords;
          const [id, userId, updatedAt, encAmount, encText, textIdx, ...vals] = params;
          if (table.has(id)) {
            return []; // insert race
          }
          const match = cleanSql.match(/\(([^)]+)\)\s+VALUES/i);
          const colNames = match ? match[1].split(',').map((c) => c.trim()) : [];
          const row: any = { is_deleted: false, id, user_id: userId, updated_at: updatedAt, enc_amount: encAmount };
          if (isTx) {
            row.enc_merchant = encText;
            row.merchant_idx = textIdx;
          } else {
            row.enc_source = encText;
            row.source_idx = textIdx;
          }
          // Map remaining dynamic values to dbCols (skipping the first 7 fixed columns in SQL)
          for (let i = 0; i < vals.length; i++) {
            const col = colNames[7 + i];
            if (col && col !== 'is_deleted' && col !== 'sms_id') {
              row[col] = vals[i];
            }
          }
          table.set(id, row);
          return [{ '?column?': 1 }];
        }

        // 6. UPDATE
        if (cleanSql.includes('UPDATE finance.transactions') || cleanSql.includes('UPDATE finance.income_records')) {
          const [id, userId, updatedAt, nextVer, encAmount, encText, textIdx, ...rest] = params;
          const isTx = cleanSql.includes('finance.transactions');
          const table = isTx ? mockTransactions : mockIncomeRecords;
          const row = table.get(id);
          const vals = rest.slice(0, rest.length - 1); // last is expectedRowVersion
          if (row && row.user_id === userId) {
            row.updated_at = updatedAt;
            row.row_version = nextVer;
            row.is_deleted = false;
            row.amount = vals[0] ?? row.amount;
            row.category = vals[1] ?? row.category;
            if (isTx) {
              row.merchant = vals[2] ?? row.merchant;
              row.timestamp = vals[3] ?? row.timestamp;
            } else {
              row.source = vals[2] ?? row.source;
              row.timestamp = vals[3] ?? row.timestamp;
            }
            return [{ '?column?': 1 }];
          }
          return [];
        }

        return [];
      }),
    };

    const mockDataSource = {
      transaction: jest.fn(async (cb: (m: any) => Promise<any>) => {
        const snapshotApplied = new Map(appliedOps);
        const snapshotTx = new Map(mockTransactions);
        const snapshotInc = new Map(mockIncomeRecords);
        try {
          return await cb(mockEntityManager);
        } catch (err) {
          appliedOps = snapshotApplied;
          mockTransactions = snapshotTx;
          mockIncomeRecords = snapshotInc;
          throw err;
        }
      }),
      query: jest.fn(),
    };

    const mockRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: getRepositoryToken(BankProfile), useValue: mockRepo },
        { provide: getRepositoryToken(Transaction), useValue: mockRepo },
        { provide: getRepositoryToken(BudgetDeclaration), useValue: mockRepo },
        { provide: getRepositoryToken(SavingsGoal), useValue: mockRepo },
        { provide: getRepositoryToken(GoalHistory), useValue: mockRepo },
        { provide: getRepositoryToken(NetWorthSnapshot), useValue: mockRepo },
        { provide: getRepositoryToken(IncomeRecord), useValue: mockRepo },
        { provide: getRepositoryToken(UserMerchantTag), useValue: mockRepo },
        { provide: getRepositoryToken(BudgetTransactionExclusion), useValue: mockRepo },
        { provide: getRepositoryToken(User), useValue: mockRepo },
        { provide: AiService, useValue: { parseStatement: jest.fn() } },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(async (key: string) => {
              invalidateCacheCalls.push(key);
            }),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            sendNotification: jest.fn(),
            resolveNotification: jest.fn(),
          },
        },
        {
          provide: FieldCipherService,
          useValue: {
            encryptTransactionFields: jest.fn().mockImplementation((userId, id, data, currentVer) => {
              const rowVersion = currentVer != null ? currentVer + 1n : 1n;
              return Promise.resolve({
                encAmount: Buffer.from('mock_enc_amount'),
                encMerchant: Buffer.from('mock_enc_merchant'),
                encNote: null,
                merchantIdx: Buffer.from('mock_merchant_idx'),
                rowVersion,
              });
            }),
            encryptIncomeFields: jest.fn().mockImplementation((userId, id, data, currentVer) => {
              const rowVersion = currentVer != null ? currentVer + 1n : 1n;
              return Promise.resolve({
                encAmount: Buffer.from('mock_enc_amount'),
                encSource: Buffer.from('mock_enc_source'),
                encNote: null,
                sourceIdx: Buffer.from('mock_source_idx'),
                rowVersion,
              });
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  // Test 1: Replay
  it('1. Replay: POST the same batch twice returns duplicate on second pass and keeps 1 DB row', async () => {
    const op = {
      idemKey: 'op_replay_test_001',
      entity: 'transaction',
      op: 'upsert',
      entityId: 'tx_manual_uuid_101',
      payload: {
        amount: 250.5,
        category: 'food',
        merchant: 'Swiggy',
        timestamp: Date.now(),
        bankProfileId: 'bank_hdfc_123',
      },
    };

    const first = await service.applyOutbox('user_A', [op]);
    expect(first.results).toEqual([{ idemKey: 'op_replay_test_001', status: 'applied' }]);
    expect(mockTransactions.has('tx_manual_uuid_101')).toBe(true);

    const second = await service.applyOutbox('user_A', [op]);
    expect(second.results).toEqual([{ idemKey: 'op_replay_test_001', status: 'duplicate' }]);
    expect(mockTransactions.size).toBe(1);
  });

  // Test 2: Foreign ID
  it('2. Foreign ID: Token A updating row owned by User B returns rejected: forbidden', async () => {
    // Seed User B's transaction
    mockTransactions.set('tx_manual_userB_row', {
      id: 'tx_manual_userB_row',
      user_id: 'user_B',
      amount: 1000,
      updated_at: 1000000,
      is_deleted: false,
    });

    const op = {
      idemKey: 'op_foreign_steal_002',
      entity: 'transaction',
      op: 'upsert',
      entityId: 'tx_manual_userB_row',
      payload: {
        amount: 50,
        category: 'hacked',
        merchant: 'Attacker',
        timestamp: Date.now(),
      },
    };

    const res = await service.applyOutbox('user_A', [op]);
    expect(res.results).toEqual([{
      idemKey: 'op_foreign_steal_002',
      status: 'rejected',
      reason: 'forbidden',
    }]);

    // B's row remains untouched
    const bRow = mockTransactions.get('tx_manual_userB_row');
    expect(bRow.amount).toBe(1000);
    expect(bRow.user_id).toBe('user_B');
    // Rejected op must roll back applied_ops insertion
    expect(appliedOps.has('op_foreign_steal_002')).toBe(false);
  });

  // Test 3: Order preservation on error
  it('3. Order: If op 2 of 3 throws system error, returns [applied, retry, retry] and stops', async () => {
    let callCount = 0;
    (service as any).dataSource.transaction = jest.fn(async (cb) => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Database connection lost');
      }
      return cb({
        query: jest.fn(async (sql, params) => {
          if (sql.includes('applied_ops')) {
            return [{ '?column?': 1 }];
          }
          if (sql.includes('FOR UPDATE')) return [];
          return [{ '?column?': 1 }];
        }),
      });
    });

    const ops = [
      { idemKey: 'op_batch_1', entity: 'transaction', op: 'upsert', entityId: 'tx_manual_01', payload: { amount: 10, category: 'food', merchant: 'A', timestamp: Date.now() } },
      { idemKey: 'op_batch_2', entity: 'transaction', op: 'upsert', entityId: 'tx_manual_02', payload: { amount: 20, category: 'food', merchant: 'B', timestamp: Date.now() } },
      { idemKey: 'op_batch_3', entity: 'transaction', op: 'upsert', entityId: 'tx_manual_03', payload: { amount: 30, category: 'food', merchant: 'C', timestamp: Date.now() } },
    ];

    const res = await service.applyOutbox('user_A', ops);
    expect(res.results).toEqual([
      { idemKey: 'op_batch_1', status: 'applied' },
      { idemKey: 'op_batch_2', status: 'retry' },
      { idemKey: 'op_batch_3', status: 'retry' },
    ]);
  });

  // Test 4: Stale update
  it('4. Stale: Older update on row with newer updatedAt is applied as a no-op', async () => {
    mockTransactions.set('tx_manual_row_stale', {
      id: 'tx_manual_row_stale',
      user_id: 'user_A',
      amount: 500,
      category: 'dining',
      merchant: 'Zomato',
      updated_at: 2000000,
      is_deleted: false,
    });

    const staleOp = {
      idemKey: 'op_stale_update_004',
      entity: 'transaction',
      op: 'upsert',
      entityId: 'tx_manual_row_stale',
      payload: {
        amount: 250,
        category: 'food',
        merchant: 'Old Edit',
        updatedAt: 1500000, // Older than 2000000
      },
    };

    const res = await service.applyOutbox('user_A', [staleOp]);
    expect(res.results).toEqual([{ idemKey: 'op_stale_update_004', status: 'applied' }]);

    const row = mockTransactions.get('tx_manual_row_stale');
    expect(row.amount).toBe(500); // Unchanged
    expect(row.merchant).toBe('Zomato');
  });

  // Test 5: Future clock clamping
  it('5. Future clock: updatedAt set to year 2030 is clamped to <= now + 30s', async () => {
    const futureTime = Date.now() + 1000 * 60 * 60 * 24 * 365 * 4; // ~4 years ahead
    const nowBefore = Date.now();

    const op = {
      idemKey: 'op_future_clock_005',
      entity: 'transaction',
      op: 'upsert',
      entityId: 'tx_manual_future_005',
      payload: {
        amount: 99,
        category: 'tech',
        merchant: 'Gadget',
        timestamp: Date.now(),
        updatedAt: futureTime,
      },
    };

    const res = await service.applyOutbox('user_A', [op]);
    expect(res.results).toEqual([{ idemKey: 'op_future_clock_005', status: 'applied' }]);

    const row = mockTransactions.get('tx_manual_future_005');
    expect(row.updated_at).toBeLessThanOrEqual(Date.now() + 30000);
    expect(row.updated_at).toBeGreaterThanOrEqual(nowBefore);
  });

  // Test 6: Bad data validation without 400
  it('6. Bad data: Rejects bad amount, bad string amount, future timestamp, bad prefix without 400', async () => {
    const now = Date.now();
    const badOps = [
      // 3 decimals
      { idemKey: 'bad_op_1', entity: 'transaction', op: 'upsert', entityId: 'tx_manual_b1', payload: { amount: 1.005, category: 'food', merchant: 'M', timestamp: now } },
      // string amount
      { idemKey: 'bad_op_2', entity: 'transaction', op: 'upsert', entityId: 'tx_manual_b2', payload: { amount: '250', category: 'food', merchant: 'M', timestamp: now } },
      // timestamp 1 year ahead
      { idemKey: 'bad_op_3', entity: 'transaction', op: 'upsert', entityId: 'tx_manual_b3', payload: { amount: 100, category: 'food', merchant: 'M', timestamp: now + 86400000 * 365 } },
      // bad prefix on insert
      { idemKey: 'bad_op_4', entity: 'transaction', op: 'upsert', entityId: 'sms_hijack_123', payload: { amount: 100, category: 'food', merchant: 'M', timestamp: now } },
      // missing category on insert
      { idemKey: 'bad_op_5', entity: 'transaction', op: 'upsert', entityId: 'tx_manual_b5', payload: { amount: 100, merchant: 'M', timestamp: now } },
    ];

    const res = await service.applyOutbox('user_A', badOps);
    expect(res.results).toEqual([
      { idemKey: 'bad_op_1', status: 'rejected', reason: 'bad_amount' },
      { idemKey: 'bad_op_2', status: 'rejected', reason: 'bad_amount' },
      { idemKey: 'bad_op_3', status: 'rejected', reason: 'bad_timestamp' },
      { idemKey: 'bad_op_4', status: 'rejected', reason: 'bad_id_prefix' },
      { idemKey: 'bad_op_5', status: 'rejected', reason: 'missing_category' },
    ]);
  });

  // Test 7: Delete then older upsert
  it('7. Delete then older upsert: Tombstone wins over older upsert', async () => {
    // 1. Insert row at T = 1000
    mockTransactions.set('tx_manual_del_test', {
      id: 'tx_manual_del_test',
      user_id: 'user_A',
      amount: 200,
      category: 'dining',
      merchant: 'Cafe',
      updated_at: 1000,
      is_deleted: false,
    });

    // 2. Delete row at T = 2000
    const deleteOp = {
      idemKey: 'op_delete_007',
      entity: 'transaction',
      op: 'delete',
      entityId: 'tx_manual_del_test',
      payload: { updatedAt: 2000 },
    };
    const delRes = await service.applyOutbox('user_A', [deleteOp]);
    expect(delRes.results[0].status).toBe('applied');
    expect(mockTransactions.get('tx_manual_del_test').is_deleted).toBe(true);

    // 3. Older upsert arrives with updatedAt = 1500
    const olderUpsertOp = {
      idemKey: 'op_older_upsert_007',
      entity: 'transaction',
      op: 'upsert',
      entityId: 'tx_manual_del_test',
      payload: {
        amount: 300,
        category: 'dining',
        merchant: 'Cafe Renamed',
        updatedAt: 1500,
      },
    };
    const olderRes = await service.applyOutbox('user_A', [olderUpsertOp]);
    expect(olderRes.results[0].status).toBe('applied');

    // The row must remain tombstoned with original delete timestamp
    const finalRow = mockTransactions.get('tx_manual_del_test');
    expect(finalRow.is_deleted).toBe(true);
    expect(finalRow.updated_at).toBe(2000);
    expect(finalRow.amount).toBe(200); // Not updated
  });

  // Test 8: Concurrency with identical idemKey
  it('8. Concurrency: Parallel calls with same idemKey result in exactly 1 applied and 1 duplicate', async () => {
    const op = {
      idemKey: 'op_concurrent_key_008',
      entity: 'transaction',
      op: 'upsert',
      entityId: 'tx_manual_conc_008',
      payload: {
        amount: 75,
        category: 'coffee',
        merchant: 'Starbucks',
        timestamp: Date.now(),
      },
    };

    const [res1, res2] = await Promise.all([
      service.applyOutbox('user_A', [op]),
      service.applyOutbox('user_A', [op]),
    ]);

    const statuses = [res1.results[0].status, res2.results[0].status].sort();
    expect(statuses).toEqual(['applied', 'duplicate']);
    expect(mockTransactions.size).toBe(1);
  });

  // Test 9: Income entity support
  it('9. Income entity: Inserts income record and sets source field properly', async () => {
    const op = {
      idemKey: 'op_income_009',
      entity: 'income',
      op: 'upsert',
      entityId: 'inc_manual_uuid_009',
      payload: {
        amount: 50000,
        category: 'salary',
        source: 'Acme Corp',
        timestamp: Date.now(),
        bankProfileId: 'bank_hdfc_123',
      },
    };

    const res = await service.applyOutbox('user_A', [op]);
    expect(res.results).toEqual([{ idemKey: 'op_income_009', status: 'applied' }]);
    expect(mockIncomeRecords.has('inc_manual_uuid_009')).toBe(true);

    const inc = mockIncomeRecords.get('inc_manual_uuid_009');
    expect(inc.enc_amount).toEqual(Buffer.from('mock_enc_amount'));
    expect(inc.enc_source).toEqual(Buffer.from('mock_enc_source'));
    expect(inc.category).toBe('salary');
    expect(inc.amount).toBeUndefined(); // Zero plaintext in DB
  });
});
