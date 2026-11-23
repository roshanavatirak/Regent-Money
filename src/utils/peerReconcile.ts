// Decides whether a Borrow & Lend entry that came from a bank transaction should be removed
// when the ledger is reconciled with the transactions on the phone.
//
// Remove it only when we can tell the transaction was really untagged or deleted. A
// transaction that is simply not in the list (not loaded yet, older than what's on the
// phone, or a credit held in the income store) is NOT a reason: removing then is what made
// settled loans come back.

const DAY_MS = 86_400_000;

export function shouldRemoveTxnEntry(
  entryDate: string,
  matchingTx: { isDeleted?: boolean; category?: string } | undefined,
  oldestLoadedTs: number,
  isPeerTag: (category: string | undefined) => boolean
): boolean {
  if (matchingTx) return !!matchingTx.isDeleted || !isPeerTag(matchingTx.category);
  const entryTs = new Date(`${entryDate}T12:00:00`).getTime();
  // Missing, and the list reaches back past the entry's day: it was deleted.
  return Number.isFinite(entryTs) && oldestLoadedTs <= entryTs - DAY_MS;
}
