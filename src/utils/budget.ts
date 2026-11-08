export interface UserExclusionContext {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  bankSuffixes?: string[];
}

/**
 * Pure helper to determine if a transaction should be excluded from spending budgets or income stats.
 * Excludes self-transfers, peer lending, credit card bill payments, and explicitly excluded IDs.
 */
export function isExcludedFromBudget(
  tx: any,
  explicitExcludedIds?: string[],
  userContext?: UserExclusionContext
): boolean {
  if (!tx) return false;
  if (tx.isSelfTransfer === true || tx.excludedFromBudget === true) return true;
  const category = (tx.category || tx.tag || '').toLowerCase().trim();
  if (
    category === 'transfer' ||
    category === 'self_transfer' ||
    category === 'self transfer' ||
    category === 'self-transfer' ||
    category === 'own_account' ||
    category === 'internal_transfer' ||
    category === 'peer_lent' ||
    category === 'peer_lent_repaid' ||
    category === 'peer_borrowed' ||
    category === 'peer_borrow_repaid' ||
    category.startsWith('peer_')
  ) return true;

  if (explicitExcludedIds && tx.id && explicitExcludedIds.includes(tx.id)) {
    return true;
  }

  try {
    const { useBudgetStore } = require('../store');
    const excludedIds: string[] = useBudgetStore.getState().excludedTransactionIds || [];
    if (tx.id && excludedIds.includes(tx.id)) return true;
  } catch { }

  const textFields = [
    tx.merchant,
    tx.source,
    tx.note,
    tx.rawText,
    tx.description,
    tx.title,
    tx.counterparty,
    tx.beneficiary,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  const excludedPatterns = [
    'CRED',
    'CHEQ',
    'BILLDESK',
    'CREDIT CARD',
    'CC PYMT',
    'CC PAYMENT',
    'AUTOPAY CARD',
    'CARD PAYMENT',
    'SELF TRANSFER',
    'TRANSFER TO OWN',
    'TRANSFER FROM OWN',
    'TRF TO OWN',
    'TRF FROM OWN',
    'TRANSFERRED TO OWN',
    'TRANSFERRED FROM OWN',
    'TRANSFER TO SELF',
    'TRANSFER FROM SELF',
    'SENT TO SELF',
    'RECEIVED FROM SELF',
    'SAME BANK TRANSFER',
    'SELF TRF',
    'SELF-TRF',
    'OWN A/C',
    'OWN AC',
    'OWN ACC',
    'OWN ACCOUNT',
    'SELF ACC',
    'SELF A/C',
    'TO SELF',
    'FROM SELF',
    'SELF-TRANSFER',
    'SELF_TRANSFER',
    'TRANSFER XX',
    'TRF XX',
    'TRF TO',
    'TRF FROM',
    'INTERNAL TRANSFER',
    'INTERNAL TRF',
    'ACCOUNT TRANSFER',
    'A/C TRANSFER',
    'OWN BANK',
  ];

  if (excludedPatterns.some((pattern) => textFields.includes(pattern))) return true;

  // Check if textFields matches user's own name, phone, or email
  let user = userContext;
  if (!user) {
    try {
      const { useAuthStore } = require('../store');
      user = useAuthStore.getState().user;
    } catch { }
  }

  if (user) {
    if (user.name) {
      const uName = user.name.trim().toUpperCase();
      if (uName.length >= 3) {
        if (textFields.includes(uName)) return true;
        const parts = uName.split(/[\s._-]+/).filter((p: string) => p.length >= 3);
        for (const part of parts) {
          const regex = new RegExp(`\\b${part}\\b`, 'i');
          if (regex.test(textFields)) return true;
        }
      }
    }
    if (user.phone) {
      const cleanPhone = String(user.phone).replace(/[^0-9]/g, '');
      if (cleanPhone.length >= 10 && textFields.includes(cleanPhone.slice(-10))) {
        return true;
      }
    }
    if (user.email) {
      const prefix = user.email.split('@')[0].toUpperCase();
      if (prefix.length >= 4 && textFields.includes(prefix)) {
        return true;
      }
    }
  }

  // Check if textFields mentions another linked bank profile's account suffix
  let suffixes = userContext?.bankSuffixes;
  if (!suffixes) {
    try {
      const { useBankStore } = require('../store');
      const bankProfiles = useBankStore.getState().bankProfiles || [];
      suffixes = bankProfiles.map((b: any) => (b.accountNumberSuffix || '').trim()).filter(Boolean);
    } catch { }
  }

  if (suffixes && suffixes.length > 0) {
    for (const suffix of suffixes) {
      if (suffix.length >= 3 && textFields.includes(suffix)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detects cross-account transfer pairs between user's accounts.
 * When a user transfers money from Bank A to Bank B, Bank A registers a debit
 * and Bank B registers a credit for the identical amount around the same timestamp.
 * Both legs represent internal capital movement and must be excluded from Money in and Money out.
 */
export function findPairedTransferIds(
  debits: any[],
  credits: any[],
  maxTimeDeltaMs: number = 24 * 60 * 60 * 1000 // 24 hours
): Set<string> {
  const pairedIds = new Set<string>();
  if (!Array.isArray(debits) || !Array.isArray(credits) || debits.length === 0 || credits.length === 0) {
    return pairedIds;
  }

  const toMinorAmt = (amt: any): number => {
    if (typeof amt === 'number') return Math.round(amt * 100);
    const n = parseFloat(String(amt).replace(/,/g, ''));
    return isNaN(n) ? 0 : Math.round(n * 100);
  };

  const matchedCreditIndices = new Set<number>();

  for (const debit of debits) {
    if (!debit || debit.isDeleted || debit.type === 'credit') continue;
    const dAmt = Math.abs(toMinorAmt(debit.amount));
    if (dAmt === 0) continue;
    const dTime = Number(debit.timestamp) || 0;

    let bestCreditIdx = -1;
    let minDelta = Infinity;

    for (let i = 0; i < credits.length; i++) {
      if (matchedCreditIndices.has(i)) continue;
      const credit = credits[i];
      if (!credit || credit.isDeleted) continue;
      const cAmt = Math.abs(toMinorAmt(credit.amount));
      if (cAmt !== dAmt) continue;

      // If both have bankProfileId, ensure they are different accounts
      if (debit.bankProfileId && credit.bankProfileId && debit.bankProfileId === credit.bankProfileId) {
        continue;
      }

      // Cash entries are typed in by hand, so a matching amount is a coincidence, not a transfer.
      // (A real move of money is marked as a self-transfer and excluded by category instead.)
      if (String(debit.bankProfileId ?? '').startsWith('cash_') || String(credit.bankProfileId ?? '').startsWith('cash_')) {
        continue;
      }

      const cTime = Number(credit.timestamp) || 0;
      const delta = Math.abs(dTime - cTime);
      if (delta <= maxTimeDeltaMs && delta < minDelta) {
        minDelta = delta;
        bestCreditIdx = i;
      }
    }

    if (bestCreditIdx !== -1) {
      matchedCreditIndices.add(bestCreditIdx);
      if (debit.id) pairedIds.add(String(debit.id));
      const matchedCredit = credits[bestCreditIdx];
      if (matchedCredit.id) pairedIds.add(String(matchedCredit.id));
    }
  }

  return pairedIds;
}

