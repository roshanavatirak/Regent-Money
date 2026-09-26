import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ChatMessageDto {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatContextDto {
  user?: {
    name?: string;
    gender?: string;
    dob?: string;
    occupation?: string;
    currentIncome?: number;
    incomeSourcesCount?: number;
  };
  totalBalance?: number;
  accounts?: Array<{
    bankName: string;
    accountType?: string;
    accountNumberEnding?: string;
    balance?: number;
  }>;
  savingsGoals?: Array<{
    name: string;
    target: number;
    current: number;
    targetDate?: string | number;
  }>;
  budgets?: Array<{ category: string; limit: number; spent: number }>;
  recentTransactions?: Array<{
    type: string;
    amountRange: string;
    category: string;
    merchantType: string;
    relativeDate: string;
  }>;
}

export class ChatRequestDto {
  question: string;
  history?: ChatMessageDto[];
  context?: ChatContextDto;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly configService: ConfigService) {}

  private buildSystemPrompt(context?: ChatContextDto): string {
    const user = context?.user;
    const totalBalance = Number(context?.totalBalance || 0).toLocaleString('en-IN');

    const accountsSummary =
      context?.accounts && context.accounts.length > 0
        ? context.accounts
            .map(
              (a) =>
                `  * ${a.bankName} (${a.accountType || 'Savings'}): ₹${Number(a.balance || 0).toLocaleString('en-IN')}${a.accountNumberEnding ? ` [Account ending ${a.accountNumberEnding}]` : ''}`
            )
            .join('\n')
        : '  * No bank accounts linked yet.';

    const goalsSummary =
      context?.savingsGoals && context.savingsGoals.length > 0
        ? context.savingsGoals
            .map(
              (g) =>
                `  * ${g.name}: ₹${Number(g.current || 0).toLocaleString('en-IN')} saved of ₹${Number(g.target || 0).toLocaleString('en-IN')} (${Math.round(((g.current || 0) / (g.target || 1)) * 100)}%)`
            )
            .join('\n')
        : '  * No savings goals set.';

    const budgetsSummary =
      context?.budgets && context.budgets.length > 0
        ? context.budgets
            .map(
              (b) =>
                `  * ${b.category}: Spent ₹${Number(b.spent || 0).toLocaleString('en-IN')} of ₹${Number(b.limit || 0).toLocaleString('en-IN')}`
            )
            .join('\n')
        : '  * No category budgets configured.';

    const txsSummary =
      context?.recentTransactions && context.recentTransactions.length > 0
        ? context.recentTransactions
            .slice(0, 15)
            .map(
              (t) =>
                `  * [${t.type.toUpperCase()}] ${t.amountRange} on ${t.category} (${t.merchantType}) - ${t.relativeDate}`
            )
            .join('\n')
        : '  * No recent transactions recorded.';

    return `
You are Regent Money AI, the private personal wealth assistant and financial advisor for ${user?.name || 'the user'}.
You have direct, real-time access to the user's financial database, bank accounts, balances, goals, and profile in Regent Money.

### USER PROFILE & IDENTITY
- Name: ${user?.name || 'User'}
- Gender: ${user?.gender || 'Not specified'}
- Date of Birth: ${user?.dob || 'Not set'}
- Occupation: ${user?.occupation || 'Not specified'}
- Stated Income: ₹${user?.currentIncome ? Number(user.currentIncome).toLocaleString('en-IN') : 'Not specified'}
- Income Streams Count: ${user?.incomeSourcesCount || 1}

### CURRENT LIQUID BALANCE & ACCOUNTS
- Total Current Balance Across Banks: ₹${totalBalance}
- Bank Accounts:
${accountsSummary}

### SAVINGS GOALS
${goalsSummary}

### BUDGETS & SPENDING
${budgetsSummary}

### RECENT TRANSACTIONS
${txsSummary}

### INSTRUCTIONS:
1. When asked about balance or bank accounts, answer IMMEDIATELY and DIRECTLY with their total balance (₹${totalBalance}) and individual account breakdown. NEVER state that you don't have balance information.
2. When asked about savings goals, income, occupation, gender, or personal profile, cite the exact real-time values from the profile and goals above.
3. Tailor insights to Indian wealth practices (UPI, Emergency Funds, SIPs, ELSS, 80C/80D, Fixed Deposits).
4. Be accurate, polite, executive, and encouraging. Use clean, readable formatting.
`;
  }

  async chat(dto: ChatRequestDto): Promise<{ answer: string; model: string }> {
    const groqKey = this.configService.get<string>('GROQ_API_KEY')?.trim();
    const mistralKey = this.configService.get<string>('MISTRAL_API_KEY')?.trim();
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY')?.trim();

    const systemPrompt = this.buildSystemPrompt(dto.context);
    const history = dto.history || [];

    const standardMessages = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: dto.question },
    ];

    // ==========================================
    // 1. ENGINE 1: Groq (Ultra-Fast)
    // ==========================================
    if (groqKey) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'openai/gpt-oss-120b',
            messages: standardMessages,
            temperature: 0.7,
            max_tokens: 600,
          }),
        });

        if (response.ok) {
          const json = await response.json();
          const reply = json.choices?.[0]?.message?.content;
          if (reply && reply.trim()) {
            return { answer: reply.trim(), model: 'groq/gpt-oss-120b' };
          }
        } else {
          const errText = await response.text();
          this.logger.warn(`[Groq Failover] Status ${response.status}: ${errText}. Attempting Mistral...`);
        }
      } catch (err: any) {
        this.logger.warn(`[Groq Failover] Exception: ${err?.message || err}. Attempting Mistral...`);
      }
    }

    // ==========================================
    // 2. ENGINE 2: Mistral AI (High Accuracy Fallback)
    // ==========================================
    if (mistralKey) {
      try {
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${mistralKey}`,
          },
          body: JSON.stringify({
            model: 'ministral-8b-latest',
            messages: standardMessages,
            temperature: 0.7,
            max_tokens: 600,
          }),
        });

        if (response.ok) {
          const json = await response.json();
          const reply = json.choices?.[0]?.message?.content;
          if (reply && reply.trim()) {
            return { answer: reply.trim(), model: 'mistral/ministral-8b' };
          }
        } else {
          // Try ministral-3b fallback if 8b was busy
          const fallbackRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${mistralKey}`,
            },
            body: JSON.stringify({
              model: 'ministral-3b-latest',
              messages: standardMessages,
              temperature: 0.7,
              max_tokens: 600,
            }),
          });

          if (fallbackRes.ok) {
            const fbJson = await fallbackRes.json();
            const fbReply = fbJson.choices?.[0]?.message?.content;
            if (fbReply && fbReply.trim()) {
              return { answer: fbReply.trim(), model: 'mistral/ministral-3b' };
            }
          }

          const errText = await response.text();
          this.logger.warn(`[Mistral Failover] Status ${response.status}: ${errText}. Attempting Gemini...`);
        }
      } catch (err: any) {
        this.logger.warn(`[Mistral Failover] Exception: ${err?.message || err}. Attempting Gemini...`);
      }
    }

    // ==========================================
    // 3. ENGINE 3: Google Gemini (Reliable Fallback)
    // ==========================================
    if (geminiKey) {
      try {
        const contents = [
          ...history.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          { role: 'user', parts: [{ text: dto.question }] },
        ];

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              systemInstruction: { parts: [{ text: systemPrompt }] },
            }),
          }
        );

        if (response.ok) {
          const json = await response.json();
          const reply = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply && reply.trim()) {
            return { answer: reply.trim(), model: 'gemini-2.5-flash' };
          }
        } else {
          this.logger.warn(`[Gemini Failover] Status ${response.status}`);
        }
      } catch (err: any) {
        this.logger.warn(`[Gemini Failover] Exception: ${err?.message || err}`);
      }
    }

    // 4. Safe offline fallback if all 3 providers are unreachable
    const userName = dto.context?.user?.name || 'there';
    return {
      answer: `Hello ${userName}! I see your live total balance is ₹${Number(dto.context?.totalBalance || 0).toLocaleString('en-IN')}. All external AI services are currently experiencing high traffic. Please check back in a few moments.`,
      model: 'system/offline-fallback',
    };
  }
}
