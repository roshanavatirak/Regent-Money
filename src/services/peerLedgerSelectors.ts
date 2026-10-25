// src/services/peerLedgerSelectors.ts
//
// Pure derived mathematical selectors for Regent Money Borrow & Lend.
// Computes FIFO allocations, unallocated surplus credits, and contact/global summaries
// on the fly with zero mutable state or drift.

import {
  Paise,
  DateString,
  Contact,
  PeerEntry,
  StoredAllocation,
  PendingSettlement,
  ComputedAllocation,
  ComputedLoan,
  ContactLedgerSummary,
  GlobalPeerMetrics,
} from '../types/peer';

export interface AllocationResult {
  computedLoans: ComputedLoan[];
  unallocatedCredit: Paise;
  allocations: ComputedAllocation[];
}

/**
 * Computes allocations for a set of loans and repayments within a single relationship
 * (e.g. Lent side: LEND vs REPAY_RECEIVED, or Borrow side: BORROW vs REPAY_PAID).
 *
 * Rules:
 * 1. Stored manual allocations take precedence.
 * 2. Strict date constraint: loan.date <= repayment.date.
 * 3. Auto-FIFO allocates to oldest eligible open loan first.
 * 4. Excess repayment is tracked as unallocated credit surplus.
 */
export const computeAllocations = (
  loanEntries: PeerEntry[],
  repaymentEntries: PeerEntry[],
  storedManualAllocations: StoredAllocation[] = [],
  today: DateString = ''
): AllocationResult => {
  // Filter active (non-deleted) entries
  const activeLoans = loanEntries.filter((e) => !e.deletedAt);
  const activeRepayments = repaymentEntries.filter((e) => !e.deletedAt);

  // Track remaining amounts
  const loanRemaining = new Map<string, Paise>();
  activeLoans.forEach((l) => loanRemaining.set(l.id, l.amount));

  const repaymentRemaining = new Map<string, Paise>();
  activeRepayments.forEach((r) => repaymentRemaining.set(r.id, r.amount));

  const computedAllocations: ComputedAllocation[] = [];

  // Map for fast loan/repayment lookups
  const loanMap = new Map<string, PeerEntry>(activeLoans.map((l) => [l.id, l]));
  const repaymentMap = new Map<string, PeerEntry>(activeRepayments.map((r) => [r.id, r]));

  // 1. Process stored manual allocations first
  const activeManuals = storedManualAllocations.filter(
    (m) => loanMap.has(m.loanEntryId) && repaymentMap.has(m.repaymentEntryId)
  );

  activeManuals.forEach((m) => {
    const loan = loanMap.get(m.loanEntryId)!;
    const repayment = repaymentMap.get(m.repaymentEntryId)!;

    // Validate date ordering constraint: loan.date <= repayment.date
    if (loan.date > repayment.date) {
      return; // Disallow forward repayment
    }

    const availRepayment = repaymentRemaining.get(repayment.id) || 0;
    const availLoan = loanRemaining.get(loan.id) || 0;

    const allocAmount = Math.min(m.amount, availRepayment, availLoan);
    if (allocAmount > 0) {
      computedAllocations.push({
        id: `manual_${m.id}`,
        repaymentEntryId: repayment.id,
        loanEntryId: loan.id,
        amount: allocAmount,
        mode: 'manual',
      });
      repaymentRemaining.set(repayment.id, availRepayment - allocAmount);
      loanRemaining.set(loan.id, availLoan - allocAmount);
    }
  });

  // 2. Sort remaining loans and repayments chronologically for auto-FIFO
  const sortedLoans = [...activeLoans].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt - b.createdAt;
  });

  const sortedRepayments = [...activeRepayments].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt - b.createdAt;
  });

  // 3. Compute auto-FIFO allocations
  sortedRepayments.forEach((repayment) => {
    let remRepay = repaymentRemaining.get(repayment.id) || 0;
    if (remRepay <= 0) return;

    for (const loan of sortedLoans) {
      if (remRepay <= 0) break;

      // Strict date constraint: a repayment cannot clear a future loan
      if (loan.date > repayment.date) {
        continue;
      }

      const remLoan = loanRemaining.get(loan.id) || 0;
      if (remLoan <= 0) continue;

      const alloc = Math.min(remRepay, remLoan);
      computedAllocations.push({
        id: `auto_${repayment.id}_${loan.id}`,
        repaymentEntryId: repayment.id,
        loanEntryId: loan.id,
        amount: alloc,
        mode: 'auto_fifo',
      });

      remRepay -= alloc;
      loanRemaining.set(loan.id, remLoan - alloc);
    }

    repaymentRemaining.set(repayment.id, remRepay);
  });

  // 4. Calculate total unallocated credit surplus across all repayments
  let totalUnallocatedCredit: Paise = 0;
  repaymentRemaining.forEach((rem) => {
    totalUnallocatedCredit += rem;
  });

  // 5. Construct ComputedLoan objects
  const computedLoans: ComputedLoan[] = activeLoans.map((loan) => {
    const remaining = loanRemaining.get(loan.id) || 0;
    const allocated = loan.amount - remaining;
    const loanAllocs = computedAllocations.filter((a) => a.loanEntryId === loan.id);

    const isWrittenOff = loan.kind === 'FORGIVE_LENT' || loan.kind === 'FORGIVE_BORROWED';
    let status: ComputedLoan['status'] = 'pending';
    if (isWrittenOff) {
      status = 'written_off';
    } else if (remaining === 0) {
      status = 'settled';
    } else if (allocated > 0) {
      status = 'partially_repaid';
    }

    const isOverdue = Boolean(today && loan.dueDate && today > loan.dueDate && remaining > 0);

    return {
      entry: loan,
      originalAmount: loan.amount,
      allocatedAmount: allocated,
      pendingAmount: remaining,
      status,
      isOverdue,
      allocations: loanAllocs,
    };
  });

  return {
    computedLoans,
    unallocatedCredit: totalUnallocatedCredit,
    allocations: computedAllocations,
  };
};

