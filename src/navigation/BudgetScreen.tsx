// src/navigation/BudgetScreen.tsx
//
// Budgets: monthly plan, event budgets and history.
// Logic and data are unchanged from the previous version; the UI is new.

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  Modal,
  Platform,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import * as Font from 'expo-font';
import { format } from 'date-fns';
import { useTheme, useBudgetStore, useTransactionStore, BudgetCategory, showGlobalConfirm } from '../store';
import { useSyncDb } from '../services/useSyncDb';
import {
  calculateBudgetNetSpend,
  calculateBudgetHierarchy,
  getCategoryMeta,
  budgetService,
  getBudgetStatus,
  isExcludedFromBudget,
} from '../services/budgetService';
import { StandaloneBottomTabBar } from './StandaloneBottomTabBar';
import { getBackendUrl } from '../config/api';
import { authService } from '../services/authService';
import { CategoryIcon } from '../components/CategoryIcon';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

const inr = (n: number) => `₹${Math.abs(Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const ts = (v: any) => (typeof v === 'number' ? v : new Date(v || 0).getTime());

type Tab = 'monthly' | 'events' | 'history';

export interface BudgetScreenProps {
  AppTopBarComponent?: React.ComponentType;
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

const Bar: React.FC<{ pct: number; color: string; track: string; height?: number }> = ({ pct, color, track, height = 6 }) => {
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(Math.max(0, Math.min(100, pct)), { duration: 650, easing: Easing.out(Easing.cubic) });
  }, [pct]);
  const style = useAnimatedStyle(() => ({ width: `${w.value}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, style]} />
    </View>
  );
};

