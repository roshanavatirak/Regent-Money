import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, useGoalsStore } from '../../../store';
import { useSyncDb } from '../../../services/useSyncDb';
import type { Goal } from '../services/goalPacingService';
import {
  getGoalPacing,
  getSaved,
  getAccountStreak,
} from '../services/goalPacingService';
import {
  formatIndianCompactRupees,
  formatIndianFullRupees,
} from '../services/goalNudgeTemplates';
import { GoalCoverPreset } from '../services/goalIllustrationMap';
import { GoalCard } from '../components/GoalCard';
import { GoalListItem } from '../components/GoalListItem';
import { GoalEmptyState } from '../components/GoalEmptyState';
import { LogSavingsBottomSheet } from '../components/LogSavingsBottomSheet';
import { GoalImagePickerModal } from '../components/GoalImagePickerModal';
import { CreateGoalModal } from '../../../navigation/CreateGoalModal';
import { GoalDetailModal } from '../../../navigation/GoalDetailModal';
import { goalService } from '../../../services/goalService';

export interface GoalsScreenProps {
  AppTopBarComponent?: React.ComponentType;
}

export const GoalsScreen: React.FC<GoalsScreenProps> = ({ AppTopBarComponent }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { sync } = useSyncDb();

  const goals = useGoalsStore((state) => state.goals);
  const updateGoal = useGoalsStore((state) => state.updateGoal);

  // View mode: 'card' (default) vs 'list'
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  // Modals state
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [logSheetGoal, setLogSheetGoal] = useState<Goal | null>(null);
  const [starterPreset, setStarterPreset] = useState<GoalCoverPreset | null>(null);
  const [imagePickerGoal, setImagePickerGoal] = useState<Goal | null>(null);

  // Nudge banner dismiss state
  const [dismissedNudgeId, setDismissedNudgeId] = useState<string | null>(null);

  // Filter state (only shown if goals.length >= 4)
  const [activeFilter, setActiveFilter] = useState<'all' | 'needs_attention' | 'completed'>('all');
  const [completedExpanded, setCompletedExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      sync();
    }, [sync])
  );

  // 1. COMPUTED AGGREGATE SUMMARY (Two columns, four facts)
  const summary = useMemo(() => {
    let totalSaved = 0;
    let totalPlannedMonthly = 0;
    let reminderCount = 0;
    let completedCount = 0;
    let activeCount = 0;

    for (const g of goals) {
      const saved = getSaved(g);
      totalSaved += saved;
      if (saved >= g.targetAmount) {
        completedCount++;
      } else {
        activeCount++;
        totalPlannedMonthly += g.committedMonthly || 0;
        if (g.reminder && !g.reminder.paused) {
          reminderCount++;
        }
      }
    }

    const streak = getAccountStreak(goals);

    return {
      totalSaved,
      activeCount,
      completedCount,
      totalPlannedMonthly,
      reminderCount,
      streak,
    };
  }, [goals]);

  // 2. SINGLE NUDGE BANNER (Most urgent goal needing attention)
  const nudgeGoal = useMemo(() => {
    if (goals.length === 0) return null;
    for (const g of goals) {
      if (g.id === dismissedNudgeId) continue;
      const pacing = getGoalPacing(g);
      if (pacing.status === 'slightly_behind' || pacing.status === 'behind') {
        return { goal: g, pacing };
      }
    }
    return null;
  }, [goals, dismissedNudgeId]);

  // 3. SORTED & FILTERED LIST
  // Order: Behind / Slightly behind / Not started first, then On pace, then Ahead
  const { activeGoalsList, completedGoalsList } = useMemo(() => {
    const active: Goal[] = [];
    const completed: Goal[] = [];

    for (const g of goals) {
      const pacing = getGoalPacing(g);
      if (pacing.status === 'completed') {
        completed.push(g);
      } else {
        active.push(g);
      }
    }

    // Sort active by priority: Behind/Slightly behind/Not started first
    const getSortWeight = (g: Goal) => {
      const s = getGoalPacing(g).status;
      if (s === 'behind') return 1;
      if (s === 'slightly_behind') return 2;
      if (s === 'not_started') return 3;
      if (s === 'on_pace') return 4;
      if (s === 'ahead') return 5;
      return 6;
    };

    active.sort((a, b) => getSortWeight(a) - getSortWeight(b));

    return { activeGoalsList: active, completedGoalsList: completed };
  }, [goals]);

  // Applied filter
  const displayedActiveGoals = useMemo(() => {
    if (goals.length < 4 || activeFilter === 'all') return activeGoalsList;
    if (activeFilter === 'needs_attention') {
      return activeGoalsList.filter((g) => {
        const s = getGoalPacing(g).status;
        return s === 'behind' || s === 'slightly_behind' || s === 'not_started';
      });
    }
    return [];
  }, [activeGoalsList, goals.length, activeFilter]);

  const liveSelectedGoal = useMemo(() => {
    if (!selectedGoal) return null;
    return goals.find((g) => g.id === selectedGoal.id) || selectedGoal;
  }, [goals, selectedGoal]);

  const handleOpenDetail = (g: Goal) => {
    setSelectedGoal(g);
    setDetailModalVisible(true);
  };

  const handleStartWithStarter = (preset: GoalCoverPreset) => {
    setStarterPreset(preset);
    setCreateModalVisible(true);
  };

  const handleSelectPreset = (goalId: string, presetKey: string) => {
    updateGoal(goalId, { coverPresetKey: presetKey, coverImageUri: undefined });
    goalService.updateGoal(goalId, { coverPresetKey: presetKey, coverImageUri: undefined }).catch((err) => {
      console.warn('[GoalsScreen] Failed to save coverPresetKey to backend:', err);
    });
  };

  const handleCustomImagePicked = (goalId: string, imageUri: string) => {
    updateGoal(goalId, { coverImageUri: imageUri, coverPresetKey: undefined });
    goalService.updateGoal(goalId, { coverImageUri: imageUri, coverPresetKey: undefined }).catch((err) => {
      console.warn('[GoalsScreen] Failed to save coverImageUri to backend:', err);
    });
  };

  const handleResetToAuto = (goalId: string) => {
    updateGoal(goalId, { coverImageUri: undefined, coverPresetKey: undefined });
    goalService.updateGoal(goalId, { coverImageUri: undefined, coverPresetKey: undefined }).catch((err) => {
      console.warn('[GoalsScreen] Failed to reset cover image on backend:', err);
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Navbar */}
      {AppTopBarComponent ? <AppTopBarComponent /> : null}

      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.contentContainer,
          {
            paddingTop: AppTopBarComponent ? 10 : insets.top + 10,
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER: "Goals", View Toggle (Card vs List), and "+ New" */}
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: colors.text }]}>Goals</Text>

          <View style={styles.headerActions}>
            {/* View Mode Switcher */}
            <View
              style={[
                styles.viewToggleGroup,
                {
                  backgroundColor: colors.buttonSecondaryBackground,
                  borderColor: colors.border,
                },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setViewMode('card')}
                style={[
                  styles.viewToggleBtn,
                  viewMode === 'card' && {
                    backgroundColor: colors.card,
                    shadowColor: colors.shadowColor,
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.15,
                    shadowRadius: 2,
                    elevation: 1,
                  },
                ]}
                accessibilityLabel="Card View"
              >
                <Ionicons
                  name="grid"
                  size={14}
                  color={viewMode === 'card' ? colors.accent : colors.textSecondary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setViewMode('list')}
                style={[
                  styles.viewToggleBtn,
                  viewMode === 'list' && {
                    backgroundColor: colors.card,
                    shadowColor: colors.shadowColor,
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.15,
                    shadowRadius: 2,
                    elevation: 1,
                  },
                ]}
                accessibilityLabel="List View"
              >
                <Ionicons
                  name="list"
                  size={15}
                  color={viewMode === 'list' ? colors.accent : colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                setStarterPreset(null);
                setCreateModalVisible(true);
              }}
              style={[styles.newBtn, { backgroundColor: colors.accent }]}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" style={{ marginRight: 2 }} />
              <Text style={styles.newBtnText}>New</Text>
            </TouchableOpacity>
          </View>
        </View>

        {goals.length === 0 ? (
          /* EMPTY STATE STARTER GRID */
          <GoalEmptyState
            onSelectStarter={handleStartWithStarter}
            onCreateCustom={() => {
              setStarterPreset(null);
              setCreateModalVisible(true);
            }}
          />
        ) : (
          <>
            {/* SUMMARY STRIP: Two columns, four facts */}
            <View
              style={[
                styles.summaryStrip,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              {/* Left Column */}
              <View style={styles.summaryCol}>
                <Text style={[styles.summaryBigText, { color: colors.text }]}>
                  {formatIndianFullRupees(summary.totalSaved)} saved
                </Text>
                <Text style={[styles.summarySubText, { color: colors.textSecondary }]}>
                  across {summary.activeCount} active goal{summary.activeCount !== 1 ? 's' : ''}
                </Text>
              </View>

              {/* Center Divider */}
              <View style={[styles.summaryDivider, { backgroundColor: colors.divider }]} />

              {/* Right Column */}
              <View style={styles.summaryCol}>
                <Text style={[styles.summaryBigText, { color: colors.text }]}>
                  {formatIndianCompactRupees(summary.totalPlannedMonthly)}/mo planned
                </Text>
                <Text style={[styles.summarySubText, { color: colors.textSecondary }]}>
                  {summary.streak >= 3
                    ? `Streak ${summary.streak} months`
                    : `${summary.reminderCount} of ${summary.activeCount} with reminders`}
                </Text>
              </View>
            </View>

            {/* SINGLE NUDGE BANNER (If any goal is behind / needs gap attention) */}
            {nudgeGoal ? (
              <View
                style={[
                  styles.nudgeBanner,
                  {
                    backgroundColor: isDark ? 'rgba(227, 179, 65, 0.12)' : 'rgba(217, 119, 6, 0.10)',
                    borderColor: colors.warning,
                  },
                ]}
              >
                <View style={styles.nudgeTextContainer}>
                  <Ionicons name="information-circle" size={18} color={colors.warning} style={{ marginRight: 8 }} />
                  <Text style={[styles.nudgeText, { color: isDark ? colors.warning : '#92400E' }]} numberOfLines={2}>
                    Your {nudgeGoal.goal.name} needs{' '}
                    {formatIndianFullRupees(nudgeGoal.pacing.gapPerMonth || nudgeGoal.pacing.requiredMonthly)} more this month
                  </Text>
                </View>

                <View style={styles.nudgeActions}>
                  <TouchableOpacity
                    onPress={() => setLogSheetGoal(nudgeGoal.goal)}
                    style={[styles.nudgeLogBtn, { backgroundColor: colors.warning }]}
                  >
                    <Text style={styles.nudgeLogBtnText}>
                      Log {formatIndianCompactRupees(nudgeGoal.pacing.gapPerMonth || nudgeGoal.pacing.requiredMonthly)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDismissedNudgeId(nudgeGoal.goal.id)}
                    style={styles.nudgeDismissBtn}
                  >
                    <Ionicons name="close" size={16} color={isDark ? colors.warning : '#92400E'} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* FILTER CHIPS (Only shown when 4+ goals exist) */}
            {goals.length >= 4 ? (
              <View style={styles.filterRow}>
                {(['all', 'needs_attention', 'completed'] as const).map((filterId) => {
                  const isSelected = activeFilter === filterId;
                  const label =
                    filterId === 'all'
                      ? 'All'
                      : filterId === 'needs_attention'
                      ? 'Needs attention'
                      : `Completed (${summary.completedCount})`;
                  return (
                    <TouchableOpacity
                      key={filterId}
                      onPress={() => setActiveFilter(filterId)}
                      style={[
                        styles.filterChip,
                        {
                          backgroundColor: isSelected ? colors.accentMuted : colors.card,
                          borderColor: isSelected ? colors.accent : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          {
                            color: isSelected ? colors.accent : colors.textSecondary,
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}

            {/* ACTIVE GOALS LIST */}
            {activeFilter !== 'completed' ? (
              displayedActiveGoals.map((g) =>
                viewMode === 'card' ? (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    onPress={() => handleOpenDetail(g)}
                    onLogSavings={(goal) => setLogSheetGoal(goal)}
                    onEditImage={(goal) => setImagePickerGoal(goal)}
                    onSecondaryAction={(goal, action) => {
                      if (action === 'Set reminder') {
                        handleOpenDetail(goal);
                      } else if (action === 'Raise monthly') {
                        handleOpenDetail(goal);
                      } else if (action === 'Update target date') {
                        handleOpenDetail(goal);
                      }
                    }}
                  />
                ) : (
                  <GoalListItem
                    key={g.id}
                    goal={g}
                    onPress={() => handleOpenDetail(g)}
                    onLogSavings={(goal) => setLogSheetGoal(goal)}
                    onEditImage={(goal) => setImagePickerGoal(goal)}
                  />
                )
              )
            ) : null}

            {/* COMPLETED DRAWER (Collapsible row at bottom) */}
            {summary.completedCount > 0 && activeFilter !== 'needs_attention' ? (
              <View style={styles.completedSection}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setCompletedExpanded(!completedExpanded)}
                  style={[
                    styles.completedToggle,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.warning} style={{ marginRight: 8 }} />
                    <Text style={[styles.completedToggleText, { color: colors.text }]}>
                      Completed ({summary.completedCount})
                    </Text>
                  </View>
                  <Ionicons
                    name={completedExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>

                {completedExpanded ? (
                  <View style={{ marginTop: 12 }}>
                    {completedGoalsList.map((g) =>
                      viewMode === 'card' ? (
                        <GoalCard
                          key={g.id}
                          goal={g}
                          onPress={() => handleOpenDetail(g)}
                          onLogSavings={(goal) => setLogSheetGoal(goal)}
                          onEditImage={(goal) => setImagePickerGoal(goal)}
                        />
                      ) : (
                        <GoalListItem
                          key={g.id}
                          goal={g}
                          onPress={() => handleOpenDetail(g)}
                          onLogSavings={(goal) => setLogSheetGoal(goal)}
                          onEditImage={(goal) => setImagePickerGoal(goal)}
                        />
                      )
                    )}
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* TWO-TAP LOG SAVINGS SHEET */}
      <LogSavingsBottomSheet
        goal={logSheetGoal}
        visible={Boolean(logSheetGoal)}
        onClose={() => setLogSheetGoal(null)}
      />

      {/* DETAIL MODAL */}
      <GoalDetailModal
        goal={liveSelectedGoal}
        visible={detailModalVisible}
        onClose={() => {
          setDetailModalVisible(false);
          setSelectedGoal(null);
        }}
      />

      {/* CREATE GOAL MODAL */}
      <CreateGoalModal
        visible={createModalVisible}
        onClose={() => {
          setCreateModalVisible(false);
          setStarterPreset(null);
        }}
      />

      {/* GOAL IMAGE PICKER MODAL */}
      <GoalImagePickerModal
        goal={imagePickerGoal}
        visible={Boolean(imagePickerGoal)}
        onClose={() => setImagePickerGoal(null)}
        onSelectPreset={handleSelectPreset}
        onCustomImagePicked={handleCustomImagePicked}
        onResetToAuto={handleResetToAuto}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewToggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    padding: 2,
    borderWidth: 1,
  },
  viewToggleBtn: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 8,
  },
  newBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  summaryStrip: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  summaryCol: {
    flex: 1,
    justifyContent: 'center',
  },
  summaryDivider: {
    width: 1,
    marginHorizontal: 14,
  },
  summaryBigText: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginBottom: 2,
  },
  summarySubText: {
    fontSize: 12,
    fontWeight: '400',
  },
  nudgeBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  nudgeTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  nudgeText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  nudgeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  nudgeLogBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  nudgeLogBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  nudgeDismissBtn: {
    padding: 4,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
  },
  completedSection: {
    marginTop: 8,
    marginBottom: 20,
  },
  completedToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  completedToggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
