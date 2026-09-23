import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../store';
import { authService } from '../services/authService';
import { getBackendUrl } from '../config/api';

const BACKEND_URL = getBackendUrl();

export interface ManualTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  bank: {
    id: string;
    bankName: string;
    accountNumberSuffix: string;
    currentBalance: number;
  } | null;
  initialType?: 'credit' | 'debit';
  onSuccess: (data: {
    type: 'credit' | 'debit';
    amount: number;
    updatedBalance: number;
    record: any;
  }) => void;
}

interface CategoryOption {
  id: string;
  label: string;
  iconName: any;
}

const CREDIT_CATEGORIES: CategoryOption[] = [
  { id: 'salary', label: 'Salary', iconName: 'briefcase' },
  { id: 'friend', label: 'From Friend', iconName: 'users' },
  { id: 'freelance', label: 'Freelance', iconName: 'monitor' },
  { id: 'investment', label: 'Investment', iconName: 'trending-up' },
  { id: 'cashback', label: 'Refund/Cashback', iconName: 'refresh-cw' },
  { id: 'other_income', label: 'Other Earning', iconName: 'gift' },
];

const DEBIT_CATEGORIES: CategoryOption[] = [
  { id: 'food', label: 'Food & Dining', iconName: 'coffee' },
  { id: 'utilities', label: 'Rent & Bills', iconName: 'home' },
  { id: 'transport', label: 'Travel & Cab', iconName: 'map-pin' },
  { id: 'shopping', label: 'Shopping', iconName: 'shopping-bag' },
  { id: 'entertainment', label: 'Entertainment', iconName: 'film' },
  { id: 'health', label: 'Health & Med', iconName: 'activity' },
  { id: 'other_expense', label: 'Other Expense', iconName: 'tag' },
];

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

