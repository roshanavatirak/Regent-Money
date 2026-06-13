import { supabase } from './supabaseClient';
import { useAuthStore } from '../store';

export const injectMockData = async () => {
  if (!supabase) {
    console.warn('Supabase not configured, cannot seed mock data.');
    return;
  }

  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    console.error('No logged in user session. Cannot seed mock data.');
    return;
  }

  try {
    const client = supabase as any;

    // 1. Clear existing user database tables in Supabase to prevent double insertion
    await client.schema('finance').from('transactions').delete().eq('user_id', userId);
    await client.schema('core').from('bank_profiles').delete().eq('user_id', userId);
    await client.schema('finance').from('budget_declarations').delete().eq('user_id', userId);
    await client.schema('wealth').from('savings_goals').delete().eq('user_id', userId);
    await client.schema('wealth').from('net_worth_snapshots').delete().eq('user_id', userId);
    await client.schema('finance').from('income_records').delete().eq('user_id', userId);

    console.log('[MockInjector] Cleared user records from Supabase tables for mock seeding...');

    // 2. Insert Bank Profiles
    const hdfcId = 'bank_hdfc_' + Math.random().toString(36).substr(2, 9);
    const sbiId = 'bank_sbi_' + Math.random().toString(36).substr(2, 9);

    const { error: bankError } = await client.schema('core').from('bank_profiles').insert([
      {
        id: hdfcId,
        user_id: userId,
        bank_name: 'HDFC Bank',
        account_number_suffix: '4820',
        current_balance: 74320.5,
        last_sync_timestamp: Date.now(),
        updated_at: Date.now(),
        is_deleted: false,
      },
      {
        id: sbiId,
        user_id: userId,
        bank_name: 'State Bank of India',
        account_number_suffix: '9105',
        current_balance: 15420.0,
        last_sync_timestamp: Date.now(),
        updated_at: Date.now(),
        is_deleted: false,
      }
    ]);

    if (bankError) throw bankError;
    console.log('[MockInjector] Seeded Bank Profiles...');

    // 3. Insert Budgets
    const categories = ['food', 'transport', 'shopping', 'utilities', 'entertainment'];
    const limits = [12000, 4000, 8000, 5000, 3000];
    const spents = [8420, 2150, 6800, 4200, 1500];

    const budgetsPayload = categories.map((cat, i) => ({
      id: 'budget_' + cat + '_' + Math.random().toString(36).substr(2, 9),
      user_id: userId,
      category: cat,
      limit_amount: limits[i],
      spent_amount: spents[i],
      period: '2026-06',
      updated_at: Date.now(),
      is_deleted: false,
    }));

    const { error: budgetError } = await client.schema('finance').from('budget_declarations').insert(budgetsPayload);
    if (budgetError) throw budgetError;
    console.log('[MockInjector] Seeded Budgets...');

    // 4. Insert Savings Goals
    const { error: goalError } = await client.schema('wealth').from('savings_goals').insert([
      {
        id: 'goal_emerg_' + Math.random().toString(36).substr(2, 9),
        user_id: userId,
        name: 'Emergency Fund',
        target_amount: 150000,
        current_amount: 90000,
        target_date: Date.now() + 180 * 24 * 60 * 60 * 1000, // 6 months from now
        status: 'active',
        updated_at: Date.now(),
        is_deleted: false,
      },
      {
        id: 'goal_mac_' + Math.random().toString(36).substr(2, 9),
        user_id: userId,
        name: 'New Macbook Pro',
        target_amount: 200000,
        current_amount: 45000,
        target_date: Date.now() + 90 * 24 * 60 * 60 * 1000, // 3 months from now
        status: 'active',
        updated_at: Date.now(),
        is_deleted: false,
      }
    ]);

    if (goalError) throw goalError;
    console.log('[MockInjector] Seeded Goals...');

    // 5. Insert Net Worth Snapshots
    const snapshotsPayload = [];
    const monthsBack = 6;
    for (let i = monthsBack; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const timestamp = date.getTime();
      const totalAssets = 350000 + (monthsBack - i) * 20000;
      const totalLiabilities = 120000 - (monthsBack - i) * 5000;
      snapshotsPayload.push({
        id: 'snapshot_' + i + '_' + Math.random().toString(36).substr(2, 9),
        user_id: userId,
        timestamp,
        total_assets: totalAssets,
        total_liabilities: totalLiabilities,
        net_worth: totalAssets - totalLiabilities,
        updated_at: Date.now(),
        is_deleted: false,
      });
    }

    const { error: snapshotError } = await client.schema('wealth').from('net_worth_snapshots').insert(snapshotsPayload);
    if (snapshotError) throw snapshotError;
    console.log('[MockInjector] Seeded Net Worth Snapshots...');

    // 6. Insert Historical Income Records
    const salaryAmounts = [95000, 95000, 95000];
    const incomePayload = [];
    for (let i = 2; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      date.setDate(1); // 1st of month
      incomePayload.push({
        id: 'income_' + i + '_' + Math.random().toString(36).substr(2, 9),
        user_id: userId,
        amount: salaryAmounts[i],
        source: 'Salary',
        timestamp: date.getTime(),
        bank_profile_id: hdfcId,
        updated_at: Date.now(),
        is_deleted: false,
      });
    }

    const { error: incomeError } = await client.schema('finance').from('income_records').insert(incomePayload);
    if (incomeError) throw incomeError;
    console.log('[MockInjector] Seeded Historical Income Records...');

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
      { amount: 850, category: 'food', merchant: 'Starbucks', daysAgo: 8, profileId: hdfcId }
    ];

    const txPayload = mockTx.map((tx, idx) => {
      const txTime = Date.now() - tx.daysAgo * 24 * 60 * 60 * 1000;
      return {
        id: 'tx_' + idx + '_' + Math.random().toString(36).substr(2, 9),
        user_id: userId,
        amount: tx.amount,
        category: tx.category,
        merchant: tx.merchant,
        timestamp: txTime,
        bank_profile_id: tx.profileId,
        sms_id: 'sms_' + Math.random().toString(36).substring(7),
        is_anomaly: tx.amount > 3000 && tx.category === 'shopping',
        status: 'cleared',
        updated_at: Date.now(),
        is_deleted: false,
      };
    });

    const { error: txError } = await client.schema('finance').from('transactions').insert(txPayload);
    if (txError) throw txError;

    console.log('[MockInjector] Seeded Mock Transactions successfully!');
  } catch (err: any) {
    console.error('[MockInjector] Failed to inject mock data on Supabase:', err.message);
  }
};