const Sheet: React.FC<{ visible: boolean; onClose: () => void; bg: string; dark: boolean; children: React.ReactNode }> = ({
  visible,
  onClose,
  bg,
  dark,
  children,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
          <View style={[s.sheet, { backgroundColor: bg, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <View style={[s.grabber, { backgroundColor: dark ? 'rgba(255,255,255,0.18)' : '#D5DED9' }]} />
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export const BudgetScreen: React.FC<BudgetScreenProps> = ({ AppTopBarComponent }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark } = useTheme();
  const { sync } = useSyncDb();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const heading = { fontFamily: display, fontWeight: display ? undefined : ('800' as const) };

  const budgets = useBudgetStore((st) => st.budgets);
  const customCategories = useBudgetStore((st) => st.customCategories || []);
  const transactions = useTransactionStore((st) => st.transactions);
  const excludeTransactionFromBudget = useBudgetStore((st) => st.excludeTransactionFromBudget);
  const restoreTransactionToBudget = useBudgetStore((st) => st.restoreTransactionToBudget);
  const clearAllExcludedTransactions = useBudgetStore((st) => st.clearAllExcludedTransactions);
  const excludedTransactionIds = useBudgetStore((st) => st.excludedTransactionIds || []);
  const markBudgetDone = useBudgetStore((st) => st.markBudgetDone);

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('monthly');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'monthly' | 'events'>('all');
  const [selectedMonthlyBudgetId, setSelectedMonthlyBudgetId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [affordOpen, setAffordOpen] = useState(false);
  const [affordAmountStr, setAffordAmountStr] = useState('');
  const [menuBudget, setMenuBudget] = useState<BudgetCategory | null>(null);
  const [editLimitStr, setEditLimitStr] = useState('');
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [menuError, setMenuError] = useState('');
  const [excludedOpen, setExcludedOpen] = useState(false);

  const toggle = (id: string) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  /* ---------------- Data (unchanged logic) ---------------- */

  const excludedTransactionsList = useMemo(
    () => transactions.filter((t) => excludedTransactionIds.includes(t.id)),
    [transactions, excludedTransactionIds]
  );

  const allOverallAndEventBudgets = useMemo(
    () => budgets.filter((b) => b.isOverall || b.periodType === 'custom_event' || (b.periodType !== 'monthly' && b.periodType !== undefined)),
    [budgets]
  );

  const historyBudgets = useMemo(() => {
    return allOverallAndEventBudgets
      .filter((b) => (historyFilter === 'monthly' ? b.isOverall : historyFilter === 'events' ? !b.isOverall : true))
      .sort((a, b) => {
        const score = (st: string) => (st === 'in_progress' ? 0 : st === 'not_started' ? 1 : 2);
        const d = score(getBudgetStatus(a).status) - score(getBudgetStatus(b).status);
        return d !== 0 ? d : (b.startDate || 0) - (a.startDate || 0);
      });
  }, [allOverallAndEventBudgets, historyFilter]);

  const getHistoryBudgetStats = useCallback(
    (budget: BudgetCategory) => {
      const limit = Number(budget.limitAmount || 0);
      let spent = 0;
      if (budget.isOverall) {
        const start = ts(budget.startDate);
        const end = ts(budget.endDate);
        spent = transactions.reduce((acc, t) => {
          if (isExcludedFromBudget(t, excludedTransactionIds)) return acc;
          const t0 = ts(t.timestamp);
          if (start && end && (t0 < start || t0 > end)) return acc;
          return acc + Math.abs(parseFloat(t.amount || 0));
        }, 0);
      } else {
        spent = calculateBudgetNetSpend(budget, transactions).netSpend;
      }
      return {
        limit,
        spent,
        remaining: Math.max(0, limit - spent),
        overspent: Math.max(0, spent - limit),
        pct: limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0,
      };
    },
    [transactions, excludedTransactionIds]
  );

  useEffect(() => {
    if (menuBudget) {
      setEditLimitStr(String(menuBudget.limitAmount || ''));
      setIsEditingLimit(false);
      setMenuError('');
    }
  }, [menuBudget?.id]);

  useEffect(() => {
    if (route.params?.openTab) setActiveTab(route.params.openTab);
    if (route.params?.selectedBudgetId) setSelectedMonthlyBudgetId(route.params.selectedBudgetId);
  }, [route.params?.openTab, route.params?.selectedBudgetId]);

  useFocusEffect(
    useCallback(() => {
      sync();
      budgetService.cleanupDuplicateBudgets().catch(() => { });
      if (route.params?.openTab) setActiveTab(route.params.openTab);
      if (route.params?.selectedBudgetId) setSelectedMonthlyBudgetId(route.params.selectedBudgetId);
    }, [sync, route.params?.openTab, route.params?.selectedBudgetId])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  }, [sync]);

  const allMonthlyOverallBudgets = useMemo(() => {
    const overall = budgets
      .filter((b) => b.isOverall && (!b.periodType || b.periodType === 'monthly'))
      .sort((a, b) => (Number(a.startDate) || 0) - (Number(b.startDate) || 0));
    const seen = new Set<string>();
    return overall.filter((b) => {
      const key = (b.period || (b.startDate ? format(new Date(b.startDate), 'MMMM yyyy') : b.id)).toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [budgets]);

  const monthlyOverallBudget = useMemo(() => {
    if (selectedMonthlyBudgetId) {
      const found = allMonthlyOverallBudgets.find((b) => b.id === selectedMonthlyBudgetId);
      if (found) return found;
    }
    const now = Date.now();
    const active = allMonthlyOverallBudgets.find((b) => now >= ts(b.startDate) && now <= ts(b.endDate));
    return active || allMonthlyOverallBudgets[0] || null;
  }, [allMonthlyOverallBudgets, selectedMonthlyBudgetId]);

  const monthlyCategoryBudgets = useMemo(() => {
    if (!monthlyOverallBudget) return [];
    const raw = budgets.filter((b) => {
      if (b.isOverall || (b.periodType && b.periodType !== 'monthly')) return false;
      if (b.parentBudgetId) return b.parentBudgetId === monthlyOverallBudget.id;
      return b.period === monthlyOverallBudget.period;
    });
    const byCat = new Map<string, BudgetCategory>();
    for (const b of raw) {
      const key = (b.category || '').toLowerCase().trim();
      const cur = byCat.get(key);
      if (!cur || (b.parentBudgetId === monthlyOverallBudget.id && cur.parentBudgetId !== monthlyOverallBudget.id)) byCat.set(key, b);
    }
    return Array.from(byCat.values());
  }, [budgets, monthlyOverallBudget]);

  const specialEventBudgets = useMemo(
    () => budgets.filter((b) => b.periodType === 'custom_event' || (b.periodType !== 'monthly' && !b.isOverall && b.periodType !== undefined)),
    [budgets]
  );

  const hierarchy = useMemo(
    () => calculateBudgetHierarchy(monthlyOverallBudget, monthlyCategoryBudgets, transactions),
    [monthlyOverallBudget, monthlyCategoryBudgets, transactions, excludedTransactionIds]
  );

  /* ---------------- Actions (unchanged behaviour) ---------------- */

  const postToBackend = (path: string, body: any) => {
    const token = authService.getAccessToken();
    const backendUrl = getBackendUrl();
    if (!token || !backendUrl) return;
    fetch(`${backendUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((err) => console.warn('[Budget] Sync error:', err?.message));
  };

  const excludeTx = (tx: any) => {
    showGlobalConfirm({
      title: 'Leave this out of your budget?',
      message: `${tx.merchant || 'This payment'} (${inr(Math.abs(parseFloat(tx.amount || 0)))}) won’t count toward this budget. It stays in your history.`,
      confirmText: 'Leave out',
      cancelText: 'Cancel',
      icon: 'eye-off',
      onConfirm: () => {
        excludeTransactionFromBudget(tx.id);
        postToBackend('/sync/budget/exclude-transaction', { transactionId: tx.id, budgetId: monthlyOverallBudget?.id });
      },
    });
  };

  const restoreTx = (txId: string) => {
    restoreTransactionToBudget(txId);
    postToBackend('/sync/budget/restore-transaction', { transactionId: txId });
  };

  const restoreAll = () => {
    const ids = [...excludedTransactionIds];
    clearAllExcludedTransactions();
    ids.forEach((id) => postToBackend('/sync/budget/restore-transaction', { transactionId: id }));
  };

  const deleteBudget = (budget: BudgetCategory) => {
    showGlobalConfirm({
      title: `Delete ${budget.name || getCategoryMeta(budget.category).label}?`,
      message: budget.isOverall
        ? 'This month’s plan will be removed. Your transactions stay as they are.'
        : 'Its amount goes back to your unplanned money for the month.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        await budgetService.deleteBudget(budget.id);
      },
    });
  };

  const togglePause = async (budget: BudgetCategory) => {
    const next = !budget.isPaused;
    setMenuBudget({ ...budget, isPaused: next });
    try {
      await budgetService.updateBudget(budget.id, { isPaused: next });
    } catch (err: any) {
      setMenuBudget({ ...budget, isPaused: !next });
      setMenuError(err?.message || 'Couldn’t change tracking. Try again.');
    }
  };

  const saveLimit = async () => {
    if (!menuBudget) return;
    const n = parseFloat(editLimitStr.replace(/[^0-9.]/g, ''));
    if (isNaN(n) || n <= 0) {
      setMenuError('Enter an amount above ₹0.');
      return;
    }
    setSavingEdit(true);
    setMenuError('');
    try {
      await budgetService.updateBudget(menuBudget.id, { limitAmount: n });
      setMenuBudget({ ...menuBudget, limitAmount: n });
      setIsEditingLimit(false);
    } catch (err: any) {
      setMenuError(err?.message || 'Couldn’t save the amount. Try again.');
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleDone = (b: BudgetCategory) => markBudgetDone(b.id, !b.isDone);

  const affordImpact = useMemo(() => {
    const amt = parseFloat(affordAmountStr.replace(/[^0-9.]/g, '')) || 0;
    if (amt <= 0) return null;
    const free = hierarchy.unallocatedRemaining;
    return { amt, canAfford: amt <= free, free, after: Math.max(0, free - amt) };
  }, [affordAmountStr, hierarchy.unallocatedRemaining]);

  /* ---------------- Theme ---------------- */

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const field = isDark ? colors.border : '#DCE5E0';
  const track = isDark ? 'rgba(255,255,255,0.08)' : '#EDF2EF';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const green = isDark ? LIME : '#16A34A';
  const amber = '#F59F00';
  const red = isDark ? '#FFA8A8' : '#C92A2A';
  const redBar = '#E03131';

  const barColor = (pct: number, over: boolean) => (over ? redBar : pct >= 85 ? amber : green);

  const newBudget = () =>
    navigation.navigate('CreateBudget', { initialType: activeTab === 'events' ? 'custom_event' : 'monthly' });

  const addCategory = (category?: string) =>
    navigation.navigate('CreateBudget', {
      initialType: 'monthly',
      initialScope: 'category',
      initialCategory: category,
      parentBudgetId: monthlyOverallBudget?.id,
      period: monthlyOverallBudget?.period,
      targetDate: monthlyOverallBudget?.startDate,
    });

  /* ---------------- Rows ---------------- */

  const TxLine = ({ tx, last }: { tx: any; last: boolean }) => (
    <View key={tx.id} style={[s.txLine, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.txName, { color: ink }]} numberOfLines={1}>{tx.merchant || 'Payment'}</Text>
        <Text style={[s.txDate, { color: muted }]}>{format(new Date(Number(tx.timestamp || tx.date)), 'd MMM')}</Text>
      </View>
      <Text style={[s.txAmt, { color: ink }]}>−{inr(Math.abs(parseFloat(tx.amount || 0)))}</Text>
      <Pressable onPress={() => excludeTx(tx)} hitSlop={10} style={s.txOut} accessibilityLabel={`Leave ${tx.merchant || 'payment'} out of budget`}>
        <Feather name="eye-off" size={15} color={muted} />
      </Pressable>
    </View>
  );

  const CategoryRow = ({ budget, last }: { budget: BudgetCategory; last: boolean }) => {
    // Called as a function (not <CategoryRow/>) so its progress bar keeps its state
    const spend = calculateBudgetNetSpend(budget, transactions);
    const customDef = customCategories.find((c) => c.id === budget.category);
    const meta = getCategoryMeta(budget.category, false, customDef || budget.customCategoryDef);
    const limit = budget.limitAmount || 0;
    const spent = spend.netSpend;
    const over = spent > limit;
    const pct = limit > 0 ? (spent / limit) * 100 : 0;
    const open = !!expanded[budget.id];

    return (
      <View key={budget.id} style={[!last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}>
        <Pressable onPress={() => toggle(budget.id)} onLongPress={() => setMenuBudget(budget)} style={({ pressed }) => [s.catRow, pressed && { opacity: 0.75 }]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <View style={s.catTop}>
            <CategoryIcon category={budget.category} variant="soft" size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[s.catName, { color: ink }]} numberOfLines={1}>{budget.name || meta.label}</Text>
                {budget.isPaused && (
                  <View style={[s.pausedPill, { backgroundColor: isDark ? 'rgba(245,159,0,0.18)' : '#FFF1D6' }]}>
                    <Text style={[s.pausedText, { color: isDark ? '#FFD27A' : '#8A5A00' }]}>Paused</Text>
                  </View>
                )}
              </View>
              <Text style={[s.catSub, { color: muted }]}>{inr(spent)} of {inr(limit)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.catRight, { color: over ? red : ink }]}>{inr(over ? spent - limit : limit - spent)}</Text>
              <Text style={[s.catSub, { color: muted }]}>{over ? 'over' : 'left'}</Text>
            </View>
            <Pressable onPress={() => setMenuBudget(budget)} hitSlop={12} style={s.dots} accessibilityLabel={`Options for ${budget.name || meta.label}`}>
              <Feather name="more-vertical" size={16} color={muted} />
            </Pressable>
          </View>
          <View style={{ marginTop: 10 }}>
            <Bar pct={pct} color={barColor(pct, over)} track={track} />
          </View>
        </Pressable>
        {open && (
          <Animated.View entering={FadeIn.duration(200)} style={s.expand}>
            {spend.matchingTransactions.length === 0 ? (
              <Text style={[s.expandEmpty, { color: muted }]}>No payments here yet.</Text>
            ) : (
              spend.matchingTransactions.map((tx: any, i: number) => TxLine({ tx, last: i === spend.matchingTransactions.length - 1 }))
            )}
          </Animated.View>
        )}
      </View>
    );
  };

  /* ---------------- Views ---------------- */

  const renderMonthly = () => {
    if (!monthlyOverallBudget) {
      return (
        <Animated.View entering={FadeInDown.duration(380)} style={[s.empty, { backgroundColor: surface, borderColor: line }]}>
          <View style={[s.emptyIcon, { backgroundColor: isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8' }]}>
            <Feather name="pie-chart" size={24} color={accent} />
          </View>
          <Text style={[s.emptyTitle, { color: ink }, heading]}>Plan this month</Text>
          <Text style={[s.emptyText, { color: muted }]}>Set how much you want to spend, then split it across rent, food and more.</Text>
          <Pressable onPress={() => navigation.navigate('CreateBudget', { initialType: 'monthly', initialScope: 'overall' })} style={[s.primary, { backgroundColor: accent }]}>
            <Text style={[s.primaryText, { color: accentFg }]}>Set a monthly budget</Text>
          </Pressable>
        </Animated.View>
      );
    }

    const h = hierarchy;
    const over = h.totalSpent > h.totalLimit;
    const upcoming = Date.now() < ts(monthlyOverallBudget.startDate);
    const daysToStart = Math.ceil((ts(monthlyOverallBudget.startDate) - Date.now()) / 86400000);
    const monthName = format(new Date(monthlyOverallBudget.startDate || Date.now()), 'MMMM');
    const unplannedOver = h.unallocatedSpent > h.unallocatedBuffer;

    return (
      <>
        {/* Month chips */}
        {allMonthlyOverallBudgets.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.monthRow}>
            {allMonthlyOverallBudgets.map((b) => {
              const on = b.id === monthlyOverallBudget.id;
              const st = getBudgetStatus(b).status;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => setSelectedMonthlyBudgetId(b.id)}
                  style={[s.monthChip, on ? { backgroundColor: accent } : { backgroundColor: surface, borderColor: field, borderWidth: 1 }]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                >
                  {st === 'in_progress' && <View style={[s.liveDot, { backgroundColor: on ? (isDark ? FOREST : LIME) : green }]} />}
                  <Text style={[s.monthText, { color: on ? (isDark ? FOREST : '#FFFFFF') : ink }, on && { fontWeight: '700' }]}>
                    {format(new Date(b.startDate || Date.now()), 'MMMM')}
                  </Text>
                  {st === 'not_started' && !on && <Text style={[s.monthHint, { color: muted }]}>soon</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Compact Hero Card */}
        <Animated.View entering={FadeInDown.duration(380)} style={s.hero}>
          <View pointerEvents="none" style={s.heroRing} />
          <View style={s.heroTop}>
            <Text style={s.heroMeta}>
              {upcoming
                ? `${monthName} · in ${daysToStart}d`
                : `${monthName} · ${h.daysRemaining}d left`}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Pressable
                onPress={() => setAffordOpen(true)}
                style={({ pressed }) => [s.affordBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] }]}
                accessibilityRole="button"
                accessibilityLabel="Can I afford it?"
              >
                <Feather name="zap" size={11} color={FOREST} />
                <Text style={s.affordText}>Afford?</Text>
              </Pressable>
              <Pressable
                onPress={() => setMenuBudget(monthlyOverallBudget)}
                style={s.heroDots}
                hitSlop={8}
                accessibilityLabel="Month options"
              >
                <Feather name="more-horizontal" size={15} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
          <Text style={[s.heroAmount, heading, { color: over ? '#FFB4A2' : '#FFFFFF' }]} numberOfLines={1} adjustsFontSizeToFit>
            {over ? `${inr(h.totalSpent - h.totalLimit)} over` : `${inr(h.totalRemaining)} left`}
          </Text>
          <Text style={s.heroSub}>Spent {inr(h.totalSpent)} of {inr(h.totalLimit)}</Text>
          <View style={{ marginTop: 8 }}>
            <Bar
              pct={h.totalLimit > 0 ? (h.totalSpent / h.totalLimit) * 100 : 0}
              color={over ? '#FF8A70' : LIME}
              track="rgba(255,255,255,0.14)"
              height={5}
            />
          </View>
          <View style={s.heroStats}>
            <View style={{ flex: 1 }}>
              <Text style={s.statLabel}>Planned</Text>
              <Text style={s.statValue}>{inr(h.allocatedLimit)}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={s.statLabel}>Unplanned left</Text>
              <Text style={s.statValue}>{inr(h.unallocatedRemaining)}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={s.statLabel}>Safe a day</Text>
              <Text style={s.statValue}>{inr(h.dailySafeSpend)}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Categories */}
        <View style={s.sectionHead}>
          <Text style={[s.sectionTitle, { color: ink }]}>Categories</Text>
          <Pressable onPress={() => addCategory()} hitSlop={10}>
            <Text style={[s.link, { color: isDark ? LIME : '#0B6B3A' }]}>Add</Text>
          </Pressable>
        </View>

        {monthlyCategoryBudgets.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(80).duration(380)} style={[s.group, { backgroundColor: surface, borderColor: line }]}>
            {monthlyCategoryBudgets.map((b, i) => (
              CategoryRow({ budget: b, last: i === monthlyCategoryBudgets.length - 1 })
            ))}
          </Animated.View>
        ) : (
          <View style={[s.note, { borderColor: field }]}>
            <Text style={[s.noteText, { color: muted }]}>No category budgets yet. Everything you spend comes from the month’s total.</Text>
          </View>
        )}

        {/* Not budgeted */}
        {h.unallocatedSpent > 0 && (
          <Animated.View entering={FadeInDown.delay(140).duration(380)} style={[s.group, { backgroundColor: surface, borderColor: line, marginTop: 12 }]}>
            <Pressable onPress={() => toggle('__others')} style={({ pressed }) => [s.catRow, pressed && { opacity: 0.75 }]} accessibilityRole="button" accessibilityState={{ expanded: !!expanded.__others }}>
              <View style={s.catTop}>
                <View style={[s.othersIcon, { backgroundColor: isDark ? 'rgba(224,49,49,0.2)' : '#FFE3E3' }]}>
                  <Feather name="tag" size={18} color={red} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.catName, { color: ink }]}>Not budgeted</Text>
                  <Text style={[s.catSub, { color: muted }]} numberOfLines={1}>
                    {h.unallocatedBreakdown.length} categor{h.unallocatedBreakdown.length === 1 ? 'y' : 'ies'}, from unplanned {inr(h.unallocatedBuffer)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.catRight, { color: unplannedOver ? red : ink }]}>
                    {inr(unplannedOver ? h.unallocatedSpent - h.unallocatedBuffer : h.unallocatedSpent)}
                  </Text>
                  <Text style={[s.catSub, { color: muted }]}>{unplannedOver ? 'over' : 'spent'}</Text>
                </View>
                <Feather name={expanded.__others ? 'chevron-up' : 'chevron-down'} size={16} color={muted} style={{ marginLeft: 6 }} />
              </View>
              <View style={{ marginTop: 10 }}>
                <Bar
                  pct={h.unallocatedBuffer > 0 ? (h.unallocatedSpent / h.unallocatedBuffer) * 100 : 100}
                  color={unplannedOver ? redBar : amber}
                  track={track}
                />
              </View>
            </Pressable>
            {expanded.__others && (
              <Animated.View entering={FadeIn.duration(200)} style={s.expand}>
                {h.unallocatedBreakdown.map((g: any) => (
                  <View key={g.category} style={{ marginBottom: 10 }}>
                    <View style={s.groupHead}>
                      <CategoryIcon category={g.category} variant="soft" size={28} />
                      <Text style={[s.groupName, { color: ink }]} numberOfLines={1}>{g.label}</Text>
                      <Text style={[s.groupAmt, { color: ink }]}>{inr(g.totalSpent)}</Text>
                      <Pressable onPress={() => addCategory(g.category)} hitSlop={8} style={[s.miniBtn, { borderColor: field }]}>
                        <Text style={[s.miniBtnText, { color: isDark ? LIME : '#0B6B3A' }]}>Budget it</Text>
                      </Pressable>
                    </View>
                    {g.transactions.map((tx: any, i: number) => TxLine({ tx, last: i === g.transactions.length - 1 }))}
                  </View>
                ))}
              </Animated.View>
            )}
          </Animated.View>
        )}

        {/* Left-out payments */}
        {excludedTransactionIds.length > 0 && (
          <Pressable onPress={() => setExcludedOpen(true)} style={s.leftOut} accessibilityRole="button">
            <Feather name="eye-off" size={15} color={muted} />
            <Text style={[s.leftOutText, { color: muted }]}>
              {excludedTransactionIds.length} payment{excludedTransactionIds.length === 1 ? '' : 's'} left out
            </Text>
            <Text style={[s.link, { color: isDark ? LIME : '#0B6B3A' }]}>Review</Text>
          </Pressable>
        )}
      </>
    );
  };

  const renderEvents = () =>
    specialEventBudgets.length === 0 ? (
      <Animated.View entering={FadeInDown.duration(380)} style={[s.empty, { backgroundColor: surface, borderColor: line, marginTop: 16 }]}>
        <View style={[s.emptyIcon, { backgroundColor: isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8' }]}>
          <Feather name="map" size={24} color={accent} />
        </View>
        <Text style={[s.emptyTitle, { color: ink }, heading]}>Budget for a trip or event</Text>
        <Text style={[s.emptyText, { color: muted }]}>A holiday, wedding or festival, with its own dates and limit.</Text>
        <Pressable onPress={() => navigation.navigate('CreateBudget', { initialType: 'custom_event' })} style={[s.primary, { backgroundColor: accent }]}>
          <Text style={[s.primaryText, { color: accentFg }]}>Create an event budget</Text>
        </Pressable>
      </Animated.View>
    ) : (
      <View style={{ marginTop: 16, gap: 12 }}>
        {specialEventBudgets.map((b, i) => {
          const sp = calculateBudgetNetSpend(b, transactions);
          const limit = b.limitAmount || 0;
          const over = sp.netSpend > limit;
          const pct = limit > 0 ? (sp.netSpend / limit) * 100 : 0;
          const status = sp.isUpcoming ? `Starts in ${sp.daysUntilStart} days` : b.isManuallyActivated ? 'Tracking early' : 'Active';
          return (
            <Animated.View key={b.id} entering={FadeInDown.delay(i * 60).duration(380)} style={[s.eventCard, { backgroundColor: surface, borderColor: line }]}>
              <View style={s.catTop}>
                <View style={[s.othersIcon, { backgroundColor: isDark ? 'rgba(59,130,246,0.18)' : '#DCEBFF' }]}>
                  <Feather name="map" size={18} color={isDark ? '#93C5FD' : '#1450A3'} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.catName, { color: ink }]} numberOfLines={1}>{b.name || 'Event'}</Text>
                  <Text style={[s.catSub, { color: muted }]} numberOfLines={1}>{b.period || 'Custom dates'}, {status.toLowerCase()}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.catRight, { color: over ? red : ink }]}>{inr(over ? sp.netSpend - limit : limit - sp.netSpend)}</Text>
                  <Text style={[s.catSub, { color: muted }]}>{over ? 'over' : 'left'}</Text>
                </View>
                <Pressable onPress={() => setMenuBudget(b)} hitSlop={12} style={s.dots} accessibilityLabel={`Options for ${b.name || 'event'}`}>
                  <Feather name="more-vertical" size={16} color={muted} />
                </Pressable>
              </View>
              <View style={{ marginTop: 12 }}>
                <Bar pct={pct} color={barColor(pct, over)} track={track} />
              </View>
              <Text style={[s.eventFoot, { color: muted }]}>{inr(sp.netSpend)} of {inr(limit)}</Text>
            </Animated.View>
          );
        })}
      </View>
    );

  const renderHistory = () => (
    <>
      <View style={s.filterRow}>
        {(['all', 'monthly', 'events'] as const).map((f) => {
          const on = historyFilter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setHistoryFilter(f)}
              style={[s.filterChip, on ? { backgroundColor: accent } : { backgroundColor: surface, borderColor: field, borderWidth: 1 }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[s.filterText, { color: on ? accentFg === LIME ? '#FFFFFF' : FOREST : ink }, on && { fontWeight: '700' }]}>
                {f === 'all' ? 'All' : f === 'monthly' ? 'Monthly' : 'Events'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {historyBudgets.length === 0 ? (
        <View style={[s.note, { borderColor: field }]}>
          <Text style={[s.noteText, { color: muted }]}>Finished months and events show up here, ready to reuse.</Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {historyBudgets.map((b, i) => {
            const st = getHistoryBudgetStats(b);
            const status = getBudgetStatus(b);
            const over = st.overspent > 0;
            return (
              <Animated.View key={b.id} entering={FadeInDown.delay(i * 50).duration(360)} style={[s.eventCard, { backgroundColor: surface, borderColor: line }]}>
                <View style={s.histTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.catName, { color: ink }]} numberOfLines={1}>
                      {b.name || (b.isOverall ? b.period || 'Monthly budget' : 'Event')}
                    </Text>
                    <Text style={[s.catSub, { color: muted }]}>
                      {b.isOverall ? 'Monthly' : 'Event'}, {status.label.toLowerCase()}
                    </Text>
                  </View>
                  <Pressable onPress={() => setMenuBudget(b)} hitSlop={12} style={s.dots} accessibilityLabel="Options">
                    <Feather name="more-vertical" size={16} color={muted} />
                  </Pressable>
                </View>
                <View style={s.histStats}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.histLabel, { color: muted }]}>Spent</Text>
                    <Text style={[s.histValue, { color: ink }]}>{inr(st.spent)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.histLabel, { color: muted }]}>Budget</Text>
                    <Text style={[s.histValue, { color: ink }]}>{inr(st.limit)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.histLabel, { color: muted }]}>{over ? 'Over by' : 'Saved'}</Text>
                    <Text style={[s.histValue, { color: over ? red : green }]}>{inr(over ? st.overspent : st.remaining)}</Text>
                  </View>
                </View>
                <Bar pct={st.limit > 0 ? (st.spent / st.limit) * 100 : 0} color={over ? redBar : green} track={track} />
                <View style={s.histActions}>
                  <Pressable
                    onPress={() => navigation.navigate('CreateBudget', { cloneFromBudgetId: b.id, initialType: b.isOverall ? 'monthly' : 'custom_event' })}
                    style={[s.histPrimary, { backgroundColor: accent }]}
                  >
                    <Feather name="copy" size={14} color={accentFg} />
                    <Text style={[s.histPrimaryText, { color: accentFg }]}>{b.isOverall ? 'Use for next month' : 'Use again'}</Text>
                  </Pressable>
                  <Pressable onPress={() => toggleDone(b)} style={[s.histSecondary, { borderColor: field }]}>
                    <Text style={[s.histSecondaryText, { color: ink }]}>{b.isDone ? 'Reopen' : 'Mark done'}</Text>
                  </Pressable>
                </View>
              </Animated.View>
            );
          })}
        </View>
      )}
    </>
  );

  /* ---------------- Render ---------------- */

  const menuMeta = menuBudget
    ? getCategoryMeta(menuBudget.category, false, customCategories.find((c) => c.id === menuBudget.category) || menuBudget.customCategoryDef)
    : null;

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={green} colors={[green]} />}
      >
        <View style={s.titleRow}>
          <Text style={[s.pageTitle, { color: ink }, heading]}>Budgets</Text>
          <Pressable onPress={newBudget} style={({ pressed }) => [s.plus, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.94 }] }]} accessibilityLabel={activeTab === 'events' ? 'New event budget' : 'New budget'}>
            <Feather name="plus" size={18} color={accentFg} />
          </Pressable>
        </View>

        <View style={[s.segment, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E9EFEB' }]}>
          {(['monthly', 'events', 'history'] as Tab[]).map((t) => {
            const on = activeTab === t;
            return (
              <Pressable
                key={t}
                onPress={() => setActiveTab(t)}
                style={[s.segBtn, on && { backgroundColor: isDark ? '#1E3329' : '#FFFFFF' }, on && !isDark && s.segShadow]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[s.segText, { color: on ? ink : muted }, on && { fontWeight: '700' }]}>
                  {t === 'monthly' ? 'Monthly' : t === 'events' ? 'Events' : 'History'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeTab === 'monthly' ? renderMonthly() : activeTab === 'events' ? renderEvents() : renderHistory()}
      </ScrollView>

      {/* Can I afford it? */}
      <Sheet visible={affordOpen} onClose={() => setAffordOpen(false)} bg={surface} dark={isDark}>
        <Text style={[s.sheetTitle, { color: ink }, heading]}>Can I afford it?</Text>
        <Text style={[s.sheetText, { color: muted }]}>You have {inr(hierarchy.unallocatedRemaining)} of unplanned money left this month.</Text>
        <View style={[s.amountBox, { borderColor: field, backgroundColor: pageBg }]}>
          <Text style={[s.amountRupee, { color: muted }, heading]}>₹</Text>
          <TextInput
            value={affordAmountStr}
            onChangeText={(t) => setAffordAmountStr(t.replace(/[^0-9.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={muted}
            autoFocus
            style={[s.amountInput, { color: ink }, heading]}
            accessibilityLabel="Purchase amount"
          />
        </View>
        {affordImpact && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={[s.verdict, { backgroundColor: affordImpact.canAfford ? (isDark ? 'rgba(184,243,107,0.12)' : '#E3F2E8') : isDark ? 'rgba(224,49,49,0.18)' : '#FFE3E3' }]}
          >
            <Feather name={affordImpact.canAfford ? 'check-circle' : 'alert-circle'} size={18} color={affordImpact.canAfford ? accent : red} />
            <Text style={[s.verdictText, { color: ink }]}>
              {affordImpact.canAfford
                ? `Yes. You’ll still have ${inr(affordImpact.after)} unplanned this month.`
                : `Not without going over. It’s ${inr(affordImpact.amt - affordImpact.free)} more than you have unplanned.`}
            </Text>
          </Animated.View>
        )}
        <Pressable onPress={() => setAffordOpen(false)} style={[s.primary, { backgroundColor: accent, marginTop: 16, alignSelf: 'stretch' }]}>
          <Text style={[s.primaryText, { color: accentFg }]}>Done</Text>
        </Pressable>
      </Sheet>

      {/* Budget options */}
      <Sheet visible={!!menuBudget} onClose={() => setMenuBudget(null)} bg={surface} dark={isDark}>
        {menuBudget && (
          <>
            <View style={s.menuHead}>
              {menuBudget.isOverall ? (
                <View style={[s.othersIcon, { backgroundColor: isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8' }]}>
                  <Feather name="pie-chart" size={18} color={accent} />
                </View>
              ) : (
                <CategoryIcon category={menuBudget.category} variant="soft" size={40} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[s.menuTitle, { color: ink }]} numberOfLines={1}>
                  {menuBudget.name || (menuBudget.isOverall ? menuBudget.period || 'Monthly budget' : menuMeta?.label)}
                </Text>
                <Text style={[s.catSub, { color: muted }]}>Budget {inr(Number(menuBudget.limitAmount || 0))}</Text>
              </View>
            </View>

            <View style={[s.menuGroup, { borderColor: line }]}>
              <View style={[s.menuRow, { borderBottomColor: line }]}>
                <Feather name="activity" size={18} color={ink} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.menuLabel, { color: ink }]}>Track spending</Text>
                  <Text style={[s.catSub, { color: muted }]}>{menuBudget.isPaused ? 'Paused. Payments don’t count.' : 'Payments count toward this budget.'}</Text>
                </View>
                <Switch
                  value={!menuBudget.isPaused}
                  onValueChange={() => togglePause(menuBudget)}
                  trackColor={{ false: isDark ? '#3A3A3C' : '#D1D5DB', true: '#16A34A' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={isDark ? '#3A3A3C' : '#D1D5DB'}
                />
              </View>

              {isEditingLimit ? (
                <View style={[s.menuRow, { borderBottomColor: line }]}>
                  <View style={[s.limitBox, { borderColor: field, backgroundColor: pageBg }]}>
                    <Text style={[s.limitRupee, { color: muted }]}>₹</Text>
                    <TextInput
                      value={editLimitStr}
                      onChangeText={(t) => setEditLimitStr(t.replace(/[^0-9.]/g, ''))}
                      keyboardType="decimal-pad"
                      autoFocus
                      style={[s.limitInput, { color: ink }]}
                      accessibilityLabel="New budget amount"
                    />
                  </View>
                  <Pressable onPress={saveLimit} disabled={savingEdit} style={[s.limitSave, { backgroundColor: accent }]}>
                    {savingEdit ? <ActivityIndicator size="small" color={accentFg} /> : <Text style={[s.limitSaveText, { color: accentFg }]}>Save</Text>}
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setIsEditingLimit(true)} style={[s.menuRow, { borderBottomColor: line }]}>
                  <Feather name="edit-3" size={18} color={ink} />
                  <Text style={[s.menuLabel, { color: ink, flex: 1 }]}>Change amount</Text>
                  <Text style={[s.menuValue, { color: muted }]}>{inr(Number(menuBudget.limitAmount || 0))}</Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => {
                  toggleDone(menuBudget);
                  setMenuBudget({ ...menuBudget, isDone: !menuBudget.isDone });
                }}
                style={[s.menuRow, { borderBottomColor: line }]}
              >
                <Feather name={menuBudget.isDone ? 'rotate-ccw' : 'check-circle'} size={18} color={ink} />
                <Text style={[s.menuLabel, { color: ink, flex: 1 }]}>{menuBudget.isDone ? 'Reopen' : 'Mark as done'}</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  const b = menuBudget;
                  setMenuBudget(null);
                  navigation.navigate('CreateBudget', { cloneFromBudgetId: b.id, initialType: b.isOverall ? 'monthly' : 'custom_event' });
                }}
                style={[s.menuRow, { borderBottomWidth: 0 }]}
              >
                <Feather name="copy" size={18} color={ink} />
                <Text style={[s.menuLabel, { color: ink, flex: 1 }]}>Use as a template</Text>
                <Feather name="chevron-right" size={16} color={muted} />
              </Pressable>
            </View>

            {menuError ? <Text style={[s.menuError, { color: red }]}>{menuError}</Text> : null}

            <Pressable
              onPress={() => {
                const b = menuBudget;
                setMenuBudget(null);
                deleteBudget(b);
              }}
              style={[s.deleteRow, { borderColor: line }]}
            >
              <Feather name="trash-2" size={18} color={red} />
              <Text style={[s.menuLabel, { color: red }]}>Delete budget</Text>
            </Pressable>
          </>
        )}
      </Sheet>

      {/* Left-out payments */}
      <Sheet visible={excludedOpen} onClose={() => setExcludedOpen(false)} bg={surface} dark={isDark}>
        <Text style={[s.sheetTitle, { color: ink }, heading]}>Left out of budget</Text>
        <Text style={[s.sheetText, { color: muted }]}>These payments don’t count toward your budget. They still show on Home and in your bank history.</Text>
        <ScrollView style={{ maxHeight: 340, marginTop: 8 }} showsVerticalScrollIndicator={false}>
          {excludedTransactionsList.length === 0 ? (
            <Text style={[s.expandEmpty, { color: muted, paddingVertical: 20, textAlign: 'center' }]}>Nothing left out right now.</Text>
          ) : (
            excludedTransactionsList.map((tx: any, i: number) => (
              <View key={tx.id} style={[s.txLine, i < excludedTransactionsList.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}>
                <CategoryIcon category={tx.category} variant="soft" size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.txName, { color: ink }]} numberOfLines={1}>{tx.merchant || 'Payment'}</Text>
                  <Text style={[s.txDate, { color: muted }]}>{format(new Date(Number(tx.timestamp || tx.date)), 'd MMM')}</Text>
                </View>
                <Text style={[s.txAmt, { color: ink }]}>{inr(Math.abs(parseFloat(tx.amount || 0)))}</Text>
                <Pressable onPress={() => restoreTx(tx.id)} style={[s.miniBtn, { borderColor: field }]}>
                  <Text style={[s.miniBtnText, { color: isDark ? LIME : '#0B6B3A' }]}>Count it</Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
        {excludedTransactionsList.length > 1 && (
          <Pressable
            onPress={() => {
              restoreAll();
              setExcludedOpen(false);
            }}
            style={[s.primary, { backgroundColor: accent, marginTop: 16, alignSelf: 'stretch' }]}
          >
            <Text style={[s.primaryText, { color: accentFg }]}>Count all again</Text>
          </Pressable>
        )}
      </Sheet>

      <StandaloneBottomTabBar activeTab="Budgets" />
    </View>
  );
};

const s = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 2 },
  pageTitle: { fontSize: 24, letterSpacing: -0.5 },
  plus: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  segment: { flexDirection: 'row', borderRadius: 12, padding: 3, marginTop: 10 },
  segBtn: { flex: 1, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segShadow: { shadowColor: '#0B1F17', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 1 },
  segText: { fontSize: 13, fontWeight: '600' },

  monthRow: { gap: 6, paddingTop: 8 },
  monthChip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 12, borderRadius: 15 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  monthText: { fontSize: 12, fontWeight: '600' },
  monthHint: { fontSize: 11 },

  hero: { marginTop: 10, borderRadius: 20, backgroundColor: FOREST, paddingHorizontal: 16, paddingVertical: 14, overflow: 'hidden' },
  heroRing: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: 'rgba(184,243,107,0.14)', right: -60, top: -80 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroMeta: { color: '#B5CEC1', fontSize: 12, fontWeight: '600' },
  heroDots: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  heroAmount: { fontSize: 25, letterSpacing: -0.6, marginTop: 4, fontVariant: ['tabular-nums'] },
  heroSub: { color: '#D9E7DF', fontSize: 12, marginTop: 1 },
  heroStats: { flexDirection: 'row', marginTop: 10 },
  statLabel: { color: '#B5CEC1', fontSize: 11 },
  statValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', marginTop: 1, fontVariant: ['tabular-nums'] },
  affordBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: LIME },
  affordText: { color: FOREST, fontSize: 11, fontWeight: '700' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 16, paddingBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  link: { fontSize: 13, fontWeight: '600' },

  group: { borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  catRow: { paddingHorizontal: 16, paddingVertical: 14 },
  catTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  catSub: { fontSize: 12, marginTop: 2 },
  catRight: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dots: { width: 28, alignItems: 'center', marginRight: -6 },
  pausedPill: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  pausedText: { fontSize: 11, fontWeight: '700' },
  othersIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },

  expand: { paddingHorizontal: 16, paddingBottom: 8 },
  expandEmpty: { fontSize: 13, paddingVertical: 8 },
  txLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  txName: { fontSize: 14, fontWeight: '600' },
  txDate: { fontSize: 12, marginTop: 1 },
  txAmt: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  txOut: { width: 30, alignItems: 'center' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  groupName: { flex: 1, fontSize: 14, fontWeight: '700' },
  groupAmt: { fontSize: 14, fontWeight: '700' },
  miniBtn: { height: 30, paddingHorizontal: 10, borderRadius: 15, borderWidth: 1, justifyContent: 'center' },
  miniBtnText: { fontSize: 12, fontWeight: '700' },

  note: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 20, padding: 16 },
  noteText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  leftOut: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingVertical: 16 },
  leftOutText: { flex: 1, fontSize: 13 },

  empty: { borderWidth: 1, borderRadius: 26, padding: 24, alignItems: 'center', marginTop: 16 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 22, letterSpacing: -0.4, marginTop: 16, textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center', maxWidth: 290 },
  primary: { height: 52, paddingHorizontal: 22, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  primaryText: { fontSize: 15, fontWeight: '700' },

  eventCard: { borderWidth: 1, borderRadius: 22, padding: 16 },
  eventFoot: { fontSize: 12, marginTop: 8 },

  filterRow: { flexDirection: 'row', gap: 8, paddingTop: 16, paddingBottom: 12 },
  filterChip: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  filterText: { fontSize: 13, fontWeight: '600' },
  histTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  histStats: { flexDirection: 'row', paddingVertical: 14 },
  histLabel: { fontSize: 12 },
  histValue: { fontSize: 15, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  histActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  histPrimary: { flex: 1, flexDirection: 'row', gap: 6, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  histPrimaryText: { fontSize: 13, fontWeight: '700' },
  histSecondary: { height: 42, paddingHorizontal: 16, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  histSecondaryText: { fontSize: 13, fontWeight: '600' },

  backdrop: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, width: '100%', maxWidth: 640, alignSelf: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 22, letterSpacing: -0.4 },
  sheetText: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  amountBox: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 66, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, marginTop: 16 },
  amountRupee: { fontSize: 22 },
  amountInput: { flex: 1, fontSize: 30, letterSpacing: -0.6, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  verdict: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 16, padding: 14, marginTop: 12 },
  verdictText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },

  menuHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  menuTitle: { fontSize: 17, fontWeight: '700' },
  menuGroup: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  menuLabel: { fontSize: 15, fontWeight: '600' },
  menuValue: { fontSize: 14, fontWeight: '600' },
  menuError: { fontSize: 13, fontWeight: '600', marginTop: 10 },
  limitBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12 },
  limitRupee: { fontSize: 16, fontWeight: '700' },
  limitInput: { flex: 1, fontSize: 17, fontWeight: '700', paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  limitSave: { height: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  limitSaveText: { fontSize: 14, fontWeight: '700' },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 56, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, marginTop: 12 },
});