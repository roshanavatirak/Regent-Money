import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

/** Give up on an AI provider after this long and try the next one. */
export const PROVIDER_TIMEOUT_MS = 8000;
/** After a provider says "too many requests" or fails on its side, skip it for this long. */
export const PROVIDER_COOLDOWN_MS = 60_000;
/** Default questions per user per day (override with AI_DAILY_LIMIT). */
export const DEFAULT_AI_DAILY_LIMIT = 40;
/** Default statement / screenshot scans per user per day (override with AI_DAILY_SCAN_LIMIT). */
export const DEFAULT_AI_DAILY_SCAN_LIMIT = 20;
/** What one chat request may carry, whatever the phone sends. */
export const MAX_QUESTION_CHARS = 2000;
export const MAX_HISTORY_MESSAGES = 8;
export const MAX_HISTORY_MESSAGE_CHARS = 4000;
export const MAX_CONTEXT_CHARS = 60_000;

/**
 * How a provider call ended:
 *  - 'ok'    answer received
 *  - 'next'  provider-side problem (rate limit, outage, timeout, bad key): try the next provider
 *  - 'stop'  the request itself was rejected (400/413/422): every provider would refuse it too
 */
export type ProviderOutcome =
  | { kind: 'ok'; answer: string }
  | { kind: 'next'; cooldown: boolean }
  | { kind: 'stop'; status: number };

/** Sorts an HTTP status from a provider into what to do next. */
export const classifyProviderStatus = (status: number): 'next-cooldown' | 'next' | 'stop' => {
  if (status === 429 || status >= 500) return 'next-cooldown';
  if (status === 400 || status === 413 || status === 422) return 'stop';
  return 'next'; // 401/403/404 etc.: a problem with this provider's key or model; others may work
};

/** Today's date in India, so the daily limit resets at midnight IST. */
export const istDay = (now = Date.now()) => new Date(now + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
import { IsNotEmpty, IsString, IsOptional, IsArray, IsObject } from 'class-validator';

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
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsOptional()
  @IsArray()
  history?: ChatMessageDto[];

  @IsOptional()
  @IsObject()
  context?: ChatContextDto;
}

export interface OcrTransactionExtracted {
  date: string;
  time?: string | null;
  timestamp?: number | null;
  amount: number;
  type: 'debit' | 'credit';
  merchant: string;
  category?: string;
  balanceAfter?: number | null;
  referenceId?: string | null;
}

export interface OcrValidationResult {
  isValid: boolean;
  category: 'transaction_screenshot' | 'selfie_or_portrait' | 'unrelated_image' | 'blurry_or_unreadable' | 'empty_financial_screen';
  rejectionReason: string | null;
  finalDetectedBalance?: number | null;
  transactions: OcrTransactionExtracted[];
}

export interface StatementValidationResult {
  isValid: boolean;
  rejectionReason: string | null;
  finalDetectedBalance?: number | null;
  transactions: OcrTransactionExtracted[];
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  /** Provider name -> time until which it's skipped (in memory, per server). */
  private readonly cooldownUntil = new Map<string, number>();
  /** Fallback counter used only if Redis can't be reached. */
  private readonly localQuota = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  /**
   * Counts one question against the user's daily limit (resets at midnight IST).
   * Uses Redis so the count survives restarts; if Redis is down, counts in memory instead.
   */
  async consumeDailyQuota(
    userId: string,
    kind: 'chat' | 'scan' = 'chat',
  ): Promise<{ allowed: boolean; used: number; limit: number }> {
    const limit =
      kind === 'scan'
        ? Math.max(1, Number(this.configService.get<string>('AI_DAILY_SCAN_LIMIT')) || DEFAULT_AI_DAILY_SCAN_LIMIT)
        : Math.max(1, Number(this.configService.get<string>('AI_DAILY_LIMIT')) || DEFAULT_AI_DAILY_LIMIT);
    const key = `ai:${kind === 'scan' ? 's' : 'q'}:${userId}:${istDay()}`;
    let used: number | null = null;
    try {
      const n = await this.redis?.executeCommand(['INCR', key]);
      if (typeof n === 'number') {
        used = n;
        if (n === 1) await this.redis?.executeCommand(['EXPIRE', key, 2 * 24 * 60 * 60]);
      }
    } catch {
      used = null;
    }
    if (used === null) {
      used = (this.localQuota.get(key) || 0) + 1;
      this.localQuota.set(key, used);
      if (this.localQuota.size > 5000) this.localQuota.clear();
    }
    return { allowed: used <= limit, used, limit };
  }

