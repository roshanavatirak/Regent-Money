import React, { useState, useMemo, useCallback, useEffect } from 'react';
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
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { format } from 'date-fns';
import {
  useTheme,
  useBudgetStore,
  useTransactionStore,
  BudgetCategory,
  showGlobalConfirm,
} from '../store';
import { useSyncDb } from '../services/useSyncDb';
import {
  calculateBudgetNetSpend,
  calculateBudgetHierarchy,
  getCategoryMeta,
  budgetService,
  BUDGET_DEBIT_CATEGORIES,
  getBudgetStatus,
  getBudgetTemplateData,
  BudgetStatus,
  isExcludedFromBudget,
} from '../services/budgetService';
import { StandaloneBottomTabBar } from './StandaloneBottomTabBar';

export interface BudgetScreenProps {
  AppTopBarComponent?: React.ComponentType;
}

export const BudgetScreen: React.FC<BudgetScreenProps> = ({ AppTopBarComponent }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark } = useTheme();
  const { sync } = useSyncDb();

  const budgets = useBudgetStore((state) => state.budgets);
  const customCategories = useBudgetStore((state) => state.customCategories || []);
  const transactions = useTransactionStore((state) => state.transactions);

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'monthly' | 'events' | 'history'>('monthly');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'monthly' | 'events'>('all');

  // Affordability Check Modal State
  const [affordModalVisible, setAffordModalVisible] = useState(false);
  const [affordAmountStr, setAffordAmountStr] = useState('');
  const [affordCategory, setAffordCategory] = useState('food');

  // Transfer Allocation Modal State
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [sourceBudget, setSourceBudget] = useState<BudgetCategory | null>(null);
  const [targetBudgetId, setTargetBudgetId] = useState<string>('');
  const [transferAmountStr, setTransferAmountStr] = useState('');
  const [transferring, setTransferring] = useState(false);

  // Three-dot Options Menu State
  const [menuBudget, setMenuBudget] = useState<BudgetCategory | null>(null);
  const [editLimitStr, setEditLimitStr] = useState('');
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [othersExpanded, setOthersExpanded] = useState(false);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Record<string, boolean>>({});
  const [excludedModalVisible, setExcludedModalVisible] = useState(false);

  const excludeTransactionFromBudget = useBudgetStore((state) => state.excludeTransactionFromBudget);
  const restoreTransactionToBudget = useBudgetStore((state) => state.restoreTransactionToBudget);
  const clearAllExcludedTransactions = useBudgetStore((state) => state.clearAllExcludedTransactions);
  const excludedTransactionIds = useBudgetStore((state) => state.excludedTransactionIds || []);

  const toggleCategoryExpanded = (catId: string) => {
    setExpandedCategoryIds((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  const handleExcludeTransaction = (tx: any) => {
    const merchantName = tx.merchant || 'this transaction';
    const amountStr = `₹${Math.abs(parseFloat(tx.amount || 0)).toLocaleString('en-IN')}`;
    showGlobalConfirm({
      title: 'Remove from Budget?',
      message: `Remove "${merchantName}" (${amountStr}) from this budget?\n\nThis will NOT delete the transaction from your Home screen or Bank accounts. It only removes it from your budget spending calculations.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      isDestructive: true,
      onConfirm: () => {
        excludeTransactionFromBudget(tx.id);
      },
    });
  };

  const excludedTransactionsList = useMemo(() => {
    return transactions.filter((t) => excludedTransactionIds.includes(t.id));
  }, [transactions, excludedTransactionIds]);

  const markBudgetDone = useBudgetStore((state) => state.markBudgetDone);

  const handleToggleDone = (budget: BudgetCategory) => {
    const isCurrentlyDone = !!budget.isDone;
    markBudgetDone(budget.id, !isCurrentlyDone);
  };

  const allOverallAndEventBudgets = useMemo(() => {
    return budgets.filter(
      (b) => b.isOverall || b.periodType === 'custom_event' || (b.periodType !== 'monthly' && b.periodType !== undefined)
    );
  }, [budgets]);

  const historyBudgets = useMemo(() => {
    return allOverallAndEventBudgets
      .filter((b) => {
        if (historyFilter === 'monthly') return b.isOverall;
        if (historyFilter === 'events') return !b.isOverall;
        return true;
      })
      .sort((a, b) => {
        const statusA = getBudgetStatus(a);
        const statusB = getBudgetStatus(b);
        const score = (st: string) => (st === 'in_progress' ? 0 : st === 'not_started' ? 1 : 2);
        if (score(statusA.status) !== score(statusB.status)) {
          return score(statusA.status) - score(statusB.status);
        }
        return (b.startDate || 0) - (a.startDate || 0);
      });
  }, [allOverallAndEventBudgets, historyFilter]);

  const getHistoryBudgetStats = useCallback(
    (budget: BudgetCategory) => {
      const limit = Number(budget.limitAmount || 0);
      let spent = 0;
      if (budget.isOverall) {
        const s = typeof budget.startDate === 'number' ? budget.startDate : new Date(budget.startDate || 0).getTime();
        const e = typeof budget.endDate === 'number' ? budget.endDate : new Date(budget.endDate || 0).getTime();
        spent = transactions.reduce((acc, t) => {
          if (isExcludedFromBudget(t, excludedTransactionIds)) return acc;
          const txTime = typeof t.timestamp === 'number' ? t.timestamp : new Date(t.timestamp).getTime();
          if (s && e && (txTime < s || txTime > e)) return acc;
          return acc + Math.abs(parseFloat(t.amount || 0));
        }, 0);
      } else {
        const sp = calculateBudgetNetSpend(budget, transactions);
        spent = sp.netSpend;
      }
      const remaining = Math.max(0, limit - spent);
      const overspent = Math.max(0, spent - limit);
      const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
      return { limit, spent, remaining, overspent, pct };
    },
    [transactions, excludedTransactionIds]
  );

  useEffect(() => {
    if (menuBudget) {
      setEditLimitStr(String(menuBudget.limitAmount || ''));
      setIsEditingLimit(false);
    }
  }, [menuBudget?.id]);

  // Sync active tab from route params (e.g. after creating a special event)
  useEffect(() => {
    if (route.params?.openTab) {
      setActiveTab(route.params.openTab);
    }
  }, [route.params?.openTab]);

  useFocusEffect(
    useCallback(() => {
      sync();
      if (route.params?.openTab) {
        setActiveTab(route.params.openTab);
      }
    }, [sync, route.params?.openTab])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  }, [sync]);

  const [selectedMonthlyBudgetId, setSelectedMonthlyBudgetId] = useState<string | null>(null);

  // All Monthly Overall Budgets (e.g., October 2026, November 2026)
  const allMonthlyOverallBudgets = useMemo(() => {
    return budgets
      .filter((b) => b.isOverall && (!b.periodType || b.periodType === 'monthly'))
      .sort((a, b) => (a.startDate || 0) - (b.startDate || 0));
  }, [budgets]);

  // Selected or Active Monthly Overall Budget
  const monthlyOverallBudget = useMemo(() => {
    if (selectedMonthlyBudgetId) {
      const found = allMonthlyOverallBudgets.find((b) => b.id === selectedMonthlyBudgetId);
      if (found) return found;
    }
    const now = Date.now();
    // Default to currently active month, or the first in-progress month, or the first budget
    const active = allMonthlyOverallBudgets.find((b) => {
      const s = typeof b.startDate === 'number' ? b.startDate : new Date(b.startDate || 0).getTime();
      const e = typeof b.endDate === 'number' ? b.endDate : new Date(b.endDate || 0).getTime();
      return now >= s && now <= e;
    });
    return active || allMonthlyOverallBudgets[0] || null;
  }, [allMonthlyOverallBudgets, selectedMonthlyBudgetId]);

  // Sub-categories scoped strictly to the selected monthly overall budget
  const monthlyCategoryBudgets = useMemo(() => {
    if (!monthlyOverallBudget) return [];
    return budgets.filter((b) => {
      if (b.isOverall || (b.periodType && b.periodType !== 'monthly')) return false;
      if (b.parentBudgetId) return b.parentBudgetId === monthlyOverallBudget.id;
      return b.period === monthlyOverallBudget.period;
    });
  }, [budgets, monthlyOverallBudget]);

  const specialEventBudgets = useMemo(() => {
    return budgets.filter((b) => b.periodType === 'custom_event' || (b.periodType !== 'monthly' && !b.isOverall && b.periodType !== undefined));
  }, [budgets]);

  // Compute Hierarchical Sub-Budget & Free to Spend Allocation
  const hierarchy = useMemo(() => {
    return calculateBudgetHierarchy(monthlyOverallBudget, monthlyCategoryBudgets, transactions);
  }, [monthlyOverallBudget, monthlyCategoryBudgets, transactions, excludedTransactionIds]);

  // Delete budget handler (cross-platform with showGlobalConfirm)
  const handleDeleteBudget = (budget: BudgetCategory) => {
    const budgetName = budget.name || budget.category;
    showGlobalConfirm({
      title: 'Delete Budget',
      message: `Are you sure you want to remove the "${budgetName}" budget? Its allocation will be returned to your monthly free buffer.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await budgetService.deleteBudget(budget.id);
        } catch (err: any) {
          Alert.alert('Error', err?.message || 'Could not delete budget');
        }
      },
    });
  };

  // Toggle Early Tracking for a Budget ("Crazy Feature")
  const handleToggleTracking = async (budget: BudgetCategory) => {
    const isCurrentlyActive = budget.isManuallyActivated;
    const newActive = !isCurrentlyActive;
    try {
      await budgetService.updateBudget(budget.id, {
        isManuallyActivated: newActive,
        effectiveStartDate: newActive ? Date.now() : undefined,
      });
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not toggle tracking');
    }
  };

  // Toggle Pause/Resume Tracking handler (Turn Tracking ON / OFF)
  const handleTogglePause = async (budget: BudgetCategory) => {
    const isCurrentlyPaused = !!budget.isPaused;
    const newPaused = !isCurrentlyPaused;
    try {
      await budgetService.updateBudget(budget.id, {
        isPaused: newPaused,
      });
      if (menuBudget && menuBudget.id === budget.id) {
        setMenuBudget({ ...menuBudget, isPaused: newPaused });
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not update tracking status');
    }
  };

  // Save edited budget limit from 3-dot menu
  const handleSaveEditedLimit = async () => {
    if (!menuBudget) return;
    const newLimit = parseFloat(editLimitStr.replace(/[^0-9.]/g, ''));
    if (isNaN(newLimit) || newLimit <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid budget limit amount.');
      return;
    }
    try {
      setSavingEdit(true);
      await budgetService.updateBudget(menuBudget.id, {
        limitAmount: newLimit,
      });
      setMenuBudget({ ...menuBudget, limitAmount: newLimit });
      setIsEditingLimit(false);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not update budget limit');
    } finally {
      setSavingEdit(false);
    }
  };

  // Transfer allocation handler
  const handleConfirmTransfer = async () => {
    if (!sourceBudget || !targetBudgetId) {
      Alert.alert('Selection Required', 'Please select a destination category.');
      return;
    }
    const amt = parseFloat(transferAmountStr);
    if (!amt || isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid transfer amount.');
      return;
    }
    if (amt > sourceBudget.limitAmount) {
      Alert.alert('Insufficient Allocation', 'Transfer amount exceeds source budget limit.');
      return;
    }
    try {
      setTransferring(true);
      await budgetService.transferEnvelope(sourceBudget.id, targetBudgetId, amt);
      setTransferModalVisible(false);
      setTransferAmountStr('');
      setSourceBudget(null);
    } catch (err: any) {
      Alert.alert('Transfer Error', err.message || 'Could not complete transfer.');
    } finally {
      setTransferring(false);
    }
  };

  // Affordability Simulation
  const affordImpact = useMemo(() => {
    const purchaseAmt = parseFloat(affordAmountStr.replace(/[^0-9.]/g, '')) || 0;
    if (purchaseAmt <= 0) return null;

    const remainingFree = hierarchy.unallocatedRemaining;
    const canAfford = purchaseAmt <= remainingFree;
    const newRemaining = Math.max(0, remainingFree - purchaseAmt);

    return {
      purchaseAmt,
      canAfford,
      remainingFree,
      newRemaining,
    };
  }, [affordAmountStr, hierarchy.unallocatedRemaining]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {AppTopBarComponent && <AppTopBarComponent />}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: AppTopBarComponent ? 10 : insets.top + 12, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Header Title & Action (Space-optimized) */}
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Budgets</Text>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.accent }]}
            onPress={() =>
              navigation.navigate('CreateBudget', {
                initialType: activeTab === 'events' ? 'custom_event' : 'monthly',
              })
            }
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={15} color="#ffffff" />
            <Text style={styles.addBtnText}>
              {activeTab === 'events' ? 'Event' : 'Budget'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Compact Segmented Tabs */}
        <View style={[styles.tabSelectorRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#e2e8f0' }]}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'monthly' && [styles.tabButtonActive, { backgroundColor: colors.accent }]]}
            onPress={() => setActiveTab('monthly')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="calendar-outline"
              size={13}
              color={activeTab === 'monthly' ? '#ffffff' : colors.textSecondary}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabButtonText, { color: activeTab === 'monthly' ? '#ffffff' : colors.textSecondary }]}>
              Monthly
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'events' && [styles.tabButtonActive, { backgroundColor: colors.accent }]]}
            onPress={() => setActiveTab('events')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="airplane-outline"
              size={13}
              color={activeTab === 'events' ? '#ffffff' : colors.textSecondary}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabButtonText, { color: activeTab === 'events' ? '#ffffff' : colors.textSecondary }]}>
              Events ({specialEventBudgets.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'history' && [styles.tabButtonActive, { backgroundColor: colors.accent }]]}
            onPress={() => setActiveTab('history')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="time-outline"
              size={13}
              color={activeTab === 'history' ? '#ffffff' : colors.textSecondary}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabButtonText, { color: activeTab === 'history' ? '#ffffff' : colors.textSecondary }]}>
              History ({historyBudgets.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* MONTHLY BUDGET VIEW */}
        {activeTab === 'monthly' ? (
          <>
            {/* MONTH CYCLE SELECTOR (EQUALLY SIZED SEGMENTED BUTTONS) */}
            {allMonthlyOverallBudgets.length > 1 && (
              <View
                style={[
                  styles.monthCycleContainer,
                  {
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.25)' : '#e2e8f0',
                    borderColor: colors.border,
                  },
                ]}
              >
                {allMonthlyOverallBudgets.map((b) => {
                  const isSelected = b.id === monthlyOverallBudget?.id;
                  const st = getBudgetStatus(b);
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[
                        styles.monthCyclePill,
                        isSelected && [
                          styles.monthCyclePillActive,
                          {
                            backgroundColor: isDark ? colors.card : '#ffffff',
                            borderColor: colors.border,
                          },
                        ],
                      ]}
                      onPress={() => setSelectedMonthlyBudgetId(b.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={st.icon as any}
                        size={12}
                        color={isSelected ? colors.accent : colors.textSecondary}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.monthCyclePillText,
                          {
                            color: isSelected ? colors.text : colors.textSecondary,
                            fontWeight: isSelected ? '700' : '500',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {b.period || format(b.startDate || new Date(), 'MMM yyyy')}
                      </Text>
                      <View
                        style={[
                          styles.monthCycleMiniBadge,
                          {
                            backgroundColor: isSelected
                              ? isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(22, 163, 74, 0.1)'
                              : isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.monthCycleMiniBadgeText,
                            { color: isSelected ? colors.accent : colors.textSecondary },
                          ]}
                        >
                          {st.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {monthlyOverallBudget ? (
              /* 1. COMPACT EXECUTIVE HERO CARD */
              <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Top Row: Month, Status Pill, Days, Menu */}
                <View style={styles.heroTopRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="calendar-outline" size={13} color={colors.accent} />
                    <Text style={[styles.heroCycleLabel, { color: colors.text }]}>
                      {format(monthlyOverallBudget.startDate || new Date(), 'MMMM yyyy')}
                    </Text>
                    {/* Dynamic Status Pill */}
                    {(() => {
                      const st = getBudgetStatus(monthlyOverallBudget);
                      return (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setMenuBudget(monthlyOverallBudget)}
                          style={[
                            styles.activeStatusPill,
                            {
                              backgroundColor: st.badgeBg,
                              borderColor: st.color,
                            },
                          ]}
                        >
                          <Ionicons
                            name={st.icon as any}
                            size={10}
                            color={st.color}
                          />
                          <Text
                            style={[
                              styles.activeStatusText,
                              { color: st.color },
                            ]}
                          >
                            {st.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })()}
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {(() => {
                      const now = Date.now();
                      const start = Number(monthlyOverallBudget.startDate) || 0;
                      const isUpcoming = now < start;
                      if (isUpcoming) {
                        const daysToStart = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
                        return (
                          <View
                            style={[
                              styles.daysBadge,
                              {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                                borderColor: colors.border,
                              },
                            ]}
                          >
                            <Ionicons name="hourglass-outline" size={11} color={colors.textSecondary} style={{ marginRight: 3 }} />
                            <Text style={[styles.daysBadgeText, { color: colors.textSecondary }]}>
                              starts in {daysToStart}d
                            </Text>
                          </View>
                        );
                      }
                      return (
                        <View style={[styles.daysBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderColor: colors.border }]}>
                          <Ionicons name="time-outline" size={11} color={colors.textSecondary} style={{ marginRight: 3 }} />
                          <Text style={[styles.daysBadgeText, { color: colors.textSecondary }]}>
                            {hierarchy.daysRemaining}d
                          </Text>
                        </View>
                      );
                    })()}

                    {/* Three-Dot Menu Button on Hero Card */}
                    <TouchableOpacity
                      style={[
                        styles.threeDotHeroBtn,
                        {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => setMenuBudget(monthlyOverallBudget)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="ellipsis-vertical" size={15} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Primary Balance Row */}
                <View style={styles.heroBalanceRow}>
                  <View>
                    <Text style={[styles.heroTotalAmount, { color: hierarchy.totalRemaining === 0 ? colors.danger : colors.text }]}>
                      ₹{hierarchy.totalRemaining.toLocaleString('en-IN')}
                    </Text>
                    <Text style={[styles.heroSubBalanceText, { color: colors.textSecondary }]}>
                      available of ₹{hierarchy.totalLimit.toLocaleString('en-IN')} ceiling
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.affordMiniBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                      },
                    ]}
                    onPress={() => setAffordModalVisible(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="flash-outline" size={12} color={colors.accent} style={{ marginRight: 4 }} />
                    <Text style={[styles.affordMiniBtnText, { color: colors.text }]}>Afford?</Text>
                  </TouchableOpacity>
                </View>

                {/* Slim Smooth Progress Bar */}
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(100, hierarchy.totalLimit > 0 ? (hierarchy.totalSpent / hierarchy.totalLimit) * 100 : 0)}%`,
                        backgroundColor: hierarchy.totalSpent > hierarchy.totalLimit ? colors.danger : colors.accent,
                      },
                    ]}
                  />
                </View>

                {/* 4-Stat Micro Grid (Clean, Icon-Driven, Compact) */}
                <View style={[styles.heroMicroGrid, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderColor: colors.border }]}>
                  {/* Spent */}
                  <View style={styles.microStatCol}>
                    <View style={styles.microStatHeader}>
                      <Ionicons name="arrow-up-circle-outline" size={11} color={colors.danger} />
                      <Text style={[styles.microStatLabel, { color: colors.textSecondary }]}>Spent</Text>
                    </View>
                    <Text style={[styles.microStatVal, { color: colors.danger }]}>
                      ₹{hierarchy.totalSpent.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={[styles.microStatDivider, { backgroundColor: colors.border }]} />

                  {/* Allocated */}
                  <View style={styles.microStatCol}>
                    <View style={styles.microStatHeader}>
                      <Ionicons name="layers-outline" size={11} color={colors.textSecondary} />
                      <Text style={[styles.microStatLabel, { color: colors.textSecondary }]}>Allocated</Text>
                    </View>
                    <Text style={[styles.microStatVal, { color: colors.text }]}>
                      ₹{hierarchy.allocatedLimit.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={[styles.microStatDivider, { backgroundColor: colors.border }]} />

                  {/* Buffer */}
                  <View style={styles.microStatCol}>
                    <View style={styles.microStatHeader}>
                      <Ionicons name="wallet-outline" size={11} color={colors.accent} />
                      <Text style={[styles.microStatLabel, { color: colors.textSecondary }]}>Buffer</Text>
                    </View>
                    <Text style={[styles.microStatVal, { color: colors.accent }]}>
                      ₹{hierarchy.unallocatedRemaining.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={[styles.microStatDivider, { backgroundColor: colors.border }]} />

                  {/* Safe/Day */}
                  <View style={styles.microStatCol}>
                    <View style={styles.microStatHeader}>
                      <Ionicons name="shield-checkmark-outline" size={11} color={colors.textSecondary} />
                      <Text style={[styles.microStatLabel, { color: colors.textSecondary }]}>Safe/d</Text>
                    </View>
                    <Text style={[styles.microStatVal, { color: colors.text }]}>
                      ₹{hierarchy.dailySafeSpend.toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              /* EMPTY MONTHLY BUDGET CARD */
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="wallet-outline" size={40} color={colors.accent} style={{ marginBottom: 12 }} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Monthly Budget Set</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  Set an overall limit (e.g. ₹9,000) for this month and allocate sub-budgets for rent, food, and bills.
                </Text>
                <TouchableOpacity
                  style={[styles.createFirstBtn, { backgroundColor: colors.accent }]}
                  onPress={() => navigation.navigate('CreateBudget', { initialType: 'monthly', initialScope: 'overall' })}
                  activeOpacity={0.8}
                >
                  <Text style={styles.createFirstBtnText}>Set Monthly Budget</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* CATEGORY SUB-BUDGETS LIST (Compact, Space-Optimized) */}
            <View style={styles.subBudgetsHeaderRow}>
              <Text style={[styles.sectionHeading, { color: colors.text }]}>
                Categories ({monthlyCategoryBudgets.length})
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('CreateBudget', { initialType: 'monthly', initialScope: 'category' })}
                activeOpacity={0.7}
              >
                <Text style={[styles.addCategoryLink, { color: colors.accent }]}>+ Add</Text>
              </TouchableOpacity>
            </View>

            {monthlyCategoryBudgets.length > 0 ? (
              monthlyCategoryBudgets.map((budget: BudgetCategory) => {
                const spendData = calculateBudgetNetSpend(budget, transactions);
                const customDef = customCategories.find((c) => c.id === budget.category);
                const meta = getCategoryMeta(budget.category, false, customDef || budget.customCategoryDef);
                const limit = budget.limitAmount || 0;
                const spent = spendData.netSpend;
                const remaining = Math.max(0, limit - spent);
                const pct = Math.min(100, limit > 0 ? Math.round((spent / limit) * 100) : 0);

                const isExpanded = !!expandedCategoryIds[budget.id];

                return (
                  <View
                    key={budget.id}
                    style={[styles.categoryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <TouchableOpacity
                      onPress={() => toggleCategoryExpanded(budget.id)}
                      activeOpacity={0.7}
                      style={styles.categoryCardTop}
                    >
                      {/* Compact 30x30 Icon */}
                      <View style={[styles.catIconBox, { backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(22, 163, 74, 0.08)' }]}>
                        <Ionicons name={meta.icon as any} size={15} color={colors.accent} />
                      </View>

                      {/* Title & Spent / Ceiling */}
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Text style={[styles.categoryCardTitle, { color: colors.text }]} numberOfLines={1}>
                            {budget.name || meta.label}
                          </Text>
                          {budget.isPaused && (
                            <View style={[styles.catPausedPill, { backgroundColor: isDark ? 'rgba(227, 179, 65, 0.15)' : 'rgba(227, 179, 65, 0.1)' }]}>
                              <Text style={[styles.catPausedPillText, { color: colors.warning }]}>PAUSED</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.categoryCardSub, { color: colors.textSecondary }]}>
                          ₹{spent.toLocaleString('en-IN')} / ₹{limit.toLocaleString('en-IN')}
                        </Text>
                      </View>

                      {/* Remaining Amount */}
                      <View style={{ alignItems: 'flex-end', marginRight: 6 }}>
                        <Text style={[styles.catRemainingAmount, { color: remaining === 0 ? colors.danger : colors.text }]}>
                          ₹{remaining.toLocaleString('en-IN')}
                        </Text>
                        <Text style={[styles.catRemainingLabel, { color: colors.textSecondary }]}>
                          {budget.isPaused ? 'paused' : 'left'}
                        </Text>
                      </View>

                      {/* 3-Dot Options Menu Button */}
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setMenuBudget(budget);
                        }}
                        style={[
                          styles.threeDotCategoryBtn,
                          {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                            borderColor: colors.border,
                          },
                        ]}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="ellipsis-vertical" size={14} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </TouchableOpacity>

                    {/* Integrated Slim Progress Bar */}
                    <View style={styles.catProgressBarContainer}>
                      <View
                        style={[
                          styles.catProgressFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: pct >= 100 ? colors.danger : colors.accent,
                          },
                        ]}
                      />
                    </View>

                    {/* Expandable Category Transactions List */}
                    {isExpanded && (
                      <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                          Category Transactions ({spendData.matchingTransactions.length})
                        </Text>
                        {spendData.matchingTransactions.length === 0 ? (
                          <Text style={{ fontSize: 11, color: colors.textSecondary, paddingVertical: 4 }}>
                            No transactions recorded in this category yet.
                          </Text>
                        ) : (
                          spendData.matchingTransactions.map((tx: any) => (
                            <View
                              key={tx.id}
                              style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingVertical: 4,
                                borderTopWidth: 1,
                                borderTopColor: colors.border,
                                marginTop: 2,
                              }}
                            >
                              <View style={{ flex: 1, paddingRight: 8 }}>
                                <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                                  {tx.merchant || 'Expense'}
                                </Text>
                                <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                                  {new Date(Number(tx.timestamp || tx.date)).toLocaleDateString('en-IN')}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.text }}>
                                  -₹{Math.abs(parseFloat(tx.amount || 0)).toLocaleString('en-IN')}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => handleExcludeTransaction(tx)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  style={{
                                    padding: 3,
                                    borderRadius: 4,
                                    backgroundColor: isDark ? 'rgba(255, 82, 82, 0.12)' : 'rgba(220, 38, 38, 0.08)',
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons name="close" size={13} color={colors.danger} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={[styles.emptyCategoryNotice, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff' }]}>
                <Ionicons name="pie-chart-outline" size={20} color={colors.textSecondary} style={{ marginBottom: 4 }} />
                <Text style={[styles.emptyCategoryText, { color: colors.textSecondary }]}>
                  No category sub-budgets yet. Expenses will draw directly from your free buffer.
                </Text>
              </View>
            )}

            {/* OTHERS / UNBUDGETED SPENDS (Drawn from Free Buffer) */}
            {hierarchy.unallocatedSpent > 0 && (
              <View
                style={[
                  styles.categoryCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    marginTop: 4,
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => setOthersExpanded(!othersExpanded)}
                  activeOpacity={0.7}
                  style={styles.categoryCardTop}
                >
                  {/* Icon */}
                  <View style={[styles.catIconBox, { backgroundColor: isDark ? 'rgba(255, 82, 82, 0.12)' : 'rgba(220, 38, 38, 0.08)' }]}>
                    <Ionicons name="pricetags-outline" size={15} color={colors.danger} />
                  </View>

                  {/* Title & Spent / Buffer Ratio */}
                  <View style={{ flex: 1, paddingRight: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.categoryCardTitle, { color: colors.text }]} numberOfLines={1}>
                        Others (Unbudgeted)
                      </Text>
                      <View style={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textSecondary }}>
                          {hierarchy.unallocatedBreakdown.length} {hierarchy.unallocatedBreakdown.length === 1 ? 'category' : 'categories'}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.categoryCardSub, { color: colors.textSecondary }]}>
                      ₹{hierarchy.unallocatedSpent.toLocaleString('en-IN')} of ₹{hierarchy.unallocatedBuffer.toLocaleString('en-IN')} buffer
                    </Text>
                  </View>

                  {/* Right side: spent amount & chevron */}
                  <View style={{ alignItems: 'flex-end', marginRight: 4 }}>
                    <Text style={[styles.catRemainingAmount, { color: colors.danger }]}>
                      -₹{hierarchy.unallocatedSpent.toLocaleString('en-IN')}
                    </Text>
                    <Text style={[styles.catRemainingLabel, { color: colors.textSecondary }]}>
                      from buffer
                    </Text>
                  </View>

                  <View style={[styles.threeDotCategoryBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)', borderColor: colors.border }]}>
                    <Ionicons name={othersExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>

                {/* Progress bar of buffer consumed by unallocated spends */}
                <View style={styles.catProgressBarContainer}>
                  <View
                    style={[
                      styles.catProgressFill,
                      {
                        width: `${Math.min(100, hierarchy.unallocatedBuffer > 0 ? (hierarchy.unallocatedSpent / hierarchy.unallocatedBuffer) * 100 : 100)}%`,
                        backgroundColor: colors.danger,
                      },
                    ]}
                  />
                </View>

                {/* Expanded Detailed Breakdown */}
                {othersExpanded && (
                  <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.textSecondary, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      Unbudgeted Spends Breakdown
                    </Text>

                    {hierarchy.unallocatedBreakdown.map((group) => (
                      <View
                        key={group.category}
                        style={{
                          marginBottom: 8,
                          backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                          borderRadius: 8,
                          padding: 8,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name={group.icon as any || 'pricetag-outline'} size={14} color={colors.accent} />
                            <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.text }}>
                              {group.label}
                            </Text>
                            <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                              ({group.count} {group.count === 1 ? 'spend' : 'spends'})
                            </Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.text }}>
                              ₹{group.totalSpent.toLocaleString('en-IN')}
                            </Text>
                            <TouchableOpacity
                              onPress={() => navigation.navigate('CreateBudget', { initialType: 'monthly', initialScope: 'category', initialCategory: group.category })}
                              style={{ backgroundColor: `${colors.accent}20`, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: `${colors.accent}40` }}
                              activeOpacity={0.7}
                            >
                              <Text style={{ fontSize: 10, fontWeight: '700', color: colors.accent }}>+ Add Budget</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* List individual transactions under this category */}
                        {group.transactions.map((tx: any) => (
                          <View
                            key={tx.id}
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              paddingVertical: 3,
                              borderTopWidth: 1,
                              borderTopColor: colors.border,
                              marginTop: 2,
                            }}
                          >
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.text }} numberOfLines={1}>
                                {tx.merchant || 'Expense'}
                              </Text>
                              <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                                {new Date(Number(tx.timestamp || tx.date)).toLocaleDateString('en-IN')}
                              </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.text }}>
                                -₹{Math.abs(parseFloat(tx.amount || 0)).toLocaleString('en-IN')}
                              </Text>
                              <TouchableOpacity
                                onPress={() => handleExcludeTransaction(tx)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={{
                                  padding: 3,
                                  borderRadius: 4,
                                  backgroundColor: isDark ? 'rgba(255, 82, 82, 0.12)' : 'rgba(220, 38, 38, 0.08)',
                                }}
                                activeOpacity={0.7}
                              >
                                <Ionicons name="close" size={13} color={colors.danger} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* EXCLUDED FROM BUDGET BANNER */}
            {excludedTransactionIds.length > 0 && (
              <TouchableOpacity
                onPress={() => setExcludedModalVisible(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 9,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                  marginTop: 8,
                  marginBottom: 6,
                }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <Ionicons name="eye-off-outline" size={14} color={colors.textSecondary} />
                  <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontWeight: '600' }}>
                    {excludedTransactionIds.length} {excludedTransactionIds.length === 1 ? 'transaction' : 'transactions'} removed from budget
                  </Text>
                </View>
                <Text style={{ fontSize: 11.5, color: colors.accent, fontWeight: '700' }}>
                  View / Restore
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : activeTab === 'events' ? (
          /* SPECIAL / EVENT BUDGETS VIEW (Compact) */
          <>
            <View style={styles.subBudgetsHeaderRow}>
              <Text style={[styles.sectionHeading, { color: colors.text }]}>
                Special Events ({specialEventBudgets.length})
              </Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('CreateBudget', { initialType: 'custom_event' })}
                activeOpacity={0.7}
              >
                <Text style={[styles.addCategoryLink, { color: colors.accent }]}>+ New Event</Text>
              </TouchableOpacity>
            </View>

            {specialEventBudgets.length > 0 ? (
              specialEventBudgets.map((budget: BudgetCategory) => {
                const spendData = calculateBudgetNetSpend(budget, transactions);
                const limit = budget.limitAmount || 0;
                const spent = spendData.netSpend;
                const remaining = Math.max(0, limit - spent);
                const isUpcoming = spendData.isUpcoming;
                const isEarlyTracking = budget.isManuallyActivated;
                const pct = Math.min(100, limit > 0 ? Math.round((spent / limit) * 100) : 0);

                return (
                  <View
                    key={budget.id}
                    style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <View style={styles.eventCardHeader}>
                      <View style={[styles.catIconBox, { backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(22, 163, 74, 0.08)' }]}>
                        <Ionicons name="airplane-outline" size={16} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1, paddingRight: 6 }}>
                        <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={1}>{budget.name || 'Special Budget'}</Text>
                        <Text style={[styles.eventDates, { color: colors.textSecondary }]}>
                          {budget.period || 'Custom Dates'}
                        </Text>
                      </View>

                      {/* Status indicator */}
                      <View style={{ alignItems: 'flex-end', marginRight: 6 }}>
                        <Text style={[styles.catRemainingAmount, { color: remaining === 0 ? colors.danger : colors.text }]}>
                          ₹{remaining.toLocaleString('en-IN')}
                        </Text>
                        <Text style={[styles.catRemainingLabel, { color: colors.textSecondary }]}>left</Text>
                      </View>

                      <TouchableOpacity
                        onPress={() => setMenuBudget(budget)}
                        style={[
                          styles.threeDotCategoryBtn,
                          {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                            borderColor: colors.border,
                          },
                        ]}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="ellipsis-vertical" size={14} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>

                    {/* Compact Status + Progress Row */}
                    <View style={styles.eventCompactMetricsRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons
                          name={isUpcoming ? 'hourglass-outline' : isEarlyTracking ? 'flash' : 'checkmark-circle'}
                          size={11}
                          color={isUpcoming ? colors.warning : colors.accent}
                        />
                        <Text style={[styles.eventStatusBadgeText, { color: isUpcoming ? colors.warning : colors.accent }]}>
                          {isUpcoming ? `${spendData.daysUntilStart}d to start` : isEarlyTracking ? 'Tracking Early' : 'Active'}
                        </Text>
                      </View>
                      <Text style={[styles.eventSpendRatioText, { color: colors.textSecondary }]}>
                        ₹{spent.toLocaleString('en-IN')} of ₹{limit.toLocaleString('en-IN')}
                      </Text>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.catProgressBarContainer}>
                      <View
                        style={[
                          styles.catProgressFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: pct >= 100 ? colors.danger : colors.accent,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="airplane-outline" size={40} color={colors.accent} style={{ marginBottom: 12 }} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No Special Events</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  Planning a vacation, wedding, or festival? Create a dedicated event budget with custom dates.
                </Text>
                <TouchableOpacity
                  style={[styles.createFirstBtn, { backgroundColor: colors.accent }]}
                  onPress={() => navigation.navigate('CreateBudget', { initialType: 'custom_event' })}
                  activeOpacity={0.8}
                >
                  <Text style={styles.createFirstBtnText}>Create Event Budget</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          /* ==================== 3. HISTORY VIEW ==================== */
          <>
            <View style={styles.subBudgetsHeaderRow}>
              <View>
                <Text style={[styles.sectionHeading, { color: colors.text }]}>
                  Budget History ({historyBudgets.length})
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                  Completed cycles & in-progress budgets you can review or clone
                </Text>
              </View>
            </View>

            {/* Filter Chips: All | Monthly | Events */}
            <View style={styles.historyFilterRow}>
              {[
                { id: 'all', label: `All (${allOverallAndEventBudgets.length})` },
                { id: 'monthly', label: 'Monthly' },
                { id: 'events', label: 'Events' },
              ].map((f) => {
                const isSelected = historyFilter === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[
                      styles.historyFilterChip,
                      {
                        backgroundColor: isSelected
                          ? colors.accent
                          : isDark
                          ? 'rgba(255,255,255,0.05)'
                          : '#f1f5f9',
                        borderColor: isSelected ? colors.accent : colors.border,
                      },
                    ]}
                    onPress={() => setHistoryFilter(f.id as any)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.historyFilterChipText,
                        { color: isSelected ? '#ffffff' : colors.textSecondary },
                      ]}
                    >
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {historyBudgets.length > 0 ? (
              historyBudgets.map((budget: BudgetCategory) => {
                const statusMeta = getBudgetStatus(budget);
                const stats = getHistoryBudgetStats(budget);
                const isOverall = !!budget.isOverall;
                const subBudgets = isOverall
                  ? budgets.filter(
                      (b) =>
                        !b.isOverall &&
                        (b.parentBudgetId === budget.id || (!b.parentBudgetId && b.period === budget.period))
                    )
                  : [];

                return (
                  <View
                    key={budget.id}
                    style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    {/* Top Row: Status badge, Type badge, Period & 3-dot */}
                    <View style={styles.historyCardTopRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.historyStatusBadge, { backgroundColor: statusMeta.badgeBg }]}>
                          <Ionicons name={statusMeta.icon as any} size={11} color={statusMeta.color} />
                          <Text style={[styles.historyStatusBadgeText, { color: statusMeta.color }]}>
                            {statusMeta.label}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.historyTypeBadge,
                            {
                              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#e2e8f0',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.historyTypeBadgeText,
                              { color: colors.textSecondary },
                            ]}
                          >
                            {isOverall ? 'Monthly' : 'Event'}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.historyPeriodText, { color: colors.textSecondary }]}>
                          {budget.period || 'Custom Period'}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setMenuBudget(budget)}
                          style={[
                            styles.threeDotCategoryBtn,
                            {
                              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                              borderColor: colors.border,
                            },
                          ]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="ellipsis-vertical" size={13} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Title */}
                    <View style={{ marginTop: 8, marginBottom: 6 }}>
                      <Text style={[styles.historyCardTitle, { color: colors.text }]} numberOfLines={1}>
                        {budget.name || (isOverall ? 'Monthly Budget' : 'Special Event')}
                      </Text>
                    </View>

                    {/* Key Metrics Grid */}
                    <View
                      style={[
                        styles.historyMetricsGrid,
                        {
                          backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#f8fafc',
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View style={styles.historyMetricItem}>
                        <Text style={[styles.historyMetricLabel, { color: colors.textSecondary }]}>SPENT</Text>
                        <Text style={[styles.historyMetricValue, { color: colors.text }]}>
                          ₹{stats.spent.toLocaleString('en-IN')}
                        </Text>
                      </View>
                      <View style={[styles.historyMetricDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.historyMetricItem}>
                        <Text style={[styles.historyMetricLabel, { color: colors.textSecondary }]}>CEILING</Text>
                        <Text style={[styles.historyMetricValue, { color: colors.text }]}>
                          ₹{stats.limit.toLocaleString('en-IN')}
                        </Text>
                      </View>
                      <View style={[styles.historyMetricDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.historyMetricItem}>
                        <Text style={[styles.historyMetricLabel, { color: colors.textSecondary }]}>
                          {stats.overspent > 0 ? 'OVERSPENT' : 'SAVED BUFFER'}
                        </Text>
                        <Text
                          style={[
                            styles.historyMetricValue,
                            { color: stats.overspent > 0 ? colors.danger : colors.accent },
                          ]}
                        >
                          {stats.overspent > 0
                            ? `+₹${stats.overspent.toLocaleString('en-IN')}`
                            : `₹${stats.remaining.toLocaleString('en-IN')}`}
                        </Text>
                      </View>
                    </View>

                    {/* Slim Progress Bar */}
                    <View style={styles.historyProgressWrap}>
                      <View
                        style={[
                          styles.historyProgressFill,
                          {
                            width: `${stats.pct}%`,
                            backgroundColor: stats.spent > stats.limit ? colors.danger : colors.accent,
                          },
                        ]}
                      />
                    </View>

                    {/* Subcategories tags if available */}
                    {subBudgets.length > 0 && (
                      <View style={styles.historySubBudgetsRow}>
                        <Text style={[styles.historySubBudgetsLabel, { color: colors.textSecondary }]}>
                          Categories ({subBudgets.length}):
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 }}>
                          {subBudgets.slice(0, 4).map((sb) => {
                            const customDef = customCategories.find((c) => c.id === sb.category);
                            const meta = getCategoryMeta(sb.category, false, customDef);
                            return (
                              <View
                                key={sb.id}
                                style={[
                                  styles.historySubCatChip,
                                  {
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
                                    borderColor: colors.border,
                                  },
                                ]}
                              >
                                <Ionicons name={meta.icon as any} size={10} color={meta.color || colors.accent} />
                                <Text style={[styles.historySubCatChipText, { color: colors.text }]}>
                                  {meta.label} ₹{Number(sb.limitAmount || 0).toLocaleString('en-IN')}
                                </Text>
                              </View>
                            );
                          })}
                          {subBudgets.length > 4 && (
                            <View
                              style={[
                                styles.historySubCatChip,
                                {
                                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
                                  borderColor: colors.border,
                                },
                              ]}
                            >
                              <Text style={[styles.historySubCatChipText, { color: colors.textSecondary }]}>
                                +{subBudgets.length - 4} more
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    )}

                    {/* Bottom Action Buttons: Reuse as Template & Toggle Done */}
                    <View style={styles.historyActionRow}>
                      <TouchableOpacity
                        style={[styles.historyCloneBtn, { backgroundColor: colors.accent }]}
                        onPress={() => {
                          navigation.navigate('CreateBudget', {
                            cloneFromBudgetId: budget.id,
                            initialType: isOverall ? 'monthly' : 'custom_event',
                          });
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="flash" size={13} color="#ffffff" style={{ marginRight: 5 }} />
                        <Text style={styles.historyCloneBtnText}>
                          {isOverall ? 'Use for Next Month' : 'Reuse as Template'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.historyDoneToggleBtn,
                          {
                            borderColor: budget.isDone ? colors.accent : colors.border,
                            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
                          },
                        ]}
                        onPress={() => handleToggleDone(budget)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={budget.isDone ? 'play-outline' : 'checkmark-done'}
                          size={13}
                          color={budget.isDone ? colors.accent : colors.textSecondary}
                          style={{ marginRight: 4 }}
                        />
                        <Text
                          style={[
                            styles.historyDoneToggleBtnText,
                            { color: budget.isDone ? colors.accent : colors.textSecondary },
                          ]}
                        >
                          {budget.isDone ? 'Reopen' : 'Mark Done'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="time-outline" size={40} color={colors.accent} style={{ marginBottom: 12 }} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No History Found</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                  Budgets marked as done or previous cycles will appear here. You can clone them anytime to quickly set up your next month or recurring trip!
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* CAN I AFFORD THIS MODAL */}
      <Modal visible={affordModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="flash" size={18} color={colors.accent} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Can I Afford This?</Text>
              </View>
              <TouchableOpacity onPress={() => setAffordModalVisible(false)}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              Enter a purchase amount to test its impact against your free buffer (₹{hierarchy.unallocatedRemaining.toLocaleString('en-IN')} available).
            </Text>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>PURCHASE AMOUNT (₹)</Text>
            <View style={[styles.modalInputBox, { borderColor: colors.border, backgroundColor: isDark ? colors.inputBackground : colors.buttonSecondaryBackground }]}>
              <Text style={[styles.currencyPrefix, { color: colors.accent }]}>₹</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.text }]}
                value={affordAmountStr}
                onChangeText={setAffordAmountStr}
                keyboardType="numeric"
                placeholder="2,500"
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {affordImpact && (
              <View
                style={[
                  styles.affordResultBox,
                  {
                    backgroundColor: affordImpact.canAfford
                      ? isDark
                        ? 'rgba(45, 186, 78, 0.12)'
                        : 'rgba(22, 163, 74, 0.08)'
                      : isDark
                      ? 'rgba(255, 82, 82, 0.12)'
                      : 'rgba(220, 38, 38, 0.08)',
                    borderColor: affordImpact.canAfford ? colors.accent : colors.danger,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Ionicons
                    name={affordImpact.canAfford ? 'checkmark-circle' : 'alert-circle'}
                    size={18}
                    color={affordImpact.canAfford ? colors.accent : colors.danger}
                  />
                  <Text
                    style={[
                      styles.affordResultTitle,
                      { color: affordImpact.canAfford ? colors.accent : colors.danger },
                    ]}
                  >
                    {affordImpact.canAfford ? 'Yes, Safe to Spend!' : 'Exceeds Free Cash Buffer'}
                  </Text>
                </View>
                <Text style={[styles.affordResultDesc, { color: colors.text }]}>
                  {affordImpact.canAfford
                    ? `You will still have ₹${affordImpact.newRemaining.toLocaleString('en-IN')} left in your free buffer for this month.`
                    : `This purchase is ₹${(affordImpact.purchaseAmt - affordImpact.remainingFree).toLocaleString('en-IN')} more than your remaining free buffer.`}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.modalSubmitBtn, { backgroundColor: colors.accent, marginTop: 14 }]}
              onPress={() => setAffordModalVisible(false)}
            >
              <Text style={styles.modalSubmitBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 3. THREE-DOT BUDGET OPTIONS & TRACKING TOGGLE MODAL */}
      <Modal
        visible={!!menuBudget}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuBudget(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdropDismiss}
            activeOpacity={1}
            onPress={() => setMenuBudget(null)}
          />
          {menuBudget && (
            <View style={[styles.threeDotModalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Modal Drag Handle */}
              <View style={styles.modalDragHandleWrap}>
                <View style={[styles.modalDragHandle, { backgroundColor: colors.border }]} />
              </View>

              {/* Modal Header */}
              <View style={styles.threeDotModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View
                    style={[
                      styles.threeDotIconBadge,
                      {
                        backgroundColor: menuBudget.isOverall
                          ? 'rgba(45, 186, 78, 0.15)'
                          : `${getCategoryMeta(menuBudget.category, false, customCategories.find((c) => c.id === menuBudget.category) || menuBudget.customCategoryDef).color || colors.accent}20`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        (menuBudget.isOverall
                          ? 'wallet-outline'
                          : getCategoryMeta(menuBudget.category, false, customCategories.find((c) => c.id === menuBudget.category) || menuBudget.customCategoryDef).icon) as any
                      }
                      size={22}
                      color={
                        menuBudget.isOverall
                          ? colors.accent
                          : getCategoryMeta(menuBudget.category, false, customCategories.find((c) => c.id === menuBudget.category) || menuBudget.customCategoryDef).color || colors.accent
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.threeDotModalTitle, { color: colors.text }]} numberOfLines={1}>
                      {menuBudget.name || (menuBudget.isOverall ? 'Monthly Budget' : getCategoryMeta(menuBudget.category).label)}
                    </Text>
                    <Text style={[styles.threeDotModalSubtitle, { color: colors.textSecondary }]}>
                      Ceiling: ₹{Number(menuBudget.limitAmount || 0).toLocaleString('en-IN')}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setMenuBudget(null)}
                  style={styles.modalCloseBtn}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* 1. TRACKING TOGGLE ROW (Directly answers user request to toggle tracking ON / OFF in 3-dot) */}
              <View
                style={[
                  styles.trackingToggleCard,
                  {
                    backgroundColor: isDark ? colors.inputBackground : colors.buttonSecondaryBackground,
                    borderColor: menuBudget.isPaused ? 'rgba(227, 179, 65, 0.35)' : 'rgba(45, 186, 78, 0.35)',
                  },
                ]}
              >
                <View style={{ flex: 1, paddingRight: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Ionicons
                      name={menuBudget.isPaused ? 'pause-circle' : 'radio-button-on'}
                      size={17}
                      color={menuBudget.isPaused ? colors.warning : colors.accent}
                    />
                    <Text
                      style={[
                        styles.trackingCardTitle,
                        { color: menuBudget.isPaused ? colors.warning : colors.accent },
                      ]}
                    >
                      {menuBudget.isPaused ? 'Tracking Paused (OFF)' : 'Active Tracking (ON)'}
                    </Text>
                  </View>
                  <Text style={[styles.trackingCardDesc, { color: colors.textSecondary }]}>
                    {menuBudget.isPaused
                      ? 'Expense tracking is paused. Transactions will not be deducted from this budget ceiling.'
                      : 'Expenses in this category are automatically monitored and counted against your budget ceiling.'}
                  </Text>
                </View>

                {/* Native Toggle Switch */}
                <Switch
                  value={!menuBudget.isPaused}
                  onValueChange={() => handleTogglePause(menuBudget)}
                  trackColor={{ false: '#4b5563', true: colors.accent }}
                  thumbColor={!menuBudget.isPaused ? '#ffffff' : '#9ca3af'}
                />
              </View>

              {/* 2. EDIT BUDGET LIMIT OPTION */}
              <View style={[styles.actionSectionBox, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff' }]}>
                {isEditingLimit ? (
                  <View>
                    <Text style={[styles.actionSectionLabel, { color: colors.textSecondary }]}>
                      UPDATE BUDGET LIMIT (₹)
                    </Text>
                    <View style={styles.editLimitInputRow}>
                      <View
                        style={[
                          styles.editLimitInputWrap,
                          {
                            backgroundColor: isDark ? colors.inputBackground : colors.buttonSecondaryBackground,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        <Text style={[styles.currencyPrefix, { color: colors.accent }]}>₹</Text>
                        <TextInput
                          style={[styles.editLimitTextInput, { color: colors.text }]}
                          value={editLimitStr}
                          onChangeText={setEditLimitStr}
                          keyboardType="numeric"
                          inputMode="numeric"
                          placeholder="e.g. 5000"
                          placeholderTextColor={colors.textSecondary}
                          autoFocus
                        />
                      </View>
                      <TouchableOpacity
                        style={[styles.saveLimitBtn, { backgroundColor: colors.accent }]}
                        onPress={handleSaveEditedLimit}
                        disabled={savingEdit}
                        activeOpacity={0.8}
                      >
                        {savingEdit ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Text style={styles.saveLimitBtnText}>Save</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.cancelLimitBtn, { borderColor: colors.border }]}
                        onPress={() => setIsEditingLimit(false)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.cancelLimitBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.actionRowBtn}
                    onPress={() => setIsEditingLimit(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.actionRowLeft}>
                      <Ionicons name="create-outline" size={19} color={colors.text} style={{ marginRight: 10 }} />
                      <Text style={[styles.actionRowTitle, { color: colors.text }]}>Edit Budget Amount</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.actionRowValue, { color: colors.accent }]}>
                        ₹{Number(menuBudget.limitAmount || 0).toLocaleString('en-IN')}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              {/* 3. MARK AS DONE / REOPEN OPTION */}
              <View style={[styles.actionSectionBox, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff', marginTop: 10 }]}>
                <TouchableOpacity
                  style={styles.actionRowBtn}
                  onPress={() => {
                    const b = menuBudget;
                    handleToggleDone(b);
                    setMenuBudget({ ...b, isDone: !b.isDone });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.actionRowLeft}>
                    <Ionicons
                      name={menuBudget.isDone ? 'play-circle-outline' : 'checkmark-done-circle-outline'}
                      size={19}
                      color={colors.accent}
                      style={{ marginRight: 10 }}
                    />
                    <Text style={[styles.actionRowTitle, { color: colors.text }]}>
                      {menuBudget.isDone ? 'Reopen as In Progress' : 'Mark as Completed (Done)'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* 4. DUPLICATE AS TEMPLATE OPTION */}
              <View style={[styles.actionSectionBox, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff', marginTop: 10 }]}>
                <TouchableOpacity
                  style={styles.actionRowBtn}
                  onPress={() => {
                    const b = menuBudget;
                    setMenuBudget(null);
                    navigation.navigate('CreateBudget', {
                      cloneFromBudgetId: b.id,
                      initialType: b.isOverall ? 'monthly' : 'custom_event',
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.actionRowLeft}>
                    <Ionicons name="copy-outline" size={19} color={colors.accent} style={{ marginRight: 10 }} />
                    <Text style={[styles.actionRowTitle, { color: colors.text }]}>
                      Duplicate as Template
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* 5. DELETE BUDGET OPTION */}
              <TouchableOpacity
                style={[
                  styles.deleteActionBtn,
                  {
                    borderColor: 'rgba(255, 82, 82, 0.25)',
                    backgroundColor: isDark ? 'rgba(255, 82, 82, 0.08)' : 'rgba(220, 38, 38, 0.04)',
                    marginTop: 10,
                  },
                ]}
                onPress={() => {
                  const b = menuBudget;
                  setMenuBudget(null);
                  handleDeleteBudget(b);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} style={{ marginRight: 8 }} />
                <Text style={styles.deleteActionText}>Delete this Budget</Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* EXCLUDED TRANSACTIONS MODAL */}
      <Modal visible={excludedModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="eye-off-outline" size={20} color={colors.accent} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Removed Transactions</Text>
              </View>
              <TouchableOpacity onPress={() => setExcludedModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
              These transactions are excluded from your budget spending calculations. They remain untouched on your Home page and Bank statements.
            </Text>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {excludedTransactionsList.length === 0 ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>No transactions currently removed from budget.</Text>
                </View>
              ) : (
                excludedTransactionsList.map((tx: any) => (
                  <View
                    key={tx.id}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }} numberOfLines={1}>
                        {tx.merchant || 'Expense'}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                        {new Date(Number(tx.timestamp || tx.date)).toLocaleDateString('en-IN')} • {tx.category || 'Other'}
                      </Text>
                    </View>

                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>
                        ₹{Math.abs(parseFloat(tx.amount || 0)).toLocaleString('en-IN')}
                      </Text>
                      <TouchableOpacity
                        onPress={() => restoreTransactionToBudget(tx.id)}
                        style={{
                          backgroundColor: `${colors.accent}20`,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: `${colors.accent}40`,
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 10.5, fontWeight: '700', color: colors.accent }}>+ Restore</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {excludedTransactionsList.length > 1 && (
              <TouchableOpacity
                onPress={() => {
                  clearAllExcludedTransactions();
                  setExcludedModalVisible(false);
                }}
                style={{
                  marginTop: 14,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>Restore All to Budget</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <StandaloneBottomTabBar activeTab="Budgets" />
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
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 3,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '700',
  },
  tabSelectorRow: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    marginBottom: 10,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  tabButtonActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroCycleLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  heroBalanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroTotalAmount: {
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  heroSubBalanceText: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
  affordMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  affordMiniBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  daysBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 0.5,
  },
  daysBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  activeStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 0.5,
    gap: 3,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  activeStatusText: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  progressBarContainer: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  heroMicroGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 9,
    borderWidth: 1,
  },
  microStatCol: {
    flex: 1,
    alignItems: 'center',
  },
  microStatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 2,
  },
  microStatLabel: {
    fontSize: 9,
    fontWeight: '600',
  },
  microStatVal: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  microStatDivider: {
    width: 1,
    height: 16,
    opacity: 0.4,
  },
  subBudgetsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  addCategoryLink: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  categoryCard: {
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    marginBottom: 7,
  },
  categoryCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  catIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  categoryCardTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  categoryCardSub: {
    fontSize: 10,
    marginTop: 1,
  },
  catRemainingAmount: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  catRemainingLabel: {
    fontSize: 9,
  },
  catProgressBarContainer: {
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginTop: 6,
  },
  catProgressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  emptyCategoryNotice: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyCategoryText: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 12,
    maxWidth: 280,
  },
  createFirstBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 18,
  },
  createFirstBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '700',
  },
  eventCard: {
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    marginBottom: 7,
  },
  eventCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventTitle: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  eventDates: {
    fontSize: 10,
    marginTop: 1,
  },
  eventCompactMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  eventStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  eventSpendRatioText: {
    fontSize: 10,
    fontWeight: '600',
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
    maxWidth: 400,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 6,
  },
  modalInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
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
  affordResultBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 6,
  },
  affordResultTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  affordResultDesc: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  modalSubmitBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  threeDotHeroBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threeDotCategoryBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catPausedPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  catPausedPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalBackdropDismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  threeDotModalContent: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  modalDragHandleWrap: {
    alignItems: 'center',
    marginBottom: 14,
  },
  modalDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  threeDotModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  threeDotIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threeDotModalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  threeDotModalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 12,
  },
  trackingToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 14,
  },
  trackingCardTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  trackingCardDesc: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  actionSectionBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  actionSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  editLimitInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editLimitInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  editLimitTextInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    padding: 0,
  },
  saveLimitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLimitBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  cancelLimitBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLimitBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  actionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionRowTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  actionRowValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  deleteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  deleteActionText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '800',
  },
  historyFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  historyFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  historyFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  historyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  historyCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    gap: 3,
  },
  historyStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  historyTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  historyTypeBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  historyPeriodText: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  historyCardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  historyMetricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 0.5,
    marginVertical: 6,
  },
  historyMetricItem: {
    flex: 1,
    alignItems: 'center',
  },
  historyMetricLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  historyMetricValue: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  historyMetricDivider: {
    width: 0.5,
    height: 22,
  },
  historyProgressWrap: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  historyProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  historySubBudgetsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 8,
    paddingTop: 4,
  },
  historySubBudgetsLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 2,
  },
  historySubCatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 0.5,
  },
  historySubCatChipText: {
    fontSize: 10,
    fontWeight: '600',
  },
  historyActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  historyCloneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  historyCloneBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#ffffff',
  },
  historyDoneToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  historyDoneToggleBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  monthCycleContainer: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    gap: 4,
  },
  monthCyclePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 4,
  },
  monthCyclePillActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  monthCyclePillText: {
    fontSize: 12,
  },
  monthCycleMiniBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  monthCycleMiniBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  upcomingNoticeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  upcomingNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  upcomingNoticeDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
});
