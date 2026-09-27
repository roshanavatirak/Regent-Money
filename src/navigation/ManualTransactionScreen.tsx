import React, { useState, useMemo, useRef } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, useBankStore } from '../store';
import { authService } from '../services/authService';
import { getBackendUrl } from '../config/api';

const BACKEND_URL = getBackendUrl();

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

export const ManualTransactionScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark } = useTheme();

  const bank = route.params?.bank;
  const initialType: 'credit' | 'debit' = route.params?.initialType || 'credit';

  const [type, setType] = useState<'credit' | 'debit'>(initialType);
  const [amountStr, setAmountStr] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    initialType === 'credit' ? 'salary' : 'food'
  );
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  if (!bank) {
    navigation.goBack();
    return null;
  }

  const handleTypeChange = (newType: 'credit' | 'debit') => {
    setType(newType);
    setSelectedCategory(newType === 'credit' ? 'salary' : 'food');
  };

  const parsedAmount = parseFloat(amountStr) || 0;
  const currentBal = bank?.currentBalance ? Number(bank.currentBalance) : 0;
  const newBal = type === 'credit' ? currentBal + parsedAmount : currentBal - parsedAmount;

  const handleQuickAdd = (addVal: number) => {
    const cur = parseFloat(amountStr) || 0;
    setAmountStr(String(cur + addVal));
  };

  const handleSubmit = async () => {
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
      const updatedBalance = result.updatedBalance !== undefined ? result.updatedBalance : newBal;

      // Update Zustand bank store directly
      useBankStore.getState().updateBankBalance(bank.id, updatedBalance);

      if (typeof route.params?.onSuccess === 'function') {
        route.params.onSuccess({
          type,
          amount: parsedAmount,
          updatedBalance,
          record: result.record,
        });
      }

      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Transaction Failed', err.message || 'Unable to save manual transaction.');
    } finally {
      setLoading(false);
    }
  };

  const currentCategories = type === 'credit' ? CREDIT_CATEGORIES : DEBIT_CATEGORIES;
  const styles = getStyles(colors, isDark);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Manual Balance Entry</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {bank.bankName} (•••• {bank.accountNumberSuffix})
          </Text>
        </View>
        <View
          style={[
            styles.headerBadge,
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
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        >
          {/* Type Switcher Tabs */}
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
                size={14}
                color={type === 'credit' ? '#ffffff' : colors.textSecondary}
                style={{ marginRight: 6 }}
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
                size={14}
                color={type === 'debit' ? '#ffffff' : colors.textSecondary}
                style={{ marginRight: 6 }}
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

          {/* Amount Input Section */}
          <View style={styles.inputSection}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>AMOUNT</Text>
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

          {/* Category Selector */}
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
                      size={13}
                      color={isSelected ? activeColor : colors.textSecondary}
                      style={{ marginRight: 6 }}
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

          {/* Note / Description */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>NOTE (OPTIONAL)</Text>
            <View style={styles.textInputWrap}>
              <Feather
                name="edit-3"
                size={14}
                color={colors.textSecondary}
                style={{ marginRight: 8 }}
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

          {/* Balance Impact Live Preview */}
          <View style={styles.impactCard}>
            <View style={styles.impactRow}>
              <Text style={styles.impactLabel}>Current: ₹{currentBal.toLocaleString('en-IN')}</Text>
              <Feather name="arrow-right" size={12} color={colors.textSecondary} style={{ marginHorizontal: 8 }} />
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
                    fontSize: 11,
                    fontWeight: '700',
                    marginLeft: 6,
                    color: type === 'credit' ? '#2dba4e' : '#ef4444',
                  }}
                >
                  ({type === 'credit' ? '+' : '-'}₹{parsedAmount.toLocaleString('en-IN')})
                </Text>
              )}
            </View>
          </View>

          {/* Submit Button */}
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
                  size={16}
                  color="#ffffff"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.submitBtnText}>
                  Confirm {type === 'credit' ? 'Credit' : 'Debit'} (₹
                  {parsedAmount.toLocaleString('en-IN')})
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    headerBadge: {
      width: 32,
      height: 32,
      borderRadius: 10,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    typeSwitcherContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#12141a' : '#f0f2f5',
      borderRadius: 12,
      padding: 4,
      marginBottom: 18,
    },
    typeTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 9,
    },
    typeTabCreditActive: {
      backgroundColor: '#2dba4e',
    },
    typeTabDebitActive: {
      backgroundColor: '#ef4444',
    },
    typeTabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    typeTabTextActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    inputSection: {
      marginBottom: 18,
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    inputLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
      letterSpacing: 0.5,
    },
    quickAddRow: {
      flexDirection: 'row',
      gap: 6,
    },
    quickAddChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    },
    quickAddChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    amountInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 6,
      backgroundColor: isDark ? '#12141a' : '#f8f9fa',
    },
    currencySymbol: {
      fontSize: 26,
      fontWeight: '700',
      marginRight: 6,
    },
    amountInput: {
      flex: 1,
      fontSize: 26,
      fontWeight: '700',
      paddingVertical: 4,
    },
    categoryWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
    },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
    },
    categoryChipText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    textInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: isDark ? '#12141a' : '#f8f9fa',
      marginTop: 8,
    },
    textInputField: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
      padding: 0,
    },
    impactCard: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 20,
    },
    impactRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    impactLabel: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    impactNewVal: {
      fontSize: 13,
      fontWeight: '700',
    },
    submitBtn: {
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    },
    submitBtnText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
    },
  });
