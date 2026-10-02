import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  format,
  addDays,
  addMonths,
  endOfMonth,
  startOfMonth,
  isValid,
  parseISO,
} from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  useTheme,
  useBudgetStore,
  BudgetCustomCategory,
} from '../store';
import {
  BUDGET_DEBIT_CATEGORIES,
  getBudgetPeriodRange,
  getCategoryMeta,
  budgetService,
  getBudgetTemplateData,
} from '../services/budgetService';
import { CalendarDatePickerModal } from '../components/CalendarDatePickerModal';

export interface CreateBudgetScreenProps {
  AppTopBarComponent?: React.ComponentType;
}

const CUSTOM_ICONS = [
  'airplane-outline',
  'restaurant-outline',
  'cart-outline',
  'car-outline',
  'film-outline',
  'barbell-outline',
  'gift-outline',
  'wine-outline',
  'paw-outline',
  'book-outline',
  'construct-outline',
  'heart-outline',
  'camera-outline',
  'game-controller-outline',
  'musical-notes-outline',
  'wallet-outline',
];

const CUSTOM_COLORS = [
  '#2dba4e',
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#10b981',
];

const EVENT_PRESETS = [
  { id: 'trip', label: 'Vacation / Trip', icon: 'airplane-outline', defaultName: 'Goa Trip' },
  { id: 'wedding', label: 'Wedding', icon: 'heart-outline', defaultName: 'Wedding Budget' },
  { id: 'festival', label: 'Festival', icon: 'sparkles-outline', defaultName: 'Diwali Budget' },
  { id: 'party', label: 'Celebration', icon: 'wine-outline', defaultName: 'Birthday Party' },
  { id: 'shopping', label: 'Big Purchase', icon: 'cart-outline', defaultName: 'Shopping Spree' },
  { id: 'roadtrip', label: 'Road Trip', icon: 'car-outline', defaultName: 'Road Trip' },
  { id: 'home', label: 'Home Project', icon: 'home-outline', defaultName: 'Home Renovation' },
];