/**
 * Computes complete summary for a single contact.
 */
export const computeContactSummary = (
  contact: Contact,
  entries: PeerEntry[],
  storedManualAllocations: StoredAllocation[] = [],
  today: DateString = ''
): ContactLedgerSummary => {
  const contactEntries = entries.filter((e) => e.contactId === contact.id && !e.deletedAt);

  // Group Lent side: LEND vs REPAY_RECEIVED / FORGIVE_LENT
  const lentLoans = contactEntries.filter((e) => e.kind === 'LEND');
  const lentRepayments = contactEntries.filter(
    (e) => e.kind === 'REPAY_RECEIVED' || e.kind === 'FORGIVE_LENT'
  );

  // Group Borrow side: BORROW vs REPAY_PAID / FORGIVE_BORROWED
  const borrowLoans = contactEntries.filter((e) => e.kind === 'BORROW');
  const borrowRepayments = contactEntries.filter(
    (e) => e.kind === 'REPAY_PAID' || e.kind === 'FORGIVE_BORROWED'
  );

  const lentResult = computeAllocations(lentLoans, lentRepayments, storedManualAllocations, today);
  const borrowResult = computeAllocations(borrowLoans, borrowRepayments, storedManualAllocations, today);

  const totalLentPending = lentResult.computedLoans.reduce((sum, l) => sum + l.pendingAmount, 0);
  const totalBorrowedPending = borrowResult.computedLoans.reduce((sum, l) => sum + l.pendingAmount, 0);
  const unallocatedCredit = lentResult.unallocatedCredit + borrowResult.unallocatedCredit;

  const allOpenLoans = [
    ...lentResult.computedLoans.filter((l) => l.pendingAmount > 0),
    ...borrowResult.computedLoans.filter((l) => l.pendingAmount > 0),
  ];

  let oldestOpenLoanDate: DateString | undefined;
  if (allOpenLoans.length > 0) {
    oldestOpenLoanDate = allOpenLoans.reduce(
      (oldest, cur) => (cur.entry.date < oldest ? cur.entry.date : oldest),
      allOpenLoans[0].entry.date
    );
  }

  let lastActivityDate: DateString = contactEntries.length > 0 ? contactEntries[0].date : '';
  contactEntries.forEach((e) => {
    if (e.date > lastActivityDate) lastActivityDate = e.date;
  });

  const hasOverdue = allOpenLoans.some((l) => l.isOverdue);

  return {
    contact,
    totalLentPending,
    totalBorrowedPending,
    unallocatedCredit,
    netPosition: totalLentPending - totalBorrowedPending,
    openLoansCount: allOpenLoans.length,
    oldestOpenLoanDate,
    hasOverdue,
    lastActivityDate,
  };
};

