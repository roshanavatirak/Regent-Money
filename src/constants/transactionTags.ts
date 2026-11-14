/**
 * Master Transaction Tags Dictionary & Indian Merchant Classification Engine
 * Matches Paytm's "Tag your payment" taxonomy with 30+ spending categories,
 * icons, pastel backgrounds, and comprehensive Indian merchant brand mappings.
 */

import { predictTag } from './merchantTagRules';

export interface TransactionTagDef {
  id: string;
  label: string;
  iconName: string;
  iconType: 'feather' | 'ionicons';
  bgColorLight: string;
  bgColorDark: string;
  iconColor: string;
}

export const PAYTM_TRANSACTION_TAGS: TransactionTagDef[] = [
  {
    id: 'food',
    label: 'Food',
    iconName: 'coffee',
    iconType: 'feather',
    bgColorLight: '#FFF3E0',
    bgColorDark: '#3A291A',
    iconColor: '#F57C00',
  },
  {
    id: 'shopping',
    label: 'Shopping',
    iconName: 'shopping-bag',
    iconType: 'feather',
    bgColorLight: '#FCE4EC',
    bgColorDark: '#3B1F2B',
    iconColor: '#E91E63',
  },
  {
    id: 'groceries',
    label: 'Groceries',
    iconName: 'shopping-cart',
    iconType: 'feather',
    bgColorLight: '#E8F5E9',
    bgColorDark: '#1E3524',
    iconColor: '#43A047',
  },
  {
    id: 'entertainment',
    label: 'Entertainment',
    iconName: 'film',
    iconType: 'feather',
    bgColorLight: '#FFEBEE',
    bgColorDark: '#3D1B1F',
    iconColor: '#E53935',
  },
  {
    id: 'travel',
    label: 'Travel',
    iconName: 'airplane-outline',
    iconType: 'ionicons',
    bgColorLight: '#E1F5FE',
    bgColorDark: '#1A3344',
    iconColor: '#0288D1',
  },
  {
    id: 'fuel',
    label: 'Fuel',
    iconName: 'flame-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFF8E1',
    bgColorDark: '#3E341B',
    iconColor: '#FFA000',
  },
  {
    id: 'services',
    label: 'Services',
    iconName: 'construct-outline',
    iconType: 'ionicons',
    bgColorLight: '#EDE7F6',
    bgColorDark: '#2C223E',
    iconColor: '#7E57C2',
  },
  {
    id: 'financial_services',
    label: 'Financial Services',
    iconName: 'business-outline',
    iconType: 'ionicons',
    bgColorLight: '#E0F2F1',
    bgColorDark: '#193633',
    iconColor: '#00897B',
  },
  {
    id: 'medical',
    label: 'Medical',
    iconName: 'medkit-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFEBEE',
    bgColorDark: '#3C1B1F',
    iconColor: '#E53935',
  },
  {
    id: 'education',
    label: 'Education',
    iconName: 'book-outline',
    iconType: 'ionicons',
    bgColorLight: '#E8EAF6',
    bgColorDark: '#22263C',
    iconColor: '#3F51B5',
  },
  {
    id: 'bill_payments',
    label: 'Bill Payments',
    iconName: 'receipt-outline',
    iconType: 'ionicons',
    bgColorLight: '#E0F7FA',
    bgColorDark: '#18363C',
    iconColor: '#00ACC1',
  },
  {
    id: 'cashback',
    label: 'Cashback',
    iconName: 'cash-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFFDE7',
    bgColorDark: '#393616',
    iconColor: '#FBC02D',
  },
  {
    id: 'insurance',
    label: 'Insurance',
    iconName: 'shield-checkmark-outline',
    iconType: 'ionicons',
    bgColorLight: '#E8F5E9',
    bgColorDark: '#1E3524',
    iconColor: '#2E7D32',
  },
  {
    id: 'investment',
    label: 'Investment',
    iconName: 'trending-up',
    iconType: 'feather',
    bgColorLight: '#FFF8E1',
    bgColorDark: '#3A3319',
    iconColor: '#FFB300',
  },
  {
    id: 'donation',
    label: 'Donation',
    iconName: 'heart-outline',
    iconType: 'ionicons',
    bgColorLight: '#FCE4EC',
    bgColorDark: '#371A27',
    iconColor: '#D81B60',
  },
  {
    id: 'money_transfer',
    label: 'Money Transfer',
    iconName: 'swap-horizontal-outline',
    iconType: 'ionicons',
    bgColorLight: '#E8F5E9',
    bgColorDark: '#1D3523',
    iconColor: '#43A047',
  },
  {
    id: 'money_received',
    label: 'Money Received',
    iconName: 'arrow-down-circle-outline',
    iconType: 'ionicons',
    bgColorLight: '#E8F5E9',
    bgColorDark: '#1A3622',
    iconColor: '#2E7D32',
  },
  {
    id: 'self_transfer',
    label: 'Self Transfer',
    iconName: 'repeat',
    iconType: 'feather',
    bgColorLight: '#E0F7FA',
    bgColorDark: '#19363D',
    iconColor: '#00838F',
  },
  {
    id: 'salary',
    label: 'Salary',
    iconName: 'briefcase',
    iconType: 'feather',
    bgColorLight: '#E8F5E9',
    bgColorDark: '#1B3521',
    iconColor: '#2E7D32',
  },
  {
    id: 'interest',
    label: 'Interest',
    iconName: 'percent',
    iconType: 'feather',
    bgColorLight: '#FFF8E1',
    bgColorDark: '#383218',
    iconColor: '#F57F17',
  },
  {
    id: 'miscellaneous',
    label: 'Miscellaneous',
    iconName: 'grid',
    iconType: 'feather',
    bgColorLight: '#ECEFF1',
    bgColorDark: '#263238',
    iconColor: '#546E7A',
  },
  {
    id: 'commute',
    label: 'Commute',
    iconName: 'car-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFF8E1',
    bgColorDark: '#39331B',
    iconColor: '#FFB300',
  },
  {
    id: 'fitness',
    label: 'Fitness',
    iconName: 'barbell-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFF3E0',
    bgColorDark: '#392817',
    iconColor: '#FB8C00',
  },
  {
    id: 'emi_loans',
    label: 'EMI and Loans',
    iconName: 'card-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFFDE7',
    bgColorDark: '#3A3716',
    iconColor: '#FDD835',
  },
  {
    id: 'business_expense',
    label: 'Business Expense',
    iconName: 'briefcase-outline',
    iconType: 'ionicons',
    bgColorLight: '#EFEBE9',
    bgColorDark: '#322B28',
    iconColor: '#6D4C41',
  },
  {
    id: 'utilities',
    label: 'Utilities',
    iconName: 'bulb-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFFDE7',
    bgColorDark: '#363417',
    iconColor: '#FBC02D',
  },
  {
    id: 'rent',
    label: 'Rent',
    iconName: 'home-outline',
    iconType: 'ionicons',
    bgColorLight: '#FBE9E7',
    bgColorDark: '#3B241E',
    iconColor: '#F4511E',
  },
  {
    id: 'personal_care',
    label: 'Personal Care',
    iconName: 'cut-outline',
    iconType: 'ionicons',
    bgColorLight: '#F3E5F5',
    bgColorDark: '#311E36',
    iconColor: '#8E24AA',
  },
  {
    id: 'gifts',
    label: 'Gifts',
    iconName: 'gift-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFEBEE',
    bgColorDark: '#391B1F',
    iconColor: '#E53935',
  },
  {
    id: 'cash_withdrawals',
    label: 'Cash Withdrawals',
    iconName: 'card',
    iconType: 'ionicons',
    bgColorLight: '#E3F2FD',
    bgColorDark: '#1A2F45',
    iconColor: '#1976D2',
  },
  {
    id: 'peer_lent',
    label: 'Lent to friend',
    iconName: 'arrow-up-right',
    iconType: 'feather',
    bgColorLight: '#E0F7FA',
    bgColorDark: 'rgba(8, 145, 178, 0.22)',
    iconColor: '#0E7490',
  },
  {
    id: 'peer_lent_repaid',
    label: 'Friend repaid',
    iconName: 'check-circle',
    iconType: 'feather',
    bgColorLight: '#E0F7FA',
    bgColorDark: 'rgba(8, 145, 178, 0.22)',
    iconColor: '#0E7490',
  },
  {
    id: 'peer_borrowed',
    label: 'Borrowed',
    iconName: 'arrow-down-left',
    iconType: 'feather',
    bgColorLight: '#FFFBEB',
    bgColorDark: 'rgba(217, 119, 6, 0.22)',
    iconColor: '#B45309',
  },
  {
    id: 'peer_borrow_repaid',
    label: 'Repaid friend',
    iconName: 'corner-down-right',
    iconType: 'feather',
    bgColorLight: '#FFF7ED',
    bgColorDark: 'rgba(234, 88, 12, 0.22)',
    iconColor: '#C2410C',
  },
];

