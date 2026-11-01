import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import Svg, { Path, Circle, G, Text as SvgText } from 'react-native-svg';
import { getCategory } from '../constants/categories';

/* "Where it went" petal chart: one petal per category, petal length ∝ √amount. */

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
const MIST = '#B5CEC1';
const UP = '#FFA8A8';

/** Light tints that read on the forest card when two categories share a family colour. */
const SPARE_COLORS = ['#FFD43B', '#63E6BE', '#E599F7', '#FFC078', '#A5D8FF'];

export interface PetalCategory {
  key: string;
  label: string;
  value: number;
  /** Spend over the same elapsed days last month. */
  previousValue?: number;
}

export interface PetalFonts {
  body?: string;
  bodySemi?: string;
  bodyBold?: string;
  display?: string;
  displayBold?: string;
}

const INNER = 22;
const MIN_R = 34;
const LABEL_W = 84;
const LABEL_H = 34;
const LABEL_GAP = 8;

const formatINR = (value: number) =>
  `₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

/** "▲ 12%" / "▼ 6%" / "New" vs last month; empty when there is nothing to compare. */
const changeVs = (value: number, previous?: number) => {
  if (previous === undefined || previous === null) return null;
  // If baseline and current are small, suppress noisy percentage spikes
  if (previous < 300 && value < 300) return null;
  if (Math.abs(value - previous) < 150) return { text: 'Similar', color: MIST };

  if (previous <= 0) {
    // Show 'New' in neutral MIST, never alarmist red!
    return value >= 300 ? { text: 'New', color: MIST } : null;
  }

  const pct = Math.round(((value - previous) / previous) * 100);
  if (Math.abs(pct) <= 5) return { text: 'Same', color: MIST };

  // For big jumps, only show multiplier if baseline was substantial (>= 500)
  if (pct >= 200 && previous >= 500) {
    return { text: `▲ ${(value / previous).toFixed(1).replace(/\.0$/, '')}×`, color: UP };
  }

  return pct > 0 ? { text: `▲ ${pct}%`, color: UP } : { text: `▼ ${Math.abs(pct)}%`, color: LIME };
};

export const SpendingPetalCard = ({
  categories,
  selectedKey,
  onSelect,
  onOpenBudgets,
  hidden,
  monthLabel,
  previousMonthShort,
  previousTotal,
  font,
}: {
  categories: PetalCategory[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  onOpenBudgets?: () => void;
  hidden?: boolean;
  monthLabel: string;
  /** e.g. "Oct", used in "vs Oct". */
  previousMonthShort: string;
  /** Total spend over the same elapsed days last month. */
  previousTotal?: number;
  font: PetalFonts;
}) => {
  const [width, setWidth] = useState(0);
  const total = useMemo(() => categories.reduce((s, c) => s + c.value, 0), [categories]);
  const amount = (v: number) => (hidden ? '₹ •••' : formatINR(v));

  const cx = width / 2;
  // Big flower like the design; names sit inside the big petals, so no side margin is reserved.
  const maxR = Math.max(70, Math.min(118, width / 2 - 40));

  const petals = useMemo(() => {
    const max = Math.max(...categories.map((c) => c.value), 1);
    const used = new Set<string>();
    let spare = 0;
    const slot = 360 / Math.max(categories.length, 1);
    const wedge = slot - 4;
    return categories.map((c, i) => {
      let color = getCategory(c.key === 'others' ? 'other' : c.key).style.softFgDark;
      if (used.has(color)) color = SPARE_COLORS[spare++ % SPARE_COLORS.length];
      used.add(color);
      const mid = -90 + i * slot;
      const radius = MIN_R + (maxR - MIN_R) * Math.sqrt(c.value / max);
      // Name + amount + % fit inside a petal when it is long and wide enough at the text spot.
      const textR = INNER + (radius - INNER) * 0.6;
      const labelInside = radius - INNER >= 62 && (textR * wedge * Math.PI) / 180 >= 60;
      return {
        ...c,
        color,
        pct: total > 0 ? Math.round((c.value / total) * 100) : 0,
        radius,
        textR,
        labelInside,
        pctInside: !labelInside && radius - INNER >= 26,
        mid,
        a0: mid - wedge / 2,
        a1: mid + wedge / 2,
        change: changeVs(c.value, c.previousValue),
      };
    });
  }, [categories, total, maxR]);

  const point = (r: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const p2s = (r: number, deg: number) => {
    const p = point(r, deg);
    return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  };
  const petalPath = (r: number, a0: number, a1: number) =>
    `M ${p2s(INNER, a0)} L ${p2s(r, a0)} A ${r} ${r} 0 0 1 ${p2s(r, a1)} ` +
    `L ${p2s(INNER, a1)} A ${INNER} ${INNER} 0 0 0 ${p2s(INNER, a0)} Z`;

  /** Places a label box just outside the petal tip, anchored by which side of the chart it is on. */
  const labelBox = (r: number, deg: number) => {
    const { x, y } = point(r + LABEL_GAP, deg);
    const cos = Math.cos((deg * Math.PI) / 180);
    const sin = Math.sin((deg * Math.PI) / 180);
    const align: 'left' | 'right' | 'center' = cos > 0.35 ? 'left' : cos < -0.35 ? 'right' : 'center';
    const left = align === 'left' ? x : align === 'right' ? x - LABEL_W : x - LABEL_W / 2;
    const top = sin < -0.35 ? y - LABEL_H : sin > 0.35 ? y : y - LABEL_H / 2;
    return { left: Math.max(0, Math.min(left, width - LABEL_W)), top, align };
  };

  // Chart height: the ring, plus room above/below for outside labels on short vertical petals.
  const SEL_GROW = 6;
  let above = maxR + SEL_GROW + 2;
  let below = maxR + SEL_GROW + 2;
  if (petals.length > 1) {
    for (const p of petals) {
      if (p.labelInside) continue;
      const sin = Math.sin((p.mid * Math.PI) / 180);
      const extent = p.radius + SEL_GROW + LABEL_GAP + (Math.abs(sin) > 0.35 ? LABEL_H : LABEL_H / 2);
      if (sin < 0) above = Math.max(above, extent * Math.max(Math.abs(sin), 0.5));
      else below = Math.max(below, extent * Math.max(Math.abs(sin), 0.5));
    }
  }
  const cy = above;
  const chartH = above + below;

  const selected = petals.find((p) => p.key === selectedKey);
  const headChange = selected
    ? selected.change
    : changeVs(total, previousTotal !== undefined && previousTotal > 0 ? previousTotal : undefined);

  return (
    <View>
      <View style={styles.ring} pointerEvents="none" />

      <View style={styles.headerRow}>
        <Text style={[styles.title, { fontFamily: font.displayBold, fontWeight: font.displayBold ? undefined : '700' }]}>
          Where it went
        </Text>
        {onOpenBudgets ? (
          <Pressable onPress={onOpenBudgets} hitSlop={10} accessibilityRole="button">
            <Text style={[styles.link, { fontFamily: font.bodyBold, fontWeight: font.bodyBold ? undefined : '700' }]}>
              Budgets
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ marginTop: 10 }}>
        <Text style={[styles.headLabel, { fontFamily: font.bodySemi }]}>
          {selected ? `${selected.label} · ${selected.pct}% of spending` : `Spent in ${monthLabel}`}
        </Text>
        <View style={styles.headValueRow}>
          <Text style={[styles.headValue, { fontFamily: font.display, fontWeight: font.display ? undefined : '800' }]}>
            {amount(selected ? selected.value : total)}
          </Text>
          {headChange ? (
            <View
              style={[
                styles.changePill,
                {
                  backgroundColor:
                    headChange.color === LIME
                      ? 'rgba(184,243,107,0.16)'
                      : headChange.color === MIST
                      ? 'rgba(181,206,193,0.16)'
                      : 'rgba(255,168,168,0.16)',
                },
              ]}
            >
              <Text style={[styles.changePillText, { color: headChange.color, fontFamily: font.bodyBold }]}>
                {headChange.text} vs {previousMonthShort}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View
        style={[styles.chartArea, { height: chartH }]}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 && (
          <Animated.View entering={ZoomIn.delay(150).duration(500)} style={StyleSheet.absoluteFill}>
            <Svg width={width} height={chartH}>
              <Circle cx={cx} cy={cy} r={maxR} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <Circle cx={cx} cy={cy} r={(maxR + MIN_R) / 2} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              {petals.length === 1 ? (
                <G onPress={() => onSelect(selectedKey === petals[0].key ? null : petals[0].key)}>
                  <Circle cx={cx} cy={cy} r={(maxR + INNER) / 2} fill="none" stroke={petals[0].color} strokeWidth={maxR - INNER} />
                </G>
              ) : (
                petals.map((p) => {
                  const isSel = p.key === selectedKey;
                  const r = p.radius + (isSel ? SEL_GROW : 0);
                  const inside = point((INNER + r) / 2 + 2, p.mid);
                  const t = point(p.textR, p.mid);
                  return (
                    <G key={p.key} onPress={() => onSelect(isSel ? null : p.key)} opacity={selectedKey && !isSel ? 0.3 : 1}>
                      <Path d={petalPath(r, p.a0, p.a1)} fill={p.color} />
                      {p.labelInside ? (
                        <G>
                          <SvgText x={t.x} y={t.y - 14} fill={FOREST} fontSize={11} fontWeight="600" textAnchor="middle">
                            {p.label}
                          </SvgText>
                          <SvgText x={t.x} y={t.y + 3} fill={FOREST} fontSize={14} fontWeight="800" textAnchor="middle">
                            {amount(p.value)}
                          </SvgText>
                          <SvgText x={t.x} y={t.y + 18} fill={FOREST} fontSize={11} fontWeight="700" textAnchor="middle" opacity={0.75}>
                            {`${p.pct}%`}
                          </SvgText>
                        </G>
                      ) : p.pctInside ? (
                        <SvgText
                          x={inside.x}
                          y={inside.y + 4}
                          fill={FOREST}
                          fontSize={12}
                          fontWeight="800"
                          textAnchor="middle"
                        >
                          {`${p.pct}%`}
                        </SvgText>
                      ) : null}
                    </G>
                  );
                })
              )}
              <Circle cx={cx} cy={cy} r={INNER - 4} fill={FOREST} />
              <Circle cx={cx} cy={cy} r={5} fill={LIME} />
            </Svg>

            {petals.length > 1 &&
              petals.filter((p) => !p.labelInside).map((p) => {
                const isSel = p.key === selectedKey;
                const r = p.radius + (isSel ? SEL_GROW : 0);
                const box = labelBox(r, p.mid);
                const pctOutside = !p.pctInside;
                return (
                  <Pressable
                    key={`label_${p.key}`}
                    onPress={() => onSelect(isSel ? null : p.key)}
                    style={[
                      styles.petalLabel,
                      { left: box.left, top: box.top, alignItems: box.align === 'left' ? 'flex-start' : box.align === 'right' ? 'flex-end' : 'center' },
                      selectedKey && !isSel && { opacity: 0.35 },
                    ]}
                  >
                    <Text style={[styles.petalName, { fontFamily: font.bodySemi }]} numberOfLines={1}>
                      {p.label}
                      {pctOutside ? ` · ${p.pct}%` : ''}
                    </Text>
                    <Text style={[styles.petalAmount, { fontFamily: font.bodyBold, fontWeight: font.bodyBold ? undefined : '700' }]} numberOfLines={1}>
                      {amount(p.value)}
                    </Text>
                  </Pressable>
                );
              })}
          </Animated.View>
        )}
      </View>

      <View style={styles.legend}>
        {petals.map((p) => {
          const isSel = p.key === selectedKey;
          return (
            <Pressable
              key={p.key}
              onPress={() => onSelect(isSel ? null : p.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              accessibilityLabel={`${p.label}, ${hidden ? '' : formatINR(p.value) + ', '}${p.pct} percent${
                p.change ? `, ${p.change.text} versus ${previousMonthShort}` : ''
              }. Show transactions`}
              style={[styles.chip, { borderColor: isSel ? p.color : 'rgba(255,255,255,0.08)' }]}
            >
              <View style={styles.chipLabelRow}>
                <View style={[styles.dot, { backgroundColor: p.color }]} />
                <Text style={[styles.chipLabel, { fontFamily: font.bodySemi }]} numberOfLines={1}>
                  {p.label}
                </Text>
              </View>
              <Text
                style={[styles.chipValue, { fontFamily: font.bodyBold, fontWeight: font.bodyBold ? undefined : '700' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {amount(p.value)}
                <Text style={[styles.chipPct, { fontFamily: font.bodySemi }]}>  {p.pct}%</Text>
              </Text>
              {p.change ? (
                <Text style={[styles.chipChange, { color: p.change.color, fontFamily: font.bodyBold }]} numberOfLines={1}>
                  {p.change.text} vs {previousMonthShort}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    alignSelf: 'center',
    top: 120,
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 1,
    borderColor: 'rgba(184,243,107,0.10)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    color: '#FFFFFF',
  },
  link: {
    fontSize: 13,
    color: LIME,
  },
  headLabel: {
    fontSize: 13,
    color: MIST,
  },
  headValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  headValue: {
    fontSize: 32,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  changePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  changePillText: {
    fontSize: 12,
  },
  chartArea: {
    marginTop: 8,
  },
  petalLabel: {
    position: 'absolute',
    width: LABEL_W,
    height: LABEL_H,
    justifyContent: 'center',
  },
  petalName: {
    fontSize: 11,
    color: MIST,
  },
  petalAmount: {
    fontSize: 13,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    flexBasis: '31%',
    flexGrow: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
  },
  chipLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  chipLabel: {
    flexShrink: 1,
    fontSize: 12,
    color: MIST,
  },
  chipValue: {
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  chipPct: {
    fontSize: 12,
    color: MIST,
  },
  chipChange: {
    fontSize: 11,
    marginTop: 2,
  },
});
