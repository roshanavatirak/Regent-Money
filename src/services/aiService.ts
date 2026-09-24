import { mmkvStorage } from '../db/mmkv';
import { sanitizeTransactions, SanitizedTransaction } from './sanitizer';

// Configuration keys in MMKV
const GEMINI_API_KEY_KEY = 'settings_gemini_api_key';
const GROQ_API_KEY_KEY = 'settings_groq_api_key';

export const getGeminiKey = () => mmkvStorage.getString(GEMINI_API_KEY_KEY) || '';
export const setGeminiKey = (key: string) => mmkvStorage.setString(GEMINI_API_KEY_KEY, key);

export const getGroqKey = () => {
  const envKey = (process.env.EXPO_PUBLIC_GROQ_API_KEY || '').trim();
  const stored = (mmkvStorage.getString(GROQ_API_KEY_KEY) || '').trim();
  return envKey || stored;
};
export const setGroqKey = (key: string) => mmkvStorage.setString(GROQ_API_KEY_KEY, key.trim());

// 1. Gemini 2.5 Flash - For Weekly Briefings and Deep Analysis
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
  const apiKey = getGeminiKey();
  if (!apiKey) {
    return 'Please enter your Google Gemini API Key in Settings to generate AI weekly briefings.';
  }

  // Pre-process and sanitize data
  const sanitized = sanitizeTransactions(rawTransactions);
  const dataSummary = {
    transactionsCount: sanitized.length,
    transactions: sanitized,
    goals: savingsGoals,
  };

  const prompt = `
You are a brilliant, elite personal finance advisor for Indian users. Analyze the following sanitized, anonymized financial data and provide a concise, high-impact weekly briefing. 

Data:
${JSON.stringify(dataSummary, null, 2)}

Provide your briefing in markdown. Break it down into:
1. **Summary Analysis**: 1 sentence summarizing the week.
2. **Behavioral Anomalies**: Point out if there are spikes in specific categories (e.g. food delivery, transport) and relate them to goals.
3. **Savings Progress**: Advice on the listed savings goals.
4. **Actionable Financial Hack**: 1 specific, non-obvious hack for the upcoming week.

Be direct, slightly witty, and highly encouraging. Do not mention any account numbers, names, or exact currencies other than INR.
`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const json = await response.json();
    if (json.candidates && json.candidates[0]?.content?.parts[0]?.text) {
      return json.candidates[0].content.parts[0].text;
    }
    throw new Error(json.error?.message || 'Failed to generate briefing');
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return `Failed to generate AI weekly briefing: ${error?.message || error}`;
  }
};

// 2. Groq Llama 3 - For Instant Chatbot Answers (fast inference)
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
  const geminiKey = getGeminiKey();
  const groqKey = getGroqKey();

  if (!geminiKey && !groqKey) {
    return 'Please enter your Google Gemini API Key or Groq API Key in Settings to chat with the AI assistant.';
  }

  const accountsSummary = (currentContext.accounts && currentContext.accounts.length > 0)
    ? currentContext.accounts.map((a) => `  * ${a.bankName} (${a.accountType}): ₹${Number(a.balance || 0).toLocaleString('en-IN')}${a.accountNumberEnding ? ` [Account ending ${a.accountNumberEnding}]` : ''}`).join('\n')
    : '  * No bank accounts linked yet.';

  const goalsSummary = (currentContext.savingsGoals && currentContext.savingsGoals.length > 0)
    ? currentContext.savingsGoals.map((g) => `  * ${g.name}: ₹${Number(g.current || 0).toLocaleString('en-IN')} saved of ₹${Number(g.target || 0).toLocaleString('en-IN')} (${Math.round(((g.current || 0) / (g.target || 1)) * 100)}%)${g.targetDate ? ` target by ${g.targetDate}` : ''}`).join('\n')
    : '  * No savings goals set.';

  const budgetsSummary = (currentContext.budgets && currentContext.budgets.length > 0)
    ? currentContext.budgets.map((b) => `  * ${b.category}: Spent ₹${Number(b.spent || 0).toLocaleString('en-IN')} of ₹${Number(b.limit || 0).toLocaleString('en-IN')}`).join('\n')
    : '  * No category budgets configured.';

  const txsSummary = (currentContext.recentTransactions && currentContext.recentTransactions.length > 0)
    ? currentContext.recentTransactions.slice(0, 15).map((t) => `  * [${t.type.toUpperCase()}] ${t.amountRange} on ${t.category} (${t.merchantType}) - ${t.relativeDate}`).join('\n')
    : '  * No recent transactions recorded.';

  const systemPrompt = `
You are Regent Money AI, the private personal wealth assistant and financial advisor for ${currentContext.user?.name || 'the user'}.
You have direct, real-time access to the user's financial database, bank accounts, balances, goals, and profile in Regent Money.

### USER PROFILE & IDENTITY
- Name: ${currentContext.user?.name || 'User'}
- Gender: ${currentContext.user?.gender || 'Not specified'}
- Date of Birth: ${currentContext.user?.dob || 'Not set'}
- Occupation: ${currentContext.user?.occupation || 'Not specified'}
- Stated Income: ₹${currentContext.user?.currentIncome ? Number(currentContext.user.currentIncome).toLocaleString('en-IN') : 'Not specified'}
- Income Streams Count: ${currentContext.user?.incomeSourcesCount || 1}

### CURRENT LIQUID BALANCE & ACCOUNTS
- Total Current Balance Across Banks: ₹${Number(currentContext.totalBalance || 0).toLocaleString('en-IN')}
- Bank Accounts:
${accountsSummary}

### SAVINGS GOALS
${goalsSummary}

### BUDGETS & SPENDING
${budgetsSummary}

### RECENT TRANSACTIONS
${txsSummary}

### INSTRUCTIONS:
1. When asked about balance or bank accounts, answer IMMEDIATELY and DIRECTLY with their total balance (₹${Number(currentContext.totalBalance || 0).toLocaleString('en-IN')}) and individual account breakdown. NEVER state that you don't have balance information.
2. When asked about savings goals, income, occupation, gender, or personal profile, cite the exact real-time values from the profile and goals above.
3. Tailor insights to Indian wealth practices (UPI, Emergency Funds, SIPs, ELSS, 80C/80D).
4. Be accurate, polite, executive, and encouraging.
`;

  // 1. Google Gemini 2.5 Flash Chat
  if (geminiKey) {
    const contents = [
      ...history.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      {
        role: 'user',
        parts: [{ text: question }],
      },
    ];

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: contents,
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
          }),
        }
      );

      const json = await response.json();
      if (json.candidates && json.candidates[0]?.content?.parts[0]?.text) {
        return json.candidates[0].content.parts[0].text;
      }
      throw new Error(json.error?.message || 'Failed to generate content from Gemini');
    } catch (error: any) {
      console.error('Gemini Chat Error:', error);
      return `Failed to connect to Gemini: ${error?.message || error}`;
    }
  }

  // 2. Groq Llama 3 Fallback
  if (groqKey) {
    const systemMessage: ChatMessage = {
      role: 'system',
      content: systemPrompt,
    };

    const messages = [systemMessage, ...history, { role: 'user', content: question }];

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey.trim()}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      const json = await response.json();
      if (json.choices && json.choices[0]?.message?.content) {
        return json.choices[0].message.content;
      }
      throw new Error(json.error?.message || 'Failed to get chat response from Groq');
    } catch (error: any) {
      console.error('Groq API Error:', error);
      return `Failed to connect to Groq helper: ${error?.message || error}`;
    }
  }

  return 'No API keys configured.';
};

