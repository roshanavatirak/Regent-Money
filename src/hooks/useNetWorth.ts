import { useEffect, useMemo, useState } from 'react';
import { useAnalyticsStore, useBankStore, useIncomeStore, useTransactionStore, BankProfileType } from '../store';
import { usePeerStore } from '../store/peerStore';
import { computeGlobalMetrics, repaidToLetGoLoans } from '../services/peerLedgerSelectors';
import { getCashProfile } from '../services/cashService';
import { isExcludedFromBudget } from '../utils/budget';
import { toMinor } from '../utils/money';
import { buildFlows, buildPeerDeltas, createNetWorthModel } from '../utils/netWorth';

const EMPTY: any[] = [];

/** Local YYYY-MM-DD (toISOString is UTC and shifts the date in India before 5:30 am). */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Net worth and its history, shared by Home and the Net Worth screen so both show the same number:
 * every account balance, plus money lent, minus money borrowed.
 */
export const useNetWorth = () => {
  const bankProfiles: BankProfileType[] = useBankStore((s) => s.bankProfiles) ?? EMPTY;
  const transactions = useTransactionStore((s) => s.transactions) ?? EMPTY;
  const incomeRecords = useIncomeStore((s) => s.incomeRecords) ?? EMPTY;
  const snapshots = useAnalyticsStore((s) => s.snapshots) ?? EMPTY;
  const contacts = usePeerStore((s) => s.contacts) ?? EMPTY;
  const entries = usePeerStore((s) => s.entries) ?? EMPTY;
  const storedAllocations = usePeerStore((s) => s.storedAllocations) ?? EMPTY;

  // The clock moves once a minute; that is fine-grained enough for a daily curve.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => {
    const accounts = bankProfiles
      .map((bank) => ({ id: bank.id, bank, balanceMinor: toMinor(bank.currentBalance) }))
      .sort((a, b) => b.balanceMinor - a.balanceMinor);

    // Balances can still be on their way after login; the last snapshot stands in until they arrive.
    const accountsNowMinor =
      accounts.length > 0
        ? accounts.reduce((sum, a) => sum + a.balanceMinor, 0)
        : snapshots.length > 0
          ? toMinor(snapshots[snapshots.length - 1].netWorth)
          : 0;

    const peer = computeGlobalMetrics(contacts, entries, storedAllocations, localToday());
    const lentMinor = peer.totalLentPending;
    const borrowedMinor = peer.totalBorrowedPending;

    const flows = buildFlows({
      transactions,
      incomeRecords,
      bankIds: new Set(accounts.map((a) => a.id)),
      cash: getCashProfile(bankProfiles),
      isExcluded: (tx) => isExcludedFromBudget(tx),
    });

    // A transaction saved since the last tick is already in the balances, so it must count as "now".
    const now = Math.max(clock, flows.length > 0 ? flows[flows.length - 1].ts : 0);

    const model = createNetWorthModel({
      now,
      accountsNowMinor,
      flows,
      // Snapshots only ever held account balances, so they pin the accounts part of the curve.
      anchors: snapshots.map((s: any) => ({ ts: Number(s.timestamp), minor: toMinor(s.netWorth) })),
      peerNowMinor: lentMinor - borrowedMinor,
      peerDeltas: buildPeerDeltas(entries, repaidToLetGoLoans(entries, storedAllocations, localToday())),
      // Only a credit card or overdraft can really be below zero
      accountsNeverNegative: !bankProfiles.some((b) => /credit|overdraft/i.test(String(b.accountType || ''))),
    });

    return { model, flows, accounts, lentMinor, borrowedMinor };
  }, [clock, bankProfiles, transactions, incomeRecords, snapshots, contacts, entries, storedAllocations]);
};

export type NetWorthData = ReturnType<typeof useNetWorth>;
