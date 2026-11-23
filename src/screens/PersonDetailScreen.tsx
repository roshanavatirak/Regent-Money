// src/screens/PersonDetailScreen.tsx
//
// One person: what they owe (or you owe), record or remind, the next repayment to confirm,
// and two tabs: their loans, and every payment with them under any name the bank used.

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  StatusBar,
  Modal,
  TextInput,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { useTheme, showGlobalConfirm, useTransactionStore, useIncomeStore, useBankStore } from '../store';
import { isCashProfile } from '../services/cashService';
import { usePeerStore } from '../store/peerStore';
import { computeContactSummary, computeAllocations } from '../services/peerLedgerSelectors';
import { BankAccountBadge } from '../components/ActivityFeed';
import { toActivityBank } from '../hooks/useActivityFeed';
import { formatPaise, PeerEntry } from '../types/peer';
import { DateTimePickerSheet } from '../components/DateTimePickerSheet';
import { PersonPickerSheet, Avatar } from '../components/PersonPickerSheet';
import { RepaymentPrompt } from '../components/RepaymentSuggestions';
import { allLedgerRows, useCounterpartyIndex } from '../services/counterpartyService';
import { counterpartyTotals } from '../services/repaymentSuggestions';
import { getCategory } from '../constants/categories';
import type { Contact } from '../types/peer';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

