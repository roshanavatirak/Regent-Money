import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, useGoalsStore, Goal } from '../store';
import { useSyncDb } from '../services/useSyncDb';
import { getGoalPacing, goalService } from '../services/goalService';
import { CreateGoalModal } from './CreateGoalModal';
import { GoalDetailModal } from './GoalDetailModal';

const { width } = Dimensions.get('window');

export interface GoalsScreenProps {
  AppTopBarComponent?: React.ComponentType;
}

export const GoalsScreen: React.FC<GoalsScreenProps> = ({ AppTopBarComponent }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { sync } = useSyncDb();

  const goals = useGoalsStore((state) => state.goals);

  // Modals state
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Filter & View states
  const [activeFilter, setActiveFilter] = useState<'all' | 'high' | 'on_track' | 'achieved'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'timeline'>('grid');

  useFocusEffect(
    useCallback(() => {
      sync();
    }, [sync])
  );

  // Aggregate stats across all active goals
  const aggregates = useMemo(() => {
    const totalTarget = goals.reduce((acc, g) => acc + (g.targetAmount || 0), 0);
    const totalSaved = goals.reduce((acc, g) => acc + (g.currentAmount || 0), 0);
    const totalMonthly = goals.reduce((acc, g) => acc + (g.monthlyContribution || 0), 0);
    const overallProgress = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;
    const achievedCount = goals.filter((g) => g.currentAmount >= g.targetAmount).length;

    return {
      totalTarget,
      totalSaved,
      totalMonthly,
      overallProgress,
      achievedCount,
      activeCount: goals.length - achievedCount,
    };
  }, [goals]);

  // Filtered goals
  const filteredGoals = useMemo(() => {
    let list = [...goals];

    // Status filter
    if (activeFilter === 'high') {
      list = list.filter((g) => g.priority === 'high');
    } else if (activeFilter === 'on_track') {
      list = list.filter((g) => {
        const pacing = getGoalPacing(g);
        return pacing.status === 'on_track' && pacing.progressPercent < 100;
      });
    } else if (activeFilter === 'achieved') {
      list = list.filter((g) => g.currentAmount >= g.targetAmount);
    }

    // Sort by timeline if timeline view
    if (viewMode === 'timeline') {
      list.sort((a, b) => (a.targetDate || 0) - (b.targetDate || 0));
    }

    return list;
  }, [goals, activeFilter, viewMode]);

  const handleOpenDetail = (goal: Goal) => {
    setSelectedGoal(goal);
    setDetailModalVisible(true);
  };

  const handleQuickContribute = async (goal: Goal, e: any) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const quickAmount = Math.max(500, Math.round(goal.monthlyContribution ? goal.monthlyContribution / 2 : 1000));
    try {
      await goalService.contribute(goal.id, quickAmount);
    } catch (err: any) {
      console.warn('Quick contribution failed:', err);
    }
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
            paddingTop: AppTopBarComponent ? 12 : insets.top + 12,
            paddingBottom: insets.bottom + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Title with Subtitle & Sleek Action Button */}
        <View style={styles.topHeaderRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={[styles.pageTitle, { color: colors.text }]}>Wealth Roadmap</Text>
            <Text style={[styles.pageSub, { color: colors.textSecondary }]}>
              Transform your monthly savings into life milestones
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setCreateModalVisible(true)}
            style={[styles.headerAddBtn, { backgroundColor: colors.accent }]}
          >
            <Ionicons name="add" size={15} color="#ffffff" />
            <Text style={styles.headerAddBtnText}>New Goal</Text>
          </TouchableOpacity>
        </View>

        {/* 1. HERO AGGREGATE DASHBOARD */}
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroLabel, { color: colors.textTertiary }]}>TOTAL GOAL NET WORTH</Text>
              <Text style={[styles.heroBigValue, { color: colors.accent }]}>
                ₹{aggregates.totalSaved.toLocaleString('en-IN')}
              </Text>
              <Text style={[styles.heroSubValue, { color: colors.textSecondary }]}>
                Target: ₹{aggregates.totalTarget.toLocaleString('en-IN')} • {goals.length} Goals Active
              </Text>
            </View>

            {/* Circular Progress Badge */}
            <View style={[styles.heroProgressPill, { borderColor: colors.accent, backgroundColor: colors.accentMuted }]}>
              <Text style={[styles.heroProgressPercent, { color: colors.accent }]}>
                {aggregates.overallProgress}%
              </Text>
              <Text style={[styles.heroProgressSub, { color: colors.textTertiary }]}>ACHIEVED</Text>
            </View>
          </View>

          {/* Main Progress Bar */}
          <View style={[styles.heroTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0' }]}>
            <View style={[styles.heroFill, { width: `${aggregates.overallProgress}%`, backgroundColor: colors.accent }]} />
          </View>

          {/* Hero Bottom Stats Row with React Icons (No Emojis) */}
          <View style={[styles.heroStatsRow, { borderTopColor: colors.border }]}>
            <View style={styles.heroStatItem}>
              <Ionicons name="flash-outline" size={13} color="#f59e0b" style={{ marginRight: 5 }} />
              <Text style={[styles.heroStatText, { color: colors.text }]}>
                ₹{aggregates.totalMonthly.toLocaleString('en-IN')}
                <Text style={[styles.heroStatUnit, { color: colors.textSecondary }]}> /mo commit</Text>
              </Text>
            </View>

            <View style={styles.heroStatItem}>
              <Ionicons name="trophy-outline" size={13} color="#3b82f6" style={{ marginRight: 5 }} />
              <Text style={[styles.heroStatText, { color: colors.text }]}>
                {aggregates.achievedCount}
                <Text style={[styles.heroStatUnit, { color: colors.textSecondary }]}> completed</Text>
              </Text>
            </View>

            <View style={styles.heroStatItem}>
              <Ionicons name="flame-outline" size={13} color="#ef4444" style={{ marginRight: 5 }} />
              <Text style={[styles.heroStatText, { color: colors.text }]}>
                Streak <Text style={{ color: '#ef4444', fontWeight: '800' }}>3-Mo</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* 2. FILTER & VIEW MODE SELECTOR */}
        <View style={styles.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {[
              { id: 'all', label: 'All Goals', icon: 'layers-outline' as const },
              { id: 'high', label: 'High Priority', icon: 'flag-outline' as const },
              { id: 'on_track', label: 'On Track', icon: 'trending-up-outline' as const },
              { id: 'achieved', label: 'Achieved', icon: 'checkmark-circle-outline' as const },
            ].map((f) => {
              const isSelected = activeFilter === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  onPress={() => setActiveFilter(f.id as any)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: isSelected ? colors.accentMuted : colors.card,
                      borderColor: isSelected ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Ionicons
                    name={f.icon}
                    size={12}
                    color={isSelected ? colors.accent : colors.textTertiary}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.filterChipText,
                      {
                        color: isSelected ? colors.accent : colors.textSecondary,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}
                  >
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Toggle between Grid Cards and Roadmap Timeline */}
          <View style={[styles.viewToggleWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => setViewMode('grid')}
              style={[
                styles.viewToggleBtn,
                viewMode === 'grid' && { backgroundColor: colors.accentMuted },
              ]}
            >
              <Ionicons name="grid-outline" size={13} color={viewMode === 'grid' ? colors.accent : colors.textTertiary} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode('timeline')}
              style={[
                styles.viewToggleBtn,
                viewMode === 'timeline' && { backgroundColor: colors.accentMuted },
              ]}
            >
              <Ionicons name="git-commit-outline" size={13} color={viewMode === 'timeline' ? colors.accent : colors.textTertiary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. GOALS LIST / CARDS */}
        {filteredGoals.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.accentMuted }]}>
              <Ionicons name="compass-outline" size={26} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Goals in this Filter</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              Ready to start something big? Create a guided roadmap goal today.
            </Text>
            <TouchableOpacity
              onPress={() => setCreateModalVisible(true)}
              style={[styles.emptyActionBtn, { backgroundColor: colors.accent }]}
            >
              <Ionicons name="add" size={14} color="#ffffff" style={{ marginRight: 4 }} />
              <Text style={styles.emptyActionBtnText}>Create Your First Goal</Text>
            </TouchableOpacity>
          </View>
        ) : viewMode === 'grid' ? (
          /* GRID / CARD VIEW */
          filteredGoals.map((goal) => {
            const pacing = getGoalPacing(goal);
            const goalColor = goal.color || colors.accent;

            return (
              <TouchableOpacity
                key={goal.id}
                activeOpacity={0.88}
                onPress={() => handleOpenDetail(goal)}
                style={[
                  styles.goalCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                {/* Accent Top Border */}
                <View style={[styles.cardAccentBar, { backgroundColor: goalColor }]} />

                <View style={styles.goalCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <View style={[styles.categoryIconWrap, { backgroundColor: `${goalColor}18` }]}>
                      <Ionicons name={(goal.icon as any) || 'trophy-outline'} size={17} color={goalColor} />
                    </View>
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={[styles.goalCardTitle, { color: colors.text }]} numberOfLines={1}>
                        {goal.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                        <Text style={[styles.cardPacingBadge, { backgroundColor: `${pacing.statusColor}18`, color: pacing.statusColor }]}>
                          {pacing.statusText}
                        </Text>
                        <Text style={[styles.cardDaysText, { color: colors.textTertiary }]}>
                          • {pacing.daysLeft}d left
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Circular Percentage Pill */}
                  <View style={[styles.cardPercentPill, { borderColor: `${goalColor}35`, backgroundColor: `${goalColor}12` }]}>
                    <Text style={[styles.cardPercentText, { color: goalColor }]}>
                      {pacing.progressPercent}%
                    </Text>
                  </View>
                </View>

                {/* Amounts Row */}
                <View style={styles.cardAmountsRow}>
                  <Text style={[styles.cardSavedAmount, { color: colors.text }]}>
                    ₹{goal.currentAmount.toLocaleString('en-IN')}{' '}
                    <Text style={[styles.cardTargetText, { color: colors.textSecondary }]}>
                      of ₹{goal.targetAmount.toLocaleString('en-IN')}
                    </Text>
                  </Text>
                  {goal.monthlyContribution ? (
                    <Text style={[styles.cardMonthlyText, { color: colors.textSecondary }]}>
                      ₹{goal.monthlyContribution.toLocaleString('en-IN')}/mo
                    </Text>
                  ) : null}
                </View>

                {/* Animated Progress Bar */}
                <View style={[styles.cardProgressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#e2e8f0' }]}>
                  <View
                    style={[
                      styles.cardProgressFill,
                      { width: `${pacing.progressPercent}%`, backgroundColor: goalColor },
                    ]}
                  />
                </View>

                {/* Card Footer Quick Action */}
                <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="sparkles-outline" size={12} color={goalColor} style={{ marginRight: 4 }} />
                    <Text style={[styles.strategyPillText, { color: colors.textSecondary }]}>
                      {goal.strategy || 'Equity Compounder'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={(e) => handleQuickContribute(goal, e)}
                    style={[styles.quickDepositBtn, { backgroundColor: `${goalColor}14`, borderColor: `${goalColor}40` }]}
                  >
                    <Ionicons name="add" size={12} color={goalColor} />
                    <Text style={[styles.quickDepositBtnText, { color: goalColor }]}>Deposit</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          /* TIMELINE ROADMAP VIEW */
          <View style={styles.timelineContainer}>
            {filteredGoals.map((goal, idx) => {
              const pacing = getGoalPacing(goal);
              const goalColor = goal.color || colors.accent;
              const targetDateFormatted = new Date(goal.targetDate || Date.now()).toLocaleDateString('en-IN', {
                month: 'short',
                year: 'numeric',
              });

              return (
                <TouchableOpacity
                  key={goal.id}
                  activeOpacity={0.88}
                  onPress={() => handleOpenDetail(goal)}
                  style={styles.timelineItem}
                >
                  {/* Left Timeline Spine */}
                  <View style={styles.spineCol}>
                    <View style={[styles.spineDot, { backgroundColor: goalColor }]} />
                    {idx < filteredGoals.length - 1 && <View style={[styles.spineLine, { backgroundColor: colors.border }]} />}
                  </View>

                  {/* Right Content Card */}
                  <View style={[styles.timelineCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.timelineDate, { color: goalColor }]}>{targetDateFormatted}</Text>
                      <Text style={[styles.cardPacingBadge, { backgroundColor: `${pacing.statusColor}18`, color: pacing.statusColor }]}>
                        {pacing.statusText}
                      </Text>
                    </View>
                    <Text style={[styles.goalCardTitle, { color: colors.text, marginTop: 3 }]}>{goal.name}</Text>
                    <Text style={[styles.cardSavedAmount, { color: colors.text, fontSize: 13.5, marginTop: 3 }]}>
                      ₹{goal.currentAmount.toLocaleString('en-IN')}{' '}
                      <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontWeight: 'normal' }}>
                        of ₹{goal.targetAmount.toLocaleString('en-IN')} ({pacing.progressPercent}%)
                      </Text>
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* CREATE GOAL MODAL */}
      <CreateGoalModal
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onGoalCreated={() => sync()}
      />

      {/* GOAL DETAIL & SIMULATOR MODAL */}
      <GoalDetailModal
        goal={selectedGoal}
        visible={detailModalVisible}
        onClose={() => setDetailModalVisible(false)}
        onUpdated={() => sync()}
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
  topHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  pageSub: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 15,
  },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6.5,
    borderRadius: 10,
    gap: 4,
  },
  headerAddBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 15,
    marginBottom: 14,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  heroBigValue: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginVertical: 2,
  },
  heroSubValue: {
    fontSize: 11,
    fontWeight: '500',
  },
  heroProgressPill: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroProgressPercent: {
    fontSize: 13,
    fontWeight: '800',
  },
  heroProgressSub: {
    fontSize: 6.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  heroTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 13,
    overflow: 'hidden',
  },
  heroFill: {
    height: '100%',
    borderRadius: 2,
  },
  heroStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 13,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  heroStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroStatText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  heroStatUnit: {
    fontSize: 10,
    fontWeight: 'normal',
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  filterScroll: {
    gap: 6,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11.5,
  },
  viewToggleWrap: {
    flexDirection: 'row',
    borderRadius: 9,
    borderWidth: 1,
    padding: 2,
    marginLeft: 6,
  },
  viewToggleBtn: {
    padding: 5,
    borderRadius: 6,
  },
  goalCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 13,
    marginBottom: 11,
    overflow: 'hidden',
  },
  cardAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2.5,
  },
  goalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardPacingBadge: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    textTransform: 'uppercase',
  },
  cardDaysText: {
    fontSize: 10.5,
    marginLeft: 4,
  },
  cardPercentPill: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  cardPercentText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  cardAmountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 10,
    marginBottom: 6,
  },
  cardSavedAmount: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  cardTargetText: {
    fontSize: 11.5,
    fontWeight: 'normal',
  },
  cardMonthlyText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardProgressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 9,
  },
  cardProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
  },
  strategyPillText: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  quickDepositBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    borderWidth: 1,
    gap: 2,
  },
  quickDepositBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 16,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  emptyActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  timelineContainer: {
    paddingLeft: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 11,
  },
  spineCol: {
    width: 22,
    alignItems: 'center',
  },
  spineDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginTop: 14,
  },
  spineLine: {
    width: 1.5,
    flex: 1,
    marginTop: 3,
  },
  timelineCard: {
    flex: 1,
    marginLeft: 6,
    borderRadius: 12,
    borderWidth: 1,
    padding: 11,
  },
  timelineDate: {
    fontSize: 10.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