export const CreateBudgetScreen: React.FC<CreateBudgetScreenProps> = ({ AppTopBarComponent }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark } = useTheme();

  const budgets = useBudgetStore((state) => state.budgets);
  const customCategories = useBudgetStore((state) => state.customCategories || []);
  const addCustomCategory = useBudgetStore((state) => state.addCustomCategory);

  const allOverallAndEventBudgets = useMemo(() => {
    return budgets.filter(
      (b) => b.isOverall || b.periodType === 'custom_event' || (b.periodType !== 'monthly' && b.periodType !== undefined)
    );
  }, [budgets]);

  const [activeTemplateBudget, setActiveTemplateBudget] = useState<any>(() => {
    if (route.params?.cloneFromBudgetId) {
      return budgets.find((b) => b.id === route.params.cloneFromBudgetId) || null;
    }
    return null;
  });

  const applyBudgetTemplate = (source: any) => {
    const tpl = getBudgetTemplateData(source, budgets);
    if (tpl.periodType === 'custom_event' || !source.isOverall) {
      setBudgetType('custom_event');
      setBudgetName(tpl.name || 'Special Event');
      setAmountStr(String(tpl.amount || ''));
    } else {
      setBudgetType('monthly');
      setAmountStr(String(tpl.amount || ''));
      if (tpl.subCategories && tpl.subCategories.length > 0) {
        const newAllocs: Record<string, { id?: string; amountStr: string }> = {};
        tpl.subCategories.forEach((sc) => {
          newAllocs[sc.category] = { amountStr: String(sc.limitAmount || 0) };
        });
        setAllocations(newAllocs);
      }
    }
  };

  // 1. Duration Type: 'monthly' vs 'custom_event'
  const [budgetType, setBudgetType] = useState<'monthly' | 'custom_event'>(() => {
    return route.params?.initialType === 'custom_event' ? 'custom_event' : 'monthly';
  });

  // 2. Monthly Date Mode: 'calendar' vs 'custom_dates'
  const [monthlyDateMode, setMonthlyDateMode] = useState<'calendar' | 'custom_dates'>('calendar');

  // Next 6 Months computation
  const next6Months = useMemo(() => {
    const now = new Date();
    const list = [];
    for (let i = 0; i < 6; i++) {
      const m = addMonths(now, i);
      const monthKey = format(m, 'MMMM yyyy');
      const hasBudget = budgets.some(
        (b) => b.isOverall && (!b.periodType || b.periodType === 'monthly') && b.period?.includes(monthKey)
      );
      list.push({
        index: i,
        date: m,
        label: format(m, 'MMM yyyy'),
        fullLabel: monthKey,
        hasBudget,
        startDateStr: format(startOfMonth(m), 'yyyy-MM-dd'),
        endDateStr: format(endOfMonth(m), 'yyyy-MM-dd'),
      });
    }
    return list;
  }, [budgets]);

  // Default month selection: if current month already has a budget, default to next month!
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(() => {
    const now = new Date();
    const currentMonthKey = format(now, 'MMMM yyyy');
    const currentHasBudget = budgets.some(
      (b) => b.isOverall && (!b.periodType || b.periodType === 'monthly') && b.period?.includes(currentMonthKey)
    );
    return currentHasBudget ? 1 : 0;
  });

  const [monthDropdownOpen, setMonthDropdownOpen] = useState(false);

  // 3. Category Mode vs New Budget
  const isCategoryMode = route.params?.initialScope === 'category';

  // 4. Form Fields
  const [selectedCategory, setSelectedCategory] = useState('food');
  const [amountStr, setAmountStr] = useState('');
  const [budgetName, setBudgetName] = useState('');

  // 5. Special Event Preset
  const [selectedEventPreset, setSelectedEventPreset] = useState(EVENT_PRESETS[0].id);

  // 6. Dates
  const [startDateStr, setStartDateStr] = useState(() => {
    if (route.params?.initialType === 'custom_event') {
      return format(addDays(new Date(), 10), 'yyyy-MM-dd');
    }
    const defaultMonth = next6Months[selectedMonthIndex] || next6Months[0];
    return defaultMonth?.startDateStr || format(startOfMonth(new Date()), 'yyyy-MM-dd');
  });

  const [endDateStr, setEndDateStr] = useState(() => {
    if (route.params?.initialType === 'custom_event') {
      return format(addDays(new Date(), 16), 'yyyy-MM-dd');
    }
    const defaultMonth = next6Months[selectedMonthIndex] || next6Months[0];
    return defaultMonth?.endDateStr || format(endOfMonth(new Date()), 'yyyy-MM-dd');
  });

  // Calendar Modal Picker State
  const [calendarPickerTarget, setCalendarPickerTarget] = useState<'start' | 'end' | null>(null);

  // Sync route params when component updates
  useEffect(() => {
    if (route.params?.initialType) {
      setBudgetType(route.params.initialType);
      if (route.params.initialType === 'custom_event') {
        if (!budgetName) setBudgetName('Goa Trip');
      }
    }
    if (route.params?.cloneFromBudgetId) {
      const found = budgets.find((b) => b.id === route.params.cloneFromBudgetId);
      if (found) {
        setActiveTemplateBudget(found);
        applyBudgetTemplate(found);
      }
    }
  }, [route.params?.initialType, route.params?.cloneFromBudgetId, budgets]);

  // Custom Category Creation Modal
  const [customCatModalVisible, setCustomCatModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('gift-outline');
  const [newCatColor, setNewCatColor] = useState('#2dba4e');

  const [saving, setSaving] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [categoryPickerModalVisible, setCategoryPickerModalVisible] = useState(false);

  // Built-in Top 30 Categories + User Custom
  const allCategories = useMemo(() => {
    const builtIn = BUDGET_DEBIT_CATEGORIES.filter((c) => !c.isOverall);
    const userCustom = customCategories.map((c) => ({
      id: c.id,
      label: c.label,
      icon: c.icon,
      color: c.color,
      isOverall: false,
      isCustom: true,
    }));
    return [...userCustom, ...builtIn];
  }, [customCategories]);

  // Filtered Categories
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return allCategories;
    const q = categorySearch.toLowerCase().trim();
    return allCategories.filter((c) => c.label.toLowerCase().includes(q));
  }, [allCategories, categorySearch]);

  // Find existing overall budget to link sub-budgets to
  const existingOverallBudget = useMemo(() => {
    return budgets.find((b) => b.isOverall && (!b.periodType || b.periodType === 'monthly'));
  }, [budgets]);

  const existingCategoryBudgets = useMemo(() => {
    if (!existingOverallBudget) return [];
    return budgets.filter(
      (b) => !b.isOverall && (!b.periodType || b.periodType === 'monthly') && (b.parentBudgetId === existingOverallBudget.id || !b.parentBudgetId)
    );
  }, [budgets, existingOverallBudget]);

  const allocatedAmount = useMemo(() => {
    return existingCategoryBudgets.reduce((sum, b) => sum + (b.limitAmount || 0), 0);
  }, [existingCategoryBudgets]);

  const parentTotalLimit = existingOverallBudget?.limitAmount || 0;
  const unallocatedBuffer = Math.max(0, parentTotalLimit - allocatedAmount);

  // Multi-Category Allocation State (categoryId -> { id?: string; amountStr: string })
  const [allocations, setAllocations] = useState<Record<string, { id?: string; amountStr: string }>>(() => {
    const initial: Record<string, { id?: string; amountStr: string }> = {};
    if (existingCategoryBudgets.length > 0) {
      existingCategoryBudgets.forEach((b) => {
        initial[b.category] = {
          id: b.id,
          amountStr: String(b.limitAmount || 0),
        };
      });
      if (route.params?.initialCategory && !initial[route.params.initialCategory]) {
        const catId = route.params.initialCategory;
        const curAllocated = Object.values(initial).reduce((sum, item) => sum + (parseFloat(item.amountStr) || 0), 0);
        const rem = Math.max(500, parentTotalLimit - curAllocated);
        const defaultAmt = rem > 0 ? (rem >= 1000 ? 1000 : rem) : 1000;
        initial[catId] = { amountStr: String(defaultAmt) };
      }
    } else if (route.params?.initialScope === 'category') {
      const catId = route.params?.initialCategory || 'food';
      const defaultAmt = parentTotalLimit > 0 ? String(Math.min(3000, Math.round(parentTotalLimit * 0.3))) : '3000';
      initial[catId] = { amountStr: defaultAmt };
    }
    return initial;
  });

  const allocationEntries = useMemo(() => Object.entries(allocations), [allocations]);
  const totalAllocatedCount = allocationEntries.length;

  const totalAllocatedSum = useMemo(() => {
    return allocationEntries.reduce((sum, [, item]) => {
      const v = parseFloat(item.amountStr);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [allocationEntries]);

  const freeBufferRemaining = parentTotalLimit - totalAllocatedSum;
  const isBufferExceeded = freeBufferRemaining < 0;
  const allocationPct = parentTotalLimit > 0 ? Math.min(100, Math.round((totalAllocatedSum / parentTotalLimit) * 100)) : 0;

  // Unallocated categories for quick add and dropdown
  const unallocatedCategories = useMemo(() => {
    return allCategories.filter((c) => !allocations[c.id]);
  }, [allCategories, allocations]);

  const handleToggleCategory = (catId: string) => {
    setAllocations((prev) => {
      const next = { ...prev };
      if (next[catId]) {
        delete next[catId];
      } else {
        const curAllocated = Object.values(next).reduce((sum, item) => sum + (parseFloat(item.amountStr) || 0), 0);
        const remaining = Math.max(500, parentTotalLimit - curAllocated);
        const defaultAmt = remaining > 0 ? (remaining >= 1000 ? 1000 : remaining) : 1000;
        next[catId] = { amountStr: String(defaultAmt) };
      }
      return next;
    });
  };

  const handleUpdateCategoryAmount = (catId: string, val: string) => {
    const cleanVal = val.replace(/[^0-9]/g, '');
    setAllocations((prev) => ({
      ...prev,
      [catId]: {
        ...prev[catId],
        amountStr: cleanVal,
      },
    }));
  };

  const handleAddCategoryAmount = (catId: string, delta: number) => {
    setAllocations((prev) => {
      const cur = parseFloat(prev[catId]?.amountStr || '0') || 0;
      return {
        ...prev,
        [catId]: {
          ...prev[catId],
          amountStr: String(Math.max(0, cur + delta)),
        },
      };
    });
  };

  const handleRemoveCategory = (catId: string) => {
    setAllocations((prev) => {
      const next = { ...prev };
      delete next[catId];
      return next;
    });
  };

  // Date Range Computation
  const calculatedRange = useMemo(() => {
    if (budgetType === 'custom_event') {
      const s = parseISO(startDateStr);
      const e = parseISO(endDateStr);
      const start = isValid(s) ? s : new Date();
      const end = isValid(e) && e >= start ? e : addDays(start, 5);
      return getBudgetPeriodRange('custom_event', new Date(), { start, end });
    }

    // Monthly Budget
    if (monthlyDateMode === 'custom_dates') {
      const s = parseISO(startDateStr);
      const e = parseISO(endDateStr);
      if (isValid(s) && isValid(e) && e >= s) {
        return getBudgetPeriodRange('monthly', s, { start: s, end: e });
      }
    }
    const sel = next6Months[selectedMonthIndex] || next6Months[0];
    return getBudgetPeriodRange('monthly', sel.date);
  }, [budgetType, monthlyDateMode, selectedMonthIndex, next6Months, startDateStr, endDateStr]);

  // Quick Amount Helpers
  const handleAddAmount = (add: number) => {
    const current = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;
    setAmountStr(String(current + add));
  };

  // Handle Event Preset Selection
  const handleSelectEventPreset = (preset: typeof EVENT_PRESETS[0]) => {
    setSelectedEventPreset(preset.id);
    if (!budgetName.trim() || EVENT_PRESETS.some((p) => p.defaultName === budgetName)) {
      setBudgetName(preset.defaultName);
    }
  };

  // Create Custom Category Handler
  const handleSaveCustomCategory = () => {
    if (!newCatName.trim()) {
      Alert.alert('Category Name Required', 'Please enter a name for your custom category.');
      return;
    }
    const id = 'custom_' + newCatName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36);
    const newCat: BudgetCustomCategory = {
      id,
      label: newCatName.trim(),
      icon: newCatIcon,
      color: newCatColor,
    };
    addCustomCategory(newCat);
    setAllocations((prev) => ({
      ...prev,
      [id]: { amountStr: '1000' },
    }));
    setNewCatName('');
    setCustomCatModalVisible(false);
  };

  // Batch Save Category Sub-Budgets Handler (All in Single Tap)
  const handleSaveAllCategoryBudgets = async () => {
    const entries = Object.entries(allocations);
    if (entries.length === 0) {
      Alert.alert('No Categories Selected', 'Please tap at least one category to allocate budget.');
      return;
    }

    for (const [catId, item] of entries) {
      const amt = parseFloat(item.amountStr);
      if (!amt || isNaN(amt) || amt <= 0) {
        const customDef = customCategories.find((c) => c.id === catId);
        const meta = getCategoryMeta(catId, false, customDef);
        Alert.alert('Invalid Amount', `Please enter a valid amount for ${meta.label}.`);
        return;
      }
    }

    try {
      setSaving(true);
      const parentBudget = existingOverallBudget;
      const startDate = parentBudget?.startDate
        ? typeof parentBudget.startDate === 'number'
          ? parentBudget.startDate
          : new Date(parentBudget.startDate).getTime()
        : calculatedRange.startDate;
      const endDate = parentBudget?.endDate
        ? typeof parentBudget.endDate === 'number'
          ? parentBudget.endDate
          : new Date(parentBudget.endDate).getTime()
        : calculatedRange.endDate;
      const period = parentBudget?.period || format(startDate, 'MMMM yyyy');

      const updatedBudgetIds = new Set<string>();

      for (const [catId, item] of entries) {
        const amt = parseFloat(item.amountStr);
        const customDef = customCategories.find((c) => c.id === catId);
        const catLabel = getCategoryMeta(catId, false, customDef).label;

        if (item.id) {
          await budgetService.updateBudget(item.id, {
            limitAmount: amt,
            name: catLabel,
          });
          updatedBudgetIds.add(item.id);
        } else {
          const created = await budgetService.createBudget({
            name: catLabel,
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
          if (created?.id) updatedBudgetIds.add(created.id);
        }
      }

      // Delete removed sub-budgets and duplicates
      for (const existing of existingCategoryBudgets) {
        if (!updatedBudgetIds.has(existing.id)) {
          await budgetService.deleteBudget(existing.id);
        }
      }

      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        (navigation as any).navigate('Main', { screen: 'Budgets', params: { openTab: 'monthly' } });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save sub-budgets.');
    } finally {
      setSaving(false);
    }
  };

  // Submit Handler for Overall Monthly / Special Event
  const handleSaveBudget = async () => {
    const amount = parseFloat(amountStr.replace(/[^0-9.]/g, ''));
    if (!amount || isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid budget amount.');
      return;
    }

    try {
      setSaving(true);

      if (budgetType === 'monthly') {
        const name = budgetName.trim() || `Monthly Budget (${format(calculatedRange.startDate, 'MMMM yyyy')})`;

        const created = await budgetService.createBudget({
          name,
          category: 'all',
          limitAmount: amount,
          period: format(calculatedRange.startDate, 'MMMM yyyy'),
          periodType: 'monthly',
          startDate: calculatedRange.startDate,
          endDate: calculatedRange.endDate,
          isOverall: true,
          customCategoryDef: undefined,
        });

        // Batch create cloned or pre-configured sub-category allocations linked to this newly created monthly budget!
        const allocEntries = Object.entries(allocations);
        if (allocEntries.length > 0 && created?.id) {
          for (const [catId, item] of allocEntries) {
            const subAmt = parseFloat(item.amountStr);
            if (subAmt > 0) {
              const customDef = customCategories.find((c) => c.id === catId);
              const catLabel = getCategoryMeta(catId, false, customDef).label;
              await budgetService.createBudget({
                name: catLabel,
                category: catId,
                limitAmount: subAmt,
                period: format(calculatedRange.startDate, 'MMMM yyyy'),
                periodType: 'monthly',
                startDate: calculatedRange.startDate,
                endDate: calculatedRange.endDate,
                isOverall: false,
                parentBudgetId: created.id,
                customCategoryDef: customDef,
              });
            }
          }
        }

        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          (navigation as any).navigate('Main', { screen: 'Budgets', params: { openTab: 'monthly' } });
        }
      } else {
        const eventName = budgetName.trim() || 'Special Event Budget';
        const chosenPreset = EVENT_PRESETS.find((p) => p.id === selectedEventPreset);

        await budgetService.createBudget({
          name: eventName,
          category: 'other_expense',
          limitAmount: amount,
          period: calculatedRange.label,
          periodType: 'custom_event',
          startDate: calculatedRange.startDate,
          endDate: calculatedRange.endDate,
          isOverall: false,
          customCategoryDef: {
            id: 'event_' + (chosenPreset?.id || 'trip'),
            label: eventName,
            icon: chosenPreset?.icon || 'airplane-outline',
            color: '#2dba4e',
          },
        });

        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          (navigation as any).navigate('Main', { screen: 'Budgets', params: { openTab: 'events' } });
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save budget.');
    } finally {
      setSaving(false);
    }
  };

  const selectedCategoryMeta = useMemo(() => {
    const customDef = customCategories.find((c) => c.id === selectedCategory);
    return getCategoryMeta(selectedCategory, false, customDef);
  }, [selectedCategory, customCategories]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {AppTopBarComponent && <AppTopBarComponent />}

      {/* Header */}
      <View style={[styles.header, { paddingTop: AppTopBarComponent ? 10 : insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {isCategoryMode ? 'Add Category Sub-Budget' : 'New Budget'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {isCategoryMode
              ? 'Allocate a portion of your monthly budget'
              : 'Plan your monthly spending or configure a special event'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={true}
      >
        {/* ==================== 1. NEW MAIN BUDGET FLOW ==================== */}
        {!isCategoryMode ? (
          <>
            {/* COPY FROM PREVIOUS BUDGET (QUICK TEMPLATE SELECTOR) */}
            {allOverallAndEventBudgets.length > 0 && (
              <View
                style={[
                  styles.templateCard,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc',
                    borderColor: activeTemplateBudget ? colors.accent : colors.border,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="flash" size={15} color={colors.accent} />
                    <Text style={[styles.templateCardTitle, { color: colors.text }]}>
                      {activeTemplateBudget ? `Template: ${activeTemplateBudget.name || activeTemplateBudget.period || 'Loaded'}` : 'Copy from Previous Budget'}
                    </Text>
                  </View>
                  {activeTemplateBudget && (
                    <TouchableOpacity
                      onPress={() => {
                        setActiveTemplateBudget(null);
                        setAmountStr('');
                        setBudgetName('');
                        setAllocations({});
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ fontSize: 11, color: colors.danger, fontWeight: '700' }}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={[styles.templateCardDesc, { color: colors.textSecondary, marginBottom: 8 }]}>
                  {activeTemplateBudget
                    ? 'Limits and category allocations pre-filled from this past budget. You can tweak amounts as needed.'
                    : '1-tap to duplicate limits and category allocations from a past cycle so you don’t start from zero:'}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                  {allOverallAndEventBudgets.map((b) => {
                    const isSelected = activeTemplateBudget?.id === b.id;
                    const bName = b.name || (b.isOverall ? b.period || 'Monthly' : 'Event');
                    return (
                      <TouchableOpacity
                        key={b.id}
                        style={[
                          styles.templateChip,
                          {
                            backgroundColor: isSelected ? colors.accent : isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
                            borderColor: isSelected ? colors.accent : colors.border,
                          },
                        ]}
                        onPress={() => {
                          setActiveTemplateBudget(b);
                          applyBudgetTemplate(b);
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={b.isOverall ? 'calendar-outline' : 'airplane-outline'}
                          size={13}
                          color={isSelected ? '#ffffff' : colors.accent}
                          style={{ marginRight: 5 }}
                        />
                        <Text style={[styles.templateChipText, { color: isSelected ? '#ffffff' : colors.text }]}>
                          {bName} (₹{Number(b.limitAmount || 0).toLocaleString('en-IN')})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* DURATION SELECTOR (EXACTLY 2 OPTIONS) */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Select Budget Type</Text>
              <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
                Choose a recurring monthly cycle or a dedicated special event
              </Text>
            </View>

            <View style={[styles.durationTabsRow, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#e2e8f0' }]}>
              <TouchableOpacity
                style={[
                  styles.durationTab,
                  budgetType === 'monthly' && [styles.durationTabActive, { backgroundColor: colors.accent }],
                ]}
                onPress={() => {
                  setBudgetType('monthly');
                  const sel = next6Months[selectedMonthIndex] || next6Months[0];
                  setStartDateStr(sel.startDateStr);
                  setEndDateStr(sel.endDateStr);
                }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="calendar-outline"
                  size={18}
                  color={budgetType === 'monthly' ? '#ffffff' : colors.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.durationTabText,
                    { color: budgetType === 'monthly' ? '#ffffff' : colors.textSecondary },
                  ]}
                >
                  Monthly Budget
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.durationTab,
                  budgetType === 'custom_event' && [styles.durationTabActive, { backgroundColor: colors.accent }],
                ]}
                onPress={() => {
                  setBudgetType('custom_event');
                  if (!budgetName.trim()) setBudgetName('Goa Trip');
                  setStartDateStr(format(addDays(new Date(), 10), 'yyyy-MM-dd'));
                  setEndDateStr(format(addDays(new Date(), 16), 'yyyy-MM-dd'));
                }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="airplane-outline"
                  size={18}
                  color={budgetType === 'custom_event' ? '#ffffff' : colors.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.durationTabText,
                    { color: budgetType === 'custom_event' ? '#ffffff' : colors.textSecondary },
                  ]}
                >
                  Special Event
                </Text>
              </TouchableOpacity>
            </View>

            {budgetType === 'monthly' ? (
              /* MONTHLY BUDGET SETUP (CLEAR & SIMPLE: CYCLE + TOTAL LIMIT) */
              <>
                {/* 1. Month & Cycle Dates */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>1. Month & Cycle Dates</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    Standard calendar month or custom salary cycle (e.g. 5th to 4th)
                  </Text>

                  <View style={styles.subTabRow}>
                    <TouchableOpacity
                      style={[
                        styles.subTabBtn,
                        monthlyDateMode === 'calendar' && [styles.subTabBtnActive, { backgroundColor: colors.accent }],
                      ]}
                      onPress={() => {
                        setMonthlyDateMode('calendar');
                        const sel = next6Months[selectedMonthIndex] || next6Months[0];
                        setStartDateStr(sel.startDateStr);
                        setEndDateStr(sel.endDateStr);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.subTabText, { color: monthlyDateMode === 'calendar' ? '#ffffff' : colors.text }]}>
                        Calendar Month
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.subTabBtn,
                        monthlyDateMode === 'custom_dates' && [styles.subTabBtnActive, { backgroundColor: colors.accent }],
                      ]}
                      onPress={() => setMonthlyDateMode('custom_dates')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.subTabText, { color: monthlyDateMode === 'custom_dates' ? '#ffffff' : colors.text }]}>
                        Custom Dates
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* CALENDAR MONTH MODE: 6-MONTH DROPDOWN */}
                  {monthlyDateMode === 'calendar' ? (
                    <View style={{ marginBottom: 10 }}>
                      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>SELECT MONTH (NEXT 6 MONTHS)</Text>
                      <TouchableOpacity
                        style={[styles.monthDropdownTrigger, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                        onPress={() => setMonthDropdownOpen(!monthDropdownOpen)}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                          <Ionicons name="calendar" size={18} color={colors.accent} />
                          <Text style={[styles.monthDropdownTitle, { color: colors.text }]}>
                            {next6Months[selectedMonthIndex]?.fullLabel}
                          </Text>
                          {next6Months[selectedMonthIndex]?.hasBudget && (
                            <View style={[styles.hasBudgetBadge, { backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(22, 163, 74, 0.12)' }]}>
                              <Text style={[styles.hasBudgetBadgeText, { color: colors.accent }]}>Budget Active</Text>
                            </View>
                          )}
                        </View>
                        <Ionicons name={monthDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
                      </TouchableOpacity>

                      {/* Dropdown Menu */}
                      {monthDropdownOpen && (
                        <View style={[styles.monthDropdownMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
                          {next6Months.map((m) => {
                            const isSelected = selectedMonthIndex === m.index;
                            return (
                              <TouchableOpacity
                                key={m.fullLabel}
                                style={[
                                  styles.monthMenuItem,
                                  { borderBottomColor: colors.border },
                                  isSelected && { backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(22, 163, 74, 0.08)' },
                                ]}
                                onPress={() => {
                                  setSelectedMonthIndex(m.index);
                                  setStartDateStr(m.startDateStr);
                                  setEndDateStr(m.endDateStr);
                                  setMonthDropdownOpen(false);
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Ionicons
                                    name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                                    size={18}
                                    color={isSelected ? colors.accent : colors.textSecondary}
                                  />
                                  <Text
                                    style={[
                                      styles.monthMenuItemText,
                                      { color: isSelected ? colors.accent : colors.text, fontWeight: isSelected ? '700' : '500' },
                                    ]}
                                  >
                                    {m.fullLabel}
                                  </Text>
                                </View>
                                {m.hasBudget && (
                                  <View style={[styles.hasBudgetBadge, { backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(22, 163, 74, 0.12)' }]}>
                                    <Text style={[styles.hasBudgetBadgeText, { color: colors.accent }]}>Budget Active</Text>
                                  </View>
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  ) : (
                    /* CUSTOM DATES MODE: INTERACTIVE CALENDAR DATE PICKERS */
                    <View style={styles.dateInputsRow}>
                      <TouchableOpacity
                        style={[styles.datePickerField, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                        onPress={() => setCalendarPickerTarget('start')}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>START DATE</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <Ionicons name="calendar-outline" size={16} color={colors.accent} />
                          <Text style={[styles.datePickerValueText, { color: colors.text }]}>
                            {format(parseISO(startDateStr), 'dd MMM yyyy')}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.datePickerField, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                        onPress={() => setCalendarPickerTarget('end')}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>END DATE</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <Ionicons name="calendar-outline" size={16} color={colors.accent} />
                          <Text style={[styles.datePickerValueText, { color: colors.text }]}>
                            {format(parseISO(endDateStr), 'dd MMM yyyy')}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}

                  <View style={[styles.cycleBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderColor: colors.border, marginTop: 10 }]}>
                    <Ionicons name="time-outline" size={16} color={colors.accent} style={{ marginRight: 6 }} />
                    <Text style={[styles.cycleBadgeText, { color: colors.textSecondary }]}>
                      Active period: <Text style={{ color: colors.text, fontWeight: '700' }}>{calculatedRange.label}</Text> ({calculatedRange.totalDays} days)
                    </Text>
                  </View>
                </View>

                {/* 2. Total Monthly Spending Limit */}
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>2. Total Monthly Spending Limit</Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                    Set your overall target spending limit in rupees for this month
                  </Text>

                  <View style={[styles.amountInputRow, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
                    <Text style={[styles.currencySymbol, { color: colors.accent }]}>₹</Text>
                    <TextInput
                      style={[styles.amountInput, { color: colors.text }]}
                      value={amountStr}
                      onChangeText={setAmountStr}
                      placeholder="9,000"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="number-pad"
                      inputMode="numeric"
                    />
                  </View>

                  {/* Quick Increment Chips */}
                  <View style={styles.quickAddRow}>
                    {[1000, 2000, 5000, 10000].map((add) => (
                      <TouchableOpacity
                        key={add}
                        style={[styles.quickAddBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9', borderColor: colors.border }]}
                        onPress={() => handleAddAmount(add)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.quickAddBtnText, { color: colors.text }]}>+₹{add.toLocaleString('en-IN')}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* 3. CLONED CATEGORY ALLOCATIONS PREVIEW */}
                {Object.keys(allocations).length > 0 && (
                  <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={[styles.cardTitle, { color: colors.text }]}>
                        3. Category Allocations ({Object.keys(allocations).length})
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.accent, fontWeight: '700' }}>
                        Auto-created on save
                      </Text>
                    </View>
                    <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                      These categories will be automatically cloned and linked under this month's budget ceiling.
                    </Text>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {Object.entries(allocations).map(([catId, item]) => {
                        const customDef = customCategories.find((c) => c.id === catId);
                        const meta = getCategoryMeta(catId, false, customDef);
                        return (
                          <View
                            key={catId}
                            style={[
                              styles.allocPreviewChip,
                              { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9', borderColor: colors.border },
                            ]}
                          >
                            <Ionicons name={meta.icon as any} size={13} color={meta.color || colors.accent} />
                            <Text style={[styles.allocPreviewChipText, { color: colors.text }]}>
                              {meta.label}: <Text style={{ fontWeight: '800' }}>₹{Number(item.amountStr || 0).toLocaleString('en-IN')}</Text>
                            </Text>
                            <TouchableOpacity
                              onPress={() => {
                                setAllocations((prev) => {
                                  const next = { ...prev };
                                  delete next[catId];
                                  return next;
                                });
                              }}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Ionicons name="close-circle" size={14} color={colors.textSecondary} style={{ marginLeft: 3 }} />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}
              </>
            ) : (
              /* SPECIAL EVENT BUDGET SETUP */
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Special Event Information</Text>
                <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                  Dedicated budget for a specific event or trip (separate from monthly limits)
                </Text>

                {/* Quick Event Presets */}
                <Text style={[styles.inputLabel, { color: colors.textSecondary, marginBottom: 8 }]}>EVENT TYPE</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                  {EVENT_PRESETS.map((p) => {
                    const isSelected = selectedEventPreset === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        style={[
                          styles.eventPresetChip,
                          {
                            backgroundColor: isSelected ? colors.accent : isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9',
                            borderColor: isSelected ? colors.accent : colors.border,
                          },
                        ]}
                        onPress={() => handleSelectEventPreset(p)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={p.icon as any}
                          size={16}
                          color={isSelected ? '#ffffff' : colors.text}
                          style={{ marginRight: 6 }}
                        />
                        <Text
                          style={[
                            styles.eventPresetText,
                            { color: isSelected ? '#ffffff' : colors.text, fontWeight: isSelected ? '700' : '500' },
                          ]}
                        >
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Event Name Input */}
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>EVENT / TRIP NAME</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text, marginBottom: 14 }]}
                  value={budgetName}
                  onChangeText={setBudgetName}
                  placeholder="e.g. Goa Trip 2026, Sister's Wedding"
                  placeholderTextColor={colors.textSecondary}
                />

                {/* Event Start and End Dates with INTERACTIVE CALENDAR */}
                <View style={styles.dateInputsRow}>
                  <TouchableOpacity
                    style={[styles.datePickerField, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                    onPress={() => setCalendarPickerTarget('start')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>START DATE</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Ionicons name="calendar-outline" size={16} color={colors.accent} />
                      <Text style={[styles.datePickerValueText, { color: colors.text }]}>
                        {format(parseISO(startDateStr), 'dd MMM yyyy')}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.datePickerField, { backgroundColor: colors.inputBackground, borderColor: colors.border }]}
                    onPress={() => setCalendarPickerTarget('end')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>END DATE</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Ionicons name="calendar-outline" size={16} color={colors.accent} />
                      <Text style={[styles.datePickerValueText, { color: colors.text }]}>
                        {format(parseISO(endDateStr), 'dd MMM yyyy')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                <View style={[styles.cycleBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderColor: colors.border, marginTop: 12 }]}>
                  <Ionicons name="sparkles-outline" size={16} color={colors.accent} style={{ marginRight: 6 }} />
                  <Text style={[styles.cycleBadgeText, { color: colors.textSecondary }]}>
                    Tracking window: <Text style={{ color: colors.text, fontWeight: '700' }}>{calculatedRange.label}</Text> ({calculatedRange.totalDays} days)
                  </Text>
                </View>

                {/* Event Amount Input */}
                <View style={{ marginTop: 14 }}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>EVENT BUDGET TARGET</Text>
                  <View style={[styles.amountInputRow, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}>
                    <Text style={[styles.currencySymbol, { color: colors.accent }]}>₹</Text>
                    <TextInput
                      style={[styles.amountInput, { color: colors.text }]}
                      value={amountStr}
                      onChangeText={setAmountStr}
                      placeholder="25,000"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="number-pad"
                      inputMode="numeric"
                    />
                  </View>

                  <View style={styles.quickAddRow}>
                    {[2000, 5000, 10000, 20000].map((add) => (
                      <TouchableOpacity
                        key={add}
                        style={[styles.quickAddBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9', borderColor: colors.border }]}
                        onPress={() => handleAddAmount(add)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.quickAddBtnText, { color: colors.text }]}>+₹{add.toLocaleString('en-IN')}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}
          </>
        ) : (
          /* ==================== 2. MULTI-CATEGORY SUB-BUDGET ALLOCATION STUDIO ==================== */
          <>
            {/* Compact Parent Monthly Budget Live Allocation Meter */}
            <View style={[styles.parentBudgetBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                  <View style={[styles.parentBadgeIconBox, { backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(22, 163, 74, 0.1)' }]}>
                    <Ionicons name="wallet" size={15} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.parentBudgetName, { color: colors.text, fontSize: 13 }]} numberOfLines={1}>
                      {existingOverallBudget?.name || 'Overall Monthly Budget'}
                    </Text>
                    <Text style={[styles.parentBudgetSub, { color: colors.textSecondary, fontSize: 10 }]}>
                      {existingOverallBudget?.period || format(calculatedRange.startDate, 'MMMM yyyy')}
                    </Text>
                  </View>
                </View>
                <View style={[styles.hasBudgetBadge, { backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(22, 163, 74, 0.1)' }]}>
                  <Text style={[styles.hasBudgetBadgeText, { color: colors.accent, fontSize: 10 }]}>Main Budget</Text>
                </View>
              </View>

              {/* 3 Metric Columns */}
              <View style={[styles.parentMetricsRow, { borderTopColor: colors.border }]}>
                <View style={styles.parentMetricCol}>
                  <Text style={[styles.parentMetricLabel, { color: colors.textSecondary }]}>MAIN BUDGET</Text>
                  <Text style={[styles.parentMetricValue, { color: colors.text }]}>
                    ₹{parentTotalLimit.toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={[styles.parentMetricDivider, { backgroundColor: colors.border }]} />
                <View style={styles.parentMetricCol}>
                  <Text style={[styles.parentMetricLabel, { color: colors.textSecondary }]}>
                    ALLOCATED ({totalAllocatedCount})
                  </Text>
                  <Text style={[styles.parentMetricValue, { color: '#3b82f6' }]}>
                    ₹{totalAllocatedSum.toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={[styles.parentMetricDivider, { backgroundColor: colors.border }]} />
                <View style={styles.parentMetricCol}>
                  <Text style={[styles.parentMetricLabel, { color: colors.textSecondary }]}>
                    {isBufferExceeded ? 'EXCEEDED' : 'FREE BUFFER'}
                  </Text>
                  <Text style={[styles.parentMetricValue, { color: isBufferExceeded ? '#ef4444' : colors.accent }]}>
                    ₹{Math.abs(freeBufferRemaining).toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              {/* Progress Bar Visualizer */}
              <View style={[styles.progressBarBg, { backgroundColor: colors.inputBackground }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, allocationPct)}%`,
                      backgroundColor: isBufferExceeded ? '#ef4444' : colors.accent,
                    },
                  ]}
                />
              </View>

              {/* Status Hint */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <Ionicons
                  name={isBufferExceeded ? 'alert-circle' : 'shield-checkmark'}
                  size={12}
                  color={isBufferExceeded ? '#ef4444' : colors.accent}
                  style={{ marginRight: 5 }}
                />
                <Text style={{ fontSize: 11, color: isBufferExceeded ? '#ef4444' : colors.textSecondary }}>
                  {isBufferExceeded
                    ? `Allocations exceed limit by ₹${Math.abs(freeBufferRemaining).toLocaleString('en-IN')}`
                    : freeBufferRemaining === 0
                    ? '100% allocated across sub-budgets'
                    : `₹${freeBufferRemaining.toLocaleString('en-IN')} free buffer remaining`}
                </Text>
              </View>
            </View>

            {/* Configured Sub-Budgets & Streamlined Category Studio */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 12 }]}>
              {/* Header */}
              <View style={styles.configuredHeaderRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.cardTitle, { color: colors.text, fontSize: 13.5, marginBottom: 1 }]}>
                    Configured Sub-Budgets ({totalAllocatedCount})
                  </Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textSecondary, fontSize: 11, marginBottom: 0 }]}>
                    All categories save together in one tap
                  </Text>
                </View>
                {totalAllocatedCount > 0 && (
                  <View style={[styles.summaryPill, { backgroundColor: isBufferExceeded ? 'rgba(239, 68, 68, 0.15)' : 'rgba(45, 186, 78, 0.15)' }]}>
                    <Text style={[styles.summaryPillText, { color: isBufferExceeded ? '#ef4444' : colors.accent, fontSize: 11.5 }]}>
                      ₹{totalAllocatedSum.toLocaleString('en-IN')}
                    </Text>
                  </View>
                )}
              </View>

              {/* Action Button: Add Category (Clean, simple, no count, no duplicate Custom button) */}
              <TouchableOpacity
                style={[
                  styles.openPickerBtn,
                  {
                    backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(22, 163, 74, 0.08)',
                    borderColor: colors.accent,
                    marginTop: 6,
                    marginBottom: 8,
                  },
                ]}
                onPress={() => {
                  setCategorySearch('');
                  setCategoryPickerModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle" size={16} color={colors.accent} style={{ marginRight: 6 }} />
                <Text style={[styles.openPickerBtnText, { color: colors.accent }]}>
                  Add Category
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.accent} style={{ marginLeft: 6 }} />
              </TouchableOpacity>

              {/* Single-Line Configured Category List */}
              {totalAllocatedCount === 0 ? (
                <TouchableOpacity
                  style={[styles.emptyAllocationBox, { borderColor: colors.border, marginTop: 4 }]}
                  onPress={() => setCategoryPickerModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add-circle-outline" size={26} color={colors.accent} style={{ marginBottom: 4 }} />
                  <Text style={[styles.emptyAllocationTitle, { color: colors.text, fontSize: 13 }]}>No categories added yet</Text>
                  <Text style={[styles.emptyAllocationSub, { color: colors.textSecondary, fontSize: 11 }]}>
                    Tap "Add Category" above to allocate
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 6, marginTop: 4 }}>
                  {allocationEntries.map(([catId, item]) => {
                    const customDef = customCategories.find((c) => c.id === catId);
                    const meta = getCategoryMeta(catId, false, customDef);
                    return (
                      <View
                        key={catId}
                        style={[
                          styles.singleLineCategoryRow,
                          { backgroundColor: colors.inputBackground, borderColor: colors.border },
                        ]}
                      >
                        {/* Left: Icon + Category Name */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 10 }}>
                          <View style={[styles.compactIconBox, { backgroundColor: meta.color ? `${meta.color}20` : 'rgba(255,255,255,0.06)' }]}>
                            <Ionicons name={meta.icon as any} size={14} color={meta.color || colors.accent} />
                          </View>
                          <Text style={[styles.singleLineCategoryTitle, { color: colors.text }]} numberOfLines={1}>
                            {meta.label}
                          </Text>
                        </View>

                        {/* Right: Numeric Amount Box + Remove Button in One Line */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[styles.singleLineInputBox, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff' }]}>
                            <Text style={[styles.compactCurrency, { color: colors.accent }]}>₹</Text>
                            <TextInput
                              style={[styles.singleLineAmountInput, { color: colors.text }]}
                              value={item.amountStr}
                              onChangeText={(val) => handleUpdateCategoryAmount(catId, val)}
                              placeholder="1,000"
                              placeholderTextColor={colors.textSecondary}
                              keyboardType="number-pad"
                              inputMode="numeric"
                            />
                          </View>

                          <TouchableOpacity
                            onPress={() => handleRemoveCategory(catId)}
                            style={styles.compactRemoveBtn}
                            activeOpacity={0.7}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Ionicons name="close" size={16} color={colors.textSecondary} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* INTERACTIVE CALENDAR DATE PICKER MODAL */}
      <CalendarDatePickerModal
        visible={calendarPickerTarget !== null}
        title={calendarPickerTarget === 'start' ? 'Select Start Date' : 'Select End Date'}
        initialDate={calendarPickerTarget === 'start' ? startDateStr : endDateStr}
        minDate={calendarPickerTarget === 'end' ? parseISO(startDateStr) : undefined}
        onClose={() => setCalendarPickerTarget(null)}
        onSelectDate={(date, dateStr) => {
          if (calendarPickerTarget === 'start') {
            setStartDateStr(dateStr);
            const currentEnd = parseISO(endDateStr);
            if (isValid(currentEnd) && currentEnd < date) {
              setEndDateStr(format(addDays(date, 5), 'yyyy-MM-dd'));
            }
          } else if (calendarPickerTarget === 'end') {
            setEndDateStr(dateStr);
          }
          setCalendarPickerTarget(null);
        }}
      />

      {/* SEARCHABLE CATEGORY PICKER DROPDOWN MODAL */}
      <Modal visible={categoryPickerModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.pickerModalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text, fontSize: 16 }]}>Choose Categories</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                  Select categories to include in this month's budget
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCategoryPickerModalVisible(false)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Instant Search Bar */}
            <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.inputBackground, marginVertical: 8 }]}>
              <Ionicons name="search-outline" size={15} color={colors.textSecondary} style={{ marginRight: 6 }} />
              <TextInput
                style={[styles.searchInput, { color: colors.text, fontSize: 12.5 }]}
                placeholder="Search categories (e.g. food, rent, gym)..."
                placeholderTextColor={colors.textSecondary}
                value={categorySearch}
                onChangeText={setCategorySearch}
              />
              {categorySearch.length > 0 && (
                <TouchableOpacity onPress={() => setCategorySearch('')}>
                  <Ionicons name="close-circle" size={15} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Scrollable Category Grid */}
            <ScrollView
              style={{ maxHeight: 320 }}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.pickerCategoryGrid}
            >
              {filteredCategories.map((cat) => {
                const isSelected = !!allocations[cat.id];
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.pickerChip,
                      {
                        backgroundColor: isSelected
                          ? isDark
                            ? 'rgba(45, 186, 78, 0.2)'
                            : 'rgba(22, 163, 74, 0.12)'
                          : colors.inputBackground,
                        borderColor: isSelected ? colors.accent : colors.border,
                      },
                    ]}
                    onPress={() => handleToggleCategory(cat.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isSelected ? 'checkmark-circle' : (cat.icon as any)}
                      size={15}
                      color={isSelected ? colors.accent : cat.color || colors.text}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.pickerChipText,
                        { color: isSelected ? colors.accent : colors.text, fontWeight: isSelected ? '700' : '500' },
                      ]}
                      numberOfLines={1}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Footer with Done button and Quick Custom button */}
            <View style={[styles.pickerFooterRow, { borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.pickerAddCustomBtn, { borderColor: colors.border, backgroundColor: colors.inputBackground }]}
                onPress={() => {
                  setCategoryPickerModalVisible(false);
                  setCustomCatModalVisible(true);
                }}
              >
                <Ionicons name="add" size={15} color={colors.accent} style={{ marginRight: 4 }} />
                <Text style={[styles.pickerAddCustomText, { color: colors.accent }]}>+ Custom</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pickerDoneBtn, { backgroundColor: colors.accent }]}
                onPress={() => setCategoryPickerModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.pickerDoneBtnText}>Done ({totalAllocatedCount} selected)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* CREATE CUSTOM CATEGORY MODAL */}
      <Modal visible={customCatModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Create Custom Category</Text>
              <TouchableOpacity onPress={() => setCustomCatModalVisible(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>CATEGORY NAME</Text>
            <TextInput
              style={[styles.textInput, { backgroundColor: colors.inputBackground, borderColor: colors.border, color: colors.text, marginBottom: 14 }]}
              value={newCatName}
              onChangeText={setNewCatName}
              placeholder="e.g. Snacks, Gym Diet, Car Maintenance"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>SELECT ICON</Text>
            <View style={styles.iconPickerGrid}>
              {CUSTOM_ICONS.map((icon) => (
                <TouchableOpacity
                  key={icon}
                  style={[
                    styles.iconChoice,
                    {
                      backgroundColor: newCatIcon === icon ? colors.accent : isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
                      borderColor: newCatIcon === icon ? colors.accent : colors.border,
                    },
                  ]}
                  onPress={() => setNewCatIcon(icon)}
                >
                  <Ionicons name={icon as any} size={20} color={newCatIcon === icon ? '#ffffff' : colors.text} />
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 14 }]}>SELECT COLOR</Text>
            <View style={styles.colorPickerRow}>
              {CUSTOM_COLORS.map((col) => (
                <TouchableOpacity
                  key={col}
                  style={[
                    styles.colorChoice,
                    { backgroundColor: col },
                    newCatColor === col && styles.colorChoiceActive,
                  ]}
                  onPress={() => setNewCatColor(col)}
                >
                  {newCatColor === col && <Ionicons name="checkmark" size={16} color="#ffffff" />}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.modalSubmitBtn, { backgroundColor: colors.accent, marginTop: 20 }]}
              onPress={handleSaveCustomCategory}
              activeOpacity={0.8}
            >
              <Text style={styles.modalSubmitBtnText}>Save & Select Category</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Sticky Bottom Action Bar with Safe Insets */}
      <View
        style={[
          styles.bottomActionBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 14),
          },
        ]}
      >
        {isCategoryMode ? (
          <TouchableOpacity
            style={[
              styles.saveBtn,
              {
                backgroundColor:
                  totalAllocatedCount === 0 || isBufferExceeded
                    ? isDark
                      ? '#374151'
                      : '#9ca3af'
                    : colors.accent,
                opacity: saving ? 0.7 : 1,
              },
            ]}
            onPress={handleSaveAllCategoryBudgets}
            disabled={saving || totalAllocatedCount === 0}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                <Text style={styles.saveBtnText}>
                  {totalAllocatedCount === 0
                    ? 'Select Categories to Allocate'
                    : isBufferExceeded
                    ? `Save Sub-Budgets (Exceeded by ₹${Math.abs(freeBufferRemaining).toLocaleString('en-IN')})`
                    : `Save ${totalAllocatedCount} Sub-Budget${totalAllocatedCount > 1 ? 's' : ''} (₹${totalAllocatedSum.toLocaleString('en-IN')})`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.saveBtn,
              { backgroundColor: colors.accent, opacity: saving ? 0.7 : 1 },
            ]}
            onPress={handleSaveBudget}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                <Text style={styles.saveBtnText}>
                  {budgetType === 'monthly' ? 'Create Monthly Budget' : 'Create Event Budget'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  sectionDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  durationTabsRow: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    marginBottom: 16,
  },
  durationTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 11,
  },
  durationTabActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  durationTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    marginBottom: 12,
  },
  subTabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  subTabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  subTabBtnActive: {
    borderWidth: 0,
  },
  subTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  monthDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  monthDropdownTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  hasBudgetBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  hasBudgetBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  monthDropdownMenu: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 6,
    overflow: 'hidden',
  },
  monthMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  monthMenuItemText: {
    fontSize: 13,
  },
  parentBudgetBanner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  parentBadgeIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentBudgetName: {
    fontSize: 13,
    fontWeight: '800',
  },
  parentBudgetSub: {
    fontSize: 10,
    marginTop: 1,
  },
  parentMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 8,
  },
  parentMetricCol: {
    flex: 1,
    alignItems: 'center',
  },
  parentMetricLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  parentMetricValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  parentMetricDivider: {
    width: 1,
    height: 20,
  },
  progressBarBg: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  configuredHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
  },
  summaryPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  actionRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  openPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
  },
  openPickerBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyAllocationBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyAllocationTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  emptyAllocationSub: {
    fontSize: 11,
    textAlign: 'center',
  },
  singleLineCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  singleLineCategoryTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  singleLineInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    width: 95,
  },
  singleLineAmountInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '800',
    padding: 0,
  },
  compactIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactRemoveBtn: {
    padding: 3,
  },
  compactCurrency: {
    fontSize: 13,
    fontWeight: '800',
    marginRight: 4,
  },
  pickerModalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  modalSubtitle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 4,
  },
  pickerCategoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    paddingVertical: 6,
  },
  pickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  pickerChipText: {
    fontSize: 11.5,
  },
  pickerFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  pickerAddCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
  },
  pickerAddCustomText: {
    fontSize: 12,
    fontWeight: '700',
  },
  pickerDoneBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 9,
  },
  pickerDoneBtnText: {
    color: '#ffffff',
    fontSize: 12.5,
    fontWeight: '800',
  },
  bottomActionBar: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  cycleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  cycleBadgeText: {
    fontSize: 12,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
  },
  dateInputsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  datePickerField: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  datePickerValueText: {
    fontSize: 13,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  eventPresetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 8,
  },
  eventPresetText: {
    fontSize: 12,
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  addCustomCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  addCustomCatBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    padding: 0,
  },
  categoryChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 12,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '800',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    padding: 0,
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickAddBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  quickAddBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 8,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
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
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  iconPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconChoice: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorPickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  colorChoice: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorChoiceActive: {
    borderWidth: 2,
    borderColor: '#ffffff',
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
  templateCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 14,
  },
  templateCardTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  templateCardDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  templateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  templateChipText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  allocPreviewChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  allocPreviewChipText: {
    fontSize: 11,
  },
});
