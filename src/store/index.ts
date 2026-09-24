import { create } from 'zustand';
import { ChatMessage } from '../services/aiService';
import { mmkvStorage } from '../db/mmkv';
import { useColorScheme } from 'react-native';

function loadCached<T>(key: string, fallback: T): T {
  try {
    const data = mmkvStorage.getObject<T>(key);
    return data !== null && data !== undefined ? data : fallback;
  } catch {
    return fallback;
  }
}

// 1. Transaction Store
export interface TransactionState {
  transactions: any[];
  isLoading: boolean;
  filterCategory: string | null;
  setTransactions: (txs: any[]) => void;
  addTransactionState: (tx: any) => void;
  updateTransactionState: (id: string, updatedFields: any) => void;
  removeTransactionState: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setFilterCategory: (category: string | null) => void;
}

export const useTransactionStore = create<TransactionState>((set) => ({
  transactions: loadCached<any[]>('cache_transactions', []),
  isLoading: false,
  filterCategory: null,
  setTransactions: (transactions) => {
    mmkvStorage.setObject('cache_transactions', transactions);
    set({ transactions });
  },
  addTransactionState: (tx) =>
    set((state) => {
      const updated = [tx, ...state.transactions];
      mmkvStorage.setObject('cache_transactions', updated);
      return { transactions: updated };
    }),
  updateTransactionState: (id, updatedFields) =>
    set((state) => {
      const updated = state.transactions.map((tx) =>
        tx.id === id ? { ...tx, ...updatedFields } : tx
      );
      mmkvStorage.setObject('cache_transactions', updated);
      return { transactions: updated };
    }),
  removeTransactionState: (id) =>
    set((state) => {
      const updated = state.transactions.filter((tx) => tx.id !== id);
      mmkvStorage.setObject('cache_transactions', updated);
      return { transactions: updated };
    }),
  setLoading: (isLoading) => set({ isLoading }),
  setFilterCategory: (filterCategory) => set({ filterCategory }),
}));

// 2. Budget Store
export interface BudgetCategory {
  id: string;
  category: string;
  limitAmount: number;
  spentAmount: number;
  period: string;
}

export interface BudgetState {
  budgets: BudgetCategory[];
  setBudgets: (budgets: BudgetCategory[]) => void;
  updateSpent: (category: string, amount: number) => void;
}

export const useBudgetStore = create<BudgetState>((set) => ({
  budgets: loadCached<BudgetCategory[]>('cache_budgets', []),
  setBudgets: (budgets) => {
    mmkvStorage.setObject('cache_budgets', budgets);
    set({ budgets });
  },
  updateSpent: (category, amount) =>
    set((state) => {
      const updated = state.budgets.map((b) =>
        b.category === category ? { ...b, spentAmount: b.spentAmount + amount } : b
      );
      mmkvStorage.setObject('cache_budgets', updated);
      return { budgets: updated };
    }),
}));

// 3. Savings Goals Store
export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: number;
  status: string;
}

export interface GoalsState {
  goals: Goal[];
  setGoals: (goals: Goal[]) => void;
  contributeToGoal: (id: string, amount: number) => void;
}

export const useGoalsStore = create<GoalsState>((set) => ({
  goals: loadCached<Goal[]>('cache_goals', []),
  setGoals: (goals) => {
    mmkvStorage.setObject('cache_goals', goals);
    set({ goals });
  },
  contributeToGoal: (id, amount) =>
    set((state) => {
      const updated = state.goals.map((g) =>
        g.id === id ? { ...g, currentAmount: g.currentAmount + amount } : g
      );
      mmkvStorage.setObject('cache_goals', updated);
      return { goals: updated };
    }),
}));

// 4. AI & Chat Store
export interface AIState {
  weeklyBriefing: string | null;
  chatHistory: ChatMessage[];
  isGeneratingBriefing: boolean;
  isThinking: boolean;
  setWeeklyBriefing: (briefing: string | null) => void;
  setGeneratingBriefing: (val: boolean) => void;
  setThinking: (val: boolean) => void;
  addChatMessage: (msg: ChatMessage) => void;
  clearChatHistory: () => void;
}

