// src/components/DateTimePickerSheet.tsx
//
// One picker for the whole app.
//
//   <DateTimePickerSheet mode="date" ... />       // calendar only
//   <DateTimePickerSheet mode="time" ... />       // 24-hour clock only
//   <DateTimePickerSheet mode="datetime" ... />   // Date and Time tabs
//
// Calendar: 7 equal columns, so every week lines up under its weekday.
// Clock: 24-hour dial. Outer ring 1–12, inner ring 13–23 and 00. Tap or drag.

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, PanResponder } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  startOfDay,
  endOfDay,
} from 'date-fns';
import { useTheme } from '../store';

export type PickerMode = 'date' | 'time' | 'datetime';

export interface DateTimePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (value: Date) => void;
  value?: Date;
  mode?: PickerMode;
  title?: string;
  confirmLabel?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  /** 0 = Sunday first, 1 = Monday first */
  weekStartsOn?: 0 | 1;
}

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
const DIAL = 264;
const pad = (n: number) => String(n).padStart(2, '0');

/* ------------------------------------------------------------------ */
/* Clock dial                                                          */
/* ------------------------------------------------------------------ */

const ClockDial: React.FC<{
  unit: 'hour' | 'minute';
  value: number;
  onChange: (v: number) => void;
  onRelease?: () => void;
  isDisabled?: (v: number) => boolean;
  P: { face: string; ink: string; muted: string; accent: string; accentInk: string; inner: string };
}> = ({ unit, value, onChange, onRelease, isDisabled, P }) => {
  const c = DIAL / 2;
  const outerR = c - 26;
  const innerR = outerR - 40;

  const pick = (x: number, y: number) => {
    const dx = x - c;
    const dy = y - c;
    let angle = Math.atan2(dx, -dy);
    if (angle < 0) angle += Math.PI * 2;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (unit === 'hour') {
      const idx = Math.round((angle / (Math.PI * 2)) * 12) % 12;
      const inner = dist < (outerR + innerR) / 2;
      const v = inner ? (idx === 0 ? 0 : idx + 12) : idx === 0 ? 12 : idx;
      if (!isDisabled?.(v)) onChange(v);
    } else {
      const v = Math.round((angle / (Math.PI * 2)) * 60) % 60;
      if (!isDisabled?.(v)) onChange(v);
    }
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY),
        onPanResponderMove: (e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY),
        onPanResponderRelease: () => onRelease?.(),
      }),
    [unit, isDisabled, onRelease]
  );

  // Position of the selected value
  let selAngle: number;
  let selR: number;
  if (unit === 'hour') {
    const inner = value === 0 || value > 12;
    selAngle = ((value % 12) / 12) * 360;
    selR = inner ? innerR : outerR;
  } else {
    selAngle = (value / 60) * 360;
    selR = outerR;
  }
  const rad = (selAngle * Math.PI) / 180;
  const selX = c + selR * Math.sin(rad);
  const selY = c - selR * Math.cos(rad);

  const labels: { v: number; r: number; small?: boolean; text: string }[] = [];
  if (unit === 'hour') {
    for (let i = 0; i < 12; i++) {
      const outer = i === 0 ? 12 : i;
      const inner = i === 0 ? 0 : i + 12;
      labels.push({ v: outer, r: outerR, text: String(outer) });
      labels.push({ v: inner, r: innerR, small: true, text: pad(inner) });
    }
  } else {
    for (let m = 0; m < 60; m += 5) labels.push({ v: m, r: outerR, text: pad(m) });
  }

  return (
    <View
      {...responder.panHandlers}
      style={{ width: DIAL, height: DIAL, borderRadius: DIAL / 2, backgroundColor: P.face, alignSelf: 'center' }}
      accessibilityRole="adjustable"
      accessibilityLabel={unit === 'hour' ? `Hour ${pad(value)}` : `Minute ${pad(value)}`}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* Hand */}
        <View
          style={{
            position: 'absolute',
            left: c - 1,
            top: c - selR,
            width: 2,
            height: selR * 2,
            transform: [{ rotate: `${selAngle}deg` }],
          }}
        >
          <View style={{ width: 2, height: selR - 16, backgroundColor: P.accent, marginTop: 16 }} />
        </View>
        <View style={{ position: 'absolute', left: c - 4, top: c - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: P.accent }} />
        <View
          style={{
            position: 'absolute',
            left: selX - 18,
            top: selY - 18,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: P.accent,
          }}
        />

        {labels.map((l) => {
          const a = unit === 'hour' ? ((l.v % 12) / 12) * Math.PI * 2 : (l.v / 60) * Math.PI * 2;
          const x = c + l.r * Math.sin(a);
          const y = c - l.r * Math.cos(a);
          const selected = l.v === value;
          const disabled = isDisabled?.(l.v);
          return (
            <Text
              key={`${l.v}-${l.r}`}
              style={{
                position: 'absolute',
                left: x - 18,
                top: y - 10,
                width: 36,
                textAlign: 'center',
                fontSize: l.small ? 12 : 15,
                fontWeight: selected ? '700' : l.small ? '500' : '600',
                color: selected ? P.accentInk : disabled ? 'rgba(127,127,127,0.35)' : l.small ? P.muted : P.ink,
              }}
            >
              {l.text}
            </Text>
          );
        })}
      </View>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Sheet                                                               */