export const parseStatementTextWithAI = async (text: string): Promise<any[]> => {
  const geminiKey = getGeminiKey();
  const groqKey = getGroqKey();

  if (!geminiKey && !groqKey) {
    throw new Error('No API keys configured. Please add a Gemini or Groq key in Settings.');
  }

  const systemInstruction = `
You are an expert financial OCR parser. Your job is to extract transactions from raw text of a bank statement, SMS logs, or screenshot.
Analyze the text and extract all transactions. Return ONLY a valid JSON array of objects, with no markdown code formatting, no prefix/suffix text, and no explanations. If no transactions are found, return an empty array [].

Each object in the array must have the following exact fields:
- date: string (format YYYY-MM-DD)
- amount: number (positive value)
- type: string ('debit' or 'credit')
- merchant: string (name of the merchant, source of credit, or transaction description)
`;

  const prompt = `
Raw Text:
${text}

Extract all transactions now:
`;

  // 1. Try Google Gemini first
  if (geminiKey) {
    try {
      console.log('[AI OCR] Attempting to parse with Google Gemini 2.5 Flash...');
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      const json = await response.json();
      const rawResponseText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawResponseText) {
        console.log('[AI OCR] Gemini response received:', rawResponseText);
        const parsed = JSON.parse(rawResponseText.trim());
        if (Array.isArray(parsed)) return parsed;
        if (parsed.transactions && Array.isArray(parsed.transactions)) return parsed.transactions;
      }
      throw new Error(json.error?.message || 'Empty or invalid JSON response from Gemini');
    } catch (e: any) {
      console.warn('[AI OCR] Gemini Parsing failed, falling back to Groq Llama 3:', e.message);
    }
  }

  // 2. Fallback to Groq Llama 3
  if (groqKey) {
    try {
      console.log('[AI OCR] Attempting to parse with Groq Llama 3...');
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey.trim()}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          temperature: 0.1,
          max_tokens: 1000,
          response_format: { type: 'json_object' }
        }),
      });

      const json = await response.json();
      const rawResponseText = json.choices?.[0]?.message?.content;
      if (rawResponseText) {
        console.log('[AI OCR] Groq response received:', rawResponseText);
        const parsed = JSON.parse(rawResponseText.trim());
        if (Array.isArray(parsed)) return parsed;
        if (parsed.transactions && Array.isArray(parsed.transactions)) return parsed.transactions;
        const values = Object.values(parsed);
        for (const val of values) {
          if (Array.isArray(val)) return val;
        }
      }
      throw new Error(json.error?.message || 'Empty or invalid response from Groq');
    } catch (e: any) {
      console.error('[AI OCR] Groq fallback failed:', e);
      throw new Error(`Failed to parse bank statement with AI: ${e.message}`);
    }
  }

  throw new Error('Failed to parse bank statement: AI models unavailable.');
};
