import { mmkvStorage } from '../db/mmkv';
import { sanitizeTransactions, SanitizedTransaction } from './sanitizer';

// Configuration keys in MMKV
const GEMINI_API_KEY_KEY = 'settings_gemini_api_key';
const GROQ_API_KEY_KEY = 'settings_groq_api_key';

export const getGeminiKey = () => mmkvStorage.getString(GEMINI_API_KEY_KEY) || '';
export const setGeminiKey = (key: string) => mmkvStorage.setString(GEMINI_API_KEY_KEY, key);

export const getGroqKey = () => mmkvStorage.getString(GROQ_API_KEY_KEY) || '';
export const setGroqKey = (key: string) => mmkvStorage.setString(GROQ_API_KEY_KEY, key);

// 1. Gemini 1.5 Flash - For Weekly Briefings and Deep Analysis
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
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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

export const askChatbot = async (
  question: string,
  history: ChatMessage[],
  currentContext: {
    budgets: Array<{ category: string; limit: number; spent: number }>;
    recentTransactions: SanitizedTransaction[];
  }
): Promise<string> => {
  const apiKey = getGroqKey();
  if (!apiKey) {
    return 'Please enter your Groq API Key in Settings to chat with the AI assistant.';
  }

  const systemMessage: ChatMessage = {
    role: 'system',
    content: `
You are Regent Money AI, an expert, instant financial chatbot. You have access to the user's current budgets and recent sanitized transaction history.
Your responses should be fast, highly precise, and custom-tailored to Indian financial concepts (like UPI, mutual funds, taxation 80C/80D, HRA).

User's Financial Context:
Budgets: ${JSON.stringify(currentContext.budgets)}
Recent Transactions: ${JSON.stringify(currentContext.recentTransactions)}

Guidelines:
- Keep answers under 3-4 sentences unless explaining a complex tax query.
- Offer actionable advice. Never mention raw account numbers.
- Be friendly, premium, and professional.
- Refer to the user's context only when relevant to their question.
`,
  };

  const messages = [systemMessage, ...history, { role: 'user', content: question }];

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.7,
        max_tokens: 500,
      }),
    });

    const json = await response.json();
    if (json.choices && json.choices[0]?.message?.content) {
      return json.choices[0].message.content;
    }
    throw new Error(json.error?.message || 'Failed to get chat response');
  } catch (error: any) {
    console.error('Groq API Error:', error);
    return `Failed to connect to AI helper: ${error?.message || error}`;
  }
};