/* ------------------------------------------------------------------ */

export const DateTimePickerSheet: React.FC<DateTimePickerSheetProps> = ({
  visible,
  onClose,
  onConfirm,
  value,
  mode = 'datetime',
  title,
  confirmLabel,
  minimumDate,
  maximumDate,
  weekStartsOn = 1,
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const [draft, setDraft] = useState<Date>(value || new Date());
  const [monthView, setMonthView] = useState<Date>(startOfMonth(value || new Date()));
  const [tab, setTab] = useState<'date' | 'time'>(mode === 'time' ? 'time' : 'date');
  const [unit, setUnit] = useState<'hour' | 'minute'>('hour');

  useEffect(() => {
    if (visible) {
      const v = value || new Date();
      setDraft(v);
      setMonthView(startOfMonth(v));
      setTab(mode === 'time' ? 'time' : 'date');
      setUnit('hour');
    }
  }, [visible]);

  const ink = colors.text;
  const muted = colors.textSecondary;
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const accentInk = isDark ? FOREST : '#FFFFFF';
  const soft = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F2';

  /* ---------------- Calendar ---------------- */

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthView), { weekStartsOn });
    const end = endOfWeek(endOfMonth(monthView), { weekStartsOn });
    return eachDayOfInterval({ start, end });
  }, [monthView, weekStartsOn]);

  const weekdayLabels = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn });
    return Array.from({ length: 7 }, (_, i) => format(new Date(start.getTime() + i * 86400000), 'EEEEEE'));
  }, [weekStartsOn]);

  const dayDisabled = (d: Date) =>
    (!!minimumDate && endOfDay(d) < minimumDate) || (!!maximumDate && startOfDay(d) > maximumDate);

  const canPrev = !minimumDate || startOfMonth(monthView) > startOfMonth(minimumDate);
  const canNext = !maximumDate || startOfMonth(monthView) < startOfMonth(maximumDate);

  const pickDay = (d: Date) => {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), draft.getHours(), draft.getMinutes(), 0, 0);
    setDraft(next);
    if (!isSameMonth(d, monthView)) setMonthView(startOfMonth(d));
    // In date + time mode, move on to the clock after picking a day
    if (mode === 'datetime') setTimeout(() => setTab('time'), 180);
  };

  /* ---------------- Time ---------------- */

  const setHour = (h: number) => setDraft((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, d.getMinutes(), 0, 0));
  const setMinute = (m: number) => setDraft((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), m, 0, 0));
  const nudgeMinute = (delta: number) => setMinute((draft.getMinutes() + delta + 60) % 60);

  const hourDisabled = (h: number) => {
    if (maximumDate && isSameDay(draft, maximumDate) && h > maximumDate.getHours()) return true;
    if (minimumDate && isSameDay(draft, minimumDate) && h < minimumDate.getHours()) return true;
    return false;
  };
  const minuteDisabled = (m: number) => {
    if (maximumDate && isSameDay(draft, maximumDate) && draft.getHours() === maximumDate.getHours() && m > maximumDate.getMinutes()) return true;
    if (minimumDate && isSameDay(draft, minimumDate) && draft.getHours() === minimumDate.getHours() && m < minimumDate.getMinutes()) return true;
    return false;
  };

  const setNow = () => {
    const now = new Date();
    setDraft(
      mode === 'time'
        ? new Date(draft.getFullYear(), draft.getMonth(), draft.getDate(), now.getHours(), now.getMinutes())
        : now
    );
    setMonthView(startOfMonth(now));
  };

  /* ---------------- Validation ---------------- */

  const tooLate = !!maximumDate && mode !== 'date' && draft > maximumDate;
  const tooEarly = !!minimumDate && mode !== 'date' && draft < minimumDate;
  const invalid = tooLate || tooEarly || (mode === 'date' && dayDisabled(draft));

  const confirm = () => {
    if (invalid) return;
    onConfirm(mode === 'date' ? startOfDay(draft) : draft);
  };

  const headerTitle = title || (mode === 'date' ? 'Choose a date' : mode === 'time' ? 'Choose a time' : 'Choose date and time');
  const buttonLabel =
    confirmLabel ||
    (mode === 'date'
      ? `Use ${format(draft, 'd MMM yyyy')}`
      : mode === 'time'
        ? `Use ${format(draft, 'HH:mm')}`
        : `Use ${format(draft, 'd MMM')}, ${format(draft, 'HH:mm')}`);

  const dialPalette = { face: soft, ink, muted, accent, accentInk, inner: muted };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: surface, paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
          <View style={[styles.grabber, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#D5DED9' }]} />

          <Text style={[styles.title, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
            {headerTitle}
          </Text>

          {/* Selected value tabs (date + time mode) or summary */}
          {mode === 'datetime' ? (
            <View style={styles.tabs}>
              {(['date', 'time'] as const).map((t) => {
                const active = tab === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setTab(t)}
                    style={[styles.tab, { backgroundColor: active ? accent : soft }]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Feather name={t === 'date' ? 'calendar' : 'clock'} size={15} color={active ? accentInk : muted} />
                    <Text style={[styles.tabText, { color: active ? accentInk : ink }]}>
                      {t === 'date' ? format(draft, 'EEE, d MMM') : format(draft, 'HH:mm')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.summary, { color: accent }]}>
              {mode === 'date' ? format(draft, 'EEEE, d MMMM yyyy') : format(draft, 'HH:mm')}
            </Text>
          )}

          {/* Date panel */}
          {tab === 'date' && mode !== 'time' && (
            <Animated.View key="date" entering={FadeIn.duration(200)}>
              <View style={styles.monthRow}>
                <Pressable
                  onPress={() => canPrev && setMonthView(subMonths(monthView, 1))}
                  style={[styles.navBtn, { backgroundColor: soft, opacity: canPrev ? 1 : 0.35 }]}
                  disabled={!canPrev}
                  accessibilityLabel="Previous month"
                >
                  <Feather name="chevron-left" size={18} color={ink} />
                </Pressable>
                <Text style={[styles.monthText, { color: ink }]}>{format(monthView, 'MMMM yyyy')}</Text>
                <Pressable
                  onPress={() => canNext && setMonthView(addMonths(monthView, 1))}
                  style={[styles.navBtn, { backgroundColor: soft, opacity: canNext ? 1 : 0.35 }]}
                  disabled={!canNext}
                  accessibilityLabel="Next month"
                >
                  <Feather name="chevron-right" size={18} color={ink} />
                </Pressable>
              </View>

              <View style={styles.weekRow}>
                {weekdayLabels.map((w, i) => (
                  <Text key={i} style={[styles.weekday, { color: muted }]}>
                    {w}
                  </Text>
                ))}
              </View>

              <View style={styles.grid}>
                {days.map((d) => {
                  const inMonth = isSameMonth(d, monthView);
                  const selected = isSameDay(d, draft);
                  const today = isToday(d);
                  const disabled = dayDisabled(d);
                  return (
                    <View key={d.toISOString()} style={styles.cell}>
                      <Pressable
                        onPress={() => !disabled && pickDay(d)}
                        disabled={disabled}
                        style={[
                          styles.day,
                          selected && { backgroundColor: accent },
                          !selected && today && { borderWidth: 1.5, borderColor: accent },
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled }}
                        accessibilityLabel={format(d, 'EEEE d MMMM yyyy')}
                      >
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: selected || today ? '700' : '500',
                            color: selected
                              ? accentInk
                              : disabled
                                ? isDark ? 'rgba(255,255,255,0.2)' : 'rgba(11,31,23,0.2)'
                                : inMonth
                                  ? ink
                                  : isDark ? 'rgba(255,255,255,0.35)' : 'rgba(11,31,23,0.35)',
                          }}
                        >
                          {format(d, 'd')}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </Animated.View>
          )}

          {/* Time panel */}
          {(tab === 'time' || mode === 'time') && mode !== 'date' && (
            <Animated.View key="time" entering={FadeInDown.duration(220)}>
              <View style={styles.timeHead}>
                <Pressable
                  onPress={() => setUnit('hour')}
                  style={[styles.timeBox, { backgroundColor: unit === 'hour' ? accent : soft }]}
                  accessibilityLabel="Edit hour"
                >
                  <Text style={[styles.timeBig, { color: unit === 'hour' ? accentInk : ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                    {pad(draft.getHours())}
                  </Text>
                </Pressable>
                <Text style={[styles.colon, { color: ink }]}>:</Text>
                <Pressable
                  onPress={() => setUnit('minute')}
                  style={[styles.timeBox, { backgroundColor: unit === 'minute' ? accent : soft }]}
                  accessibilityLabel="Edit minute"
                >
                  <Text style={[styles.timeBig, { color: unit === 'minute' ? accentInk : ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                    {pad(draft.getMinutes())}
                  </Text>
                </Pressable>
                <Pressable onPress={setNow} style={[styles.nowBtn, { borderColor: line }]} accessibilityLabel="Set to now">
                  <Feather name="rotate-ccw" size={13} color={ink} />
                  <Text style={[styles.nowText, { color: ink }]}>Now</Text>
                </Pressable>
              </View>

              <ClockDial
                unit={unit}
                value={unit === 'hour' ? draft.getHours() : draft.getMinutes()}
                onChange={unit === 'hour' ? setHour : setMinute}
                onRelease={unit === 'hour' ? () => setUnit('minute') : undefined}
                isDisabled={unit === 'hour' ? hourDisabled : minuteDisabled}
                P={dialPalette}
              />

              {unit === 'minute' && (
                <View style={styles.fineRow}>
                  <Pressable onPress={() => nudgeMinute(-1)} style={[styles.fineBtn, { backgroundColor: soft }]} accessibilityLabel="One minute earlier">
                    <Feather name="minus" size={16} color={ink} />
                  </Pressable>
                  <Text style={[styles.fineText, { color: muted }]}>Fine-tune by a minute</Text>
                  <Pressable onPress={() => nudgeMinute(1)} style={[styles.fineBtn, { backgroundColor: soft }]} accessibilityLabel="One minute later">
                    <Feather name="plus" size={16} color={ink} />
                  </Pressable>
                </View>
              )}
            </Animated.View>
          )}

          {invalid && (
            <Text style={[styles.error, { color: isDark ? '#FFA8A8' : '#C92A2A' }]}>
              {tooLate ? 'Pick a time that has already happened.' : 'That time is too early.'}
            </Text>
          )}

          <Pressable
            onPress={confirm}
            disabled={invalid}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: accent, opacity: invalid ? 0.5 : 1 },
              pressed && !invalid && { transform: [{ scale: 0.98 }] },
            ]}
            accessibilityRole="button"
          >
            <Text style={[styles.ctaText, { color: isDark ? FOREST : LIME }]}>{buttonLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 10,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center' },
  title: { fontSize: 22, letterSpacing: -0.4, marginTop: 18, paddingHorizontal: 4 },
  summary: { fontSize: 14, fontWeight: '600', marginTop: 4, paddingHorizontal: 4 },

  tabs: { flexDirection: 'row', gap: 8, marginTop: 14 },
  tab: { flex: 1, height: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  tabText: { fontSize: 15, fontWeight: '700' },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  navBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  monthText: { fontSize: 16, fontWeight: '700' },

  weekRow: { flexDirection: 'row', marginBottom: 2 },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, fontWeight: '600', paddingVertical: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2 },
  day: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  timeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18, marginBottom: 16 },
  timeBox: { minWidth: 76, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  timeBig: { fontSize: 38, letterSpacing: -1 },
  colon: { fontSize: 34, fontWeight: '800', marginHorizontal: 2 },
  nowBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, marginLeft: 10 },
  nowText: { fontSize: 13, fontWeight: '600' },

  fineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 14 },
  fineBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  fineText: { fontSize: 12 },

  error: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 12 },
  cta: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  ctaText: { fontSize: 15, fontWeight: '700' },
});