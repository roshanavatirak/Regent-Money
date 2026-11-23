// Repayment suggestions in the app: finds them (repaymentSuggestions.ts) from the phone's
// payments and Borrow & Lend, and records the answer.
//
// Yes: the payment is tagged "Friend repaid" / "Repaid friend" exactly as if the user had
// picked that category on the payment's screen, and filed under that person.
// No: remembered on this phone, never offered again.

import { useMemo, useState } from 'react';
import { mmkvStorage } from '../db/mmkv';
import { outbox, isOutboxEnabled } from '../db/outbox';
import { useAuthStore, useIncomeStore, useTransactionStore } from '../store';
import { usePeerStore } from '../store/peerStore';
import { syncService } from './syncService';
import { allLedgerRows, useCounterpartyIndex } from './counterpartyService';
import { findRepaymentSuggestions, localDate, type RepaymentSuggestion, type RepaymentRow } from './repaymentSuggestions';

const DISMISSED_KEY = 'repayment_suggestions_dismissed_v1';
const MAX_DISMISSED = 500;

const loadDismissed = (): string[] => {
  try {
    return mmkvStorage.getObject<string[]>(DISMISSED_KEY) || [];
  } catch {
    return [];
  }
};

export type AppRepaymentSuggestion = RepaymentSuggestion<RepaymentRow & Record<string, any>>;

/** Suggestions for Borrow & Lend (all people) or one person's page. Recomputed as data changes. */
export function useRepaymentSuggestions(contactId?: string, limit = 5) {
  const transactions = useTransactionStore((s) => s.transactions);
  const incomeRecords = useIncomeStore((s) => s.incomeRecords);
  const contacts = usePeerStore((s) => s.contacts);
  const entries = usePeerStore((s) => s.entries);
  const storedAllocations = usePeerStore((s) => s.storedAllocations);
  const index = useCounterpartyIndex();
  const [dismissed, setDismissed] = useState<string[]>(loadDismissed);

  const suggestions = useMemo(
    () =>
      findRepaymentSuggestions({
        rows: allLedgerRows(),
        contacts,
        entries,
        storedAllocations,
        index,
        today: localDate(Date.now()),
        dismissed: new Set(dismissed),
        contactId,
        limit,
      }) as AppRepaymentSuggestion[],
    // transactions / incomeRecords: allLedgerRows reads them from the stores
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, incomeRecords, contacts, entries, storedAllocations, index, dismissed, contactId, limit],
  );

  const dismiss = (rowId: string) => {
    const next = [rowId, ...dismissed.filter((id) => id !== rowId)].slice(0, MAX_DISMISSED);
    try {
      mmkvStorage.setObject(DISMISSED_KEY, next);
    } catch {}
    setDismissed(next);
  };

  return { suggestions, dismiss, accept: acceptRepaymentSuggestion };
}

const randomPart = () => Math.random().toString(36).substring(2, 9);

/** "Yes, Rohit paid me back": tag the payment and add the repayment to Borrow & Lend. */
export function acceptRepaymentSuggestion(s: AppRepaymentSuggestion): void {
  const { row, tag, contactId } = s;
  const amountRupees = Math.abs(Number(row.amount) || 0);
  const updatedAt = Date.now();

  if (isOutboxEnabled()) {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('Sign in again to update this payment.');
    outbox.enqueue({
      idemKey: `op_repay_${updatedAt}_${randomPart()}`,
      userId: user.id,
      entity: row.ledger,
      op: 'upsert',
      entityId: row.id,
      payload: { category: tag, updatedAt },
    });
  }

  // Same local effect as choosing the category on the payment's screen. The payment stays in
  // the list with its new tag: removing it made the reconcile think it was deleted and drop
  // the repayment entry added below.
  if (row.ledger === 'income') useIncomeStore.getState().updateIncomeRecordState(row.id, { category: tag, updatedAt });
  else useTransactionStore.getState().updateTransactionState(row.id, { category: tag, updatedAt });

  usePeerStore.getState().syncWithTransactionTag(
    row.id,
    tag,
    amountRupees,
    s.date,
    String(row.merchant ?? row.source ?? ''),
    { contactId },
  );
  syncService.flushOutbox().catch(() => {});
}
