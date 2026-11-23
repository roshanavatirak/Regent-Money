// src/screens/NetWorthScreen.tsx
//
// Net worth: what you have today, how it got there and how it compares with before.
// Three tabs: Overview (curve, what changed, where it sits, health), Compare (then vs now)
// and History (month by month). All numbers come from utils/netWorth via useNetWorth.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  LayoutChangeEvent,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Svg, { Circle, Line as SvgLine, Path } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetWorth, NetWorthData } from '../hooks/useNetWorth';
import { useSyncDb } from '../services/useSyncDb';
import { syncService } from '../services/syncService';
import { isCashProfile } from '../services/cashService';
import { maskAccount, toActivityBank } from '../hooks/useActivityFeed';
import { BankIcon } from '../components/BankIcon';
import {
  AdminFont,
  AdminPalette,
  CORAL,
  FOREST,
  FOREST_RAISED,
  HeroRings,
  LILAC,
  LIME,
  MIST,
  SectionLabel,
  Segmented,
  ff,
  useAdminTheme,
} from '../features/admin/adminTheme';
import {
  DAY_MS,
  MonthRow,
  SeriesPoint,
  accountChanges,
  bridgeSince,
  flowTotals,
  health,
  monthStartOf,
  monthStartsSince,
  milestonePlan,
  type PacePoint,
  monthsUntil,
  MIN_ESTIMATE_PERIODS,
  type MilestonePlan,
  periodPace,
  periodRows,
  rangeStats,
} from '../utils/netWorth';
import { useMoneyCycle } from '../hooks/useMoneyCycle';
import { DateTimePickerSheet } from '../components/DateTimePickerSheet';
import { regentRead } from '../utils/regentRead';
import { useNetWorthMilestone, type NetWorthMilestone } from '../features/netWorth/milestoneStore';
import { cycleStartsSince, isTransitionCycle } from '../utils/moneyCycle';

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

const HiddenContext = createContext(false);
const MASK = '₹ •••••';

