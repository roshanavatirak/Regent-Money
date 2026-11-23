// The month as a dial: one segment per day around a ring. Spend days grow outward with how much
// was spent, no-spend days are thin lime slivers, days ahead are dashed and payday is dark.
// Tapping a segment picks that day.
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

export interface DialDay {
  day: number;
  key: string;
  debits: number;
  /** 0–1, how this day's spending compares with the month's biggest day. */
  heat: number;
  past: boolean;
  tracked: boolean;
}

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
/** Degrees left empty between two days. */
const GAP = 2;

const polar = (c: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
};

/** A ring slice from r0 to r1 between two angles (0° = 3 o'clock, clockwise). */
const slice = (c: number, r0: number, r1: number, a0: number, a1: number) => {
  const p0 = polar(c, r0, a0);
  const p1 = polar(c, r1, a0);
  const p2 = polar(c, r1, a1);
  const p3 = polar(c, r0, a1);
  const big = a1 - a0 > 180 ? 1 : 0;
  return `M${p0.x} ${p0.y} L${p1.x} ${p1.y} A${r1} ${r1} 0 ${big} 1 ${p2.x} ${p2.y} L${p3.x} ${p3.y} A${r0} ${r0} 0 ${big} 0 ${p0.x} ${p0.y} Z`;
};

export const MonthDial: React.FC<{
  days: DialDay[];
  size: number;
  todayKey: string;
  selectedKey: string;
  /** Day of the month salary lands, when it falls in this month. */
  payday: number | null;
  onSelect: (key: string) => void;
  isDark: boolean;
  /** What sits in the middle of the ring. */
  children?: React.ReactNode;
  label: (d: DialDay) => string;
}> = ({ days, size, todayKey, selectedKey, payday, onSelect, isDark, children, label }) => {
  const c = size / 2;
  const r0 = size * 0.29;
  const maxOuter = size / 2 - 6;
  const per = 360 / Math.max(1, days.length);
  const ahead = isDark ? 'rgba(255,255,255,0.22)' : '#C9D6CF';
  const ink = isDark ? '#FFFFFF' : FOREST;
  const sub = isDark ? 'rgba(234,242,238,0.55)' : '#8A9A92';
  const labelDays = new Set([1, 8, 15, 22, 29]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {days.map((d, i) => {
          const a0 = -90 + i * per + GAP / 2;
          const a1 = a0 + per - GAP;
          const isPayday = payday === d.day;
          const spend = d.tracked && d.debits > 0;
          const future = !d.past;
          let t = 10;
          let fill = isDark ? LIME : LIME;
          let stroke = 'none';
          let dash: string | undefined;
          if (isPayday) {
            fill = isDark ? LIME : FOREST;
          } else if (spend) {
            t = 14 + d.heat * (maxOuter - r0 - 14);
            fill = d.heat > 0.7 ? '#E5533C' : d.heat > 0.3 ? '#FF8A6B' : '#FFB59F';
          } else if (future || !d.tracked) {
            t = 8;
            fill = 'none';
            stroke = ahead;
            dash = '2 2';
          }
          const selected = d.key === selectedKey;
          return (
            <Path
              key={d.key}
              d={slice(c, r0, r0 + t, a0, a1)}
              fill={fill}
              stroke={selected ? ink : stroke}
              strokeWidth={selected ? 2.5 : 1.2}
              strokeDasharray={selected ? undefined : dash}
              onPress={() => onSelect(d.key)}
              accessibilityLabel={label(d)}
            />
          );
        })}
        {days.map((d, i) => {
          if (!labelDays.has(d.day)) return null;
          const p = polar(c, r0 - 13, -90 + i * per + per / 2);
          return (
            <SvgText key={`l${d.key}`} x={p.x} y={p.y + 3.5} fontSize={10} fontWeight="700" fill={sub} textAnchor="middle">
              {d.day}
            </SvgText>
          );
        })}
        {days.map((d, i) => {
          if (d.key !== todayKey) return null;
          const t = d.debits > 0 ? 14 + d.heat * (maxOuter - r0 - 14) : 10;
          const p = polar(c, Math.min(maxOuter - 2, r0 + t + 8), -90 + i * per + per / 2);
          return <Circle key="today" cx={p.x} cy={p.y} r={5} fill={ink} stroke={isDark ? '#0F1E18' : '#FFFFFF'} strokeWidth={2} />;
        })}
        {/* Payday: a ₹ just outside its segment. */}
        {days.map((d, i) => {
          if (payday !== d.day) return null;
          const p = polar(c, r0 + 24, -90 + i * per + per / 2);
          return (
            <SvgText key="payday" x={p.x} y={p.y + 5} fontSize={15} fontWeight="800" fill={isDark ? LIME : FOREST} textAnchor="middle">
              ₹
            </SvgText>
          );
        })}
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </View>
    </View>
  );
};

/** One line of the dial key. */
export const DialKey: React.FC<{ color: string; isDark: boolean }> = ({ color, isDark }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 14, rowGap: 6, marginTop: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: LIME }} />
      <Text style={{ fontSize: 11.5, fontWeight: '600', color }}>No spend</Text>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 10, height: 6, borderRadius: 2, backgroundColor: '#FFB59F' }} />
      <View style={{ width: 10, height: 12, borderRadius: 2, backgroundColor: '#E5533C' }} />
      <Text style={{ fontSize: 11.5, fontWeight: '600', color, marginLeft: 2 }}>Longer = more</Text>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? LIME : FOREST }}>₹</Text>
      <Text style={{ fontSize: 11.5, fontWeight: '600', color }}>Payday</Text>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, borderWidth: 1.2, borderStyle: 'dashed', borderColor: isDark ? 'rgba(255,255,255,0.3)' : '#C9D6CF' }} />
      <Text style={{ fontSize: 11.5, fontWeight: '600', color }}>Ahead</Text>
    </View>
  </View>
);
