import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, addDays, endOfMonth, isValid, parseISO } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useTransactionStore, BudgetPeriodType } from '../store';
import {
  BUDGET_DEBIT_CATEGORIES,
  BUDGET_PERIOD_PRESETS,
  getBudgetPeriodRange,
  getSuggestedBudgetAmount,
  budgetService,
} from '../services/budgetService';
import { parseNaturalLanguageBudget } from '../services/budgetNLParser';
import { INDIAN_FESTIVAL_EVENTS, getFestivalEventRange, FestivalEventPreset } from '../constants/festivalEvents';
import { StandaloneBottomTabBar } from './StandaloneBottomTabBar';

export interface CreateBudgetScreenProps {
  AppTopBarComponent?: React.ComponentType;
}

export const CreateBudgetScreen: React.FC<CreateBudgetScreenProps> = ({ AppTopBarComponent }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();

  const transactions = useTransactionStore((state) => state.transactions);

  // Natural Language State
  const [nlPrompt, setNlPrompt] = useState('');
  const [nlStatusMessage, setNlStatusMessage] = useState<string | null>(null);

  // Form State
  const [isOverall, setIsOverall] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('food');
  const [amountStr, setAmountStr] = useState('');
  const [periodType, setPeriodType] = useState<BudgetPeriodType>('monthly');
  const [budgetName, setBudgetName] = useState('');
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  // Dropdown & Custom Date State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [startDateStr, setStartDateStr] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [endDateStr, setEndDateStr] = useState(() => format(addDays(new Date(), 14), 'yyyy-MM-dd'));

  // Selected Preset Definition
  const selectedPreset = useMemo(() => {
    return BUDGET_PERIOD_PRESETS.find((p) => p.id === periodType) || BUDGET_PERIOD_PRESETS[0];
  }, [periodType]);

  // Compute Period Range Preview
  const periodRange = useMemo(() => {
    let activeCustomRange = customRange;
    if (periodType === 'custom' && !activeCustomRange) {
      const s = parseISO(startDateStr);
      const e = parseISO(endDateStr);
      const start = isValid(s) ? s : new Date();
      const end = isValid(e) && e >= start ? e : addDays(start, 14);
      activeCustomRange = { start, end };
    }
    return getBudgetPeriodRange(periodType, new Date(), activeCustomRange);
  }, [periodType, customRange, startDateStr, endDateStr]);

  // Compute Smart Suggestion for current category and period
  const smartSuggestion = useMemo(() => {
    const targetCat = isOverall ? 'all' : selectedCategory;
    return getSuggestedBudgetAmount(targetCat, transactions, periodRange.totalDays);
  }, [isOverall, selectedCategory, transactions, periodRange.totalDays]);

  // Compute Daily Burn Preview
  const dailyBurnPreview = useMemo(() => {
    const amt = parseFloat(amountStr.replace(/[^0-9.]/g, '')) || 0;
    if (periodRange.totalDays <= 0 || amt <= 0) return 0;
    return Math.round(amt / periodRange.totalDays);
  }, [amountStr, periodRange.totalDays]);

  // Date Range Change Handlers
  const handleStartDateChange = (val: string) => {
    setStartDateStr(val);
    const s = parseISO(val);
    const e = parseISO(endDateStr);
    if (isValid(s)) {
      if (isValid(e) && e >= s) {
        setCustomRange({ start: s, end: e });
      } else {
        const adjustedEnd = addDays(s, 14);
        setEndDateStr(format(adjustedEnd, 'yyyy-MM-dd'));
        setCustomRange({ start: s, end: adjustedEnd });
      }
    }
  };

  const handleEndDateChange = (val: string) => {
    setEndDateStr(val);
    const s = parseISO(startDateStr);
    const e = parseISO(val);
    if (isValid(e)) {
      if (isValid(s) && s <= e) {
        setCustomRange({ start: s, end: e });
      } else if (isValid(s)) {
        setCustomRange({ start: s, end: s });
      }
    }
  };

  const handleQuickAddDays = (days: number) => {
    const s = parseISO(startDateStr);
    const baseStart = isValid(s) ? s : new Date();
    const newEnd = addDays(baseStart, days);
    const formattedEnd = format(newEnd, 'yyyy-MM-dd');
    setEndDateStr(formattedEnd);
    setCustomRange({ start: baseStart, end: newEnd });
  };

  const handleQuickMonthEnd = () => {
    const s = parseISO(startDateStr);
    const baseStart = isValid(s) ? s : new Date();
    const newEnd = endOfMonth(baseStart);
    const formattedEnd = format(newEnd, 'yyyy-MM-dd');
    setEndDateStr(formattedEnd);
    setCustomRange({ start: baseStart, end: newEnd });
  };

  const handleSelectPeriod = (id: BudgetPeriodType) => {
    setPeriodType(id);
    setIsDropdownOpen(false);
    if (id === 'custom') {
      const s = parseISO(startDateStr);
      const e = parseISO(endDateStr);
      const validStart = isValid(s) ? s : new Date();
      const validEnd = isValid(e) && e >= validStart ? e : addDays(validStart, 14);
      setStartDateStr(format(validStart, 'yyyy-MM-dd'));
      setEndDateStr(format(validEnd, 'yyyy-MM-dd'));
      setCustomRange({ start: validStart, end: validEnd });
    } else {
      setCustomRange(undefined);
    }
  };

  // Natural Language Parse Handler
  const handleParseNL = (textOverride?: string) => {
    const rawText = (typeof textOverride === 'string' ? textOverride : nlPrompt).trim();
    const effectiveText = rawText || '₹8,000 food budget for Goa trip 10 to 18 Dec';

    setNlPrompt(effectiveText);
    const parsed = parseNaturalLanguageBudget(effectiveText);

    if (parsed.amount) {
      setAmountStr(String(parsed.amount));
    }
    setIsOverall(parsed.isOverall);
    if (!parsed.isOverall && parsed.category) {
      setSelectedCategory(parsed.category);
    }
    if (parsed.periodType) {
      setPeriodType(parsed.periodType);
    }
    if (parsed.name) {
      setBudgetName(parsed.name);
    }

    if (parsed.periodType === 'custom' && parsed.customStartDate && parsed.customEndDate) {
      const s = new Date(parsed.customStartDate);
      const e = new Date(parsed.customEndDate);
      setStartDateStr(format(s, 'yyyy-MM-dd'));
      setEndDateStr(format(e, 'yyyy-MM-dd'));
      setCustomRange({ start: s, end: e });
    } else if (parsed.periodType !== 'custom') {
      setCustomRange(undefined);
    }

    const rangeInfo =
      parsed.periodType === 'custom' && parsed.customStartDate && parsed.customEndDate
        ? `${format(new Date(parsed.customStartDate), 'dd MMM')} - ${format(new Date(parsed.customEndDate), 'dd MMM')}`
        : parsed.periodType;

    setNlStatusMessage(`✅ Applied: ${parsed.name} • ₹${(parsed.amount || 0).toLocaleString('en-IN')} (${rangeInfo})`);
    setTimeout(() => setNlStatusMessage(null), 5000);
  };

  // Event Envelope Select Handler
  const handleSelectEvent = (event: FestivalEventPreset) => {
    const range = getFestivalEventRange(event);
    setBudgetName(event.name);
    setSelectedCategory(event.category);
    setIsOverall(false);
    setAmountStr(String(event.suggestedAmount));
    setPeriodType('custom');
    const start = new Date(range.startDate);
    const end = new Date(range.endDate);
    setStartDateStr(format(start, 'yyyy-MM-dd'));
    setEndDateStr(format(end, 'yyyy-MM-dd'));
    setCustomRange({ start, end });
  };

  const handleSave = async () => {
    const limitAmount = parseFloat(amountStr.replace(/[^0-9.]/g, ''));
    if (!limitAmount || limitAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please specify a budget ceiling greater than ₹0.');
      return;
    }

    setSaving(true);
    try {
      const activeMeta = isOverall
        ? BUDGET_DEBIT_CATEGORIES[0]
        : BUDGET_DEBIT_CATEGORIES.find((c) => c.id === selectedCategory) || BUDGET_DEBIT_CATEGORIES[1];

      const name =
        budgetName.trim() ||
        (isOverall
          ? `Overall (${periodRange.label})`
          : `${activeMeta.label} Budget`);

      await budgetService.createBudget({
        name,
        category: isOverall ? 'all' : selectedCategory,
        limitAmount,
        period: periodRange.label,
        periodType,
        startDate: periodRange.startDate,
        endDate: periodRange.endDate,
        isOverall,
      });

      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save budget.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* 1. App Top Bar (Regent Luxury Navbar) */}
      {AppTopBarComponent ? <AppTopBarComponent /> : null}

      {/* 2. Sub-Header Navigation Bar */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: AppTopBarComponent ? 8 : insets.top + 8,
            borderColor: colors.border,
            backgroundColor: colors.card,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[
            styles.backBtn,
            {
              borderColor: colors.border,
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
            },
          ]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: colors.text }]}>Create Budget</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. NATURAL LANGUAGE QUICK PROMPT */}
        <View
          style={[
            styles.nlCard,
            {
              backgroundColor: isDark ? 'rgba(45, 186, 78, 0.08)' : 'rgba(22, 163, 74, 0.06)',
              borderColor: isDark ? 'rgba(45, 186, 78, 0.25)' : 'rgba(22, 163, 74, 0.20)',
            },
          ]}
        >
          <View style={styles.nlHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sparkles" size={16} color={colors.accent} />
              <Text style={[styles.nlTitle, { color: colors.text }]}>AI Natural Language Budget</Text>
            </View>
            <Text style={[styles.nlBadge, { color: colors.accent }]}>Instant</Text>
          </View>
          <View style={styles.nlInputRow}>
            <TextInput
              style={[
                styles.nlInput,
                {
                  backgroundColor: isDark ? '#161b22' : '#ffffff',
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={nlPrompt}
              onChangeText={setNlPrompt}
              placeholder='e.g. "₹8,000 food budget for Goa trip 10 to 18 Dec"'
              placeholderTextColor={colors.textSecondary}
              onSubmitEditing={() => handleParseNL()}
            />
            <TouchableOpacity
              style={[styles.nlParseBtn, { backgroundColor: colors.accent }]}
              onPress={() => handleParseNL()}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-forward" size={18} color="#000000" />
            </TouchableOpacity>
          </View>

          {/* Quick Clickable Suggestion Chips */}
          <View style={styles.nlExamplesRow}>
            <Text style={[styles.nlExamplesLabel, { color: colors.textSecondary }]}>Try:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.nlExamplesScroll}>
              {[
                { label: '🏖️ Goa Trip', prompt: '₹8,000 food budget for Goa trip 10 to 18 Dec' },
                { label: '🍕 Food & Dining', prompt: '₹12,000 dining budget for this month' },
                { label: '🛍️ Shopping', prompt: '₹15,000 shopping budget for 2 weeks' },
                { label: '🚗 Cab & Fuel', prompt: '₹4,000 transport budget for 1 week' },
              ].map((ex) => (
                <TouchableOpacity
                  key={ex.label}
                  style={[
                    styles.nlExampleChip,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#ffffff',
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => handleParseNL(ex.prompt)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.nlExampleChipText, { color: colors.accent }]}>
                    {ex.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {nlStatusMessage && (
            <Text style={[styles.nlStatus, { color: colors.accent }]}>{nlStatusMessage}</Text>
          )}
        </View>

        {/* 2. FESTIVAL & SEASONAL ENVELOPES CAROUSEL */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 18 }]}>
          SEASONAL & EVENT ENVELOPES
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventsScroll}>
          {INDIAN_FESTIVAL_EVENTS.map((event) => {
            const isMatch = budgetName === event.name;
            return (
              <TouchableOpacity
                key={event.id}
                style={[
                  styles.eventCard,
                  {
                    backgroundColor: isMatch ? `${event.color}22` : isDark ? 'rgba(255, 255, 255, 0.04)' : '#ffffff',
                    borderColor: isMatch ? event.color : colors.border,
                  },
                ]}
                onPress={() => handleSelectEvent(event)}
                activeOpacity={0.8}
              >
                <View style={[styles.eventIconCircle, { backgroundColor: `${event.color}25` }]}>
                  <Ionicons name={event.icon as any} size={18} color={event.color} />
                </View>
                <Text style={[styles.eventName, { color: colors.text }]} numberOfLines={1}>
                  {event.name}
                </Text>
                <Text style={[styles.eventAmount, { color: event.color }]}>
                  ₹{event.suggestedAmount.toLocaleString('en-IN')}
                </Text>
                <Text style={[styles.eventTag, { color: colors.textSecondary }]}>
                  {event.tag}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* 3. SCOPE SELECTOR */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 18 }]}>
          BUDGET SCOPE
        </Text>
        <View style={styles.scopeRow}>
          <TouchableOpacity
            style={[
              styles.scopeTab,
              {
                backgroundColor: isOverall
                  ? colors.accent
                  : isDark
                  ? 'rgba(255, 255, 255, 0.04)'
                  : 'rgba(0, 0, 0, 0.04)',
                borderColor: isOverall ? colors.accent : colors.border,
              },
            ]}
            onPress={() => setIsOverall(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="globe-outline" size={16} color={isOverall ? '#000000' : colors.text} />
            <Text style={[styles.scopeTabText, { color: isOverall ? '#000000' : colors.text }]}>
              Overall Wallet
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.scopeTab,
              {
                backgroundColor: !isOverall
                  ? colors.accent
                  : isDark
                  ? 'rgba(255, 255, 255, 0.04)'
                  : 'rgba(0, 0, 0, 0.04)',
                borderColor: !isOverall ? colors.accent : colors.border,
              },
            ]}
            onPress={() => setIsOverall(false)}
            activeOpacity={0.7}
          >
            <Ionicons name="grid-outline" size={16} color={!isOverall ? '#000000' : colors.text} />
            <Text style={[styles.scopeTabText, { color: !isOverall ? '#000000' : colors.text }]}>
              Specific Category
            </Text>
          </TouchableOpacity>
        </View>

        {/* 4. CATEGORY SELECTOR (If not overall) */}
        {!isOverall && (
          <View style={styles.categorySection}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>CHOOSE CATEGORY</Text>
            <View style={styles.categoryChipsGrid}>
              {BUDGET_DEBIT_CATEGORIES.filter((c) => !c.isOverall).map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: isSelected
                          ? `${cat.color}22`
                          : isDark
                          ? 'rgba(255, 255, 255, 0.04)'
                          : 'rgba(0, 0, 0, 0.03)',
                        borderColor: isSelected ? cat.color : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedCategory(cat.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={cat.icon as any} size={15} color={isSelected ? cat.color : colors.textSecondary} />
                    <Text
                      style={[
                        styles.categoryChipText,
                        { color: isSelected ? cat.color : colors.text, fontWeight: isSelected ? '700' : '500' },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* 5. BUDGET AMOUNT INPUT */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 18 }]}>
          BUDGET CEILING AMOUNT
        </Text>
        <View
          style={[
            styles.amountInputContainer,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.currencyPrefix, { color: colors.accent }]}>₹</Text>
          <TextInput
            style={[styles.amountInput, { color: colors.text }]}
            value={amountStr}
            onChangeText={setAmountStr}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {/* SMART SUGGESTION CHIP */}
        {smartSuggestion.suggestedAmount > 0 ? (
          <TouchableOpacity
            style={[
              styles.suggestionBanner,
              {
                backgroundColor: isDark ? 'rgba(45, 186, 78, 0.10)' : 'rgba(22, 163, 74, 0.08)',
                borderColor: isDark ? 'rgba(45, 186, 78, 0.25)' : 'rgba(22, 163, 74, 0.20)',
              },
            ]}
            onPress={() => setAmountStr(String(smartSuggestion.suggestedAmount))}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles" size={16} color={colors.accent} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.suggestionTitle, { color: colors.text }]}>
                Suggested: ₹{smartSuggestion.suggestedAmount.toLocaleString('en-IN')}{' '}
                <Text style={{ color: colors.accent, fontWeight: '700' }}>[Tap to Apply]</Text>
              </Text>
              <Text style={[styles.suggestionReason, { color: colors.textSecondary }]}>
                {smartSuggestion.reasoning}
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <View
            style={[
              styles.suggestionBanner,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#f8fafc',
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.suggestionTitle, { color: colors.textSecondary, fontWeight: '600' }]}>
                No past spending recorded for this category
              </Text>
              <Text style={[styles.suggestionReason, { color: colors.textSecondary }]}>
                Enter your preferred spending ceiling above
              </Text>
            </View>
          </View>
        )}

        {/* 6. PERIOD SELECTION DROPDOWN */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            BUDGET PERIOD DURATION
          </Text>
          <Text style={[styles.sectionHint, { color: colors.accent }]}>
            {selectedPreset.badge}
          </Text>
        </View>

        {/* Dropdown Trigger Box */}
        <TouchableOpacity
          style={[
            styles.dropdownTrigger,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#ffffff',
              borderColor: isDropdownOpen ? colors.accent : colors.border,
            },
          ]}
          onPress={() => setIsDropdownOpen(!isDropdownOpen)}
          activeOpacity={0.7}
        >
          <View style={styles.dropdownTriggerLeft}>
            <View
              style={[
                styles.dropdownTriggerIcon,
                {
                  backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(22, 163, 74, 0.10)',
                },
              ]}
            >
              <Ionicons
                name={
                  periodType === 'custom'
                    ? 'calendar'
                    : periodType === 'salary_cycle'
                    ? 'wallet-outline'
                    : 'time-outline'
                }
                size={18}
                color={colors.accent}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dropdownSelectedTitle, { color: colors.text }]}>
                {selectedPreset.label}
              </Text>
              <Text style={[styles.dropdownSelectedSubtitle, { color: colors.textSecondary }]}>
                {periodRange.label}
              </Text>
            </View>
          </View>
          <View style={styles.dropdownTriggerRight}>
            <View
              style={[
                styles.badgePill,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                },
              ]}
            >
              <Text style={[styles.badgePillText, { color: colors.accent }]}>
                {selectedPreset.badge}
              </Text>
            </View>
            <Ionicons
              name={isDropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.textSecondary}
            />
          </View>
        </TouchableOpacity>

        {/* Dropdown Options List */}
        {isDropdownOpen && (
          <View
            style={[
              styles.dropdownMenu,
              {
                backgroundColor: isDark ? '#161b22' : '#ffffff',
                borderColor: colors.border,
              },
            ]}
          >
            {BUDGET_PERIOD_PRESETS.map((preset) => {
              const isSelected = periodType === preset.id;
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[
                    styles.dropdownMenuItem,
                    {
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(45, 186, 78, 0.14)'
                          : 'rgba(22, 163, 74, 0.08)'
                        : 'transparent',
                      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9',
                    },
                  ]}
                  onPress={() => handleSelectPeriod(preset.id)}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Ionicons
                      name={
                        preset.id === 'custom'
                          ? 'calendar-outline'
                          : preset.id === 'salary_cycle'
                          ? 'wallet-outline'
                          : 'timer-outline'
                      }
                      size={16}
                      color={isSelected ? colors.accent : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.dropdownMenuItemText,
                        {
                          color: isSelected ? colors.accent : colors.text,
                          fontWeight: isSelected ? '700' : '500',
                        },
                      ]}
                    >
                      {preset.label}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={[
                        styles.menuItemBadge,
                        {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9',
                        },
                      ]}
                    >
                      <Text style={[styles.menuItemBadgeText, { color: colors.textSecondary }]}>
                        {preset.badge}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* CUSTOM DATE RANGE CARD (When periodType === 'custom') */}
        {periodType === 'custom' && (
          <View
            style={[
              styles.customDateCard,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.customDateHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="calendar" size={16} color={colors.accent} />
                <Text style={[styles.customDateTitle, { color: colors.text }]}>Custom Date Window</Text>
              </View>
              <Text style={[styles.customDurationBadge, { color: colors.accent }]}>
                {periodRange.totalDays} Days Active
              </Text>
            </View>

            {/* Date Inputs Row */}
            <View style={styles.dateInputsRow}>
              {/* Start Date */}
              <View style={styles.dateInputCol}>
                <Text style={[styles.dateInputLabel, { color: colors.textSecondary }]}>START DATE</Text>
                <View
                  style={[
                    styles.dateInputWrapper,
                    {
                      borderColor: colors.border,
                      backgroundColor: isDark ? '#161b22' : '#f8fafc',
                    },
                  ]}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.accent} style={{ marginRight: 8 }} />
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={startDateStr}
                      onChange={(e: any) => handleStartDateChange(e.target.value)}
                      style={{
                        backgroundColor: 'transparent',
                        color: colors.text,
                        border: 'none',
                        outline: 'none',
                        fontSize: 14,
                        fontWeight: '600',
                        width: '100%',
                        fontFamily: 'inherit',
                        colorScheme: isDark ? 'dark' : 'light',
                        cursor: 'pointer',
                      }}
                    />
                  ) : (
                    <TextInput
                      style={[styles.dateTextInput, { color: colors.text }]}
                      value={startDateStr}
                      onChangeText={handleStartDateChange}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.textSecondary}
                    />
                  )}
                </View>
              </View>

              {/* Arrow */}
              <View style={styles.dateArrowContainer}>
                <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
              </View>

              {/* End Date */}
              <View style={styles.dateInputCol}>
                <Text style={[styles.dateInputLabel, { color: colors.textSecondary }]}>END DATE</Text>
                <View
                  style={[
                    styles.dateInputWrapper,
                    {
                      borderColor: colors.border,
                      backgroundColor: isDark ? '#161b22' : '#f8fafc',
                    },
                  ]}
                >
                  <Ionicons name="calendar-outline" size={16} color={colors.accent} style={{ marginRight: 8 }} />
                  {Platform.OS === 'web' ? (
                    <input
                      type="date"
                      value={endDateStr}
                      min={startDateStr}
                      onChange={(e: any) => handleEndDateChange(e.target.value)}
                      style={{
                        backgroundColor: 'transparent',
                        color: colors.text,
                        border: 'none',
                        outline: 'none',
                        fontSize: 14,
                        fontWeight: '600',
                        width: '100%',
                        fontFamily: 'inherit',
                        colorScheme: isDark ? 'dark' : 'light',
                        cursor: 'pointer',
                      }}
                    />
                  ) : (
                    <TextInput
                      style={[styles.dateTextInput, { color: colors.text }]}
                      value={endDateStr}
                      onChangeText={handleEndDateChange}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={colors.textSecondary}
                    />
                  )}
                </View>
              </View>
            </View>

            {/* Quick Duration Preset Pills */}
            <Text style={[styles.quickDurationLabel, { color: colors.textSecondary }]}>
              QUICK DURATION SHORTCUTS
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickPillsRow}>
              {[
                { label: '+7 Days', days: 7 },
                { label: '+14 Days', days: 14 },
                { label: '+30 Days', days: 30 },
                { label: '+60 Days', days: 60 },
                { label: '+90 Days', days: 90 },
              ].map((pill) => (
                <TouchableOpacity
                  key={pill.label}
                  style={[
                    styles.quickPill,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9',
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => handleQuickAddDays(pill.days)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.quickPillText, { color: colors.text }]}>{pill.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.quickPill,
                  {
                    backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(22, 163, 74, 0.08)',
                    borderColor: isDark ? 'rgba(45, 186, 78, 0.3)' : 'rgba(22, 163, 74, 0.2)',
                  },
                ]}
                onPress={handleQuickMonthEnd}
                activeOpacity={0.7}
              >
                <Ionicons name="sparkles" size={12} color={colors.accent} />
                <Text style={[styles.quickPillText, { color: colors.accent, fontWeight: '700' }]}>
                  Month End
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {/* 7. SUMMARY PREVIEW CARD */}
        <View
          style={[
            styles.previewCard,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.previewRow}>
            <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>Active Window</Text>
            <Text style={[styles.previewVal, { color: colors.text }]}>{periodRange.label}</Text>
          </View>
          <View style={[styles.previewDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0' }]} />
          <View style={styles.previewRow}>
            <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>Total Duration</Text>
            <Text style={[styles.previewVal, { color: colors.text }]}>{periodRange.totalDays} Days</Text>
          </View>
          <View style={[styles.previewDivider, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#e2e8f0' }]} />
          <View style={styles.previewRow}>
            <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>Safe Daily Allowance</Text>
            <Text style={[styles.previewVal, { color: colors.accent, fontWeight: '800' }]}>
              ₹{dailyBurnPreview.toLocaleString('en-IN')} / day
            </Text>
          </View>
        </View>

        {/* Optional Custom Name */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: 18 }]}>
          BUDGET LABEL (OPTIONAL)
        </Text>
        <TextInput
          style={[
            styles.nameInput,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff',
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          value={budgetName}
          onChangeText={setBudgetName}
          placeholder="e.g. October Living Expenses"
          placeholderTextColor={colors.textSecondary}
        />
        {/* Save CTA Button */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.accent, marginTop: 24, marginBottom: 12 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <>
              <Ionicons name="shield-checkmark" size={18} color="#000000" />
              <Text style={styles.saveBtnText}>Confirm & Set Budget</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* 3. Floating Bottom Navigation Bar */}
      <StandaloneBottomTabBar activeTab="Budgets" />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  nlCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  nlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  nlTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  nlBadge: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  nlInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nlInput: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  nlParseBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nlStatus: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  nlExamplesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  nlExamplesLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  nlExamplesScroll: {
    flex: 1,
  },
  nlExampleChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 6,
  },
  nlExampleChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  eventsScroll: {
    marginBottom: 8,
  },
  eventCard: {
    width: 140,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginRight: 10,
  },
  eventIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  eventName: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  eventAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  eventTag: {
    fontSize: 10,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  scopeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  scopeTabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  categorySection: {
    marginTop: 6,
  },
  categoryChipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  categoryChipText: {
    fontSize: 12,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 10,
  },
  currencyPrefix: {
    fontSize: 28,
    fontWeight: '800',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '900',
    padding: 0,
  },
  suggestionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  suggestionTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  suggestionReason: {
    fontSize: 11,
    marginTop: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 4,
  },
  dropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  dropdownTriggerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownSelectedTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  dropdownSelectedSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  dropdownTriggerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dropdownMenu: {
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 8,
    overflow: 'hidden',
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  dropdownMenuItemText: {
    fontSize: 14,
  },
  menuItemBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  menuItemBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  customDateCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginTop: 10,
    marginBottom: 4,
  },
  customDateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  customDateTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  customDurationBadge: {
    fontSize: 12,
    fontWeight: '800',
  },
  dateInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dateInputCol: {
    flex: 1,
  },
  dateInputLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  dateInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 42,
  },
  dateTextInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    padding: 0,
  },
  dateArrowContainer: {
    paddingTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickDurationLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 8,
  },
  quickPillsRow: {
    flexDirection: 'row',
  },
  quickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
  },
  quickPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  previewCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 20,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 12,
  },
  previewVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  previewDivider: {
    height: 1,
    marginVertical: 10,
  },
  nameInput: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    backgroundColor: 'transparent',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 25,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
});