export const useAIStore = create<AIState>((set) => ({
  weeklyBriefing: null,
  chatHistory: [],
  isGeneratingBriefing: false,
  isThinking: false,
  setWeeklyBriefing: (weeklyBriefing) => set({ weeklyBriefing }),
  setGeneratingBriefing: (isGeneratingBriefing) => set({ isGeneratingBriefing }),
  setThinking: (isThinking) => set({ isThinking }),
  addChatMessage: (msg) =>
    set((state) => ({ chatHistory: [...state.chatHistory, msg] })),
  clearChatHistory: () => set({ chatHistory: [] }),
}));

// 5. Auth Store
export interface UserProfile {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  authProvider: 'local' | 'google' | 'email';
  avatarUrl?: string | null;
  createdAt: number;
  dob?: string | null;
  gender?: string | null;
  occupation?: string | null;
  currentIncome?: number | null;
  incomeSourcesCount?: number | null;
}

export interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  setUser: (user: UserProfile | null) => void;
  updateUser: (fields: Partial<UserProfile>) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  updateUser: (fields) =>
    set((state) => {
      if (!state.user) return state;
      const updated = { ...state.user, ...fields };
      mmkvStorage.setObject('user_profile', updated);
      return { user: updated };
    }),
  setLoading: (isLoading) => set({ isLoading }),
}));

// 6. Bank Store
export interface BankProfileType {
  id: string;
  bankName: string;
  accountNumberSuffix: string;
  currentBalance: number;
  lastSyncTimestamp: number;
  smsSenderId?: string;
  upiId?: string;
  customKeywords?: string;
  smsConsent: boolean;
}

export interface BankState {
  bankProfiles: BankProfileType[];
  setBankProfiles: (profiles: BankProfileType[]) => void;
  addBankProfileState: (profile: BankProfileType) => void;
  removeBankProfileState: (id: string) => void;
  updateBankBalance: (id: string, newBalance: number) => void;
}

export const useBankStore = create<BankState>((set) => ({
  bankProfiles: loadCached<BankProfileType[]>('cache_bank_profiles', []),
  setBankProfiles: (bankProfiles) => {
    mmkvStorage.setObject('cache_bank_profiles', bankProfiles);
    set({ bankProfiles });
  },
  addBankProfileState: (profile) =>
    set((state) => {
      const updated = [profile, ...state.bankProfiles];
      mmkvStorage.setObject('cache_bank_profiles', updated);
      return { bankProfiles: updated };
    }),
  removeBankProfileState: (id) =>
    set((state) => {
      const updated = state.bankProfiles.filter((b) => b.id !== id);
      mmkvStorage.setObject('cache_bank_profiles', updated);
      return { bankProfiles: updated };
    }),
  updateBankBalance: (id, newBalance) =>
    set((state) => {
      const updated = state.bankProfiles.map((b) =>
        b.id === id ? { ...b, currentBalance: newBalance, lastSyncTimestamp: Date.now() } : b
      );
      mmkvStorage.setObject('cache_bank_profiles', updated);
      return { bankProfiles: updated };
    }),
}));

// 7. Theme Store
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  rehydrateTheme: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  // Try reading from MMKV synchronously (works when native MMKV is available)
  theme: (mmkvStorage.getString('appearance_theme') as ThemeMode) || 'light',
  setTheme: (theme) => {
    mmkvStorage.setString('appearance_theme', theme);
    set({ theme });
  },
  // Called after async MMKV fallback initializes — restores persisted value
  rehydrateTheme: async () => {
    const stored = mmkvStorage.getString('appearance_theme') as ThemeMode | undefined;
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      set({ theme: stored });
    }
  },
}));

export const getThemeColors = (isDark: boolean) => {
  if (isDark) {
    return {
      isDark: true,
      background: '#24292e',
      card: '#2b3137',
      text: '#ffffff',
      textSecondary: 'rgba(250, 251, 252, 0.75)',
      textTertiary: 'rgba(250, 251, 252, 0.52)',
      border: 'rgba(250, 251, 252, 0.14)',
      accent: '#2dba4e',
      accentMuted: 'rgba(45, 186, 78, 0.14)',
      inputBackground: '#1e2227',
      inputBorder: 'rgba(250, 251, 252, 0.18)',
      buttonSecondaryBackground: 'rgba(250, 251, 252, 0.10)',
      buttonSecondaryText: '#fafbfc',
      shadowColor: '#000000',
      chatSelfBubble: '#24292e',
      chatBotBubble: 'rgba(45, 186, 78, 0.12)',
      statusBar: 'light' as const,
      danger: '#ff5252',
      warning: '#e3b341',
      divider: 'rgba(250, 251, 252, 0.10)',
    };
  } else {
    return {
      isDark: false,
      background: '#f8fafc',
      card: '#ffffff',
      text: '#0f172a',
      textSecondary: '#475569',
      textTertiary: '#64748b',
      border: '#e2e8f0',
      accent: '#16a34a',
      accentMuted: 'rgba(22, 163, 74, 0.10)',
      inputBackground: '#ffffff',
      inputBorder: '#cbd5e1',
      buttonSecondaryBackground: '#f1f5f9',
      buttonSecondaryText: '#0f172a',
      shadowColor: '#0f172a',
      chatSelfBubble: '#f1f5f9',
      chatBotBubble: 'rgba(22, 163, 74, 0.08)',
      statusBar: 'dark' as const,
      danger: '#dc2626',
      warning: '#d97706',
      divider: '#e2e8f0',
    };
  }
};

