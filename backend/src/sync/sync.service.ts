import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankProfile } from './entities/bank-profile.entity';
import { Transaction } from './entities/transaction.entity';
import { BudgetDeclaration } from './entities/budget-declaration.entity';
import { SavingsGoal } from './entities/savings-goal.entity';
import { NetWorthSnapshot } from './entities/net-worth-snapshot.entity';
import { IncomeRecord } from './entities/income-record.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class SyncService {
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
    @InjectRepository(NetWorthSnapshot)
    private readonly netWorthSnapshotRepository: Repository<NetWorthSnapshot>,
    @InjectRepository(IncomeRecord)
    private readonly incomeRecordRepository: Repository<IncomeRecord>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async sync(userId: string) {
    this.logger.log(`Performing data synchronization for user: ${userId}`);

    const [transactions, budgets, goals, bankProfiles] = await Promise.all([
      this.transactionRepository.find({ where: { userId, isDeleted: false } }),
      this.budgetDeclarationRepository.find({ where: { userId, isDeleted: false } }),
      this.savingsGoalRepository.find({ where: { userId, isDeleted: false } }),
      this.bankProfileRepository.find({ where: { userId, isDeleted: false } }),
    ]);

    return {
      transactions,
      budgets,
      goals,
      bankProfiles,
    };
  }

  async createBankProfile(userId: string, data: { id: string; bankName: string; accountNumberSuffix: string; currentBalance: number }) {
    this.logger.log(`Creating bank profile for user: ${userId}`);

    const count = await this.bankProfileRepository.count({
      where: { userId, isDeleted: false },
    });
    if (count >= 3) {
      throw new BadRequestException('Maximum bank limit reached. You can only link up to 3 bank accounts.');
    }

    const bankProfile = this.bankProfileRepository.create({
      id: data.id,
      userId,
      bankName: data.bankName,
      accountNumberSuffix: data.accountNumberSuffix,
      currentBalance: data.currentBalance,
      lastSyncTimestamp: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
    });
    return this.bankProfileRepository.save(bankProfile);
  }

  async deleteBankProfile(userId: string, id: string) {
    this.logger.log(`Deleting bank profile: ${id} for user: ${userId}`);
    const bankProfile = await this.bankProfileRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!bankProfile) {
      throw new BadRequestException('Bank profile not found or already deleted.');
    }
    bankProfile.isDeleted = true;
    bankProfile.updatedAt = Date.now();
    await this.bankProfileRepository.save(bankProfile);
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
    const monthsBack = 6;
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
}
