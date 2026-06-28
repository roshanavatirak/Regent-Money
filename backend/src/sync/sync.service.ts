import { Injectable, Logger, BadRequestException, UnauthorizedException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BankProfile } from './entities/bank-profile.entity';
import { Transaction } from './entities/transaction.entity';
import { BudgetDeclaration } from './entities/budget-declaration.entity';
import { SavingsGoal } from './entities/savings-goal.entity';
import { NetWorthSnapshot } from './entities/net-worth-snapshot.entity';
import { IncomeRecord } from './entities/income-record.entity';
import { User } from '../users/entities/user.entity';
import { OcrSyncDto } from './dto/ocr-sync.dto';
import { PDFExtract, PDFExtractOptions } from 'pdf.js-extract';

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
    @InjectRepository(NetWorthSnapshot)
    private readonly netWorthSnapshotRepository: Repository<NetWorthSnapshot>,
    @InjectRepository(IncomeRecord)
    private readonly incomeRecordRepository: Repository<IncomeRecord>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
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
      this.logger.log('BankProfile schema checks and updates completed successfully.');
    } catch (e: any) {
      this.logger.error(`Error checking/updating BankProfile schema: ${e.message}`, e.stack);
    }
  }

  async sync(userId: string) {
    this.logger.log(`Performing data synchronization for user: ${userId}`);

    const [transactions, budgets, goals, bankProfiles] = await Promise.all([
      this.transactionRepository.find({ where: { userId, isDeleted: false } }),
      this.budgetDeclarationRepository.find({ where: { userId, isDeleted: false } }),
      this.savingsGoalRepository.find({ where: { userId, isDeleted: false } }),
      this.bankProfileRepository.find({ where: { userId, isDeleted: false } }),
    ]);

    const now = Date.now();
    for (const bank of bankProfiles) {
      bank.lastSyncTimestamp = now;
    }
    if (bankProfiles.length > 0) {
      await this.bankProfileRepository.save(bankProfiles);
    }

    return {
      transactions,
      body: bankProfiles, // Keep matching controller structures if they expect specific returns
      budgets,
      goals,
      bankProfiles,
    };
  }

  async createBankProfile(
    userId: string,
    data: {
      id: string;
      bankName: string;
      accountNumberSuffix: string;
      currentBalance: number;
      smsSenderId?: string;
      upiId?: string;
      customKeywords?: string;
    },
  ) {
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
      smsSenderId: data.smsSenderId || null,
      upiId: data.upiId || null,
      customKeywords: data.customKeywords || null,
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

  async updateTransactionCategory(userId: string, id: string, category: string) {
    const tx = await this.transactionRepository.findOne({ where: { id, userId, isDeleted: false } });
    if (!tx) {
      throw new BadRequestException('Transaction not found or deleted.');
    }
    tx.category = category;
    tx.updatedAt = Date.now();
    return this.transactionRepository.save(tx);
  }

  async syncOcrTransactions(userId: string, data: OcrSyncDto) {
    this.logger.log(`Syncing OCR transactions for user ${userId}, bank: ${data.bankProfileId}`);
    
    const bank = await this.bankProfileRepository.findOne({
      where: { id: data.bankProfileId, userId, isDeleted: false },
    });
    if (!bank) {
      throw new BadRequestException('Bank account profile not found.');
    }

    const [existingTxs, existingIncome] = await Promise.all([
      this.transactionRepository.find({
        where: { userId, bankProfileId: data.bankProfileId, isDeleted: false },
      }),
      this.incomeRecordRepository.find({
        where: { userId, bankProfileId: data.bankProfileId, isDeleted: false },
      }),
    ]);

    let addedTransactionsCount = 0;
    let addedIncomeCount = 0;
    let netBalanceChange = 0;

    const newTransactions: Transaction[] = [];
    const newIncomeRecords: IncomeRecord[] = [];

    for (const item of data.transactions) {
      const amount = parseFloat(String(item.amount));
      if (isNaN(amount) || amount <= 0) continue;

      const parsedDate = new Date(item.date);
      if (isNaN(parsedDate.getTime())) continue;

      const startOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0).getTime();
      const endOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 23, 59, 59, 999).getTime();

      if (item.type === 'debit') {
        const isDuplicate = existingTxs.some((tx) => {
          const txTime = Number(tx.timestamp);
          return Math.abs(tx.amount - amount) < 0.01 && txTime >= startOfDay && txTime <= endOfDay;
        }) || newTransactions.some((tx) => {
          const txTime = Number(tx.timestamp);
          return Math.abs(tx.amount - amount) < 0.01 && txTime >= startOfDay && txTime <= endOfDay;
        });

        if (!isDuplicate) {
          const txId = 'tx_ocr_' + Math.random().toString(36).substr(2, 9);
          const newTx = this.transactionRepository.create({
            id: txId,
            userId,
            amount,
            category: item.merchant ? this.classifyCategory(item.merchant) : 'shopping',
            merchant: item.merchant || 'Merchant',
            timestamp: parsedDate.getTime(),
            bankProfileId: data.bankProfileId,
            smsId: 'ocr_extracted',
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
          return Math.abs(inc.amount - amount) < 0.01 && incTime >= startOfDay && incTime <= endOfDay;
        }) || newIncomeRecords.some((inc) => {
          const incTime = Number(inc.timestamp);
          return Math.abs(inc.amount - amount) < 0.01 && incTime >= startOfDay && incTime <= endOfDay;
        });

        if (!isDuplicate) {
          const incId = 'income_ocr_' + Math.random().toString(36).substr(2, 9);
          const newInc = this.incomeRecordRepository.create({
            id: incId,
            userId,
            amount,
            source: item.merchant || 'Direct Credit',
            timestamp: parsedDate.getTime(),
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

    if (addedTransactionsCount > 0 || addedIncomeCount > 0) {
      bank.currentBalance = parseFloat(String(bank.currentBalance)) + netBalanceChange;
      bank.lastSyncTimestamp = Date.now();
      bank.updatedAt = Date.now();
      await this.bankProfileRepository.save(bank);
    }

    return {
      success: true,
      addedTransactionsCount,
      addedIncomeCount,
      updatedBalance: bank.currentBalance,
    };
  }

  private classifyCategory(merchantName: string): string {
    const name = merchantName.toLowerCase();
    if (name.includes('uber') || name.includes('ola') || name.includes('rapido') || name.includes('metro') || name.includes('fuel') || name.includes('petrol')) {
      return 'transport';
    }
    if (name.includes('zomato') || name.includes('swiggy') || name.includes('restaurant') || name.includes('food') || name.includes('cafe') || name.includes('starbucks')) {
      return 'food';
    }
    if (name.includes('amazon') || name.includes('flipkart') || name.includes('myntra') || name.includes('mall') || name.includes('store') || name.includes('clothing')) {
      return 'shopping';
    }
    if (name.includes('netflix') || name.includes('spotify') || name.includes('cinema') || name.includes('movies') || name.includes('hotstar')) {
      return 'entertainment';
    }
    if (name.includes('electricity') || name.includes('water') || name.includes('recharge') || name.includes('jio') || name.includes('airtel') || name.includes('bill')) {
      return 'utilities';
    }
    return 'shopping';
  }

  async syncStatementPdf(userId: string, bankProfileId: string, fileBuffer: Buffer, password?: string) {
    this.logger.log(`Processing bank statement PDF upload for user ${userId}, bank: ${bankProfileId}`);

    const bank = await this.bankProfileRepository.findOne({
      where: { id: bankProfileId, userId, isDeleted: false },
    });
    if (!bank) {
      throw new BadRequestException('Bank account profile not found.');
    }

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

    return {
      success: true,
      text: extractedText,
    };
  }

  private async extractTextFromPdfBuffer(buffer: Buffer, password?: string): Promise<string> {
    const pdfExtract = new PDFExtract();
    const options: PDFExtractOptions = { password };

    return new Promise((resolve, reject) => {
      pdfExtract.extractBuffer(buffer, options, (err, data) => {
        if (err) {
          const errMsg = err.message || '';
          if (errMsg.includes('Password') || errMsg.includes('password') || errMsg.includes('decrypt') || errMsg.includes('Exception') || errMsg.includes('Incorrect') || errMsg.includes('Invalid')) {
            return reject(new BadRequestException({
              error: 'PASSWORD_REQUIRED',
              message: 'Password is required or incorrect for this PDF statement.',
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
}