// 8. Notification Store
export interface NotificationType {
  id: string;
  userId: string;
  agentId: string | null;
  title: string;
  body: string;
  type: 'anomaly' | 'budget_alert' | 'recommendation' | 'info';
  readStatus: boolean;
  payload: any | null;
  createdAt: number;
}

export interface NotificationState {
  notifications: NotificationType[];
  unreadCount: number;
  isLoading: boolean;
  setNotifications: (notifications: NotificationType[]) => void;
  setLoading: (loading: boolean) => void;
  addNotification: (notification: NotificationType) => void;
  markAsReadState: (id: string) => void;
  deleteNotificationState: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  setNotifications: (notifications) => {
    const unreadCount = notifications.filter((n) => !n.readStatus).length;
    set({ notifications, unreadCount });
  },
  setLoading: (isLoading) => set({ isLoading }),
  addNotification: (notification) =>
    set((state) => {
      const updated = [notification, ...state.notifications];
      return {
        notifications: updated,
        unreadCount: state.unreadCount + (notification.readStatus ? 0 : 1),
      };
    }),
  markAsReadState: (id) =>
    set((state) => {
      let isChanged = false;
      const updated = state.notifications.map((n) => {
        if (n.id === id && !n.readStatus) {
          isChanged = true;
          return { ...n, readStatus: true };
        }
        return n;
      });
      return {
        notifications: updated,
        unreadCount: isChanged ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    }),
  deleteNotificationState: (id) =>
    set((state) => {
      const target = state.notifications.find((n) => n.id === id);
      const isUnread = target ? !target.readStatus : false;
      const updated = state.notifications.filter((n) => n.id !== id);
      return {
        notifications: updated,
        unreadCount: isUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    }),
}));

export const useTheme = () => {
  const theme = useThemeStore((state) => state.theme);
  const systemColorScheme = useColorScheme();
  const isDark = theme === 'system' ? systemColorScheme === 'dark' : theme === 'dark';
  const colors = getThemeColors(isDark);
  return { theme, isDark, colors };
};

// 9. Analytics & Net Worth Cache Store
export interface NetWorthSnapshotType {
  [key: string]: any;
  timestamp: number;
  netWorth: number;
  monthLabel: string;
}

export interface AnalyticsState {
  snapshots: NetWorthSnapshotType[];
  incomeCurrentMonth: number;
  lastFetchTime: number;
  setSnapshots: (snapshots: NetWorthSnapshotType[]) => void;
  setIncomeCurrentMonth: (amount: number) => void;
  setLastFetchTime: (time: number) => void;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  snapshots: loadCached<NetWorthSnapshotType[]>('cache_net_worth_snapshots', []),
  incomeCurrentMonth: mmkvStorage.getNumber('cache_monthly_income') || 95000,
  lastFetchTime: 0,
  setSnapshots: (snapshots) => {
    mmkvStorage.setObject('cache_net_worth_snapshots', snapshots);
    set({ snapshots });
  },
  setIncomeCurrentMonth: (incomeCurrentMonth) => {
    mmkvStorage.setNumber('cache_monthly_income', incomeCurrentMonth);
    set({ incomeCurrentMonth });
  },
  setLastFetchTime: (lastFetchTime) => set({ lastFetchTime }),
}));

