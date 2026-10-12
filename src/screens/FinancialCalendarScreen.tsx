import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCalendarAnalytics } from '../hooks/useCalendarAnalytics';
import { useTheme } from '../store';

interface FinancialCalendarScreenProps {
  navigation: any;
  route?: {
    params?: {
      userCreatedAt?: string | number;
    };
  };
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getOrdinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const FinancialCalendarScreen: React.FC<FinancialCalendarScreenProps> = ({
  navigation,
  route,
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const userCreatedAt = route?.params?.userCreatedAt;

  // View Mode: 'calendar' (1st-31st) vs 'salary_cycle' (Payday-to-Payday)
  const [viewMode, setViewMode] = useState<'calendar' | 'salary_cycle'>('calendar');

  // Currently browsed month
  const [browsingDate, setBrowsingDate] = useState<Date>(new Date());

  // Selected date for detailed breakdown drawer
  const [selectedDateKey, setSelectedDateKey] = useState<string>(
    new Date().toISOString().split('T')[0]
  );

  // Privacy mask toggle
  const [isMasked, setIsMasked] = useState<boolean>(false);

  // Core Analytics Engine
  const {
    dailyDataMap,
    createdDateKey,
    recurringBillsByDayOfMonth,
    salaryCycleStats,
    records,
    toggleExcludeRecordTx,
    isTxExcluded,
  } = useCalendarAnalytics(browsingDate, userCreatedAt);

  const peakDay = records.peakDay as any;
  const peakWeek = records.peakWeek as any;
  const bestSavingsMonth = records.bestSavingsMonth as any;

  // Month navigation helpers
  const handlePrevMonth = () => {
    setBrowsingDate(new Date(browsingDate.getFullYear(), browsingDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setBrowsingDate(new Date(browsingDate.getFullYear(), browsingDate.getMonth() + 1, 1));
  };

  const handleJumpToToday = () => {
    const today = new Date();
    setBrowsingDate(today);
    setSelectedDateKey(today.toISOString().split('T')[0]);
  };

  // Calendar Grid Days Builder
  const calendarDays = useMemo(() => {
    const year = browsingDate.getFullYear();
    const month = browsingDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const todayKey = new Date().toISOString().split('T')[0];

    const days: Array<{
      dayNumber: number | null;
      dateKey: string;
      isToday: boolean;
      isAccountCreated: boolean;
      data?: {
        debits: number;
        credits: number;
        txs: any[];
      };
      expectedBills?: Array<{ merchant: string; amount: number }>;
    }> = [];

    // Blank padding cells for start of month
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ dayNumber: null, dateKey: `pad-${i}`, isToday: false, isAccountCreated: false });
    }

    // Days of the month
    for (let day = 1; day <= totalDaysInMonth; day++) {
      const monthStr = String(month + 1).padStart(2, '0');
      const dayStr = String(day).padStart(2, '0');
      const dateKey = `${year}-${monthStr}-${dayStr}`;

      const dayData = dailyDataMap.get(dateKey);
      const isToday = dateKey === todayKey;
      const isAccountCreated = createdDateKey === dateKey;

      // Expected recurring bills for future days
      const isFuture = new Date(dateKey) > new Date();
      const expectedBills = isFuture ? recurringBillsByDayOfMonth.get(day) : undefined;

      days.push({
        dayNumber: day,
        dateKey,
        isToday,
        isAccountCreated,
        data: dayData,
        expectedBills,
      });
    }

    return days;
  }, [browsingDate, dailyDataMap, createdDateKey, recurringBillsByDayOfMonth]);

  // Selected Day Details
  const selectedDayData = useMemo(() => {
    return dailyDataMap.get(selectedDateKey);
  }, [dailyDataMap, selectedDateKey]);

  // Currency Formatter with privacy and genuine data support
  const formatCurrency = (val: number | null | undefined, showSign = false) => {
    if (val === null || val === undefined || isNaN(val)) return 'N/A';
    if (isMasked) return '₹••••';
    const abs = Math.abs(val).toLocaleString('en-IN', { maximumFractionDigits: 0 });
    if (!showSign) return `₹${abs}`;
    return val >= 0 ? `+₹${abs}` : `-₹${abs}`;
  };

  const monthTitle = browsingDate.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top, backgroundColor: isDark ? colors.background : '#F8FAFC' }]}>
      {/* 1. Header Bar */}
      <View style={[styles.headerBar, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderBottomColor: isDark ? colors.border : '#F1F5F9' }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (navigation?.canGoBack?.()) {
              navigation.goBack();
            } else if (navigation?.navigate) {
              navigation.navigate('Main');
            }
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={isDark ? colors.text : '#0F172A'} />
        </TouchableOpacity>

        <View style={styles.headerTitleGroup}>
          <Text style={[styles.headerTitle, { color: isDark ? colors.text : '#0F172A' }]}>Financial Calendar</Text>
          <Text style={styles.headerSubtitle}>Spends, Earnings & All-Time Records</Text>
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.iconAction}
            onPress={() => setIsMasked(!isMasked)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name={isMasked ? 'eye-off' : 'eye'} size={20} color={isDark ? colors.textSecondary : '#475569'} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 2. Salary Cycle Headline Banner */}
        <View style={styles.salaryBanner}>
          <View style={styles.salaryBannerHeader}>
            <View style={styles.salaryBadgeRow}>
              <MaterialCommunityIcons name="wallet-outline" size={18} color="#10B981" />
              <Text style={styles.salaryBadgeText}>
                {salaryCycleStats.payday !== null
                  ? `Payday on ${getOrdinal(salaryCycleStats.payday)} of month`
                  : 'Payday: Not detected (N/A)'}
              </Text>
            </View>
            <TouchableOpacity onPress={handleJumpToToday} style={styles.todayPill} activeOpacity={0.7}>
              <Text style={styles.todayPillText}>Today</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.salaryNumbersRow}>
            <View>
              <Text style={styles.salaryHeadline}>
                {salaryCycleStats.totalBalance !== null
                  ? formatCurrency(salaryCycleStats.totalBalance)
                  : 'N/A'}
              </Text>
              <Text style={styles.salarySublabel}>
                {salaryCycleStats.daysLeft !== null
                  ? `Available · ${salaryCycleStats.daysLeft} days to next salary`
                  : 'Total balance across linked accounts'}
              </Text>
            </View>
            <View style={styles.dailyAllowanceBox}>
              <Text style={styles.allowanceNumber}>
                {salaryCycleStats.dailyAllowance !== null
                  ? formatCurrency(salaryCycleStats.dailyAllowance)
                  : 'N/A'}
              </Text>
              <Text style={styles.allowanceLabel}>daily allowance</Text>
            </View>
          </View>
        </View>

        {/* 3. Mode Toggle (Calendar Month vs Salary Cycle) */}
        <View style={[styles.viewModeToggle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]}>
          <TouchableOpacity
            style={[styles.modeTab, viewMode === 'calendar' && (isDark ? styles.modeTabActiveDark : styles.modeTabActive)]}
            onPress={() => setViewMode('calendar')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="calendar-outline"
              size={15}
              color={viewMode === 'calendar' ? (isDark ? '#FFFFFF' : '#0F172A') : '#64748B'}
            />
            <Text style={[styles.modeTabText, viewMode === 'calendar' && (isDark ? styles.modeTabTextActiveDark : styles.modeTabTextActive)]}>
              Calendar Month
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, viewMode === 'salary_cycle' && (isDark ? styles.modeTabActiveDark : styles.modeTabActive)]}
            onPress={() => setViewMode('salary_cycle')}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="cash-sync"
              size={16}
              color={viewMode === 'salary_cycle' ? (isDark ? '#FFFFFF' : '#0F172A') : '#64748B'}
            />
            <Text style={[styles.modeTabText, viewMode === 'salary_cycle' && (isDark ? styles.modeTabTextActiveDark : styles.modeTabTextActive)]}>
              Payday Cycle
            </Text>
          </TouchableOpacity>
        </View>

        {/* 4. Month Navigator */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={handlePrevMonth} style={[styles.navArrow, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: isDark ? colors.border : '#E2E8F0' }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={20} color={isDark ? colors.text : '#0F172A'} />
          </TouchableOpacity>
          <Text style={[styles.monthNavTitle, { color: isDark ? colors.text : '#0F172A' }]}>{monthTitle}</Text>
          <TouchableOpacity onPress={handleNextMonth} style={[styles.navArrow, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: isDark ? colors.border : '#E2E8F0' }]} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-forward" size={20} color={isDark ? colors.text : '#0F172A'} />
          </TouchableOpacity>
        </View>

        {/* 5. Calendar Grid */}
        <View style={[styles.calendarCard, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: isDark ? colors.border : '#F1F5F9' }]}>
          {/* Weekday Labels */}
          <View style={[styles.weekdayRow, { borderBottomColor: isDark ? colors.border : '#F1F5F9' }]}>
            {DAYS_OF_WEEK.map((day, idx) => (
              <Text
                key={day}
                style={[
                  styles.weekdayLabel,
                  (idx === 0 || idx === 6) && styles.weekendLabel,
                ]}
              >
                {day}
              </Text>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.gridContainer}>
            {calendarDays.map((item, idx) => {
              if (item.dayNumber === null) {
                return <View key={`empty-${idx}`} style={styles.dayCellEmpty} />;
              }

              const isSelected = item.dateKey === selectedDateKey;
              const hasDebits = (item.data?.debits || 0) > 0;
              const hasCredits = (item.data?.credits || 0) > 0;
              const isPastOrToday = new Date(item.dateKey).setHours(0, 0, 0, 0) <= new Date().setHours(0, 0, 0, 0);
              const isNoSpend = isPastOrToday && !hasDebits && !hasCredits;

              return (
                <TouchableOpacity
                  key={item.dateKey}
                  style={[
                    styles.dayCell,
                    isDark && styles.dayCellDark,
                    isNoSpend && (isDark ? styles.dayCellNoSpendDark : styles.dayCellNoSpend),
                    hasDebits && (isDark ? styles.dayCellDebitsDark : styles.dayCellDebits),
                    hasCredits && !hasDebits && (isDark ? styles.dayCellCreditsDark : styles.dayCellCredits),
                    item.isToday && styles.dayCellToday,
                    isSelected && styles.dayCellSelected,
                  ]}
                  onPress={() => setSelectedDateKey(item.dateKey)}
                  activeOpacity={0.7}
                >
                  {/* Account Created Milestone Indicator */}
                  {item.isAccountCreated && (
                    <View style={styles.joinedBadge}>
                      <Ionicons name="sparkles" size={10} color={isSelected ? '#FDE047' : '#F59E0B'} />
                    </View>
                  )}

                  {/* Day Number */}
                  <Text
                    style={[
                      styles.dayNumberText,
                      isDark && { color: colors.text },
                      item.isToday && styles.dayNumberTextToday,
                      isSelected && styles.dayNumberTextSelected,
                    ]}
                  >
                    {item.dayNumber}
                  </Text>

                  {/* Financial Metrics in Cell */}
                  <View style={styles.cellNumbers}>
                    {hasDebits && (
                      <View style={[styles.debitPill, isSelected && styles.debitPillSelected]}>
                        <Text
                          style={[styles.debitAmount, isSelected && styles.amountSelected]}
                          numberOfLines={1}
                        >
                          -{formatCurrency(item.data!.debits)}
                        </Text>
                      </View>
                    )}
                    {hasCredits && (
                      <View style={[styles.creditPill, isSelected && styles.creditPillSelected]}>
                        <Text
                          style={[styles.creditAmount, isSelected && styles.amountSelected]}
                          numberOfLines={1}
                        >
                          +{formatCurrency(item.data!.credits)}
                        </Text>
                      </View>
                    )}

                    {/* Expected Bills (Faded indicator) */}
                    {item.expectedBills && item.expectedBills.length > 0 && (
                      <View style={[styles.expectedPill, isSelected && styles.expectedPillSelected]}>
                        <Feather name="zap" size={8} color={isSelected ? '#C7D2FE' : '#6366F1'} style={{ marginRight: 2 }} />
                        <Text style={[styles.expectedText, isSelected && { color: '#FFFFFF' }]}>
                          ₹{item.expectedBills[0].amount}
                        </Text>
                      </View>
                    )}

                    {/* No Spend Shield Icon (Vector Icon, Clean & High Visibility) */}
                    {isNoSpend && !item.isAccountCreated && (
                      <View style={styles.noSpendIndicator}>
                        <MaterialCommunityIcons
                          name="shield-check"
                          size={13}
                          color={isSelected ? '#86EFAC' : '#10B981'}
                        />
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 6. Selected Date Details Drawer */}
        <View style={[styles.dayInspectorCard, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: isDark ? colors.border : '#F1F5F9' }]}>
          <View style={[styles.inspectorHeader, { borderBottomColor: isDark ? colors.border : '#F1F5F9' }]}>
            <View>
              <Text style={[styles.inspectorDate, { color: isDark ? colors.text : '#0F172A' }]}>
                {new Date(selectedDateKey).toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
              {createdDateKey === selectedDateKey && (
                <View style={styles.milestoneRow}>
                  <Ionicons name="sparkles" size={13} color="#F59E0B" />
                  <Text style={styles.joinedNote}>Account created on this date</Text>
                </View>
              )}
            </View>
            <View style={styles.inspectorTotals}>
              {selectedDayData?.debits ? (
                <Text style={styles.inspectorDebit}>
                  Spent: {formatCurrency(selectedDayData.debits)}
                </Text>
              ) : null}
              {selectedDayData?.credits ? (
                <Text style={styles.inspectorCredit}>
                  Earned: {formatCurrency(selectedDayData.credits)}
                </Text>
              ) : null}
            </View>
          </View>

          {/* List of transactions on selected day */}
          {selectedDayData?.txs && selectedDayData.txs.length > 0 ? (
            <View style={styles.txListContainer}>
              {selectedDayData.txs.map((tx: any, i: number) => {
                const isExcluded = isTxExcluded(tx.id);
                return (
                  <View key={tx.id || i} style={[styles.txRow, { borderBottomColor: isDark ? colors.border : '#F8FAFC' }]}>
                    <View style={styles.txLeft}>
                      <View
                        style={[
                          styles.txIconCircle,
                          tx.type === 'credit' ? styles.txCreditIcon : styles.txDebitIcon,
                        ]}
                      >
                        <Ionicons
                          name={tx.type === 'credit' ? 'arrow-down' : 'arrow-up'}
                          size={14}
                          color={tx.type === 'credit' ? '#10B981' : '#EF4444'}
                        />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.txMerchant, { color: isDark ? colors.text : '#0F172A' }]} numberOfLines={1}>
                          {tx.merchant || 'Spends'}
                        </Text>
                        <Text style={styles.txCategory}>
                          {tx.category ? tx.category.charAt(0).toUpperCase() + tx.category.slice(1) : 'General'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.txRight}>
                      <Text
                        style={[
                          styles.txAmount,
                          tx.type === 'credit' ? styles.txCreditAmount : styles.txDebitAmount,
                        ]}
                      >
                        {formatCurrency(Number(tx.amount || 0), true)}
                      </Text>
                      {/* One-tap Exclude from Records toggle */}
                      {tx.type === 'debit' && (
                        <TouchableOpacity
                          style={[styles.excludePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' }]}
                          onPress={() => toggleExcludeRecordTx(tx.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.excludeText, isExcluded && styles.excludeActive]}>
                            {isExcluded ? 'Excluded' : 'Exclude'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.noTxPlaceholder}>
              <View style={styles.noTxIconCircle}>
                <MaterialCommunityIcons name="shield-check-outline" size={26} color="#10B981" />
              </View>
              <Text style={[styles.noTxTitle, { color: isDark ? colors.text : '#0F172A' }]}>Zero Spending Day</Text>
              <Text style={styles.noTxText}>No debit transactions recorded on this day.</Text>
            </View>
          )}
        </View>

        {/* 7. Celebrated Wins & Positive Records */}
        <Text style={[styles.sectionTitle, { color: isDark ? colors.text : '#0F172A' }]}>All-Time Records & Wins</Text>

        <View style={styles.recordsGrid}>
          {/* Win 1: Longest No-Spend Streak */}
          <View style={[styles.recordCard, styles.winCard, isDark && styles.recordCardDark]}>
            <View style={styles.recordIconHeader}>
              <View style={styles.recordIconPillOrange}>
                <Ionicons name="flame" size={16} color="#EA580C" />
              </View>
              <View style={styles.winBadge}>
                <Text style={styles.winBadgeText}>WIN</Text>
              </View>
            </View>
            <Text style={[styles.recordValue, { color: isDark ? colors.text : '#0F172A' }]}>
              {records.longestNoSpendStreak > 0
                ? `${records.longestNoSpendStreak} ${records.longestNoSpendStreak === 1 ? 'Day' : 'Days'}`
                : 'N/A'}
            </Text>
            <Text style={styles.recordLabel}>Longest No-Spend Streak</Text>
            <Text style={styles.recordContext}>
              {records.currentNoSpendStreak > 0
                ? `${records.currentNoSpendStreak} ${records.currentNoSpendStreak === 1 ? 'day' : 'days'} currently active`
                : records.longestNoSpendStreak > 0
                ? 'All-time zero spend streak'
                : 'N/A'}
            </Text>
          </View>

          {/* Win 2: Best Savings Month */}
          <View style={[styles.recordCard, styles.winCard, isDark && styles.recordCardDark]}>
            <View style={styles.recordIconHeader}>
              <View style={styles.recordIconPillGreen}>
                <Ionicons name="trophy" size={16} color="#10B981" />
              </View>
              <View style={styles.winBadge}>
                <Text style={styles.winBadgeText}>SAVINGS</Text>
              </View>
            </View>
            <Text style={[styles.recordValue, { color: isDark ? colors.text : '#0F172A' }]}>
              {bestSavingsMonth ? `${bestSavingsMonth.rate}%` : 'N/A'}
            </Text>
            <Text style={styles.recordLabel}>Best Savings Month</Text>
            <Text style={styles.recordContext}>
              {bestSavingsMonth
                ? `${bestSavingsMonth.monthKey} · Saved ${formatCurrency(bestSavingsMonth.saved)}`
                : 'N/A'}
            </Text>
          </View>
        </View>

        {/* High-Spending Peak Records with Context */}
        <View style={styles.recordsGrid}>
          {/* Peak 1: Highest Spending Day of All Time */}
          <View style={[styles.recordCard, isDark && styles.recordCardDark]}>
            <View style={styles.recordIconHeader}>
              <View style={styles.recordIconPillRed}>
                <Ionicons name="trending-down" size={16} color="#EF4444" />
              </View>
              <View style={styles.peakBadge}>
                <Text style={styles.peakBadgeText}>PEAK DAY</Text>
              </View>
            </View>
            <Text style={[styles.recordValue, { color: isDark ? colors.text : '#0F172A' }]}>
              {peakDay && peakDay.amount > 0 ? formatCurrency(peakDay.amount) : 'N/A'}
            </Text>
            <Text style={styles.recordLabel}>Highest Spend Day</Text>
            <Text style={styles.recordContext}>
              {peakDay && peakDay.amount > 0
                ? `${peakDay.date} · ${peakDay.tx?.merchant || 'Top item'}`
                : 'N/A'}
            </Text>
          </View>

          {/* Peak 2: Highest Spending Week */}
          <View style={[styles.recordCard, isDark && styles.recordCardDark]}>
            <View style={styles.recordIconHeader}>
              <View style={styles.recordIconPillPurple}>
                <Ionicons name="bar-chart" size={16} color="#6366F1" />
              </View>
              <View style={styles.peakBadge}>
                <Text style={styles.peakBadgeText}>PEAK WEEK</Text>
              </View>
            </View>
            <Text style={[styles.recordValue, { color: isDark ? colors.text : '#0F172A' }]}>
              {peakWeek && peakWeek.spent > 0 ? formatCurrency(peakWeek.spent) : 'N/A'}
            </Text>
            <Text style={styles.recordLabel}>Highest Spend Week</Text>
            <Text style={styles.recordContext}>
              {peakWeek && peakWeek.spent > 0 ? `${peakWeek.weekKey}` : 'N/A'}
            </Text>
          </View>
        </View>

        {/* 8. Monthly Financial Comparison Table */}
        <Text style={[styles.sectionTitle, { color: isDark ? colors.text : '#0F172A' }]}>Monthly Comparison Table</Text>

        <View style={[styles.tableCard, { backgroundColor: isDark ? colors.card : '#FFFFFF', borderColor: isDark ? colors.border : '#F1F5F9' }]}>
          <View style={[styles.tableHeaderRow, { borderBottomColor: isDark ? colors.border : '#F1F5F9' }]}>
            <Text style={[styles.th, { flex: 1.3 }]}>Month</Text>
            <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Spent</Text>
            <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Earned</Text>
            <Text style={[styles.th, { flex: 1.1, textAlign: 'right' }]}>Savings</Text>
          </View>

          {records.monthRows.length > 0 ? (
            records.monthRows.map((row, idx) => (
              <View key={row.monthKey} style={[styles.tableRow, idx % 2 === 1 && (isDark ? styles.tableRowAltDark : styles.tableRowAlt)]}>
                <Text style={[styles.td, styles.tdMonth, { flex: 1.3, color: isDark ? colors.text : '#0F172A' }]}>{row.monthLabel}</Text>
                <Text style={[styles.td, styles.tdSpent, { flex: 1.2 }]}>
                  {formatCurrency(row.spent)}
                </Text>
                <Text style={[styles.td, styles.tdEarned, { flex: 1.2 }]}>
                  {formatCurrency(row.earned)}
                </Text>
                <View style={[styles.savingsRateCell, { flex: 1.1 }]}>
                  <Text
                    style={[
                      styles.savingsRateText,
                      row.savingsRate >= 50 ? styles.savingsRateHigh : styles.savingsRateNormal,
                    ]}
                  >
                    {row.savingsRate}%
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyTableText}>No monthly history available yet.</Text>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    padding: 6,
  },
  headerTitleGroup: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconAction: {
    padding: 6,
    marginLeft: 8,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 30,
  },
  salaryBanner: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  salaryBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  salaryBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  salaryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
    marginLeft: 6,
  },
  todayPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  todayPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  salaryNumbersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  salaryHeadline: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  salarySublabel: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 2,
  },
  dailyAllowanceBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  allowanceNumber: {
    fontSize: 16,
    fontWeight: '800',
    color: '#10B981',
  },
  allowanceLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#A7F3D0',
    marginTop: 1,
  },
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 3,
    marginBottom: 14,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 11,
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  modeTabActiveDark: {
    backgroundColor: '#1E293B',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginLeft: 6,
  },
  modeTabTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  modeTabTextActiveDark: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  navArrow: {
    padding: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  monthNavTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 6,
  },
  weekdayLabel: {
    width: '13.4%',
    marginHorizontal: '0.44%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  weekendLabel: {
    color: '#94A3B8',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCellEmpty: {
    width: '13.4%',
    marginHorizontal: '0.44%',
    height: 60,
    marginVertical: 3,
  },
  dayCell: {
    width: '13.4%',
    marginHorizontal: '0.44%',
    height: 60,
    padding: 2.5,
    alignItems: 'center',
    justifyContent: 'flex-start',
    borderRadius: 10,
    marginVertical: 3,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dayCellDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  dayCellDebits: {
    backgroundColor: '#FFF7F7',
    borderColor: '#FECDD3',
  },
  dayCellDebitsDark: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  dayCellCredits: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  dayCellCreditsDark: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  dayCellNoSpend: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  dayCellNoSpendDark: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  dayCellToday: {
    borderWidth: 2,
    borderColor: '#00BAF2',
    backgroundColor: 'rgba(0, 186, 242, 0.08)',
  },
  dayCellSelected: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  dayNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  dayNumberTextSelected: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  dayNumberTextToday: {
    color: '#00BAF2',
    fontWeight: '900',
  },
  cellNumbers: {
    width: '100%',
    alignItems: 'center',
    marginTop: 1,
  },
  debitPill: {
    paddingHorizontal: 2,
    borderRadius: 3,
    marginTop: 1,
  },
  debitPillSelected: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  debitAmount: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#DC2626',
    textAlign: 'center',
  },
  creditPill: {
    paddingHorizontal: 2,
    borderRadius: 3,
    marginTop: 1,
  },
  creditPillSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  creditAmount: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#059669',
    textAlign: 'center',
  },
  amountSelected: {
    color: '#FFFFFF',
  },
  joinedBadge: {
    position: 'absolute',
    top: 1,
    right: 2,
  },
  expectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
    marginTop: 1,
  },
  expectedPillSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  expectedText: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#6366F1',
  },
  noSpendIndicator: {
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayInspectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inspectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  inspectorDate: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  joinedNote: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
    marginLeft: 4,
  },
  inspectorTotals: {
    alignItems: 'flex-end',
  },
  inspectorDebit: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
  inspectorCredit: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
    marginTop: 2,
  },
  txListContainer: {
    paddingTop: 10,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  txIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txDebitIcon: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  txCreditIcon: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  txMerchant: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  txCategory: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  txDebitAmount: {
    color: '#EF4444',
  },
  txCreditAmount: {
    color: '#10B981',
  },
  excludePill: {
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  excludeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  excludeActive: {
    color: '#EF4444',
  },
  noTxPlaceholder: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  noTxIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  noTxTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  noTxText: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#64748B',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  recordsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  recordCard: {
    flex: 0.485,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  recordCardDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  winCard: {
    borderColor: 'rgba(16, 185, 129, 0.3)',
    backgroundColor: 'rgba(16, 185, 129, 0.02)',
  },
  recordIconHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recordIconPillOrange: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordIconPillGreen: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordIconPillRed: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordIconPillPurple: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  winBadge: {
    backgroundColor: '#10B981',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  winBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  peakBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  peakBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  recordValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  recordLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  recordContext: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 3,
  },
  tableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  th: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  tableRowAlt: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
  },
  tableRowAltDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
  },
  td: {
    fontSize: 12,
    fontWeight: '600',
  },
  tdMonth: {
    color: '#0F172A',
    fontWeight: '700',
  },
  tdSpent: {
    color: '#EF4444',
    textAlign: 'right',
  },
  tdEarned: {
    color: '#10B981',
    textAlign: 'right',
  },
  savingsRateCell: {
    alignItems: 'flex-end',
  },
  savingsRateText: {
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  savingsRateHigh: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#10B981',
  },
  savingsRateNormal: {
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    color: '#64748B',
  },
  emptyTableText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#94A3B8',
    paddingVertical: 16,
  },
});