const rupees = (minor: number) => `₹${(Math.abs(minor) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "₹1,250.00", or with `signed` "+₹1,250.00" / "−₹1,250.00". Negative values always carry the minus. */
const useMoney = () => {
  const hidden = useContext(HiddenContext);
  return useCallback(
    (minor: number, signed = false) => {
      if (hidden) return MASK;
      const sign = minor < 0 ? '−' : signed && minor > 0 ? '+' : '';
      return `${sign}${rupees(minor)}`;
    },
    [hidden],
  );
};

/** Short figure for chart labels: 950, 3.7k, 1.2L, 2.4Cr. */
const compact = (minor: number) => {
  const v = Math.abs(minor) / 100;
  const sign = minor < 0 ? '−' : '+';
  if (v >= 1e7) return `${sign}${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `${sign}${(v / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `${sign}${(v / 1e3).toFixed(1)}k`;
  return `${sign}${Math.round(v)}`;
};

const pctText = (pct: number | null) => (pct === null ? '' : `${Math.abs(pct).toFixed(1)}%`);
const dayMonth = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const dayMonthYear = (ts: number) =>
  new Date(ts).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
const monthName = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { month: 'long' });
const monthShort = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { month: 'short' });
const monthYear = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The periods growth is measured in: calendar months, or salary cycles (salary day to the day
 * before the next) when the user has set a salary day.
 */
interface Periods {
  unit: 'month' | 'cycle';
  /** "month" or "cycle". */
  word: string;
  /** Period starts, oldest first; the last is the current period. */
  starts: number[];
  /** "November" / "the cycle from 31 Oct", for sentences. */
  name: (start: number) => string;
  /** "November 2026" / "Cycle from 31 Oct", for row titles. */
  title: (start: number) => string;
  /** "Nov" / "31 Oct", for axis labels. */
  short: (start: number) => string;
}

const calendarPeriods = (starts: number[]): Periods => ({
  unit: 'month',
  word: 'month',
  starts,
  name: monthName,
  title: monthYear,
  short: monthShort,
});

const cyclePeriods = (starts: number[]): Periods => ({
  unit: 'cycle',
  word: 'cycle',
  starts,
  name: (ts) => `the cycle from ${dayMonth(ts)}`,
  title: (ts) => `Cycle from ${dayMonth(ts)}`,
  short: dayMonth,
});

const PeriodContext = createContext<Periods>(calendarPeriods([]));
const usePeriods = () => useContext(PeriodContext);

/** "HDFC Bank Ltd" reads as "HDFC Bank"; names are otherwise shown as saved. */
const shortBankName = (name: string) =>
  name
    .replace(/\b(ltd|limited)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || name;

/** The same calendar day `months` months earlier (clamped to that month's last day). */
const monthsAgo = (ts: number, months: number) => {
  const d = new Date(ts);
  const target = new Date(d.getFullYear(), d.getMonth() - months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  target.setHours(d.getHours(), d.getMinutes(), 0, 0);
  return target.getTime();
};

type Theme = { p: AdminPalette; font: AdminFont; isDark: boolean };

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

const Card: React.FC<{
  theme: Theme;
  children: React.ReactNode;
  tight?: boolean;
}> = ({ theme, children, tight }) => (
  <View style={[styles.card, { backgroundColor: theme.p.card, borderColor: theme.p.line }, tight && { paddingBottom: 6 }]}>{children}</View>
);

const CardTitle: React.FC<{ theme: Theme; title: string; sub?: string }> = ({ theme, title, sub }) => (
  <View>
    <Text style={[styles.cardTitle, { color: theme.p.text }, ff(theme.font.displayBold, '700')]}>{title}</Text>
    {sub ? <Text style={[styles.cardSub, { color: theme.p.sub }, ff(theme.font.body, '500')]}>{sub}</Text> : null}
  </View>
);

const HeroTile: React.FC<{
  font: AdminFont;
  label: string;
  value: string;
  note: string;
  noteColor?: string;
}> = ({ font, label, value, note, noteColor = MIST }) => (
  <View style={styles.heroTile}>
    <Text style={[{ fontSize: 12, color: MIST }, ff(font.body, '500')]}>{label}</Text>
    <Text style={[{ fontSize: 18, color: '#FFFFFF', marginTop: 4 }, ff(font.displayBold, '700')]} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
    <Text style={[{ fontSize: 11, color: noteColor, marginTop: 2 }, ff(font.bodySemi, '600')]} numberOfLines={1}>
      {note}
    </Text>
  </View>
);

/* ------------------------------------------------------------------ */
/* Hero curve                                                          */
/* ------------------------------------------------------------------ */

const CHART_H = 140;

/** Keeps at most `max` points, always including the first and last. */
const thin = (points: SeriesPoint[], max = 120): SeriesPoint[] => {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
};

const HeroCurve: React.FC<{
  points: SeriesPoint[];
  low: SeriesPoint;
  font: AdminFont;
  /** The day picked on the chart; it stays picked after the finger lifts. */
  selected: SeriesPoint | null;
  onSelect: (point: SeriesPoint | null) => void;
}> = ({ points, low, font, selected, onSelect }) => {
  const [width, setWidth] = useState(0);
  const data = useMemo(() => thin(points), [points]);
  const found = selected ? data.findIndex((d) => d.ts === selected.ts) : -1;
  const active = found >= 0 ? found : null;
  // Tapping the picked day again (without dragging) clears it
  const touch = useRef<{
    startIdx: number | null;
    wasActive: boolean;
    moved: boolean;
  }>({ startIdx: null, wasActive: false, moved: false });

  const geo = useMemo(() => {
    if (width <= 0 || data.length < 2) return null;
    const usable = width - 14;
    const values = data.map((d) => d.minor);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const t0 = data[0].ts;
    const tSpan = data[data.length - 1].ts - t0 || 1;
    const xy = data.map((d) => ({
      x: ((d.ts - t0) / tSpan) * usable,
      y: max === min ? CHART_H / 2 : 14 + (1 - (d.minor - min) / span) * (CHART_H - 28),
    }));
    const line = xy.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
    const lowX = ((low.ts - t0) / tSpan) * usable;
    const lowY = max === min ? CHART_H / 2 : 14 + (1 - (low.minor - min) / span) * (CHART_H - 28);
    return {
      xy,
      line,
      area: `${line} L${xy[xy.length - 1].x.toFixed(1)},${CHART_H} L0,${CHART_H} Z`,
      usable,
      lowX,
      lowY,
    };
  }, [data, width, low]);

  const nearest = (x: number): number | null => {
    if (!geo) return null;
    let best = 0;
    for (let i = 1; i < geo.xy.length; i++) {
      if (Math.abs(geo.xy[i].x - x) < Math.abs(geo.xy[best].x - x)) best = i;
    }
    return best;
  };
  const pick = (i: number | null) => {
    if (i === null || i === active) return;
    Haptics.selectionAsync().catch(() => {});
    onSelect(data[i]);
  };
  const grant = (x: number) => {
    const i = nearest(x);
    touch.current = {
      startIdx: i,
      wasActive: i !== null && i === active,
      moved: false,
    };
    pick(i);
  };
  const move = (x: number) => {
    const i = nearest(x);
    if (i !== touch.current.startIdx) touch.current.moved = true;
    pick(i);
  };
  // Lifting the finger keeps the day picked (today is already shown at the top)
  const release = () => {
    if (touch.current.wasActive && !touch.current.moved) onSelect(null);
  };

  const last = geo ? geo.xy[geo.xy.length - 1] : null;
  const mid = data[Math.floor(data.length / 2)];

  return (
    <View>
      <View
        style={{ height: CHART_H, marginTop: 16 }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => grant(e.nativeEvent.locationX)}
        onResponderMove={(e) => move(e.nativeEvent.locationX)}
        onResponderRelease={release}
        accessibilityRole="image"
        accessibilityLabel={`Net worth from ${dayMonth(data[0].ts)} to today. Tap or drag to read any day; tap it again to clear.`}
      >
        {geo && last ? (
          <Svg width={width} height={CHART_H} pointerEvents="none">
            {[30, 75, 120].map((y) => (
              <SvgLine key={y} x1={0} y1={y} x2={width} y2={y} stroke="rgba(181,206,193,0.14)" strokeDasharray="3 5" />
            ))}
            <Path d={geo.area} fill="rgba(184,243,107,0.10)" />
            <Path d={geo.line} stroke={LIME} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {low.ts !== data[data.length - 1].ts && low.ts !== data[0].ts ? (
              <Circle cx={geo.lowX} cy={geo.lowY} r={4} fill={FOREST} stroke={CORAL} strokeWidth={2} />
            ) : null}
            {active !== null ? (
              <>
                <SvgLine x1={geo.xy[active].x} y1={4} x2={geo.xy[active].x} y2={CHART_H} stroke="rgba(255,255,255,0.45)" strokeDasharray="2 4" />
                <Circle cx={geo.xy[active].x} cy={geo.xy[active].y} r={6} fill="#FFFFFF" stroke={FOREST} strokeWidth={2.5} />
                <Circle cx={last.x} cy={last.y} r={3} fill={LIME} fillOpacity={0.6} />
              </>
            ) : (
              <>
                <Circle cx={last.x} cy={last.y} r={10} stroke={LIME} strokeOpacity={0.35} strokeWidth={2} fill="none" />
                <Circle cx={last.x} cy={last.y} r={5} fill={LIME} />
              </>
            )}
          </Svg>
        ) : null}
      </View>
      <View style={styles.axisRow}>
        <Text style={[styles.axisText, ff(font.body, '500')]}>{dayMonth(data[0].ts)}</Text>
        {data.length > 4 ? <Text style={[styles.axisText, ff(font.body, '500')]}>{dayMonth(mid.ts)}</Text> : null}
        <Text style={[styles.axisText, { color: LIME }, ff(font.bodyBold, '700')]}>Now</Text>
      </View>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

const RANGES = [
  { id: '1M', label: '1M', months: 1 },
  { id: '3M', label: '3M', months: 3 },
  { id: '6M', label: '6M', months: 6 },
  { id: '1Y', label: '1Y', months: 12 },
  { id: 'ALL', label: 'All', months: 0 },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

const Hero: React.FC<{ data: NetWorthData; theme: Theme }> = ({ data, theme }) => {
  const { model } = data;
  const { font } = theme;
  const money = useMoney();
  const hidden = useContext(HiddenContext);
  const [range, setRange] = useState<RangeId>('6M');
  const [picked, setScrub] = useState<SeriesPoint | null>(null);

  const stats = useMemo(() => {
    const months = RANGES.find((r) => r.id === range)!.months;
    return rangeStats(model, months === 0 ? 0 : monthsAgo(model.now, months));
  }, [model, range]);

  // A picked day that has dropped out of the curve (range or data changed) no longer counts
  const scrub = picked && stats.points.some((p) => p.ts === picked.ts) ? picked : null;
  const hasHistory = model.daysTracked >= 1;
  const up = stats.changeMinor >= 0;
  // The top number is always today; a picked day shows in the pill row instead
  const shown = model.liveMinor;
  const sinceThen = scrub ? model.liveMinor - scrub.minor : 0;
  const abs = Math.abs(shown);
  const whole = Math.floor(abs / 100).toLocaleString('en-IN');
  const paise = `.${String(abs % 100).padStart(2, '0')}`;

  return (
    <View style={styles.hero}>
      <HeroRings />
      <View style={styles.rowBetween}>
        <Text style={[{ fontSize: 14, color: MIST }, ff(font.bodySemi, '600')]}>Net worth today</Text>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={[{ fontSize: 11, color: LIME, letterSpacing: 0.4 }, ff(font.bodyBold, '700')]}>LIVE</Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        {hidden ? (
          <Text style={[styles.amount, ff(font.display, '800')]}>{MASK}</Text>
        ) : (
          <>
            <Text style={[styles.amount, ff(font.display, '800')]} numberOfLines={1} adjustsFontSizeToFit>
              {shown < 0 ? '−' : ''}₹{whole}
            </Text>
            <Text style={[styles.paise, ff(font.displayBold, '700')]}>{paise}</Text>
          </>
        )}
      </View>

      {hasHistory && scrub ? (
        <View style={styles.deltaRow} accessibilityLiveRegion="polite">
          <View style={styles.pickedPill}>
            <Text style={[{ fontSize: 12, color: '#0B1F17' }, ff(font.bodyBold, '700')]}>
              {dayMonth(scrub.ts)} · {money(scrub.minor)}
            </Text>
          </View>
          {sinceThen !== 0 ? (
            <Text style={[{ fontSize: 12.5, color: sinceThen > 0 ? LIME : CORAL }, ff(font.bodyBold, '700')]}>{money(sinceThen, true)}</Text>
          ) : null}
          <Text style={[{ fontSize: 12, color: MIST }, ff(font.body, '500')]}>{sinceThen === 0 ? 'same as today' : 'since then'}</Text>
        </View>
      ) : hasHistory ? (
        <View style={styles.deltaRow}>
          <View style={[styles.deltaPill, !up && { backgroundColor: CORAL }]}>
            <Feather name={up ? 'arrow-up-right' : 'arrow-down-right'} size={13} color={up ? FOREST : '#3A0D00'} />
            <Text style={[{ fontSize: 12, color: up ? FOREST : '#3A0D00' }, ff(font.bodyBold, '700')]}>
              {money(stats.changeMinor, true)}
              {stats.pct !== null && !hidden ? ` (${pctText(stats.pct)})` : ''}
            </Text>
          </View>
          <Text style={[{ fontSize: 12, color: MIST }, ff(font.body, '500')]}>since {dayMonth(stats.fromTs)}</Text>
        </View>
      ) : (
        <View style={styles.sincePill}>
          <Feather name="clock" size={12} color={MIST} />
          <Text style={[{ fontSize: 12, color: '#FFFFFF' }, ff(font.bodySemi, '600')]}>Tracking since today</Text>
        </View>
      )}

      {hasHistory ? (
        <>
          <HeroCurve points={stats.points} low={stats.low} font={font} selected={scrub} onSelect={setScrub} />

          <View style={styles.rangeRow} accessibilityRole="tablist">
            {RANGES.map((r) => {
              const on = r.id === range;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => {
                    setRange(r.id);
                    setScrub(null);
                  }}
                  style={[styles.rangeBtn, on && { backgroundColor: LIME }]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={r.months ? `Last ${plural(r.months, 'month')}` : 'All time'}
                >
                  <Text style={[{ fontSize: 12.5, color: on ? FOREST : MIST }, ff(on ? font.bodyBold : font.bodySemi, on ? '700' : '600')]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.heroTiles}>
            <HeroTile
              font={font}
              label="Highest"
              value={money(stats.high.minor)}
              note={stats.high.ts === model.now ? 'Today, a new peak' : dayMonth(stats.high.ts)}
              noteColor={stats.high.ts === model.now ? LIME : MIST}
            />
            <HeroTile font={font} label="Lowest" value={money(stats.low.minor)} note={dayMonth(stats.low.ts)} />
          </View>
        </>
      ) : (
        <View style={styles.startTile}>
          <Text style={[{ fontSize: 14, color: '#FFFFFF' }, ff(font.bodySemi, '600')]}>Your curve starts here</Text>
          <Text style={[{ fontSize: 13, color: MIST, marginTop: 4, lineHeight: 18 }, ff(font.body, '500')]}>
            As your balances move, each day is added to the curve. Tomorrow you will see your first change.
          </Text>
        </View>
      )}
    </View>
  );
};

/** Height of the step blocks area, and the room above it for the amount labels. */
const STEP_H = 180;
const STEP_TOP = 22;
const STEP_GAP = 8;

type Step = {
  key: string;
  label: string;
  amount: string;
  amountColor: string;
  from: number;
  to: number;
  color: string;
  bold?: boolean;
};

/**
 * "What changed" as steps you read left to right: before → + came in → − spent → − moved → now.
 * Each block starts where the one before it ended, so the change shows without reading.
 */
const WhatChanged: React.FC<{ data: NetWorthData; theme: Theme }> = ({ data, theme }) => {
  const { model, flows } = data;
  const { p, font, isDark } = theme;
  const money = useMoney();
  const hidden = useContext(HiddenContext);
  const per = usePeriods();
  const isCycle = per.unit === 'cycle' && per.starts.length > 0;
  const periodStart = isCycle ? per.starts[per.starts.length - 1] : monthStartOf(model.now);
  const bridge = useMemo(() => bridgeSince(model, flows, periodStart), [model, flows, periodStart]);

  // Whole rupees on the steps: the columns are narrow
  const short = (minor: number, signed = false) => {
    if (hidden) return '•••';
    const sign = minor < 0 ? '−' : signed && minor > 0 ? '+' : '';
    return `${sign}₹${Math.round(Math.abs(minor) / 100).toLocaleString('en-IN')}`;
  };

  const afterIn = bridge.startMinor + bridge.inMinor;
  const afterOut = afterIn - bridge.outMinor;
  const afterMoved = afterOut + bridge.movedMinor;
  const showMoved = Math.abs(bridge.movedMinor) >= 100;
  const showUntracked = Math.abs(bridge.untrackedMinor) >= 100;
  // What stayed = Now − Before (came in − spent − moved), so it always matches the steps above
  const kept = bridge.nowMinor - bridge.startMinor;
  const keptPct = bridge.inMinor > 0 && kept >= 0 ? Math.round((kept / bridge.inMinor) * 100) : null;

  const steps: Step[] = [
    {
      key: 'start',
      label: 'Before',
      amount: short(bridge.startMinor),
      amountColor: p.sub,
      from: 0,
      to: bridge.startMinor,
      color: isDark ? '#5E7D6E' : '#C9D9D0',
    },
    {
      key: 'in',
      label: 'Came in',
      amount: short(bridge.inMinor, true),
      amountColor: p.link,
      from: bridge.startMinor,
      to: afterIn,
      color: p.success,
    },
    {
      key: 'out',
      label: 'Spent',
      amount: short(-bridge.outMinor, true),
      amountColor: p.danger,
      from: afterIn,
      to: afterOut,
      color: CORAL,
    },
    ...(showMoved
      ? [
          {
            key: 'moved',
            label: 'Moved',
            amount: short(bridge.movedMinor, true),
            amountColor: p.sub,
            from: afterOut,
            to: afterMoved,
            color: LILAC,
          },
        ]
      : []),
    ...(showUntracked
      ? [
          {
            key: 'untracked',
            label: 'Untracked',
            amount: short(bridge.untrackedMinor, true),
            amountColor: p.tint.amber.fg,
            from: afterMoved,
            to: bridge.nowMinor,
            color: '#FFB020',
          },
        ]
      : []),
    {
      key: 'now',
      label: 'Now',
      amount: short(bridge.nowMinor),
      amountColor: p.text,
      from: 0,
      to: bridge.nowMinor,
      color: isDark ? LIME : FOREST,
      bold: true,
    },
  ];

  const levels = steps.flatMap((s) => [s.from, s.to]);
  const lo = Math.min(...levels);
  const hi = Math.max(...levels);
  const span = hi - lo || 1;
  const y = (v: number) => STEP_TOP + ((hi - v) / span) * STEP_H;

  const summary = steps.map((s) => `${s.label} ${s.amount}, total ${short(s.to)}`).join('; ');

  return (
    <Card theme={theme}>
      <CardTitle theme={theme} title={isCycle ? 'This salary cycle' : `This month`} sub={`${dayMonth(bridge.fromTs)} → today`} />

      <View style={[styles.rowBetween, { marginTop: 16, alignItems: 'flex-end' }]}>
        <View>
          <Text style={[{ fontSize: 12, color: p.sub }, ff(font.body, '500')]}>{isCycle ? 'Before salary' : `On ${dayMonth(bridge.fromTs)}`}</Text>
          <Text style={[{ fontSize: 16, color: p.text, marginTop: 2 }, ff(font.bodyBold, '700')]}>{short(bridge.startMinor)}</Text>
        </View>
        <Feather name="arrow-right" size={18} color={p.sub} style={{ marginBottom: 4 }} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[{ fontSize: 12, color: p.sub }, ff(font.body, '500')]}>Now</Text>
          <Text style={[{ fontSize: 24, color: isDark ? LIME : FOREST, marginTop: 2 }, ff(font.display, '800')]}>{short(bridge.nowMinor)}</Text>
        </View>
      </View>

      <View style={styles.stepRow} accessible accessibilityRole="image" accessibilityLabel={summary}>
        {steps.map((s, i) => {
          const top = y(Math.max(s.from, s.to));
          // Before and Now are totals (shown below), so only the steps between get a change on top
          const showChange = s.key !== 'start' && s.key !== 'now';
          const height = Math.max(6, (Math.abs(s.to - s.from) / span) * STEP_H);
          return (
            <View key={s.key} style={{ flex: 1 }}>
              <View style={{ height: STEP_TOP + STEP_H }}>
                {i > 0 ? (
                  // Thin link from where the step before ended
                  <View style={[styles.stepLink, { top: y(s.from), borderTopColor: p.line }]} />
                ) : null}
                {showChange ? (
                  <Text style={[styles.stepAmount, { top: top - 18, color: s.amountColor }, ff(font.bodyBold, '700')]} numberOfLines={1} adjustsFontSizeToFit>
                    {s.amount}
                  </Text>
                ) : null}
                <View style={[styles.stepBlock, { top, height, backgroundColor: s.color }]} />
              </View>
              <Text
                style={[
                  {
                    fontSize: 11.5,
                    color: s.bold ? p.text : p.sub,
                    textAlign: 'center',
                    marginTop: 8,
                  },
                  ff(s.bold ? font.bodyBold : font.body, s.bold ? '700' : '500'),
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {s.label}
              </Text>
              {/* What you had after this step: ₹5,985 → ₹39,286 → ₹27,639 → ₹25,439 */}
              <Text
                style={[
                  {
                    fontSize: 12,
                    color: s.bold ? (isDark ? LIME : FOREST) : p.text,
                    textAlign: 'center',
                    marginTop: 2,
                  },
                  ff(font.bodyBold, '700'),
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {short(s.to)}
              </Text>
            </View>
          );
        })}
      </View>

      {bridge.inMinor > 0 || bridge.outMinor > 0 ? (
        <View style={[styles.keptBox, { backgroundColor: isDark ? 'rgba(184,243,107,0.12)' : '#EAF7DA' }]}>
          <Text style={[{ flex: 1, fontSize: 14, color: p.text }, ff(font.body, '500')]}>
            {kept >= 0 ? (
              <>
                <Text style={ff(font.bodyBold, '800')}>{short(kept)}</Text>
                {` stayed with you of ${short(bridge.inMinor)}`}
              </>
            ) : (
              <>
                {'Your money went down by '}
                <Text style={ff(font.bodyBold, '800')}>{short(-kept)}</Text>
              </>
            )}
          </Text>
          {keptPct !== null && !hidden ? (
            <View style={[styles.keptChip, { backgroundColor: isDark ? LIME : FOREST }]}>
              <Text style={[{ fontSize: 12, color: isDark ? FOREST : LIME }, ff(font.bodyBold, '700')]}>{keptPct}%</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {showMoved || showUntracked ? (
        <Text style={[{ fontSize: 12, color: p.sub, marginTop: 10, lineHeight: 17 }, ff(font.body, '500')]}>
          {showMoved ? 'Moved = transfers, loans and card bills. Not spending.' : ''}
          {showMoved && showUntracked ? '\n' : ''}
          {showUntracked ? 'Untracked = a balance change with no transaction recorded.' : ''}
        </Text>
      ) : null}
    </Card>
  );
};

const SHARE_COLORS_LIGHT = [FOREST, '#4FA37A', LIME, '#1450A3', '#FFB020', '#8FA89B'];
const SHARE_COLORS_DARK = [LIME, '#4FA37A', '#93C5FD', '#FFD27A', '#B5CEC1', '#5E7D6E'];

const WhereItSits: React.FC<{
  data: NetWorthData;
  theme: Theme;
  onOpenBorrowLend: () => void;
}> = ({ data, theme, onOpenBorrowLend }) => {
  const { accounts, lentMinor, borrowedMinor } = data;
  const { p, font, isDark } = theme;
  const money = useMoney();
  const palette = isDark ? SHARE_COLORS_DARK : SHARE_COLORS_LIGHT;

  const assets = [
    ...accounts.map((a, i) => {
      const cash = isCashProfile(a.bank);
      return {
        key: a.id,
        name: cash ? 'Cash wallet' : shortBankName(a.bank.bankName),
        sub: cash ? 'Cash in hand' : `${a.bank.accountType || 'Account'} ${maskAccount(a.bank.accountNumberSuffix)}`,
        minor: a.balanceMinor,
        color: palette[i % palette.length],
        bank: toActivityBank(a.bank) as { code: string; bankName: string } | undefined,
        icon: undefined as keyof typeof Feather.glyphMap | undefined,
        onPress: undefined as (() => void) | undefined,
      };
    }),
    ...(lentMinor > 0
      ? [
          {
            key: 'lent',
            name: 'Lent to others',
            sub: 'From Borrow & Lend',
            minor: lentMinor,
            color: LILAC,
            bank: undefined,
            icon: 'users' as keyof typeof Feather.glyphMap | undefined,
            onPress: onOpenBorrowLend as (() => void) | undefined,
          },
        ]
      : []),
  ];
  const owned = assets.reduce((s, a) => s + Math.max(0, a.minor), 0);
  const share = (minor: number) => (owned > 0 && minor > 0 ? `${((minor / owned) * 100).toFixed(1)}%` : '');

  if (assets.length === 0 && borrowedMinor === 0) {
    return (
      <Card theme={theme}>
        <CardTitle theme={theme} title="Where it sits" sub="Link an account to see where your money is." />
      </Card>
    );
  }

  const rows = [
    ...assets,
    ...(borrowedMinor > 0
      ? [
          {
            key: 'borrowed',
            name: 'Borrowed',
            sub: 'You owe this, so it is taken off',
            minor: -borrowedMinor,
            color: CORAL,
            bank: undefined,
            icon: 'arrow-down-left' as keyof typeof Feather.glyphMap | undefined,
            onPress: onOpenBorrowLend as (() => void) | undefined,
          },
        ]
      : []),
  ];

  return (
    <Card theme={theme} tight>
      <CardTitle
        theme={theme}
        title="Where it sits"
        sub={borrowedMinor > 0 ? `You own ${money(owned)} · you owe ${money(borrowedMinor)}` : `Across ${plural(assets.length, 'place')}`}
      />
      {owned > 0 ? (
        <View style={styles.shareBar}>
          {assets
            .filter((a) => a.minor > 0)
            .map((a) => (
              <View
                key={a.key}
                style={{
                  flex: a.minor / owned,
                  minWidth: 4,
                  backgroundColor: a.color,
                  borderRadius: 4,
                }}
              />
            ))}
        </View>
      ) : null}
      <View style={{ marginTop: 8 }}>
        {rows.map((row, i) => (
          <Pressable
            key={row.key}
            onPress={row.onPress}
            disabled={!row.onPress}
            style={[
              styles.listRow,
              i < rows.length - 1 && {
                borderBottomWidth: 1,
                borderBottomColor: p.divider,
              },
            ]}
            accessibilityRole={row.onPress ? 'button' : undefined}
            accessibilityLabel={`${row.name}, ${money(row.minor)}`}
          >
            {/* Bank logo (or an icon), with a dot in the bar's colour so the row still matches the bar */}
            <View
              style={[
                styles.placeLogo,
                {
                  backgroundColor: row.bank ? '#FFFFFF' : p.soft,
                  borderColor: p.line,
                },
              ]}
            >
              {row.bank ? (
                <BankIcon code={row.bank.code} name={row.bank.bankName} size={30} />
              ) : (
                <Feather name={row.icon || 'circle'} size={16} color={p.text} />
              )}
              <View style={[styles.placeDot, { backgroundColor: row.color, borderColor: p.card }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 14, color: p.text }, ff(font.bodySemi, '600')]} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={[{ fontSize: 12, color: p.sub }, ff(font.body, '500')]} numberOfLines={1}>
                {row.sub}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[{ fontSize: 14, color: row.minor < 0 ? p.danger : p.text }, ff(font.bodyBold, '700')]}>{money(row.minor)}</Text>
              {share(row.minor) ? <Text style={[{ fontSize: 12, color: p.sub }, ff(font.body, '500')]}>{share(row.minor)}</Text> : null}
            </View>
            {row.onPress ? <Feather name="chevron-right" size={16} color={p.muted} /> : null}
          </Pressable>
        ))}
      </View>
    </Card>
  );
};

type HealthCard = {
  key: string;
  /** Small label next to the dot, like Home's "Money in" */
  label: string;
  glyph: keyof typeof Feather.glyphMap;
  dot: string;
  dotInk: string;
  /** The mini picture drawn in the corner */
  visual: 'hourglass' | 'ring' | 'steps' | 'spark';
  /** 0 to 1: how full the hourglass or ring is; steps: how many bars are lit (of 4) */
  amount: number;
  big: string;
  line: string;
  bg: string;
  ink: string;
  sub: string;
};

/** Our own little drawings for the health cards, in the card's ink colour. */
const HealthVisual: React.FC<{
  kind: HealthCard['visual'];
  amount: number;
  ink: string;
}> = ({ kind, amount, ink }) => {
  if (kind === 'hourglass') {
    // Sand in the bottom bulb rises with how long the money lasts (full at 6 months)
    const sand = Math.max(0.12, Math.min(1, amount));
    const level = 50 - sand * 22;
    const half = ((level - 28) / 22) * 10;
    return (
      <Svg width={56} height={56} viewBox="0 0 56 56" pointerEvents="none">
        <Path d="M16 6h24M16 50h24" stroke={ink} strokeWidth={3} strokeLinecap="round" />
        <Path d="M18 6c0 12 10 16 10 22S18 38 18 50h20c0-12-10-16-10-22s10-10 10-22" stroke={ink} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
        <Path d={`M${(28 - half).toFixed(1)} ${level.toFixed(1)} L${(28 + half).toFixed(1)} ${level.toFixed(1)} L38 49 L18 49 Z`} fill={ink} />
        <Path d="M24 14h8l-4 6z" fill={ink} fillOpacity={0.25} />
      </Svg>
    );
  }
  if (kind === 'ring') {
    const r = 21;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(1, amount));
    return (
      <Svg width={56} height={56} viewBox="0 0 56 56" pointerEvents="none">
        <Circle cx={28} cy={28} r={r} stroke={ink} strokeOpacity={0.2} strokeWidth={7} fill="none" />
        <Circle
          cx={28}
          cy={28}
          r={r}
          stroke={ink}
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 28 28)"
        />
      </Svg>
    );
  }
  if (kind === 'steps') {
    const lit = Math.max(0, Math.min(4, Math.round(amount)));
    return (
      <Svg width={56} height={56} viewBox="0 0 56 56" pointerEvents="none">
        {[0, 1, 2, 3].map((i) => {
          const h = 14 + i * 10;
          const x = 6 + i * 12;
          const top = 50 - h;
          return (
            <Path key={i} d={`M${x + 3} ${top} h4 a3 3 0 0 1 3 3 V50 H${x} V${top + 3} a3 3 0 0 1 3 -3 Z`} fill={ink} fillOpacity={i >= 4 - lit ? 1 : 0.22} />
          );
        })}
      </Svg>
    );
  }
  return (
    <Svg width={56} height={56} viewBox="0 0 56 56" pointerEvents="none">
      <Path d="M6 42 L18 34 L28 38 L40 22 L50 14" stroke={ink} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6 42 L18 34 L28 38 L40 22 L50 14 L50 50 L6 50 Z" fill={ink} fillOpacity={0.18} />
      <Circle cx={50} cy={14} r={4.5} fill={ink} />
    </Svg>
  );
};

const AUTO_SWIPE_MS = 4000;
const RESUME_AFTER_TOUCH_MS = 6000;

/**
 * Money health as big swipe cards, one plain fact each. They move on by themselves every few
 * seconds, stop while you touch them, and stay still when the phone asks for less motion.
 */
const HealthCards: React.FC<{ cards: HealthCard[]; theme: Theme }> = ({ cards, theme }) => {
  const { p, font } = theme;
  const { width } = useWindowDimensions();
  const cardW = Math.min(340, width - 40 - 44); // leave the next card peeking in
  const step = cardW + 12;
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const pausedUntil = useRef(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion || cards.length < 2) return;
    const id = setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      const next = (indexRef.current + 1) % cards.length;
      scroller.current?.scrollTo({ x: next * step, animated: true });
      indexRef.current = next;
      setIndex(next);
    }, AUTO_SWIPE_MS);
    return () => clearInterval(id);
  }, [reduceMotion, cards.length, step]);

  const settle = (x: number) => {
    const i = Math.max(0, Math.min(cards.length - 1, Math.round(x / step)));
    indexRef.current = i;
    setIndex(i);
  };

  return (
    <View>
      <View style={[styles.rowBetween, { marginHorizontal: 20, marginTop: 22, marginBottom: 10 }]}>
        <Text style={[styles.cardTitle, { color: p.text }, ff(font.displayBold, '700')]}>Money health</Text>
        <Text style={[{ fontSize: 12.5, color: p.sub }, ff(font.bodySemi, '600')]}>{`${index + 1} of ${cards.length}`}</Text>
      </View>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
        onScrollBeginDrag={() => {
          pausedUntil.current = Date.now() + 60_000;
        }}
        onMomentumScrollEnd={(e) => {
          settle(e.nativeEvent.contentOffset.x);
          pausedUntil.current = Date.now() + RESUME_AFTER_TOUCH_MS;
        }}
      >
        {cards.map((c) => (
          <View
            key={c.key}
            style={[
              styles.healthCard,
              {
                width: cardW,
                backgroundColor: c.bg,
                borderColor: c.bg === p.card ? p.line : c.bg,
              },
            ]}
            accessible
            accessibilityLabel={`${c.big}. ${c.line}`}
          >
            {/* Home-style label: a small solid dot with a glyph, then the words; our drawing on the right */}
            <View style={[styles.rowBetween, { alignItems: 'flex-start' }]}>
              <View style={styles.healthLabelRow}>
                <View style={[styles.healthLabelDot, { backgroundColor: c.dot }]}>
                  <Feather name={c.glyph} size={12} color={c.dotInk} />
                </View>
                <Text style={[{ fontSize: 13, color: c.sub }, ff(font.bodySemi, '600')]}>{c.label}</Text>
              </View>
              <HealthVisual kind={c.visual} amount={c.amount} ink={c.ink} />
            </View>
            <View>
              <Text style={[{ fontSize: 48, color: c.ink, letterSpacing: -1 }, ff(font.display, '800')]} numberOfLines={1} adjustsFontSizeToFit>
                {c.big}
              </Text>
              <Text
                style={[
                  {
                    fontSize: 15.5,
                    color: c.sub,
                    marginTop: 6,
                    lineHeight: 21,
                  },
                  ff(font.bodySemi, '600'),
                ]}
              >
                {c.line}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.healthDots}>
        {cards.map((c, i) => (
          <View key={c.key} style={[styles.healthDot, { backgroundColor: i === index ? p.text : p.line }, i === index && { width: 22 }]} />
        ))}
      </View>
    </View>
  );
};

/** Round figure for the milestone card: ₹950, ₹3.9K, ₹25.4K, ₹1.2L, ₹2.4Cr. */
const roundFigure = (minor: number) => {
  const v = Math.abs(minor) / 100;
  const sign = minor < 0 ? '−' : '';
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (v >= 1e7) return `${sign}₹${trim(v / 1e7)}Cr`;
  if (v >= 1e5) return `${sign}₹${trim(v / 1e5)}L`;
  if (v >= 1e3) return `${sign}₹${trim(v / 1e3)}K`;
  return `${sign}₹${Math.round(v)}`;
};

const shortMonthYear = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

const shortMonth = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { month: 'short' });

/** Tiny count chip above the cycle bars: ↑ 1, ↓ 1, – 4 flat. */
const SparkCount: React.FC<{ theme: Theme; color: string; bg: string; icon: 'arrow-up' | 'arrow-down' | 'minus'; n: number; label?: string }> = ({
  theme,
  color,
  bg,
  icon,
  n,
  label,
}) => (
  <View style={[mStyles.countChip, { backgroundColor: bg }]}>
    <Feather name={icon} size={11} color={color} />
    <Text style={[{ fontSize: 11.5, color }, ff(theme.font.bodyBold, '700')]}>{label ? `${n} ${label}` : n}</Text>
  </View>
);

/**
 * The person's own net worth milestone. Nothing is set by default: they pick the amount, and
 * optionally a month. "How long at your pace" shows once there are MIN_ESTIMATE_PERIODS full
 * periods of history; a chosen month shows the pace needed to make it.
 */
const MilestoneCard: React.FC<{
  theme: Theme;
  plan: MilestonePlan | null;
  liveMinor: number;
  nowTs: number;
  typicalMinor: number | null;
  bestMinor: number | null;
  paceRows: MonthRow[];
  unitWord: 'cycle' | 'month';
  onEdit: (withMonth?: boolean) => void;
}> = ({ theme, plan, liveMinor, nowTs, typicalMinor, bestMinor, paceRows, unitWord, onEdit }) => {
  const { p, font, isDark } = theme;
  const hidden = useContext(HiddenContext);
  const ink = isDark ? LIME : FOREST;
  const onInk = isDark ? FOREST : LIME;
  const fig = (minor: number) => (hidden ? '•••' : roundFigure(minor));
  const softLime = isDark ? 'rgba(184,243,107,0.12)' : '#EAF6DC';
  const per = unitWord === 'cycle' ? 'salary' : 'month';

  const header = (title: string, right?: React.ReactNode) => (
    <View style={styles.rowBetween}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[mStyles.flag, { backgroundColor: softLime }]}>
          <Feather name="flag" size={13} color={ink} />
        </View>
        <Text style={[mStyles.eyebrow, { color: p.sub }, ff(font.bodyBold, '700')]}>{title}</Text>
      </View>
      {right}
    </View>
  );

  if (!plan) {
    return (
      <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}>
        {header('Net worth milestone')}
        <Text style={[{ fontSize: 21, color: p.text, marginTop: 14, letterSpacing: -0.4 }, ff(font.displayBold, '700')]}>Pick a number to grow toward</Text>
        <Text style={[{ fontSize: 13.5, color: p.sub, marginTop: 4 }, ff(font.bodySemi, '600')]}>{`You're at ${fig(liveMinor)} today.`}</Text>
        <Pressable
          onPress={() => onEdit()}
          accessibilityRole="button"
          style={({ pressed }) => [mStyles.cta, { backgroundColor: ink, opacity: pressed ? 0.85 : 1 }]}
        >
          <Feather name="plus" size={15} color={onInk} />
          <Text style={[{ fontSize: 14.5, color: onInk }, ff(font.bodyBold, '700')]}>Set milestone</Text>
        </Pressable>
      </View>
    );
  }

  const pct = plan.progress * 100;
  const bars = paceRows.slice(-12);
  const peak = Math.max(1, ...bars.map((r) => Math.abs(r.changeMinor)));
  const grew = bars.filter((r) => r.changeMinor > 0).length;
  const dropped = bars.filter((r) => r.changeMinor < 0).length;
  const flat = bars.length - grew - dropped;

  const tile = (opts: { label: string; value: string; note: string; strong?: boolean; onPress?: () => void; extra?: React.ReactNode }) => {
    const body = (
      <>
        <Text style={[mStyles.eyebrow, { color: p.sub, fontSize: 11 }, ff(font.bodyBold, '700')]} numberOfLines={1}>
          {opts.label}
        </Text>
        <Text
          style={[
            {
              fontSize: 22,
              color: opts.strong ? ink : p.text,
              marginTop: 4,
              letterSpacing: -0.4,
            },
            ff(font.display, '800'),
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {opts.value}
        </Text>
        {opts.extra}
        <Text style={[{ fontSize: 12, color: p.sub, marginTop: 2 }, ff(font.bodySemi, '600')]} numberOfLines={1}>
          {opts.note}
        </Text>
      </>
    );
    const bg = { backgroundColor: opts.strong ? softLime : p.soft };
    return opts.onPress ? (
      <Pressable onPress={opts.onPress} accessibilityRole="button" style={({ pressed }) => [mStyles.tile, bg, { opacity: pressed ? 0.8 : 1 }]}>
        {body}
      </Pressable>
    ) : (
      <View style={[mStyles.tile, bg]}>{body}</View>
    );
  };

  // Left tile: how long at the usual pace, once there is enough history.
  const historyDots = (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
      {Array.from({ length: MIN_ESTIMATE_PERIODS }, (_, i) => (
        <View key={i} style={[mStyles.dot, { backgroundColor: i < plan.historyPeriods ? ink : p.line }]} />
      ))}
    </View>
  );
  const paceTile = plan.reached
    ? tile({ label: 'At your pace', value: 'Done', note: 'milestone reached' })
    : plan.needsHistory
      ? tile({
          label: 'At your pace',
          value: `${plan.historyPeriods} of ${MIN_ESTIMATE_PERIODS}`,
          note: `${per} history needed`,
          extra: historyDots,
        })
      : plan.periodsAtPace !== null
        ? tile({
            label: 'At your pace',
            value: plural(plan.periodsAtPace, 'month'),
            note: `≈ ${shortMonthYear(monthStartOf(nowTs, plan.periodsAtPace))}`,
          })
        : tile({ label: 'At your pace', value: '—', note: 'not growing yet' });

  // Right tile: the pace needed for a chosen month, or the way to pick one.
  const onTrack = plan.requiredPerPeriodMinor !== null && typicalMinor !== null && !plan.needsHistory && typicalMinor >= plan.requiredPerPeriodMinor;
  const dateTile =
    plan.byTs !== null && plan.requiredPerPeriodMinor !== null
      ? tile({
          label: `By ${dayMonthYear(plan.byTs)}`,
          value: fig(plan.requiredPerPeriodMinor),
          note: `a month · ${plural(plan.periodsLeft ?? 0, 'month')} left`,
          strong: true,
          onPress: () => onEdit(true),
        })
      : plan.reached
        ? null
        : tile({
            label: 'Want it sooner?',
            value: 'Pick a month',
            note: 'see the pace it needs',
            strong: true,
            onPress: () => onEdit(true),
          });

  return (
    <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}>
      {header(
        'My milestone',
        <Pressable
          onPress={() => onEdit()}
          accessibilityRole="button"
          accessibilityLabel="Edit milestone"
          hitSlop={8}
          style={({ pressed }) => [mStyles.targetPill, { backgroundColor: ink, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[{ fontSize: 13, color: onInk }, ff(font.bodyBold, '800')]}>{fig(plan.targetMinor)}</Text>
          <Feather name="edit-2" size={12} color={onInk} />
        </Pressable>,
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          marginTop: 14,
          gap: 8,
        }}
      >
        {plan.reached ? (
          <>
            <Feather name="check-circle" size={28} color={ink} style={{ marginBottom: 4 }} />
            <Text style={[{ fontSize: 34, color: p.text, letterSpacing: -1 }, ff(font.display, '800')]}>Reached</Text>
          </>
        ) : (
          <>
            <Text style={[{ fontSize: 34, color: p.text, letterSpacing: -1 }, ff(font.display, '800')]}>{fig(plan.toGoMinor)}</Text>
            <Text style={[{ fontSize: 14, color: p.sub, marginBottom: 7 }, ff(font.bodySemi, '600')]}>to go</Text>
          </>
        )}
      </View>

      <View style={{ marginTop: 14 }}>
        <View style={[mStyles.bar, { backgroundColor: p.soft }]}>
          <View style={[mStyles.barFill, { width: `${Math.max(2, pct)}%`, backgroundColor: ink }]} />
        </View>
        <View
          style={[
            mStyles.knob,
            {
              left: `${Math.min(100, Math.max(2, pct))}%`,
              borderColor: ink,
              backgroundColor: p.card,
            },
          ]}
        />
        <View style={[styles.rowBetween, { marginTop: 8 }]}>
          <Text style={[{ fontSize: 12, color: p.text }, ff(font.bodyBold, '700')]}>
            {fig(liveMinor)}
            <Text style={[{ color: p.sub }, ff(font.bodySemi, '600')]}>{`  ·  ${Math.floor(pct)}%`}</Text>
          </Text>
          {plan.byTs !== null && !plan.reached ? (
            <View
              style={[
                mStyles.statusChip,
                {
                  backgroundColor: plan.needsHistory ? p.soft : onTrack ? softLime : p.tint.coral.bg,
                },
              ]}
            >
              <Text
                style={[
                  {
                    fontSize: 11.5,
                    color: plan.needsHistory ? p.sub : onTrack ? ink : p.tint.coral.fg,
                  },
                  ff(font.bodyBold, '700'),
                ]}
              >
                {plan.needsHistory ? `by ${dayMonthYear(plan.byTs)}` : onTrack ? 'On track' : 'Behind pace'}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={[mStyles.divider, { backgroundColor: p.line }]} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {paceTile}
        {dateTile}
      </View>

      {bars.length && !plan.reached ? (
        <View style={{ marginTop: 18 }}>
          <View style={styles.rowBetween}>
            <Text
              style={[mStyles.eyebrow, { color: p.sub, fontSize: 11 }, ff(font.bodyBold, '700')]}
            >{`${unitWord === 'cycle' ? 'Cycle' : 'Month'} by ${unitWord}`}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {grew ? <SparkCount theme={theme} color={ink} bg={softLime} icon="arrow-up" n={grew} /> : null}
              {dropped ? <SparkCount theme={theme} color={p.tint.coral.fg} bg={p.tint.coral.bg} icon="arrow-down" n={dropped} /> : null}
              {flat ? <SparkCount theme={theme} color={p.sub} bg={p.soft} icon="minus" n={flat} label="flat" /> : null}
            </View>
          </View>
          <View style={mStyles.spark}>
            <View style={[mStyles.zero, { backgroundColor: p.line }]} />
            {bars.map((r) => {
              const v = r.changeMinor;
              const height = Math.max(4, (Math.abs(v) / peak) * (SPARK_HALF - SPARK_LABEL));
              const isBest = bestMinor !== null && v === bestMinor && v > 0;
              const upColor = isBest ? ink : isDark ? 'rgba(184,243,107,0.5)' : '#8DBFA6';
              const valueText = hidden ? '•••' : v === 0 ? '₹0' : compact(v);
              const valueColor = v > 0 ? (isBest ? ink : p.text) : v < 0 ? p.tint.coral.fg : p.sub;
              return (
                <View key={r.monthStart} style={mStyles.sparkCol}>
                  <View style={mStyles.sparkHalfUp}>
                    {v > 0 ? (
                      <>
                        <Text style={[mStyles.sparkValue, { color: valueColor }, ff(font.bodyBold, '700')]} numberOfLines={1}>
                          {valueText}
                        </Text>
                        <View style={[mStyles.sparkBar, { height, backgroundColor: upColor }]} />
                      </>
                    ) : v === 0 ? (
                      <Text style={[mStyles.sparkValue, { color: valueColor, marginBottom: 6 }, ff(font.bodySemi, '600')]} numberOfLines={1}>
                        {valueText}
                      </Text>
                    ) : null}
                  </View>
                  {v === 0 ? <View style={[mStyles.flatDot, { backgroundColor: p.sub }]} /> : null}
                  <View style={mStyles.sparkHalf}>
                    {v < 0 ? (
                      <>
                        <View style={[mStyles.sparkBar, { height, backgroundColor: CORAL }]} />
                        <Text style={[mStyles.sparkValue, { color: valueColor, marginTop: 4 }, ff(font.bodyBold, '700')]} numberOfLines={1}>
                          {valueText}
                        </Text>
                      </>
                    ) : null}
                  </View>
                  <Text style={[mStyles.sparkMonth, { color: p.sub }, ff(font.bodySemi, '600')]}>{shortMonth(r.monthStart)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
};

/** Set or change the milestone: an amount, and optionally a month to reach it by. */
const MilestoneSheet: React.FC<{
  theme: Theme;
  visible: boolean;
  startWithMonth: boolean;
  liveMinor: number;
  nowTs: number;
  current: NetWorthMilestone | null;
  /** Month the picker opens on: a month before the estimate at the usual pace, when there is one. */
  suggestedByTs: number | null;
  onSave: (m: NetWorthMilestone) => void;
  onRemove: () => void;
  onClose: () => void;
}> = ({ theme, visible, startWithMonth, liveMinor, nowTs, current, suggestedByTs, onSave, onRemove, onClose }) => {
  const { p, font, isDark } = theme;
  const insets = useSafeAreaInsets();
  const ink = isDark ? LIME : FOREST;
  const onInk = isDark ? FOREST : LIME;
  const tomorrow = new Date(nowTs);
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Mounted fresh each time the sheet opens, so the fields start from what is saved.
  const [text, setText] = useState(current ? String(Math.round(current.targetMinor / 100)) : '');
  const [byTs, setByTs] = useState<number | null>(() => {
    const saved = current?.byTs ?? null;
    return saved !== null && saved >= tomorrow.getTime() ? saved : null;
  });
  // "Want it sooner?" opens straight on the app's date picker.
  const [pickerOpen, setPickerOpen] = useState(startWithMonth && byTs === null);
  const pickerValue = new Date(Math.max(tomorrow.getTime(), byTs ?? suggestedByTs ?? tomorrow.getTime()));

  const rupeesTyped = Number(text.replace(/[^0-9]/g, ''));
  const targetMinor = Number.isFinite(rupeesTyped) ? rupeesTyped * 100 : 0;
  const tooLow = targetMinor > 0 && targetMinor <= liveMinor;
  const valid = targetMinor > 0 && !tooLow;
  const months = byTs === null ? null : monthsUntil(nowTs, byTs);
  const needed = valid && months !== null ? Math.ceil((targetMinor - Math.max(0, liveMinor)) / months) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={mStyles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          <View
            style={[
              mStyles.sheet,
              {
                backgroundColor: p.card,
                paddingBottom: Math.max(insets.bottom, 16) + 8,
              },
            ]}
          >
            <View style={[mStyles.grabber, { backgroundColor: p.line }]} />
            <Text style={[{ fontSize: 20, color: p.text, letterSpacing: -0.3 }, ff(font.displayBold, '700')]}>Net worth milestone</Text>
            <Text style={[{ fontSize: 13, color: p.sub, marginTop: 2 }, ff(font.bodySemi, '600')]}>{`You're at ${roundFigure(liveMinor)} today.`}</Text>

            <View style={[mStyles.amountBox, { borderColor: tooLow ? CORAL : ink, backgroundColor: p.soft }]}>
              <Text style={[{ fontSize: 30, color: p.sub }, ff(font.display, '800')]}>₹</Text>
              <TextInput
                value={text}
                onChangeText={(t) => setText(t.replace(/[^0-9]/g, '').slice(0, 12))}
                keyboardType="number-pad"
                placeholder="Amount"
                placeholderTextColor={p.sub}
                autoFocus={!startWithMonth}
                accessibilityLabel="Milestone amount in rupees"
                style={[{ flex: 1, fontSize: 30, color: p.text, paddingVertical: 0 }, ff(font.display, '800')]}
              />
            </View>
            {tooLow ? (
              <Text style={[{ fontSize: 12.5, color: CORAL, marginTop: 6 }, ff(font.bodySemi, '600')]}>
                {`Pick more than your net worth today (${roundFigure(liveMinor)}).`}
              </Text>
            ) : null}

            <Text style={[mStyles.eyebrow, { color: p.sub, marginTop: 20 }, ff(font.bodyBold, '700')]}>By when (optional)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <Pressable
                onPress={() => setPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={byTs === null ? 'Pick a date' : `Change date, ${dayMonthYear(byTs)}`}
                style={({ pressed }) => [
                  mStyles.dateField,
                  byTs === null ? { borderWidth: 1, borderStyle: 'dashed', borderColor: p.line } : { backgroundColor: p.soft },
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Feather name="calendar" size={16} color={ink} />
                <Text style={[{ flex: 1, fontSize: 15, color: p.text }, ff(font.bodyBold, '700')]}>{byTs === null ? 'Pick a date' : dayMonthYear(byTs)}</Text>
                <Feather name="chevron-right" size={18} color={p.sub} />
              </Pressable>
              {byTs !== null ? (
                <Pressable onPress={() => setByTs(null)} accessibilityLabel="Remove date" style={[mStyles.clearBtn, { backgroundColor: p.soft }]}>
                  <Feather name="x" size={18} color={p.sub} />
                </Pressable>
              ) : null}
            </View>

            {needed !== null && months !== null ? (
              <View style={[mStyles.preview, { backgroundColor: FOREST }]}>
                <Text
                  style={[
                    {
                      fontSize: 11.5,
                      letterSpacing: 0.6,
                      color: LIME,
                      textTransform: 'uppercase',
                    },
                    ff(font.bodyBold, '700'),
                  ]}
                >
                  What it takes
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    gap: 6,
                    marginTop: 6,
                  }}
                >
                  <Text style={[{ fontSize: 26, color: '#FFFFFF', letterSpacing: -0.5 }, ff(font.display, '800')]}>{roundFigure(needed)}</Text>
                  <Text style={[{ fontSize: 13, color: MIST, marginBottom: 4 }, ff(font.bodySemi, '600')]}>{`a month for ${plural(months, 'month')}`}</Text>
                </View>
              </View>
            ) : null}

            <Pressable
              onPress={() => valid && onSave({ targetMinor, byTs })}
              disabled={!valid}
              accessibilityRole="button"
              style={({ pressed }) => [
                mStyles.save,
                {
                  backgroundColor: valid ? ink : p.soft,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[{ fontSize: 16, color: valid ? onInk : p.sub }, ff(font.bodyBold, '700')]}>Save milestone</Text>
            </Pressable>
            {current ? (
              <Pressable onPress={onRemove} accessibilityRole="button" style={mStyles.remove}>
                <Text style={[{ fontSize: 14, color: p.sub }, ff(font.bodySemi, '600')]}>Remove milestone</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
      <DateTimePickerSheet
        visible={pickerOpen}
        mode="date"
        title="Reach it by"
        confirmLabel="Use this date"
        value={pickerValue}
        minimumDate={tomorrow}
        onClose={() => setPickerOpen(false)}
        onConfirm={(d) => {
          setByTs(d.getTime());
          setPickerOpen(false);
        }}
      />
    </Modal>
  );
};

const SPARK_HALF = 40;
/** Room kept above or below a bar for its value. */
const SPARK_LABEL = 18;

const mStyles = StyleSheet.create({
  eyebrow: { fontSize: 11.5, letterSpacing: 0.8, textTransform: 'uppercase' },
  flag: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 16,
    borderRadius: 999,
    paddingHorizontal: 18,
    minHeight: 46,
  },
  bar: { height: 12, borderRadius: 6, overflow: 'hidden' },
  barFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 6,
  },
  knob: {
    position: 'absolute',
    top: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 4,
    marginLeft: -9,
  },
  statusChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  divider: { height: 1, marginVertical: 16 },
  dot: { width: 14, height: 4, borderRadius: 2 },
  spark: { flexDirection: 'row', gap: 6, marginTop: 12 },
  sparkValue: { fontSize: 10.5, textAlign: 'center', marginBottom: 4 },
  sparkMonth: { fontSize: 10.5, textAlign: 'center', marginTop: 6 },
  flatDot: { position: 'absolute', top: SPARK_HALF - 2, alignSelf: 'center', width: 4, height: 4, borderRadius: 2 },
  countChip: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  sparkCol: { flex: 1 },
  sparkHalfUp: { height: SPARK_HALF, justifyContent: 'flex-end' },
  sparkHalf: { height: SPARK_HALF },
  sparkBar: { width: '100%', borderRadius: 3 },
  zero: { position: 'absolute', left: 0, right: 0, top: SPARK_HALF, height: 1 },
  tile: { flex: 1, borderRadius: 16, padding: 12, minHeight: 92 },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(6,20,14,0.45)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    borderWidth: 1.5,
    borderRadius: 18,
    paddingHorizontal: 16,
    height: 64,
  },
  dateField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999, paddingHorizontal: 16, minHeight: 48 },
  clearBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  preview: { marginTop: 16, borderRadius: 18, padding: 14 },
  save: {
    marginTop: 18,
    height: 54,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
  },
});

const Overview: React.FC<{
  data: NetWorthData;
  rows: MonthRow[];
  theme: Theme;
}> = ({ data, rows, theme }) => {
  const navigation = useNavigation<any>();
  const { model } = data;
  const { p, font } = theme;
  const money = useMoney();
  const hidden = useContext(HiddenContext);
  const per = usePeriods();
  // Salary cycles stretched or squeezed by a job change or very late salary don't count toward averages.
  const h = useMemo(() => health(model, rows, per.unit === 'cycle' ? (r) => isTransitionCycle('salary', r.days) : undefined), [model, rows, per.unit]);
  const saved = useNetWorthMilestone((st) => st.milestone);
  const saveMilestone = useNetWorthMilestone((st) => st.save);
  const clearMilestone = useNetWorthMilestone((st) => st.clear);
  const [sheet, setSheet] = useState<{ withMonth: boolean } | null>(null);
  const plan = useMemo(
    () =>
      saved
        ? milestonePlan({
            liveMinor: model.liveMinor,
            targetMinor: saved.targetMinor,
            typicalGrowthMinor: h.typicalGrowthMinor,
            historyPeriods: h.avgMonths,
            byTs: saved.byTs,
            nowTs: model.now,
          })
        : null,
    [saved, model, h],
  );
  // The periods behind the pace: same filter as health(), oldest first.
  const paceRows = useMemo(
    () => rows.filter((r) => !r.isCurrent && !r.isPartial && !(per.unit === 'cycle' && isTransitionCycle('salary', r.days))),
    [rows, per.unit],
  );

  // Plain words: "salary" in salary-cycle mode, "month" otherwise
  const isCycle = per.unit === 'cycle';
  const one = isCycle ? 'salary' : 'month';
  const many = isCycle ? 'salaries' : 'months';
  const healthCards: HealthCard[] = useMemo(() => {
    const { isDark } = theme;
    const months = h.runwayDays === null ? 0 : Math.round(h.runwayDays / 30.4);
    const lasts =
      h.runwayDays === null
        ? 'We need a week of spending to work this out.'
        : months >= 1
          ? `Your money lasts about ${plural(months, 'month')} if income stops.`
          : 'Your money lasts less than a month if income stops.';
    const stayed = h.keptPct === null ? null : Math.round(h.keptPct);
    return [
      {
        key: 'lasts',
        label: 'Money lasts',
        glyph: 'clock',
        dot: LIME,
        dotInk: FOREST,
        visual: 'hourglass',
        amount: h.runwayDays === null ? 0 : h.runwayDays / 180,
        big: h.runwayDays === null ? '—' : plural(h.runwayDays, 'day'),
        line: lasts,
        bg: isDark ? '#061D15' : FOREST,
        ink: LIME,
        sub: '#FFFFFF',
      },
      {
        key: 'stayed',
        label: 'Saved',
        glyph: 'arrow-down-left',
        dot: FOREST,
        dotInk: LIME,
        visual: 'ring',
        amount: stayed === null ? 0 : stayed / 100,
        big: stayed === null ? '—' : `${stayed < 0 ? '−' : ''}${Math.abs(stayed)}%`,
        line:
          stayed === null
            ? `No money in yet this ${per.word}.`
            : stayed < 0
              ? `You spent more than came in this ${per.word}.`
              : isCycle
                ? 'of your salary stayed with you.'
                : 'of what came in this month stayed with you.',
        bg: LIME,
        ink: FOREST,
        sub: FOREST,
      },
      {
        key: 'streak',
        label: 'Growing',
        glyph: 'arrow-up-right',
        dot: theme.isDark ? LIME : FOREST,
        dotInk: theme.isDark ? FOREST : LIME,
        visual: 'steps',
        amount: h.streakMonths,
        big: h.streakMonths > 0 ? `${h.streakMonths} in a row` : 'Not yet',
        line:
          h.streakMonths > 0
            ? `Your money grew ${h.streakMonths === 1 ? `this ${one}` : `${h.streakMonths} ${many} in a row`}.`
            : `Your money hasn't grown this ${per.word} yet.`,
        bg: p.card,
        ink: p.text,
        sub: p.sub,
      },
      {
        key: 'usual',
        label: `Each ${one}`,
        glyph: 'plus',
        dot: isDark ? '#D9CFFF' : '#3D2A8A',
        dotInk: isDark ? '#2A1D63' : '#FFFFFF',
        visual: 'spark',
        amount: 0,
        big: h.avgGrowthMinor === null ? '—' : hidden ? MASK : money(Math.round(h.avgGrowthMinor / 100) * 100, true).replace('.00', ''),
        line:
          h.avgGrowthMinor === null
            ? `Shows after your first full ${per.word}.`
            : `Your money usually ${h.avgGrowthMinor >= 0 ? 'grows' : 'drops'} this much each ${one}.`,
        bg: isDark ? 'rgba(185,168,245,0.14)' : '#EEE9FD',
        ink: isDark ? '#D9CFFF' : '#3D2A8A',
        sub: isDark ? '#D9CFFF' : '#3D2A8A',
      },
    ];
  }, [h, theme, p, per, isCycle, one, many, hidden, money]);

  const read = useMemo(() => {
    if (model.daysTracked < 7) {
      const ready = model.trackingStart + 7 * DAY_MS;
      return `I need about a week of balances before I can read a trend. Come back on ${dayMonth(ready)}.`;
    }
    // The two things most worth saying to this person, picked from their own numbers.
    const text = regentRead({
      rows,
      health: h,
      plan,
      fmt: (minor) => (hidden ? MASK : roundFigure(minor)),
      // A period is named by the month most of it fell in.
      periodName: (r) => shortMonth((r.fromTs + r.endTs) / 2),
      dateName: (ts) => dayMonthYear(ts),
      one,
      many,
    });
    if (text) return text;
    const first = model.series[0];
    const change = model.liveMinor - first.minor;
    return change === 0
      ? `Same as on ${dayMonth(first.ts)}.`
      : `${change > 0 ? 'Up' : 'Down'} ${hidden ? MASK : roundFigure(Math.abs(change))} since ${dayMonth(first.ts)}.`;
  }, [model, rows, h, plan, hidden, one, many]);

  return (
    <>
      <Hero data={data} theme={theme} />
      {model.daysTracked >= 1 ? <WhatChanged data={data} theme={theme} /> : null}
      <WhereItSits data={data} theme={theme} onOpenBorrowLend={() => navigation.navigate('BorrowLend')} />

      <HealthCards cards={healthCards} theme={theme} />

      <MilestoneCard
        theme={theme}
        plan={plan}
        liveMinor={model.liveMinor}
        nowTs={model.now}
        typicalMinor={h.typicalGrowthMinor}
        bestMinor={h.bestGrowthMinor}
        paceRows={paceRows}
        unitWord={per.unit === 'cycle' ? 'cycle' : 'month'}
        onEdit={(withMonth) => setSheet({ withMonth: !!withMonth })}
      />
      {sheet ? (
        <MilestoneSheet
          theme={theme}
          visible
          startWithMonth={!!sheet?.withMonth}
          liveMinor={model.liveMinor}
          nowTs={model.now}
          current={saved}
          suggestedByTs={plan?.periodsAtPace ? monthStartOf(model.now, plan.periodsAtPace - 1) : null}
          onSave={(m) => {
            saveMilestone(m);
            setSheet(null);
          }}
          onRemove={() => {
            clearMilestone();
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}

      <View style={styles.regentCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name="message-circle" size={15} color={LIME} />
          <Text
            style={[
              {
                fontSize: 12,
                letterSpacing: 0.6,
                color: LIME,
                textTransform: 'uppercase',
              },
              ff(font.bodyBold, '700'),
            ]}
          >
            {"Regent's read"}
          </Text>
        </View>
        <Text style={[{ fontSize: 14.5, color: '#FFFFFF', lineHeight: 21, marginTop: 10 }, ff(font.body, '500')]}>{read}</Text>
        <Pressable
          onPress={() => navigation.navigate('Main', { screen: 'Regent' })}
          style={({ pressed }) => [styles.regentBtn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={[{ fontSize: 13, color: FOREST }, ff(font.bodyBold, '700')]}>Ask Regent</Text>
        </Pressable>
      </View>
    </>
  );
};

/* ------------------------------------------------------------------ */
/* Compare                                                             */
/* ------------------------------------------------------------------ */

const EmptyTab: React.FC<{
  theme: Theme;
  icon: keyof typeof Feather.glyphMap;
  title: string;
  text: string;
}> = ({ theme, icon, title, text }) => (
  <Card theme={theme}>
    <View style={{ alignItems: 'center', paddingVertical: 18 }}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.p.tint.green.bg }]}>
        <Feather name={icon} size={22} color={theme.p.tint.green.fg} />
      </View>
      <Text
        style={[
          {
            fontSize: 18,
            color: theme.p.text,
            marginTop: 14,
            textAlign: 'center',
          },
          ff(theme.font.displayBold, '700'),
        ]}
      >
        {title}
      </Text>
      <Text
        style={[
          {
            fontSize: 13.5,
            color: theme.p.sub,
            marginTop: 6,
            textAlign: 'center',
            lineHeight: 19,
            maxWidth: 280,
          },
          ff(theme.font.body, '500'),
        ]}
      >
        {text}
      </Text>
    </View>
  </Card>
);

const PACE_H = 240;
/** Room kept above and below the lines so the amount labels never sit on them. */
const PACE_TOP = 40;
const PACE_BOTTOM = 30;

/** One line on the pace chart: a period's net worth, day by day. */
interface PaceLine {
  key: string;
  name: string;
  /** Short name for labels: "Oct". */
  short: string;
  pts: PacePoint[];
}

type PacePick = { key: string; day: number } | null;

/** Two or three round gridline values inside [min, max]. */
const paceTicks = (min: number, max: number): number[] => {
  const span = max - min;
  if (span <= 0) return [];
  const raw = span / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out.slice(0, 3);
};

const PaceChart: React.FC<{ data: NetWorthData; theme: Theme }> = ({ data, theme }) => {
  const { model } = data;
  const { p, font, isDark } = theme;
  const money = useMoney();
  const hidden = useContext(HiddenContext);
  const [width, setWidth] = useState(0);
  const [count, setCount] = useState(1);
  const [pick, setPick] = useState<PacePick>(null);
  const per = usePeriods();
  const isCycle = per.unit === 'cycle' && per.starts.length >= 2;

  // This period and up to six earlier ones, newest first, as net worth by day. Salary cycles
  // line up by day of the cycle (day 1 = salary day), months by date.
  const lines = useMemo(() => {
    const out: PaceLine[] = [];
    const startOf = (k: number) => (isCycle ? per.starts[per.starts.length - 1 - k] : monthStartOf(model.now, -k));
    for (let k = 0; k <= 6; k++) {
      const start = startOf(k);
      if (start === undefined) break;
      const next = isCycle ? (k === 0 ? model.now + DAY_MS : startOf(k - 1)) : monthStartOf(model.now, -k + 1);
      if (next <= model.trackingStart) break;
      const pace = periodPace(model, start, next, !isCycle);
      if (k > 0 && pace.length < 2) break;
      const base = model.valueAt(Math.max(start, model.trackingStart) - 1);
      const short = isCycle ? shortMonth((start + next) / 2) : shortMonth(start);
      out.push({
        key: `k${k}`,
        name: k === 0 ? (isCycle ? 'This cycle' : monthName(start)) : isCycle ? `${short} cycle` : monthName(start),
        short: k === 0 ? 'Now' : short,
        pts: pace.map((pt) => ({ day: pt.day, minor: base + pt.minor })),
      });
    }
    return out;
  }, [model, per, isCycle]);

  const current = lines[0];
  const past = lines.slice(1);
  if (!current || current.pts.length === 0 || past.length === 0) return null;

  // "Last cycle" is this one against the last; "3 cycles" and "6 cycles" count this one too,
  // so they draw 2 and 5 earlier cycles plus their dotted average.
  const choices = [1, 3, 6].filter((c) => c === 1 || past.length >= c - 1);
  const total = choices.includes(count) ? count : 1;
  const n = total === 1 ? 1 : total - 1;
  const shown = past.slice(0, n);
  const today = current.pts[current.pts.length - 1];

  // What today is compared with: the last period, or the average of the shown ones.
  const valueOn = (line: PaceLine, day: number) => {
    const exact = line.pts.find((pt) => pt.day === day);
    if (exact) return exact.minor;
    const last = line.pts[line.pts.length - 1];
    return day > last.day ? last.minor : null;
  };
  const refDays = Math.max(...shown.map((l) => l.pts[l.pts.length - 1].day));
  const reference: PaceLine =
    n === 1
      ? shown[0]
      : {
          key: 'avg',
          name: 'Average',
          short: 'Avg',
          pts: Array.from({ length: refDays }, (_, i) => i + 1)
            .map((d) => {
              const vals = shown.map((l) => valueOn(l, d)).filter((v): v is number => v !== null);
              return vals.length ? { day: d, minor: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) } : null;
            })
            .filter((pt): pt is PacePoint => pt !== null),
        };
  const refToday = valueOn(reference, today.day);
  const gap = refToday === null ? 0 : today.minor - refToday;
  const ahead = gap >= 0;
  const daysLeft = Math.max(0, refDays - today.day);

  // Scale.
  const lastDay = Math.max(refDays, today.day);
  const all = [...current.pts, ...shown.flatMap((l) => l.pts)].map((pt) => pt.minor);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (day: number) => 8 + ((day - 1) / Math.max(1, lastDay - 1)) * (width - 16);
  const y = (v: number) => PACE_TOP + (1 - (v - lo) / span) * (PACE_H - PACE_TOP - PACE_BOTTOM);
  const path = (pts: PacePoint[]) => pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${x(pt.day).toFixed(1)},${y(pt.minor).toFixed(1)}`).join(' ');
  const ticks = paceTicks(lo, hi);

  // Shade the gap between today's line and the reference over the days both have.
  const refByDay = new Map(reference.pts.map((pt) => [pt.day, pt.minor]));
  const both = current.pts.filter((pt) => refByDay.has(pt.day));
  const gapArea =
    both.length >= 2
      ? `${path(both)} ${[...both]
          .reverse()
          .map((pt) => `L${x(pt.day).toFixed(1)},${y(refByDay.get(pt.day) as number).toFixed(1)}`)
          .join(' ')} Z`
      : null;

  // The tapped point, if any.
  const pickable = n === 1 ? [current, reference] : [current, reference, ...shown];
  const pickedLine = pick ? pickable.find((l) => l.key === pick.key) : undefined;
  const pickedPt = pickedLine && pick ? pickedLine.pts.find((pt) => pt.day === pick.day) : undefined;

  const onTap = (lx: number, ly: number) => {
    if (width <= 0) return;
    const day = Math.max(1, Math.min(lastDay, Math.round(1 + ((lx - 8) / Math.max(1, width - 16)) * (lastDay - 1))));
    let best: { key: string; dist: number } | null = null;
    for (const line of pickable) {
      const pt = line.pts.find((q) => q.day === day);
      if (!pt) continue;
      const dist = Math.abs(y(pt.minor) - ly);
      if (!best || dist < best.dist) best = { key: line.key, dist };
    }
    if (!best) return;
    // Tapping the point already shown goes back to today.
    if (pick && pick.key === best.key && pick.day === day) setPick(null);
    else setPick({ key: best.key, day });
  };

  const ink = isDark ? LIME : FOREST;
  const ghost = isDark ? '#7F9A8C' : '#9DB5A8';
  const fig = (v: number) => (hidden ? MASK : roundFigure(v));
  const gapFig = hidden ? MASK : roundFigure(Math.abs(gap));

  // The day the chart labels: today, or the tapped day. On it, this cycle's amount sits above
  // or below its dot, the comparison line's amount on the other side, the gap between them, and
  // the tapped earlier cycle's amount beside its dot when it is one of the faint lines.
  const clampX = (cx: number, w: number) => Math.max(0, Math.min(width - w, cx - w / 2));
  const tx = x(today.day);
  const ty = y(today.minor);
  const fd = pickedPt ? pickedPt.day : today.day;
  const fx = x(fd);
  const curV = fd <= today.day ? valueOn(current, fd) : null;
  const refV = valueOn(reference, fd);
  const extra = pickedLine && pickedPt && pickedLine !== current && pickedLine !== reference ? { name: pickedLine.short, v: pickedPt.minor } : null;
  const cy = curV === null ? null : y(curV);
  const ry = refV === null ? null : y(refV);
  const diff = curV !== null && refV !== null ? curV - refV : null;
  const curOnTop = cy !== null && (ry === null || cy <= ry);
  const LABEL_H = 24;
  let upperTop: number | null = null;
  let lowerTop: number | null = null;
  const single = cy ?? ry;
  if (cy !== null && ry !== null) {
    upperTop = Math.max(0, Math.min(cy, ry) - LABEL_H - 8);
    lowerTop = Math.min(PACE_H - LABEL_H, Math.max(cy, ry) + 10);
    if (lowerTop < upperTop + LABEL_H + 4) {
      lowerTop = Math.min(PACE_H - LABEL_H, upperTop + LABEL_H + 4);
      upperTop = Math.max(0, lowerTop - LABEL_H - 4);
    }
  } else if (single !== null) {
    upperTop = Math.max(0, single - LABEL_H - 8);
  }
  const curTop = cy === null ? null : ry === null || curOnTop ? upperTop : lowerTop;
  const refTop = ry === null ? null : cy === null || !curOnTop ? upperTop : lowerTop;
  // This cycle's label carries the gap too, so it is wider when there is one.
  const pillW = diff !== null && diff !== 0 ? 124 : 80;
  const sideLeft = fx > width - 130;

  type KeyRow = { key: string; label: string; color: string; mark: 'solid' | 'dash' | 'dot' | 'faint' };
  const legendRows: KeyRow[] = [
    { key: current.key, label: current.name, color: ink, mark: 'solid' },
    { key: reference.key, label: reference.name, color: n > 1 ? p.text : ghost, mark: n > 1 ? 'dot' : 'dash' },
    ...(n > 1 ? [{ key: 'each', label: `Each of ${n}`, color: ghost, mark: 'faint' as const }] : []),
  ];

  return (
    <Card theme={theme}>
      <View style={[styles.rowBetween, { alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={[styles.cardTitle, { color: p.text }, ff(font.displayBold, '700')]} numberOfLines={1}>
            {refToday === null
              ? `${current.name} so far`
              : `${gap === 0 ? 'Level with' : ahead ? 'Ahead of' : 'Behind'} ${n === 1 ? reference.name : 'your average'}`}
          </Text>
          <Text style={[styles.cardSub, { color: p.sub }, ff(font.bodySemi, '600')]} numberOfLines={1}>
            {n > 1
              ? `Day ${today.day} · average of last ${n} ${isCycle ? 'cycles' : 'months'}`
              : `Day ${today.day}${daysLeft > 0 ? ` · ${plural(daysLeft, 'day')} to ${isCycle ? 'salary' : 'month end'}` : ''}`}
          </Text>
        </View>
        {refToday !== null && gap !== 0 ? (
          <View style={[paceStyles.gapChip, { backgroundColor: ahead ? p.tint.green.bg : p.tint.coral.bg }]}>
            <Feather name={ahead ? 'arrow-up-right' : 'arrow-down-right'} size={14} color={ahead ? p.tint.green.fg : p.tint.coral.fg} />
            <Text style={[{ fontSize: 18, color: ahead ? p.tint.green.fg : p.tint.coral.fg }, ff(font.display, '800')]}>{gapFig}</Text>
          </View>
        ) : null}
      </View>

      {choices.length > 1 ? (
        <View style={[paceStyles.seg, { backgroundColor: p.soft }]}>
          {choices.map((c) => {
            const on = c === total;
            return (
              <Pressable
                key={c}
                onPress={() => {
                  setCount(c);
                  setPick(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[paceStyles.segBtn, on && { backgroundColor: p.card }]}
              >
                <Text style={[{ fontSize: 12.5, color: on ? p.text : p.sub }, ff(on ? font.bodyBold : font.bodySemi, on ? '700' : '600')]}>
                  {c === 1 ? (isCycle ? 'Last cycle' : 'Last month') : `${c} ${isCycle ? 'cycles' : 'months'}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Pressable
        onPress={(e) => onTap(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        style={{ height: PACE_H, marginTop: 18 }}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="image"
        accessibilityHint="Tap any point to see that day"
        accessibilityLabel={`Day ${today.day}: ${current.name} ${money(today.minor)}${refToday !== null ? `, ${reference.name} ${money(refToday)}` : ''}.`}
      >
        {width > 0 ? (
          <>
            {/* The drawing never takes the tap: a tap on a line's path would report coordinates
                relative to that path, not the chart, and pick the wrong line. */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Svg width={width} height={PACE_H}>
                {ticks.map((t) => (
                  <SvgLine key={t} x1={0} y1={y(t)} x2={width - 40} y2={y(t)} stroke={p.line} strokeDasharray="2 4" />
                ))}
                {pickedPt ? (
                  <SvgLine x1={x(pickedPt.day)} y1={0} x2={x(pickedPt.day)} y2={PACE_H} stroke={p.text} strokeOpacity={0.25} strokeWidth={1} />
                ) : null}
                {gapArea ? <Path d={gapArea} fill={ahead ? (isDark ? 'rgba(184,243,107,0.2)' : 'rgba(184,243,107,0.38)') : 'rgba(255,138,107,0.26)'} /> : null}
                {n > 1
                  ? shown.map((l) => (
                      <Path
                        key={l.key}
                        d={path(l.pts)}
                        stroke={ghost}
                        strokeOpacity={pickedLine === l ? 1 : 0.3}
                        strokeWidth={pickedLine === l ? 2.2 : 1.3}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))
                  : null}
                <Path
                  d={path(reference.pts)}
                  stroke={n > 1 ? p.text : ghost}
                  strokeOpacity={n > 1 ? 0.7 : 1}
                  strokeWidth={n > 1 ? 2.6 : 2.2}
                  strokeDasharray={n > 1 ? '0.1 5' : '5 5'}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Path d={path(current.pts)} stroke={ink} strokeWidth={3.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                {cy !== null && ry !== null ? (
                  <SvgLine x1={fx} y1={Math.min(cy, ry) + 8} x2={fx} y2={Math.max(cy, ry) - 6} stroke={ink} strokeWidth={1.5} strokeDasharray="2 3" />
                ) : null}
                {pickedPt && fd !== today.day ? <Circle cx={tx} cy={ty} r={4} fill={ink} /> : null}
                {extra ? <Circle cx={fx} cy={y(extra.v)} r={4.5} fill={p.card} stroke={p.text} strokeWidth={2.5} /> : null}
                {ry !== null ? <Circle cx={fx} cy={ry} r={5} fill={p.card} stroke={n > 1 ? p.text : ghost} strokeWidth={2.5} /> : null}
                {cy !== null ? (
                  <>
                    <Circle cx={fx} cy={cy} r={11} fill={ink} fillOpacity={0.12} />
                    <Circle cx={fx} cy={cy} r={6} fill={ink} stroke={p.card} strokeWidth={2.5} />
                  </>
                ) : null}
              </Svg>
            </View>

            {/* Labels never take the tap: it must reach the chart with chart coordinates. */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {ticks.map((t) => (
                <Text key={t} style={[paceStyles.tick, { top: y(t) - 7, color: p.sub }, ff(font.bodySemi, '600')]}>
                  {hidden ? '' : roundFigure(t)}
                </Text>
              ))}

              {cy !== null && curV !== null ? (
                // This cycle's amount, with the gap to the other line inside the same label so
                // nothing floats loose over the lines.
                <View style={[paceStyles.pill, { left: clampX(fx, pillW), top: curTop ?? 0, width: pillW, backgroundColor: FOREST }]}>
                  <Text style={[{ fontSize: 12, color: '#FFFFFF' }, ff(font.bodyBold, '800')]} numberOfLines={1}>
                    {fig(curV)}
                  </Text>
                  {diff !== null && diff !== 0 ? (
                    <Text style={[{ fontSize: 11, color: diff > 0 ? LIME : CORAL }, ff(font.bodyBold, '800')]} numberOfLines={1}>
                      {`${diff > 0 ? '+' : '−'}${hidden ? MASK : roundFigure(Math.abs(diff))}`}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              {ry !== null && refV !== null ? (
                <View
                  style={[
                    paceStyles.ghostPill,
                    {
                      left: clampX(fx, 96),
                      top: refTop ?? 0,
                      backgroundColor: p.card,
                      borderColor: p.line,
                    },
                  ]}
                >
                  <Text style={[{ fontSize: 11.5, color: p.sub, textAlign: 'center' }, ff(font.bodyBold, '700')]} numberOfLines={1}>
                    {`${reference.short} ${fig(refV)}`}
                  </Text>
                </View>
              ) : null}
              {extra ? (
                <View
                  style={[
                    paceStyles.sidePill,
                    { top: Math.max(0, Math.min(PACE_H - 22, y(extra.v) - 10)), backgroundColor: p.card, borderColor: p.line },
                    sideLeft ? { right: width - fx + 12 } : { left: fx + 12 },
                  ]}
                >
                  <Text style={[{ fontSize: 11, color: p.text }, ff(font.bodyBold, '700')]} numberOfLines={1}>{`${extra.name} ${fig(extra.v)}`}</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </Pressable>

      <View style={{ height: 20, marginTop: 6 }}>
        {width > 0 ? (
          <>
            {!(pickedPt && fx < 90) ? (
              <Text style={[paceStyles.axis, { left: 0, color: p.sub }, ff(font.bodySemi, '600')]}>{isCycle ? 'Salary day' : '1st'}</Text>
            ) : null}
            {!pickedPt || fd === today.day || Math.abs(fx - tx) > 56 ? (
              <View style={[paceStyles.todayTag, { left: clampX(tx, 48), backgroundColor: FOREST }]}>
                <Text style={[{ fontSize: 10.5, color: LIME, textAlign: 'center' }, ff(font.bodyBold, '800')]}>Today</Text>
              </View>
            ) : null}
            {pickedPt && fd !== today.day ? (
              <View style={[paceStyles.todayTag, { left: clampX(fx, 54), width: 54, backgroundColor: p.text }]}>
                <Text style={[{ fontSize: 10.5, color: p.card, textAlign: 'center' }, ff(font.bodyBold, '800')]}>{`Day ${fd}`}</Text>
              </View>
            ) : null}
            {tx < width - 110 && !(pickedPt && fx > width - 110) ? (
              <Text style={[paceStyles.axis, { right: 0, color: p.sub }, ff(font.bodySemi, '600')]}>{isCycle ? 'Next salary' : 'Month end'}</Text>
            ) : null}
          </>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {legendRows.map((r) => (
          <View key={r.key} style={[paceStyles.legend, { backgroundColor: p.soft }]}>
            {r.mark === 'solid' ? <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: r.color }} /> : null}
            {r.mark === 'dash' ? <View style={{ width: 14, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: r.color }} /> : null}
            {r.mark === 'dot' ? <View style={{ width: 14, height: 0, borderTopWidth: 2.5, borderStyle: 'dotted', borderColor: r.color }} /> : null}
            {r.mark === 'faint' ? <View style={{ width: 14, height: 2, borderRadius: 1, backgroundColor: r.color, opacity: 0.45 }} /> : null}
            <Text
              style={[
                { fontSize: 12, color: r.key === current.key ? p.text : p.sub },
                ff(r.key === current.key ? font.bodyBold : font.bodySemi, r.key === current.key ? '700' : '600'),
              ]}
            >
              {r.label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[{ fontSize: 11.5, color: p.sub, marginTop: 10 }, ff(font.bodySemi, '600')]}>
        {pickedPt ? 'Tap the point again to go back to today' : 'Tap any point to see that day'}
      </Text>
    </Card>
  );
};

const paceStyles = StyleSheet.create({
  gapChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  seg: { flexDirection: 'row', borderRadius: 999, padding: 3, marginTop: 14 },
  segBtn: { flex: 1, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  tick: { position: 'absolute', right: 0, fontSize: 10.5 },
  pill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  dayTag: { position: 'absolute', top: 0, width: 54, borderRadius: 6, paddingVertical: 2 },
  sidePill: { position: 'absolute', borderRadius: 7, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  ghostPill: { position: 'absolute', width: 96, borderRadius: 8, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  gapText: { position: 'absolute', fontSize: 11.5 },
  axis: { position: 'absolute', top: 2, fontSize: 10.5 },
  todayTag: { position: 'absolute', width: 48, borderRadius: 6, paddingVertical: 2 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
});

const Compare: React.FC<{ data: NetWorthData; theme: Theme }> = ({ data, theme }) => {
  const { model, flows, accounts } = data;
  const { p, font, isDark } = theme;
  const money = useMoney();
  const hidden = useContext(HiddenContext);

  const per = usePeriods();
  const isCycle = per.unit === 'cycle' && per.starts.length >= 2;
  // Account moves compare today with just before this salary landed (or this month began);
  // the day tracking began when that is earlier than tracking.
  const periodTs = (isCycle ? per.starts[per.starts.length - 1] : monthStartOf(model.now)) - 1;
  const ref = periodTs >= model.trackingStart - 1 ? { id: 'm1', ts: periodTs } : { id: 'start', ts: model.trackingStart - 1 };

  const thenMinor = model.valueAt(ref.ts);
  const change = model.liveMinor - thenMinor;
  const refDate = ref.id === 'start' ? model.trackingStart : ref.ts;

  const perAccount = useMemo(
    () =>
      accountChanges(
        accounts.map((a) => ({ id: a.id, balanceMinor: a.balanceMinor })),
        flows,
        ref.ts,
      ),
    [accounts, flows, ref.ts],
  );
  const peerThen = model.peerAt(ref.ts);
  const peerNow = model.peerAt(model.now);
  const unexplained = change - perAccount.reduce((sum, a) => sum + a.changeMinor, 0) - (peerNow - peerThen);

  // Money in and out over the same number of days, only when the last period is fully tracked.
  const monthStart = isCycle ? per.starts[per.starts.length - 1] : monthStartOf(model.now);
  const prevStart = isCycle ? per.starts[per.starts.length - 2] : monthStartOf(model.now, -1);
  const sameDays = useMemo(() => {
    if (model.trackingStart > prevStart) return null;
    const prevEnd = Math.min(prevStart + (model.now - monthStart), monthStart - 1);
    return {
      now: flowTotals(flows, monthStart, model.now),
      then: flowTotals(flows, prevStart, prevEnd),
    };
  }, [model, flows, monthStart, prevStart]);
  const daysIn = isCycle
    ? Math.round((new Date(model.now).setHours(0, 0, 0, 0) - new Date(monthStart).setHours(0, 0, 0, 0)) / DAY_MS) + 1
    : new Date(model.now).getDate();

  if (model.daysTracked < 1) {
    return (
      <EmptyTab
        theme={theme}
        icon="repeat"
        title="Nothing to compare yet"
        text="Comparisons open tomorrow, once there is a day behind you. A full month unlocks month against month."
      />
    );
  }

  const fig = (minor: number) => (hidden ? MASK : roundFigure(minor));
  // Same days, side by side.
  const kept = (t: { inMinor: number; outMinor: number }) => (t.inMinor > 0 ? Math.max(0, Math.min(100, ((t.inMinor - t.outMinor) / t.inMinor) * 100)) : null);
  const keptNow = sameDays ? kept(sameDays.now) : null;
  const keptThen = sameDays ? kept(sameDays.then) : null;
  const sameTile = (label: string, now: number, then: number, lessIsGood: boolean) => {
    const diff = now - then;
    const good = lessIsGood ? diff <= 0 : diff >= 0;
    return (
      <View style={[cmpStyles.tile, { backgroundColor: p.soft }]}>
        <Text style={[cmpStyles.eyebrow, { color: p.sub }, ff(font.bodyBold, '700')]}>{label}</Text>
        <Text style={[{ fontSize: 22, color: p.text, marginTop: 4, letterSpacing: -0.4 }, ff(font.display, '800')]} numberOfLines={1} adjustsFontSizeToFit>
          {fig(now)}
        </Text>
        {diff !== 0 ? (
          <View style={[cmpStyles.diffChip, { backgroundColor: good ? p.tint.green.bg : p.tint.coral.bg }]}>
            <Feather name={diff > 0 ? 'arrow-up' : 'arrow-down'} size={11} color={good ? p.tint.green.fg : p.tint.coral.fg} />
            <Text style={[{ fontSize: 11.5, color: good ? p.tint.green.fg : p.tint.coral.fg }, ff(font.bodyBold, '700')]}>
              {`${fig(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'}`}
            </Text>
          </View>
        ) : (
          <Text style={[{ fontSize: 11.5, color: p.sub, marginTop: 6 }, ff(font.bodySemi, '600')]}>Same as last time</Text>
        )}
      </View>
    );
  };

  // Account moves: where each one stood then (hollow dot) and now (solid dot), on one shared scale.
  const moves = [
    ...accounts.map((a, i) => ({
      key: a.id,
      name: isCashProfile(a.bank) ? 'Cash' : shortBankName(a.bank.bankName),
      then: perAccount[i].thenMinor,
      now: perAccount[i].nowMinor,
    })),
    ...(peerNow !== 0 || peerThen !== 0 ? [{ key: 'peer', name: 'Lent, net', then: peerThen, now: peerNow }] : []),
  ];
  const lo = Math.min(0, ...moves.flatMap((m) => [m.then, m.now]));
  const hi = Math.max(1, ...moves.flatMap((m) => [m.then, m.now]));
  const pos = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;

  // One closing line from the same days, side by side.
  const outDiff = sameDays ? sameDays.now.outMinor - sameDays.then.outMinor : 0;
  const banner = !sameDays
    ? null
    : outDiff < 0
      ? { good: true, text: `Spending is down ${fig(-outDiff)} on the same ${plural(daysIn, 'day')} last time.` }
      : outDiff > 0
        ? { good: false, text: `Spending is up ${fig(outDiff)} on the same ${plural(daysIn, 'day')} last time.` }
        : null;

  return (
    <>
      <PaceChart data={data} theme={theme} />

      {sameDays ? (
        <Card theme={theme}>
          <CardTitle theme={theme} title={`Same ${plural(daysIn, 'day')}, side by side`} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            {sameTile('Money in', sameDays.now.inMinor, sameDays.then.inMinor, false)}
            {sameTile('Money out', sameDays.now.outMinor, sameDays.then.outMinor, true)}
          </View>
          {keptNow !== null ? (
            <View style={{ marginTop: 16 }}>
              <View style={styles.rowBetween}>
                <Text style={[{ fontSize: 12.5, color: p.text }, ff(font.bodyBold, '700')]}>{`You kept ${Math.round(keptNow)}%`}</Text>
                {keptThen !== null ? (
                  <Text style={[{ fontSize: 12.5, color: p.sub }, ff(font.bodySemi, '600')]}>{`last time ${Math.round(keptThen)}%`}</Text>
                ) : null}
              </View>
              <View style={[cmpStyles.keptTrack, { backgroundColor: isDark ? 'rgba(255,138,107,0.25)' : '#FFE1D6' }]}>
                <View style={[cmpStyles.keptFill, { width: `${Math.max(2, keptNow)}%`, backgroundColor: isDark ? LIME : FOREST }]} />
              </View>
              {keptThen !== null ? <View style={[cmpStyles.keptMark, { left: `${keptThen}%`, backgroundColor: p.text }]} /> : null}
            </View>
          ) : null}
        </Card>
      ) : null}

      {moves.length > 0 ? (
        <Card theme={theme}>
          <CardTitle theme={theme} title="Account moves" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <View style={styles.legendItem}>
              <View style={[cmpStyles.dot, { backgroundColor: p.card, borderWidth: 2, borderColor: isDark ? '#7F9A8C' : '#9DB5A8' }]} />
              <Text style={[{ fontSize: 12, color: p.sub }, ff(font.bodySemi, '600')]}>{dayMonth(refDate)}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[cmpStyles.dot, { backgroundColor: isDark ? LIME : FOREST }]} />
              <Text style={[{ fontSize: 12, color: p.sub }, ff(font.bodySemi, '600')]}>Today</Text>
            </View>
          </View>
          <View style={{ marginTop: 10 }}>
            {moves.map((m) => {
              const delta = m.now - m.then;
              const a = pos(Math.min(m.then, m.now));
              const b = pos(Math.max(m.then, m.now));
              const rose = delta >= 0;
              return (
                <View key={m.key} style={cmpStyles.moveRow}>
                  <Text style={[{ width: 72, fontSize: 13.5, color: p.text }, ff(font.bodyBold, '700')]} numberOfLines={1}>
                    {m.name}
                  </Text>
                  <View style={cmpStyles.moveTrack}>
                    <View style={[cmpStyles.moveRail, { backgroundColor: p.soft }]} />
                    {delta !== 0 ? <View style={[cmpStyles.moveSpan, { left: `${a}%`, width: `${b - a}%`, backgroundColor: rose ? LIME : CORAL }]} /> : null}
                    <View
                      style={[
                        cmpStyles.moveDot,
                        { left: `${pos(m.then)}%`, backgroundColor: p.card, borderWidth: 2, borderColor: isDark ? '#7F9A8C' : '#9DB5A8' },
                      ]}
                    />
                    <View style={[cmpStyles.moveDot, { left: `${pos(m.now)}%`, backgroundColor: isDark ? LIME : FOREST }]} />
                  </View>
                  <Text
                    style={[
                      { width: 70, textAlign: 'right', fontSize: 13.5, color: delta === 0 ? p.sub : rose ? (isDark ? LIME : FOREST) : p.tint.coral.fg },
                      ff(font.bodyBold, '800'),
                    ]}
                    numberOfLines={1}
                  >
                    {delta === 0 ? '—' : hidden ? MASK : `${rose ? '+' : '−'}${roundFigure(Math.abs(delta))}`}
                  </Text>
                </View>
              );
            })}
            {Math.abs(unexplained) >= 100 ? (
              <View style={[styles.insight, { backgroundColor: p.tint.amber.bg, marginTop: 8 }]}>
                <Text style={[{ fontSize: 12.5, lineHeight: 17, color: p.tint.amber.fg }, ff(font.bodySemi, '600')]}>
                  {`${money(unexplained, true)} changed with no transaction recorded.`}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}

      {banner ? (
        <View style={cmpStyles.banner}>
          <View style={[cmpStyles.bannerIcon, { backgroundColor: banner.good ? LIME : CORAL }]}>
            <Feather name={banner.good ? 'trending-up' : 'trending-down'} size={20} color={banner.good ? FOREST : '#3A0D00'} />
          </View>
          <Text style={[{ flex: 1, fontSize: 14, lineHeight: 20, color: '#FFFFFF' }, ff(font.bodySemi, '600')]}>{banner.text}</Text>
        </View>
      ) : null}
    </>
  );
};

const cmpStyles = StyleSheet.create({
  eyebrow: { fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase' },
  tile: { flex: 1, borderRadius: 16, padding: 12 },
  diffChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  keptTrack: { height: 10, borderRadius: 5, marginTop: 8, overflow: 'hidden' },
  keptFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5 },
  keptMark: { position: 'absolute', bottom: -4, width: 2, height: 18, marginLeft: -1, borderRadius: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48 },
  moveTrack: { flex: 1, height: 14, justifyContent: 'center' },
  moveRail: { position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 1 },
  moveSpan: { position: 'absolute', height: 4, borderRadius: 2 },
  moveDot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, marginLeft: -7 },
  banner: { marginHorizontal: 16, marginTop: 14, backgroundColor: FOREST, borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  bannerIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

const STAIR_H = 220;
/** Room above the highest step and below the lowest for the change labels. */
const STAIR_TOP = 30;
const STAIR_BOTTOM = 26;

/** A period that moved no money at all: usually an account that was not syncing. */
const isQuiet = (r: MonthRow) => !r.isCurrent && r.changeMinor === 0 && r.inMinor === 0 && r.outMinor === 0;
const longMonth = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { month: 'long' });

/** Net worth as a staircase: one step per period, at the level it closed. */
const Staircase: React.FC<{ rows: MonthRow[]; theme: Theme; liveMinor: number }> = ({ rows, theme, liveMinor }) => {
  const { p, font, isDark } = theme;
  const hidden = useContext(HiddenContext);
  const [width, setWidth] = useState(0);
  const shown = rows.slice(-12);
  if (shown.length === 0) return null;

  const ink = isDark ? LIME : FOREST;
  const closeOf = (r: MonthRow) => (r.isCurrent ? liveMinor : r.closeMinor);
  const levels = [shown[0].openMinor, ...shown.map(closeOf)];
  const lo = Math.min(...levels);
  const hi = Math.max(...levels);
  const span = hi - lo || 1;
  const step = width / shown.length;
  const y = (v: number) => STAIR_TOP + (1 - (v - lo) / span) * (STAIR_H - STAIR_TOP - STAIR_BOTTOM);
  const signed = (v: number) => (hidden ? MASK : `${v > 0 ? '+' : '−'}${roundFigure(Math.abs(v))}`);
  const amt = (v: number) => (hidden ? MASK : roundFigure(v));

  // One stroke per step so each can take its own colour: up = ink, down = coral, still = grey dashes.
  const segs = shown.map((r, i) => {
    const x0 = i * step;
    const x1 = (i + 1) * step;
    const from = y(i === 0 ? r.openMinor : closeOf(shown[i - 1]));
    const to = y(closeOf(r));
    return { r, x0, x1, from, to, d: `M${x0.toFixed(1)},${from.toFixed(1)} V${to.toFixed(1)} H${x1.toFixed(1)}` };
  });
  const area = `M0,${segs[0].from.toFixed(1)} ${segs.map((s) => `V${s.to.toFixed(1)} H${s.x1.toFixed(1)}`).join(' ')} V${STAIR_H} H0 Z`;

  // Runs of two or more quiet periods get one label instead of a row of zeros.
  const runs: { from: number; to: number }[] = [];
  shown.forEach((r, i) => {
    if (!isQuiet(r)) return;
    const last = runs[runs.length - 1];
    if (last && last.to === i - 1) last.to = i;
    else runs.push({ from: i, to: i });
  });

  return (
    <View>
      <View style={{ height: STAIR_H }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <>
            <Svg width={width} height={STAIR_H}>
              <SvgLine x1={0} y1={STAIR_H - 1} x2={width} y2={STAIR_H - 1} stroke={p.line} />
              <Path d={area} fill={isDark ? 'rgba(184,243,107,0.10)' : 'rgba(184,243,107,0.2)'} />
              {runs
                .filter((run) => run.to > run.from)
                .map((run) => (
                  <Path
                    key={`run${run.from}`}
                    d={`M${(run.from * step + 2).toFixed(1)},${(segs[run.from].to - 14).toFixed(1)} h${((run.to - run.from + 1) * step - 4).toFixed(1)} v28 h${(-((run.to - run.from + 1) * step - 4)).toFixed(1)} Z`}
                    fill={p.soft}
                  />
                ))}
              {segs.map((s) => {
                const quiet = s.r.changeMinor === 0;
                const down = s.r.changeMinor < 0;
                return (
                  <Path
                    key={s.r.monthStart}
                    d={s.d}
                    stroke={quiet ? (isDark ? '#7F9A8C' : '#9DB5A8') : down ? CORAL : ink}
                    strokeWidth={3}
                    strokeDasharray={quiet ? '6 5' : undefined}
                    strokeLinejoin="round"
                    fill="none"
                  />
                );
              })}
              <Circle cx={width - 4} cy={segs[segs.length - 1].to} r={6} fill={LIME} stroke={FOREST} strokeWidth={2.5} />
            </Svg>

            {/* Each step carries the amount net worth closed at; a run of still periods shows it once. */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {segs.map((seg, i) => {
                const run = runs.find((r) => r.to > r.from && i >= r.from && i <= r.to);
                if (run && i !== run.from) return null;
                const amount = closeOf(seg.r);
                if (seg.r.isCurrent) {
                  const w = Math.max(step, 70);
                  return (
                    <View
                      key={seg.r.monthStart}
                      style={[
                        stairStyles.chip,
                        { left: Math.max(0, Math.min(width - w, seg.x0 + step / 2 - w / 2)), top: Math.max(0, seg.to - 28), width: w, backgroundColor: FOREST },
                      ]}
                    >
                      <Text style={[{ fontSize: 12, textAlign: 'center', color: LIME }, ff(font.bodyBold, '800')]} numberOfLines={1}>
                        {amt(amount)}
                      </Text>
                    </View>
                  );
                }
                const span = run ? (run.to - run.from + 1) * step : step;
                const n = run ? run.to - run.from + 1 : 1;
                return (
                  <Text
                    key={seg.r.monthStart}
                    style={[stairStyles.level, { left: seg.x0, width: span, top: Math.max(0, seg.to - 19), color: p.text }, ff(font.bodyBold, '800')]}
                    numberOfLines={1}
                  >
                    {run && span >= 110 ? `${amt(amount)} · ${n} the same` : amt(amount)}
                  </Text>
                );
              })}
            </View>
          </>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {shown.map((r) => (
          <Text
            key={r.monthStart}
            style={[
              { flex: 1, textAlign: 'center', fontSize: 10.5, color: r.isCurrent ? ink : p.sub },
              ff(r.isCurrent ? font.bodyBold : font.bodySemi, r.isCurrent ? '800' : '600'),
            ]}
            numberOfLines={1}
          >
            {shortMonth(r.monthStart)}
          </Text>
        ))}
      </View>
      {/* The change in each period, under its month. */}
      <View style={{ flexDirection: 'row', marginTop: 2 }}>
        {shown.map((r) => (
          <Text
            key={r.monthStart}
            style={[
              { flex: 1, textAlign: 'center', fontSize: 10, color: r.changeMinor > 0 ? ink : r.changeMinor < 0 ? p.tint.coral.fg : p.sub },
              ff(font.bodyBold, '700'),
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {r.changeMinor === 0 ? '–' : signed(r.changeMinor)}
          </Text>
        ))}
      </View>
    </View>
  );
};

const stairStyles = StyleSheet.create({
  chip: { position: 'absolute', borderRadius: 999, paddingVertical: 2 },
  runLabel: { position: 'absolute', textAlign: 'center', fontSize: 11 },
  level: { position: 'absolute', textAlign: 'center', fontSize: 10.5 },
  count: { flex: 1, borderRadius: 18, borderWidth: 1, padding: 12 },
  badge: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  segBtn: { height: 28, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});

const History: React.FC<{
  data: NetWorthData;
  rows: MonthRow[];
  theme: Theme;
  /** Salary mode only: switch between salary cycles and calendar months (statement view). */
  view?: { value: 'cycle' | 'month'; onChange: (v: 'cycle' | 'month') => void };
}> = ({ data, rows, theme, view }) => {
  const { model } = data;
  const { p, font, isDark } = theme;
  const money = useMoney();
  const hidden = useContext(HiddenContext);
  const per = usePeriods();
  const isCycle = per.unit === 'cycle';
  const [open, setOpen] = useState<number | null>(null);

  if (model.daysTracked < 1) {
    return (
      <EmptyTab
        theme={theme}
        icon="calendar"
        title="Your history starts today"
        text={`The first month closes on ${dayMonth(monthStartOf(model.now, 1) - 1)}. Every month after that gets its own row here.`}
      />
    );
  }

  const ink = isDark ? LIME : FOREST;
  const fig = (v: number) => (hidden ? MASK : roundFigure(v));
  const signed = (v: number) => (hidden ? MASK : `${v > 0 ? '+' : v < 0 ? '−' : ''}${roundFigure(Math.abs(v))}`);
  const startMinor = model.series[0].minor;
  const totalChange = model.liveMinor - startMinor;
  const many = isCycle ? 'salaries' : 'months';
  const nameOf = (r: MonthRow) => (isCycle ? `${longMonth(r.monthStart)} salary` : monthName(r.monthStart));

  const grew = rows.filter((r) => r.changeMinor > 0).length;
  const dipped = rows.filter((r) => r.changeMinor < 0).length;
  const flat = rows.length - grew - dipped;
  const finished = rows.filter((r) => !r.isCurrent);
  const best = finished.reduce<MonthRow | null>((b, r) => (r.changeMinor > 0 && (!b || r.changeMinor > b.changeMinor) ? r : b), null);
  const worst = finished.reduce<MonthRow | null>((b, r) => (r.changeMinor < 0 && (!b || r.changeMinor < b.changeMinor) ? r : b), null);

  // Newest first, with runs of two or more quiet periods folded into one row.
  type Item = { kind: 'row'; r: MonthRow } | { kind: 'quiet'; rows: MonthRow[] };
  const items: Item[] = [];
  [...rows].reverse().forEach((r) => {
    const last = items[items.length - 1];
    if (isQuiet(r) && last && last.kind === 'quiet') last.rows.push(r);
    else if (isQuiet(r)) items.push({ kind: 'quiet', rows: [r] });
    else items.push({ kind: 'row', r });
  });
  const listItems: Item[] = items.map((it) => (it.kind === 'quiet' && it.rows.length === 1 ? { kind: 'row', r: it.rows[0] } : it));

  const counter = (label: string, n: number, color: string) => (
    <View style={[stairStyles.count, { backgroundColor: p.card, borderColor: p.line }]}>
      <Text style={[{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: p.sub }, ff(font.bodyBold, '700')]}>{label}</Text>
      <Text style={[{ fontSize: 24, color, marginTop: 2 }, ff(font.display, '800')]}>{n}</Text>
    </View>
  );

  return (
    <>
      <Card theme={theme}>
        <View style={styles.rowBetween}>
          <Text style={[{ fontSize: 11.5, letterSpacing: 0.8, textTransform: 'uppercase', color: p.sub }, ff(font.bodyBold, '700')]}>
            {`Since ${dayMonth(model.trackingStart)}`}
          </Text>
          {view ? (
            <View style={[paceStyles.seg, { backgroundColor: p.soft, marginTop: 0 }]}>
              {(
                [
                  { id: 'cycle', label: 'Salaries' },
                  { id: 'month', label: 'Months' },
                ] as const
              ).map((o) => {
                const on = view.value === o.id;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => view.onChange(o.id)}
                    style={[stairStyles.segBtn, on && { backgroundColor: p.card }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[{ fontSize: 11.5, color: on ? p.text : p.sub }, ff(on ? font.bodyBold : font.bodySemi, on ? '700' : '600')]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        <Text style={[{ fontSize: 38, letterSpacing: -1.2, marginTop: 8, color: totalChange < 0 ? p.tint.coral.fg : ink }, ff(font.display, '800')]}>
          {totalChange === 0 ? fig(0) : signed(totalChange)}
        </Text>
        <Text style={[{ fontSize: 13, color: p.sub, marginTop: 2 }, ff(font.bodySemi, '600')]}>
          {`${fig(startMinor)} → ${fig(model.liveMinor)} over ${rows.length} ${rows.length === 1 ? (isCycle ? 'salary' : 'month') : many}`}
        </Text>
        <View style={{ marginTop: 16 }}>
          <Staircase rows={rows} theme={theme} liveMinor={model.liveMinor} />
        </View>
      </Card>

      <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 14 }}>
        {counter('Grew', grew, ink)}
        {counter('Dipped', dipped, p.tint.coral.fg)}
        {counter('Flat', flat, p.sub)}
      </View>

      <SectionLabel style={{ marginHorizontal: 20 }} right={<Text style={[{ fontSize: 12, color: p.sub }, ff(font.bodySemi, '600')]}>Tap for details</Text>}>
        {isCycle ? 'Every salary' : 'Every month'}
      </SectionLabel>
      <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line, marginTop: 0, paddingVertical: 4 }]}>
        {listItems.map((it, i) => {
          const divider = i < listItems.length - 1 ? { borderBottomWidth: 1, borderBottomColor: p.divider } : null;
          if (it.kind === 'quiet') {
            const newest = it.rows[0];
            const oldest = it.rows[it.rows.length - 1];
            return (
              <View key={`quiet${newest.monthStart}`} style={[histStyles.row, divider]}>
                <View style={[stairStyles.badge, histStyles.quietBadge, { borderColor: p.line, backgroundColor: p.soft }]}>
                  <Text style={[{ fontSize: 11, color: p.sub }, ff(font.bodyBold, '800')]}>{`${it.rows.length}×`}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[{ fontSize: 14, color: p.text }, ff(font.bodyBold, '700')]}
                  >{`${shortMonth(oldest.monthStart)} – ${shortMonth(newest.monthStart)} ${many}`}</Text>
                  <Text style={[{ fontSize: 12, color: p.tint.amber.fg, marginTop: 2 }, ff(font.bodyBold, '700')]}>No money moved · check bank sync</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[{ fontSize: 14, color: p.sub }, ff(font.bodyBold, '700')]}>{fig(0)}</Text>
                  <Text style={[{ fontSize: 12, color: p.sub, marginTop: 2 }, ff(font.bodySemi, '600')]}>{fig(newest.closeMinor)}</Text>
                </View>
              </View>
            );
          }
          const r = it.r;
          const v = r.changeMinor;
          const isOpen = open === r.monthStart;
          const tag = r === best ? ' · best yet' : r === worst ? ' · toughest' : '';
          const sub = r.isCurrent
            ? isCycle
              ? `${plural(r.days, 'day')} in`
              : `${new Date(model.now).getDate()} days in`
            : `${r.isPartial ? `From ${dayMonth(r.fromTs)}` : dayMonth(r.fromTs)} – ${dayMonth(r.endTs)}${tag}${
                isCycle && isTransitionCycle('salary', r.days) ? ' · unusual length' : ''
              }`;
          const badgeBg = r.isCurrent ? FOREST : v > 0 ? p.tint.green.bg : v < 0 ? p.tint.coral.bg : p.soft;
          const badgeFg = r.isCurrent ? LIME : v > 0 ? p.tint.green.fg : v < 0 ? p.tint.coral.fg : p.sub;
          return (
            <Pressable
              key={r.monthStart}
              onPress={() => setOpen(isOpen ? null : r.monthStart)}
              style={divider}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${nameOf(r)}, ${money(closeOrLive(r, model.liveMinor))}, ${money(v, true)}`}
            >
              <View style={histStyles.row}>
                <View style={[stairStyles.badge, { backgroundColor: badgeBg }]}>
                  <Text style={[{ fontSize: 10.5, color: badgeFg, letterSpacing: 0.4 }, ff(font.bodyBold, '800')]}>
                    {shortMonth(r.monthStart).toUpperCase()}
                  </Text>
                  {r.isCurrent ? <Text style={[{ fontSize: 9, color: MIST }, ff(font.bodyBold, '700')]}>live</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 14, color: p.text }, ff(font.bodyBold, '700')]} numberOfLines={1}>
                    {nameOf(r)}
                  </Text>
                  <Text style={[{ fontSize: 12, color: p.sub, marginTop: 2 }, ff(font.bodySemi, '600')]} numberOfLines={1}>
                    {sub}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[{ fontSize: 14, color: v > 0 ? ink : v < 0 ? p.tint.coral.fg : p.sub }, ff(font.bodyBold, '800')]}>
                    {v === 0 ? 'No change' : signed(v)}
                  </Text>
                  <Text style={[{ fontSize: 12, color: p.sub, marginTop: 2 }, ff(font.bodySemi, '600')]}>{fig(closeOrLive(r, model.liveMinor))}</Text>
                </View>
              </View>
              {isOpen ? (
                <View style={[styles.monthDetail, { backgroundColor: p.soft, marginTop: 0, marginBottom: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontSize: 11.5, color: p.sub }, ff(font.body, '500')]}>Started at</Text>
                    <Text style={[{ fontSize: 13, color: p.text, marginTop: 2 }, ff(font.bodyBold, '700')]} numberOfLines={1} adjustsFontSizeToFit>
                      {money(r.openMinor)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontSize: 11.5, color: p.sub }, ff(font.body, '500')]}>Money in</Text>
                    <Text style={[{ fontSize: 13, color: p.link, marginTop: 2 }, ff(font.bodyBold, '700')]} numberOfLines={1} adjustsFontSizeToFit>
                      {money(r.inMinor)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontSize: 11.5, color: p.sub }, ff(font.body, '500')]}>Money out</Text>
                    <Text style={[{ fontSize: 13, color: p.danger, marginTop: 2 }, ff(font.bodyBold, '700')]} numberOfLines={1} adjustsFontSizeToFit>
                      {money(r.outMinor)}
                    </Text>
                  </View>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Text style={[{ fontSize: 12, color: p.sub, lineHeight: 17, marginHorizontal: 24, marginTop: 14 }, ff(font.body, '500')]}>
        {"Past values are worked back from today's balances and your recorded transactions, so a period with missed transactions can be slightly off."}
      </Text>
    </>
  );
};

/** What a period closed at; the current one is still open, so it is today's value. */
const closeOrLive = (r: MonthRow, liveMinor: number) => (r.isCurrent ? liveMinor : r.closeMinor);

const histStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  quietBadge: { borderWidth: 1.5, borderStyle: 'dashed' },
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

type TabId = 'overview' | 'compare' | 'history';
const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'compare', label: 'Compare' },
  { id: 'history', label: 'History' },
];

export const NetWorthScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { p, font, isDark } = useAdminTheme();
  const theme: Theme = useMemo(() => ({ p, font, isDark }), [p, font, isDark]);
  const data = useNetWorth();
  const { sync } = useSyncDb();

  const [tab, setTab] = useState<TabId>('overview');
  const [hidden, setHidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // With a salary day set, growth is measured per salary cycle (pre-salary point to pre-salary
  // point). Calendar months stay available in History as a statement view.
  const { cycle, credits } = useMoneyCycle();
  const monthPeriods = useMemo(() => calendarPeriods(monthStartsSince(data.model)), [data.model]);
  const salaryPeriods = useMemo(
    () => (cycle.mode === 'salary' ? cyclePeriods(cycleStartsSince(data.model.trackingStart, data.model.now, cycle.payday, credits, cycle.schedule)) : null),
    [cycle.mode, cycle.payday, credits, data.model],
  );
  const [historyView, setHistoryView] = useState<'cycle' | 'month'>('cycle');
  const periods = salaryPeriods ?? monthPeriods;
  const historyPeriods = salaryPeriods && historyView === 'cycle' ? salaryPeriods : monthPeriods;

  const rows = useMemo(() => periodRows(data.model, data.flows, periods.starts), [data, periods]);
  const historyRows = useMemo(
    () => (historyPeriods === periods ? rows : periodRows(data.model, data.flows, historyPeriods.starts)),
    [data, historyPeriods, periods, rows],
  );
  const places = data.accounts.length + (data.lentMinor > 0 ? 1 : 0) + (data.borrowedMinor > 0 ? 1 : 0);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await sync();
      await syncService.fetchAnalytics(true);
    } catch {
      // Offline: the screen keeps showing what it already has.
    } finally {
      setRefreshing(false);
    }
  }, [sync]);

  return (
    <HiddenContext.Provider value={hidden}>
      <View style={{ flex: 1, backgroundColor: p.bg }}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.roundBtn, { borderColor: p.line, backgroundColor: p.card }]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="chevron-left" size={20} color={p.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[{ fontSize: 26, letterSpacing: -0.5, color: p.text }, ff(font.displayBold, '700')]}>Net worth</Text>
            <Text style={[{ fontSize: 13, color: p.sub, marginTop: 3 }, ff(font.body, '500')]} numberOfLines={1}>
              {places > 0 ? `Across ${plural(places, 'place')}` : 'No accounts linked yet'}
            </Text>
          </View>
          <Pressable
            onPress={() => setHidden((v) => !v)}
            style={[styles.roundBtn, { borderColor: p.line, backgroundColor: p.card }]}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show amounts' : 'Hide amounts'}
          >
            <Feather name={hidden ? 'eye-off' : 'eye'} size={19} color={p.text} />
          </Pressable>
        </View>

        <Segmented
          options={TABS}
          value={tab}
          onChange={(next) => {
            setTab(next);
            scrollRef.current?.scrollTo({ y: 0, animated: false });
          }}
          style={{ marginHorizontal: 16, marginTop: 6, marginBottom: 14 }}
        />

        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingBottom: Math.max(insets.bottom, 16) + 24,
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16A34A" colors={['#16A34A']} />}
        >
          <PeriodContext.Provider value={periods}>
            {tab === 'overview' ? <Overview data={data} rows={rows} theme={theme} /> : null}
            {tab === 'compare' ? <Compare data={data} theme={theme} /> : null}
          </PeriodContext.Provider>
          <PeriodContext.Provider value={historyPeriods}>
            {tab === 'history' ? (
              <History data={data} rows={historyRows} theme={theme} view={salaryPeriods ? { value: historyView, onChange: setHistoryView } : undefined} />
            ) : null}
          </PeriodContext.Provider>
        </ScrollView>
      </View>
    </HiddenContext.Provider>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  hero: {
    marginHorizontal: 16,
    backgroundColor: FOREST,
    borderRadius: 28,
    padding: 22,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: FOREST_RAISED,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIME },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
  amount: {
    fontSize: 44,
    color: '#FFFFFF',
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
  },
  paise: { fontSize: 24, color: MIST, marginLeft: 2 },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    flexWrap: 'wrap',
  },
  pickedPill: {
    backgroundColor: '#F3F6F4',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: LIME,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sincePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(181,206,193,0.5)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  axisText: { fontSize: 11, color: MIST },
  rangeRow: {
    flexDirection: 'row',
    backgroundColor: FOREST_RAISED,
    borderRadius: 999,
    padding: 4,
    marginTop: 14,
  },
  rangeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTiles: { flexDirection: 'row', gap: 8, marginTop: 10 },
  heroTile: {
    flex: 1,
    backgroundColor: FOREST_RAISED,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  startTile: {
    backgroundColor: FOREST_RAISED,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  arrowDisc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: FOREST_RAISED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: FOREST_RAISED,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 16,
  },

  card: {
    marginHorizontal: 16,
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
  },
  cardTitle: { fontSize: 17, letterSpacing: -0.2 },
  cardSub: { fontSize: 13, marginTop: 3 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  track: { height: 10, borderRadius: 5, marginTop: 6, overflow: 'hidden' },
  trackFill: { position: 'absolute', top: 0, height: 10, borderRadius: 5 },
  placeLogo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
  },
  healthCard: {
    height: 236,
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
    justifyContent: 'space-between',
  },
  healthLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  healthLabelDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthDots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    marginHorizontal: 22,
  },
  healthDot: { width: 6, height: 6, borderRadius: 3 },
  stepRow: { flexDirection: 'row', gap: STEP_GAP, marginTop: 14 },
  stepBlock: { position: 'absolute', left: 0, right: 0, borderRadius: 8 },
  stepLink: {
    position: 'absolute',
    left: -STEP_GAP,
    width: STEP_GAP,
    borderTopWidth: 1.5,
  },
  stepAmount: {
    position: 'absolute',
    left: -6,
    right: -6,
    textAlign: 'center',
    fontSize: 11,
  },
  keptBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  keptChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 12,
  },
  shareBar: {
    flexDirection: 'row',
    gap: 3,
    height: 14,
    marginTop: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 56 },

  regentCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: FOREST,
    borderRadius: 22,
    padding: 18,
  },
  regentBtn: {
    alignSelf: 'flex-start',
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: LIME,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },

  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  pickChip: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  insight: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 14,
  },
  pairTrack: { flex: 1, height: 12, borderRadius: 6, overflow: 'hidden' },

  liveTag: {
    backgroundColor: LIME,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  miniTrack: { height: 6, borderRadius: 3, marginTop: 10, overflow: 'hidden' },
  monthDetail: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
});
