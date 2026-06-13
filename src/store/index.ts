import { create } from 'zustand';
import { ChatMessage } from '../services/aiService';
import { mmkvStorage } from '../db/mmkv';
import { useColorScheme } from 'react-native';

// 1. Transaction Store
export interface TransactionState {
  transactions: any[];
  isLoading: boolean;
  filterCategory: string | null;
  setTransactions: (txs: any[]) => void;
  setLoading: (loading: boolean) => void;
  setFilterCategory: (category: string | null) => void;
}

export const useTransactionStore = create<TransactionState>((set) => ({
  transactions: [],
  isLoading: false,
  filterCategory: null,
  setTransactions: (transactions) => set({ transactions }),
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
  budgets: [],
  setBudgets: (budgets) => set({ budgets }),
  updateSpent: (category, amount) =>
    set((state) => ({
      budgets: state.budgets.map((b) =>
        b.category === category ? { ...b, spentAmount: b.spentAmount + amount } : b
      ),
    })),
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
  goals: [],
  setGoals: (goals) => set({ goals }),
  contributeToGoal: (id, amount) =>
    set((state) => ({
      goals: state.goals.map((g) =>
        g.id === id ? { ...g, currentAmount: g.currentAmount + amount } : g
      ),
    })),
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
  avatarUrl?: string;
  createdAt: number;
}

export interface AuthState {
  user: UserProfile | null;
  isLoading: boolean;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
}));

// 6. Bank Store
export interface BankProfileType {
  id: string;
  bankName: string;
  accountNumberSuffix: string;
  currentBalance: number;
  lastSyncTimestamp: number;
}

export interface BankState {
  bankProfiles: BankProfileType[];
  setBankProfiles: (profiles: BankProfileType[]) => void;
  addBankProfileState: (profile: BankProfileType) => void;
}

export const useBankStore = create<BankState>((set) => ({
  bankProfiles: [],
  setBankProfiles: (bankProfiles) => set({ bankProfiles }),
  addBankProfileState: (profile) => set((state) => ({ bankProfiles: [profile, ...state.bankProfiles] })),
}));

// 7. Theme Store
export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeState {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (mmkvStorage.getString('appearance_theme') as ThemeMode) || 'system',
  setTheme: (theme) => {
    mmkvStorage.setString('appearance_theme', theme);
    set({ theme });
  },
}));

export const getThemeColors = (isDark: boolean) => {
  if (isDark) {
    return {
      background: '#24292e',
      card: '#2b3137',
      text: '#ffffff',
      textSecondary: 'rgba(250, 251, 252, 0.7)',
      textTertiary: 'rgba(250, 251, 252, 0.45)',
      border: 'rgba(250, 251, 252, 0.12)',
      accent: '#2dba4e',
      accentMuted: 'rgba(45, 186, 78, 0.12)',
      inputBackground: '#24292e',
      inputBorder: 'rgba(250, 251, 252, 0.15)',
      buttonSecondaryBackground: 'rgba(250, 251, 252, 0.08)',
      buttonSecondaryText: '#fafbfc',
      shadowColor: '#000000',
      chatSelfBubble: '#24292e',
      chatBotBubble: 'rgba(45, 186, 78, 0.1)',
      statusBar: 'light' as const,
      danger: '#cf222e',
      warning: '#d29922',
      divider: 'rgba(250, 251, 252, 0.08)',
    };
  } else {
    return {
      background: '#f6f8fa',
      card: '#ffffff',
      text: '#24292f',
      textSecondary: 'rgba(87, 96, 106, 0.9)',
      textTertiary: 'rgba(87, 96, 106, 0.6)',
      border: 'rgba(27, 31, 35, 0.15)',
      accent: '#2da44e',
      accentMuted: 'rgba(45, 186, 78, 0.08)',
      inputBackground: '#ffffff',
      inputBorder: 'rgba(27, 31, 35, 0.15)',
      buttonSecondaryBackground: 'rgba(27, 31, 35, 0.05)',
      buttonSecondaryText: '#24292f',
      shadowColor: 'rgba(27, 31, 35, 0.08)',
      chatSelfBubble: '#f6f8fa',
      chatBotBubble: 'rgba(45, 186, 78, 0.06)',
      statusBar: 'dark' as const,
      danger: '#cf222e',
      warning: '#9a6700',
      divider: 'rgba(27, 31, 35, 0.08)',
    };
  }
};

export const useTheme = () => {
  const theme = useThemeStore((state) => state.theme);
  const systemColorScheme = useColorScheme();
  const isDark = theme === 'system' ? systemColorScheme === 'dark' : theme === 'dark';
  const colors = getThemeColors(isDark);
  return { theme, isDark, colors };
};
