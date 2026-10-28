// src/navigation/CreateBudgetScreen.tsx
//
// Two flows on one screen:
//  - New budget: monthly (pick a month, set an amount, optionally copy a past one)
//    or a trip/event with its own dates.
//  - Split a month (initialScope 'category'): share the month's budget across
//    categories, with a live bar of what's planned and what's left.
// Budget logic and saving are unchanged; the UI is new.

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform, ActivityIndicator, Modal } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Font from 'expo-font';
import { format, addDays, addMonths, endOfMonth, startOfMonth, isValid, parseISO } from 'date-fns';
import { useTheme, useBudgetStore, BudgetCustomCategory } from '../store';
import { BUDGET_DEBIT_CATEGORIES, getBudgetPeriodRange, getCategoryMeta, budgetService, getBudgetTemplateData } from '../services/budgetService';
import { CategoryIcon } from '../components/CategoryIcon';
import { getCategoryColor } from '../constants/categories';
import { DateTimePickerSheet } from '../components/DateTimePickerSheet';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

export interface CreateBudgetScreenProps {
  AppTopBarComponent?: React.ComponentType;
}

const CUSTOM_ICONS = ['airplane-outline', 'restaurant-outline', 'cart-outline', 'car-outline', 'film-outline', 'barbell-outline', 'gift-outline', 'wine-outline', 'paw-outline', 'book-outline', 'construct-outline', 'heart-outline', 'camera-outline', 'game-controller-outline', 'musical-notes-outline', 'wallet-outline'];
const CUSTOM_COLORS = ['#2B8A3E', '#1971C2', '#E8590C', '#E03131', '#6741D9', '#C2255C', '#0C8599', '#5C940D'];

const EVENT_PRESETS = [
  { id: 'trip', label: 'Trip', icon: 'airplane-outline', defaultName: 'Goa trip' },
  { id: 'wedding', label: 'Wedding', icon: 'heart-outline', defaultName: 'Wedding' },
  { id: 'festival', label: 'Festival', icon: 'sparkles-outline', defaultName: 'Diwali' },
  { id: 'party', label: 'Party', icon: 'wine-outline', defaultName: 'Birthday party' },
  { id: 'shopping', label: 'Big buy', icon: 'cart-outline', defaultName: 'New phone' },
  { id: 'roadtrip', label: 'Road trip', icon: 'car-outline', defaultName: 'Road trip' },
  { id: 'home', label: 'Home', icon: 'home-outline', defaultName: 'Home project' },
];

const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;