/** Local YYYY-MM-DD (not toISOString, which shifts the day before 5:30 am in India). */
const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const prettyDate = (s: string) =>
  new Date(`${s}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

interface PersonDetailScreenProps {
  route?: any;
  navigation?: any;
}

export const PersonDetailScreen: React.FC<PersonDetailScreenProps> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const contactId = route.params?.contactId;

  const display =
    typeof Font?.isLoaded === 'function' && Font.isLoaded('BricolageGrotesque_800ExtraBold')
      ? 'BricolageGrotesque_800ExtraBold'
      : undefined;

  const contacts = usePeerStore((s) => s.contacts);
  const entries = usePeerStore((s) => s.entries);
  const storedAllocations = usePeerStore((s) => s.storedAllocations);
  const deleteContact = usePeerStore((s) => s.deleteContact);
  const mergeContacts = usePeerStore((s) => s.mergeContacts);
  const updateContact = usePeerStore((s) => s.updateContact);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [tab, setTab] = useState<'loans' | 'payments'>('loans');
  // The loan whose actions sheet is open; the ••• menu (or its rename step)
  const [entrySheet, setEntrySheet] = useState<PeerEntry | null>(null);
  const [menu, setMenu] = useState<null | 'menu' | 'rename'>(null);
  const [renameText, setRenameText] = useState('');
  const [showAllPayments, setShowAllPayments] = useState(false);
  const softDeletePeerEntry = usePeerStore((s) => s.softDeletePeerEntry);
  const setNotExpectedBack = usePeerStore((s) => s.setNotExpectedBack);

  const contact = contacts.find((c) => c.id === contactId);

  // The loan whose expected-back date is being set.
  const [dueFor, setDueFor] = useState<PeerEntry | null>(null);
  const updatePeerEntry = usePeerStore((s) => s.updatePeerEntry);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Each entry mirrors a tagged payment: find it, and the bank or cash account it moved through.
  const transactions = useTransactionStore((s) => s.transactions);
  const incomeRecords = useIncomeStore((s) => s.incomeRecords);
  const bankProfiles = useBankStore((s) => s.bankProfiles);
  const txById = useMemo(() => {
    const m = new Map<string, any>();
    for (const t of transactions || []) if (t?.id) m.set(t.id, t);
    for (const t of incomeRecords || []) if (t?.id) m.set(t.id, { ...t, type: 'credit' });
    return m;
  }, [transactions, incomeRecords]);

  // Every payment with them, under any name or UPI ID the bank used
  const cpIndex = useCounterpartyIndex();
  const moneyWith = useMemo(
    () => (contactId ? counterpartyTotals(contactId, allLedgerRows(), cpIndex, 200) : null),
    [contactId, cpIndex, transactions, incomeRecords],
  );
  const inr = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const openPayment = (row: any) =>
    navigation.navigate('TransactionDetail', {
      transaction: { ...row, type: row.ledger === 'income' ? 'credit' : 'debit', merchant: row.merchant ?? row.source },
    });

  const sourceOf = (entry: PeerEntry): { kind: 'bank' | 'cash' | 'manual'; label: string; payee?: string; bank?: any; tx?: any } => {
    if (entry.source.type === 'manual') {
      const m = entry.source.method;
      return { kind: m === 'cash' ? 'cash' : 'manual', label: m === 'cash' ? 'Cash, recorded by you' : m === 'upi_manual' ? 'UPI, recorded by you' : 'Recorded by you' };
    }
    const tx = txById.get(entry.source.txnId);
    const bank = tx ? (bankProfiles || []).find((b: any) => b.id === tx.bankProfileId) : undefined;
    const payee = tx ? String(tx.merchant || tx.source || '').trim() || undefined : undefined;
    if (bank && isCashProfile(bank)) return { kind: 'cash', label: 'Cash wallet', payee, tx };
    if (bank) {
      const name = String(bank.bankName || '').replace(/\b(ltd|limited)\b\.?/gi, '').replace(/\s+/g, ' ').trim();
      return { kind: 'bank', label: `${name}${bank.accountNumberSuffix ? ` ••${bank.accountNumberSuffix}` : ''}`, payee, bank, tx };
    }
    return { kind: 'bank', label: tx ? 'Bank payment' : 'Bank payment (not on this phone)', payee, tx };
  };

  // Compute ledger summary for this contact
  const summary = useMemo(() => {
    if (!contact) return null;
    return computeContactSummary(contact, entries, storedAllocations, todayStr);
  }, [contact, entries, storedAllocations, todayStr]);

  // What's still open on each loan with this person (repayments matched the same way as the totals)
  const pendingById = useMemo(() => {
    const m = new Map<string, number>();
    if (!contact) return m;
    const mine = entries.filter((e) => e.contactId === contact.id && !e.deletedAt);
    const sides: [PeerEntry['kind'], PeerEntry['kind'][]][] = [
      ['LEND', ['REPAY_RECEIVED', 'FORGIVE_LENT']],
      ['BORROW', ['REPAY_PAID', 'FORGIVE_BORROWED']],
    ];
    for (const [loanKind, repayKinds] of sides) {
      const res = computeAllocations(
        mine.filter((e) => e.kind === loanKind),
        mine.filter((e) => repayKinds.includes(e.kind)),
        storedAllocations,
        todayStr,
      );
      res.computedLoans.forEach((l) => m.set(l.entry.id, l.pendingAmount));
    }
    return m;
  }, [contact, entries, storedAllocations, todayStr]);

  // Entries for this contact (chronological desc)
  const contactEntries = useMemo(() => {
    if (!contactId) return [];
    return entries
      .filter((e) => e.contactId === contactId && !e.deletedAt)
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.createdAt - a.createdAt));
  }, [entries, contactId]);

  if (!contact || !summary) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.topNav}>
          <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.emptyCenter}>
          <Text style={{ color: colors.text }}>Contact not found.</Text>
        </View>
      </View>
    );
  }

  const owesYou = summary.netPosition > 0;
  const youOwe = summary.netPosition < 0;

  const handleRemind = () => {
    const pendingText = formatPaise(summary.totalLentPending);
    const text = encodeURIComponent(
      `Hi ${contact.displayName}, checking in on the ${pendingText} pending on Regent Money. Please let me know when you'll be able to clear this. Thanks!`
    );
    const phone = contact.phoneE164?.replace(/\D/g, '');
    const url = phone ? `whatsapp://send?phone=${phone}&text=${text}` : `whatsapp://send?text=${text}`;

    Linking.openURL(url).catch(() => {
      const smsUrl = phone ? `sms:${phone}?body=${text}` : `sms:?body=${text}`;
      Linking.openURL(smsUrl).catch(() => {});
    });
  };

  const handleDeleteEntry = (entry: PeerEntry) => {
    showGlobalConfirm({
      title: 'Remove entry?',
      message: `Remove this ${formatPaise(entry.amount)} entry? The bank payment itself stays.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: () => softDeletePeerEntry(entry.id),
    });
  };

  // Two entries for one person (different bank names): fold the other into this one
  const handleMerge = (other: Contact) => {
    showGlobalConfirm({
      title: `Merge ${other.displayName} into ${contact.displayName}?`,
      message: `${other.displayName}'s loans and payments move to ${contact.displayName}.`,
      confirmText: 'Merge',
      cancelText: 'Cancel',
      icon: 'git-merge',
      onConfirm: () => mergeContacts(contact.id, other.id),
    });
  };

  const handleDeleteContact = () => {
    showGlobalConfirm({
      title: `Delete ${contact.displayName}?`,
      message: 'Their loans are removed. Bank payments stay.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: () => {
        deleteContact(contact.id);
        navigation.goBack();
      },
    });
  };

  const saveRename = () => {
    const name = renameText.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (name && name !== contact.displayName) updateContact(contact.id, { displayName: name });
    setMenu(null);
  };

  /* ---------------- Hero numbers ---------------- */

  const isLoanKind = (k: PeerEntry['kind']) => k === 'LEND' || k === 'BORROW';

  // The sum the hero writes out, in the direction that's open: You lent − Paid back = Still owes you
  const live = contactEntries.filter((e) => !e.notExpectedBack);
  const sum = owesYou
    ? { total: summary.lentTotal, repaid: summary.lentRepaid, left: summary.totalLentPending, other: summary.totalBorrowedPending }
    : youOwe
      ? { total: summary.borrowedTotal, repaid: summary.borrowedRepaid, left: summary.totalBorrowedPending, other: summary.totalLentPending }
      : null;
  const firstName = contact.displayName.split(' ')[0];

  // Earliest return date of a loan still open in that direction
  const openKind = owesYou ? 'LEND' : youOwe ? 'BORROW' : null;
  const nextDue = openKind
    ? live
        .filter((e) => e.kind === openKind && e.dueDate)
        .map((e) => e.dueDate as string)
        .sort()[0]
    : undefined;

  const heroLabel = owesYou
    ? 'Owes you'
    : youOwe
      ? 'You owe'
      : summary.notExpectedPending > 0
        ? 'Nothing expected back'
        : 'All settled';

  /* ---------------- Payments tab ---------------- */

  const bankLabel = (bankProfileId?: string | null) => {
    const bank = (bankProfiles || []).find((b: any) => b.id === bankProfileId);
    if (!bank) return '';
    if (isCashProfile(bank)) return 'Cash';
    // Drop "Ltd" and only a trailing "Bank": stripping every "bank" turned State Bank of India into "State of India"
    return String(bank.bankName || '').replace(/\b(ltd|limited)\b\.?/gi, '').replace(/\s+/g, ' ').trim().replace(/\s+bank$/i, '');
  };
  const paymentRows = moneyWith ? (showAllPayments ? moneyWith.recent : moneyWith.recent.slice(0, 8)) : [];
  const monthOf = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const thisYear = new Date().getFullYear();
  const monthLabel = (ts: number) =>
    new Date(ts).getFullYear() === thisYear ? new Date(ts).toLocaleDateString('en-IN', { month: 'long' }) : monthOf(ts);

  // What a payment is: its Borrow & Lend entry when it has one (that's what counts in Loans),
  // else its category ("Money in", "Food"…), so tagging it shows up here straight away
  const entryKindByTxn = new Map<string, PeerEntry['kind']>();
  for (const e of entries) if (!e.deletedAt && e.source.type === 'txn') entryKindByTxn.set(e.source.txnId, e.kind);
  const LOAN_WORDS: Partial<Record<PeerEntry['kind'], string>> = {
    LEND: 'Lent',
    BORROW: 'Borrowed',
    REPAY_RECEIVED: 'Paid you back',
    REPAY_PAID: 'You repaid',
  };
  const paymentLabel = (row: any): string => {
    const kind = entryKindByTxn.get(row.id);
    if (kind && LOAN_WORDS[kind]) return LOAN_WORDS[kind]!;
    const isIn = row.ledger === 'income';
    return row.category ? getCategory(row.category).label : isIn ? 'Money in' : 'Payment';
  };

  /* ---------------- Loans tab ---------------- */

  const entryLook = (e: PeerEntry) => {
    const writtenOff = e.kind === 'LEND' && !!e.notExpectedBack;
    switch (e.kind) {
      case 'LEND':
        return { title: 'Lent', icon: 'arrow-up-right' as const, tone: writtenOff ? 'muted' : 'out', sign: '' };
      case 'BORROW':
        return { title: 'Borrowed', icon: 'arrow-down-left' as const, tone: 'in', sign: '' };
      case 'REPAY_RECEIVED':
        return { title: 'Paid back', icon: 'arrow-down-left' as const, tone: 'in', sign: '+' };
      case 'REPAY_PAID':
        return { title: 'You repaid', icon: 'arrow-up-right' as const, tone: 'out', sign: '−' };
      default:
        return { title: 'Settled', icon: 'check' as const, tone: 'muted', sign: '' };
    }
  };

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const divider = isDark ? colors.border : '#EEF2EF';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const chip = isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF';
  const inGreen = isDark ? LIME : '#0B6B3A';
  const tones: Record<string, [string, string]> = {
    out: isDark ? ['rgba(255,138,76,0.18)', '#FFB38A'] : ['#FFE8D9', '#B23F00'],
    in: isDark ? ['rgba(184,243,107,0.14)', LIME] : ['#E3F2E8', FOREST],
    muted: isDark ? ['rgba(255,255,255,0.08)', muted] : ['#F1F5F2', muted],
  };

  const entrySrc = entrySheet ? sourceOf(entrySheet) : null;
  const entryWrittenOff = !!entrySheet && entrySheet.kind === 'LEND' && !!entrySheet.notExpectedBack;

  return (
    <View style={[styles.container, { backgroundColor: pageBg, paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={pageBg} />

      {/* Header: back, who, more */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={[styles.roundBtn, { backgroundColor: chip }]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Feather name="arrow-left" size={20} color={ink} />
        </Pressable>
        <View style={styles.headerWho}>
          <Avatar name={contact.displayName} kind={contact.kind} size={36} />
          <Text style={[styles.headerName, { color: ink, fontFamily: display }]} numberOfLines={1}>
            {contact.displayName}
          </Text>
        </View>
        <Pressable
          onPress={() => setMenu('menu')}
          style={[styles.roundBtn, { backgroundColor: chip }]}
          accessibilityRole="button"
          accessibilityLabel="More"
        >
          <Feather name="more-horizontal" size={20} color={ink} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: isDark ? '#061D15' : FOREST }]}>
          <View pointerEvents="none" style={styles.heroRing} />
          <Text style={styles.heroLabel}>{sum ? `Between you and ${firstName}` : heroLabel}</Text>
          {sum ? (
            <>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>{owesYou ? 'You lent' : 'You borrowed'}</Text>
                <Text style={styles.sumValue}>{formatPaise(sum.total)}</Text>
              </View>
              {sum.repaid > 0 ? (
                <View style={styles.sumRow}>
                  <Text style={styles.sumLabel}>{owesYou ? 'Paid back' : 'You paid back'}</Text>
                  <Text style={styles.sumValue}>− {formatPaise(sum.repaid)}</Text>
                </View>
              ) : null}
              <View style={styles.sumRule} />
              <View style={styles.sumTotalRow}>
                <Text style={styles.sumTotalLabel}>{owesYou ? 'Still owes you' : 'You still owe'}</Text>
                <Text
                  style={[styles.sumTotal, { fontFamily: display, color: owesYou ? LIME : '#FFB4A2' }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatPaise(sum.left)}
                </Text>
              </View>
              {sum.other > 0 ? (
                <View style={[styles.sumRow, styles.sumNote]}>
                  <Text style={styles.sumNoteText}>{owesYou ? `You owe ${firstName}` : `${firstName} owes you`}</Text>
                  <Text style={styles.sumNoteText}>{formatPaise(sum.other)}</Text>
                </View>
              ) : null}
            </>
          ) : null}
          {summary.notExpectedPending > 0 ? (
            <View style={[styles.sumRow, styles.sumNote]}>
              <Text style={styles.sumNoteText}>Let go, not asking back</Text>
              <Text style={styles.sumNoteText}>{formatPaise(summary.notExpectedPending)}</Text>
            </View>
          ) : null}

          {nextDue || summary.hasOverdue || summary.unallocatedCredit > 0 ? (
            <View style={styles.heroChips}>
              {summary.hasOverdue ? (
                <View style={[styles.heroChip, { backgroundColor: 'rgba(255,180,162,0.18)' }]}>
                  <Feather name="alert-circle" size={13} color="#FFB4A2" />
                  <Text style={[styles.heroChipText, { color: '#FFFFFF' }]}>Overdue</Text>
                </View>
              ) : nextDue ? (
                <View style={styles.heroChip}>
                  <Feather name="clock" size={13} color="#FFB4A2" />
                  <Text style={[styles.heroChipText, { color: '#FFFFFF' }]}>Due {prettyDate(nextDue)}</Text>
                </View>
              ) : null}
              {summary.unallocatedCredit > 0 ? (
                <View style={styles.heroChip}>
                  <Text style={styles.heroChipText}>{formatPaise(summary.unallocatedCredit)} extra paid</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Loans and repayments come from tagging a bank or cash payment, so the only action is a nudge */}
        {owesYou ? (
          <View style={styles.actions}>
            <Pressable
              onPress={handleRemind}
              style={({ pressed }) => [styles.secondaryBtn, { flex: 1, justifyContent: 'center', backgroundColor: surface, borderColor: line }, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
            >
              <Feather name="message-circle" size={18} color="#1F9D55" />
              <Text style={[styles.secondaryBtnText, { color: ink }]}>Remind {contact.displayName.split(' ')[0]}</Text>
            </Pressable>
          </View>
        ) : null}

        {/* One repayment question at a time */}
        <View>
          <RepaymentPrompt contactId={contact.id} onOpenPayment={(sg) => openPayment(sg.row)} />
        </View>

        {/* Tabs */}
        <View style={[styles.tabs, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E1E9E4' }]} accessibilityRole="tablist">
          {(['loans', 'payments'] as const).map((t) => {
            const on = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[styles.tab, on && { backgroundColor: surface }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.tabText, { color: on ? ink : muted, fontWeight: on ? '700' : '600' }]}>
                  {t === 'loans' ? 'Loans' : 'Payments'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {tab === 'loans' ? (
          contactEntries.length === 0 ? (
            <View style={[styles.card, styles.empty, { backgroundColor: surface, borderColor: line }]}>
              <Text style={[styles.emptyText, { color: muted }]}>No loans yet</Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: surface, borderColor: line }]}>
              {contactEntries.map((entry, i) => {
                const look = entryLook(entry);
                const [bg, fg] = tones[look.tone];
                const writtenOff = entry.kind === 'LEND' && !!entry.notExpectedBack;
                const src = sourceOf(entry);
                const badgeBank = src.bank ? toActivityBank(src.bank) : undefined;
                // What's left on a loan, or when it's due; the bank shows as logo + ••1234 on the right
                const left = pendingById.get(entry.id);
                const status = writtenOff
                  ? 'Let go'
                  : isLoanKind(entry.kind) && left !== undefined && left === 0
                    ? 'Paid off'
                    : isLoanKind(entry.kind) && left !== undefined && left < entry.amount
                      ? `${formatPaise(left)} left`
                      : isLoanKind(entry.kind) && entry.dueDate
                        ? `due ${prettyDate(entry.dueDate)}`
                        : '';
                const sub = [prettyDate(entry.date), !badgeBank && src.kind === 'cash' ? 'Cash' : '', status].filter(Boolean).join(' · ');
                const isLoan = entry.kind === 'LEND' || entry.kind === 'BORROW';
                return (
                  <Pressable
                    key={entry.id}
                    onPress={() => setEntrySheet(entry)}
                    style={({ pressed }) => [
                      styles.row,
                      i < contactEntries.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: divider },
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${look.title} ${formatPaise(entry.amount)}, ${sub}`}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: bg }]}>
                      <Feather name={look.icon} size={18} color={fg} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.rowTitle, { color: writtenOff ? muted : ink }]}>{look.title}</Text>
                      <Text style={[styles.rowSub, { color: muted }]} numberOfLines={1}>
                        {sub}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text
                        style={[
                          styles.rowAmt,
                          { color: writtenOff ? muted : look.tone === 'in' && !isLoan ? inGreen : ink },
                        ]}
                      >
                        {look.sign}
                        {formatPaise(entry.amount)}
                      </Text>
                      {badgeBank ? (
                        <View style={{ marginTop: 4 }}>
                          <BankAccountBadge bank={badgeBank} />
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )
        ) : !moneyWith || moneyWith.count === 0 ? (
          <View style={[styles.card, styles.empty, { backgroundColor: surface, borderColor: line }]}>
            <Text style={[styles.emptyText, { color: muted }]}>No payments yet</Text>
          </View>
        ) : (
          <>
            <View style={styles.tiles}>
              <View style={[styles.tile, { backgroundColor: surface, borderColor: line }]}>
                <Text style={[styles.tileLabel, { color: muted }]}>Received</Text>
                <Text style={[styles.tileValue, { color: inGreen, fontFamily: display }]} numberOfLines={1} adjustsFontSizeToFit>
                  {inr(moneyWith.received)}
                </Text>
              </View>
              <View style={[styles.tile, { backgroundColor: surface, borderColor: line }]}>
                <Text style={[styles.tileLabel, { color: muted }]}>Paid</Text>
                <Text style={[styles.tileValue, { color: ink, fontFamily: display }]} numberOfLines={1} adjustsFontSizeToFit>
                  {inr(moneyWith.paid)}
                </Text>
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: surface, borderColor: line }]}>
              {paymentRows.map((row: any, i: number) => {
                const ts = Number(row.timestamp) || 0;
                const isIn = row.ledger === 'income';
                const newMonth = i === 0 || monthOf(Number(paymentRows[i - 1].timestamp) || 0) !== monthOf(ts);
                return (
                  <View key={row.id}>
                    {newMonth ? <Text style={[styles.month, { color: muted }]}>{ts ? monthLabel(ts) : ''}</Text> : null}
                    <Pressable
                      onPress={() => openPayment(row)}
                      style={({ pressed }) => [
                        styles.payRow,
                        !(i === paymentRows.length - 1 || monthOf(Number(paymentRows[i + 1]?.timestamp) || 0) !== monthOf(ts)) && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: divider,
                        },
                        pressed && { opacity: 0.7 },
                      ]}
                      accessibilityRole="button"
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.rowTitle, { color: ink, fontWeight: '600' }]}>{paymentLabel(row)}</Text>
                        <Text style={[styles.rowSub, { color: muted }]} numberOfLines={1}>
                          {[ts ? new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '', bankLabel(row.bankProfileId)]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <Text style={[styles.rowAmt, { color: isIn ? inGreen : ink }]}>
                        {isIn ? '+' : '−'}
                        {inr(Number(row.amount) || 0)}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
              {moneyWith.count > paymentRows.length ? (
                <Pressable
                  onPress={() => setShowAllPayments(true)}
                  style={[styles.seeAll, { borderTopColor: divider }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.seeAllText, { color: accent }]}>See all {moneyWith.count} payments</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      {/* One loan: open its payment, return date, write off, remove */}
      <Modal visible={!!entrySheet} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setEntrySheet(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEntrySheet(null)} accessibilityLabel="Close" />
        {entrySheet ? (
          <View style={[styles.sheet, { backgroundColor: surface, paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <View style={[styles.grabber, { backgroundColor: line }]} />
            <View style={styles.sheetHead}>
              <Text style={[styles.sheetTitle, { color: ink }]}>
                {entryLook(entrySheet).title} {formatPaise(entrySheet.amount)}
              </Text>
              <Text style={[styles.rowSub, { color: muted }]}>
                {[prettyDate(entrySheet.date), entrySheet.note].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {entrySrc?.tx ? (
              <SheetItem
                icon="external-link"
                label="Open payment"
                ink={ink}
                tile={pageBg}
                onPress={() => {
                  const tx = entrySrc.tx;
                  setEntrySheet(null);
                  navigation.navigate('TransactionDetail', { transaction: tx });
                }}
              />
            ) : null}
            {(entrySheet.kind === 'LEND' || entrySheet.kind === 'BORROW') && !entryWrittenOff ? (
              <SheetItem
                icon="calendar"
                label={entrySheet.dueDate ? `Due ${prettyDate(entrySheet.dueDate)}` : 'Add return date'}
                ink={ink}
                tile={pageBg}
                onPress={() => {
                  const e = entrySheet;
                  setEntrySheet(null);
                  setTimeout(() => setDueFor(e), 300);
                }}
              />
            ) : null}
            {entrySheet.kind === 'LEND' ? (
              <SheetItem
                icon={entryWrittenOff ? 'rotate-ccw' : 'slash'}
                label={entryWrittenOff ? 'Expect it back again' : 'Let it go'}
                ink={ink}
                tile={pageBg}
                onPress={() => {
                  setNotExpectedBack(entrySheet.id, !entryWrittenOff);
                  setEntrySheet(null);
                }}
              />
            ) : null}
            <SheetItem
              icon="trash-2"
              label="Remove"
              ink={isDark ? '#FFA8A8' : '#C92A2A'}
              tile={isDark ? 'rgba(224,49,49,0.2)' : '#FFE3E3'}
              onPress={() => {
                const e = entrySheet;
                setEntrySheet(null);
                handleDeleteEntry(e);
              }}
              last
            />
          </View>
        ) : null}
      </Modal>

      {/* More: rename, merge, delete */}
      <Modal visible={menu !== null} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setMenu(null)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable style={styles.backdrop} onPress={() => setMenu(null)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { backgroundColor: surface, paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <View style={[styles.grabber, { backgroundColor: line }]} />
            <View style={[styles.sheetWho, { borderBottomColor: divider }]}>
              <Avatar name={contact.displayName} kind={contact.kind} size={44} />
              <Text style={[styles.sheetTitle, { color: ink, flex: 1, fontFamily: display }]} numberOfLines={1}>
                {contact.displayName}
              </Text>
            </View>
            {menu === 'rename' ? (
              <View style={styles.renameRow}>
                <TextInput
                  value={renameText}
                  onChangeText={setRenameText}
                  autoFocus
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={saveRename}
                  maxLength={60}
                  style={[styles.renameInput, { color: ink, borderColor: line, backgroundColor: pageBg }]}
                  accessibilityLabel="Name"
                />
                <Pressable onPress={saveRename} style={[styles.renameSave, { backgroundColor: accent }]} accessibilityRole="button">
                  <Text style={[styles.primaryBtnText, { color: accentFg }]}>Save</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <SheetItem
                  icon="edit-2"
                  label="Rename"
                  ink={ink}
                  tile={pageBg}
                  onPress={() => {
                    setRenameText(contact.displayName);
                    setMenu('rename');
                  }}
                />
                <SheetItem
                  icon="git-merge"
                  label="Merge with another person"
                  ink={ink}
                  tile={pageBg}
                  onPress={() => {
                    setMenu(null);
                    setTimeout(() => setMergeOpen(true), 300);
                  }}
                />
                <SheetItem
                  icon="trash-2"
                  label="Delete"
                  ink={isDark ? '#FFA8A8' : '#C92A2A'}
                  tile={isDark ? 'rgba(224,49,49,0.2)' : '#FFE3E3'}
                  onPress={() => {
                    setMenu(null);
                    handleDeleteContact();
                  }}
                  last
                />
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PersonPickerSheet
        visible={mergeOpen}
        onClose={() => setMergeOpen(false)}
        title={`Merge into ${contact.displayName}`}
        excludeIds={[contact.id]}
        printedName={contact.displayName}
        onPick={handleMerge}
      />

      {/* Return date for one loan */}
      <DateTimePickerSheet
        visible={!!dueFor}
        mode="date"
        title="Expected back by"
        confirmLabel="Save"
        value={dueFor?.dueDate ? new Date(`${dueFor.dueDate}T12:00:00`) : new Date(Date.now() + 14 * 86_400_000)}
        minimumDate={new Date()}
        onClose={() => setDueFor(null)}
        onConfirm={(d) => {
          if (dueFor) updatePeerEntry(dueFor.id, { dueDate: toDateString(d) });
          setDueFor(null);
        }}
      />
    </View>
  );
};

/** A row in a bottom sheet: icon tile and label. */
const SheetItem: React.FC<{
  icon: keyof typeof Feather.glyphMap;
  label: string;
  ink: string;
  tile: string;
  onPress: () => void;
  last?: boolean;
}> = ({ icon, label, ink, tile, onPress, last }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [styles.sheetItem, !last && styles.sheetItemLine, pressed && { opacity: 0.7 }]}
    accessibilityRole="button"
  >
    <View style={[styles.sheetIcon, { backgroundColor: tile }]}>
      <Feather name={icon} size={18} color={ink} />
    </View>
    <Text style={[styles.sheetItemText, { color: ink }]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topNav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerWho: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  headerName: { flex: 1, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 6 },

  hero: { borderRadius: 28, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 22, overflow: 'hidden' },
  heroRing: { position: 'absolute', right: -70, top: -70, width: 220, height: 220, borderRadius: 110, borderWidth: 28, borderColor: 'rgba(184,243,107,0.08)' },
  heroLabel: { fontSize: 14, fontWeight: '600', color: '#B5CEC1' },
  heroAmount: { fontSize: 52, fontWeight: '800', letterSpacing: -2, marginTop: 4 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  barText: { fontSize: 13, color: '#B5CEC1' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  sumLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
  sumValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sumRule: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(181,206,193,0.45)', marginTop: 14 },
  sumTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginTop: 10 },
  sumTotalLabel: { color: '#B5CEC1', fontSize: 16, fontWeight: '500', paddingBottom: 6 },
  sumTotal: { flexShrink: 1, fontSize: 44, fontWeight: '800', letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  sumNote: { marginTop: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(181,206,193,0.3)' },
  sumNoteText: { color: '#B5CEC1', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.10)' },
  heroChipText: { fontSize: 12.5, fontWeight: '600', color: '#B5CEC1' },

  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryBtnText: { fontSize: 15.5, fontWeight: '700' },
  secondaryBtn: { height: 54, paddingHorizontal: 20, borderRadius: 27, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryBtnText: { fontSize: 15.5, fontWeight: '700' },

  tabs: { flexDirection: 'row', borderRadius: 999, padding: 4, marginTop: 16, marginBottom: 12 },
  tab: { flex: 1, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14.5 },

  card: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 4 },
  empty: { paddingVertical: 28, alignItems: 'center' },
  emptyText: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68 },
  rowIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12.5, marginTop: 2 },
  rowAmt: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rowTag: { fontSize: 12, fontWeight: '700', marginTop: 2 },

  tiles: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  tile: { flex: 1, borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14 },
  tileLabel: { fontSize: 13, fontWeight: '600' },
  tileValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 },
  month: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', paddingTop: 12, paddingBottom: 4 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  seeAll: { height: 48, alignItems: 'center', justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  seeAllText: { fontSize: 14.5, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(11,31,23,0.45)' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  sheetHead: { paddingBottom: 10 },
  sheetWho: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60 },
  sheetItemLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,128,0.18)' },
  sheetIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sheetItemText: { fontSize: 15.5, fontWeight: '600' },
  renameRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 14 },
  renameInput: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, fontSize: 15, fontWeight: '600' },
  renameSave: { height: 48, paddingHorizontal: 20, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
