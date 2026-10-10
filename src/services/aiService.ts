import { BACKEND_URL } from '../config/api';
import { tokenStore } from './tokenStore';
import { sanitizeTransactions, SanitizedTransaction } from './sanitizer';

// 1. Weekly Briefings & Deep Analysis
export const generateWeeklyBriefing = async (
  rawTransactions: Array<{
    amount: number;
    category: string;
    merchant: string;
    timestamp: number;
    type: 'debit' | 'credit';
  }>,
  savingsGoals: Array<{ name: string; target: number; current: number }>
): Promise<string> => {
  const token = tokenStore.getAccessToken();
  const sanitized = sanitizeTransactions(rawTransactions);

  try {
    const response = await fetch(`${BACKEND_URL}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        question: 'Generate my weekly financial briefing and breakdown.',
        history: [],
        context: {
          recentTransactions: sanitized,
          savingsGoals,
        },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.answer) {
        return data.answer;
      }
    }
    return 'Unable to generate weekly briefing at this time. Please check your connection.';
  } catch (err: any) {
    console.error('[AI Service] generateWeeklyBriefing error:', err);
    return 'Failed to generate AI weekly briefing. Please try again later.';
  }
};

// 2. Chatbot Interface
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatContext {
  user?: {
    name?: string | null;
    email?: string | null;
    gender?: string | null;
    dob?: string | null;
    occupation?: string | null;
    currentIncome?: number | null;
    incomeSourcesCount?: number | null;
  };
  totalBalance?: number;
  accounts?: Array<{
    bankName: string;
    accountType: string;
    balance: number;
    accountNumberEnding?: string;
  }>;
  savingsGoals?: Array<{
    name: string;
    target: number;
    current: number;
    targetDate?: string | number;
  }>;
  budgets?: Array<{ category: string; limit: number; spent: number }>;
  recentTransactions?: SanitizedTransaction[];
}

export const askChatbot = async (
  question: string,
  history: ChatMessage[],
  currentContext: ChatContext
): Promise<string> => {
  const token = tokenStore.getAccessToken();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const res = await fetch(`${BACKEND_URL}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        question,
        history,
        context: currentContext,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.answer) {
        return data.answer;
      }
    }

    const errJson = await res.json().catch(() => ({}));
    return errJson.message || "I'm Regent Money AI. Connecting to our backend intelligence service... If this persists, please ensure you are logged in.";
  } catch (backendErr: any) {
    console.error('[AI Service] Backend AI Chat error:', backendErr);
    return "I couldn't reach the financial intelligence service right now. Please check your network connection and try again.";
  }
};

// 3. Statement Parsing
export const parseStatementTextWithAI = async (text: string): Promise<any[]> => {
  const token = tokenStore.getAccessToken();

  try {
    const response = await fetch(`${BACKEND_URL}/ai/parse-statement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.message || 'Backend AI statement parsing failed.');
    }

    const data = await response.json();
    return data.transactions || [];
  } catch (error: any) {
    console.error('[AI Service] Backend parse-statement error:', error);
    throw new Error(error.message || 'Failed to parse statement using backend AI.');
  }
};
