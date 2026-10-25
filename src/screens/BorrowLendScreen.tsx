// src/screens/BorrowLendScreen.tsx
//
// Borrow and lend: who owes you, who you owe, one nudge for what's overdue,
// and a clean list of people. Tap a person to see everything, long-press to settle up.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Linking, Platform, StatusBar } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { useTheme } from '../store';
import { usePeerStore } from '../store/peerStore';
import { computeGlobalMetrics, computeAllContactSummaries } from '../services/peerLedgerSelectors';
import { formatPaise, ContactLedgerSummary } from '../types/peer';
import { AddPeerLoanModal } from '../components/AddPeerLoanModal';
import { RecordPeerPaymentModal } from '../components/RecordPeerPaymentModal';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

type Filter = 'all' | 'owe_you' | 'you_owe' | 'overdue' | 'settled';

const AVATAR_TONES: [string, string][] = [
  ['#FFE2B3', '#8A5A00'],
  ['#DCEBFF', '#1450A3'],
  ['#ECE6FF', '#4B2DB8'],
  ['#E3F2E8', '#0B3D2C'],
  ['#FCE4EE', '#A61E4D'],
  ['#FFE8D9', '#B23F00'],
];
const toneFor = (name: string) => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
};

/** Local YYYY-MM-DD (toISOString is UTC and shifts the date in India before 5:30 am). */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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

  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [payment, setPayment] = useState<{ contact: any; direction: 'received' | 'paid'; pendingPaise: number } | null>(null);
  const [dismissedNudge, setDismissedNudge] = useState(false);

  const today = useMemo(localToday, []);
  const metrics = useMemo(() => computeGlobalMetrics(contacts, entries, storedAllocations, today), [contacts, entries, storedAllocations, today]);
  const summaries = useMemo(() => computeAllContactSummaries(contacts, entries, storedAllocations, today), [contacts, entries, storedAllocations, today]);

  const counts = useMemo(() => {
    const c = { oweYou: 0, youOwe: 0, settled: 0, overdue: 0 };
    summaries.forEach((s) => {
      if (s.netPosition > 0) c.oweYou++;
      else if (s.netPosition < 0) c.youOwe++;
      else c.settled++;
      if (s.hasOverdue) c.overdue++;
    });
    return c;
  }, [summaries]);

  const list = useMemo(() => {
    let l = summaries;
    if (filter === 'owe_you') l = l.filter((s) => s.netPosition > 0);
    if (filter === 'you_owe') l = l.filter((s) => s.netPosition < 0);
    if (filter === 'settled') l = l.filter((s) => s.netPosition === 0);
    if (filter === 'overdue') l = l.filter((s) => s.hasOverdue);
    const q = query.trim().toLowerCase();
    if (q) {
      l = l.filter(
        (s) =>
          s.contact.displayName.toLowerCase().includes(q) ||
          s.contact.aliases.some((a: string) => a.toLowerCase().includes(q)) ||
          s.contact.upiIds.some((u: string) => u.toLowerCase().includes(q))
      );
    }
    // Overdue first, then biggest balance, settled last
    return [...l].sort((a, b) => {
      if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
      if ((a.netPosition === 0) !== (b.netPosition === 0)) return a.netPosition === 0 ? 1 : -1;
      return Math.abs(b.netPosition) - Math.abs(a.netPosition);
    });
  }, [summaries, filter, query]);

  // One overdue person to nudge
  const overdueOne = useMemo(() => summaries.find((s) => s.hasOverdue && s.netPosition !== 0), [summaries]);

  const remind = (s: ContactLedgerSummary) => {
    const c = s.contact;
    const amount = formatPaise(s.totalLentPending || Math.max(0, s.netPosition));
    const text = encodeURIComponent(`Hi ${c.displayName}, just a gentle reminder about the ${amount} I lent you. Let me know when you can send it. Thanks!`);
    const phone = c.phoneE164?.replace(/\D/g, '');
    const wa = phone ? `whatsapp://send?phone=${phone}&text=${text}` : `whatsapp://send?text=${text}`;
    Linking.openURL(wa).catch(() => Linking.openURL(phone ? `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${text}` : `sms:?body=${text}`).catch(() => {}));
  };

  const settleUp = (s: ContactLedgerSummary) =>
    setPayment({ contact: s.contact, direction: s.netPosition > 0 ? 'received' : 'paid', pendingPaise: Math.abs(s.netPosition) });

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const field = isDark ? colors.border : '#DCE5E0';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const accentInk = isDark ? FOREST : '#FFFFFF';
  const green = isDark ? LIME : '#0B6B3A';
  const red = isDark ? '#FFA8A8' : '#C92A2A';

  const net = metrics.netBalance;
  const empty = summaries.length === 0;

  /* ---------------- Render ---------------- */

  return (
    <View style={{ flex: 1, backgroundColor: pageBg, paddingTop: insets.top }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={pageBg} />

      <View style={s.header}>
        <Pressable onPress={() => navigation?.goBack?.()} style={[s.roundBtn, { backgroundColor: surface }]} accessibilityLabel="Back">
          <Feather name="arrow-left" size={20} color={ink} />
        </Pressable>
        <Text style={[s.headerTitle, { color: ink }]}>Borrow and lend</Text>
        <Pressable onPress={() => setAddOpen(true)} style={[s.roundBtn, { backgroundColor: accent }]} accessibilityLabel="New entry">
          <Feather name="plus" size={20} color={accentFg} />
        </Pressable>
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
            <Pressable onPress={() => setAddOpen(true)} style={({ pressed }) => [s.cta, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.98 }] }]}>
              <Feather name="plus" size={18} color={accentFg} />
              <Text style={[s.ctaText, { color: accentFg }]}>Add your first entry</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <>
            {/* Hero */}
            <Animated.View entering={FadeInDown.duration(380)} style={s.hero}>
              <View pointerEvents="none" style={s.heroRing} />
              <Text style={s.heroLabel}>{net > 0 ? 'Overall, you’re owed' : net < 0 ? 'Overall, you owe' : 'All square'}</Text>
              <Text style={[s.heroAmount, heading, { color: net > 0 ? LIME : net < 0 ? '#FFB4A2' : '#FFFFFF' }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatPaise(Math.abs(net))}
              </Text>
              <View style={s.tiles}>
                <Pressable onPress={() => setFilter(filter === 'owe_you' ? 'all' : 'owe_you')} style={[s.tile, filter === 'owe_you' && s.tileOn]} accessibilityRole="button">
                  <Text style={s.tileLabel}>Owed to you</Text>
                  <Text style={s.tileValue}>{formatPaise(metrics.totalLentPending)}</Text>
                  <Text style={s.tileSub}>
                    {counts.oweYou} {counts.oweYou === 1 ? 'person' : 'people'}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setFilter(filter === 'you_owe' ? 'all' : 'you_owe')} style={[s.tile, filter === 'you_owe' && s.tileOn]} accessibilityRole="button">
                  <Text style={s.tileLabel}>You owe</Text>
                  <Text style={s.tileValue}>{formatPaise(metrics.totalBorrowedPending)}</Text>
                  <Text style={s.tileSub}>
                    {counts.youOwe} {counts.youOwe === 1 ? 'person' : 'people'}
                  </Text>
                </Pressable>
              </View>
              {(metrics.totalLentSettled > 0 || metrics.totalBorrowedSettled > 0) && (
                <Text style={s.heroFoot}>
                  {formatPaise(metrics.totalLentSettled)} paid back to you so far, {formatPaise(metrics.totalBorrowedSettled)} repaid by you
                </Text>
              )}
            </Animated.View>

            {/* One nudge */}
            {overdueOne && !dismissedNudge && (
              <Animated.View entering={FadeIn.duration(300)} style={[s.nudge, { backgroundColor: isDark ? 'rgba(245,159,0,0.14)' : '#FFF4E0' }]}>
                <View style={[s.nudgeAvatar, { backgroundColor: isDark ? 'rgba(245,159,0,0.22)' : '#FFE2B3' }]}>
                  <Text style={[s.nudgeInitial, { color: isDark ? '#FFD27A' : '#8A5A00' }]}>{overdueOne.contact.displayName.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={[s.nudgeText, { color: ink }]}>
                  {overdueOne.netPosition > 0 ? (
                    <>
                      <Text style={{ fontWeight: '700' }}>{overdueOne.contact.displayName}’s {formatPaise(overdueOne.netPosition)} is overdue.</Text> A friendly nudge usually works.
                    </>
                  ) : (
                    <>
                      <Text style={{ fontWeight: '700' }}>You’re due to pay {overdueOne.contact.displayName} {formatPaise(Math.abs(overdueOne.netPosition))}.</Text> Mark it when you do.
                    </>
                  )}
                </Text>
                <Pressable
                  onPress={() => (overdueOne.netPosition > 0 ? remind(overdueOne) : settleUp(overdueOne))}
                  style={[s.nudgeBtn, { backgroundColor: accent }]}
                >
                  <Text style={[s.nudgeBtnText, { color: accentFg }]}>{overdueOne.netPosition > 0 ? 'Remind' : 'Paid'}</Text>
                </Pressable>
                <Pressable onPress={() => setDismissedNudge(true)} hitSlop={10} accessibilityLabel="Dismiss">
                  <Feather name="x" size={16} color={muted} />
                </Pressable>
              </Animated.View>
            )}

            {/* Search (only when the list is long) */}
            {summaries.length >= 6 && (
              <View style={[s.search, { backgroundColor: surface, borderColor: field }]}>
                <Feather name="search" size={16} color={muted} />
                <TextInput value={query} onChangeText={setQuery} placeholder="Search people or UPI" placeholderTextColor={muted} style={[s.searchInput, { color: ink }]} />
                {query ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
                    <Feather name="x-circle" size={15} color={muted} />
                  </Pressable>
                ) : null}
              </View>
            )}

            {/* Filters: only the ones with people in them */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
              {(
                [
                  ['all', 'All', summaries.length],
                  ['owe_you', 'Owe you', counts.oweYou],
                  ['you_owe', 'You owe', counts.youOwe],
                  ['overdue', 'Overdue', counts.overdue],
                  ['settled', 'Settled', counts.settled],
                ] as [Filter, string, number][]
              )
                .filter(([k, , n]) => k === 'all' || n > 0)
                .map(([k, label, n]) => {
                  const on = filter === k;
                  return (
                    <Pressable
                      key={k}
                      onPress={() => setFilter(k)}
                      style={[s.chip, on ? { backgroundColor: accent, borderColor: accent } : { backgroundColor: surface, borderColor: field }]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[s.chipText, { color: on ? accentInk : k === 'overdue' ? red : ink }, on && { fontWeight: '700' }]}>
                        {label}
                        {k !== 'all' ? ` ${n}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
            </ScrollView>

            {/* People */}
            {list.length === 0 ? (
              <View style={[s.note, { borderColor: field }]}>
                <Text style={[s.noteText, { color: muted }]}>{query ? `No one matches “${query.trim()}”.` : 'No one here right now.'}</Text>
              </View>
            ) : (
              <Animated.View entering={FadeInDown.delay(80).duration(380)} style={[s.group, { backgroundColor: surface, borderColor: line }]}>
                {list.map((p, i) => {
                  const owesYou = p.netPosition > 0;
                  const youOwe = p.netPosition < 0;
                  const [bg, fg] = p.contact.avatarColor ? [p.contact.avatarColor, ink] : toneFor(p.contact.displayName);
                  return (
                    <Pressable
                      key={p.contact.id}
                      onPress={() => navigation?.navigate?.('PersonDetail', { contactId: p.contact.id })}
                      onLongPress={() => p.netPosition !== 0 && settleUp(p)}
                      style={({ pressed }) => [s.person, i < list.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }, pressed && { opacity: 0.75 }]}
                      accessibilityRole="button"
                      accessibilityHint="Opens details. Long press to settle up."
                    >
                      <View style={[s.avatar, { backgroundColor: bg }]}>
                        <Text style={[s.avatarText, { color: fg }]}>{p.contact.displayName.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={s.nameRow}>
                          <Text style={[s.name, { color: ink }]} numberOfLines={1}>{p.contact.displayName}</Text>
                          {p.hasOverdue && (
                            <View style={[s.overdueTag, { backgroundColor: isDark ? 'rgba(224,49,49,0.2)' : '#FFE3E3' }]}>
                              <Text style={[s.overdueText, { color: red }]}>Overdue</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[s.meta, { color: muted }]} numberOfLines={1}>
                          {p.openLoansCount > 0 ? `${p.openLoansCount} open` : 'Settled'}
                          {p.lastActivityDate ? `, last ${p.lastActivityDate}` : ''}
                          {p.totalLentPending > 0 && p.totalBorrowedPending > 0 ? ', both ways' : ''}
                        </Text>
                      </View>
                      {p.netPosition !== 0 ? (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[s.amount, { color: owesYou ? green : red }]}>{formatPaise(Math.abs(p.netPosition))}</Text>
                          <Text style={[s.meta, { color: muted }]}>{owesYou ? 'owes you' : 'you owe'}</Text>
                        </View>
                      ) : (
                        <Feather name="check" size={18} color={green} />
                      )}
                    </Pressable>
                  );
                })}
              </Animated.View>
            )}
            <Text style={[s.hint, { color: muted }]}>Tap a person to see every entry. Long press to settle up.</Text>
          </>
        )}
      </ScrollView>

      <AddPeerLoanModal visible={addOpen} onClose={() => setAddOpen(false)} />
      {payment && (
        <RecordPeerPaymentModal
          visible
          onClose={() => setPayment(null)}
          contact={payment.contact}
          defaultDirection={payment.direction}
          pendingAmountPaise={payment.pendingPaise}
        />
      )}
    </View>
  );
};

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  hero: { marginTop: 10, borderRadius: 28, backgroundColor: FOREST, padding: 20, overflow: 'hidden' },
  heroRing: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 1, borderColor: 'rgba(184,243,107,0.16)', right: -80, top: -100 },
  heroLabel: { color: '#B5CEC1', fontSize: 13 },
  heroAmount: { fontSize: 40, letterSpacing: -1.2, marginTop: 4, fontVariant: ['tabular-nums'] },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 18 },
  tile: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 18, padding: 12, borderWidth: 1, borderColor: 'transparent' },
  tileOn: { borderColor: LIME },
  tileLabel: { color: '#B5CEC1', fontSize: 12 },
  tileValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  tileSub: { color: '#B5CEC1', fontSize: 12, marginTop: 2 },
  heroFoot: { color: '#B5CEC1', fontSize: 12, marginTop: 14, lineHeight: 17 },

  nudge: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, padding: 14, marginTop: 12 },
  nudgeAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  nudgeInitial: { fontSize: 16, fontWeight: '800' },
  nudgeText: { flex: 1, fontSize: 14, lineHeight: 19 },
  nudgeBtn: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  nudgeBtnText: { fontSize: 13, fontWeight: '700' },

  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, marginTop: 16 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  chips: { gap: 8, paddingTop: 16, paddingBottom: 12 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' },

  group: { borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '800' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  overdueTag: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  overdueText: { fontSize: 11, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  hint: { fontSize: 12, textAlign: 'center', paddingVertical: 14 },
  note: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 20, padding: 18 },
  noteText: { fontSize: 13, textAlign: 'center' },

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