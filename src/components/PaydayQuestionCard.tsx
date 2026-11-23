// src/components/PaydayQuestionCard.tsx
//
// Asked once on Home after sign-in, until answered: "When does your salary come?"
// One tap sets the salary day (or weekly / not fixed) so budgets, comparisons and net worth
// follow the user's pay from day one instead of the calendar month.

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../store';
import { authService } from '../services/authService';
import { mmkvStorage } from '../db/mmkv';
import { paydayPhrase } from '../utils/cycleLabels';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
const DISMISS_KEY = 'payday_question_dismissed_at';
/** "Not now" hides the question for this long, then asks again. */
const SNOOZE_MS = 21 * 24 * 60 * 60 * 1000;

export const paydayQuestionSnoozed = (): boolean => {
  try {
    const at = Number(mmkvStorage.getString?.(DISMISS_KEY) || 0);
    return at > 0 && Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
};

const DAYS = [
  { value: 1, label: '1st' },
  { value: 7, label: '7th' },
  { value: 10, label: '10th' },
  { value: 15, label: '15th' },
  { value: 31, label: 'Month end' },
];

export const PaydayQuestionCard: React.FC<{
  /** A day seen in the user's income, offered first. */
  suggestedPayday: number | null;
  /** Weekly, every 2 weeks, another day: the full setting. */
  onMore: () => void;
  onDone: () => void;
  /** Retired: ask about the pension instead of a salary. */
  pension?: boolean;
}> = ({ suggestedPayday, onMore, onDone, pension }) => {
  const payWord = pension ? 'pension' : 'salary';
  const { colors, isDark } = useTheme();
  const [saving, setSaving] = useState(false);

  const save = async (fields: Parameters<typeof authService.updateProfile>[0]) => {
    if (saving) return;
    setSaving(true);
    try {
      await authService.updateProfile(fields);
    } finally {
      setSaving(false);
      onDone();
    }
  };

  const snooze = () => {
    try {
      mmkvStorage.setString?.(DISMISS_KEY, String(Date.now()));
    } catch {
      // Not saved: the card simply shows again next time.
    }
    onDone();
  };

  const ink = colors.text;
  const muted = colors.textSecondary;
  const line = isDark ? colors.border : '#DCE5E0';
  const days = suggestedPayday && !DAYS.some((d) => d.value === suggestedPayday)
    ? [{ value: suggestedPayday, label: paydayPhrase(suggestedPayday).replace('on the ', '') }, ...DAYS]
    : DAYS;

  return (
    <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={[s.card, { backgroundColor: colors.card, borderColor: line }]}>
      <View style={s.head}>
        <View style={[s.icon, { backgroundColor: isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8' }]}>
          <Feather name="calendar" size={16} color={isDark ? LIME : FOREST} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: ink }]}>When does your {payWord} come?</Text>
          <Text style={[s.sub, { color: muted }]}>
            {suggestedPayday
              ? `It seems to come ${paydayPhrase(suggestedPayday)}. Your budget and spending will run ${payWord} to ${payWord}.`
              : `Your budget and spending will run from one ${payWord} to the next, not 1st to 31st.`}
          </Text>
        </View>
      </View>

      <View style={s.chips}>
        {days.map((d) => {
          const suggested = d.value === suggestedPayday;
          return (
            <Pressable
              key={d.value}
              disabled={saving}
              onPress={() => save({ salaryDay: d.value, paySchedule: null })}
              style={[s.chip, suggested ? { backgroundColor: isDark ? LIME : FOREST, borderColor: isDark ? LIME : FOREST } : { borderColor: line }]}
              accessibilityRole="button"
              accessibilityLabel={`${pension ? 'Pension' : 'Salary'} comes ${paydayPhrase(d.value)}`}
            >
              <Text style={[s.chipText, { color: suggested ? (isDark ? FOREST : LIME) : ink }]}>{d.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          disabled={saving}
          onPress={() => save({ salaryDay: 0, paySchedule: { kind: 'irregular' } })}
          style={[s.chip, { borderColor: line }]}
          accessibilityRole="button"
        >
          <Text style={[s.chipText, { color: ink }]}>Not fixed</Text>
        </Pressable>
      </View>

      <View style={s.foot}>
        <Pressable onPress={onMore} hitSlop={8} accessibilityRole="button">
          <Text style={[s.link, { color: isDark ? LIME : '#0B6B3A' }]}>Weekly, every 2 weeks or another day</Text>
        </Pressable>
        <Pressable onPress={snooze} hitSlop={8} accessibilityRole="button">
          <Text style={[s.link, { color: muted }]}>Not now</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
};

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 14, borderRadius: 22, borderWidth: 1, padding: 16 },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12.5, lineHeight: 17, marginTop: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { minHeight: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '700' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, gap: 12 },
  link: { fontSize: 12.5, fontWeight: '700' },
});
