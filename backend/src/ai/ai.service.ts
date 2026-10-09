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

export interface OcrTransactionExtracted {
  date: string;
  time?: string | null;
  timestamp?: number | null;
  amount: number;
  type: 'debit' | 'credit';
  merchant: string;
  category?: string;
  balanceAfter?: number | null;
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
      "balanceAfter": 0.00
    }
  ]
}
`;

    const prompt = `Raw Statement Text:\n${text.slice(0, 30000)}\n\nAnalyze and extract transactions:`;

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
          }
        );

        if (response.ok) {
          const json = await response.json();
          const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = JSON.parse(rawText.trim());
            const txs: OcrTransactionExtracted[] = Array.isArray(parsed.transactions)
              ? parsed.transactions
              : Array.isArray(parsed)
              ? parsed
              : [];

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

    const base64Data = imageBuffer.toString('base64');
    const systemInstruction = `
You are an expert AI financial document validator and transaction extractor for Regent Money.
Your first and most critical duty is to inspect and validate the uploaded image.

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
     * date: string in 'YYYY-MM-DD' format (CRITICAL: extract the exact transaction date shown on the screen or receipt. Do NOT use today's date if a date is present. If year is missing, infer from context or assume current year).
     * time: string or null (CRITICAL: extract the exact transaction time/timestamp in 24-hour 'HH:mm' or 'HH:mm:ss' format, e.g. '14:32' for 2:32 PM, '09:15', '21:04:12'. Look for timestamps on UPI payment receipts like GPay/PhonePe/Paytm, bank SMS receipts, and app screens. If no time is shown, return null).
     * amount: number (positive value, no commas or currency symbols)
     * type: 'debit' or 'credit' (debit for withdrawal/spend/DR/Paid; credit for deposit/salary/CR/Received)
     * merchant: string (clean merchant/payee/payer name or description, remove generic noise)
     * category: string ('food', 'shopping', 'transfer', 'entertainment', 'utilities', 'salary', 'investment', 'health', 'travel', or 'general')
     * balanceAfter: number or null (CRITICAL: if the table or screenshot has a "Balance" column or indicates the running account balance after that transaction, extract that exact numeric balance here!)

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
      "balanceAfter": 0.00
    }
  ]
}
`;

    const prompt = 'Validate this image and extract any financial transactions and balance details according to the instructions:';

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

        let rejectionReason = parsed.rejectionReason;
        if (!parsed.isValid || transactions.length === 0) {
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
          for (let i = transactions.length - 1; i >= 0; i--) {
            const b = transactions[i].balanceAfter;
            if (typeof b === 'number' && !isNaN(b)) {
              finalBal = b;
              break;
            }
          }
        }

        return {
          isValid: !!parsed.isValid && transactions.length > 0,
          category,
          rejectionReason: (parsed.isValid && transactions.length > 0) ? null : rejectionReason,
          finalDetectedBalance: typeof finalBal === 'number' ? finalBal : null,
          transactions,
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