/**
 * Normalizes merchant string for consistent rule matching & lookup.
 */
export function normalizeMerchantName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Predicts the tag for a transaction:
 * 1. The user's own "Always tag" choices (exact merchant, then a merchant that contains it)
 * 2. The shared rules in merchantTagRules.ts (self transfer, money in, brands, payments to people)
 * 3. 'miscellaneous' when nothing fits (never a guessed 'shopping')
 */
export function predictTagForTransaction(
  merchant: string,
  body?: string,
  type: 'debit' | 'credit' = 'debit',
  arg4?: boolean | Record<string, string>,
  arg5?: boolean | Record<string, string>
): string {
  let isSalary = false;
  let userLearnedTags: Record<string, string> | undefined;

  if (typeof arg4 === 'boolean') {
    isSalary = arg4;
    if (typeof arg5 === 'object' && arg5 !== null) userLearnedTags = arg5 as Record<string, string>;
  } else if (typeof arg4 === 'object' && arg4 !== null) {
    userLearnedTags = arg4 as Record<string, string>;
    if (typeof arg5 === 'boolean') isSalary = arg5;
  } else if (typeof arg5 === 'boolean') {
    isSalary = arg5;
  } else if (typeof arg5 === 'object' && arg5 !== null) {
    userLearnedTags = arg5 as Record<string, string>;
  }

  const normMerchant = normalizeMerchantName(merchant);
  if (userLearnedTags && normMerchant) {
    if (userLearnedTags[normMerchant]) {
      return userLearnedTags[normMerchant];
    }
    for (const [learnedMerchant, tag] of Object.entries(userLearnedTags)) {
      if (normMerchant.includes(learnedMerchant) || learnedMerchant.includes(normMerchant)) {
        return tag;
      }
    }
  }

  return predictTag(merchant, body, type, isSalary);
}

/**
 * Returns tag definition by tag id or label.
 */
export function getTagDef(tagIdOrLabel?: string | null): TransactionTagDef {
  if (!tagIdOrLabel) {
    return PAYTM_TRANSACTION_TAGS.find(t => t.id === 'miscellaneous')!;
  }
  const clean = tagIdOrLabel.toLowerCase().replace(/\s+/g, '_');
  const found = PAYTM_TRANSACTION_TAGS.find(
    t => t.id === clean || t.label.toLowerCase() === tagIdOrLabel.toLowerCase()
  );
  if (found) return found;

  // Custom user tag fallback: create a dynamic def
  return {
    id: clean,
    label: tagIdOrLabel.charAt(0).toUpperCase() + tagIdOrLabel.slice(1),
    iconName: 'tag',
    iconType: 'feather',
    bgColorLight: '#EDE7F6',
    bgColorDark: '#2C223E',
    iconColor: '#7E57C2',
  };
}
