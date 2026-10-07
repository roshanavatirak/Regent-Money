import { Injectable, Logger, BadRequestException, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
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
import { OcrSyncDto } from './dto/ocr-sync.dto';
import { ManualTransactionDto } from './dto/manual-transaction.dto';
import { PDFExtract, PDFExtractOptions } from 'pdf.js-extract';
import { AiService } from '../ai/ai.service';
import { parseSMS } from './sms-parser.util';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectRepository(BankProfile)
    private readonly bankProfileRepository: Repository<BankProfile>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(BudgetDeclaration)
    private readonly budgetDeclarationRepository: Repository<BudgetDeclaration>,
    @InjectRepository(SavingsGoal)
    private readonly savingsGoalRepository: Repository<SavingsGoal>,
    @InjectRepository(GoalHistory)
    private readonly goalHistoryRepository: Repository<GoalHistory>,
    @InjectRepository(NetWorthSnapshot)
    private readonly netWorthSnapshotRepository: Repository<NetWorthSnapshot>,
    @InjectRepository(IncomeRecord)
    private readonly incomeRecordRepository: Repository<IncomeRecord>,
    @InjectRepository(UserMerchantTag)
    private readonly userMerchantTagRepository: Repository<UserMerchantTag>,
    @InjectRepository(BudgetTransactionExclusion)
    private readonly budgetExclusionRepository: Repository<BudgetTransactionExclusion>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly aiService: AiService,
    private readonly redisService: RedisService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing BankProfile schema checks...');
    try {
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS sms_sender_id TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS upi_id TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS custom_keywords TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS statement_password TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN DEFAULT FALSE;
      `);
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'Savings';
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.income_records ADD COLUMN IF NOT EXISTS category TEXT;
      `);
      // Savings Goal enrichments
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS category TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS monthly_contribution NUMERIC;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS expected_return_rate NUMERIC;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS priority TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS color TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS icon TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS strategy TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS streak_months INTEGER DEFAULT 0;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS cover_preset_key TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS cover_image_uri TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS linked_bank_id TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS entries JSONB DEFAULT '[]';
      `);
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS wealth.goal_history (
          id TEXT PRIMARY KEY,
          user_id UUID NOT NULL,
          goal_id TEXT NOT NULL,
          type TEXT NOT NULL,
          amount NUMERIC NOT NULL,
          note TEXT,
          at TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          is_deleted BOOLEAN DEFAULT FALSE
        );
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_goal_history_goal_user ON wealth.goal_history(goal_id, user_id, is_deleted);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_goal_history_created ON wealth.goal_history(goal_id, created_at DESC);
      `);
      // Performance indexes for scale (millions of records per user)
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_transactions_user_active ON finance.transactions(user_id, is_deleted);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_transactions_user_timestamp_desc ON finance.transactions(user_id, is_deleted, timestamp DESC);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_transactions_user_bank ON finance.transactions(user_id, bank_profile_id, is_deleted);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_transactions_user_sms_id ON finance.transactions(user_id, sms_id);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_income_records_user_active ON finance.income_records(user_id, is_deleted);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_income_records_user_timestamp_desc ON finance.income_records(user_id, is_deleted, timestamp DESC);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_bank_profiles_user_active ON core.bank_profiles(user_id, is_deleted);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_savings_goals_user_active ON wealth.savings_goals(user_id, is_deleted);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_user_timestamp ON wealth.net_worth_snapshots(user_id, is_deleted, timestamp ASC);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_budget_declarations_user ON finance.budget_declarations(user_id, is_deleted);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_notifications_user_created_desc ON core.notifications(user_id, is_deleted, created_at DESC);
      `);
      try {
        await this.dataSource.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
        await this.dataSource.query(`
          CREATE INDEX IF NOT EXISTS idx_transactions_merchant_trgm ON finance.transactions USING gin (merchant gin_trgm_ops);
        `);
      } catch {
        await this.dataSource.query(`
          CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON finance.transactions(merchant);
        `);
      }
      // User merchant learning table
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS finance.user_merchant_tags (
          id TEXT PRIMARY KEY,
          user_id UUID NOT NULL,
          merchant_normalized TEXT NOT NULL,
          tag TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          CONSTRAINT uq_user_merchant UNIQUE(user_id, merchant_normalized)
        );
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_user_merchant_lookup ON finance.user_merchant_tags(user_id, merchant_normalized);
      `);
      // Budget declarations column migrations
      await this.dataSource.query(`
        ALTER TABLE finance.budget_declarations ADD COLUMN IF NOT EXISTS name TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.budget_declarations ADD COLUMN IF NOT EXISTS is_overall BOOLEAN DEFAULT FALSE;
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.budget_declarations ADD COLUMN IF NOT EXISTS start_date BIGINT;
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.budget_declarations ADD COLUMN IF NOT EXISTS end_date BIGINT;
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.budget_declarations ADD COLUMN IF NOT EXISTS period_type TEXT DEFAULT 'monthly';
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.budget_declarations ADD COLUMN IF NOT EXISTS fixed_obligations NUMERIC DEFAULT 0;
      `);
      // Budget transaction exclusions persistence table
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS finance.budget_transaction_exclusions (
          id TEXT PRIMARY KEY,
          user_id UUID NOT NULL,
          transaction_id TEXT NOT NULL,
          budget_id TEXT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          is_deleted BOOLEAN DEFAULT FALSE,
          CONSTRAINT uq_budget_user_tx UNIQUE(user_id, transaction_id)
        );
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_budget_exclusions_user ON finance.budget_transaction_exclusions(user_id, is_deleted);
      `);
      this.logger.log('BankProfile, SavingsGoal, Budget & Exclusion schema checks completed successfully.');
    } catch (e: any) {
      this.logger.error(`Error checking/updating schema: ${e.message}`, e.stack);
    }
  }

  // In-memory mutex map to serialize sync requests per user
  private static userSyncLocks = new Map<string, Promise<any>>();

  private async withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prevLock = SyncService.userSyncLocks.get(userId) || Promise.resolve();
    let resolveLock: () => void;
    const currentLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    SyncService.userSyncLocks.set(userId, currentLock);

    try {
      await prevLock;
      return await fn();
    } finally {
      resolveLock!();
      if (SyncService.userSyncLocks.get(userId) === currentLock) {
        SyncService.userSyncLocks.delete(userId);
      }
    }
  }

  async invalidateUserSyncCache(userId: string) {
    if (!userId) return;
    try {
      await this.redisService.del(`user:${userId}:sync`);
    } catch (err: any) {
      this.logger.warn(`Failed to invalidate sync cache for user ${userId}: ${err.message}`);
    }
  }

  async sync(userId: string) {
    const cacheKey = `user:${userId}:sync`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        this.logger.log(`[SyncService] Cache HIT for user: ${userId}`);
        return JSON.parse(cached);
      }
    } catch (err: any) {
      this.logger.warn(`[SyncService] Cache lookup error: ${err.message}`);
    }

    this.logger.log(`Performing data synchronization for user: ${userId}`);

    const [rawTransactions, budgets, goals, bankProfiles, incomeRecords, exclusions] = await Promise.all([
      this.transactionRepository.find({ where: { userId, isDeleted: false }, order: { timestamp: 'DESC' } }),
      this.budgetDeclarationRepository.find({ where: { userId, isDeleted: false } }),
      this.savingsGoalRepository.find({ where: { userId, isDeleted: false } }),
      this.bankProfileRepository.find({ where: { userId, isDeleted: false } }),
      this.incomeRecordRepository.find({ where: { userId, isDeleted: false }, order: { timestamp: 'DESC' } }),
      this.budgetExclusionRepository.find({ where: { userId, isDeleted: false } }),
    ]);

    const excludedTransactionIds = (exclusions || []).map((e) => e.transactionId);

    // Deduplicate only true duplicate records (identical reference ID, identical SMS hash, or exact-second collision)
    const seenTx = new Set<string>();
    const transactions: any[] = [];
    const duplicateIdsToDelete: string[] = [];

    for (const tx of rawTransactions) {
      let isDuplicate = false;
      if (tx.smsId && tx.smsId.startsWith('ref_')) {
        const refKey = `ref_${tx.bankProfileId}_${tx.smsId}`;
        if (seenTx.has(refKey)) {
          isDuplicate = true;
        } else {
          seenTx.add(refKey);
        }
      } else if (tx.smsId && tx.smsId.startsWith('sms_')) {
        const hashKey = `sms_${tx.bankProfileId}_${tx.smsId}`;
        if (seenTx.has(hashKey)) {
          isDuplicate = true;
        } else {
          seenTx.add(hashKey);
        }
      } else {
        // Fallback: only duplicate if identical bank, amount, merchant, and exact timestamp (within 2 seconds)
        const tRounded = Math.floor(Number(tx.timestamp || 0) / 2000);
        const normMerchant = (tx.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const exactSig = `${tx.bankProfileId}_${Math.round(Number(tx.amount) * 100)}_${normMerchant}_${tRounded}`;
        if (seenTx.has(exactSig)) {
          isDuplicate = true;
        } else {
          seenTx.add(exactSig);
        }
      }

      if (isDuplicate) {
        duplicateIdsToDelete.push(tx.id);
        continue;
      }
      (tx as any).excludedFromBudget = excludedTransactionIds.includes(tx.id);
      transactions.push(tx);
    }

    if (duplicateIdsToDelete.length > 0) {
      this.logger.log(`Cleaning up ${duplicateIdsToDelete.length} duplicate transactions for user: ${userId}`);
      this.transactionRepository.update(
        { id: In(duplicateIdsToDelete), userId },
        { isDeleted: true, updatedAt: Date.now() },
      ).catch((err) => this.logger.warn(`Failed to soft-delete duplicate transactions: ${err.message}`));
    }

    const now = Date.now();
    for (const bank of bankProfiles) {
      bank.lastSyncTimestamp = now;
      if (bank.accountType === 'Savings' && Number(bank.currentBalance) < 0) {
        bank.currentBalance = 0;
        this.bankProfileRepository.save(bank).catch(() => {});
      }
    }

    const result = {
      transactions,
      body: bankProfiles, // Keep matching controller structures if they expect specific returns
      budgets,
      goals,
      bankProfiles,
      incomeRecords,
      excludedTransactionIds,
    };

    try {
      await this.redisService.set(cacheKey, JSON.stringify(result), 30);
    } catch (err: any) {
      this.logger.warn(`[SyncService] Cache store error: ${err.message}`);
    }

    return result;
  }

  async createBankProfile(
    userId: string,
    data: {
      id: string;
      bankName: string;
      accountNumberSuffix: string;
      currentBalance: number;
      accountType?: string;
      smsSenderId?: string;
      upiId?: string;
      customKeywords?: string;
      smsConsent?: boolean;
    },
  ) {
    this.logger.log(`Creating/updating bank profile for user: ${userId} (${data.id})`);

    let existing = await this.bankProfileRepository.findOne({
      where: { id: data.id, userId, isDeleted: false },
    });

    if (existing) {
      existing.bankName = data.bankName;
      existing.accountNumberSuffix = data.accountNumberSuffix;
      existing.currentBalance = data.currentBalance;
      existing.accountType = data.accountType || existing.accountType || 'Savings';
      existing.smsSenderId = data.smsSenderId || null;
      existing.upiId = data.upiId || null;
      existing.customKeywords = data.customKeywords || null;
      if (data.smsConsent !== undefined) {
        existing.smsConsent = data.smsConsent;
      }
      existing.updatedAt = Date.now();
      await this.invalidateUserSyncCache(userId);
      return this.bankProfileRepository.save(existing);
    }

    const bankProfile = this.bankProfileRepository.create({
      id: data.id,
      userId,
      bankName: data.bankName,
      accountType: data.accountType || 'Savings',
      accountNumberSuffix: data.accountNumberSuffix,
      currentBalance: data.currentBalance,
      smsSenderId: data.smsSenderId || null,
      upiId: data.upiId || null,
      customKeywords: data.customKeywords || null,
      smsConsent: data.smsConsent !== undefined ? data.smsConsent : true,
      lastSyncTimestamp: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
    });
    await this.invalidateUserSyncCache(userId);
    return this.bankProfileRepository.save(bankProfile);
  }

  async deleteBankProfile(userId: string, id: string) {
    this.logger.log(`Deleting bank profile: ${id} for user: ${userId}`);
    let bankProfile = await this.bankProfileRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!bankProfile) {
      bankProfile = await this.bankProfileRepository.findOne({
        where: { id, isDeleted: false },
      });
    }
    if (!bankProfile) {
      throw new BadRequestException('Bank profile not found or already deleted.');
    }
    bankProfile.isDeleted = true;
    bankProfile.updatedAt = Date.now();
    await this.bankProfileRepository.save(bankProfile);
    await this.invalidateUserSyncCache(userId);
    return { success: true, message: 'Bank account unlinked successfully.' };
  }

  async getNetWorthSnapshots(userId: string) {
    this.logger.log(`Fetching net worth snapshots for user: ${userId}`);
    return this.netWorthSnapshotRepository.find({
      where: { userId, isDeleted: false },
      order: { timestamp: 'ASC' },
    });
  }

  async getIncomeRecords(userId: string) {
    this.logger.log(`Fetching income records for user: ${userId}`);
    return this.incomeRecordRepository.find({
      where: { userId, isDeleted: false },
    });
  }

  async injectMockData(userId: string) {
    this.logger.log(`Injecting mock data for user: ${userId}`);

    // 1. Clear existing user data
    await Promise.all([
      this.transactionRepository.delete({ userId }),
      this.bankProfileRepository.delete({ userId }),
      this.budgetDeclarationRepository.delete({ userId }),
      this.savingsGoalRepository.delete({ userId }),
      this.netWorthSnapshotRepository.delete({ userId }),
      this.incomeRecordRepository.delete({ userId }),
    ]);

    // 2. Insert Bank Profiles
    const hdfcId = 'bank_hdfc_' + Math.random().toString(36).substr(2, 9);
    const sbiId = 'bank_sbi_' + Math.random().toString(36).substr(2, 9);

    const bankProfiles = [
      this.bankProfileRepository.create({
        id: hdfcId,
        userId,
        bankName: 'HDFC Bank',
        accountNumberSuffix: '4820',
        currentBalance: 74320.5,
        lastSyncTimestamp: Date.now(),
        updatedAt: Date.now(),
        isDeleted: false,
      }),
      this.bankProfileRepository.create({
        id: sbiId,
        userId,
        bankName: 'State Bank of India',
        accountNumberSuffix: '9105',
        currentBalance: 15420.0,
        lastSyncTimestamp: Date.now(),
        updatedAt: Date.now(),
        isDeleted: false,
      }),
    ];
    await this.bankProfileRepository.save(bankProfiles);

    // 3. Insert Budgets
    const categories = ['food', 'transport', 'shopping', 'utilities', 'entertainment'];
    const limits = [12000, 4000, 8000, 5000, 3000];
    const spents = [8420, 2150, 6800, 4200, 1500];

    const budgets = categories.map((cat, i) =>
      this.budgetDeclarationRepository.create({
        id: 'budget_' + cat + '_' + Math.random().toString(36).substr(2, 9),
        userId,
        category: cat,
        limitAmount: limits[i],
        spentAmount: spents[i],
        period: '2026-06',
        updatedAt: Date.now(),
        isDeleted: false,
      }),
    );
    await this.budgetDeclarationRepository.save(budgets);

    // 4. Insert Savings Goals
    const goals = [
      this.savingsGoalRepository.create({
        id: 'goal_emerg_' + Math.random().toString(36).substr(2, 9),
        userId,
        name: 'Emergency Fund',
        targetAmount: 150000,
        currentAmount: 90000,
        targetDate: Date.now() + 180 * 24 * 60 * 60 * 1000,
        status: 'active',
        updatedAt: Date.now(),
        isDeleted: false,
      }),
      this.savingsGoalRepository.create({
        id: 'goal_mac_' + Math.random().toString(36).substr(2, 9),
        userId,
        name: 'New Macbook Pro',
        targetAmount: 200000,
        currentAmount: 45000,
        targetDate: Date.now() + 90 * 24 * 60 * 60 * 1000,
        status: 'active',
        updatedAt: Date.now(),
        isDeleted: false,
      }),
    ];
    await this.savingsGoalRepository.save(goals);

    // 5. Insert Net Worth Snapshots
    const snapshots: NetWorthSnapshot[] = [];
    const monthsBack = 12;
    for (let i = monthsBack; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const timestamp = date.getTime();
      const totalAssets = 350000 + (monthsBack - i) * 20000;
      const totalLiabilities = 120000 - (monthsBack - i) * 5000;
      snapshots.push(
        this.netWorthSnapshotRepository.create({
          id: 'snapshot_' + i + '_' + Math.random().toString(36).substr(2, 9),
          userId,
          timestamp,
          totalAssets,
          totalLiabilities,
          netWorth: totalAssets - totalLiabilities,
          updatedAt: Date.now(),
          isDeleted: false,
        }),
      );
    }
    await this.netWorthSnapshotRepository.save(snapshots);

    // 6. Insert Historical Income Records
    const salaryAmounts = [95000, 95000, 95000];
    const incomeRecords: IncomeRecord[] = [];
    for (let i = 2; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      date.setDate(1);
      incomeRecords.push(
        this.incomeRecordRepository.create({
          id: 'income_' + i + '_' + Math.random().toString(36).substr(2, 9),
          userId,
          amount: salaryAmounts[i],
          source: 'Salary',
          timestamp: date.getTime(),
          bankProfileId: hdfcId,
          updatedAt: Date.now(),
          isDeleted: false,
        }),
      );
    }
    await this.incomeRecordRepository.save(incomeRecords);

    // 7. Insert Detailed Transactions
    const mockTx = [
      { amount: 342, category: 'food', merchant: 'Zomato', daysAgo: 0, profileId: hdfcId },
      { amount: 120, category: 'transport', merchant: 'Uber', daysAgo: 0, profileId: hdfcId },
      { amount: 1500, category: 'utilities', merchant: 'Jio Recharge', daysAgo: 1, profileId: sbiId },
      { amount: 450, category: 'food', merchant: 'Swiggy', daysAgo: 1, profileId: hdfcId },
      { amount: 2300, category: 'shopping', merchant: 'Amazon', daysAgo: 2, profileId: hdfcId },
      { amount: 80, category: 'food', merchant: 'Local Tea Stall', daysAgo: 2, profileId: sbiId },
      { amount: 199, category: 'entertainment', merchant: 'Netflix', daysAgo: 3, profileId: hdfcId },
      { amount: 650, category: 'transport', merchant: 'Ola Cabs', daysAgo: 4, profileId: hdfcId },
      { amount: 1200, category: 'shopping', merchant: 'Myntra', daysAgo: 4, profileId: hdfcId },
      { amount: 290, category: 'food', merchant: 'Blinkit', daysAgo: 5, profileId: hdfcId },
      { amount: 5000, category: 'utilities', merchant: 'BESCOM Electricity', daysAgo: 5, profileId: sbiId },
      { amount: 150, category: 'transport', merchant: 'Rapido Bike', daysAgo: 6, profileId: hdfcId },
      { amount: 4800, category: 'shopping', merchant: 'Flipkart', daysAgo: 7, profileId: hdfcId },
      { amount: 850, category: 'food', merchant: 'Starbucks', daysAgo: 8, profileId: hdfcId },
    ];

    const transactionsToSave = mockTx.map((tx, idx) => {
      const txTime = Date.now() - tx.daysAgo * 24 * 60 * 60 * 1000;
      return this.transactionRepository.create({
        id: 'tx_' + idx + '_' + Math.random().toString(36).substr(2, 9),
        userId,
        amount: tx.amount,
        category: tx.category,
        merchant: tx.merchant,
        timestamp: txTime,
        bankProfileId: tx.profileId,
        smsId: 'sms_' + Math.random().toString(36).substring(7),
        isAnomaly: tx.amount > 3000 && tx.category === 'shopping',
        status: 'cleared',
        updatedAt: Date.now(),
        isDeleted: false,
      });
    });
    await this.transactionRepository.save(transactionsToSave);

    return { message: 'Mock data successfully injected!' };
  }

  async verifyBankAccount(
    userId: string,
    data: { bankCode: string; phoneNumber: string; simulateFailure?: boolean }
  ) {
    this.logger.log(`Verifying bank connection for user: ${userId}, bank: ${data.bankCode}`);

    if (data.simulateFailure) {
      throw new BadRequestException(`Phone number not registered with ${data.bankCode || 'bank'}`);
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User session not found.');
    }

    const cleanNumber = (num: string) => num.replace(/[\s\-\+]/g, '').slice(-10);
    
    const inputPhone = cleanNumber(data.phoneNumber);
    const userPhone = user.phone ? cleanNumber(user.phone) : '';

    if (!userPhone) {
      throw new BadRequestException('Verification failed: No mobile number registered in your profile.');
    }

    if (inputPhone !== userPhone) {
      throw new BadRequestException(`Phone number not registered with ${data.bankCode || 'bank'}`);
    }

    // Generate simulated account data dynamically
    const suffix = Math.floor(1000 + Math.random() * 9000).toString();
    const mockBalance = Math.floor(15000 + Math.random() * 85000);

    return {
      success: true,
      bankName: data.bankCode,
      accountNumberSuffix: suffix,
      accountType: 'Savings Account',
      holderName: user.name || 'Account Holder',
      currentBalance: mockBalance,
    };
  }

  async updateTransactionCategory(
    userId: string,
    id: string,
    category: string,
    merchant?: string,
    updateMerchantRule: boolean = false,
  ) {
    const tx = await this.transactionRepository.findOne({ where: { id, userId, isDeleted: false } });
    if (!tx) {
      throw new BadRequestException('Transaction not found or deleted.');
    }
    tx.category = category;
    tx.updatedAt = Date.now();
    await this.transactionRepository.save(tx);
    await this.invalidateUserSyncCache(userId);

    const targetMerchant = merchant || tx.merchant;
    if (targetMerchant && updateMerchantRule === true) {
      await this.saveMerchantTagRule(userId, targetMerchant, category).catch(() => {});
    }

    return tx;
  }

  async saveMerchantTagRule(userId: string, merchant: string, tag: string) {
    if (!merchant || !tag) return null;
    const norm = merchant
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!norm) return null;

    let existing = await this.userMerchantTagRepository.findOne({
      where: { userId, merchantNormalized: norm },
    });

    const now = Date.now();
    if (existing) {
      existing.tag = tag;
      existing.updatedAt = now;
      await this.userMerchantTagRepository.save(existing);
      this.logger.log(`Updated merchant tag rule for user ${userId}: "${norm}" -> "${tag}"`);
      return existing;
    }

    const newRule = this.userMerchantTagRepository.create({
      id: `rule_${now}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      merchantNormalized: norm,
      tag,
      createdAt: now,
      updatedAt: now,
    });
    await this.userMerchantTagRepository.save(newRule);
    this.logger.log(`Created new merchant tag rule for user ${userId}: "${norm}" -> "${tag}"`);
    return newRule;
  }

  async syncOcrTransactions(userId: string, data: OcrSyncDto) {
    return this.withUserLock(userId, async () => {
      this.logger.log(`Syncing OCR transactions for user ${userId}, bank: ${data.bankProfileId}`);
      
      const bank = await this.bankProfileRepository.findOne({
        where: { id: data.bankProfileId, userId, isDeleted: false },
      });
      if (!bank) {
        throw new BadRequestException('Bank account profile not found.');
      }

      const [existingTxs, existingIncome] = await Promise.all([
        this.transactionRepository.find({
          where: { userId, bankProfileId: data.bankProfileId },
        }),
        this.incomeRecordRepository.find({
          where: { userId, bankProfileId: data.bankProfileId },
        }),
      ]);

      let addedTransactionsCount = 0;
      let addedIncomeCount = 0;
      let netBalanceChange = 0;

      const newTransactions: Transaction[] = [];
      const newIncomeRecords: IncomeRecord[] = [];

      // Pre-fetch user merchant tag rules once to eliminate N+1 queries in the loop
      const preloadedRules = userId
        ? await this.userMerchantTagRepository.find({ where: { userId } }).catch(() => [])
        : [];

      for (const item of data.transactions) {
        const amount = parseFloat(String(item.amount));
        if (isNaN(amount) || amount <= 0) continue;

        const parsedDate = item.date ? new Date(item.date) : new Date();
        if (isNaN(parsedDate.getTime())) continue;

        const startOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0).getTime();
        const endOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 23, 59, 59, 999).getTime();

        const itemRef = item.referenceId;
        const itemSmsId = item.smsId || (itemRef ? `ref_${itemRef}` : undefined);
        const normItemMerchant = (item.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        if (item.type === 'debit') {
          const isDuplicate = existingTxs.some((tx) => {
            if (itemRef && (tx.smsId === `ref_${itemRef}` || tx.smsId === itemRef)) return true;
            if (itemSmsId && tx.smsId && tx.smsId === itemSmsId) return true;
            if (itemRef && tx.smsId && tx.smsId.startsWith('ref_') && tx.smsId !== `ref_${itemRef}`) return false;

            const txTime = Number(tx.timestamp);
            const sameAmount = Math.abs(tx.amount - amount) < 0.01;
            const isSameDay = (txTime >= startOfDay && txTime <= endOfDay) || Math.abs(txTime - parsedDate.getTime()) < 86400000;
            if (!sameAmount || !isSameDay) return false;

            const normTxMerchant = (tx.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normTxMerchant && normItemMerchant && normTxMerchant !== normItemMerchant) return false;

            if (item.timestamp && txTime && Math.abs(txTime - item.timestamp) > 5000) return false;
            return true;
          }) || newTransactions.some((tx) => {
            if (itemRef && (tx.smsId === `ref_${itemRef}` || tx.smsId === itemRef)) return true;
            if (itemSmsId && tx.smsId && tx.smsId === itemSmsId) return true;
            if (itemRef && tx.smsId && tx.smsId.startsWith('ref_') && tx.smsId !== `ref_${itemRef}`) return false;

            const txTime = Number(tx.timestamp);
            const sameAmount = Math.abs(tx.amount - amount) < 0.01;
            const isSameDay = (txTime >= startOfDay && txTime <= endOfDay) || Math.abs(txTime - parsedDate.getTime()) < 86400000;
            if (!sameAmount || !isSameDay) return false;

            const normTxMerchant = (tx.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normTxMerchant && normItemMerchant && normTxMerchant !== normItemMerchant) return false;

            if (item.timestamp && txTime && Math.abs(txTime - item.timestamp) > 5000) return false;
            return true;
          });

          if (!isDuplicate) {
            const txId = 'tx_ocr_' + Math.random().toString(36).substr(2, 9);
            const newTx = this.transactionRepository.create({
              id: txId,
              userId,
              amount,
              category: item.category || (item.merchant ? await this.classifyCategory(item.merchant, userId, preloadedRules) : 'miscellaneous'),
              merchant: item.merchant || 'Merchant',
              timestamp: item.timestamp && !isNaN(Number(item.timestamp)) ? Number(item.timestamp) : parsedDate.getTime(),
              bankProfileId: data.bankProfileId,
              smsId: itemSmsId || 'ocr_extracted',
              isAnomaly: amount > 5000,
              status: 'cleared',
              updatedAt: Date.now(),
              isDeleted: false,
            });
            newTransactions.push(newTx);
            addedTransactionsCount++;
            netBalanceChange -= amount;
          }
        } else if (item.type === 'credit') {
          const isDuplicate = existingIncome.some((inc) => {
            const incTime = Number(inc.timestamp);
            const sameAmount = Math.abs(inc.amount - amount) < 0.01;
            const isSameDay = (incTime >= startOfDay && incTime <= endOfDay) || Math.abs(incTime - parsedDate.getTime()) < 86400000;
            if (!sameAmount || !isSameDay) return false;

            const normIncSource = (inc.source || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normIncSource && normItemMerchant && normIncSource !== normItemMerchant) return false;

            if (item.timestamp && incTime && Math.abs(incTime - item.timestamp) > 5000) return false;
            return true;
          }) || newIncomeRecords.some((inc) => {
            const incTime = Number(inc.timestamp);
            const sameAmount = Math.abs(inc.amount - amount) < 0.01;
            const isSameDay = (incTime >= startOfDay && incTime <= endOfDay) || Math.abs(incTime - parsedDate.getTime()) < 86400000;
            if (!sameAmount || !isSameDay) return false;

            const normIncSource = (inc.source || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normIncSource && normItemMerchant && normIncSource !== normItemMerchant) return false;

            if (item.timestamp && incTime && Math.abs(incTime - item.timestamp) > 5000) return false;
            return true;
          });

          if (!isDuplicate) {
            const incId = 'income_ocr_' + Math.random().toString(36).substr(2, 9);
            const newInc = this.incomeRecordRepository.create({
              id: incId,
              userId,
              amount,
              source: item.merchant || 'Direct Credit',
              timestamp: item.timestamp && !isNaN(Number(item.timestamp)) ? Number(item.timestamp) : parsedDate.getTime(),
              bankProfileId: data.bankProfileId,
              updatedAt: Date.now(),
              isDeleted: false,
            });
            newIncomeRecords.push(newInc);
            addedIncomeCount++;
            netBalanceChange += amount;
          }
        }
    }

    if (newTransactions.length > 0) {
      await this.transactionRepository.save(newTransactions);
    }
    if (newIncomeRecords.length > 0) {
      await this.incomeRecordRepository.save(newIncomeRecords);
    }

    if (data.updatedBalance !== undefined && data.updatedBalance !== null && !isNaN(Number(data.updatedBalance))) {
      // Direct authoritative balance from bank SMS
      bank.currentBalance = Math.max(0, parseFloat(String(data.updatedBalance)));
      bank.lastSyncTimestamp = Date.now();
      bank.updatedAt = Date.now();
      await this.bankProfileRepository.save(bank);
    } else if (addedTransactionsCount > 0 || addedIncomeCount > 0) {
      // Only apply net balance change if these new transactions occurred AFTER bank profile baseline (creation/update)
      const bankBaseline = Math.max(Number(bank.updatedAt || 0), Number(bank.lastSyncTimestamp || 0));
      let applicableChange = 0;
      for (const tx of newTransactions) {
        if (!bankBaseline || tx.timestamp >= bankBaseline) {
          applicableChange -= tx.amount;
        }
      }
      for (const inc of newIncomeRecords) {
        if (!bankBaseline || inc.timestamp >= bankBaseline) {
          applicableChange += inc.amount;
        }
      }

      if (applicableChange !== 0) {
        const updatedBal = parseFloat(String(bank.currentBalance || 0)) + applicableChange;
        bank.currentBalance = bank.accountType === 'Savings' ? Math.max(0, updatedBal) : updatedBal;
        bank.lastSyncTimestamp = Date.now();
        bank.updatedAt = Date.now();
        await this.bankProfileRepository.save(bank);
      }
    }

    await this.invalidateUserSyncCache(userId);

    return {
      success: true,
      addedTransactionsCount,
      addedIncomeCount,
      updatedBalance: bank.currentBalance,
    };
    });
  }

  private async classifyCategory(
    merchantName: string,
    userId?: string,
    preloadedUserRules?: Array<{ merchantNormalized: string; tag: string }>
  ): Promise<string> {
    const name = (merchantName || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!name) return 'miscellaneous';

    // 1. Check preloaded user rules (in-memory to eliminate N+1 database queries)
    if (preloadedUserRules && preloadedUserRules.length > 0) {
      const direct = preloadedUserRules.find((r) => r.merchantNormalized === name);
      if (direct && direct.tag) {
        return direct.tag;
      }
      const fuzzy = preloadedUserRules.find(
        (r) => name.includes(r.merchantNormalized) || r.merchantNormalized.includes(name)
      );
      if (fuzzy && fuzzy.tag) {
        return fuzzy.tag;
      }
    } else if (userId) {
      // Fallback: Check user learned memory if userId provided and no preloaded rules
      try {
        const learned = await this.userMerchantTagRepository.findOne({
          where: { userId, merchantNormalized: name },
        });
        if (learned && learned.tag) {
          return learned.tag;
        }

        const allUserRules = await this.userMerchantTagRepository.find({
          where: { userId },
        });
        for (const rule of allUserRules) {
          if (name.includes(rule.merchantNormalized) || rule.merchantNormalized.includes(name)) {
            return rule.tag;
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to check user merchant rules: ${err.message}`);
      }
    }

    // 2. 30+ Indian merchant & category keyword rules
    if (/blinkit|zepto|instamart|bigbasket|dmart|supermarket|kirana|provision|nature basket|spencer|more retail|dairy|milk|fruits|vegetable|bakery/.test(name)) {
      return 'groceries';
    }
    if (/zomato|swiggy|starbucks|mcdonald|burger king|kfc|pizza hut|domino|haldiram|subway|barbeque|cafe|restaurant|dhaba|tea|chai|coffee|bhojanalaya|biryani|sweets|tiffin|canteen|dining/.test(name)) {
      return 'food';
    }
    if (/uber|ola|rapido|metro|chalo|fastag|toll|parking|auto|taxi|ride|cab|transit/.test(name)) {
      return 'commute';
    }
    if (/indian oil|iocl|bharat petroleum|bpcl|hindustan petroleum|hpcl|shell|petrol|diesel|cng|fuel|gas station/.test(name)) {
      return 'fuel';
    }
    if (/makemytrip|goibibo|easemytrip|irctc|yatra|indigo|air india|vistara|spicejet|akasa|hotel|flight|resort|train ticket|railways|bus|redbus/.test(name)) {
      return 'travel';
    }
    if (/amazon|flipkart|myntra|ajio|nykaa|tata cliq|meesho|zara|h&m|uniqlo|shoppers stop|lifestyle|max fashion|westside|decathlon|croma|reliance digital|mall|store|clothing|apparel/.test(name)) {
      return 'shopping';
    }
    if (/netflix|prime video|hotstar|disney|spotify|pvr|inox|cinepolis|bookmyshow|sonyliv|zee5|youtube|gaming|steam|playstation|movies/.test(name)) {
      return 'entertainment';
    }
    if (/apollo|pharmeasy|1mg|netmeds|medplus|hospital|clinic|diagnostic|doctor|pharmacy|chemist|pathology|lab|health|dental|opticals/.test(name)) {
      return 'medical';
    }
    if (/jio|airtel|vodafone|vi bill|bsnl|tatasky|tata play|dth|dish tv|broadband|act fibernet|hathway|recharge|mobile bill/.test(name)) {
      return 'bill_payments';
    }
    if (/bescom|tata power|adani electricity|bses|mahavitaran|wbsetcl|uppcl|water board|igl|indraprastha gas|mahanagar gas|piped gas|electricity|cylinder|hp gas|indane|bharat gas/.test(name)) {
      return 'utilities';
    }
    if (/nobroker|magicbricks|housing|house rent|flat rent|society maintenance|landlord|rent payment/.test(name)) {
      return 'rent';
    }
    if (/bajaj finserv|home credit|kreditbee|lazypay|simpl|loan|emi|finance emi|car loan|personal loan/.test(name)) {
      return 'emi_loans';
    }
    if (/zerodha|groww|upstox|angelone|indmoney|motilal oswal|demat|brokerage|sharekhan/.test(name)) {
      return 'financial_services';
    }
    if (/lic|hdfc ergo|icici lombard|star health|policybazaar|care health|max life|sbi life|insurance premium/.test(name)) {
      return 'insurance';
    }
    if (/mutual fund|sip|fixed deposit|recurring deposit|sgb|gold bond|nps|ppf|crypto|coin|securities/.test(name)) {
      return 'investment';
    }
    if (/school|college|university|tuition|coaching|fees|unacademy|byju|coursera|udemy/.test(name)) {
      return 'education';
    }
    if (/cult\.fit|cure\.fit|gold gym|anytime fitness|gym|fitness|yoga|crossfit|sports club|protein/.test(name)) {
      return 'fitness';
    }
    if (/salon|spa|urban company|geetanjali|enrich|barber|parlour|grooming|haircut|cosmetics/.test(name)) {
      return 'personal_care';
    }
    if (/atm|cash wdl|cash withdrawal|nfs cash/.test(name)) {
      return 'cash_withdrawals';
    }
    if (/salary|payroll|stipend|employer|batchid|wages/.test(name)) {
      return 'salary';
    }
    if (/cashback|refund|reversal|reward|promo credit/.test(name)) {
      return 'cashback';
    }
    if (/interest|savings bank interest|fd interest|int\.pd/.test(name)) {
      return 'interest';
    }

    return 'miscellaneous';
  }

  async processScreenshotUpload(userId: string, bankProfileId: string, imageBuffer: Buffer, mimeType: string) {
    this.logger.log(`Extracting screenshot data via Vision AI for user ${userId}, bank: ${bankProfileId}`);
    const bank = await this.bankProfileRepository.findOne({
      where: { id: bankProfileId, userId, isDeleted: false },
    });
    if (!bank) {
      throw new BadRequestException('Bank account profile not found.');
    }

    const ocrResult = await this.aiService.parseImageOcr(imageBuffer, mimeType || 'image/jpeg');
    if (!ocrResult.isValid || !ocrResult.transactions || ocrResult.transactions.length === 0) {
      const errorMsg = ocrResult.rejectionReason || 'No transactions could be extracted from this screenshot. Please upload a clear bank transaction screenshot.';
      this.logger.warn(`[Screenshot Validation Rejection] User: ${userId}, Reason: ${errorMsg}`);
      throw new BadRequestException(errorMsg);
    }

    const userRules = await this.userMerchantTagRepository.find({
      where: { userId },
    }).catch(() => []);

    const enrichedTransactions = await Promise.all(
      ocrResult.transactions.map(async (tx, idx) => ({
        id: `extracted_${Date.now()}_${idx}`,
        date: tx.date,
        amount: tx.amount,
        type: tx.type,
        merchant: tx.merchant,
        category: tx.category || (await this.classifyCategory(tx.merchant, userId, userRules)),
        balanceAfter: tx.balanceAfter ?? null,
      }))
    );

    return {
      success: true,
      bankProfileId,
      detectedFinalBalance: ocrResult.finalDetectedBalance ?? null,
      transactions: enrichedTransactions,
    };
  }

  async syncStatementFile(userId: string, bankProfileId: string, fileBuffer: Buffer, mimeType?: string, password?: string) {
    this.logger.log(`Extracting bank statement data for user ${userId}, bank: ${bankProfileId}`);

    const bank = await this.bankProfileRepository.findOne({
      where: { id: bankProfileId, userId, isDeleted: false },
    });
    if (!bank) {
      throw new BadRequestException('Bank account profile not found.');
    }

    let transactions: any[] = [];
    let detectedFinalBalance: number | null = null;

    if (mimeType && mimeType.startsWith('image/')) {
      const ocrResult = await this.aiService.parseImageOcr(fileBuffer, mimeType);
      if (!ocrResult.isValid || !ocrResult.transactions || ocrResult.transactions.length === 0) {
        const errorMsg = ocrResult.rejectionReason || 'No transactions could be extracted from this statement image. Please upload a clear bank statement photo.';
        this.logger.warn(`[Statement Image Validation Rejection] User: ${userId}, Reason: ${errorMsg}`);
        throw new BadRequestException(errorMsg);
      }
      transactions = ocrResult.transactions;
      detectedFinalBalance = ocrResult.finalDetectedBalance ?? null;
    } else {
      let passwordToUse = password || bank.statementPassword || '';
      let extractedText = '';

      try {
        extractedText = await this.extractTextFromPdfBuffer(fileBuffer, passwordToUse);
      } catch (e: any) {
        if (bank.statementPassword && !password) {
          bank.statementPassword = null;
          await this.bankProfileRepository.save(bank);
        }
        throw e;
      }

      if (password && password !== bank.statementPassword) {
        bank.statementPassword = password;
        await this.bankProfileRepository.save(bank);
      }

      // Structure extracted PDF text using backend AI
      const statementResult = await this.aiService.parseStatementText(extractedText);
      if (!statementResult.isValid || !statementResult.transactions || statementResult.transactions.length === 0) {
        const errorMsg = statementResult.rejectionReason || 'No transactions could be structured from this statement. Please verify the PDF format.';
        this.logger.warn(`[Statement PDF Validation Rejection] User: ${userId}, Reason: ${errorMsg}`);
        throw new BadRequestException(errorMsg);
      }
      transactions = statementResult.transactions;
      detectedFinalBalance = statementResult.finalDetectedBalance ?? null;
    }

    const userRules = await this.userMerchantTagRepository.find({
      where: { userId },
    }).catch(() => []);

    const enrichedTransactions = await Promise.all(
      transactions.map(async (tx, idx) => ({
        id: `extracted_${Date.now()}_${idx}`,
        date: tx.date,
        amount: tx.amount,
        type: tx.type,
        merchant: tx.merchant,
        category: tx.category || (await this.classifyCategory(tx.merchant, userId, userRules)),
        balanceAfter: tx.balanceAfter ?? null,
      }))
    );

    return {
      success: true,
      bankProfileId,
      detectedFinalBalance,
      transactions: enrichedTransactions,
    };
  }

  async syncStatementPdf(userId: string, bankProfileId: string, fileBuffer: Buffer, password?: string) {
    return this.syncStatementFile(userId, bankProfileId, fileBuffer, 'application/pdf', password);
  }

  private async extractTextFromPdfBuffer(buffer: Buffer, password?: string): Promise<string> {
    const pdfExtract = new PDFExtract();
    const options: PDFExtractOptions = { password };

    return new Promise((resolve, reject) => {
      pdfExtract.extractBuffer(buffer, options, (err, data) => {
        if (err) {
          const errMsg = err.message || '';
          if (errMsg.includes('Password') || errMsg.includes('password') || errMsg.includes('decrypt') || errMsg.includes('Exception') || errMsg.includes('Incorrect') || errMsg.includes('Invalid')) {
            const isInvalidPassword = !!password;
            return reject(new BadRequestException({
              error: isInvalidPassword ? 'INVALID_PASSWORD' : 'PASSWORD_REQUIRED',
              message: isInvalidPassword ? 'Incorrect password for this PDF statement.' : 'Password is required to decrypt this PDF statement.',
            }));
          }
          return reject(new BadRequestException(`Failed to read PDF: ${errMsg}`));
        }
        if (!data || !data.pages) {
          return reject(new Error('PDF extraction returned empty pages.'));
        }

        let text = '';
        for (const page of data.pages) {
          for (const content of page.content) {
            text += content.str + ' ';
          }
          text += '\n';
        }
        resolve(text);
      });
    });
  }

  async updateSmsConsent(userId: string, id: string, smsConsent: boolean) {
    const bank = await this.bankProfileRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!bank) {
      throw new BadRequestException('Bank profile not found.');
    }
    bank.smsConsent = smsConsent;
    bank.updatedAt = Date.now();
    await this.bankProfileRepository.save(bank);
    return {
      success: true,
      bankProfileId: bank.id,
      smsConsent: bank.smsConsent,
    };
  }

  async addManualTransaction(userId: string, data: ManualTransactionDto) {
    this.logger.log(`Adding manual ${data.type} transaction for user ${userId}, bank: ${data.bankProfileId}`);

    const bank = await this.bankProfileRepository.findOne({
      where: { id: data.bankProfileId, userId, isDeleted: false },
    });
    if (!bank) {
      throw new BadRequestException('Bank profile not found or does not belong to you.');
    }

    const amount = parseFloat(String(data.amount));
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestException('Transaction amount must be a positive number.');
    }

    if (data.type !== 'debit' && data.type !== 'credit') {
      throw new BadRequestException("Transaction type must be 'debit' or 'credit'.");
    }

    const cleanCategory = (data.category || '').trim();
    if (!cleanCategory) {
      throw new BadRequestException('Category is required.');
    }

    const note = (data.note || '').trim() || cleanCategory;
    const timestamp = data.timestamp ? Number(data.timestamp) : Date.now();

    let createdRecord: any = null;

    if (data.type === 'debit') {
      const txId = 'tx_manual_' + Math.random().toString(36).substr(2, 9);
      const newTx = this.transactionRepository.create({
        id: txId,
        userId,
        amount,
        category: cleanCategory.toLowerCase(),
        merchant: note,
        timestamp,
        bankProfileId: bank.id,
        smsId: 'manual_entry',
        isAnomaly: false,
        status: 'cleared',
        updatedAt: Date.now(),
        isDeleted: false,
      });
      createdRecord = await this.transactionRepository.save(newTx);

      // Decrement bank balance
      bank.currentBalance = parseFloat(String(bank.currentBalance)) - amount;

      // Update budget spent amount if matching category exists
      try {
        const budget = await this.budgetDeclarationRepository.findOne({
          where: { userId, category: cleanCategory.toLowerCase(), isDeleted: false },
        });
        if (budget) {
          budget.spentAmount = parseFloat(String(budget.spentAmount || 0)) + amount;
          budget.updatedAt = Date.now();
          await this.budgetDeclarationRepository.save(budget);
        }
      } catch (err: any) {
        this.logger.warn(`Could not update budget spent amount: ${err.message}`);
      }
    } else {
      // Credit
      const incId = 'income_manual_' + Math.random().toString(36).substr(2, 9);
      const newInc = this.incomeRecordRepository.create({
        id: incId,
        userId,
        amount,
        category: cleanCategory.toLowerCase(),
        source: note,
        timestamp,
        bankProfileId: bank.id,
        updatedAt: Date.now(),
        isDeleted: false,
      });
      createdRecord = await this.incomeRecordRepository.save(newInc);

      // Increment bank balance
      bank.currentBalance = parseFloat(String(bank.currentBalance)) + amount;
    }

    if (note) {
      await this.saveMerchantTagRule(userId, note, cleanCategory.toLowerCase()).catch(() => {});
    }

    bank.lastSyncTimestamp = Date.now();
    bank.updatedAt = Date.now();
    await this.bankProfileRepository.save(bank);

    await this.invalidateUserSyncCache(userId);

    return {
      success: true,
      type: data.type,
      record: createdRecord,
      updatedBalance: bank.currentBalance,
      bankProfile: bank,
    };
  }

  async updateTransactionEntry(
    userId: string,
    data: {
      id: string;
      type: 'credit' | 'debit';
      amount: number;
      category: string;
      note?: string;
      updateMerchantRule?: boolean;
    },
  ) {
    this.logger.log(`Updating ${data.type} transaction entry ${data.id} for user ${userId}`);

    const newAmount = parseFloat(String(data.amount));
    if (isNaN(newAmount) || newAmount <= 0) {
      throw new BadRequestException('Amount must be a positive number.');
    }

    const cleanCategory = (data.category || '').trim();
    if (!cleanCategory) {
      throw new BadRequestException('Category is required.');
    }

    const note = (data.note || '').trim() || cleanCategory;

    if (data.type === 'debit') {
      const tx = await this.transactionRepository.findOne({
        where: { id: data.id, userId, isDeleted: false },
      });
      if (!tx) {
        throw new BadRequestException('Debit transaction not found.');
      }

      const oldAmount = parseFloat(String(tx.amount || 0));
      const amountDiff = newAmount - oldAmount;

      tx.amount = newAmount;
      tx.category = cleanCategory.toLowerCase();
      tx.merchant = note;
      tx.updatedAt = Date.now();
      await this.transactionRepository.save(tx);

      if (note && data.updateMerchantRule === true) {
        await this.saveMerchantTagRule(userId, note, cleanCategory.toLowerCase()).catch(() => {});
      }

      let updatedBalance: number | null = null;
      if (tx.bankProfileId) {
        const bank = await this.bankProfileRepository.findOne({
          where: { id: tx.bankProfileId, userId, isDeleted: false },
        });
        if (bank) {
          bank.currentBalance = parseFloat(String(bank.currentBalance)) - amountDiff;
          bank.lastSyncTimestamp = Date.now();
          bank.updatedAt = Date.now();
          await this.bankProfileRepository.save(bank);
          updatedBalance = bank.currentBalance;
        }
      }

      return {
        success: true,
        type: 'debit',
        record: tx,
        updatedBalance,
      };
    } else {
      const inc = await this.incomeRecordRepository.findOne({
        where: { id: data.id, userId, isDeleted: false },
      });
      if (!inc) {
        throw new BadRequestException('Income/credit record not found.');
      }

      const oldAmount = parseFloat(String(inc.amount || 0));
      const amountDiff = newAmount - oldAmount;

      inc.amount = newAmount;
      inc.category = cleanCategory.toLowerCase();
      inc.source = note;
      inc.updatedAt = Date.now();
      await this.incomeRecordRepository.save(inc);

      let updatedBalance: number | null = null;
      if (inc.bankProfileId) {
        const bank = await this.bankProfileRepository.findOne({
          where: { id: inc.bankProfileId, userId, isDeleted: false },
        });
        if (bank) {
          bank.currentBalance = parseFloat(String(bank.currentBalance)) + amountDiff;
          bank.lastSyncTimestamp = Date.now();
          bank.updatedAt = Date.now();
          await this.bankProfileRepository.save(bank);
          updatedBalance = bank.currentBalance;
        }
      }

      return {
        success: true,
        type: 'credit',
        record: inc,
        updatedBalance,
      };
    }
  }

  async deleteTransactionEntry(userId: string, id: string, type: 'credit' | 'debit') {
    this.logger.log(`Deleting ${type} transaction entry ${id} for user ${userId}`);

    if (type === 'debit') {
      const tx = await this.transactionRepository.findOne({
        where: { id, userId, isDeleted: false },
      });
      if (!tx) {
        throw new BadRequestException('Debit transaction not found.');
      }

      const oldAmount = parseFloat(String(tx.amount || 0));
      tx.isDeleted = true;
      tx.updatedAt = Date.now();
      await this.transactionRepository.save(tx);

      let updatedBalance: number | null = null;
      if (tx.bankProfileId) {
        const bank = await this.bankProfileRepository.findOne({
          where: { id: tx.bankProfileId, userId, isDeleted: false },
        });
        if (bank) {
          bank.currentBalance = parseFloat(String(bank.currentBalance)) + oldAmount;
          bank.lastSyncTimestamp = Date.now();
          bank.updatedAt = Date.now();
          await this.bankProfileRepository.save(bank);
          updatedBalance = bank.currentBalance;
        }
      }

      return {
        success: true,
        type: 'debit',
        deletedId: id,
        updatedBalance,
      };
    } else {
      const inc = await this.incomeRecordRepository.findOne({
        where: { id, userId, isDeleted: false },
      });
      if (!inc) {
        throw new BadRequestException('Income record not found.');
      }

      const oldAmount = parseFloat(String(inc.amount || 0));
      inc.isDeleted = true;
      inc.updatedAt = Date.now();
      await this.incomeRecordRepository.save(inc);

      let updatedBalance: number | null = null;
      if (inc.bankProfileId) {
        const bank = await this.bankProfileRepository.findOne({
          where: { id: inc.bankProfileId, userId, isDeleted: false },
        });
        if (bank) {
          bank.currentBalance = parseFloat(String(bank.currentBalance)) - oldAmount;
          bank.lastSyncTimestamp = Date.now();
          bank.updatedAt = Date.now();
          await this.bankProfileRepository.save(bank);
          updatedBalance = bank.currentBalance;
        }
      }

      return {
        success: true,
        type: 'credit',
        deletedId: id,
        updatedBalance,
      };
    }
  }

  /**
   * Create a new wealth goal
   */
  async createGoal(
    userId: string,
    dto: {
      id?: string;
      name: string;
      category?: string;
      targetAmount: number;
      currentAmount?: number;
      monthlyContribution?: number;
      expectedReturnRate?: number;
      targetDate?: number;
      priority?: string;
      color?: string;
      icon?: string;
      strategy?: string;
      linkedBankId?: string;
      entries?: any[];
    },
  ) {
    const goalId = dto.id || 'goal_' + Math.random().toString(36).substr(2, 9);
    const initialAmount = parseFloat(String(dto.currentAmount || 0));
    const todayStr = new Date().toISOString().slice(0, 10);
    const now = Date.now();

    const initialEntries = dto.entries || (initialAmount > 0 ? [{
      id: 'init_' + goalId,
      amount: initialAmount,
      at: todayStr,
      type: 'opening',
      note: 'Opening balance',
    }] : []);

    const goal = this.savingsGoalRepository.create({
      id: goalId,
      userId,
      name: dto.name,
      category: dto.category || 'custom',
      targetAmount: parseFloat(String(dto.targetAmount || 0)),
      currentAmount: initialAmount,
      monthlyContribution: parseFloat(String(dto.monthlyContribution || 0)),
      expectedReturnRate: parseFloat(String(dto.expectedReturnRate || 10)),
      targetDate: dto.targetDate || Date.now() + 365 * 24 * 60 * 60 * 1000,
      priority: dto.priority || 'medium',
      color: dto.color || '#2dba4e',
      icon: dto.icon || 'trophy',
      strategy: dto.strategy || 'equity_sip',
      linkedBankId: dto.linkedBankId || null,
      entries: initialEntries,
      streakMonths: 0,
      status: 'active',
      updatedAt: now,
      isDeleted: false,
    });

    const saved = await this.savingsGoalRepository.save(goal);

    // Record initial opening balance in history table if present
    if (initialAmount > 0) {
      try {
        const hist = this.goalHistoryRepository.create({
          id: 'init_' + goalId,
          userId,
          goalId,
          type: 'opening',
          amount: initialAmount,
          note: 'Opening balance',
          at: todayStr,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        });
        await this.goalHistoryRepository.save(hist);
      } catch (e: any) {
        this.logger.warn(`Failed to write initial goal history: ${e.message}`);
      }
    }

    return saved;
  }

  /**
   * Update an existing wealth goal
   */
  async updateGoal(
    userId: string,
    id: string,
    dto: Partial<{
      name: string;
      category: string;
      targetAmount: number;
      currentAmount: number;
      monthlyContribution: number;
      expectedReturnRate: number;
      targetDate: number;
      priority: string;
      color: string;
      icon: string;
      strategy: string;
      status: string;
      coverPresetKey: string;
      coverImageUri: string;
      linkedBankId: string | null;
      entries: any[];
    }>,
  ) {
    const goal = await this.savingsGoalRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!goal) {
      throw new BadRequestException('Goal not found.');
    }

    if (dto.name !== undefined) goal.name = dto.name;
    if (dto.category !== undefined) goal.category = dto.category;
    if (dto.targetAmount !== undefined) goal.targetAmount = parseFloat(String(dto.targetAmount));
    if (dto.currentAmount !== undefined) goal.currentAmount = parseFloat(String(dto.currentAmount));
    if (dto.monthlyContribution !== undefined) goal.monthlyContribution = parseFloat(String(dto.monthlyContribution));
    if (dto.expectedReturnRate !== undefined) goal.expectedReturnRate = parseFloat(String(dto.expectedReturnRate));
    if (dto.targetDate !== undefined) goal.targetDate = dto.targetDate;
    if (dto.priority !== undefined) goal.priority = dto.priority;
    if (dto.color !== undefined) goal.color = dto.color;
    if (dto.icon !== undefined) goal.icon = dto.icon;
    if (dto.strategy !== undefined) goal.strategy = dto.strategy;
    if (dto.status !== undefined) goal.status = dto.status;
    if (dto.coverPresetKey !== undefined) goal.coverPresetKey = dto.coverPresetKey;
    if (dto.coverImageUri !== undefined) goal.coverImageUri = dto.coverImageUri;
    if (dto.linkedBankId !== undefined) goal.linkedBankId = dto.linkedBankId || null;
    if (dto.entries !== undefined) {
      goal.entries = dto.entries;
      goal.currentAmount = Math.max(0, goal.entries.reduce((acc: number, e: any) => {
        const val = parseFloat(String(e.amount || 0));
        return acc + (e.type === 'withdraw' ? -val : val);
      }, 0));
    }
    goal.updatedAt = Date.now();

    const saved = await this.savingsGoalRepository.save(goal);
    return saved;
  }

  /**
   * Add contribution / funds to a goal
   */
  async contributeToGoal(userId: string, id: string, amount: number, note?: string) {
    const goal = await this.savingsGoalRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!goal) {
      throw new BadRequestException('Goal not found.');
    }

    const add = parseFloat(String(amount || 0));
    if (add <= 0) {
      throw new BadRequestException('Contribution amount must be greater than 0.');
    }

    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);
    const entryId = `entry_${now}_${Math.random().toString(36).substr(2, 6)}`;

    const newEntry = {
      id: entryId,
      amount: add,
      at: todayStr,
      type: 'save',
      note: note || 'Logged savings',
    };

    const currentEntries = Array.isArray(goal.entries) ? goal.entries : [];
    goal.entries = [newEntry, ...currentEntries];

    // Recalculate current amount dynamically
    goal.currentAmount = Math.max(0, goal.entries.reduce((acc: number, e: any) => {
      const val = parseFloat(String(e.amount || 0));
      return acc + (e.type === 'withdraw' ? -val : val);
    }, 0));

    goal.streakMonths = (goal.streakMonths || 0) + 1;
    if (goal.currentAmount >= parseFloat(String(goal.targetAmount))) {
      goal.status = 'achieved';
    }
    goal.updatedAt = now;

    // Save in history table
    try {
      const hist = this.goalHistoryRepository.create({
        id: entryId,
        userId,
        goalId: id,
        type: 'save',
        amount: add,
        note: note || 'Logged savings',
        at: todayStr,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      });
      await this.goalHistoryRepository.save(hist);
    } catch (e: any) {
      this.logger.warn(`Failed to save goal history entry: ${e.message}`);
    }

    const saved = await this.savingsGoalRepository.save(goal);
    return saved;
  }

  /**
   * Withdraw funds from a goal
   */
  async withdrawFromGoal(userId: string, id: string, amount: number, note?: string) {
    try {
      this.logger.log(`[withdrawFromGoal] User: ${userId}, Goal: ${id}, Amount: ${amount}`);
      const goal = await this.savingsGoalRepository.findOne({
        where: { id, userId, isDeleted: false },
      });
      if (!goal) {
        this.logger.warn(`[withdrawFromGoal] Goal ${id} not found for user ${userId}`);
        throw new BadRequestException('Goal not found.');
      }

      const cur = parseFloat(String(goal.currentAmount || 0));
      const withdrawAmt = parseFloat(String(amount || 0));
      if (withdrawAmt <= 0) {
        throw new BadRequestException('Withdrawal amount must be greater than 0.');
      }
      if (withdrawAmt > cur) {
        this.logger.warn(`[withdrawFromGoal] withdrawAmt (${withdrawAmt}) > cur (${cur}) for goal ${id}`);
        throw new BadRequestException(`Withdrawal amount (₹${withdrawAmt}) exceeds available savings (₹${cur}).`);
      }

    const now = Date.now();
    const todayStr = new Date().toISOString().slice(0, 10);
    const entryId = `entry_${now}_${Math.random().toString(36).substr(2, 6)}`;

    const newEntry = {
      id: entryId,
      amount: withdrawAmt,
      at: todayStr,
      type: 'withdraw',
      note: note || 'Goal withdrawal',
    };

    const currentEntries = Array.isArray(goal.entries) ? goal.entries : [];
    goal.entries = [newEntry, ...currentEntries];

    // Recalculate current amount dynamically
    goal.currentAmount = Math.max(0, goal.entries.reduce((acc: number, e: any) => {
      const val = parseFloat(String(e.amount || 0));
      return acc + (e.type === 'withdraw' ? -val : val);
    }, 0));

    if (goal.currentAmount < parseFloat(String(goal.targetAmount)) && goal.status === 'achieved') {
      goal.status = 'active';
    }
    goal.updatedAt = now;

    // Save in history table
    try {
      const hist = this.goalHistoryRepository.create({
        id: entryId,
        userId,
        goalId: id,
        type: 'withdraw',
        amount: withdrawAmt,
        note: note || 'Goal withdrawal',
        at: todayStr,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      });
      await this.goalHistoryRepository.save(hist);
    } catch (e: any) {
      this.logger.warn(`Failed to save goal withdrawal history entry: ${e.message}`);
    }

    const saved = await this.savingsGoalRepository.save(goal);
    return saved;
  } catch (err: any) {
    this.logger.error(`[withdrawFromGoal] Error: ${err.message}`, err.stack);
    throw err;
  }
}

  /**
   * Delete an entry from a goal's history and reverse its financial effect:
   * - Deleting an added amount ('save' or 'opening') deducts that amount from current balance
   * - Deleting a withdrawal ('withdraw') restores that withdrawn amount back into current balance
   */
  async deleteGoalEntry(userId: string, goalId: string, entryId: string) {
    const goal = await this.savingsGoalRepository.findOne({
      where: { id: goalId, userId, isDeleted: false },
    });
    if (!goal) {
      throw new BadRequestException('Goal not found.');
    }

    const currentEntries = Array.isArray(goal.entries) ? goal.entries : [];
    const remainingEntries = currentEntries.filter((e: any) => e.id !== entryId);
    goal.entries = remainingEntries;

    // Recalculate current amount strictly based on remaining entries
    goal.currentAmount = Math.max(0, goal.entries.reduce((acc: number, e: any) => {
      const val = parseFloat(String(e.amount || 0));
      return acc + (e.type === 'withdraw' ? -val : val);
    }, 0));

    const target = parseFloat(String(goal.targetAmount || 0));
    if (goal.currentAmount < target && goal.status === 'achieved') {
      goal.status = 'active';
    } else if (goal.currentAmount >= target && goal.status === 'active') {
      goal.status = 'achieved';
    }
    goal.updatedAt = Date.now();

    // Mark as deleted in GoalHistory table
    try {
      await this.goalHistoryRepository.update(
        { id: entryId, userId, goalId },
        { isDeleted: true, updatedAt: Date.now() },
      );
    } catch (e: any) {
      this.logger.warn(`Failed to soft-delete from goalHistoryRepository: ${e.message}`);
    }

    const saved = await this.savingsGoalRepository.save(goal);
    return saved;
  }

  /**
   * Retrieve full audit history of goal transactions
   */
  async getGoalHistory(userId: string, goalId: string) {
    try {
      this.logger.log(`[getGoalHistory] Fetching history for user: ${userId}, goal: ${goalId}`);
      const history = await this.goalHistoryRepository.find({
        where: { userId, goalId, isDeleted: false },
        order: { createdAt: 'DESC' },
      });
      return history;
    } catch (err: any) {
      this.logger.error(`[getGoalHistory] Error: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * Delete a wealth goal (soft delete)
   */
  async deleteGoal(userId: string, id: string) {
    const goal = await this.savingsGoalRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!goal) {
      throw new BadRequestException('Goal not found.');
    }

    goal.isDeleted = true;
    goal.updatedAt = Date.now();
    await this.savingsGoalRepository.save(goal);
    return { success: true, deletedId: id };
  }

  /**
   * Create a new custom-date or monthly budget
   */
  async createBudget(
    userId: string,
    dto: {
      id?: string;
      name?: string;
      category?: string;
      limitAmount: number;
      period?: string;
      periodType?: string;
      startDate?: number;
      endDate?: number;
      isOverall?: boolean;
      fixedObligations?: number;
      isManuallyActivated?: boolean;
      effectiveStartDate?: number;
      parentBudgetId?: string;
      isPaused?: boolean;
    },
  ) {
    const budget = this.budgetDeclarationRepository.create({
      id: dto.id || 'budget_' + Math.random().toString(36).substr(2, 9),
      userId,
      name: dto.name || (dto.isOverall ? 'Total Spending Budget' : dto.category || 'Custom Budget'),
      category: dto.isOverall ? 'all' : (dto.category?.toLowerCase() || 'other_expense'),
      limitAmount: parseFloat(String(dto.limitAmount || 0)),
      spentAmount: 0,
      period: dto.period || 'Current Cycle',
      periodType: dto.periodType || 'monthly',
      startDate: dto.startDate ? Number(dto.startDate) : Date.now(),
      endDate: dto.endDate ? Number(dto.endDate) : Date.now() + 30 * 24 * 60 * 60 * 1000,
      isOverall: !!dto.isOverall,
      fixedObligations: parseFloat(String(dto.fixedObligations || 0)),
      isManuallyActivated: !!dto.isManuallyActivated,
      effectiveStartDate: dto.effectiveStartDate ? Number(dto.effectiveStartDate) : null,
      parentBudgetId: dto.parentBudgetId || null,
      isPaused: !!dto.isPaused,
      updatedAt: Date.now(),
      isDeleted: false,
    });

    const saved = await this.budgetDeclarationRepository.save(budget);
    return saved;
  }

  /**
   * Update an existing budget ceiling or dates
   */
  async updateBudget(
    userId: string,
    id: string,
    dto: Partial<{
      name: string;
      category: string;
      limitAmount: number;
      spentAmount: number;
      period: string;
      periodType: string;
      startDate: number;
      endDate: number;
      isOverall: boolean;
      fixedObligations: number;
      isManuallyActivated: boolean;
      effectiveStartDate: number;
      parentBudgetId: string;
      isPaused: boolean;
    }>,
  ) {
    const budget = await this.budgetDeclarationRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!budget) {
      throw new BadRequestException('Budget not found.');
    }

    if (dto.name !== undefined) budget.name = dto.name;
    if (dto.category !== undefined) budget.category = dto.category.toLowerCase();
    if (dto.limitAmount !== undefined) budget.limitAmount = parseFloat(String(dto.limitAmount));
    if (dto.spentAmount !== undefined) budget.spentAmount = parseFloat(String(dto.spentAmount));
    if (dto.period !== undefined) budget.period = dto.period;
    if (dto.periodType !== undefined) budget.periodType = dto.periodType;
    if (dto.startDate !== undefined) budget.startDate = Number(dto.startDate);
    if (dto.endDate !== undefined) budget.endDate = Number(dto.endDate);
    if (dto.isOverall !== undefined) budget.isOverall = !!dto.isOverall;
    if (dto.fixedObligations !== undefined) budget.fixedObligations = parseFloat(String(dto.fixedObligations));
    if (dto.isManuallyActivated !== undefined) budget.isManuallyActivated = !!dto.isManuallyActivated;
    if (dto.effectiveStartDate !== undefined) budget.effectiveStartDate = dto.effectiveStartDate ? Number(dto.effectiveStartDate) : null;
    if (dto.parentBudgetId !== undefined) budget.parentBudgetId = dto.parentBudgetId || null;
    if (dto.isPaused !== undefined) budget.isPaused = !!dto.isPaused;

    budget.updatedAt = Date.now();
    return this.budgetDeclarationRepository.save(budget);
  }

  /**
   * Soft-delete a budget
   */
  async deleteBudget(userId: string, id: string) {
    const budget = await this.budgetDeclarationRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!budget) {
      throw new BadRequestException('Budget not found.');
    }
    budget.isDeleted = true;
    budget.updatedAt = Date.now();
    await this.budgetDeclarationRepository.save(budget);
    return { success: true, message: 'Budget deleted successfully.' };
  }

  /**
   * Directly ingests SMS from native Android receiver without React Native overhead.
   */
  async ingestDirectSms(userId: string, data: { sender: string; body: string; timestamp?: number }) {
    return this.withUserLock(userId, async () => {
    this.logger.log(`Direct native SMS ingestion for user ${userId} from ${data.sender}`);
    const parsed = parseSMS(data.sender, data.body);
    if (!parsed) {
      this.logger.log(`Direct SMS ignored: Not a financial transaction pattern`);
      return { success: false, reason: 'not_transaction_pattern' };
    }

    const parsedSuffix = (parsed.accountSuffix || '').replace(/\D/g, '').slice(-4);

    const bankProfiles = await this.bankProfileRepository.find({
      where: { userId, isDeleted: false },
    });

    let matchedBank =
      (parsedSuffix
        ? bankProfiles.find((b) => {
            const dbSuffix = (b.accountNumberSuffix || '').replace(/\D/g, '').slice(-4);
            const suffixMatches = dbSuffix && dbSuffix === parsedSuffix;
            const senderMatches = this.matchesSmsSender(data.sender, b.smsSenderId);
            return suffixMatches && senderMatches;
          }) ||
          bankProfiles.find((b) => {
            const dbSuffix = (b.accountNumberSuffix || '').replace(/\D/g, '').slice(-4);
            return dbSuffix && dbSuffix === parsedSuffix;
          })
        : null);

    // 2. If not matched by suffix, match by sender ID or bank name (crucial for UPI transactions)
    if (!matchedBank) {
      matchedBank = bankProfiles.find((b) => {
        const senderMatches = this.matchesSmsSender(data.sender, b.smsSenderId);
        const nameMatches =
          parsed.bankName &&
          parsed.bankName !== 'Bank' &&
          (b.bankName || '').toLowerCase().includes(parsed.bankName.toLowerCase());
        return senderMatches || nameMatches;
      });
    }

    // 3. Fallback to any active bank profile if user has bank accounts
    if (!matchedBank && bankProfiles.length > 0) {
      matchedBank = bankProfiles[0];
    }

    // 4. If user has NO bank profiles at all, auto-create a primary bank profile
    if (!matchedBank) {
      const newBankId = 'bank_auto_' + Math.random().toString(36).substr(2, 9);
      matchedBank = this.bankProfileRepository.create({
        id: newBankId,
        userId,
        bankName: parsed.bankName && parsed.bankName !== 'Bank' ? parsed.bankName : 'Primary Bank',
        accountNumberSuffix: parsedSuffix || '0000',
        accountType: 'Savings',
        currentBalance: parsed.amount,
        smsConsent: true,
        smsSenderId: data.sender || 'BANK',
        updatedAt: Date.now(),
        isDeleted: false,
      });
      await this.bankProfileRepository.save(matchedBank);
      this.logger.log(`Auto-created bank profile ${matchedBank.bankName} for user ${userId}`);
    }

    if (matchedBank.smsConsent === false) {
      this.logger.log(`SMS consent disabled for bank ${matchedBank.bankName}`);
      return { success: false, reason: 'consent_disabled' };
    }

    const txTime = data.timestamp && !isNaN(Number(data.timestamp)) ? Number(data.timestamp) : Date.now();
    const parsedDate = new Date(txTime);
    const startOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0).getTime();
    const endOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 23, 59, 59, 999).getTime();

    const [existingTxs, existingIncome] = await Promise.all([
      this.transactionRepository.find({
        where: { userId, bankProfileId: matchedBank.id },
      }),
      this.incomeRecordRepository.find({
        where: { userId, bankProfileId: matchedBank.id },
      }),
    ]);

    const incomingRef = parsed.referenceId;
    const cleanBody = (data.body || '').replace(/\s+/g, ' ').trim();
    let bodyHash = 0;
    for (let i = 0; i < cleanBody.length; i++) {
      bodyHash = ((bodyHash << 5) - bodyHash) + cleanBody.charCodeAt(i);
      bodyHash |= 0;
    }
    const directSmsId = incomingRef ? `ref_${incomingRef}` : `sms_${Math.abs(bodyHash)}`;

    let ingested = false;
    let newBalance = parseFloat(String(matchedBank.currentBalance || 0));

    if (parsed.type === 'debit') {
      const isDuplicate = existingTxs.some((tx) => {
        // 1. Authoritative UPI Ref / RRN comparison
        if (incomingRef && (tx.smsId === `ref_${incomingRef}` || (tx as any).referenceId === incomingRef)) {
          return true;
        }
        if (tx.smsId && tx.smsId === directSmsId) {
          return true;
        }
        if (incomingRef && tx.smsId && tx.smsId.startsWith('ref_') && tx.smsId !== `ref_${incomingRef}`) {
          return false;
        }

        const t = Number(tx.timestamp);
        const sameAmount = Math.abs(tx.amount - parsed.amount) < 0.01;
        const isSameDay = (t >= startOfDay && t <= endOfDay) || Math.abs(t - txTime) < 86400000;
        if (!sameAmount || !isSameDay) return false;

        // 2. Different merchant is NEVER a duplicate
        const normExisting = (tx.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const normIncoming = (parsed.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normExisting && normIncoming && normExisting !== normIncoming) {
          return false;
        }

        // 3. If same merchant and same amount, only duplicate if timestamps are within 5 seconds with same SMS ID
        return Math.abs(t - txTime) < 5000 && tx.smsId === directSmsId;
      });

      if (isDuplicate) {
        return { success: true, duplicate: true, message: 'Transaction already recorded or intentionally deleted' };
      }

      const txId = 'tx_direct_' + Math.random().toString(36).substr(2, 9);
      const predictedCategory = parsed.merchant
        ? await this.classifyCategory(parsed.merchant, userId)
        : 'miscellaneous';

      const newTx = this.transactionRepository.create({
        id: txId,
        userId,
        amount: parsed.amount,
        category: predictedCategory,
        merchant: parsed.merchant,
        timestamp: txTime,
        bankProfileId: matchedBank.id,
        smsId: directSmsId,
        isAnomaly: parsed.amount > 5000,
        status: 'cleared',
        updatedAt: Date.now(),
        isDeleted: false,
      });

      await this.transactionRepository.save(newTx);
      if (parsed.availableBalance !== undefined && !isNaN(parsed.availableBalance) && parsed.availableBalance >= 0) {
        newBalance = parsed.availableBalance;
      } else {
        newBalance = Math.max(0, newBalance - parsed.amount);
      }
      ingested = true;
    } else {
      const isDuplicate = existingIncome.some((inc) => {
        if (incomingRef && ((inc as any).smsId === `ref_${incomingRef}` || (inc as any).referenceId === incomingRef)) {
          return true;
        }
        if ((inc as any).smsId && (inc as any).smsId === directSmsId) {
          return true;
        }
        if (incomingRef && (inc as any).smsId && (inc as any).smsId.startsWith('ref_') && (inc as any).smsId !== `ref_${incomingRef}`) {
          return false;
        }

        const t = Number(inc.timestamp);
        const sameAmount = Math.abs(inc.amount - parsed.amount) < 0.01;
        const isSameDay = (t >= startOfDay && t <= endOfDay) || Math.abs(t - txTime) < 86400000;
        if (!sameAmount || !isSameDay) return false;

        const normExisting = (inc.source || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const normIncoming = (parsed.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normExisting && normIncoming && normExisting !== normIncoming) {
          return false;
        }

        return Math.abs(t - txTime) < 5000 && (inc as any).smsId === directSmsId;
      });

      if (isDuplicate) {
        return { success: true, duplicate: true, message: 'Income already recorded or intentionally deleted' };
      }

      const incId = 'income_direct_' + Math.random().toString(36).substr(2, 9);
      const newInc = this.incomeRecordRepository.create({
        id: incId,
        userId,
        amount: parsed.amount,
        source: parsed.merchant,
        category: parsed.isSalary ? 'Salary' : 'Other Income',
        timestamp: txTime,
        bankProfileId: matchedBank.id,
        updatedAt: Date.now(),
        isDeleted: false,
      });

      await this.incomeRecordRepository.save(newInc);
      if (parsed.availableBalance !== undefined && !isNaN(parsed.availableBalance) && parsed.availableBalance >= 0) {
        newBalance = parsed.availableBalance;
      } else {
        newBalance += parsed.amount;
      }
      ingested = true;
    }

    if (ingested) {
      matchedBank.currentBalance = matchedBank.accountType === 'Savings' ? Math.max(0, newBalance) : newBalance;
      matchedBank.lastSyncTimestamp = Date.now();
      matchedBank.updatedAt = Date.now();
      await this.bankProfileRepository.save(matchedBank);
    }

    await this.invalidateUserSyncCache(userId);

    return {
      success: true,
      ingested,
      type: parsed.type,
      amount: parsed.amount,
      updatedBalance: newBalance,
      bankName: matchedBank.bankName,
      accountSuffix: matchedBank.accountNumberSuffix,
      merchant: parsed.merchant,
    };
    });
  }

  /**
   * Helper to check if incoming SMS sender header matches any of the bank's configured tags.
   */
  private matchesSmsSender(incomingSender: string, bankSmsSenderId?: string | null): boolean {
    if (!incomingSender) return false;
    if (!bankSmsSenderId) return true;
    const tags = bankSmsSenderId
      .split(/[,;\s]+/)
      .map((t) => t.replace(/[^A-Za-z0-9]/g, '').toUpperCase().trim())
      .filter((t) => t.length >= 3);
    if (tags.length === 0) return true;

    const cleanSender = incomingSender
      .toUpperCase()
      .replace(/^[A-Z]{2}-/i, '')
      .replace(/[^A-Z0-9]/g, '')
      .trim();

    return tags.some(
      (tag) => cleanSender === tag || cleanSender.includes(tag) || tag.includes(cleanSender),
    );
  }

  /**
   * Persistently excludes a transaction from budget calculations without deleting it from bank statements.
   */
  async excludeTransactionFromBudget(userId: string, data: { transactionId: string; budgetId?: string }) {
    if (!data.transactionId) {
      throw new BadRequestException('Transaction ID is required.');
    }
    const existing = await this.budgetExclusionRepository.findOne({
      where: { userId, transactionId: data.transactionId },
    });
    const now = Date.now();
    if (existing) {
      existing.isDeleted = false;
      existing.budgetId = data.budgetId || existing.budgetId;
      existing.updatedAt = now;
      await this.budgetExclusionRepository.save(existing);
      await this.invalidateUserSyncCache(userId);
      return { success: true, exclusion: existing };
    }
    const exclusion = this.budgetExclusionRepository.create({
      id: 'b_excl_' + Math.random().toString(36).substr(2, 9),
      userId,
      transactionId: data.transactionId,
      budgetId: data.budgetId || null,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });
    await this.budgetExclusionRepository.save(exclusion);
    await this.invalidateUserSyncCache(userId);
    return { success: true, exclusion };
  }

  /**
   * Restores a previously excluded transaction back to budget calculations.
   */
  async restoreTransactionToBudget(userId: string, data: { transactionId: string }) {
    if (!data.transactionId) {
      throw new BadRequestException('Transaction ID is required.');
    }
    const existing = await this.budgetExclusionRepository.findOne({
      where: { userId, transactionId: data.transactionId, isDeleted: false },
    });
    if (existing) {
      existing.isDeleted = true;
      existing.updatedAt = Date.now();
      await this.budgetExclusionRepository.save(existing);
    }
    await this.invalidateUserSyncCache(userId);
    return { success: true, restoredId: data.transactionId };
  }
}
