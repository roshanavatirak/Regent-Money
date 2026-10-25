// src/features/goals/screens/GoalsScreen.tsx
//
// Goals: total progress, this month's plan, your saving streak, one nudge
// that matters, then each goal.

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Font from 'expo-font';
import { useTheme, useGoalsStore } from '../../../store';
import { useSyncDb } from '../../../services/useSyncDb';
import type { Goal } from '../services/goalPacingService';
import { getGoalPacing, getSaved, getAccountStreak, getLoggedThisMonth } from '../services/goalPacingService';
import { formatIndianCompactRupees, formatIndianFullRupees } from '../services/goalNudgeTemplates';
import { GoalCoverPreset } from '../services/goalIllustrationMap';
import { GoalCard } from '../components/GoalCard';
import { GoalEmptyState } from '../components/GoalEmptyState';
import { LogSavingsBottomSheet } from '../components/LogSavingsBottomSheet';
import { GoalImagePickerModal } from '../components/GoalImagePickerModal';
import { CreateGoalModal } from '../../../navigation/CreateGoalModal';
import { GoalDetailModal } from '../../../navigation/GoalDetailModal';
import { goalService } from '../../../services/goalService';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

export interface GoalsScreenProps {
  AppTopBarComponent?: React.ComponentType;
}

/** Counts up to a number for the hero total. */
const useCountUp = (target: number, duration = 900) => {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = Date.now();
    const a = from.current;
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const next = a + (target - a) * (1 - Math.pow(1 - t, 3));
      from.current = next;
      setV(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
};

const Bar: React.FC<{ pct: number; color: string; track: string; height?: number }> = ({ pct, color, track, height = 6 }) => {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(Math.max(0, Math.min(100, pct)), { duration: 800, easing: Easing.out(Easing.cubic) });
  }, [pct]);
  const style = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, style]} />
    </View>
  );
};