  private inCooldown(provider: string) {
    return (this.cooldownUntil.get(provider) || 0) > Date.now();
  }

  /**
   * Calls one provider with a timeout and decides what to do with the result.
   * `send` gets an AbortSignal; `extract` pulls the answer text out of the JSON.
   */
  async callProvider(
    provider: string,
    send: (signal: AbortSignal) => Promise<Response>,
    extract: (json: any) => string | undefined,
  ): Promise<ProviderOutcome> {
    if (this.inCooldown(provider)) {
      return { kind: 'next', cooldown: false };
    }
    try {
      const response = await send(AbortSignal.timeout(PROVIDER_TIMEOUT_MS));
      if (response.ok) {
        const json = await response.json();
        const answer = extract(json)?.trim();
        if (answer) return { kind: 'ok', answer };
        this.logger.warn(`[AI] ${provider} returned an empty answer. Trying the next provider.`);
        return { kind: 'next', cooldown: false };
      }
      const errText = await response.text().catch(() => '');
      const verdict = classifyProviderStatus(response.status);
      this.logger.warn(`[AI] ${provider} status ${response.status}: ${errText.slice(0, 300)}`);
      if (verdict === 'stop') return { kind: 'stop', status: response.status };
      if (verdict === 'next-cooldown') this.cooldownUntil.set(provider, Date.now() + PROVIDER_COOLDOWN_MS);
      return { kind: 'next', cooldown: verdict === 'next-cooldown' };
    } catch (err: any) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      this.logger.warn(
        `[AI] ${provider} ${timedOut ? `timed out after ${PROVIDER_TIMEOUT_MS} ms` : `error: ${err?.message || err}`}`,
      );
      // A timeout or network error looks like an outage: rest the provider briefly.
      this.cooldownUntil.set(provider, Date.now() + PROVIDER_COOLDOWN_MS);
      return { kind: 'next', cooldown: true };
    }
  }

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

    const cleanContent = (c: any): string => {
      if (typeof c === 'string') return c;
      if (Array.isArray(c)) return c.join('\n');
      if (c && typeof c === 'object') {
        return c.content || c.message || c.text || JSON.stringify(c);
      }
      return String(c || '');
    };

    // Only the last few messages, each cut to a sane length, and never a "system" message from
    // the phone (those could override the assistant's rules).
    const validHistory = (Array.isArray(history) ? history : [])
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({
        role: m?.role === 'assistant' ? 'assistant' : 'user',
        content: cleanContent(m?.content).trim().slice(0, MAX_HISTORY_MESSAGE_CHARS),
      }))
      .filter((m) => m.content.length > 0);

    const questionText = cleanContent(dto.question).trim().slice(0, MAX_QUESTION_CHARS);

    const standardMessages = [
      { role: 'system', content: systemPrompt },
      ...validHistory,
      { role: 'user', content: questionText },
    ];

    const openAiStyle = (url: string, key: string, model: string) => (signal: AbortSignal) =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: standardMessages, temperature: 0.7, max_tokens: 600 }),
        signal,
      });
    const openAiAnswer = (json: any) => json?.choices?.[0]?.message?.content;

    // Each provider is tried once, in order. One that is rate-limited, down or slow (8 s) is
    // skipped and rested for a minute. If the request itself is rejected (400/413/422) we stop:
    // the other providers would refuse the same request and only use up their quota.
    const attempts: { label: string; run: () => Promise<ProviderOutcome> }[] = [];

    if (groqKey) {
      attempts.push({
        label: 'groq/gpt-oss-120b',
        run: () =>
          this.callProvider(
            'groq',
            openAiStyle('https://api.groq.com/openai/v1/chat/completions', groqKey, 'openai/gpt-oss-120b'),
            openAiAnswer,
          ),
      });
    }
    if (mistralKey) {
      attempts.push({
        label: 'mistral/ministral-8b',
        run: () =>
          this.callProvider(
            'mistral',
            openAiStyle('https://api.mistral.ai/v1/chat/completions', mistralKey, 'ministral-8b-latest'),
            openAiAnswer,
          ),
      });
    }
    if (geminiKey) {
      const contents = [
        ...validHistory.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        { role: 'user', parts: [{ text: questionText }] },
      ];
      attempts.push({
        label: 'gemini-2.5-flash',
        run: () =>
          this.callProvider(
            'gemini',
            (signal) =>
              fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: systemPrompt }] } }),
                  signal,
                },
              ),
            (json) => json?.candidates?.[0]?.content?.parts?.[0]?.text,
          ),
      });
    }

    for (const attempt of attempts) {
      const outcome = await attempt.run();
      if (outcome.kind === 'ok') return { answer: outcome.answer, model: attempt.label };
      if (outcome.kind === 'stop') {
        return {
          answer: "I couldn't process that question. Try asking it in a shorter or simpler way.",
          model: 'system/request-rejected',
        };
      }
    }

    // 4. Safe offline fallback if all 3 providers are unreachable
    const userName = dto.context?.user?.name || 'there';
    return {
      answer: `Hello ${userName}! I see your live total balance is ₹${Number(dto.context?.totalBalance || 0).toLocaleString('en-IN')}. All external AI services are currently experiencing high traffic. Please check back in a few moments.`,
      model: 'system/offline-fallback',
    };
  }

  private sanitizeFinancialPii(rawText: string): string {
    if (!rawText) return '';
    return rawText
      // 1. Redact Indian Aadhaar numbers (12 digits with spaces or hyphens)
      .replace(/\b\d{4}[-\s]\d{4}[-\s]\d{4}\b/g, '[AADHAAR_REDACTED]')
      // 2. Redact Indian PAN numbers (5 letters + 4 digits + 1 letter)
      .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[PAN_REDACTED]')
      // 3. Redact Email addresses
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL_REDACTED]')
      // 4. Redact Indian Phone numbers
      .replace(/(?:\+91[-\s]?)?[6-9]\d{9}\b/g, '[PHONE_REDACTED]')
      // 5. Redact IFSC codes
      .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, '[IFSC_REDACTED]')
      // 6. Redact explicit account number headers while preserving transaction line UTRs
      .replace(/(?:A\/c(?:\s*No\.?)?|Account(?:\s*(?:Number|No\.?))?|Acc\s*No\.?)\s*[:#-]?\s*([0-9A-Za-z*X]{6,22})/gi, 'Account No: [ACCOUNT_REDACTED]')
      // 7. Redact CIF / Customer ID patterns
      .replace(/(?:CIF(?:\s*No\.?)?|Customer\s*ID)\s*[:#-]?\s*([0-9A-Za-z]{6,16})/gi, 'CIF No: [CUSTOMER_ID_REDACTED]');
  }

  async parseStatementText(text: string): Promise<StatementValidationResult> {
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY')?.trim();
    if (!text || text.trim().length === 0) {
      return {
        isValid: false,
        rejectionReason: 'The statement document appears to be empty or unreadable.',
        transactions: [],
      };
    }

    const systemInstruction = `
You are an expert financial document parser for Regent Money.
Your job is to analyze the extracted text from a bank statement or financial PDF.

First, determine if the text contains valid financial bank transactions:
- If the text is NOT a bank statement (e.g. personal document, letter, invoice, resume, random notes, or contains no debit/credit transactions):
  Set isValid to false, provide a clear explanation in rejectionReason, and return empty transactions [].
- If the text contains bank transactions:
  Set isValid to true, rejectionReason to null, and extract all transactions.

Each transaction in the array must have:
- date: string in 'YYYY-MM-DD' format (CRITICAL: extract the exact transaction date from the statement. Do NOT default to today's date).
- time: string or null in 24-hour 'HH:mm' or 'HH:mm:ss' format (extract the exact transaction time if present; otherwise return null).
- amount: number (positive value, no commas)
- type: 'debit' or 'credit' (debit for withdrawal/spend/DR/Paid; credit for deposit/salary/CR/Received)
- merchant: string (clean merchant/payee/payer name or transaction details, remove generic bank noise if possible)
- category: string ('food', 'shopping', 'transfer', 'entertainment', 'utilities', 'salary', 'investment', 'health', 'travel', or 'general')
- balanceAfter: number or null (CRITICAL: if the statement has a "Balance" column or indicates the account balance after this transaction, extract that exact numeric balance here!)
- referenceId: string or null (CRITICAL: Look in the transaction description/narration/details for 12-digit UPI reference numbers / UTRs, IMPS reference numbers, NEFT numbers, Cheque numbers, or transaction IDs, e.g. 'UPI/CR/629349184814' -> '629349184814', or 'TRANSFER TO.../629349830131' -> '629349830131'. If present, extract the exact numeric or alphanumeric reference string; otherwise return null).

Also determine:
- finalDetectedBalance: number or null (the latest/closing account balance visible in the statement)

Return ONLY a valid JSON object matching:
{
  "isValid": boolean,
  "rejectionReason": string or null,
  "finalDetectedBalance": number or null,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:mm" or null,
      "amount": 0.00,
      "type": "debit" | "credit",
      "merchant": "Name",
      "category": "transfer",
      "balanceAfter": 0.00,
      "referenceId": "629349184814" or null
    }
  ]
}
`;

    const sanitizedText = this.sanitizeFinancialPii(text);
    const prompt = `Sanitized Statement Text (PII Redacted):\n${sanitizedText.slice(0, 30000)}\n\nAnalyze and extract transactions:`;

    if (geminiKey) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              systemInstruction: { parts: [{ text: systemInstruction }] },
              generationConfig: { responseMimeType: 'application/json' },
            }),
            // Reading a statement takes longer than a chat answer, but never wait forever
            signal: AbortSignal.timeout(30_000),
          }
        );

        if (response.ok) {
          const json = await response.json();
          const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText.trim());
            const rawList = Array.isArray(parsed.transactions)
              ? parsed.transactions
              : Array.isArray(parsed)
              ? parsed
              : [];
            const txs: OcrTransactionExtracted[] = rawList.map((t: any) => ({
              ...t,
              referenceId: t.referenceId ? String(t.referenceId).trim() : null,
              balanceAfter: typeof t.balanceAfter === 'number' && !isNaN(t.balanceAfter) ? t.balanceAfter : null,
            }));

            let finalBal = parsed.finalDetectedBalance;
            if (finalBal === undefined || finalBal === null) {
              // Try to find the latest transaction that has balanceAfter
              for (let i = txs.length - 1; i >= 0; i--) {
                const b = txs[i].balanceAfter;
                if (typeof b === 'number' && !isNaN(b)) {
                  finalBal = b;
                  break;
                }
              }
            }

            const isValid = (parsed.isValid ?? txs.length > 0) && txs.length > 0;
            return {
              isValid,
              rejectionReason: isValid ? null : (parsed.rejectionReason || 'No recognizable bank transaction entries found in this statement.'),
              finalDetectedBalance: typeof finalBal === 'number' ? finalBal : null,
              transactions: txs,
            };
          }
        }
      } catch (err: any) {
        this.logger.warn(`[AiService] parseStatementText error: ${err?.message || err}`);
      }
    }

    return {
      isValid: false,
      rejectionReason: 'Unable to parse statement text.',
      finalDetectedBalance: null,
      transactions: [],
    };
  }

  async parseImageOcr(imageBuffer: Buffer, mimeType: string = 'image/jpeg'): Promise<OcrValidationResult> {
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY')?.trim();
    if (!geminiKey) {
      throw new Error('GEMINI_API_KEY is not configured on the backend.');
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const todayIso = now.toISOString().split('T')[0];

    const base64Data = imageBuffer.toString('base64');
    const systemInstruction = `
You are an expert AI financial document validator and transaction extractor for Regent Money.
Your first and most critical duty is to inspect and validate the uploaded image.

Today's reference date is ${todayIso} (Current Year: ${currentYear}).

Carefully evaluate the image and classify it into ONE of these categories:
1. "selfie_or_portrait": The image contains a human face, selfie, person, portrait, or group photo.
   - rejectionReason: "The uploaded image appears to be a personal photo or selfie. Please upload a clear screenshot of your bank transactions, UPI payment receipt, or bank statement."
   - isValid: false
   - transactions: []

2. "blurry_or_unreadable": The image is blurry, out of focus, shaky, low resolution, or too degraded to reliably read transaction dates, amounts, or merchant names.
   - rejectionReason: "The image is too blurry or low quality to read transaction details clearly. Please upload a sharper, clear screenshot."
   - isValid: false
   - transactions: []

3. "unrelated_image": The image does NOT contain banking, UPI, payment, or financial records (e.g. food, nature, animals, vehicles, memes, non-financial screenshots, wallpaper, generic documents).
   - rejectionReason: "The uploaded image does not contain any bank transactions or payment details. Please upload a screenshot of your bank passbook, UPI receipt, or transaction history."
   - isValid: false
   - transactions: []

4. "empty_financial_screen": The image is a banking or payment app screen, but contains NO transaction records (e.g., login screen, app settings, empty account dashboard, credit card ad).
   - rejectionReason: "No transaction records were found on this screen. Please open your transaction history or mini-statement and upload a screenshot."
   - isValid: false
   - transactions: []

5. "transaction_screenshot": The image contains valid financial transactions (e.g. bank statement table, GPay, PhonePe, Paytm, CRED, BHIM, bank app transaction list, payment receipt, SMS transaction screenshot, passbook page).
   - isValid: true
   - rejectionReason: null
   - transactions: Extract all visible transactions into an array.
     Each transaction must have:
     * date: string in 'YYYY-MM-DD' format (CRITICAL: extract the exact transaction date shown on the screen or receipt. If the year is not explicitly printed on the screen or receipt, such as '18 Oct' or '17 Oct', you MUST use ${currentYear} as the year, e.g. '${currentYear}-10-18'. Never output past years like 2023 or 2024 for receipts lacking an explicit year).
     * time: string or null (CRITICAL: extract the exact transaction time/timestamp in 24-hour 'HH:mm' or 'HH:mm:ss' format, e.g. '14:32' for 2:32 PM, '09:15', '21:04:12'. Look for timestamps on UPI payment receipts like GPay/PhonePe/Paytm, bank SMS receipts, and app screens. If no time is shown, return null).
     * amount: number (positive value, no commas or currency symbols)
     * type: 'debit' or 'credit' (debit for withdrawal/spend/DR/Paid; credit for deposit/salary/CR/Received)
     * merchant: string (clean merchant/payee/payer name or description, remove generic noise)
     * category: string ('food', 'shopping', 'transfer', 'entertainment', 'utilities', 'salary', 'investment', 'health', 'travel', or 'general')
     * balanceAfter: number or null (CRITICAL: if the table or screenshot has a "Balance" column or indicates the running account balance after that transaction, extract that exact numeric balance here!)
     * referenceId: string or null (CRITICAL: Look for 12-digit UPI reference numbers / UTRs, IMPS reference numbers, NEFT numbers, Cheque numbers, or transaction IDs in the narration, description, or payment receipt screen, e.g. 'UPI/CR/629349184814' -> '629349184814', or 'TRANSFER TO.../629349830131' -> '629349830131'. If present, extract the exact numeric or alphanumeric reference string; otherwise return null).

Also determine:
- finalDetectedBalance: number or null (the latest/closing account balance visible in the statement or screenshot)

Return ONLY a valid JSON object matching this schema:
{
  "isValid": boolean,
  "category": "transaction_screenshot" | "selfie_or_portrait" | "unrelated_image" | "blurry_or_unreadable" | "empty_financial_screen",
  "rejectionReason": string or null,
  "finalDetectedBalance": number or null,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "time": "HH:mm" or null,
      "amount": 0.00,
      "type": "debit" | "credit",
      "merchant": "Name",
      "category": "transfer",
      "balanceAfter": 0.00,
      "referenceId": "629349184814" or null
    }
  ]
}
`;

    const prompt = `Today is ${todayIso}. Validate this image and extract any financial transactions and balance details according to the instructions (assume year ${currentYear} if no year is written on screen):`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType || 'image/jpeg',
                      data: base64Data,
                    },
                  },
                  { text: prompt },
                ],
              },
            ],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: { responseMimeType: 'application/json' },
          }),
          // Reading a screenshot takes longer than a chat answer, but never wait forever
          signal: AbortSignal.timeout(30_000),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`[AiService] Gemini Vision error: ${errText}`);
        return {
          isValid: false,
          category: 'blurry_or_unreadable',
          rejectionReason: 'Unable to analyze image at this time. Please ensure the image is clear and try again.',
          finalDetectedBalance: null,
          transactions: [],
        };
      }

      const json = await response.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        const parsed = JSON.parse(rawText.trim());
        const category = parsed.category || (parsed.isValid ? 'transaction_screenshot' : 'unrelated_image');
        const transactions: OcrTransactionExtracted[] = Array.isArray(parsed.transactions) ? parsed.transactions : [];

        // Safety Net: Sanitize dates so missing years or AI hallucinated past years (like 2023) are clamped to currentYear
        const MONTH_MAP: Record<string, number> = {
          jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
          jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
        };

        const sanitizedTransactions: OcrTransactionExtracted[] = transactions.map((t) => {
          let dateStr = (t.date || '').trim();
          let fixedDate = dateStr;

          const isoMatch = dateStr.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
          if (isoMatch) {
            let yr = parseInt(isoMatch[1], 10);
            const mo = parseInt(isoMatch[2], 10);
            const da = parseInt(isoMatch[3], 10);
            if (yr < currentYear - 1 || yr > currentYear + 1) {
              yr = currentYear;
            }
            fixedDate = `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
          } else {
            const textMatch = dateStr.match(/^(\d{1,2})\s*[-/.\s]?\s*([a-zA-Z]+)(?:\s*[-/.\s]?\s*(\d{2,4}))?$/);
            if (textMatch) {
              const da = parseInt(textMatch[1], 10);
              const mName = textMatch[2].toLowerCase().slice(0, 3);
              const mo = MONTH_MAP[mName] || (now.getMonth() + 1);
              let yr = textMatch[3] ? parseInt(textMatch[3], 10) : currentYear;
              if (yr < 100) yr += 2000;
              if (yr < currentYear - 1 || yr > currentYear + 1) yr = currentYear;
              fixedDate = `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
            } else {
              const d = new Date(dateStr);
              if (!isNaN(d.getTime())) {
                let yr = d.getFullYear();
                if (yr < currentYear - 1 || yr > currentYear + 1) yr = currentYear;
                fixedDate = `${yr}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              } else {
                fixedDate = todayIso;
              }
            }
          }

          return {
            ...t,
            date: fixedDate,
            referenceId: t.referenceId ? String(t.referenceId).trim() : null,
            balanceAfter: typeof t.balanceAfter === 'number' && !isNaN(t.balanceAfter) ? t.balanceAfter : null,
          };
        });

        let rejectionReason = parsed.rejectionReason;
        if (!parsed.isValid || sanitizedTransactions.length === 0) {
          if (!rejectionReason) {
            if (category === 'selfie_or_portrait') {
              rejectionReason = 'The uploaded image appears to be a personal photo or selfie. Please upload a clear screenshot of your bank transactions or UPI receipt.';
            } else if (category === 'blurry_or_unreadable') {
              rejectionReason = 'The image is too blurry or low quality to read transaction details clearly. Please upload a sharper, clear screenshot.';
            } else if (category === 'empty_financial_screen') {
              rejectionReason = 'No transaction records were found on this screen. Please open your transaction history and upload a screenshot.';
            } else {
              rejectionReason = 'The uploaded image does not contain recognizable bank transactions. Please upload a valid bank or payment app screenshot.';
            }
          }
        }

        let finalBal = parsed.finalDetectedBalance;
        if (finalBal === undefined || finalBal === null) {
          // If statement table has balanceAfter, find the latest row with a balance
          for (let i = sanitizedTransactions.length - 1; i >= 0; i--) {
            const b = sanitizedTransactions[i].balanceAfter;
            if (typeof b === 'number' && !isNaN(b)) {
              finalBal = b;
              break;
            }
          }
        }

        return {
          isValid: !!parsed.isValid && sanitizedTransactions.length > 0,
          category,
          rejectionReason: (parsed.isValid && sanitizedTransactions.length > 0) ? null : rejectionReason,
          finalDetectedBalance: typeof finalBal === 'number' ? finalBal : null,
          transactions: sanitizedTransactions,
        };
      }
    } catch (err: any) {
      this.logger.error(`[AiService] Vision OCR parsing exception: ${err?.message || err}`);
    }

    return {
      isValid: false,
      category: 'unrelated_image',
      rejectionReason: 'Could not process this image. Please upload a clear screenshot of your bank transaction history.',
      finalDetectedBalance: null,
      transactions: [],
    };
  }
}