// Rehydrate all stores synchronously/asynchronously after MMKV storage init
export const rehydrateAllStores = async () => {
  try {
    const txs = mmkvStorage.getObject<any[]>('cache_transactions');
    if (txs && txs.length > 0) useTransactionStore.getState().setTransactions(txs);

    const budgets = mmkvStorage.getObject<BudgetCategory[]>('cache_budgets');
    if (budgets && budgets.length > 0) useBudgetStore.getState().setBudgets(budgets);

    const goals = mmkvStorage.getObject<Goal[]>('cache_goals');
    if (goals && goals.length > 0) useGoalsStore.getState().setGoals(goals);

    const banks = mmkvStorage.getObject<BankProfileType[]>('cache_bank_profiles');
    if (banks && banks.length > 0) useBankStore.getState().setBankProfiles(banks);

    const snaps = mmkvStorage.getObject<NetWorthSnapshotType[]>('cache_net_worth_snapshots');
    if (snaps && snaps.length > 0) useAnalyticsStore.getState().setSnapshots(snaps);

    const inc = mmkvStorage.getNumber('cache_monthly_income');
    if (inc) useAnalyticsStore.getState().setIncomeCurrentMonth(inc);

    await useSecurityStore.getState().rehydrateSecurity();
  } catch (e) {
    console.error('[Store] Rehydration error:', e);
  }
};

// 9. Global Custom Confirmation Dialog Store
export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  icon?: 'trash-2' | 'alert-triangle' | 'help-circle' | 'info' | 'log-out';
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export interface ConfirmState {
  visible: boolean;
  options: ConfirmOptions | null;
  loading: boolean;
  showConfirm: (options: ConfirmOptions) => void;
  hideConfirm: () => void;
  setLoading: (loading: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set) => ({
  visible: false,
  options: null,
  loading: false,
  showConfirm: (options) => set({ visible: true, options, loading: false }),
  hideConfirm: () => set({ visible: false, options: null, loading: false }),
  setLoading: (loading) => set({ loading }),
}));

export const showGlobalConfirm = (options: ConfirmOptions) => {
  useConfirmStore.getState().showConfirm(options);
};

// 10. Security & Biometrics Store
export type AutoLockTimeout = 1 | 5 | 10;

export interface SecurityState {
  biometricsEnabled: boolean;
  autoLockTimeout: AutoLockTimeout;
  isLocked: boolean;
  lastBackgroundTimestamp: number | null;
  setBiometricsEnabled: (enabled: boolean) => void;
  setAutoLockTimeout: (timeout: AutoLockTimeout) => void;
  setLocked: (locked: boolean) => void;
  setLastBackgroundTimestamp: (timestamp: number | null) => void;
  rehydrateSecurity: () => Promise<void>;
}

export const useSecurityStore = create<SecurityState>((set) => ({
  biometricsEnabled: mmkvStorage.getBoolean('security_biometrics_enabled') ?? false,
  autoLockTimeout: ((mmkvStorage.getNumber('security_auto_lock_timeout') as AutoLockTimeout) || 1),
  isLocked: false,
  lastBackgroundTimestamp: mmkvStorage.getNumber('security_last_bg_time') ?? null,

  setBiometricsEnabled: (enabled) => {
    mmkvStorage.setBoolean('security_biometrics_enabled', enabled);
    set({ biometricsEnabled: enabled });
  },

  setAutoLockTimeout: (timeout) => {
    mmkvStorage.setNumber('security_auto_lock_timeout', timeout);
    set({ autoLockTimeout: timeout });
  },

  setLocked: (isLocked) => set({ isLocked }),
  setLastBackgroundTimestamp: (timestamp) => {
    if (timestamp) {
      mmkvStorage.setNumber('security_last_bg_time', timestamp);
    } else {
      mmkvStorage.delete('security_last_bg_time');
    }
    set({ lastBackgroundTimestamp: timestamp });
  },

  rehydrateSecurity: async () => {
    const enabled = mmkvStorage.getBoolean('security_biometrics_enabled') ?? false;
    const timeout = ((mmkvStorage.getNumber('security_auto_lock_timeout') as AutoLockTimeout) || 1);
    const lastBg = mmkvStorage.getNumber('security_last_bg_time');

    let shouldLock = false;
    if (enabled && lastBg) {
      const elapsed = Date.now() - lastBg;
      if (elapsed >= timeout * 60 * 1000) {
        shouldLock = true;
      }
    }

    set({
      biometricsEnabled: enabled,
      autoLockTimeout: timeout,
      lastBackgroundTimestamp: lastBg ?? null,
      isLocked: shouldLock,
    });
  },
}));