export const GoalsScreen: React.FC<GoalsScreenProps> = ({ AppTopBarComponent }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { sync } = useSyncDb();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const heading = { fontFamily: display, fontWeight: display ? undefined : ('800' as const) };

  const goals = useGoalsStore((s) => s.goals);
  const updateGoal = useGoalsStore((s) => s.updateGoal);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [logGoal, setLogGoal] = useState<Goal | null>(null);
  const [imageGoal, setImageGoal] = useState<Goal | null>(null);
  const [dismissedNudge, setDismissedNudge] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'attention'>('active');
  const [completedOpen, setCompletedOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      sync();
    }, [sync])
  );

  /* ---------------- Numbers ---------------- */

  const { active, completed, summary } = useMemo(() => {
    const today = new Date();
    const act: { goal: Goal; pacing: ReturnType<typeof getGoalPacing> }[] = [];
    const done: Goal[] = [];
    let totalSaved = 0;
    let totalTarget = 0;
    let monthLogged = 0;
    let monthNeeded = 0;

    for (const g of goals) {
      const p = getGoalPacing(g, today);
      totalSaved += getSaved(g);
      totalTarget += p.effectiveTarget;
      if (p.status === 'completed') {
        done.push(g);
      } else {
        act.push({ goal: g, pacing: p });
        monthLogged += Math.max(0, getLoggedThisMonth(g, today));
        monthNeeded += p.requiredMonthly;
      }
    }

    const weight: Record<string, number> = { behind: 1, slightly_behind: 2, not_started: 3, on_pace: 4, ahead: 5 };
    act.sort((a, b) => (weight[a.pacing.status] || 6) - (weight[b.pacing.status] || 6));

    return {
      active: act,
      completed: done,
      summary: {
        totalSaved,
        totalTarget,
        monthLogged,
        monthNeeded,
        savedThisMonth: monthLogged > 0,
        streak: getAccountStreak(goals, today),
      },
    };
  }, [goals]);

  const animatedTotal = useCountUp(summary.totalSaved);

  // One nudge: protect the streak first, then the goal that's furthest behind
  const nudge = useMemo(() => {
    if (active.length === 0) return null;
    const behind = active.find((a) => (a.pacing.status === 'behind' || a.pacing.status === 'slightly_behind') && a.goal.id !== dismissedNudge);
    if (summary.streak >= 1 && !summary.savedThisMonth && dismissedNudge !== '__streak') {
      const target = behind || active[0];
      const amount = target.pacing.thisMonthRemaining || target.pacing.requiredMonthly;
      return {
        id: '__streak',
        tone: 'streak' as const,
        title: `Keep your ${summary.streak}-month streak.`,
        text: amount > 0 ? `Add ${formatIndianFullRupees(amount)} to ${target.goal.name} this month.` : `Add any amount to ${target.goal.name} this month.`,
        goal: target.goal,
      };
    }
    if (behind) {
      const amount = behind.pacing.gapPerMonth || behind.pacing.requiredMonthly;
      return {
        id: behind.goal.id,
        tone: 'behind' as const,
        title: `${behind.goal.name} is falling behind.`,
        text: `${formatIndianFullRupees(amount)} more a month gets it back on track.`,
        goal: behind.goal,
      };
    }
    return null;
  }, [active, summary, dismissedNudge]);

  const attentionCount = active.filter((a) => ['behind', 'slightly_behind', 'not_started'].includes(a.pacing.status)).length;
  const shownActive = filter === 'attention' ? active.filter((a) => ['behind', 'slightly_behind', 'not_started'].includes(a.pacing.status)) : active;

  const liveSelected = useMemo(() => (selectedGoal ? goals.find((g) => g.id === selectedGoal.id) || selectedGoal : null), [goals, selectedGoal]);

  /* ---------------- Actions (unchanged) ---------------- */

  const openDetail = (g: Goal) => {
    setSelectedGoal(g);
    setDetailOpen(true);
  };

  const saveCover = (goalId: string, patch: Partial<Goal>) => {
    updateGoal(goalId, patch);
    goalService.updateGoal(goalId, patch).catch((err) => console.warn('[GoalsScreen] Cover save failed:', err));
  };

  /* ---------------- Theme ---------------- */

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const overallPct = summary.totalTarget > 0 ? Math.round((summary.totalSaved / summary.totalTarget) * 100) : 0;
  const monthPct = summary.monthNeeded > 0 ? (summary.monthLogged / summary.monthNeeded) * 100 : summary.monthLogged > 0 ? 100 : 0;
  const monthDone = summary.monthNeeded > 0 && summary.monthLogged >= summary.monthNeeded;

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top, 16) + 8,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.titleRow}>
          <Text style={[s.pageTitle, { color: ink }, heading]}>Goals</Text>
          <Pressable onPress={() => setCreateOpen(true)} style={({ pressed }) => [s.plus, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.94 }] }]} accessibilityLabel="New goal">
            <Feather name="plus" size={18} color={accentFg} />
          </Pressable>
        </View>

        {goals.length === 0 ? (
          <GoalEmptyState
            onSelectStarter={(_p: GoalCoverPreset) => setCreateOpen(true)}
            onCreateCustom={() => setCreateOpen(true)}
          />
        ) : (
          <>
            {/* Compact Hero Card */}
            <Animated.View entering={FadeInDown.duration(380)} style={s.hero}>
              <View pointerEvents="none" style={s.heroRing} />
              <View style={s.heroTop}>
                <Text style={s.heroLabel}>
                  Saved for {goals.length} goal{goals.length === 1 ? '' : 's'}
                </Text>
                {summary.streak > 0 && (
                  <View style={s.streakPill}>
                    <Feather name="zap" size={11} color="#FFB86B" />
                    <Text style={s.streakText}>{summary.streak} mo streak</Text>
                  </View>
                )}
              </View>
              <Text style={[s.heroTotal, heading]} numberOfLines={1} adjustsFontSizeToFit>
                {formatIndianFullRupees(Math.round(animatedTotal))}
              </Text>
              <Text style={s.heroSub}>
                {overallPct}% of {formatIndianCompactRupees(summary.totalTarget)}
              </Text>

              {/* Compact Month Progress */}
              <View style={s.monthBarWrap}>
                <View style={s.monthRow}>
                  <Text style={s.monthLabel}>
                    This month: <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{formatIndianFullRupees(summary.monthLogged)}</Text>
                    {summary.monthNeeded > 0 ? ` of ${formatIndianCompactRupees(summary.monthNeeded)}` : ''}
                  </Text>
                  {monthDone && <Text style={s.monthHint}>Plan done</Text>}
                </View>
                <View style={{ marginTop: 6 }}>
                  <Bar pct={monthPct} color={LIME} track="rgba(255,255,255,0.14)" height={5} />
                </View>
              </View>
            </Animated.View>

            {/* One nudge */}
            {nudge && (
              <Animated.View
                entering={FadeIn.duration(300)}
                exiting={FadeOut.duration(200)}
                style={[s.nudge, { backgroundColor: isDark ? 'rgba(245,159,0,0.14)' : '#FFF4E0' }]}
              >
                <View style={[s.nudgeIcon, { backgroundColor: isDark ? 'rgba(245,159,0,0.22)' : '#FFE2B3' }]}>
                  <Feather name={nudge.tone === 'streak' ? 'zap' : 'trending-up'} size={18} color={isDark ? '#FFD27A' : '#8A5A00'} />
                </View>
                <Text style={[s.nudgeText, { color: ink }]}>
                  <Text style={{ fontWeight: '700' }}>{nudge.title} </Text>
                  {nudge.text}
                </Text>
                <Pressable onPress={() => setLogGoal(nudge.goal)} style={[s.nudgeBtn, { backgroundColor: accent }]} accessibilityLabel={`Add money to ${nudge.goal.name}`}>
                  <Text style={[s.nudgeBtnText, { color: accentFg }]}>Add</Text>
                </Pressable>
                <Pressable onPress={() => setDismissedNudge(nudge.id)} hitSlop={10} accessibilityLabel="Dismiss">
                  <Feather name="x" size={16} color={muted} />
                </Pressable>
              </Animated.View>
            )}

            {/* Goals */}
            <View style={s.sectionHead}>
              <Text style={[s.sectionTitle, { color: ink }]}>Your goals</Text>
              {attentionCount > 0 && active.length >= 3 && (
                <View style={[s.miniSeg, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E9EFEB' }]}>
                  {(['active', 'attention'] as const).map((f) => {
                    const on = filter === f;
                    return (
                      <Pressable
                        key={f}
                        onPress={() => setFilter(f)}
                        style={[s.miniSegBtn, on && { backgroundColor: isDark ? '#1E3329' : '#FFFFFF' }]}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                      >
                        <Text style={[s.miniSegText, { color: on ? ink : muted }, on && { fontWeight: '700' }]}>
                          {f === 'active' ? 'All' : `Needs care ${attentionCount}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={{ gap: 12 }}>
              {shownActive.map(({ goal }, i) => (
                <Animated.View key={goal.id} entering={FadeInDown.delay(80 + i * 70).duration(400)}>
                  <GoalCard goal={goal} onPress={() => openDetail(goal)} onLogSavings={setLogGoal} onEditImage={setImageGoal} />
                </Animated.View>
              ))}
              {active.length === 0 && (
                <View style={[s.allDone, { borderColor: line }]}>
                  <Text style={[s.allDoneTitle, { color: ink }, heading]}>Every goal reached</Text>
                  <Text style={[s.allDoneText, { color: muted }]}>Set your next one and keep the streak going.</Text>
                  <Pressable onPress={() => setCreateOpen(true)} style={[s.allDoneBtn, { backgroundColor: accent }]}>
                    <Text style={[s.nudgeBtnText, { color: accentFg }]}>New goal</Text>
                  </Pressable>
                </View>
              )}
            </View>

            {/* Completed */}
            {completed.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Pressable
                  onPress={() => setCompletedOpen((v) => !v)}
                  style={[s.completedRow, { backgroundColor: surface, borderColor: line }]}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: completedOpen }}
                >
                  <View style={[s.trophy, { backgroundColor: isDark ? 'rgba(212,160,23,0.18)' : '#FFF4D6' }]}>
                    <Feather name="award" size={18} color="#B8860B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.completedTitle, { color: ink }]}>
                      {completed.length} goal{completed.length === 1 ? '' : 's'} reached
                    </Text>
                    <Text style={[s.completedSub, { color: muted }]} numberOfLines={1}>
                      {completed.map((g) => g.name).join(', ')}
                    </Text>
                  </View>
                  <Feather name={completedOpen ? 'chevron-up' : 'chevron-down'} size={18} color={muted} />
                </Pressable>
                {completedOpen && (
                  <View style={{ gap: 12, marginTop: 12 }}>
                    {completed.map((g) => (
                      <Animated.View key={g.id} entering={FadeIn.duration(250)}>
                        <GoalCard goal={g} onPress={() => openDetail(g)} onEditImage={setImageGoal} />
                      </Animated.View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <LogSavingsBottomSheet goal={logGoal} visible={Boolean(logGoal)} onClose={() => setLogGoal(null)} />

      <GoalDetailModal
        goal={liveSelected}
        visible={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedGoal(null);
        }}
      />

      <CreateGoalModal visible={createOpen} onClose={() => setCreateOpen(false)} />

      <GoalImagePickerModal
        goal={imageGoal}
        visible={Boolean(imageGoal)}
        onClose={() => setImageGoal(null)}
        onSelectPreset={(id: string, key: string) => saveCover(id, { coverPresetKey: key, coverImageUri: undefined })}
        onCustomImagePicked={(id: string, uri: string) => saveCover(id, { coverImageUri: uri, coverPresetKey: undefined })}
        onResetToAuto={(id: string) => saveCover(id, { coverImageUri: undefined, coverPresetKey: undefined })}
      />
    </View>
  );
};

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 2 },
  pageTitle: { fontSize: 24, letterSpacing: -0.5 },
  plus: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  hero: { marginTop: 10, borderRadius: 20, backgroundColor: FOREST, paddingHorizontal: 16, paddingVertical: 14, overflow: 'hidden' },
  heroRing: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: 'rgba(184,243,107,0.14)', right: -60, top: -80 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: { color: '#B5CEC1', fontSize: 12 },
  streakPill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.12)' },
  streakText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  heroTotal: { color: '#FFFFFF', fontSize: 26, letterSpacing: -0.6, marginTop: 4, fontVariant: ['tabular-nums'] },
  heroSub: { color: '#D9E7DF', fontSize: 12, marginTop: 1 },
  monthBarWrap: { marginTop: 10 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthLabel: { color: '#B5CEC1', fontSize: 11.5 },
  monthHint: { color: LIME, fontSize: 11, fontWeight: '700' },

  nudge: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, padding: 12, marginTop: 10 },
  nudgeIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  nudgeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  nudgeBtn: { height: 32, paddingHorizontal: 12, borderRadius: 16, justifyContent: 'center' },
  nudgeBtnText: { fontSize: 12, fontWeight: '700' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 16, paddingBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  miniSeg: { flexDirection: 'row', borderRadius: 10, padding: 2 },
  miniSegBtn: { height: 26, paddingHorizontal: 8, borderRadius: 8, justifyContent: 'center' },
  miniSegText: { fontSize: 11, fontWeight: '600' },

  allDone: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 20, padding: 16, alignItems: 'center' },
  allDoneTitle: { fontSize: 18, letterSpacing: -0.3 },
  allDoneText: { fontSize: 13, marginTop: 4, textAlign: 'center' },
  allDoneBtn: { height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center', marginTop: 12 },

  completedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 18, padding: 12 },
  trophy: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  completedTitle: { fontSize: 14, fontWeight: '700' },
  completedSub: { fontSize: 11.5, marginTop: 1 },
});