import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme, useBudgetStore, useTransactionStore, useBankStore, useGoalsStore, BudgetCategory, Goal } from '../store';
import { useSyncDb } from '../services/useSyncDb';
import {
  calculateBudgetNetSpend,
  calculateBudgetPacing,
  calculateFreeToSpend,
  getBudgetDeepDive,
  simulateAffordability,
  generateRegentBrief,
  BUDGET_DEBIT_CATEGORIES,
  budgetService,
} from '../services/budgetService';

const { width } = Dimensions.get('window');

export interface BudgetScreenProps {
  AppTopBarComponent?: React.ComponentType;
}

export const BudgetScreen: React.FC<BudgetScreenProps> = ({ AppTopBarComponent }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const { sync } = useSyncDb();

  const budgets = useBudgetStore((state: any) => state.budgets);
  const transactions = useTransactionStore((state: any) => state.transactions);
  const goals = useGoalsStore((state: any) => state.goals);

  const [refreshing, setRefreshing] = useState(false);
  // Bank profiles for real liquid balances
  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const totalBankBalance = useMemo(() => {
    return bankProfiles.reduce((sum, bank) => sum + (Number(bank.currentBalance) || 0), 0);
  }, [bankProfiles]);

  // Filter & UI State
  const [activeFilter, setActiveFilter] = useState<'all' | 'monthly' | 'weekly' | 'custom'>('all');
  const [expandedBudgetId, setExpandedBudgetId] = useState<string | null>(null);

  // Transfer Envelope Modal State
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [sourceBudget, setSourceBudget] = useState<BudgetCategory | null>(null);
  const [targetBudgetId, setTargetBudgetId] = useState<string>('');
  const [transferAmountStr, setTransferAmountStr] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Surplus Sweep to Goal Modal State
  const [sweepModalVisible, setSweepModalVisible] = useState(false);
  const [sweepBudget, setSweepBudget] = useState<BudgetCategory | null>(null);
  const [sweepGoalId, setSweepGoalId] = useState<string>('');
  const [sweepAmountStr, setSweepAmountStr] = useState('');
  const [sweeping, setSweeping] = useState(false);

  // Phase 3: Regent Brief & Affordability Simulator State
  const [showRegentBrief, setShowRegentBrief] = useState(false);
  const [affordModalVisible, setAffordModalVisible] = useState(false);
  const [affordAmountStr, setAffordAmountStr] = useState('');
  const [affordCategory, setAffordCategory] = useState('shopping');

  useFocusEffect(
    useCallback(() => {
      sync();
    }, [sync])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  }, [sync]);

  // Compute monthly income dynamically from real credits/salary
  const monthlyIncome = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthInflows = transactions.filter((tx: any) => {
      if (tx.type !== 'credit') return false;
      const time = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp || tx.date).getTime();
      const d = new Date(time);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    return monthInflows.reduce((sum: number, inc: any) => sum + Math.abs(parseFloat(inc.amount || 0)), 0);
  }, [transactions]);

  // Compute Free-To-Spend summary
  const freeToSpendData = useMemo(() => {
    return calculateFreeToSpend(monthlyIncome, transactions, budgets);
  }, [monthlyIncome, transactions, budgets]);

  // Phase 3: Weekly Regent Brief Memo
  const regentBrief = useMemo(() => {
    return generateRegentBrief(budgets, transactions, freeToSpendData.freeToSpendRemaining);
  }, [budgets, transactions, freeToSpendData.freeToSpendRemaining]);

  // Phase 3: Affordability Simulation Memo
  const affordResult = useMemo(() => {
    const amt = parseFloat(affordAmountStr.replace(/[^0-9.]/g, '')) || 0;
    return simulateAffordability(amt, affordCategory, transactions);
  }, [affordAmountStr, affordCategory, transactions]);

  // Filter budgets based on active tab
  const filteredBudgets = useMemo(() => {
    if (activeFilter === 'monthly') {
      return budgets.filter((b: BudgetCategory) => !b.periodType || b.periodType === 'monthly');
    }
    if (activeFilter === 'weekly') {
      return budgets.filter((b: BudgetCategory) => b.periodType && b.periodType.includes('week'));
    }
    if (activeFilter === 'custom') {
      return budgets.filter((b: BudgetCategory) => b.periodType && b.periodType !== 'monthly' && !b.periodType.includes('week'));
    }
    return budgets;
  }, [budgets, activeFilter]);

  // Delete budget confirmation
  const handleDeleteBudget = (budget: BudgetCategory) => {
    Alert.alert(
      'Delete Budget',
      `Are you sure you want to remove the "${budget.name || budget.category}" budget?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await budgetService.deleteBudget(budget.id);
          },
        },
      ]
    );
  };

  // Execute Envelope Transfer
  const handleConfirmTransfer = async () => {
    if (!sourceBudget || !targetBudgetId) {
      Alert.alert('Selection Required', 'Please select a destination budget.');
      return;
    }
    const amt = parseFloat(transferAmountStr.replace(/[^0-9.]/g, ''));
    if (!amt || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid transfer amount.');
      return;
    }
    if (amt > sourceBudget.limitAmount) {
      Alert.alert('Limit Exceeded', `Cannot transfer more than the available ceiling (₹${sourceBudget.limitAmount}).`);
      return;
    }

    setTransferring(true);
    try {
      await budgetService.transferEnvelope(sourceBudget.id, targetBudgetId, amt);
      setTransferModalVisible(false);
      Alert.alert('Transfer Complete', `₹${amt.toLocaleString('en-IN')} moved to the chosen budget envelope.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not transfer envelope funds.');
    } finally {
      setTransferring(false);
    }
  };

  // Execute Surplus Sweep to Goal
  const handleConfirmSweep = async () => {
    if (!sweepBudget || !sweepGoalId) {
      Alert.alert('Selection Required', 'Please select a destination savings goal.');
      return;
    }
    const amt = parseFloat(sweepAmountStr.replace(/[^0-9.]/g, ''));
    if (!amt || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid sweep amount.');
      return;
    }

    setSweeping(true);
    try {
      await budgetService.sweepSurplusToGoal(sweepBudget.id, sweepGoalId, amt);
      setSweepModalVisible(false);
      Alert.alert('Surplus Swept! 🎯', `₹${amt.toLocaleString('en-IN')} successfully added to your savings target.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not sweep surplus to goal.');
    } finally {
      setSweeping(false);
    }
  };

  const getCategoryMeta = (catId?: string, isOverall?: boolean) => {
    if (isOverall) return BUDGET_DEBIT_CATEGORIES[0];
    const found = BUDGET_DEBIT_CATEGORIES.find((c) => c.id === (catId || '').toLowerCase());
    return found || BUDGET_DEBIT_CATEGORIES[BUDGET_DEBIT_CATEGORIES.length - 1];
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {AppTopBarComponent ? <AppTopBarComponent /> : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: AppTopBarComponent ? 10 : insets.top + 12, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Header Title & Action */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.headerSubtitle, { color: colors.accent }]}>CAPITAL & SPENDING LIMITS</Text>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Budgets & Allocation</Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.accent }]}
            onPress={() => navigation.navigate('CreateBudget')}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#000000" />
            <Text style={styles.addBtnText}>New Budget</Text>
          </TouchableOpacity>
        </View>

        {/* 1. FREE-TO-SPEND HERO CARD */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.heroTopRow}>
            <View>
              <Text style={[styles.heroEyebrow, { color: colors.textSecondary }]}>
                {freeToSpendData.committedBudget > 0 ? 'TRULY FREE TO SPEND' : 'BUDGET ALLOCATED'}
              </Text>
              <Text style={[styles.heroAmount, { color: colors.text }]}>
                ₹{freeToSpendData.freeToSpendRemaining.toLocaleString('en-IN')}
              </Text>
            </View>
            <View
              style={[
                styles.paceBadge,
                {
                  backgroundColor:
                    freeToSpendData.freeToSpendRemaining > 0
                      ? 'rgba(45, 186, 78, 0.15)'
                      : isDark
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(0, 0, 0, 0.05)',
                  borderColor:
                    freeToSpendData.freeToSpendRemaining > 0
                      ? 'rgba(45, 186, 78, 0.35)'
                      : colors.border,
                },
              ]}
            >
              <Ionicons
                name={freeToSpendData.freeToSpendRemaining > 0 ? 'shield-checkmark' : 'information-circle-outline'}
                size={14}
                color={freeToSpendData.freeToSpendRemaining > 0 ? '#2dba4e' : colors.textSecondary}
              />
              <Text
                style={[
                  styles.paceBadgeText,
                  { color: freeToSpendData.freeToSpendRemaining > 0 ? '#2dba4e' : colors.textSecondary },
                ]}
              >
                {freeToSpendData.committedBudget > 0
                  ? `₹${freeToSpendData.safeDailySpend.toLocaleString('en-IN')}/day safe`
                  : 'No budget set'}
              </Text>
            </View>
          </View>

          {/* Breakdown Sub-metrics */}
          <View style={[styles.heroMetricsGrid, { borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0' }]}>
            <View style={styles.metricItem}>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Discretionary Spend</Text>
              <Text style={[styles.metricVal, { color: colors.text }]}>
                ₹{freeToSpendData.actualSpendSoFar.toLocaleString('en-IN')}
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Fixed EMI & Bills</Text>
              <Text style={[styles.metricVal, { color: '#ff9800' }]}>
                ₹{freeToSpendData.fixedObligations.toLocaleString('en-IN')}
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>Cycle Remaining</Text>
              <Text style={[styles.metricVal, { color: colors.accent }]}>
                {freeToSpendData.daysRemaining} Days
              </Text>
            </View>
          </View>
        </View>

        {/* PHASE 3: QUICK INTELLIGENCE ACTIONS */}
        <View style={styles.quickActionRow}>
          <TouchableOpacity
            style={[
              styles.quickActionBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
                borderColor: colors.border,
              },
            ]}
            onPress={() => setAffordModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="flash" size={15} color="#eab308" />
            <Text style={[styles.quickActionBtnText, { color: colors.text }]}>Can I Afford This?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickActionBtn,
              {
                backgroundColor: showRegentBrief
                  ? 'rgba(245, 158, 11, 0.15)'
                  : isDark
                  ? 'rgba(255, 255, 255, 0.05)'
                  : '#ffffff',
                borderColor: showRegentBrief ? '#f59e0b' : colors.border,
              },
            ]}
            onPress={() => setShowRegentBrief(!showRegentBrief)}
            activeOpacity={0.8}
          >
            <Ionicons name="newspaper-outline" size={15} color={showRegentBrief ? '#f59e0b' : colors.text} />
            <Text
              style={[
                styles.quickActionBtnText,
                { color: showRegentBrief ? '#f59e0b' : colors.text, fontWeight: showRegentBrief ? '700' : '600' },
              ]}
            >
              The Regent Brief {showRegentBrief ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* THE REGENT BRIEF (WEEKLY LUXURY EXECUTIVE SUMMARY) */}
        {showRegentBrief && (
          <View
            style={[
              styles.briefCard,
              {
                backgroundColor: isDark ? 'rgba(245, 158, 11, 0.06)' : 'rgba(245, 158, 11, 0.08)',
                borderColor: 'rgba(245, 158, 11, 0.3)',
              },
            ]}
          >
            <View style={styles.briefHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="shield-half" size={16} color="#f59e0b" />
                <Text style={[styles.briefTitle, { color: '#f59e0b' }]}>{regentBrief.title}</Text>
              </View>
              <View style={styles.briefPillsRow}>
                <View style={[styles.briefPill, { backgroundColor: 'rgba(45, 186, 78, 0.2)' }]}>
                  <Text style={[styles.briefPillText, { color: '#2dba4e' }]}>
                    {regentBrief.onTrackCount} on track
                  </Text>
                </View>
                {regentBrief.atRiskCount > 0 && (
                  <View style={[styles.briefPill, { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                    <Text style={[styles.briefPillText, { color: '#ef4444' }]}>
                      {regentBrief.atRiskCount} at risk
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <Text style={[styles.briefSubtitle, { color: colors.textSecondary }]}>
              {regentBrief.subtitle}
            </Text>

            <View style={styles.briefBullets}>
              <View style={styles.briefBulletRow}>
                <Ionicons name="checkmark-circle" size={15} color="#2dba4e" />
                <Text style={[styles.briefBulletText, { color: colors.text }]}>
                  <Text style={{ fontWeight: '700' }}>Key Win: </Text>
                  {regentBrief.topWin}
                </Text>
              </View>

              <View style={styles.briefBulletRow}>
                <Ionicons name="warning" size={15} color="#f59e0b" />
                <Text style={[styles.briefBulletText, { color: colors.text }]}>
                  <Text style={{ fontWeight: '700' }}>Pace Risk: </Text>
                  {regentBrief.keyRisk}
                </Text>
              </View>

              <View style={styles.briefBulletRow}>
                <Ionicons name="bulb" size={15} color={colors.accent} />
                <Text style={[styles.briefBulletText, { color: colors.text }]}>
                  <Text style={{ fontWeight: '700', color: colors.accent }}>Executive Action: </Text>
                  {regentBrief.executiveAction}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 2. FILTER PILLS */}
        <View style={styles.filterBar}>
          {(['all', 'monthly', 'weekly', 'custom'] as const).map((filter) => {
            const isSelected = activeFilter === filter;
            const labels = {
              all: `All (${budgets.length})`,
              monthly: 'Monthly',
              weekly: 'Weekly',
              custom: 'Multi-Mo / Years',
            };
            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isSelected
                      ? colors.accent
                      : isDark
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(0, 0, 0, 0.04)',
                    borderColor: isSelected ? colors.accent : colors.border,
                  },
                ]}
                onPress={() => setActiveFilter(filter)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterText,
                    {
                      color: isSelected ? '#000000' : colors.textSecondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}
                >
                  {labels[filter]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 3. BUDGET CARDS LIST */}
        {filteredBudgets.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#ffffff', borderColor: colors.border }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(22, 163, 74, 0.10)' }]}>
              <Ionicons name="pie-chart-outline" size={32} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Budgets Configured</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Set custom-date budgets (1 week to 5 years, or monthly) with safe daily spend guardrails.
            </Text>
            <TouchableOpacity
              style={[styles.createFirstBtn, { backgroundColor: colors.accent }]}
              onPress={() => navigation.navigate('CreateBudget')}
              activeOpacity={0.8}
            >
              <Text style={styles.createFirstBtnText}>Create Your First Budget</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cardsList}>
            {filteredBudgets.map((budget: BudgetCategory) => {
              const netSpendData = calculateBudgetNetSpend(budget, transactions);
              const pacing = calculateBudgetPacing(budget, netSpendData.netSpend);
              const meta = getCategoryMeta(budget.category, budget.isOverall);
              const isExpanded = expandedBudgetId === budget.id;
              const deepDive = isExpanded ? getBudgetDeepDive(netSpendData.matchingTransactions, netSpendData.netSpend, budget.startDate) : null;

              const progressColor =
                pacing.percentageUsed >= 100
                  ? '#ef4444'
                  : pacing.percentageUsed >= 80
                  ? '#f59e0b'
                  : colors.accent;

              return (
                <TouchableOpacity
                  key={budget.id}
                  style={[
                    styles.budgetCard,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                      borderColor: isExpanded ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => setExpandedBudgetId(isExpanded ? null : budget.id)}
                  activeOpacity={0.9}
                >
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={[styles.categoryIconCircle, { backgroundColor: `${meta.color}22` }]}>
                        <Ionicons name={meta.icon as any} size={18} color={meta.color} />
                      </View>
                      <View style={{ marginLeft: 12 }}>
                        <Text style={[styles.budgetTitle, { color: colors.text }]} numberOfLines={1}>
                          {budget.name || meta.label}
                        </Text>
                        <Text style={[styles.budgetPeriodLabel, { color: colors.textSecondary }]}>
                          {budget.period || 'Active Window'} • {pacing.daysRemaining}d left
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textSecondary}
                      />
                      <TouchableOpacity
                        onPress={() => handleDeleteBudget(budget)}
                        style={styles.cardOptionsBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Amount Spent vs Limit */}
                  <View style={styles.amountRow}>
                    <View>
                      <Text style={[styles.spentAmountText, { color: colors.text }]}>
                        ₹{netSpendData.netSpend.toLocaleString('en-IN')}
                      </Text>
                      <Text style={[styles.spentSubText, { color: colors.textSecondary }]}>
                        {netSpendData.refunds > 0
                          ? `(Gross ₹${netSpendData.grossSpend.toLocaleString('en-IN')} − ₹${netSpendData.refunds.toLocaleString('en-IN')} Refunds)`
                          : `${netSpendData.transactionCount} transactions`}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.limitAmountText, { color: colors.textSecondary }]}>
                        of ₹{budget.limitAmount.toLocaleString('en-IN')}
                      </Text>
                      <Text style={[styles.percentBadge, { color: progressColor }]}>
                        {pacing.percentageUsed}%
                      </Text>
                    </View>
                  </View>

                  {/* Progress Bar */}
                  <View style={[styles.progressBarTrack, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0' }]}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          width: `${Math.min(100, pacing.percentageUsed)}%`,
                          backgroundColor: progressColor,
                        },
                      ]}
                    />
                  </View>

                  {/* Footer: Safe Pace Indicator */}
                  <View style={styles.cardFooter}>
                    <View style={styles.burnRow}>
                      <Ionicons
                        name={
                          pacing.paceStatus === 'overbudget'
                            ? 'close-circle'
                            : pacing.paceStatus === 'caution'
                            ? 'warning'
                            : 'checkmark-circle'
                        }
                        size={14}
                        color={progressColor}
                      />
                      <Text style={[styles.paceMessage, { color: colors.textSecondary }]}>
                        {pacing.paceMessage}
                      </Text>
                    </View>
                  </View>

                  {/* PHASE 2: EXPANDABLE MERCHANT DEEP DIVE & ENVELOPE CONTROLS */}
                  {isExpanded && deepDive && (
                    <View style={[styles.deepDiveContainer, { borderTopColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0' }]}>
                      {/* 1. Top Merchants */}
                      <Text style={[styles.deepDiveHeading, { color: colors.textSecondary }]}>
                        TOP SPENDING OUTLETS
                      </Text>
                      {deepDive.topMerchants.length === 0 ? (
                        <Text style={[styles.noMerchantText, { color: colors.textSecondary }]}>
                          No merchant transactions in this window yet.
                        </Text>
                      ) : (
                        <View style={styles.merchantGrid}>
                          {deepDive.topMerchants.map((m) => (
                            <View
                              key={m.merchant}
                              style={[
                                styles.merchantPill,
                                {
                                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc',
                                  borderColor: colors.border,
                                },
                              ]}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.merchantName, { color: colors.text }]} numberOfLines={1}>
                                  {m.merchant}
                                </Text>
                                <Text style={[styles.merchantSub, { color: colors.textSecondary }]}>
                                  {m.count} txns • {m.percentage}% of spend
                                </Text>
                              </View>
                              <Text style={[styles.merchantAmount, { color: colors.text }]}>
                                ₹{m.amount.toLocaleString('en-IN')}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* 2. Temporal Pattern (Weekday vs Weekend) */}
                      <View style={styles.patternRow}>
                        <View style={[styles.patternBox, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', borderColor: colors.border }]}>
                          <Text style={[styles.patternLabel, { color: colors.textSecondary }]}>Weekday Spend</Text>
                          <Text style={[styles.patternVal, { color: colors.text }]}>
                            {deepDive.weekdayPercent}% (₹{deepDive.weekdaySpend.toLocaleString('en-IN')})
                          </Text>
                        </View>
                        <View style={[styles.patternBox, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc', borderColor: colors.border }]}>
                          <Text style={[styles.patternLabel, { color: colors.textSecondary }]}>Weekend Spend</Text>
                          <Text style={[styles.patternVal, { color: '#ff9800' }]}>
                            {deepDive.weekendPercent}% (₹{deepDive.weekendSpend.toLocaleString('en-IN')})
                          </Text>
                        </View>
                      </View>

                      {/* 3. Action Buttons: Envelope Transfer & Goal Sweep */}
                      <View style={styles.envelopeActionRow}>
                        <TouchableOpacity
                          style={[styles.envelopeActionBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0' }]}
                          onPress={() => {
                            setSourceBudget(budget);
                            const other = budgets.find((b: BudgetCategory) => b.id !== budget.id);
                            if (other) setTargetBudgetId(other.id);
                            setTransferModalVisible(true);
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="swap-horizontal" size={16} color={colors.text} />
                          <Text style={[styles.envelopeActionText, { color: colors.text }]}>Transfer Envelope</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.envelopeActionBtn, { backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(22, 163, 74, 0.12)' }]}
                          onPress={() => {
                            setSweepBudget(budget);
                            if (goals.length > 0) setSweepGoalId(goals[0].id);
                            setSweepModalVisible(true);
                          }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="sparkles" size={15} color={colors.accent} />
                          <Text style={[styles.envelopeActionText, { color: colors.accent, fontWeight: '700' }]}>
                            Sweep to Goal
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ENVELOPE TRANSFER MODAL */}
      <Modal visible={transferModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#161b22' : '#ffffff', borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Transfer Budget Envelope</Text>
              <TouchableOpacity onPress={() => setTransferModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              Move spending ceiling from "{sourceBudget?.name || sourceBudget?.category}" to another budget.
            </Text>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>DESTINATION BUDGET</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.destPickerScroll}>
              {budgets
                .filter((b: BudgetCategory) => b.id !== sourceBudget?.id)
                .map((b: BudgetCategory) => {
                  const isChosen = targetBudgetId === b.id;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[
                        styles.destBudgetChip,
                        {
                          backgroundColor: isChosen ? colors.accent : isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9',
                          borderColor: isChosen ? colors.accent : colors.border,
                        },
                      ]}
                      onPress={() => setTargetBudgetId(b.id)}
                    >
                      <Text style={[styles.destBudgetChipText, { color: isChosen ? '#000000' : colors.text }]}>
                        {b.name || b.category}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 14 }]}>TRANSFER AMOUNT</Text>
            <View style={[styles.modalInputBox, { borderColor: colors.border, backgroundColor: isDark ? '#0d1117' : '#f8fafc' }]}>
              <Text style={[styles.currencyPrefix, { color: colors.accent }]}>₹</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.text }]}
                value={transferAmountStr}
                onChangeText={setTransferAmountStr}
                keyboardType="numeric"
                placeholder="1000"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <TouchableOpacity
              style={[styles.modalSubmitBtn, { backgroundColor: colors.accent }]}
              onPress={handleConfirmTransfer}
              disabled={transferring}
            >
              {transferring ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Text style={styles.modalSubmitBtnText}>Confirm Transfer</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* SURPLUS SWEEP TO GOAL MODAL */}
      <Modal visible={sweepModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#161b22' : '#ffffff', borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Sweep Surplus to Goal</Text>
              <TouchableOpacity onPress={() => setSweepModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              Move left-over ceiling from "{sweepBudget?.name || sweepBudget?.category}" into a wealth goal.
            </Text>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>CHOOSE SAVINGS GOAL</Text>
            {goals.length === 0 ? (
              <Text style={[styles.noGoalsText, { color: colors.textSecondary }]}>
                No active savings goals found. Create one in the Goals tab!
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.destPickerScroll}>
                {goals.map((g: Goal) => {
                  const isChosen = sweepGoalId === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      style={[
                        styles.destBudgetChip,
                        {
                          backgroundColor: isChosen ? colors.accent : isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9',
                          borderColor: isChosen ? colors.accent : colors.border,
                        },
                      ]}
                      onPress={() => setSweepGoalId(g.id)}
                    >
                      <Text style={[styles.destBudgetChipText, { color: isChosen ? '#000000' : colors.text }]}>
                        {g.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 14 }]}>SWEEP AMOUNT</Text>
            <View style={[styles.modalInputBox, { borderColor: colors.border, backgroundColor: isDark ? '#0d1117' : '#f8fafc' }]}>
              <Text style={[styles.currencyPrefix, { color: colors.accent }]}>₹</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.text }]}
                value={sweepAmountStr}
                onChangeText={setSweepAmountStr}
                keyboardType="numeric"
                placeholder="1500"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            <TouchableOpacity
              style={[styles.modalSubmitBtn, { backgroundColor: colors.accent }]}
              onPress={handleConfirmSweep}
              disabled={sweeping || goals.length === 0}
            >
              {sweeping ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Text style={styles.modalSubmitBtnText}>Confirm Sweep</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* AFFORDABILITY SIMULATOR MODAL */}
      <Modal visible={affordModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#161b22' : '#ffffff', borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="flash" size={18} color="#eab308" />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Can I Afford This?</Text>
              </View>
              <TouchableOpacity onPress={() => setAffordModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              Simulate an intended expense before swiping to see the impact on your budget and daily safe spend.
            </Text>

            {/* Category Selector */}
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>EXPENSE CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.destPickerScroll}>
              {BUDGET_DEBIT_CATEGORIES.map((cat) => {
                const isSelected = affordCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.destBudgetChip,
                      {
                        backgroundColor: isSelected ? colors.accent : isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9',
                        borderColor: isSelected ? colors.accent : colors.border,
                      },
                    ]}
                    onPress={() => setAffordCategory(cat.id)}
                  >
                    <Text style={[styles.destBudgetChipText, { color: isSelected ? '#000000' : colors.text }]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Purchase Amount Input */}
            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>INTENDED PURCHASE (₹)</Text>
            <View style={[styles.modalInputBox, { borderColor: colors.border, backgroundColor: isDark ? '#0d1117' : '#f8fafc' }]}>
              <Text style={[styles.currencyPrefix, { color: colors.accent }]}>₹</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.text }]}
                value={affordAmountStr}
                onChangeText={setAffordAmountStr}
                keyboardType="numeric"
                placeholder="3500"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Live Simulation Card */}
            <View
              style={[
                styles.simulationCard,
                {
                  backgroundColor:
                    affordResult.verdict === 'breach'
                      ? 'rgba(239, 68, 68, 0.12)'
                      : affordResult.verdict === 'caution'
                      ? 'rgba(245, 158, 11, 0.12)'
                      : 'rgba(45, 186, 78, 0.12)',
                  borderColor:
                    affordResult.verdict === 'breach'
                      ? 'rgba(239, 68, 68, 0.35)'
                      : affordResult.verdict === 'caution'
                      ? 'rgba(245, 158, 11, 0.35)'
                      : 'rgba(45, 186, 78, 0.35)',
                },
              ]}
            >
              <View style={styles.simTopRow}>
                <Text
                  style={[
                    styles.simVerdictTag,
                    {
                      color:
                        affordResult.verdict === 'breach'
                          ? '#ef4444'
                          : affordResult.verdict === 'caution'
                          ? '#f59e0b'
                          : '#2dba4e',
                    },
                  ]}
                >
                  {affordResult.verdict === 'breach'
                    ? '⚠️ BUDGET BREACH'
                    : affordResult.verdict === 'caution'
                    ? '⚠️ HIGH CAUTION'
                    : '✅ SAFE TO PROCEED'}
                </Text>
                <Text style={[styles.simPercentText, { color: colors.text }]}>
                  {affordResult.currentPercentage}% → {affordResult.newPercentage}%
                </Text>
              </View>

              <Text style={[styles.simMessage, { color: colors.text }]}>{affordResult.verdictMessage}</Text>
              <Text style={[styles.simRec, { color: colors.textSecondary }]}>{affordResult.recommendation}</Text>
            </View>

            <TouchableOpacity
              style={[styles.modalSubmitBtn, { backgroundColor: colors.accent, marginTop: 14 }]}
              onPress={() => setAffordModalVisible(false)}
            >
              <Text style={styles.modalSubmitBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  addBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
  heroCard: {
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    marginBottom: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  paceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  paceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroMetricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 14,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  metricVal: {
    fontSize: 14,
    fontWeight: '800',
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginHorizontal: 12,
  },
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterText: {
    fontSize: 12,
  },
  cardsList: {
    gap: 12,
  },
  budgetCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  budgetTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  budgetPeriodLabel: {
    fontSize: 12,
    marginTop: 1,
  },
  cardOptionsBtn: {
    padding: 6,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  spentAmountText: {
    fontSize: 22,
    fontWeight: '900',
  },
  spentSubText: {
    fontSize: 11,
    marginTop: 1,
  },
  limitAmountText: {
    fontSize: 13,
    fontWeight: '600',
  },
  percentBadge: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  progressBarTrack: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  burnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  paceMessage: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  deepDiveContainer: {
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
  },
  deepDiveHeading: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  noMerchantText: {
    fontSize: 12,
    marginBottom: 8,
  },
  merchantGrid: {
    gap: 6,
    marginBottom: 12,
  },
  merchantPill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  merchantName: {
    fontSize: 12,
    fontWeight: '700',
  },
  merchantSub: {
    fontSize: 10,
    marginTop: 1,
  },
  merchantAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  patternRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  patternBox: {
    flex: 1,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  patternLabel: {
    fontSize: 10,
    marginBottom: 2,
  },
  patternVal: {
    fontSize: 12,
    fontWeight: '700',
  },
  envelopeActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  envelopeActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 12,
    gap: 6,
  },
  envelopeActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    marginTop: 10,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
    marginBottom: 20,
  },
  createFirstBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  createFirstBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  destPickerScroll: {
    marginBottom: 8,
  },
  destBudgetChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
  },
  destBudgetChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  noGoalsText: {
    fontSize: 12,
    marginBottom: 10,
  },
  modalInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 18,
  },
  currencyPrefix: {
    fontSize: 20,
    fontWeight: '800',
    marginRight: 6,
  },
  modalInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    padding: 0,
  },
  modalSubmitBtn: {
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  quickActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  briefCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  briefHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  briefTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  briefPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  briefPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  briefPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  briefSubtitle: {
    fontSize: 11,
    marginBottom: 12,
  },
  briefBullets: {
    gap: 8,
  },
  briefBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  briefBulletText: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  simulationCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 6,
  },
  simTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  simVerdictTag: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  simPercentText: {
    fontSize: 13,
    fontWeight: '800',
  },
  simMessage: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 16,
  },
  simRec: {
    fontSize: 11,
    lineHeight: 15,
  },
});
