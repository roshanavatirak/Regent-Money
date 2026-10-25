// src/features/goals/components/GoalCard.tsx
//
// One goal: a cover photo that fills in with colour as you save, the name and
// amount on the photo, a progress bar with milestone marks, and one clear
// "Add money" action.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, Easing } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { useTheme, useBankStore, useGoalsStore } from '../../../store';
import type { Goal } from '../services/goalPacingService';
import { getGoalPacing } from '../services/goalPacingService';
import { getGoalCardCopy, formatIndianCompactRupees, formatIndianFullRupees } from '../services/goalNudgeTemplates';
import { getCoverImageUri } from '../services/goalIllustrationMap';
import { getBankAllocationSummary } from '../services/goalBankAllocationService';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

interface GoalCardProps {
  goal: Goal;
  onPress: () => void;
  onLogSavings?: (goal: Goal) => void;
  onSecondaryAction?: (goal: Goal, action: string) => void;
  onEditImage?: (goal: Goal) => void;
}

/** Short label for the chip on the photo. */
const statusChip = (status: string, monthsDelta: number) => {
  switch (status) {
    case 'completed':
      return { label: 'Done', tone: 'gold' as const };
    case 'ahead':
      return { label: `${monthsDelta} month${monthsDelta === 1 ? '' : 's'} early`, tone: 'green' as const };
    case 'on_pace':
      return { label: 'On track', tone: 'green' as const };
    case 'slightly_behind':
      return { label: 'A little behind', tone: 'amber' as const };
    case 'behind':
      return { label: 'Behind', tone: 'amber' as const };
    default:
      return { label: 'Not started', tone: 'grey' as const };
  }
};