export const CreateBudgetScreen: React.FC<CreateBudgetScreenProps> = ({ AppTopBarComponent }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const heading = { fontFamily: display, fontWeight: display ? undefined : ('800' as const) };

  const budgets = useBudgetStore((s) => s.budgets);
  const customCategories = useBudgetStore((s) => s.customCategories || []);
  const addCustomCategory = useBudgetStore((s) => s.addCustomCategory);

  const isCategoryMode = route.params?.initialScope === 'category';

  const pastBudgets = useMemo(
    () => budgets.filter((b) => b.isOverall || b.periodType === 'custom_event' || (b.periodType !== 'monthly' && b.periodType !== undefined)),
    [budgets]
  );

  const [template, setTemplate] = useState<any>(() => (route.params?.cloneFromBudgetId ? budgets.find((b) => b.id === route.params.cloneFromBudgetId) || null : null));
  const [budgetType, setBudgetType] = useState<'monthly' | 'custom_event'>(route.params?.initialType === 'custom_event' ? 'custom_event' : 'monthly');
  const [monthlyDateMode, setMonthlyDateMode] = useState<'calendar' | 'custom_dates'>('calendar');

  /* ---------------- Months ---------------- */

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const m = addMonths(now, i);
      const key = format(m, 'MMMM yyyy');
      const hasBudget = budgets.some((b) => {
        if (!b.isOverall || (b.periodType && b.periodType !== 'monthly')) return false;
        const p = (b.period || '').toLowerCase().trim();
        const k = key.toLowerCase();
        if (p && (p.includes(k) || k.includes(p))) return true;
        return !!b.startDate && format(new Date(b.startDate), 'MMMM yyyy').toLowerCase() === k;
      });
      return { index: i, date: m, short: format(m, 'MMMM'), fullLabel: key, hasBudget, days: endOfMonth(m).getDate(), startDateStr: format(startOfMonth(m), 'yyyy-MM-dd'), endDateStr: format(endOfMonth(m), 'yyyy-MM-dd') };
    });
  }, [budgets]);

  const [monthIdx, setMonthIdx] = useState(() => {
    const p = route.params || {};
    const byLabel = (label?: string) => (label ? months.findIndex((m) => m.fullLabel.toLowerCase() === label.toLowerCase() || label.toLowerCase().includes(m.fullLabel.toLowerCase())) : -1);
    if (p.period) {
      const i = byLabel(p.period);
      if (i !== -1) return i;
    }
    if (p.parentBudgetId) {
      const parent = budgets.find((b) => b.id === p.parentBudgetId);
      if (parent) {
        const i = byLabel(format(parent.startDate ? new Date(parent.startDate) : new Date(), 'MMMM yyyy'));
        if (i !== -1) return i;
      }
    }
    if (p.targetDate) {
      const i = byLabel(format(new Date(p.targetDate), 'MMMM yyyy'));
      if (i !== -1) return i;
    }
    if (p.initialScope === 'category') return 0;
    const free = months.find((m) => !m.hasBudget);
    return free ? free.index : 0;
  });

  /* ---------------- Fields ---------------- */

  const [amountStr, setAmountStr] = useState('');
  const [budgetName, setBudgetName] = useState('');
  const [eventPreset, setEventPreset] = useState(EVENT_PRESETS[0].id);
  const [startDateStr, setStartDateStr] = useState(() =>
    route.params?.initialType === 'custom_event' ? format(addDays(new Date(), 10), 'yyyy-MM-dd') : months[monthIdx]?.startDateStr || format(startOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [endDateStr, setEndDateStr] = useState(() =>
    route.params?.initialType === 'custom_event' ? format(addDays(new Date(), 16), 'yyyy-MM-dd') : months[monthIdx]?.endDateStr || format(endOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [datePicker, setDatePicker] = useState<'start' | 'end' | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');

  // Category picker and custom category sheets
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('gift-outline');
  const [newCatColor, setNewCatColor] = useState(CUSTOM_COLORS[0]);

  /* ---------------- Parent budget (split mode) ---------------- */

  const parentBudget = useMemo(() => {
    const p = route.params || {};
    if (p.parentBudgetId) {
      const b = budgets.find((x) => x.id === p.parentBudgetId);
      if (b) return b;
    }
    if (p.period) {
      const b = budgets.find((x) => x.isOverall && (!x.periodType || x.periodType === 'monthly') && x.period === p.period);
      if (b) return b;
    }
    const sel = months[monthIdx];
    if (sel) {
      const b = budgets.find(
        (x) =>
          x.isOverall &&
          (!x.periodType || x.periodType === 'monthly') &&
          (x.period?.toLowerCase().includes(sel.fullLabel.toLowerCase()) || sel.fullLabel.toLowerCase().includes(x.period?.toLowerCase() || ''))
      );
      if (b) return b;
    }
    const now = Date.now();
    const active = budgets.find((b) => {
      if (!b.isOverall || (b.periodType && b.periodType !== 'monthly')) return false;
      const s = typeof b.startDate === 'number' ? b.startDate : new Date(b.startDate || 0).getTime();
      const e = typeof b.endDate === 'number' ? b.endDate : new Date(b.endDate || 0).getTime();
      return now >= s && now <= e;
    });
    if (active) return active;
    return budgets.filter((b) => b.isOverall && (!b.periodType || b.periodType === 'monthly')).sort((a, b) => (Number(a.startDate) || 0) - (Number(b.startDate) || 0))[0] || null;
  }, [budgets, route.params?.parentBudgetId, route.params?.period, monthIdx, months]);

  const existingCats = useMemo(() => {
    if (!parentBudget) return [];
    return budgets.filter(
      (b) => !b.isOverall && (!b.periodType || b.periodType === 'monthly') && (b.parentBudgetId === parentBudget.id || (!b.parentBudgetId && b.period === parentBudget.period))
    );
  }, [budgets, parentBudget]);

  const parentLimit = parentBudget?.limitAmount || 0;

  const defaultAmountFor = (current: Record<string, { amountStr: string }>) => {
    const used = Object.values(current).reduce((s, it) => s + (parseFloat(it.amountStr) || 0), 0);
    const rem = Math.max(500, parentLimit - used);
    return String(rem >= 1000 ? 1000 : rem);
  };

  const [allocations, setAllocations] = useState<Record<string, { id?: string; amountStr: string }>>(() => {
    const init: Record<string, { id?: string; amountStr: string }> = {};
    if (existingCats.length > 0) {
      existingCats.forEach((b) => (init[b.category] = { id: b.id, amountStr: String(b.limitAmount || 0) }));
      if (route.params?.initialCategory && !init[route.params.initialCategory]) init[route.params.initialCategory] = { amountStr: defaultAmountFor(init) };
    } else if (isCategoryMode) {
      init[route.params?.initialCategory || 'food'] = { amountStr: parentLimit > 0 ? String(Math.min(3000, Math.round(parentLimit * 0.3))) : '3000' };
    }
    return init;
  });

  // Keep split in sync with the parent's existing categories once they load
  useEffect(() => {
    if (!isCategoryMode || existingCats.length === 0) return;
    setAllocations((prev) => {
      if (existingCats.some((b) => !!prev[b.category])) return prev;
      const next: Record<string, { id?: string; amountStr: string }> = {};
      existingCats.forEach((b) => (next[b.category] = { id: b.id, amountStr: String(b.limitAmount || 0) }));
      if (route.params?.initialCategory && !next[route.params.initialCategory]) next[route.params.initialCategory] = { amountStr: defaultAmountFor(next) };
      return next;
    });
  }, [isCategoryMode, existingCats, parentLimit, route.params?.initialCategory]);

  /* ---------------- Templates ---------------- */

  const applyTemplate = (source: any) => {
    const tpl = getBudgetTemplateData(source, budgets);
    if (tpl.periodType === 'custom_event' || !source.isOverall) {
      setBudgetType('custom_event');
      setBudgetName(tpl.name || 'Event');
      setAmountStr(String(tpl.amount || ''));
    } else {
      setBudgetType('monthly');
      setAmountStr(String(tpl.amount || ''));
      if (tpl.subCategories?.length) {
        const a: Record<string, { amountStr: string }> = {};
        tpl.subCategories.forEach((sc: any) => (a[sc.category] = { amountStr: String(sc.limitAmount || 0) }));
        setAllocations(a);
      }
    }
  };

  const clearTemplate = () => {
    setTemplate(null);
    setAmountStr('');
    setBudgetName('');
    setAllocations({});
  };

  // Apply route params once on mount
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (route.params?.initialType === 'custom_event' && !budgetName) setBudgetName('Goa trip');
    if (route.params?.cloneFromBudgetId) {
      const found = budgets.find((b) => b.id === route.params.cloneFromBudgetId);
      if (found) {
        setTemplate(found);
        applyTemplate(found);
        let idx = -1;
        if (found.startDate) {
          const next = format(addMonths(new Date(found.startDate), 1), 'MMMM yyyy').toLowerCase();
          idx = months.findIndex((m) => m.fullLabel.toLowerCase() === next && !m.hasBudget);
        }
        if (idx === -1) idx = months.find((m) => !m.hasBudget)?.index ?? -1;
        if (idx !== -1) {
          setMonthIdx(idx);
          setStartDateStr(months[idx].startDateStr);
          setEndDateStr(months[idx].endDateStr);
        }
      }
    }
  }, []);

  /* ---------------- Derived ---------------- */

  const allCategories = useMemo(() => {
    const builtIn = BUDGET_DEBIT_CATEGORIES.filter((c: any) => !c.isOverall);
    const custom = customCategories.map((c) => ({ id: c.id, label: c.label, icon: c.icon, color: c.color, isOverall: false, isCustom: true }));
    return [...custom, ...builtIn];
  }, [customCategories]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? allCategories.filter((c: any) => c.label.toLowerCase().includes(q)) : allCategories;
  }, [allCategories, search]);

  const entries = useMemo(() => Object.entries(allocations), [allocations]);
  const allocSum = entries.reduce((s, [, it]) => s + (parseFloat(it.amountStr) || 0), 0);
  const leftToPlan = parentLimit - allocSum;
  const overPlan = leftToPlan < 0;

  const range = useMemo(() => {
    if (budgetType === 'custom_event') {
      const s = parseISO(startDateStr);
      const e = parseISO(endDateStr);
      const start = isValid(s) ? s : new Date();
      const end = isValid(e) && e >= start ? e : addDays(start, 5);
      return getBudgetPeriodRange('custom_event', new Date(), { start, end });
    }
    if (monthlyDateMode === 'custom_dates') {
      const s = parseISO(startDateStr);
      const e = parseISO(endDateStr);
      if (isValid(s) && isValid(e) && e >= s) return getBudgetPeriodRange('monthly', s, { start: s, end: e });
    }
    return getBudgetPeriodRange('monthly', (months[monthIdx] || months[0]).date);
  }, [budgetType, monthlyDateMode, monthIdx, months, startDateStr, endDateStr]);

  const amount = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;
  const perDay = amount > 0 && range.totalDays > 0 ? amount / range.totalDays : 0;
  const selectedMonth = months[monthIdx];
  const monthTaken = budgetType === 'monthly' && monthlyDateMode === 'calendar' && !!selectedMonth?.hasBudget;

  const metaFor = (catId: string) => getCategoryMeta(catId, false, customCategories.find((c) => c.id === catId));
  const colorFor = (catId: string) => {
    const custom = customCategories.find((c) => c.id === catId);
    return custom?.color || getCategoryColor(catId) || metaFor(catId).color || FOREST;
  };

  /* ---------------- Actions ---------------- */

  const setAlloc = (catId: string, v: string) => {
    setAllocations((p) => ({ ...p, [catId]: { ...p[catId], amountStr: v.replace(/[^0-9]/g, '') } }));
    if (errorText) setErrorText('');
  };
  const toggleCat = (catId: string) =>
    setAllocations((p) => {
      const n = { ...p };
      if (n[catId]) delete n[catId];
      else n[catId] = { amountStr: defaultAmountFor(n) };
      return n;
    });
  const removeCat = (catId: string) =>
    setAllocations((p) => {
      const n = { ...p };
      delete n[catId];
      return n;
    });

  const saveCustomCategory = () => {
    if (!newCatName.trim()) return;
    const id = 'custom_' + newCatName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36);
    const cat: BudgetCustomCategory = { id, label: newCatName.trim(), icon: newCatIcon, color: newCatColor };
    addCustomCategory(cat);
    setAllocations((p) => ({ ...p, [id]: { amountStr: '1000' } }));
    setNewCatName('');
    setCustomOpen(false);
  };

  const goBack = (params?: any) => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main', { screen: 'Budgets', params });
  };

  const saveSplit = async () => {
    if (entries.length === 0) return setErrorText('Add at least one category.');
    for (const [catId, it] of entries) {
      if (!(parseFloat(it.amountStr) > 0)) return setErrorText(`Give ${metaFor(catId).label} an amount.`);
    }
    if (parentLimit > 0 && allocSum > parentLimit) return setErrorText(`That’s ${inr(allocSum - parentLimit)} more than your ${inr(parentLimit)} budget.`);

    setSaving(true);
    setErrorText('');
    try {
      const toTime = (v: any) => (typeof v === 'number' ? v : new Date(v).getTime());
      const startDate = parentBudget?.startDate ? toTime(parentBudget.startDate) : range.startDate;
      const endDate = parentBudget?.endDate ? toTime(parentBudget.endDate) : range.endDate;
      const period = parentBudget?.period || format(startDate, 'MMMM yyyy');
      const kept = new Set<string>();

      for (const [catId, it] of entries) {
        const amt = parseFloat(it.amountStr);
        const customDef = customCategories.find((c) => c.id === catId);
        const label = metaFor(catId).label;
        if (it.id) {
          await budgetService.updateBudget(it.id, { limitAmount: amt, name: label });
          kept.add(it.id);
        } else {
          const created = await budgetService.createBudget({
            name: label,
            category: catId,
            limitAmount: amt,
            period,
            periodType: 'monthly',
            startDate,
            endDate,
            isOverall: false,
            parentBudgetId: parentBudget ? parentBudget.id : undefined,
            customCategoryDef: customDef,
          });
          if (created?.id) kept.add(created.id);
        }
      }
      for (const b of existingCats) if (!kept.has(b.id)) await budgetService.deleteBudget(b.id);
      goBack({ openTab: 'monthly' });
    } catch (e: any) {
      setErrorText(e?.message || 'Couldn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveBudget = async () => {
    if (!(amount > 0)) return setErrorText('Enter how much you can spend.');
    setSaving(true);
    setErrorText('');
    try {
      if (budgetType === 'monthly') {
        const period = format(range.startDate, 'MMMM yyyy');
        const exists = budgets.find(
          (b) =>
            b.isOverall &&
            (!b.periodType || b.periodType === 'monthly') &&
            (b.period?.toLowerCase().trim() === period.toLowerCase() || (b.startDate && format(new Date(b.startDate), 'MMMM yyyy').toLowerCase() === period.toLowerCase()))
        );
        if (exists) throw new Error(`${period} already has a budget. Pick another month, or change it from Budgets.`);
        if (allocSum > amount) throw new Error(`The copied categories add up to ${inr(allocSum)}, more than ${inr(amount)}. Raise the amount or remove some.`);

        const created = await budgetService.createBudget({
          name: budgetName.trim() || `Monthly budget (${period})`,
          category: 'all',
          limitAmount: amount,
          period,
          periodType: 'monthly',
          startDate: range.startDate,
          endDate: range.endDate,
          isOverall: true,
          customCategoryDef: undefined,
        });

        if (entries.length > 0 && created?.id) {
          const subs = entries
            .filter(([, it]) => parseFloat(it.amountStr) > 0)
            .map(([catId, it]) => ({
              name: metaFor(catId).label,
              category: catId,
              limitAmount: parseFloat(it.amountStr),
              period,
              periodType: 'monthly' as const,
              startDate: range.startDate,
              endDate: range.endDate,
              isOverall: false,
              parentBudgetId: created.id,
              customCategoryDef: customCategories.find((c) => c.id === catId),
            }));
          if (subs.length) await budgetService.createBudgetsBatch(subs);
        }
        goBack({ openTab: 'monthly', selectedBudgetId: created?.id });
      } else {
        const name = budgetName.trim() || 'Event budget';
        const preset = EVENT_PRESETS.find((p) => p.id === eventPreset);
        await budgetService.createBudget({
          name,
          category: 'other_expense',
          limitAmount: amount,
          period: range.label,
          periodType: 'custom_event',
          startDate: range.startDate,
          endDate: range.endDate,
          isOverall: false,
          customCategoryDef: { id: 'event_' + (preset?.id || 'trip'), label: name, icon: preset?.icon || 'airplane-outline', color: FOREST },
        });
        goBack({ openTab: 'events' });
      }
    } catch (e: any) {
      setErrorText(e?.message || 'Couldn’t create the budget. Try again.');
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- Theme ---------------- */

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const field = isDark ? colors.border : '#DCE5E0';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const accentInk = isDark ? FOREST : '#FFFFFF';
  const green = isDark ? LIME : '#0B6B3A';
  const red = isDark ? '#FFA8A8' : '#C92A2A';
  const soft = isDark ? 'rgba(184,243,107,0.12)' : '#E3F2E8';

  /* ---------------- Pieces (called as functions so inputs keep focus) ---------------- */

  const catTile = (catId: string, size = 40) => {
    const custom = customCategories.find((c) => c.id === catId);
    if (custom) {
      return (
        <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: `${custom.color}22`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={custom.icon as any} size={size * 0.45} color={custom.color} />
        </View>
      );
    }
    return <CategoryIcon category={catId} variant="soft" size={size} />;
  };

  const label = (t: string) => <Text style={[s.label, { color: muted }]}>{t}</Text>;

  const amountField = (placeholder: string) => (
    <>
      <View style={[s.amountBox, { backgroundColor: surface, borderColor: amount > 0 ? accent : field, borderWidth: amount > 0 ? 2 : 1 }]}>
        <Text style={[s.rupee, { color: muted }, heading]}>₹</Text>
        <TextInput
          value={amountStr ? Number(amountStr.replace(/[^0-9]/g, '') || 0).toLocaleString('en-IN') : ''}
          onChangeText={(t) => {
            setAmountStr(t.replace(/[^0-9]/g, ''));
            if (errorText) setErrorText('');
          }}
          placeholder={placeholder}
          placeholderTextColor={muted}
          keyboardType="number-pad"
          style={[s.amountInput, { color: ink }, heading]}
          accessibilityLabel="Budget amount"
        />
      </View>
      <View style={s.chipRow}>
        {(budgetType === 'monthly' ? [1000, 5000, 10000] : [2000, 5000, 20000]).map((n) => (
          <Pressable key={n} onPress={() => setAmountStr(String(amount + n))} style={[s.smallChip, { backgroundColor: surface, borderColor: field }]}>
            <Text style={[s.smallChipText, { color: ink }]}>+{inr(n)}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  const dateRow = (which: 'start' | 'end') => {
    const v = parseISO(which === 'start' ? startDateStr : endDateStr);
    return (
      <Pressable onPress={() => setDatePicker(which)} style={[s.dateBox, { backgroundColor: surface, borderColor: field }]} accessibilityLabel={which === 'start' ? 'Start date' : 'End date'}>
        <Text style={[s.dateLabel, { color: muted }]}>{which === 'start' ? 'From' : 'To'}</Text>
        <Text style={[s.dateValue, { color: ink }]}>{isValid(v) ? format(v, 'd MMM yyyy') : 'Pick'}</Text>
      </Pressable>
    );
  };

  /* ---------------- Split flow ---------------- */

  const renderSplit = () => (
    <>
      <Animated.View entering={FadeInDown.duration(380)} style={s.hero}>
        <View pointerEvents="none" style={s.heroRing} />
        <Text style={s.heroLabel}>{parentBudget?.period || format(range.startDate, 'MMMM yyyy')} budget</Text>
        <Text style={[s.heroAmount, heading]}>{inr(parentLimit)}</Text>
        <View style={s.barTrack}>
          {entries.map(([catId, it]) => {
            const v = parseFloat(it.amountStr) || 0;
            const pct = parentLimit > 0 ? (v / Math.max(parentLimit, allocSum)) * 100 : 0;
            return pct > 0 ? <Animated.View key={catId} layout={LinearTransition.duration(250)} style={{ width: `${pct}%`, backgroundColor: colorFor(catId) }} /> : null;
          })}
        </View>
        <View style={s.heroStats}>
          <View style={{ flex: 1 }}>
            <Text style={s.statLabel}>Planned</Text>
            <Text style={s.statValue}>{inr(allocSum)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.statLabel}>{overPlan ? 'Over by' : 'Left to plan'}</Text>
            <Text style={[s.statValue, { color: overPlan ? '#FFB4A2' : LIME }]}>{inr(leftToPlan)}</Text>
          </View>
        </View>
      </Animated.View>

      <View style={s.sectionHead}>
        <Text style={[s.sectionTitle, { color: ink }]}>Categories</Text>
        <Pressable onPress={() => setPickerOpen(true)} hitSlop={10}>
          <Text style={[s.link, { color: green }]}>Add</Text>
        </Pressable>
      </View>

      {entries.length > 0 && (
        <View style={[s.group, { backgroundColor: surface, borderColor: line }]}>
          {entries.map(([catId, it], i) => {
            const v = parseFloat(it.amountStr) || 0;
            const share = parentLimit > 0 ? Math.round((v / parentLimit) * 100) : 0;
            return (
              <Animated.View key={catId} entering={FadeIn.duration(220)} layout={LinearTransition.duration(220)} style={[s.catRow, i < entries.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}>
                {catTile(catId)}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.catName, { color: ink }]} numberOfLines={1}>{metaFor(catId).label}</Text>
                  <Text style={[s.catSub, { color: muted }]}>{share}% of budget</Text>
                </View>
                <View style={[s.catAmount, { borderColor: !(v > 0) ? red : field }]}>
                  <Text style={[s.catRupee, { color: muted }]}>₹</Text>
                  <TextInput
                    value={it.amountStr}
                    onChangeText={(t) => setAlloc(catId, t)}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={muted}
                    style={[s.catInput, { color: ink }, heading]}
                    accessibilityLabel={`${metaFor(catId).label} amount`}
                  />
                </View>
                <Pressable onPress={() => removeCat(catId)} hitSlop={10} accessibilityLabel={`Remove ${metaFor(catId).label}`}>
                  <Feather name="x" size={16} color={muted} />
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      )}

      <Pressable onPress={() => setPickerOpen(true)} style={[s.addRow, { borderColor: field, marginTop: entries.length ? 12 : 0 }]}>
        <Feather name="plus" size={16} color={ink} />
        <Text style={[s.addRowText, { color: ink }]}>{entries.length ? 'Add a category' : 'Choose categories to plan'}</Text>
      </Pressable>

      {leftToPlan > 0 && entries.length > 0 && (
        <Text style={[s.hint, { color: muted }]}>Anything you don’t plan stays free for spending on other things.</Text>
      )}
    </>
  );

  /* ---------------- New budget flow ---------------- */

  const renderNew = () => (
    <>
      <View style={[s.segment, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E9EFEB' }]}>
        {(['monthly', 'custom_event'] as const).map((t) => {
          const on = budgetType === t;
          return (
            <Pressable
              key={t}
              onPress={() => {
                setBudgetType(t);
                setErrorText('');
                if (t === 'monthly') {
                  setStartDateStr(selectedMonth.startDateStr);
                  setEndDateStr(selectedMonth.endDateStr);
                } else {
                  if (!budgetName.trim()) setBudgetName(EVENT_PRESETS[0].defaultName);
                  setStartDateStr(format(addDays(new Date(), 10), 'yyyy-MM-dd'));
                  setEndDateStr(format(addDays(new Date(), 16), 'yyyy-MM-dd'));
                }
              }}
              style={[s.segBtn, on && { backgroundColor: isDark ? '#1E3329' : '#FFFFFF' }, on && !isDark && s.segShadow]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
            >
              <Text style={[s.segText, { color: on ? ink : muted }, on && { fontWeight: '700' }]}>{t === 'monthly' ? 'Monthly' : 'Trip or event'}</Text>
            </Pressable>
          );
        })}
      </View>

      {budgetType === 'monthly' ? (
        <Animated.View key="monthly" entering={FadeIn.duration(220)}>
          {label('Which month')}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.monthRow}>
            {months.map((m) => {
              const on = monthlyDateMode === 'calendar' && monthIdx === m.index;
              return (
                <Pressable
                  key={m.fullLabel}
                  onPress={() => {
                    setMonthlyDateMode('calendar');
                    setMonthIdx(m.index);
                    setStartDateStr(m.startDateStr);
                    setEndDateStr(m.endDateStr);
                    setErrorText('');
                  }}
                  style={[s.monthChip, on ? { backgroundColor: accent } : { backgroundColor: surface, borderColor: field, borderWidth: 1 }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.monthName, { color: on ? accentInk : ink }]}>{m.short}</Text>
                  <Text style={[s.monthSub, { color: on ? (isDark ? FOREST : LIME) : m.hasBudget ? red : muted }]}>{m.hasBudget ? 'Has budget' : `${m.days} days`}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setMonthlyDateMode('custom_dates')}
              style={[s.monthChip, monthlyDateMode === 'custom_dates' ? { backgroundColor: accent } : { backgroundColor: surface, borderColor: field, borderWidth: 1 }]}
            >
              <Text style={[s.monthName, { color: monthlyDateMode === 'custom_dates' ? accentInk : ink }]}>Custom</Text>
              <Text style={[s.monthSub, { color: monthlyDateMode === 'custom_dates' ? (isDark ? FOREST : LIME) : muted }]}>Pick dates</Text>
            </Pressable>
          </ScrollView>

          {monthlyDateMode === 'custom_dates' && (
            <Animated.View entering={FadeIn.duration(200)} style={s.dateRow}>
              {dateRow('start')}
              {dateRow('end')}
            </Animated.View>
          )}

          {monthTaken && (
            <View style={[s.notice, { backgroundColor: isDark ? 'rgba(224,49,49,0.14)' : '#FFF0F0' }]}>
              <Text style={[s.noticeText, { color: ink }]}>
                <Text style={{ fontWeight: '700' }}>{selectedMonth.short} already has a budget.</Text> Pick another month, or change it from Budgets.
              </Text>
            </View>
          )}

          {label('How much can you spend')}
          {amountField('0')}

          {perDay > 0 && (
            <Animated.View entering={FadeIn.duration(200)} style={[s.perDay, { backgroundColor: soft }]}>
              <Text style={[s.perDayText, { color: ink }]}>
                That’s about <Text style={{ fontWeight: '700' }}>{inr(perDay)} a day</Text> for {monthlyDateMode === 'calendar' ? selectedMonth.short : range.label}.
              </Text>
            </Animated.View>
          )}
        </Animated.View>
      ) : (
        <Animated.View key="event" entering={FadeIn.duration(220)}>
          {label('What for')}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            {EVENT_PRESETS.map((p) => {
              const on = eventPreset === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    setEventPreset(p.id);
                    if (!budgetName.trim() || EVENT_PRESETS.some((x) => x.defaultName === budgetName)) setBudgetName(p.defaultName);
                  }}
                  style={[s.presetChip, on ? { backgroundColor: accent, borderColor: accent } : { backgroundColor: surface, borderColor: field }]}
                >
                  <Ionicons name={p.icon as any} size={16} color={on ? accentInk : ink} />
                  <Text style={[s.presetText, { color: on ? accentInk : ink }, on && { fontWeight: '700' }]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {label('Name')}
          <View style={[s.textBox, { backgroundColor: surface, borderColor: field }]}>
            <TextInput value={budgetName} onChangeText={setBudgetName} placeholder="Like Goa trip" placeholderTextColor={muted} style={[s.textInput, { color: ink }]} />
          </View>

          {label('When')}
          <View style={s.dateRow}>
            {dateRow('start')}
            {dateRow('end')}
          </View>

          {label('Budget')}
          {amountField('0')}

          {perDay > 0 && (
            <Animated.View entering={FadeIn.duration(200)} style={[s.perDay, { backgroundColor: soft }]}>
              <Text style={[s.perDayText, { color: ink }]}>
                <Text style={{ fontWeight: '700' }}>{inr(perDay)} a day</Text> over {range.totalDays} day{range.totalDays === 1 ? '' : 's'}.
              </Text>
            </Animated.View>
          )}
        </Animated.View>
      )}

      {/* Start from a past budget */}
      {pastBudgets.length > 0 && (
        <>
          {label('Start from')}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
            <Pressable onPress={clearTemplate} style={[s.tplChip, !template ? { borderColor: accent, borderWidth: 2 } : { borderColor: field }, { backgroundColor: surface }]}>
              {!template && <Feather name="check" size={14} color={accent} />}
              <Text style={[s.tplText, { color: ink }, !template && { fontWeight: '700' }]}>Scratch</Text>
            </Pressable>
            {pastBudgets.map((b) => {
              const on = template?.id === b.id;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => {
                    setTemplate(b);
                    applyTemplate(b);
                  }}
                  style={[s.tplChip, on ? { borderColor: accent, borderWidth: 2 } : { borderColor: field }, { backgroundColor: surface }]}
                >
                  {on && <Feather name="check" size={14} color={accent} />}
                  <Text style={[s.tplText, { color: ink }, on && { fontWeight: '700' }]} numberOfLines={1}>
                    {(b.isOverall ? (b.period || '').split(' ')[0] : b.name) || 'Budget'}, {inr(b.limitAmount || 0)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {template && budgetType === 'monthly' && entries.length > 0 && (
            <Text style={[s.hint, { color: muted, textAlign: 'left', paddingHorizontal: 4 }]}>
              Copies {entries.length} categor{entries.length === 1 ? 'y' : 'ies'} too:{' '}
              {entries.map(([c]) => metaFor(c).label).slice(0, 3).join(', ')}
              {entries.length > 3 ? ` and ${entries.length - 3} more` : ''}.
            </Text>
          )}
        </>
      )}
    </>
  );

  /* ---------------- Footer label ---------------- */

  const ctaLabel = isCategoryMode
    ? entries.length === 0
      ? 'Add a category first'
      : overPlan
        ? `Over by ${inr(leftToPlan)}`
        : `Save ${entries.length} categor${entries.length === 1 ? 'y' : 'ies'}`
    : budgetType === 'monthly'
      ? `Create ${monthlyDateMode === 'calendar' ? selectedMonth.short + ' ' : ''}budget`
      : `Create ${budgetName.trim() || 'event'} budget`;
  const ctaDisabled = saving || (isCategoryMode ? entries.length === 0 || overPlan : monthTaken || !(amount > 0));

  /* ---------------- Render ---------------- */

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: pageBg }}>
      {AppTopBarComponent && <AppTopBarComponent />}

      <View style={[s.header, { paddingTop: AppTopBarComponent ? 12 : insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} style={[s.roundBtn, { backgroundColor: surface }]} accessibilityLabel="Back">
          <Feather name="arrow-left" size={20} color={ink} />
        </Pressable>
        <Text style={[s.headerTitle, { color: ink }]}>
          {isCategoryMode ? `Split ${(parentBudget?.period || format(range.startDate, 'MMMM yyyy')).split(' ')[0]}` : 'New budget'}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {isCategoryMode ? renderSplit() : renderNew()}
      </ScrollView>

      <View style={[s.footer, { borderTopColor: line, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        {errorText ? (
          <Animated.View entering={FadeIn.duration(200)} style={s.errorRow}>
            <Feather name="alert-circle" size={14} color={red} />
            <Text style={[s.errorText, { color: red }]}>{errorText}</Text>
          </Animated.View>
        ) : null}
        <Pressable
          onPress={isCategoryMode ? saveSplit : saveBudget}
          disabled={ctaDisabled}
          style={({ pressed }) => [s.cta, { backgroundColor: overPlan && isCategoryMode ? '#E03131' : accent, opacity: ctaDisabled && !saving ? 0.5 : 1 }, pressed && !ctaDisabled && { transform: [{ scale: 0.98 }] }]}
          accessibilityRole="button"
        >
          {saving ? <ActivityIndicator color={accentFg} /> : <Text style={[s.ctaText, { color: overPlan && isCategoryMode ? '#FFFFFF' : accentFg }]}>{ctaLabel}</Text>}
        </Pressable>
      </View>

      {/* Dates */}
      <DateTimePickerSheet
        visible={datePicker !== null}
        mode="date"
        title={datePicker === 'start' ? 'Start date' : 'End date'}
        value={parseISO(datePicker === 'end' ? endDateStr : startDateStr)}
        minimumDate={datePicker === 'end' ? parseISO(startDateStr) : undefined}
        onClose={() => setDatePicker(null)}
        onConfirm={(d) => {
          const str = format(d, 'yyyy-MM-dd');
          if (datePicker === 'start') {
            setStartDateStr(str);
            const end = parseISO(endDateStr);
            if (isValid(end) && end < d) setEndDateStr(format(addDays(d, 5), 'yyyy-MM-dd'));
          } else setEndDateStr(str);
          setDatePicker(null);
        }}
      />

      {/* Category picker */}
      <Modal visible={pickerOpen} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setPickerOpen(false)}>
        <View style={s.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerOpen(false)} accessibilityLabel="Close" />
          <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
            <View style={[s.sheet, { backgroundColor: surface, paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
              <View style={[s.grabber, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#D5DED9' }]} />
              <Text style={[s.sheetTitle, { color: ink }, heading]}>Choose categories</Text>
              <View style={[s.search, { backgroundColor: pageBg, borderColor: field }]}>
                <Feather name="search" size={16} color={muted} />
                <TextInput value={search} onChangeText={setSearch} placeholder="Search, like rent or gym" placeholderTextColor={muted} style={[s.searchInput, { color: ink }]} />
              </View>
              <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={s.grid} keyboardShouldPersistTaps="handled">
                {filteredCategories.map((c: any) => {
                  const on = !!allocations[c.id];
                  return (
                    <Pressable key={c.id} onPress={() => toggleCat(c.id)} style={s.gridItem} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={c.label}>
                      <View>
                        {catTile(c.id, 52)}
                        {on && (
                          <View style={[s.gridCheck, { backgroundColor: LIME, borderColor: surface }]}>
                            <Feather name="check" size={11} color={FOREST} />
                          </View>
                        )}
                      </View>
                      <Text style={[s.gridLabel, { color: ink }, on && { fontWeight: '700' }]} numberOfLines={1}>{c.label}</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => {
                    setPickerOpen(false);
                    setCustomOpen(true);
                  }}
                  style={s.gridItem}
                >
                  <View style={[s.newTile, { borderColor: isDark ? 'rgba(255,255,255,0.3)' : '#9DB2A7' }]}>
                    <Feather name="plus" size={20} color={accent} />
                  </View>
                  <Text style={[s.gridLabel, { color: ink }]}>New</Text>
                </Pressable>
              </ScrollView>
              <Pressable onPress={() => setPickerOpen(false)} style={[s.cta, { backgroundColor: accent, marginTop: 12 }]}>
                <Text style={[s.ctaText, { color: accentFg }]}>Done{entries.length ? `, ${entries.length} chosen` : ''}</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* New category */}
      <Modal visible={customOpen} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setCustomOpen(false)}>
        <View style={s.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCustomOpen(false)} accessibilityLabel="Close" />
          <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
            <View style={[s.sheet, { backgroundColor: surface, paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
              <View style={[s.grabber, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#D5DED9' }]} />
              <View style={s.newHead}>
                <View style={{ width: 52, height: 52, borderRadius: 17, backgroundColor: `${newCatColor}22`, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={newCatIcon as any} size={24} color={newCatColor} />
                </View>
                <Text style={[s.sheetTitle, { color: ink, flex: 1 }, heading]} numberOfLines={1}>{newCatName.trim() || 'New category'}</Text>
              </View>
              <View style={[s.textBox, { backgroundColor: pageBg, borderColor: field, marginTop: 14 }]}>
                <TextInput value={newCatName} onChangeText={setNewCatName} placeholder="Name, like Gym or Snacks" placeholderTextColor={muted} autoFocus style={[s.textInput, { color: ink }]} />
              </View>
              {label('Icon')}
              <View style={s.iconGrid}>
                {CUSTOM_ICONS.map((i) => {
                  const on = newCatIcon === i;
                  return (
                    <Pressable key={i} onPress={() => setNewCatIcon(i)} style={[s.iconChoice, on ? { backgroundColor: newCatColor } : { backgroundColor: pageBg }]} accessibilityLabel={i.replace('-outline', '')}>
                      <Ionicons name={i as any} size={20} color={on ? '#FFFFFF' : ink} />
                    </Pressable>
                  );
                })}
              </View>
              {label('Colour')}
              <View style={s.colorRow}>
                {CUSTOM_COLORS.map((c) => (
                  <Pressable key={c} onPress={() => setNewCatColor(c)} style={[s.colorDot, { backgroundColor: c }, newCatColor === c && { borderWidth: 3, borderColor: isDark ? '#FFFFFF' : FOREST }]} accessibilityLabel={`Colour ${c}`}>
                    {newCatColor === c && <Feather name="check" size={16} color="#FFFFFF" />}
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={saveCustomCategory} disabled={!newCatName.trim()} style={[s.cta, { backgroundColor: accent, marginTop: 18, opacity: newCatName.trim() ? 1 : 0.5 }]}>
                <Text style={[s.ctaText, { color: accentFg }]}>Add category</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  label: { fontSize: 13, fontWeight: '700', paddingHorizontal: 4, paddingTop: 20, paddingBottom: 10 },
  segment: { flexDirection: 'row', borderRadius: 14, padding: 4, marginTop: 12 },
  segBtn: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segShadow: { shadowColor: '#0B1F17', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 1 },
  segText: { fontSize: 14, fontWeight: '600' },

  monthRow: { gap: 8 },
  monthChip: { height: 54, paddingHorizontal: 16, borderRadius: 16, justifyContent: 'center' },
  monthName: { fontSize: 14, fontWeight: '700' },
  monthSub: { fontSize: 11, marginTop: 1 },
  dateRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  dateBox: { flex: 1, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  dateLabel: { fontSize: 12 },
  dateValue: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  notice: { borderRadius: 16, padding: 12, marginTop: 12 },
  noticeText: { fontSize: 13, lineHeight: 18 },

  amountBox: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 76, borderRadius: 20, paddingHorizontal: 18 },
  rupee: { fontSize: 26 },
  amountInput: { flex: 1, fontSize: 38, letterSpacing: -1, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  chipRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  smallChip: { height: 34, paddingHorizontal: 12, borderRadius: 17, borderWidth: 1, justifyContent: 'center' },
  smallChipText: { fontSize: 13, fontWeight: '600' },
  perDay: { borderRadius: 18, padding: 14, marginTop: 14 },
  perDayText: { fontSize: 14, lineHeight: 20 },

  presetChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  presetText: { fontSize: 13, fontWeight: '600' },
  textBox: { height: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center' },
  textInput: { fontSize: 15, fontWeight: '600', paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  tplChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, maxWidth: 220 },
  tplText: { fontSize: 13, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17, textAlign: 'center', paddingTop: 10 },

  hero: { marginTop: 10, borderRadius: 28, backgroundColor: FOREST, padding: 20, overflow: 'hidden' },
  heroRing: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 1, borderColor: 'rgba(184,243,107,0.16)', right: -80, top: -100 },
  heroLabel: { color: '#B5CEC1', fontSize: 13 },
  heroAmount: { color: '#FFFFFF', fontSize: 40, letterSpacing: -1.2, marginTop: 4, fontVariant: ['tabular-nums'] },
  barTrack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2, marginTop: 16, backgroundColor: 'rgba(255,255,255,0.12)' },
  heroStats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statLabel: { color: '#B5CEC1', fontSize: 12 },
  statValue: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 22, paddingBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  link: { fontSize: 13, fontWeight: '600' },
  group: { borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  catName: { fontSize: 15, fontWeight: '600' },
  catSub: { fontSize: 12, marginTop: 2 },
  catAmount: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 108, height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12 },
  catRupee: { fontSize: 14, fontWeight: '700' },
  catInput: { flex: 1, fontSize: 17, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed' },
  addRowText: { fontSize: 14, fontWeight: '600' },

  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600' },
  cta: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },

  backdrop: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, width: '100%', maxWidth: 640, alignSelf: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 22, letterSpacing: -0.4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, marginTop: 14, marginBottom: 6 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 8 },
  gridItem: { width: '25%', alignItems: 'center', gap: 6, paddingVertical: 8 },
  gridCheck: { position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  gridLabel: { fontSize: 12, fontWeight: '600', maxWidth: 76, textAlign: 'center' },
  newTile: { width: 52, height: 52, borderRadius: 17, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },

  newHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconChoice: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});