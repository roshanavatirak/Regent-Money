// src/screens/BorrowLendScreen.tsx
//
// Borrow and lend: one number for where you stand, the next repayment to confirm, and the
// people you have money with, Open or Settled. Loans come from tagging a bank or cash
// payment, so there's nothing to add here; tap a person to see everything.

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Linking, Platform, StatusBar } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { useTheme, useTransactionStore } from '../store';
import { usePeerStore } from '../store/peerStore';
import { RepaymentPrompt } from '../components/RepaymentSuggestions';
import { Avatar } from '../components/PersonPickerSheet';
import { syncPeerLedger, startPeerLedgerAutoSync } from '../services/peerSyncService';
import { computeGlobalMetrics, computeAllContactSummaries } from '../services/peerLedgerSelectors';
import { formatPaise, ContactLedgerSummary } from '../types/peer';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

type Tab = 'open' | 'settled';
type Side = 'all' | 'owe_you' | 'you_owe';

/** Local YYYY-MM-DD (toISOString is UTC and shifts the date in India before 5:30 am). */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const prettyDate = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

interface BorrowLendScreenProps {
  navigation?: any;
}

export const BorrowLendScreen: React.FC<BorrowLendScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const heading = { fontFamily: display, fontWeight: display ? undefined : ('800' as const) };

  const contacts = usePeerStore((s) => s.contacts);
  const entries = usePeerStore((s) => s.entries);
  const storedAllocations = usePeerStore((s) => s.storedAllocations);
  const transactions = useTransactionStore((s) => s.transactions);

  // Self-heal & reconcile peer entries on mount/focus and when transaction store updates
  useFocusEffect(
    useCallback(() => {
      // Pull any changes from the server (another phone, or after signing in), then reconcile.
      startPeerLedgerAutoSync();
      syncPeerLedger().finally(() => {
        const txs = useTransactionStore.getState().transactions;
        if (txs && txs.length > 0) {
          usePeerStore.getState().reconcileWithTransactions(txs);
        }
      });
    }, [])
  );

  useEffect(() => {
    if (transactions && transactions.length > 0) {
      usePeerStore.getState().reconcileWithTransactions(transactions);
    }
  }, [transactions]);

  const [tab, setTab] = useState<Tab>('open');
  const [side, setSide] = useState<Side>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const today = useMemo(localToday, []);
  const metrics = useMemo(() => computeGlobalMetrics(contacts, entries, storedAllocations, today), [contacts, entries, storedAllocations, today]);
  // People and shops added from a transaction's name picker (they have a `kind`) show here
  // only once there's a loan with them; contacts made in Borrow & Lend always show.
  const ledgerContacts = useMemo(() => {
    const withEntries = new Set(entries.filter((e) => !e.deletedAt).map((e) => e.contactId));
    return contacts.filter((c) => !c.kind || withEntries.has(c.id));
  }, [contacts, entries]);
  const summaries = useMemo(
    () => computeAllContactSummaries(ledgerContacts, entries, storedAllocations, today),
    [ledgerContacts, entries, storedAllocations, today],
  );

  // Per person: latest loan, and the earliest return date still ahead or already missed
  const loanDates = useMemo(() => {
    const m = new Map<string, { lastLoan?: { date: string; kind: 'LEND' | 'BORROW' }; due?: string }>();
    for (const e of entries) {
      if (e.deletedAt || (e.kind !== 'LEND' && e.kind !== 'BORROW') || e.notExpectedBack) continue;
      const cur = m.get(e.contactId) || {};
      if (!cur.lastLoan || e.date > cur.lastLoan.date) cur.lastLoan = { date: e.date, kind: e.kind };
      if (e.dueDate && (!cur.due || e.dueDate < cur.due)) cur.due = e.dueDate;
      m.set(e.contactId, cur);
    }
    return m;
  }, [entries]);

  const openPeople = summaries.filter((s) => s.netPosition !== 0);
  const settledPeople = summaries.filter((s) => s.netPosition === 0);
  const oweYouCount = openPeople.filter((s) => s.netPosition > 0).length;
  const youOweCount = openPeople.filter((s) => s.netPosition < 0).length;

  const list = useMemo(() => {
    let l = tab === 'open' ? openPeople : settledPeople;
    if (tab === 'open' && side === 'owe_you') l = l.filter((s) => s.netPosition > 0);
    if (tab === 'open' && side === 'you_owe') l = l.filter((s) => s.netPosition < 0);
    const q = query.trim().toLowerCase();
    if (q) {
      l = l.filter(
        (s) =>
          s.contact.displayName.toLowerCase().includes(q) ||
          s.contact.aliases.some((a: string) => a.toLowerCase().includes(q)) ||
          s.contact.upiIds.some((u: string) => u.toLowerCase().includes(q))
      );
    }
    // Overdue first, then the biggest amount; settled newest first
    return [...l].sort((a, b) => {
      if (tab === 'settled') return (b.lastActivityDate || '').localeCompare(a.lastActivityDate || '');
      if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
      return Math.abs(b.netPosition) - Math.abs(a.netPosition);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaries, tab, side, query]);

  const remind = (s: ContactLedgerSummary) => {
    const c = s.contact;
    const amount = formatPaise(s.totalLentPending || Math.max(0, s.netPosition));
    const text = encodeURIComponent(`Hi ${c.displayName}, just a gentle reminder about the ${amount} I lent you. Let me know when you can send it. Thanks!`);
    const phone = c.phoneE164?.replace(/\D/g, '');
    const wa = phone ? `whatsapp://send?phone=${phone}&text=${text}` : `whatsapp://send?text=${text}`;
    Linking.openURL(wa).catch(() => Linking.openURL(phone ? `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${text}` : `sms:?body=${text}`).catch(() => {}));
  };

  const pickSide = (next: Side) => {
    setTab('open');
    setSide(side === next ? 'all' : next);
  };

  /** The line under a person's name: overdue, due, latest loan, or when they settled. */
  const rowLine = (p: ContactLedgerSummary): { text: string; overdueFrom?: string } => {
    const d = loanDates.get(p.contact.id);
    if (p.netPosition === 0) {
      if (p.notExpectedPending > 0) return { text: 'Let go' };
      return { text: p.lastActivityDate ? `Settled ${prettyDate(p.lastActivityDate)}` : 'Settled' };
    }
    if (p.hasOverdue) return { text: '', overdueFrom: d?.due };
    // "Lent ₹5,500 · paid ₹2,800", or "Lent ₹4,000 · due 19 Nov" while nothing has come back
    const lent = p.netPosition > 0;
    const total = lent ? p.lentTotal : p.borrowedTotal;
    const repaid = lent ? p.lentRepaid : p.borrowedRepaid;
    const parts = [`${lent ? 'Lent' : 'Borrowed'} ${formatPaise(total)}`];
    if (repaid > 0) parts.push(`paid ${formatPaise(repaid)}`);
    else if (d?.due && d.due >= today) parts.push(`due ${prettyDate(d.due)}`);
    return { text: parts.join(' · ') };
  };

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const divider = isDark ? colors.border : '#EEF2EF';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const green = isDark ? LIME : '#0B6B3A';
  const red = isDark ? '#FFA8A8' : '#B42318';
  const chip = isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF';

  const net = metrics.netBalance;
  const hasLent = metrics.totalLentExpected > 0;
  const hasBorrowed = metrics.totalBorrowedPending > 0;
  const empty = summaries.length === 0;

  /* ---------------- Render ---------------- */

  return (
    <View style={{ flex: 1, backgroundColor: pageBg, paddingTop: insets.top }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={pageBg} />

      <View style={s.header}>
        <Pressable onPress={() => navigation?.goBack?.()} style={[s.roundBtn, { backgroundColor: chip }]} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={20} color={ink} />
        </Pressable>
        <Text style={[s.headerTitle, { color: ink }, heading]}>Borrow &amp; lend</Text>
        {!empty ? (
          <Pressable
            onPress={() => {
              if (searchOpen) setQuery('');
              setSearchOpen(!searchOpen);
            }}
            style={[s.roundBtn, { backgroundColor: chip }]}
            accessibilityRole="button"
            accessibilityLabel={searchOpen ? 'Close search' : 'Search people'}
          >
            <Feather name={searchOpen ? 'x' : 'search'} size={19} color={ink} />
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 20) + 24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {empty ? (
          /* ---------------- First time ---------------- */
          <Animated.View entering={FadeInDown.duration(400)} style={s.emptyWrap}>
            <View style={s.emptyArt}>
              <View style={[s.emptyAvatar, { backgroundColor: '#FFE2B3', left: 0 }]}>
                <Text style={[s.emptyAvatarText, { color: '#8A5A00' }]}>A</Text>
              </View>
              <View style={[s.emptyArrow, { backgroundColor: FOREST }]}>
                <Feather name="repeat" size={18} color={LIME} />
              </View>
              <View style={[s.emptyAvatar, { backgroundColor: '#DCEBFF', right: 0 }]}>
                <Text style={[s.emptyAvatarText, { color: '#1450A3' }]}>R</Text>
              </View>
            </View>
            <Text style={[s.emptyTitle, { color: ink }, heading]}>Never forget who owes what</Text>
            <Text style={[s.emptyText, { color: muted }]}>Keep track of money with friends and family, separate from your budget.</Text>
            <View style={[s.benefits, { backgroundColor: surface, borderColor: line }]}>
              {[
                ['arrow-down-left', 'See who owes you and how much'],
                ['message-circle', 'Send a friendly reminder on WhatsApp'],
                ['check-circle', 'Record part payments until it’s settled'],
              ].map(([icon, text], i) => (
                <View key={text} style={[s.benefit, i < 2 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}>
                  <Feather name={icon as any} size={17} color={accent} />
                  <Text style={[s.benefitText, { color: ink }]}>{text}</Text>
                </View>
              ))}
            </View>
            <Text style={[s.emptyText, { color: muted, marginTop: 14 }]}>
              Open any bank or cash payment and tag it “Lent to friend” or “Borrowed”. It shows up here on its own.
            </Text>
            <Pressable
              onPress={() => navigation?.navigate?.('AllTransactions')}
              style={({ pressed }) => [s.cta, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.98 }] }]}
            >
              <Feather name="list" size={18} color={accentFg} />
              <Text style={[s.ctaText, { color: accentFg }]}>Go to transactions</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <>
            {searchOpen ? (
              <Animated.View entering={FadeIn.duration(180)} style={[s.search, { backgroundColor: surface, borderColor: line }]}>
                <Feather name="search" size={16} color={muted} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  autoFocus
                  placeholder="Search people or UPI ID"
                  placeholderTextColor={muted}
                  style={[s.searchInput, { color: ink }]}
                  accessibilityLabel="Search people"
                />
              </Animated.View>
            ) : null}

            {/* Hero: the sum written out, You lent − Paid back = Still owed. Lines at ₹0 are left out. */}
            <Animated.View entering={FadeInDown.duration(380)} style={[s.hero, { backgroundColor: isDark ? '#061D15' : FOREST }]}>
              <View pointerEvents="none" style={s.heroRing} />
              {hasLent ? (
                <>
                  <Text style={s.heroLabel}>
                    {metrics.lentToCount > 0
                      ? `Money you lent to ${metrics.lentToCount} ${metrics.lentToCount === 1 ? 'person' : 'people'}`
                      : 'Money you lent'}
                  </Text>
                  <View style={s.sumRow}>
                    <Text style={s.sumLabel}>You lent</Text>
                    <Text style={s.sumValue}>{formatPaise(metrics.totalLentExpected)}</Text>
                  </View>
                  {metrics.totalLentRepaid > 0 ? (
                    <View style={s.sumRow}>
                      <Text style={s.sumLabel}>Paid back</Text>
                      <Text style={s.sumValue}>− {formatPaise(metrics.totalLentRepaid)}</Text>
                    </View>
                  ) : null}
                  <View style={s.sumRule} />
                  <Pressable
                    onPress={() => pickSide('owe_you')}
                    style={s.sumTotalRow}
                    accessibilityRole="button"
                    accessibilityLabel={`Still owed ${formatPaise(metrics.totalLentPending)}`}
                    accessibilityState={{ selected: side === 'owe_you' && tab === 'open' }}
                  >
                    <Text style={[s.sumTotalLabel, side === 'owe_you' && tab === 'open' && { color: LIME }]}>Still owed</Text>
                    <Text style={[s.sumTotal, heading, { color: LIME }]} numberOfLines={1} adjustsFontSizeToFit>
                      {formatPaise(metrics.totalLentPending)}
                    </Text>
                  </Pressable>
                  {metrics.totalBorrowedPending > 0 ? (
                    <Pressable onPress={() => pickSide('you_owe')} style={[s.sumRow, s.sumNote]} accessibilityRole="button">
                      <Text style={[s.sumNoteText, side === 'you_owe' && tab === 'open' && { color: LIME }]}>
                        You owe {youOweCount} {youOweCount === 1 ? 'person' : 'people'}
                      </Text>
                      <Text style={[s.sumNoteText, { color: '#FFB4A2' }]}>{formatPaise(metrics.totalBorrowedPending)}</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : hasBorrowed ? (
                <>
                  <Text style={s.heroLabel}>Money you borrowed</Text>
                  <View style={s.sumRow}>
                    <Text style={s.sumLabel}>You borrowed</Text>
                    <Text style={s.sumValue}>{formatPaise(metrics.totalBorrowedOpen)}</Text>
                  </View>
                  {metrics.totalBorrowedOpenRepaid > 0 ? (
                    <View style={s.sumRow}>
                      <Text style={s.sumLabel}>You paid back</Text>
                      <Text style={s.sumValue}>− {formatPaise(metrics.totalBorrowedOpenRepaid)}</Text>
                    </View>
                  ) : null}
                  <View style={s.sumRule} />
                  <View style={s.sumTotalRow}>
                    <Text style={s.sumTotalLabel}>You still owe</Text>
                    <Text style={[s.sumTotal, heading, { color: '#FFB4A2' }]} numberOfLines={1} adjustsFontSizeToFit>
                      {formatPaise(metrics.totalBorrowedPending)}
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={s.heroLabel}>All settled</Text>
              )}
              {metrics.totalNotExpected > 0 ? (
                <View style={[s.sumRow, s.sumNote]}>
                  <Text style={s.sumNoteText}>Let go, not asking back</Text>
                  <Text style={s.sumNoteText}>{formatPaise(metrics.totalNotExpected)}</Text>
                </View>
              ) : null}
            </Animated.View>

            {/* The next repayment to confirm, for anyone */}
            <View>
              <RepaymentPrompt
                onOpenPayment={(sg) =>
                  navigation?.navigate?.('TransactionDetail', {
                    transaction: {
                      ...sg.row,
                      type: sg.row.ledger === 'income' ? 'credit' : 'debit',
                      merchant: sg.row.merchant ?? sg.row.source,
                    },
                  })
                }
              />
            </View>

            {/* Open / Settled */}
            <View style={[s.tabs, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E1E9E4' }]} accessibilityRole="tablist">
              {(
                [
                  ['open', `Open · ${openPeople.length}`],
                  ['settled', `Settled · ${settledPeople.length}`],
                ] as [Tab, string][]
              ).map(([k, label]) => {
                const on = tab === k;
                return (
                  <Pressable
                    key={k}
                    onPress={() => {
                      setTab(k);
                      setSide('all');
                    }}
                    style={[s.tab, on && { backgroundColor: surface }]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[s.tabText, { color: on ? ink : muted, fontWeight: on ? '700' : '600' }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* People */}
            {list.length === 0 ? (
              <View style={[s.card, s.empty, { backgroundColor: surface, borderColor: line }]}>
                <Text style={[s.emptyNote, { color: muted }]}>
                  {query.trim() ? `No one matches “${query.trim()}”` : tab === 'open' ? 'Nothing open' : 'No one settled yet'}
                </Text>
              </View>
            ) : (
              <Animated.View entering={FadeInDown.delay(80).duration(380)} style={[s.card, { backgroundColor: surface, borderColor: line }]}>
                {list.map((p, i) => {
                  const owesYou = p.netPosition > 0;
                  const sub = rowLine(p);
                  return (
                    <Pressable
                      key={p.contact.id}
                      onPress={() => navigation?.navigate?.('PersonDetail', { contactId: p.contact.id })}
                      style={({ pressed }) => [
                        s.person,
                        i < list.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: divider },
                        pressed && { opacity: 0.75 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.contact.displayName}${p.netPosition !== 0 ? `, ${owesYou ? 'still owes you' : 'you owe'} ${formatPaise(Math.abs(p.netPosition))}` : ', settled'}`}
                    >
                      <Avatar name={p.contact.displayName} kind={p.contact.kind} size={44} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.name, { color: ink }]} numberOfLines={1}>{p.contact.displayName}</Text>
                        {sub.overdueFrom !== undefined || p.hasOverdue ? (
                          <Text style={[s.meta, { color: muted }]} numberOfLines={1}>
                            <Text style={{ color: red, fontWeight: '700' }}>Overdue</Text>
                            {sub.overdueFrom ? ` · was due ${prettyDate(sub.overdueFrom)}` : ''}
                          </Text>
                        ) : sub.text ? (
                          <Text style={[s.meta, { color: muted }]} numberOfLines={1}>{sub.text}</Text>
                        ) : null}
                      </View>
                      {p.netPosition !== 0 ? (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[s.amount, { color: owesYou ? green : red }]}>{formatPaise(Math.abs(p.netPosition))}</Text>
                          <Text style={[s.meta, { color: muted }]}>{owesYou ? 'left' : 'you owe'}</Text>
                        </View>
                      ) : (
                        <Feather name="check" size={20} color={green} accessibilityLabel="Settled" />
                      )}
                    </Pressable>
                  );
                })}
              </Animated.View>
            )}

            {/* A nudge only where it helps: the one overdue person who owes you */}
            {tab === 'open' && list.some((p) => p.hasOverdue && p.netPosition > 0) ? (
              <Pressable
                onPress={() => {
                  const p = list.find((x) => x.hasOverdue && x.netPosition > 0);
                  if (p) remind(p);
                }}
                style={({ pressed }) => [s.remind, { borderColor: line, backgroundColor: surface }, pressed && { opacity: 0.8 }]}
                accessibilityRole="button"
              >
                <Feather name="message-circle" size={17} color="#1F9D55" />
                <Text style={[s.remindText, { color: ink }]}>
                  Remind {list.find((x) => x.hasOverdue && x.netPosition > 0)!.contact.displayName.split(' ')[0]}
                </Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, letterSpacing: -0.3 },

  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, marginTop: 6, marginBottom: 6 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },

  hero: { marginTop: 8, borderRadius: 28, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 18, overflow: 'hidden' },
  heroRing: { position: 'absolute', right: -70, top: -70, width: 220, height: 220, borderRadius: 110, borderWidth: 28, borderColor: 'rgba(184,243,107,0.08)' },
  heroLabel: { color: '#B5CEC1', fontSize: 14, fontWeight: '600', paddingHorizontal: 4 },
  heroAmount: { fontSize: 50, letterSpacing: -2, marginTop: 4, paddingHorizontal: 4, fontVariant: ['tabular-nums'] },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 18 },
  tile: { flex: 1, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: 'transparent' },
  tileOn: { borderColor: LIME },
  tileLabel: { color: '#B5CEC1', fontSize: 12.5, fontWeight: '600' },
  tileValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },
  tileSub: { color: '#B5CEC1', fontSize: 12, marginTop: 1 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, marginTop: 10 },
  sumLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '500' },
  sumValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sumRule: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(181,206,193,0.45)', marginTop: 14, marginHorizontal: 4 },
  sumTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, paddingHorizontal: 4, marginTop: 10 },
  sumTotalLabel: { color: '#B5CEC1', fontSize: 16, fontWeight: '500', paddingBottom: 6 },
  sumTotal: { flexShrink: 1, fontSize: 44, letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  sumNote: { marginTop: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(181,206,193,0.3)' },
  sumNoteText: { color: '#B5CEC1', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingHorizontal: 2 },
  heroChip: { height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.10)', justifyContent: 'center' },
  heroChipText: { fontSize: 12.5, fontWeight: '600', color: '#B5CEC1' },

  tabs: { flexDirection: 'row', borderRadius: 999, padding: 4, marginTop: 16, marginBottom: 12 },
  tab: { flex: 1, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14.5 },

  card: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 16 },
  empty: { paddingVertical: 28, alignItems: 'center' },
  emptyNote: { fontSize: 14, fontWeight: '600' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72 },
  name: { fontSize: 15.5, fontWeight: '700' },
  meta: { fontSize: 12.5, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },

  remind: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 26, borderWidth: 1, marginTop: 12 },
  remindText: { fontSize: 15, fontWeight: '700' },

  emptyWrap: { alignItems: 'center', paddingTop: 28 },
  emptyArt: { width: 180, height: 80, alignItems: 'center', justifyContent: 'center' },
  emptyAvatar: { position: 'absolute', width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  emptyAvatarText: { fontSize: 24, fontWeight: '800' },
  emptyArrow: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  emptyTitle: { fontSize: 26, letterSpacing: -0.5, marginTop: 22, textAlign: 'center' },
  emptyText: { fontSize: 15, lineHeight: 22, marginTop: 6, textAlign: 'center', maxWidth: 300 },
  benefits: { alignSelf: 'stretch', borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, marginTop: 22 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  benefitText: { flex: 1, fontSize: 14, fontWeight: '600' },
  cta: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 56, borderRadius: 28, marginTop: 20 },
  ctaText: { fontSize: 16, fontWeight: '700' },
});
