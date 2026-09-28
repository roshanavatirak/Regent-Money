import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../store';

interface DobDatePickerModalProps {
  visible: boolean;
  initialDateString?: string; // DD/MM/YYYY
  onClose: () => void;
  onSelectDate: (formattedDate: string, date: Date) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS_HEADER = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * Parses DD/MM/YYYY string to Date
 */
export function parseDDMMYYYY(str?: string): Date | null {
  if (!str) return null;
  const parts = str.trim().split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (month < 0 || month > 11) return null;
  if (day < 1 || day > 31) return null;

  const d = new Date(year, month, day);
  if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
    return d;
  }
  return null;
}

/**
 * Formats a Date to DD/MM/YYYY
 */
export function formatToDDMMYYYY(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/**
 * Calculate age dynamically accounting for day and month.
 * Every day that passes, the calculation moves forward dynamically.
 */
export function calculateAge(dobInput: string | Date | null | undefined): {
  age: number | null;
  isAdult: boolean;
} {
  if (!dobInput) return { age: null, isAdult: false };
  const birthDate = typeof dobInput === 'string' ? parseDDMMYYYY(dobInput) : dobInput;
  if (!birthDate) return { age: null, isAdult: false };

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return {
    age: Math.max(0, age),
    isAdult: age >= 18,
  };
}

export const DobDatePickerModal: React.FC<DobDatePickerModalProps> = ({
  visible,
  initialDateString,
  onClose,
  onSelectDate,
}) => {
  const { colors, isDark } = useTheme();

  // Dynamic 18-year cutoff date:
  // Every day that passes, maxAllowedDate automatically moves forward by one day.
  const today = useMemo(() => new Date(), []);
  const maxAllowedDate = useMemo(() => {
    return new Date(today.getFullYear() - 18, today.getMonth(), today.getDate(), 23, 59, 59, 999);
  }, [today]);

  const minAllowedDate = useMemo(() => {
    return new Date(today.getFullYear() - 100, 0, 1);
  }, [today]);

  // Initial selection
  const parsedInitial = useMemo(() => {
    const parsed = parseDDMMYYYY(initialDateString);
    if (parsed && parsed <= maxAllowedDate && parsed >= minAllowedDate) {
      return parsed;
    }
    // Default to exactly 18 years ago from today
    return new Date(maxAllowedDate.getFullYear(), maxAllowedDate.getMonth(), maxAllowedDate.getDate());
  }, [initialDateString, maxAllowedDate, minAllowedDate]);

  const [selectedDate, setSelectedDate] = useState<Date>(parsedInitial);
  const [viewYear, setViewYear] = useState<number>(parsedInitial.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(parsedInitial.getMonth());
  const [mode, setMode] = useState<'calendar' | 'year' | 'month'>('calendar');

  // Days in currently viewed month
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const days: { day: number; date: Date; isAllowed: boolean }[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(viewYear, viewMonth, i);
      const isAllowed = d <= maxAllowedDate && d >= minAllowedDate;
      days.push({ day: i, date: d, isAllowed });
    }

    return { firstDayIndex, days };
  }, [viewYear, viewMonth, maxAllowedDate, minAllowedDate]);

  // Years array for year picker (18 years ago down to 100 years ago)
  const availableYears = useMemo(() => {
    const years: number[] = [];
    const maxYear = maxAllowedDate.getFullYear();
    const minYear = minAllowedDate.getFullYear();
    for (let y = maxYear; y >= minYear; y--) {
      years.push(y);
    }
    return years;
  }, [maxAllowedDate, minAllowedDate]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      if (viewYear > minAllowedDate.getFullYear()) {
        setViewYear((y) => y - 1);
        setViewMonth(11);
      }
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    const isAtMaxMonth =
      viewYear === maxAllowedDate.getFullYear() && viewMonth >= maxAllowedDate.getMonth();
    if (isAtMaxMonth) return;

    if (viewMonth === 11) {
      if (viewYear < maxAllowedDate.getFullYear()) {
        setViewYear((y) => y + 1);
        setViewMonth(0);
      }
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const isNextMonthDisabled =
    viewYear === maxAllowedDate.getFullYear() && viewMonth >= maxAllowedDate.getMonth();

  const handleSelectDay = (item: { day: number; date: Date; isAllowed: boolean }) => {
    if (!item.isAllowed) return;
    setSelectedDate(item.date);
  };

  const handleConfirm = () => {
    if (selectedDate <= maxAllowedDate) {
      onSelectDate(formatToDDMMYYYY(selectedDate), selectedDate);
      onClose();
    }
  };

  const styles = getStyles(colors, isDark);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Date of Birth</Text>
              <Text style={styles.subTitle}>
                Minimum age: 18 years (Born on or before {formatToDDMMYYYY(maxAllowedDate)})
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Feather name="x" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Quick Selectors (Month & Year buttons) */}
          <View style={styles.navRow}>
            <TouchableOpacity
              style={styles.navArrow}
              onPress={handlePrevMonth}
              activeOpacity={0.7}
            >
              <Feather name="chevron-left" size={18} color={colors.text} />
            </TouchableOpacity>

            <View style={styles.selectorGroup}>
              <TouchableOpacity
                style={[styles.selectorChip, mode === 'month' && styles.selectorChipActive]}
                onPress={() => setMode((m) => (m === 'month' ? 'calendar' : 'month'))}
                activeOpacity={0.8}
              >
                <Text style={styles.selectorChipText}>{MONTH_NAMES[viewMonth]}</Text>
                <Feather
                  name={mode === 'month' ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.accent}
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.selectorChip, mode === 'year' && styles.selectorChipActive]}
                onPress={() => setMode((m) => (m === 'year' ? 'calendar' : 'year'))}
                activeOpacity={0.8}
              >
                <Text style={styles.selectorChipText}>{viewYear}</Text>
                <Feather
                  name={mode === 'year' ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.accent}
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.navArrow, isNextMonthDisabled && { opacity: 0.3 }]}
              onPress={handleNextMonth}
              disabled={isNextMonthDisabled}
              activeOpacity={0.7}
            >
              <Feather name="chevron-right" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Content: Month Picker / Year Picker / Calendar Grid */}
          {mode === 'month' ? (
            <View style={styles.pickerGridContainer}>
              <Text style={styles.sectionHeading}>Select Birth Month</Text>
              <View style={styles.monthsGrid}>
                {MONTH_NAMES.map((name, idx) => {
                  const isFutureMonth =
                    viewYear === maxAllowedDate.getFullYear() && idx > maxAllowedDate.getMonth();
                  const isSelected = idx === viewMonth;
                  return (
                    <TouchableOpacity
                      key={name}
                      style={[
                        styles.monthCell,
                        isSelected && styles.monthCellSelected,
                        isFutureMonth && { opacity: 0.3 },
                      ]}
                      disabled={isFutureMonth}
                      onPress={() => {
                        setViewMonth(idx);
                        setMode('calendar');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.monthCellText,
                          isSelected && styles.monthCellTextSelected,
                        ]}
                      >
                        {name.slice(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : mode === 'year' ? (
            <View style={styles.pickerGridContainer}>
              <Text style={styles.sectionHeading}>Select Birth Year (18+)</Text>
              <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator>
                <View style={styles.yearsGrid}>
                  {availableYears.map((yr) => {
                    const isSelected = yr === viewYear;
                    return (
                      <TouchableOpacity
                        key={yr}
                        style={[styles.yearCell, isSelected && styles.yearCellSelected]}
                        onPress={() => {
                          setViewYear(yr);
                          // Adjust month if in cutoff year
                          if (yr === maxAllowedDate.getFullYear() && viewMonth > maxAllowedDate.getMonth()) {
                            setViewMonth(maxAllowedDate.getMonth());
                          }
                          setMode('calendar');
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.yearCellText,
                            isSelected && styles.yearCellTextSelected,
                          ]}
                        >
                          {yr}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          ) : (
            <View style={styles.calendarContainer}>
              {/* Day Headers */}
              <View style={styles.weekDaysRow}>
                {DAYS_HEADER.map((d) => (
                  <Text key={d} style={styles.weekDayHeader}>
                    {d}
                  </Text>
                ))}
              </View>

              {/* Grid of Days */}
              <View style={styles.daysGrid}>
                {/* Empty offset padding cells */}
                {Array.from({ length: calendarDays.firstDayIndex }).map((_, idx) => (
                  <View key={`empty-${idx}`} style={styles.dayCell} />
                ))}

                {/* Day cells */}
                {calendarDays.days.map((item) => {
                  const isSelected =
                    selectedDate.getFullYear() === item.date.getFullYear() &&
                    selectedDate.getMonth() === item.date.getMonth() &&
                    selectedDate.getDate() === item.date.getDate();

                  return (
                    <TouchableOpacity
                      key={item.day}
                      style={[
                        styles.dayCell,
                        isSelected && styles.dayCellSelected,
                        !item.isAllowed && styles.dayCellDisabled,
                      ]}
                      disabled={!item.isAllowed}
                      onPress={() => handleSelectDay(item)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dayCellText,
                          isSelected && styles.dayCellTextSelected,
                          !item.isAllowed && styles.dayCellTextDisabled,
                        ]}
                      >
                        {item.day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Selected Date Summary & Confirm */}
          <View style={styles.footerRow}>
            <View>
              <Text style={styles.selectedLabel}>Selected Date</Text>
              <Text style={styles.selectedValue}>{formatToDDMMYYYY(selectedDate)}</Text>
            </View>

            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmBtnText}>Set Date</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.4 : 0.15,
      shadowRadius: 16,
      elevation: 6,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 14,
    },
    title: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text,
    },
    subTitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
    },
    navArrow: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
    },
    selectorGroup: {
      flexDirection: 'row',
      gap: 8,
    },
    selectorChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    selectorChipActive: {
      borderColor: colors.accent,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(45, 186, 78, 0.08)',
    },
    selectorChipText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    calendarContainer: {
      paddingBottom: 8,
    },
    weekDaysRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    weekDayHeader: {
      width: '14.28%',
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    daysGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    dayCell: {
      width: '14.28%',
      height: 38,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 19,
      marginVertical: 2,
    },
    dayCellSelected: {
      backgroundColor: colors.accent,
    },
    dayCellDisabled: {
      opacity: 0.2,
    },
    dayCellText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    dayCellTextSelected: {
      color: '#ffffff',
      fontWeight: '800',
    },
    dayCellTextDisabled: {
      color: colors.textSecondary,
    },
    pickerGridContainer: {
      paddingVertical: 6,
      minHeight: 240,
    },
    sectionHeading: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 10,
      textAlign: 'center',
    },
    monthsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 8,
    },
    monthCell: {
      width: '30%',
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      alignItems: 'center',
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    monthCellSelected: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    monthCellText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
    },
    monthCellTextSelected: {
      color: '#ffffff',
    },
    yearsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 6,
    },
    yearCell: {
      width: '23%',
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      alignItems: 'center',
      marginBottom: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    yearCellSelected: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    yearCellText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
    },
    yearCellTextSelected: {
      color: '#ffffff',
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    selectedLabel: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    selectedValue: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.accent,
      marginTop: 1,
    },
    confirmBtn: {
      backgroundColor: colors.accent,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 12,
    },
    confirmBtnText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '700',
    },
  });