/**
 * Computes summaries for all contacts.
 */
export const computeAllContactSummaries = (
  contacts: Contact[],
  entries: PeerEntry[],
  storedManualAllocations: StoredAllocation[] = [],
  today: DateString = ''
): ContactLedgerSummary[] => {
  return contacts.map((c) => computeContactSummary(c, entries, storedManualAllocations, today));
};

/**
 * Computes global hero metrics across all contacts.
 */
export const computeGlobalMetrics = (
  contacts: Contact[],
  entries: PeerEntry[],
  storedManualAllocations: StoredAllocation[] = [],
  today: DateString = '',
  pendingSettlements: PendingSettlement[] = []
): GlobalPeerMetrics => {
  let totalLentGross: Paise = 0;
  let totalLentPending: Paise = 0;
  let totalBorrowedGross: Paise = 0;
  let totalBorrowedPending: Paise = 0;
  let overdueCount = 0;
  let unsettledContactsCount = 0;

  contacts.forEach((c) => {
    const summary = computeContactSummary(c, entries, storedManualAllocations, today);
    totalLentPending += summary.totalLentPending;
    totalBorrowedPending += summary.totalBorrowedPending;

    if (summary.totalLentPending > 0 || summary.totalBorrowedPending > 0) {
      unsettledContactsCount += 1;
    }
  });

  // Calculate gross amounts from all active entries
  entries
    .filter((e) => !e.deletedAt)
    .forEach((e) => {
      if (e.kind === 'LEND') totalLentGross += e.amount;
      if (e.kind === 'BORROW') totalBorrowedGross += e.amount;
      if (e.dueDate && today && today > e.dueDate) {
        // Will be verified by open loan check
      }
    });

  // Count active overdue loans across contacts
  contacts.forEach((c) => {
    const contactEntries = entries.filter((e) => e.contactId === c.id && !e.deletedAt);
    const lentLoans = contactEntries.filter((e) => e.kind === 'LEND');
    const lentRepayments = contactEntries.filter((e) => e.kind === 'REPAY_RECEIVED' || e.kind === 'FORGIVE_LENT');
    const res = computeAllocations(lentLoans, lentRepayments, storedManualAllocations, today);
    overdueCount += res.computedLoans.filter((l) => l.isOverdue).length;
  });

  const totalLentSettled = Math.max(0, totalLentGross - totalLentPending);
  const totalBorrowedSettled = Math.max(0, totalBorrowedGross - totalBorrowedPending);
  const pendingConfirmations = pendingSettlements.filter((p) => p.status === 'pending').length;

  return {
    totalLentGross,
    totalLentSettled,
    totalLentPending,
    totalBorrowedGross,
    totalBorrowedSettled,
    totalBorrowedPending,
    netBalance: totalLentPending - totalBorrowedPending,
    unsettledContactsCount,
    attentionCount: overdueCount + pendingConfirmations,
  };
};

/**
 * Split Transaction Helper:
 * discretionarySpend(txn) = txn.amount - sum(linkedPeerEntries.amount)
 */
export const computeDiscretionarySpend = (
  totalTxnAmount: Paise,
  linkedPeerEntries: PeerEntry[]
): Paise => {
  const activeLinked = linkedPeerEntries.filter((e) => !e.deletedAt);
  const peerTotal = activeLinked.reduce((sum, e) => sum + e.amount, 0);
  return Math.max(0, totalTxnAmount - peerTotal);
};

/**
 * Evenly splits totalAmount across N participants, distributing remainder paise
 * so the sum of all shares equals totalAmount exactly (solving T15 rounding invariant).
 */
export const calculateEqualSplit = (totalAmount: Paise, participantCount: number): Paise[] => {
  if (participantCount <= 0) return [];
  const baseShare = Math.floor(totalAmount / participantCount);
  const remainder = totalAmount % participantCount;

  return Array.from({ length: participantCount }, (_, i) =>
    i < remainder ? baseShare + 1 : baseShare
  );
};
