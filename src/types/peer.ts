// src/types/peer.ts
//
// Core data models for Regent Money Borrow & Lend tracking.
// All monetary values are integer paise (1 INR = 100 paise).
// Dates are stored as 'YYYY-MM-DD' calendar date strings to avoid timezone shift bugs.

export type Paise = number;         // Integer paise: ₹1,500.00 = 150000
export type DateString = string;    // 'YYYY-MM-DD' calendar date (e.g., '2026-10-25')

/** Contact represents a friend, family member, or counterparty */
export interface Contact {
  id: string;
  displayName: string;              // Canonical display name: "Gitabai"
  aliases: string[];                // Cleaned aliases: ["Gitabai/Paytm", "Gitabai S"]
  upiIds: string[];                 // Normalized VPAs: ["gitabai@paytm"]
  phoneE164?: string;               // "+919876543210" (selected via OS single-contact picker)
  avatarColor?: string;
  notes?: string;
  createdAt: number;                // Epoch timestamp
  updatedAt: number;
}

export type EntryKind =
  | 'LEND'              // Money given to contact (Receivable ↑)
  | 'BORROW'            // Money taken from contact (Payable ↑)
  | 'REPAY_RECEIVED'    // Repayment received from contact (Receivable ↓)
  | 'REPAY_PAID'        // Repayment paid to contact (Payable ↓)
  | 'FORGIVE_LENT'      // Debt written off by user (Asset written down)
  | 'FORGIVE_BORROWED'  // Debt forgiven by contact (Liability cleared)
  | 'NET_OFF';          // Mutual debt cancellation between same contact

export interface PeerEntry {
  id: string;
  contactId: string;
  kind: EntryKind;
  amount: Paise;                    // Positive integer paise
  date: DateString;                 // Calendar date: '2026-10-12'
  source: 
    | { type: 'txn'; txnId: string }
    | { type: 'manual'; method: 'cash' | 'upi_manual' | 'other' };
  dueDate?: DateString;             // Optional due date: '2026-11-01'
  note?: string;                    // "Trip share", "Emergency rent"
  editedFromId?: string;            // Audit trail versioning
  deletedAt?: number;               // Soft-delete timestamp (undefined if active)
  createdAt: number;
  updatedAt: number;
}

/** Stored manual allocation overrides ONLY */
export interface StoredAllocation {
  id: string;
  repaymentEntryId: string;
  loanEntryId: string;
  amount: Paise;
  mode: 'manual';
  createdAt: number;
}

/** In-flight UPI transfer awaiting bank confirmation */
export interface PendingSettlement {
  id: string;
  contactId: string;
  loanEntryId: string;
  amount: Paise;
  vpa: string;
  createdAt: number;
  expiresAt: number;                // createdAt + 24 hours
  status: 'pending' | 'matched' | 'expired';
}

// ----------------------------------------------------------------------
// Pure Derived State (Computed on the Fly, Never Stored in Database)
// ----------------------------------------------------------------------

export interface ComputedAllocation {
  id: string;
  repaymentEntryId: string;
  loanEntryId: string;
  amount: Paise;
  mode: 'manual' | 'auto_fifo';
}

export interface ComputedLoan {
  entry: PeerEntry;
  originalAmount: Paise;
  allocatedAmount: Paise;
  pendingAmount: Paise;             // originalAmount - allocatedAmount (>= 0)
  status: 'pending' | 'partially_repaid' | 'settled' | 'written_off';
  isOverdue: boolean;               // today > dueDate && pendingAmount > 0
  allocations: ComputedAllocation[];
}

export interface ContactLedgerSummary {
  contact: Contact;
  totalLentPending: Paise;
  totalBorrowedPending: Paise;
  unallocatedCredit: Paise;         // Surplus repayments waiting for future loans
  netPosition: Paise;               // totalLentPending - totalBorrowedPending (+ve = owes you, -ve = you owe)
  openLoansCount: number;
  oldestOpenLoanDate?: DateString;
  hasOverdue: boolean;
  lastActivityDate: DateString;
}

export interface GlobalPeerMetrics {
  totalLentGross: Paise;            // Lifetime lent (expandable history)
  totalLentSettled: Paise;          // Lifetime received back
  totalLentPending: Paise;          // CURRENT PENDING (Hero)
  totalBorrowedGross: Paise;        // Lifetime borrowed (expandable history)
  totalBorrowedSettled: Paise;      // Lifetime repaid
  totalBorrowedPending: Paise;      // CURRENT PENDING (Hero)
  netBalance: Paise;                // totalLentPending - totalBorrowedPending
  unsettledContactsCount: number;
  attentionCount: number;           // Overdue loans + unconfirmed settlements
}

// Helper conversions
export const toPaise = (rupees: number): Paise => Math.round(rupees * 100);
export const toRupees = (paise: Paise): number => paise / 100;

export const formatPaise = (paise: Paise, showPrefix = true): string => {
  if (paise === null || paise === undefined || isNaN(paise)) {
    return showPrefix ? '₹0' : '0';
  }
  const isNegative = paise < 0;
  const abs = Math.abs(paise) / 100;

  let formatted = '';
  try {
    if (typeof abs.toLocaleString === 'function') {
      formatted = abs.toLocaleString('en-IN', {
        maximumFractionDigits: 2,
        minimumFractionDigits: Number.isInteger(abs) ? 0 : 2,
      });
    }
  } catch {
    // Hermes fallback
  }

  // Pure JS fallback if toLocaleString is unsupported, returns unformatted or NaN in Hermes
  if (!formatted || formatted === 'NaN' || formatted === abs.toString()) {
    const isInt = Number.isInteger(abs);
    const parts = abs.toFixed(2).split('.');
    let intPart = parts[0];
    const decPart = isInt || parts[1] === '00' ? '' : `.${parts[1]}`;

    // Format Indian thousands / lakhs / crores (e.g. 12,34,567)
    const lastThree = intPart.slice(-3);
    const other = intPart.slice(0, -3);
    if (other !== '') {
      intPart = other.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree;
    } else {
      intPart = lastThree;
    }
    formatted = intPart + decPart;
  }

  const prefix = showPrefix ? '₹' : '';
  return isNegative ? `-${prefix}${formatted}` : `${prefix}${formatted}`;
};

