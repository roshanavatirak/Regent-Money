/**
 * Bank SMS Sender Dictionary & Helper Functions
 * Maps Indian Bank codes and names to their known DLT SMS sender headers / tags.
 */

export const BANK_DEFAULT_SMS_SUGGESTIONS: Record<string, string[]> = {
  // State Bank of India
  'SBIN': ['SBIPSG', 'SBIBNK', 'SBIUPI', 'SBIINB', 'ATMSBI', 'SBISMS', 'CBSSBI'],
  'SBI': ['SBIPSG', 'SBIBNK', 'SBIUPI', 'SBIINB', 'ATMSBI', 'SBISMS', 'CBSSBI'],

  // HDFC Bank
  'HDFC': ['HDFCBK', 'HDFCBN', 'HDFCLT', 'HDFCAL', 'HDFCCC', 'HDFCSM'],

  // ICICI Bank
  'ICIC': ['ICICIB', 'ICICIT', 'ICICIS', 'ICICAC', 'ICICIC'],
  'ICICI': ['ICICIB', 'ICICIT', 'ICICIS', 'ICICAC', 'ICICIC'],

  // Axis Bank
  'UTIB': ['AXISBK', 'AXISBC', 'AXISIN', 'AXISAL', 'AXISMS'],
  'AXIS': ['AXISBK', 'AXISBC', 'AXISIN', 'AXISAL', 'AXISMS'],

  // Kotak Mahindra Bank
  'KKBK': ['KOTAKB', 'KOTAKS', 'KOTAKN', 'KMBLTD'],
  'KOTAK': ['KOTAKB', 'KOTAKS', 'KOTAKN', 'KMBLTD'],

  // Bank of Baroda
  'BARB': ['BOBTXN', 'BOBSMS', 'BOBALT', 'BARB'],
  'BOB': ['BOBTXN', 'BOBSMS', 'BOBALT', 'BARB'],

  // Punjab National Bank
  'PUNB': ['PNBSMS', 'PNBALT', 'PUNBNK', 'PNBTXN'],
  'PNB': ['PNBSMS', 'PNBALT', 'PUNBNK', 'PNBTXN'],

  // Canara Bank
  'CNRB': ['CNRBK', 'CANBNK', 'CANARA', 'CNRSMS'],
  'CANARA': ['CNRBK', 'CANBNK', 'CANARA', 'CNRSMS'],

  // Union Bank of India
  'UBIN': ['UBININ', 'UBISMS', 'UNIONB'],
  'UNION': ['UBININ', 'UBISMS', 'UNIONB'],

  // IDFC FIRST Bank
  'IDFB': ['IDFCFB', 'IDFCBK', 'IDFCBN'],
  'IDFC': ['IDFCFB', 'IDFCBK', 'IDFCBN'],

  // IndusInd Bank
  'INDB': ['INDBNK', 'INDUSB', 'INDUSI'],
  'INDUSIND': ['INDBNK', 'INDUSB', 'INDUSI'],

  // Yes Bank
  'YESB': ['YESBNK', 'YESB', 'YESALT'],
  'YES': ['YESBNK', 'YESB', 'YESALT'],

  // Federal Bank
  'FDRL': ['FEDBNK', 'FEDRAL'],
  'FEDERAL': ['FEDBNK', 'FEDRAL'],

  // Indian Bank
  'IDIB': ['INDIBK', 'INDIAN'],
  'INDIAN': ['INDIBK', 'INDIAN'],

  // Bank of India
  'BKID': ['BOIND', 'BOISMS', 'BOIALT'],
  'BOI': ['BOIND', 'BOISMS', 'BOIALT'],

  // Central Bank of India
  'CBIN': ['CBIN', 'CENTBK'],

  // Indian Overseas Bank
  'IOBA': ['IOBCHN', 'IOBBNK'],

  // UCO Bank
  'UCBA': ['UCOBNK'],

  // RBL Bank
  'RATN': ['RBLBNK', 'RBLSMS'],
  'RBL': ['RBLBNK', 'RBLSMS'],

  // Paytm Payments Bank
  'PYTM': ['PAYTM', 'PAYTMB'],
  'PAYTM': ['PAYTM', 'PAYTMB'],

  // Airtel Payments Bank
  'AIRP': ['AIRTEL', 'AIRBNK'],
  'AIRTEL': ['AIRTEL', 'AIRBNK'],
};

/**
 * Returns suggested SMS sender tags for a bank given its IFSC code or name.
 */