export const GoalCard: React.FC<GoalCardProps> = ({ goal, onPress, onLogSavings, onEditImage }) => {
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const [frameWidth, setFrameWidth] = useState(0);

  const bankProfiles = useBankStore((s) => s.bankProfiles);
  const allGoals = useGoalsStore((s) => s.goals);
  const linkedBank = goal.linkedBankId ? bankProfiles.find((b) => b.id === goal.linkedBankId) : undefined;
  const bankSummary = linkedBank ? getBankAllocationSummary(linkedBank, allGoals) : undefined;

  const pacing = getGoalPacing(goal);
  const coverUri = getCoverImageUri(goal);
  const copy = getGoalCardCopy(pacing, Boolean(goal.reminder && !goal.reminder.paused));
  const chip = statusChip(pacing.status, pacing.monthsDelta);
  const done = pacing.status === 'completed';
  const pct = Math.min(100, Math.max(0, pacing.pctSaved));
  const toGo = Math.max(0, pacing.effectiveTarget - pacing.saved);

  // Remove duplicate "X month(s) early" clause if already shown in the top chip
  const cleanStatusText = copy.statusText.replace(/,\s*\d+\s*months?\s*early/i, '');

  // Animations: bar fill and press
  const fill = useSharedValue(0);
  const scale = useSharedValue(1);
  useEffect(() => {
    fill.value = withTiming(pct, { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [pct]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }));
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const ink = colors.text;
  const muted = colors.textSecondary;
  const line = isDark ? colors.border : '#E1E9E4';
  const track = isDark ? 'rgba(255,255,255,0.08)' : '#EDF2EF';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const toneColor = { green: '#16A34A', amber: '#F59F00', gold: '#D4A017', grey: '#8A9A92' }[chip.tone];
  const barColor = done ? '#D4A017' : chip.tone === 'amber' ? '#F59F00' : isDark ? LIME : '#16A34A';

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        onPress={onPress}
        onLongPress={() => onEditImage?.(goal)}
        onPressIn={() => (scale.value = withSpring(0.98, { damping: 15, stiffness: 300 }))}
        onPressOut={() => (scale.value = withSpring(1, { damping: 15, stiffness: 300 }))}
        style={[s.card, { backgroundColor: colors.card, borderColor: line }]}
        accessibilityRole="button"
        accessibilityLabel={`${goal.name}. ${formatIndianFullRupees(pacing.saved)} of ${formatIndianCompactRupees(pacing.effectiveTarget)}. ${cleanStatusText}`}
      >
        {/* Cover: grey and soft until you save, then fills with colour */}
        <View style={s.art} onLayout={(e) => setFrameWidth(e.nativeEvent.layout.width)}>
          <Image
            source={{ uri: coverUri }}
            blurRadius={Platform.OS === 'web' ? undefined : 2}
            style={[s.cover, (Platform.OS === 'web' ? { filter: 'blur(2px) grayscale(100%) brightness(0.7)' } : {}) as any]}
            resizeMode="cover"
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(30, 38, 34, 0.35)' }]} />

          {frameWidth > 0 && pct > 0 && (
            <View style={[s.reveal, { width: `${pct}%` }]}>
              <Image source={{ uri: coverUri }} style={{ width: frameWidth, height: '100%' }} resizeMode="cover" />
              {pct < 100 && (
                <LinearGradient start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} colors={['transparent', 'rgba(30,38,34,0.45)']} style={s.feather} />
              )}
            </View>
          )}

          <LinearGradient colors={['rgba(7,17,13,0)', 'rgba(7,17,13,0.15)', 'rgba(7,17,13,0.8)']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />

          {/* Status chip */}
          <View style={s.chip}>
            <View style={[s.chipDot, { backgroundColor: toneColor }]} />
            <Text style={s.chipText}>{chip.label}</Text>
          </View>

          {/* Change photo */}
          {onEditImage && (
            <Pressable onPress={() => onEditImage(goal)} hitSlop={8} style={s.photoBtn} accessibilityLabel="Change photo">
              <Feather name="image" size={13} color="#FFFFFF" />
            </Pressable>
          )}

          {/* Name and amount on the photo */}
          <View style={s.artText}>
            <Text style={[s.name, { fontFamily: display, fontWeight: display ? undefined : '800' }]} numberOfLines={1}>
              {goal.name}
            </Text>
            <Text style={s.amount} numberOfLines={1}>
              <Text style={{ fontWeight: '700' }}>{formatIndianFullRupees(pacing.saved)}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)' }}> of {formatIndianCompactRupees(pacing.effectiveTarget)}</Text>
            </Text>
          </View>
        </View>

        {/* Body */}
        <View style={s.body}>
          <View style={[s.track, { backgroundColor: track }]}>
            <Animated.View style={[s.fill, { backgroundColor: barColor }, fillStyle]} />
            {[25, 50, 75].map((m) => (
              <View key={m} style={[s.tick, { left: `${m}%`, backgroundColor: colors.card }]} />
            ))}
          </View>

          <View style={s.metaRow}>
            <Text style={[s.meta, { color: muted }]}>{done ? 'Goal reached' : `${formatIndianFullRupees(toGo)} to go`}</Text>
            <Text style={[s.pct, { color: ink }]}>{pct}%</Text>
          </View>

          <Text style={[s.status, { color: bankSummary?.isOverallocated ? (isDark ? '#FFA8A8' : '#C92A2A') : muted }]} numberOfLines={2}>
            {bankSummary?.isOverallocated
              ? `${linkedBank?.bankName || 'Linked account'} is short by ${formatIndianCompactRupees(bankSummary.deficitAmount)} for your goals.`
              : cleanStatusText}
          </Text>

          {!done && (
            <View style={s.actions}>
              <Pressable
                onPress={() => onLogSavings?.(goal)}
                style={({ pressed }) => [s.addBtn, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.97 }] }]}
                accessibilityRole="button"
                accessibilityLabel={`Add money to ${goal.name}`}
              >
                <Feather name="plus" size={14} color={accentFg} />
                <Text style={[s.addText, { color: accentFg }]}>Add money</Text>
              </Pressable>
              {pacing.requiredMonthly > 0 && (
                <View style={[s.monthly, { borderColor: isDark ? colors.border : '#DCE5E0' }]}>
                  <Text style={[s.monthlyText, { color: muted }]}>{formatIndianCompactRupees(pacing.requiredMonthly)} a month</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
};

const s = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  art: { height: 100, width: '100%', overflow: 'hidden' },
  cover: { width: '100%', height: '100%' },
  reveal: { position: 'absolute', top: 0, left: 0, bottom: 0, overflow: 'hidden' },
  feather: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 28 },

  chip: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 5, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.92)' },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 11, fontWeight: '700', color: '#0B1F17' },
  photoBtn: { position: 'absolute', top: 8, left: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(7,17,13,0.45)', alignItems: 'center', justifyContent: 'center' },

  artText: { position: 'absolute', left: 12, right: 12, bottom: 8 },
  name: { color: '#FFFFFF', fontSize: 17, letterSpacing: -0.3 },
  amount: { color: '#FFFFFF', fontSize: 12.5, marginTop: 1, fontVariant: ['tabular-nums'] },

  body: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  tick: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  meta: { fontSize: 11.5, fontVariant: ['tabular-nums'] },
  pct: { fontSize: 11.5, fontWeight: '700' },
  status: { fontSize: 12, lineHeight: 16, marginTop: 3 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  addBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 36, borderRadius: 18 },
  addText: { fontSize: 13, fontWeight: '700' },
  monthly: { height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  monthlyText: { fontSize: 12 },
});