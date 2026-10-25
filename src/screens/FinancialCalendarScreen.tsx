// src/screens/FinancialCalendarScreen.tsx
//
// Calendar: how this month is going, a spending heatmap, your no-spend streak,
// bills coming up, the selected day, and your all-time records.

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { useCalendarAnalytics } from '../hooks/useCalendarAnalytics';
import { useTheme } from '../store';
import { CategoryIcon } from '../components/CategoryIcon';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface FinancialCalendarScreenProps {
  navigation: any;
  route?: { params?: { userCreatedAt?: string | number } };
}

/** Local-time YYYY-MM-DD (toISOString uses UTC and shifts dates in India before 5:30 am). */
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const short = (n: number) => (n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : n >= 1000 ? `₹${(n / 1000).toFixed(1)}K` : `₹${Math.round(n)}`);

export const FinancialCalendarScreen: React.FC<FinancialCalendarScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const heading = { fontFamily: display, fontWeight: display ? undefined : ('800' as const) };

  const todayKey = keyOf(new Date());
  const [browsing, setBrowsing] = useState(new Date());
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [masked, setMasked] = useState(false);

  const { dailyDataMap, createdDateKey, recurringBillsByDayOfMonth, salaryCycleStats, records, toggleExcludeRecordTx, isTxExcluded } =
    useCalendarAnalytics(browsing, route?.params?.userCreatedAt);

  const peakDay = records.peakDay as any;
  const peakWeek = records.peakWeek as any;
  const bestMonth = records.bestSavingsMonth as any;

  const money = (v: number | null | undefined, sign = false) => {
    if (v === null || v === undefined || isNaN(v)) return '';
    if (masked) return '₹••••';
    const abs = `₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    return sign ? (v >= 0 ? `+${abs}` : `−${abs}`) : abs;
  };

  /* ---------------- Month data ---------------- */

  const year = browsing.getFullYear();
  const month = browsing.getMonth();
  const isThisMonth = year === new Date().getFullYear() && month === new Date().getMonth();
  const monthName = browsing.toLocaleDateString('en-IN', { month: 'long' });

  const { cells, stats, upcoming } = useMemo(() => {
    const first = new Date(year, month, 1).getDay();
    const total = new Date(year, month + 1, 0).getDate();
    const list: any[] = [];
    for (let i = 0; i < first; i++) list.push(null);

    let spent = 0;
    let earned = 0;
    let noSpendDays = 0;
    let elapsed = 0;
    let maxDebit = 0;
    const coming: { day: number; merchant: string; amount: number }[] = [];

    for (let d = 1; d <= total; d++) {
      const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const data = dailyDataMap.get(key);
      const debits = data?.debits || 0;
      const credits = data?.credits || 0;
      const past = key <= todayKey;
      const tracked = past && (!createdDateKey || key >= createdDateKey);
      maxDebit = Math.max(maxDebit, debits);
      if (tracked) {
        elapsed++;
        spent += debits;
        earned += credits;
        if (debits === 0) noSpendDays++;
      }
      if (!past) {
        (recurringBillsByDayOfMonth.get(d) || []).forEach((b: any) => coming.push({ day: d, merchant: b.merchant, amount: b.amount }));
      }
      list.push({ day: d, key, debits, credits, past, tracked, joined: createdDateKey === key, bills: !past ? recurringBillsByDayOfMonth.get(d) : undefined });
    }
    return {
      cells: list.map((c) => (c ? { ...c, heat: maxDebit > 0 ? Math.sqrt(c.debits / maxDebit) : 0 } : null)),
      stats: { spent, earned, noSpendDays, elapsed, avg: elapsed > 0 ? spent / elapsed : 0 },
      upcoming: coming.slice(0, 5),
    };
  }, [year, month, dailyDataMap, createdDateKey, recurringBillsByDayOfMonth, todayKey]);

  const selected = dailyDataMap.get(selectedKey);
  const selectedDate = dateOf(selectedKey);
  const selectedIsFuture = selectedKey > todayKey;

  // Streak message
  const cur = records.currentNoSpendStreak || 0;
  const best = records.longestNoSpendStreak || 0;
  const streakNudge =
    cur > 0 && cur >= best
      ? { title: `Your best streak ever: ${cur} day${cur === 1 ? '' : 's'}.`, text: 'Skip spending tomorrow to push it further.' }
      : cur > 0 && best > cur
        ? { title: `${best - cur + 1} more no-spend day${best - cur + 1 === 1 ? '' : 's'}`, text: 'beats your best streak.' }
        : null;

  /* ---------------- Theme ---------------- */

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const softGreen = isDark ? 'rgba(184,243,107,0.12)' : '#E3F2E8';
  const green = isDark ? LIME : '#0B6B3A';
  const red = isDark ? '#FFA8A8' : '#C92A2A';

  const goBack = () => (navigation?.canGoBack?.() ? navigation.goBack() : navigation?.navigate?.('Main'));
  const changeMonth = (delta: number) => setBrowsing(new Date(year, month + delta, 1));
  const jumpToday = () => {
    setBrowsing(new Date());
    setSelectedKey(todayKey);
  };

  /* ---------------- Render ---------------- */

  return (
    <View style={{ flex: 1, backgroundColor: pageBg, paddingTop: insets.top }}>
      <View style={s.header}>
        <Pressable onPress={goBack} style={[s.roundBtn, { backgroundColor: surface }]} accessibilityLabel="Back">
          <Feather name="arrow-left" size={20} color={ink} />
        </Pressable>
        <Text style={[s.headerTitle, { color: ink }]}>Calendar</Text>
        <Pressable onPress={() => setMasked((m) => !m)} style={[s.roundBtn, { backgroundColor: surface }]} accessibilityLabel={masked ? 'Show amounts' : 'Hide amounts'}>
          <Feather name={masked ? 'eye-off' : 'eye'} size={18} color={ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(380)} style={s.hero}>
          <View pointerEvents="none" style={s.heroRing} />
          <Text style={s.heroLabel}>{isThisMonth ? `Spent in ${monthName} so far` : `Spent in ${monthName}`}</Text>
          <Text style={[s.heroAmount, heading]} numberOfLines={1} adjustsFontSizeToFit>{money(stats.spent)}</Text>
          <Text style={s.heroSub}>
            {stats.elapsed > 0 ? `${money(stats.avg)} a day on average` : 'Nothing tracked yet this month'}
            {stats.earned > 0 ? `, ${money(stats.earned)} came in` : ''}
          </Text>
          <View style={s.tiles}>
            <View style={s.tile}>
              <Text style={s.tileLabel}>No-spend days</Text>
              <Text style={s.tileValue}>
                {stats.noSpendDays} <Text style={s.tileOf}>of {stats.elapsed}</Text>
              </Text>
            </View>
            <View style={s.tile}>
              <Text style={s.tileLabel}>Current streak</Text>
              <Text style={s.tileValue}>
                {cur} day{cur === 1 ? '' : 's'} {best > 0 ? <Text style={s.tileOf}>best {best}</Text> : null}
              </Text>
            </View>
          </View>
          {salaryCycleStats.payday !== null && salaryCycleStats.daysLeft !== null && (
            <View style={s.payday}>
              <Feather name="calendar" size={14} color={LIME} />
              <Text style={s.paydayText}>
                Payday on the {ordinal(salaryCycleStats.payday)}, in {salaryCycleStats.daysLeft} day{salaryCycleStats.daysLeft === 1 ? '' : 's'}.
                {salaryCycleStats.dailyAllowance !== null ? ` ${money(salaryCycleStats.dailyAllowance)} a day until then.` : ''}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Streak nudge */}
        {streakNudge && isThisMonth && (
          <Animated.View entering={FadeIn.duration(300)} style={[s.nudge, { backgroundColor: softGreen }]}>
            <View style={s.nudgeIcon}>
              <Feather name="shield" size={18} color={LIME} />
            </View>
            <Text style={[s.nudgeText, { color: ink }]}>
              <Text style={{ fontWeight: '700' }}>{streakNudge.title} </Text>
              {streakNudge.text}
            </Text>
          </Animated.View>
        )}

        {/* Month nav */}
        <View style={s.monthNav}>
          <Pressable onPress={() => changeMonth(-1)} style={[s.navBtn, { backgroundColor: surface }]} accessibilityLabel="Previous month">
            <Feather name="chevron-left" size={18} color={ink} />
          </Pressable>
          <Pressable onPress={jumpToday} accessibilityLabel="Go to today">
            <Text style={[s.monthTitle, { color: ink }, heading]}>
              {monthName} {year}
            </Text>
            {!isThisMonth && <Text style={[s.backToday, { color: green }]}>Back to today</Text>}
          </Pressable>
          <Pressable onPress={() => changeMonth(1)} style={[s.navBtn, { backgroundColor: surface }]} accessibilityLabel="Next month">
            <Feather name="chevron-right" size={18} color={ink} />
          </Pressable>
        </View>

        {/* Heatmap */}
        <View style={[s.calCard, { backgroundColor: surface, borderColor: line }]}>
          <View style={s.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[s.weekday, { color: muted }]}>{w}</Text>
            ))}
          </View>
          <View style={s.grid}>
            {cells.map((c: any, i: number) => {
              if (!c) return <View key={`pad-${i}`} style={s.cellWrap} />;
              const isSel = c.key === selectedKey;
              const isToday = c.key === todayKey;
              const hasSpend = c.debits > 0;
              const noSpend = c.tracked && !hasSpend;
              const alpha = hasSpend ? 0.14 + 0.6 * c.heat : 0;
              const strong = alpha > 0.5;
              const bg = hasSpend ? `rgba(224,49,49,${alpha.toFixed(2)})` : noSpend ? softGreen : isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF';
              const numColor = hasSpend ? (strong || isDark ? '#FFFFFF' : '#7A1D1D') : noSpend ? green : muted;
              return (
                <View key={c.key} style={s.cellWrap}>
                  <Pressable
                    onPress={() => setSelectedKey(c.key)}
                    style={[
                      s.cell,
                      { backgroundColor: bg },
                      !c.past && !hasSpend && { borderWidth: 1, borderColor: line },
                      isToday && !isSel && { borderWidth: 2, borderColor: isDark ? LIME : FOREST },
                      isSel && { borderWidth: 2.5, borderColor: isDark ? LIME : FOREST },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSel }}
                    accessibilityLabel={`${c.day} ${monthName}${hasSpend ? `, spent ${money(c.debits)}` : noSpend ? ', no spend' : ''}`}
                  >
                    <Text style={[s.cellNum, { color: numColor }, (isToday || isSel) && { fontWeight: '800' }]}>{c.day}</Text>
                    {hasSpend ? (
                      <Text style={[s.cellAmt, { color: numColor }]} numberOfLines={1}>{masked ? '••' : short(c.debits)}</Text>
                    ) : noSpend ? (
                      <View style={[s.noSpendDot, { backgroundColor: isDark ? LIME : '#16A34A' }]} />
                    ) : c.bills ? (
                      <Feather name="clock" size={10} color={muted} style={{ marginTop: 2 }} />
                    ) : null}
                    {c.credits > 0 && <View style={[s.creditDot, { backgroundColor: isDark ? LIME : '#16A34A' }]} />}
                    {c.joined && <Feather name="star" size={9} color="#F59F00" style={s.joinedStar} />}
                  </Pressable>
                </View>
              );
            })}
          </View>
          <View style={s.legend}>
            <View style={s.legendItem}>
              <View style={[s.legendSwatch, { backgroundColor: softGreen }]} />
              <Text style={[s.legendText, { color: muted }]}>No spend</Text>
            </View>
            <View style={s.legendItem}>
              <View style={s.legendRamp}>
                {[0.18, 0.35, 0.55, 0.74].map((a) => (
                  <View key={a} style={{ flex: 1, backgroundColor: `rgba(224,49,49,${a})` }} />
                ))}
              </View>
              <Text style={[s.legendText, { color: muted }]}>Less to more</Text>
            </View>
            <View style={s.legendItem}>
              <View style={[s.creditDot, { position: 'relative', top: 0, right: 0, backgroundColor: isDark ? LIME : '#16A34A' }]} />
              <Text style={[s.legendText, { color: muted }]}>Money in</Text>
            </View>
          </View>
        </View>

        {/* Selected day */}
        <Animated.View key={selectedKey} entering={FadeIn.duration(220)} style={[s.dayCard, { backgroundColor: surface, borderColor: line }]}>
          <View style={s.dayHead}>
            <Text style={[s.dayTitle, { color: ink }]}>
              {selectedDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
            {selected?.debits ? (
              <Text style={[s.dayTotal, { color: red }]}>{money(selected.debits)} spent</Text>
            ) : !selectedIsFuture ? (
              <Text style={[s.dayTotal, { color: green }]}>No spend</Text>
            ) : null}
          </View>
          {createdDateKey === selectedKey && <Text style={[s.joined, { color: '#B8860B' }]}>You joined Regent on this day</Text>}

          {selected?.txs?.length ? (
            selected.txs.map((tx: any, i: number) => {
              const isCredit = tx.type === 'credit';
              const excluded = isTxExcluded(tx.id);
              return (
                <View key={tx.id || i} style={[s.txRow, i < selected.txs.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}>
                  <CategoryIcon category={isCredit ? 'money_received' : tx.category || 'miscellaneous'} variant="soft" size={38} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.txName, { color: ink }]} numberOfLines={1}>{tx.merchant || (isCredit ? 'Money received' : 'Payment')}</Text>
                    {!isCredit && (
                      <Pressable onPress={() => toggleExcludeRecordTx(tx.id)} hitSlop={6}>
                        <Text style={[s.txExclude, { color: excluded ? red : muted }]}>
                          {excluded ? 'Ignored for records. Undo' : 'Ignore for records'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={[s.txAmt, { color: isCredit ? green : ink }]}>{money(isCredit ? Number(tx.amount) : -Number(tx.amount), true)}</Text>
                </View>
              );
            })
          ) : selectedIsFuture ? (
            <Text style={[s.dayEmpty, { color: muted }]}>
              {(recurringBillsByDayOfMonth.get(selectedDate.getDate()) || []).length > 0
                ? `Expected: ${(recurringBillsByDayOfMonth.get(selectedDate.getDate()) || []).map((b: any) => `${b.merchant} ${money(b.amount)}`).join(', ')}`
                : 'Nothing expected on this day.'}
            </Text>
          ) : (
            <View style={s.dayNoSpend}>
              <View style={[s.dayNoSpendIcon, { backgroundColor: softGreen }]}>
                <Feather name="shield" size={18} color={green} />
              </View>
              <Text style={[s.dayEmpty, { color: muted, flex: 1 }]}>
                {selectedKey === todayKey && cur > 0 ? `Nothing spent. That’s day ${cur} of your streak.` : 'Nothing spent on this day.'}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Coming up */}
        {upcoming.length > 0 && (
          <>
            <Text style={[s.section, { color: ink }]}>Coming up this month</Text>
            <View style={[s.listCard, { backgroundColor: surface, borderColor: line }]}>
              {upcoming.map((b, i) => (
                <View key={`${b.day}-${i}`} style={[s.billRow, i < upcoming.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}>
                  <View style={[s.billDate, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F2' }]}>
                    <Text style={[s.billDay, { color: ink }]}>{b.day}</Text>
                    <Text style={[s.billMon, { color: muted }]}>{browsing.toLocaleDateString('en-IN', { month: 'short' })}</Text>
                  </View>
                  <Text style={[s.billName, { color: ink }]} numberOfLines={1}>{b.merchant}</Text>
                  <Text style={[s.billAmt, { color: ink }]}>{money(b.amount)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Records */}
        <Text style={[s.section, { color: ink }]}>Your records</Text>
        <View style={s.recordGrid}>
          {[
            { label: 'Longest no-spend streak', value: best > 0 ? `${best} day${best === 1 ? '' : 's'}` : null, sub: cur > 0 ? `${cur} going now` : undefined },
            { label: 'Best savings month', value: bestMonth ? `${bestMonth.rate}%` : null, sub: bestMonth ? `${bestMonth.monthKey}, saved ${money(bestMonth.saved)}` : undefined },
            { label: 'Biggest day', value: peakDay?.amount > 0 ? money(peakDay.amount) : null, sub: peakDay?.amount > 0 ? `${peakDay.date}${peakDay.tx?.merchant ? `, ${peakDay.tx.merchant}` : ''}` : undefined },
            { label: 'Biggest week', value: peakWeek?.spent > 0 ? money(peakWeek.spent) : null, sub: peakWeek?.spent > 0 ? peakWeek.weekKey : undefined },
          ].map((r, i) => (
            <Animated.View key={r.label} entering={FadeInDown.delay(i * 60).duration(360)} style={[s.recordCard, { backgroundColor: surface, borderColor: line }]}>
              <Text style={[s.recordLabel, { color: muted }]}>{r.label}</Text>
              <Text style={[s.recordValue, { color: r.value ? ink : muted }, heading]} numberOfLines={1} adjustsFontSizeToFit>
                {r.value || 'Not yet'}
              </Text>
              {r.sub ? <Text style={[s.recordSub, { color: muted }]} numberOfLines={2}>{r.sub}</Text> : null}
            </Animated.View>
          ))}
        </View>

        {/* Month by month */}
        {records.monthRows.length > 0 && (
          <>
            <Text style={[s.section, { color: ink }]}>Month by month</Text>
            <View style={[s.listCard, { backgroundColor: surface, borderColor: line }]}>
              {records.monthRows.map((row: any, i: number) => {
                const rate = Math.max(0, Math.min(100, row.savingsRate || 0));
                return (
                  <View key={row.monthKey} style={[s.monthRowItem, i < records.monthRows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}>
                    <View style={s.monthRowTop}>
                      <Text style={[s.monthRowName, { color: ink }]}>{row.monthLabel}</Text>
                      <Text style={[s.monthRowRate, { color: rate >= 30 ? green : muted }]}>{row.savingsRate}% saved</Text>
                    </View>
                    <View style={[s.rateTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EDF2EF' }]}>
                      <View style={[s.rateFill, { width: `${rate}%`, backgroundColor: isDark ? LIME : '#16A34A' }]} />
                    </View>
                    <Text style={[s.monthRowSub, { color: muted }]}>
                      {money(row.spent)} out, {money(row.earned)} in
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
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
  heroAmount: { color: '#FFFFFF', fontSize: 40, letterSpacing: -1.2, marginTop: 4, fontVariant: ['tabular-nums'] },
  heroSub: { color: '#D9E7DF', fontSize: 14 },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 18 },
  tile: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 18, padding: 12 },
  tileLabel: { color: '#B5CEC1', fontSize: 12 },
  tileValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 2 },
  tileOf: { color: '#B5CEC1', fontSize: 13, fontWeight: '500' },
  payday: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14 },
  paydayText: { flex: 1, color: '#D9E7DF', fontSize: 13, lineHeight: 18 },

  nudge: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, padding: 14, marginTop: 12 },
  nudgeIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: FOREST, alignItems: 'center', justifyContent: 'center' },
  nudgeText: { flex: 1, fontSize: 14, lineHeight: 19 },

  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 22, paddingBottom: 12 },
  navBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 20, letterSpacing: -0.3, textAlign: 'center' },
  backToday: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 2 },

  calCard: { borderWidth: 1, borderRadius: 24, paddingHorizontal: 8, paddingVertical: 14 },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellWrap: { width: `${100 / 7}%`, padding: 3 },
  cell: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cellNum: { fontSize: 13, fontWeight: '700' },
  cellAmt: { fontSize: 9, fontWeight: '700', marginTop: 1, fontVariant: ['tabular-nums'] },
  noSpendDot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
  creditDot: { position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 3 },
  joinedStar: { position: 'absolute', top: 4, left: 4 },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 12, height: 12, borderRadius: 4 },
  legendRamp: { flexDirection: 'row', width: 32, height: 12, borderRadius: 4, overflow: 'hidden' },
  legendText: { fontSize: 12 },

  dayCard: { borderWidth: 1, borderRadius: 24, padding: 16, marginTop: 12 },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  dayTitle: { fontSize: 16, fontWeight: '700' },
  dayTotal: { fontSize: 13, fontWeight: '700' },
  joined: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  txName: { fontSize: 15, fontWeight: '600' },
  txExclude: { fontSize: 12, marginTop: 2 },
  txAmt: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dayEmpty: { fontSize: 14, lineHeight: 20, marginTop: 10 },
  dayNoSpend: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  dayNoSpendIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 4 },

  section: { fontSize: 15, fontWeight: '700', paddingHorizontal: 4, paddingTop: 22, paddingBottom: 10 },
  listCard: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 16 },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  billDate: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  billDay: { fontSize: 15, fontWeight: '800' },
  billMon: { fontSize: 10, fontWeight: '600' },
  billName: { flex: 1, fontSize: 15, fontWeight: '600' },
  billAmt: { fontSize: 15, fontWeight: '700' },

  recordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  recordCard: { width: '48.5%', borderWidth: 1, borderRadius: 20, padding: 14 },
  recordLabel: { fontSize: 12 },
  recordValue: { fontSize: 22, letterSpacing: -0.4, marginTop: 4 },
  recordSub: { fontSize: 12, marginTop: 2 },

  monthRowItem: { paddingVertical: 12 },
  monthRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  monthRowName: { fontSize: 15, fontWeight: '600' },
  monthRowRate: { fontSize: 13, fontWeight: '700' },
  rateTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 8 },
  rateFill: { height: 6, borderRadius: 3 },
  monthRowSub: { fontSize: 12, marginTop: 6 },
});