export function getSmsSenderSuggestions(bankCodeOrName?: string | null): string[] {
  if (!bankCodeOrName) return [];
  const clean = bankCodeOrName.trim().toUpperCase();

  // 1. Direct match by code
  if (BANK_DEFAULT_SMS_SUGGESTIONS[clean]) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS[clean]];
  }

  // 2. Search by substring or bank name
  for (const [key, suggestions] of Object.entries(BANK_DEFAULT_SMS_SUGGESTIONS)) {
    if (clean.includes(key) || key.includes(clean)) {
      return [...suggestions];
    }
  }

  // 3. Common bank name checks
  if (clean.includes('STATE BANK') || clean.includes('SBI')) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS['SBIN']];
  }
  if (clean.includes('HDFC')) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS['HDFC']];
  }
  if (clean.includes('ICICI')) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS['ICIC']];
  }
  if (clean.includes('AXIS')) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS['UTIB']];
  }
  if (clean.includes('KOTAK')) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS['KKBK']];
  }
  if (clean.includes('BARODA') || clean.includes('BOB')) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS['BARB']];
  }
  if (clean.includes('PUNJAB') || clean.includes('PNB')) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS['PUNB']];
  }
  if (clean.includes('CANARA')) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS['CNRB']];
  }
  if (clean.includes('UNION')) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS['UBIN']];
  }
  if (clean.includes('IDFC')) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS['IDFB']];
  }
  if (clean.includes('INDUSIND')) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS['INDB']];
  }
  if (clean.includes('YES')) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS['YESB']];
  }
  if (clean.includes('FEDERAL')) {
    return [...BANK_DEFAULT_SMS_SUGGESTIONS['FDRL']];
  }

  // Default fallback: 4-character code + 'BK'
  const prefix = clean.replace(/[^A-Z]/g, '').slice(0, 4);
  return prefix ? [`${prefix}BK`, `${prefix}SMS`] : [];
}

/**
 * Parses a comma-separated or space-separated SMS sender ID string into an array of uppercase tags.
 */
export function parseSmsSenderTags(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map(t => t.replace(/[^A-Za-z0-9]/g, '').toUpperCase().trim())
    .filter(t => t.length >= 3);
}

/**
 * Formats an array of tags into a clean comma-separated string for persistence.
 */
export function formatSmsSenderTags(tags: string[]): string {
  const unique = Array.from(
    new Set(
      tags
        .map(t => t.replace(/[^A-Za-z0-9]/g, '').toUpperCase().trim())
        .filter(t => t.length >= 3)
    )
  );
  return unique.join(', ');
}

/**
 * Checks if an incoming SMS sender address matches any of the bank's configured SMS sender tags.
 * Handles Indian DLT sender prefixes like 'VM-SBIPSG', 'VK-SBIBNK', 'AD-HDFCBK', 'BW-SBIINB'.
 */
export function matchesSmsSender(incomingSender: string, bankSmsSenderId?: string | null): boolean {
  if (!incomingSender) return false;
  const tags = parseSmsSenderTags(bankSmsSenderId);
  if (tags.length === 0) return true; // If no tags restricted, allow any sender

  // Strip DLT 2-character prefix: e.g. "VM-SBIPSG" -> "SBIPSG", "VK-SBIBNK" -> "SBIBNK"
  const cleanSender = incomingSender
    .toUpperCase()
    .replace(/^[A-Z]{2}-/i, '')
    .replace(/[^A-Z0-9]/g, '')
    .trim();

  return tags.some(tag => {
    return cleanSender === tag || cleanSender.includes(tag) || tag.includes(cleanSender);
  });
}

/**
 * Returns a unique, flat array of all known default bank SMS sender IDs.
 */
export function getAllDefaultBankSenderIds(): string[] {
  const set = new Set<string>();
  Object.values(BANK_DEFAULT_SMS_SUGGESTIONS).forEach((tags) => {
    tags.forEach((tag) => {
      const clean = tag.replace(/[^A-Za-z0-9]/g, '').toUpperCase().trim();
      if (clean) set.add(clean);
    });
  });
  return Array.from(set);
}

/**
 * Pushes the union of default bank sender IDs and user custom tags to native SharedPreferences
 * so Android's SmsReceiver can filter incoming messages on-device before any processing.
 */
export function syncBankSenderIdsToNative(customTags: string[] = []): void {
  try {
    const { Platform, NativeModules } = require('react-native');
    if (Platform.OS !== 'android') return;
    const defaults = getAllDefaultBankSenderIds();
    const set = new Set<string>(defaults);
    customTags.forEach((t) => {
      const parsed = parseSmsSenderTags(t);
      parsed.forEach((clean) => set.add(clean));
    });
    NativeModules.NativeStorage?.setBankSenderIds?.(Array.from(set));
  } catch (e) {
    console.warn('[bankSmsSenders] Failed to sync bank sender IDs to native storage:', e);
  }
}