export const ManualTransactionModal: React.FC<ManualTransactionModalProps> = ({
  visible,
  onClose,
  bank,
  initialType = 'credit',
  onSuccess,
}) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [type, setType] = useState<'credit' | 'debit'>(initialType);
  const [amountStr, setAmountStr] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('salary');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setType(initialType);
      setSelectedCategory(initialType === 'credit' ? 'salary' : 'food');
      setAmountStr('');
      setNote('');
      setLoading(false);
    }
  }, [visible, initialType]);

  const handleTypeChange = (newType: 'credit' | 'debit') => {
    setType(newType);
    if (newType === 'credit') {
      setSelectedCategory('salary');
    } else {
      setSelectedCategory('food');
    }
  };

  const parsedAmount = parseFloat(amountStr) || 0;
  const currentBal = bank?.currentBalance ? Number(bank.currentBalance) : 0;
  const newBal = type === 'credit' ? currentBal + parsedAmount : currentBal - parsedAmount;

  const handleQuickAdd = (addVal: number) => {
    const cur = parseFloat(amountStr) || 0;
    setAmountStr(String(cur + addVal));
  };

  const handleSubmit = async () => {
    if (!bank) return;

    if (parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter an amount greater than 0.');
      return;
    }

    if (!selectedCategory) {
      Alert.alert('Category Required', 'Please select a category.');
      return;
    }

    setLoading(true);
    try {
      const token = authService.getAccessToken();
      if (!token) {
        throw new Error('You must be logged in to record transactions.');
      }

      const response = await fetch(`${BACKEND_URL}/sync/manual-transaction`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bankProfileId: bank.id,
          type,
          amount: parsedAmount,
          category: selectedCategory,
          note: note.trim() || undefined,
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to record transaction (HTTP ${response.status})`);
      }

      const result = await response.json();

      onSuccess({
        type,
        amount: parsedAmount,
        updatedBalance: result.updatedBalance !== undefined ? result.updatedBalance : newBal,
        record: result.record,
      });

      onClose();
    } catch (err: any) {
      Alert.alert('Transaction Failed', err.message || 'Unable to save manual transaction.');
    } finally {
      setLoading(false);
    }
  };

  if (!bank) return null;

  const currentCategories = type === 'credit' ? CREDIT_CATEGORIES : DEBIT_CATEGORIES;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        </View>

        <View style={styles.modalCard}>
          {/* Header (Super compact) */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View
                style={[
                  styles.headerIconBadge,
                  {
                    backgroundColor:
                      type === 'credit'
                        ? 'rgba(45, 186, 78, 0.15)'
                        : 'rgba(239, 68, 68, 0.15)',
                    borderColor:
                      type === 'credit'
                        ? 'rgba(45, 186, 78, 0.35)'
                        : 'rgba(239, 68, 68, 0.35)',
                  },
                ]}
              >
                <Feather
                  name={type === 'credit' ? 'arrow-up-right' : 'arrow-down-left'}
                  size={14}
                  color={type === 'credit' ? '#2dba4e' : '#ef4444'}
                />
              </View>
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={styles.modalTitle}>Manual Balance Entry</Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {bank.bankName} (•••• {bank.accountNumberSuffix})
                </Text>
              </View>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Feather name="x" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Type Switcher Tabs (Compact) */}
            <View style={styles.typeSwitcherContainer}>
              <TouchableOpacity
                style={[
                  styles.typeTab,
                  type === 'credit' && styles.typeTabCreditActive,
                ]}
                onPress={() => handleTypeChange('credit')}
                activeOpacity={0.8}
              >
                <Feather
                  name="plus-circle"
                  size={13}
                  color={type === 'credit' ? '#ffffff' : colors.textSecondary}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={[
                    styles.typeTabText,
                    type === 'credit' && styles.typeTabTextActive,
                  ]}
                >
                  Credit (+ Add)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeTab,
                  type === 'debit' && styles.typeTabDebitActive,
                ]}
                onPress={() => handleTypeChange('debit')}
                activeOpacity={0.8}
              >
                <Feather
                  name="minus-circle"
                  size={13}
                  color={type === 'debit' ? '#ffffff' : colors.textSecondary}
                  style={{ marginRight: 5 }}
                />
                <Text
                  style={[
                    styles.typeTabText,
                    type === 'debit' && styles.typeTabTextActive,
                  ]}
                >
                  Debit (- Spend)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Amount Input Section (Compact) */}
            <View style={styles.inputSection}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>AMOUNT</Text>
                {/* Quick Add Pills inline */}
                <View style={styles.quickAddRow}>
                  {QUICK_AMOUNTS.map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={styles.quickAddChip}
                      onPress={() => handleQuickAdd(amt)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickAddChipText}>+{amt >= 1000 ? `${amt / 1000}k` : amt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.amountInputRow}>
                <Text
                  style={[
                    styles.currencySymbol,
                    { color: type === 'credit' ? '#2dba4e' : '#ef4444' },
                  ]}
                >
                  ₹
                </Text>
                <TextInput
                  style={[
                    styles.amountInput,
                    { color: type === 'credit' ? '#2dba4e' : '#ef4444' },
                  ]}
                  placeholder="0"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  value={amountStr}
                  onChangeText={(text) => setAmountStr(text.replace(/[^0-9.]/g, ''))}
                />
              </View>
            </View>

            {/* Category Selector (Compact Chips) */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>
                CATEGORY ({type === 'credit' ? 'EARNING' : 'EXPENSE'})
              </Text>
              <View style={styles.categoryWrap}>
                {currentCategories.map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  const activeColor = type === 'credit' ? '#2dba4e' : '#ef4444';
                  const activeBg =
                    type === 'credit'
                      ? 'rgba(45, 186, 78, 0.15)'
                      : 'rgba(239, 68, 68, 0.15)';

                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryChip,
                        isSelected && {
                          borderColor: activeColor,
                          backgroundColor: activeBg,
                        },
                      ]}
                      onPress={() => setSelectedCategory(cat.id)}
                      activeOpacity={0.7}
                    >
                      <Feather
                        name={cat.iconName}
                        size={12}
                        color={isSelected ? activeColor : colors.textSecondary}
                        style={{ marginRight: 5 }}
                      />
                      <Text
                        style={[
                          styles.categoryChipText,
                          isSelected && {
                            color: isDark ? '#ffffff' : '#000000',
                            fontWeight: '700',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Note / Description (Compact) */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>NOTE (OPTIONAL)</Text>
              <View style={styles.textInputWrap}>
                <Feather
                  name="edit-3"
                  size={12}
                  color={colors.textSecondary}
                  style={{ marginRight: 6 }}
                />
                <TextInput
                  style={styles.textInputField}
                  placeholder={
                    type === 'credit'
                      ? 'e.g. March Salary, Freelance, Friend'
                      : 'e.g. Swiggy, Petrol, Shopping'
                  }
                  placeholderTextColor={colors.textTertiary}
                  value={note}
                  onChangeText={setNote}
                  maxLength={50}
                />
              </View>
            </View>

            {/* Balance Impact Live Preview (Super Compact Single Line) */}
            <View style={styles.impactCard}>
              <View style={styles.impactRow}>
                <Text style={styles.impactLabel}>Current: ₹{currentBal.toLocaleString('en-IN')}</Text>
                <Feather name="arrow-right" size={11} color={colors.textSecondary} style={{ marginHorizontal: 6 }} />
                <Text style={styles.impactLabel}>New: </Text>
                <Text
                  style={[
                    styles.impactNewVal,
                    { color: type === 'credit' ? '#2dba4e' : '#ffffff' },
                  ]}
                >
                  ₹{Math.max(0, newBal).toLocaleString('en-IN')}
                </Text>
                {parsedAmount > 0 && (
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      marginLeft: 4,
                      color: type === 'credit' ? '#2dba4e' : '#ef4444',
                    }}
                  >
                    ({type === 'credit' ? '+' : '-'}₹{parsedAmount.toLocaleString('en-IN')})
                  </Text>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Submit Button (Compact) */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor: type === 'credit' ? '#2dba4e' : '#ef4444',
                  opacity: loading || parsedAmount <= 0 ? 0.6 : 1,
                },
              ]}
              onPress={handleSubmit}
              disabled={loading || parsedAmount <= 0}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather
                    name={type === 'credit' ? 'check-circle' : 'minus-circle'}
                    size={14}
                    color="#ffffff"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.submitBtnText}>
                    Confirm {type === 'credit' ? 'Credit' : 'Debit'} (₹
                    {parsedAmount.toLocaleString('en-IN')})
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
    },
    modalCard: {
      backgroundColor: isDark ? '#1a1d24' : '#ffffff',
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      borderTopWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
      paddingTop: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 24,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    },
    headerIconBadge: {
      width: 28,
      height: 28,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    modalSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 1,
    },
    closeBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 6,
    },
    typeSwitcherContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#12141a' : '#f0f2f5',
      borderRadius: 10,
      padding: 3,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
    },
    typeTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      borderRadius: 8,
    },
    typeTabCreditActive: {
      backgroundColor: '#2dba4e',
    },
    typeTabDebitActive: {
      backgroundColor: '#ef4444',
    },
    typeTabText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    typeTabTextActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    inputSection: {
      marginBottom: 8,
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    inputLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
      color: colors.textSecondary,
    },
    amountInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#12141a' : '#f7f8fa',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    },
    currencySymbol: {
      fontSize: 20,
      fontWeight: '800',
      marginRight: 6,
    },
    amountInput: {
      flex: 1,
      fontSize: 20,
      fontWeight: '800',
      padding: 0,
      height: 32,
    },
    quickAddRow: {
      flexDirection: 'row',
      gap: 5,
    },
    quickAddChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    },
    quickAddChipText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.text,
    },
    categoryWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 4,
    },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: isDark ? '#12141a' : '#f7f8fa',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    },
    categoryChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    textInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#12141a' : '#f7f8fa',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      marginTop: 3,
    },
    textInputField: {
      flex: 1,
      fontSize: 12,
      color: colors.text,
      padding: 0,
      height: 22,
    },
    impactCard: {
      backgroundColor: isDark ? '#12141a' : '#f0f2f5',
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      marginTop: 2,
      marginBottom: 4,
    },
    impactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    impactLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    impactNewVal: {
      fontSize: 12,
      fontWeight: '800',
    },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: Platform.OS === 'ios' ? 22 : 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    },
    submitBtn: {
      width: '100%',
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitBtnText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '800',
    },
  });
