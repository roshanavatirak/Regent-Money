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
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../store';
import { authService } from '../services/authService';
import { syncService } from '../services/syncService';
import { getBackendUrl } from '../config/api';

const BACKEND_URL = getBackendUrl();

export interface EditableTransactionItem {
  id: string;
  date: string;
  amount: string;
  type: 'debit' | 'credit';
  merchant: string;
  category: string;
  balanceAfter: string;
}

export interface ReviewTransactionsModalProps {
  visible: boolean;
  onClose: () => void;
  bank: any | null;
  rawTransactions: Array<{
    id?: string;
    date: string;
    amount: number;
    type: 'debit' | 'credit';
    merchant: string;
    category?: string;
    balanceAfter?: number | null;
  }>;
  detectedFinalBalance?: number | null;
  onConfirmSuccess: (summary: {
    addedTransactionsCount: number;
    addedIncomeCount: number;
    updatedBalance: number;
  }) => void;
}

const CATEGORIES = [
  { id: 'transfer', label: 'Transfer' },
  { id: 'food', label: 'Food' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'transport', label: 'Travel' },
  { id: 'utilities', label: 'Bills' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'salary', label: 'Salary' },
  { id: 'investment', label: 'Investment' },
  { id: 'health', label: 'Health' },
  { id: 'general', label: 'General' },
];

export const ReviewTransactionsModal: React.FC<ReviewTransactionsModalProps> = ({
  visible,
  onClose,
  bank,
  rawTransactions,
  detectedFinalBalance,
  onConfirmSuccess,
}) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [items, setItems] = useState<EditableTransactionItem[]>([]);
  const [statementBalance, setStatementBalance] = useState<string>('');
  const [applyStatementBalance, setApplyStatementBalance] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (visible && rawTransactions) {
      setItems(
        rawTransactions.map((tx, idx) => ({
          id: tx.id || `item_${Date.now()}_${idx}`,
          date: tx.date || new Date().toISOString().split('T')[0],
          amount: String(tx.amount || ''),
          type: tx.type === 'credit' ? 'credit' : 'debit',
          merchant: tx.merchant || '',
          category: tx.category || 'transfer',
          balanceAfter:
            tx.balanceAfter !== undefined && tx.balanceAfter !== null
              ? String(tx.balanceAfter)
              : '',
        }))
      );

      if (detectedFinalBalance !== undefined && detectedFinalBalance !== null) {
        setStatementBalance(String(detectedFinalBalance));
        setApplyStatementBalance(true);
      } else {
        // Fallback: check if the last item has balanceAfter
        const lastWithBalance = [...rawTransactions]
          .reverse()
          .find((t) => t.balanceAfter !== undefined && t.balanceAfter !== null);
        if (lastWithBalance && lastWithBalance.balanceAfter !== undefined && lastWithBalance.balanceAfter !== null) {
          setStatementBalance(String(lastWithBalance.balanceAfter));
          setApplyStatementBalance(true);
        } else {
          setStatementBalance('');
          setApplyStatementBalance(false);
        }
      }
    }
  }, [visible, rawTransactions, detectedFinalBalance]);

  // Calculations for live summary header
  const totals = useMemo(() => {
    let debitsSum = 0;
    let creditsSum = 0;
    let validCount = 0;

    items.forEach((item) => {
      const val = parseFloat(item.amount);
      if (!isNaN(val) && val > 0) {
        validCount++;
        if (item.type === 'debit') {
          debitsSum += val;
        } else {
          creditsSum += val;
        }
      }
    });

    return { debitsSum, creditsSum, validCount, totalCount: items.length };
  }, [items]);

  const updateItem = (id: string, field: keyof EditableTransactionItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const addNewItem = () => {
    const today = new Date().toISOString().split('T')[0];
    const newItem: EditableTransactionItem = {
      id: `manual_new_${Date.now()}`,
      date: today,
      amount: '',
      type: 'debit',
      merchant: '',
      category: 'transfer',
      balanceAfter: '',
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleConfirmSave = async () => {
    if (!bank?.id) {
      Alert.alert('Error', 'Bank account information is missing.');
      return;
    }

    if (items.length === 0) {
      Alert.alert('No Transactions', 'There are no transactions to import.');
      return;
    }

    // Validate inputs
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const amt = parseFloat(item.amount);
      if (isNaN(amt) || amt <= 0) {
        Alert.alert(
          'Invalid Amount',
          `Row #${i + 1} has an invalid amount. Please enter an amount greater than 0.`
        );
        return;
      }
      if (!item.merchant.trim()) {
        Alert.alert(
          'Merchant Required',
          `Row #${i + 1} requires a merchant or transaction description.`
        );
        return;
      }
    }

    try {
      setSaving(true);
      const token = authService.getAccessToken();
      if (!token) throw new Error('Session authentication missing.');

      const parsedFinalBalance =
        applyStatementBalance && statementBalance.trim() !== ''
          ? parseFloat(statementBalance)
          : undefined;

      const payload = {
        bankProfileId: bank.id,
        transactions: items.map((it) => ({
          amount: parseFloat(it.amount),
          type: it.type,
          date: it.date.trim(),
          merchant: it.merchant.trim(),
          category: it.category,
          balanceAfter: it.balanceAfter.trim() ? parseFloat(it.balanceAfter) : null,
        })),
        updatedBalance: !isNaN(parsedFinalBalance as number) ? parsedFinalBalance : undefined,
      };

      const res = await fetch(`${BACKEND_URL}/sync/ocr-sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resJson.message || 'Failed to save transactions.');
      }

      await syncService.sync();

      onConfirmSuccess({
        addedTransactionsCount: resJson.addedTransactionsCount || 0,
        addedIncomeCount: resJson.addedIncomeCount || 0,
        updatedBalance: resJson.updatedBalance ?? bank.currentBalance,
      });

      onClose();
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Unable to import reviewed transactions.');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingWrap}
        >
          <View style={[styles.modalContainer, { height: windowHeight * 0.92, paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="check-circle" size={18} color="#2dba4e" />
                <Text style={styles.headerTitle}>Review Transactions</Text>
              </View>
              <Text style={styles.headerSubtitle}>
                {bank?.bankName || 'Account'} • {totals.totalCount} entries detected
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Feather name="x" size={20} color="#8E8E9F" />
            </TouchableOpacity>
          </View>

          {/* Statement Ending Balance Card */}
          <View style={styles.statementBalanceCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.balanceCardLabel}>Real Ending Statement Balance</Text>
                <Text style={styles.balanceCardHint}>
                  Captured from statement balance column. Replaces account balance with real bank value.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setApplyStatementBalance(!applyStatementBalance)}
                style={[
                  styles.toggleChip,
                  applyStatementBalance ? styles.toggleChipActive : styles.toggleChipInactive,
                ]}
                activeOpacity={0.8}
              >
                <Feather
                  name={applyStatementBalance ? 'check-square' : 'square'}
                  size={16}
                  color={applyStatementBalance ? '#2dba4e' : '#8E8E9F'}
                />
                <Text
                  style={[
                    styles.toggleChipText,
                    applyStatementBalance ? { color: '#2dba4e' } : { color: '#8E8E9F' },
                  ]}
                >
                  {applyStatementBalance ? 'Apply to Bank' : 'Ignore'}
                </Text>
              </TouchableOpacity>
            </View>

            {applyStatementBalance && (
              <View style={styles.balanceInputRow}>
                <Text style={styles.currencyPrefix}>₹</Text>
                <TextInput
                  style={styles.balanceInput}
                  value={statementBalance}
                  onChangeText={setStatementBalance}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
            )}
          </View>

          {/* Totals Summary Ribbon */}
          <View style={styles.summaryRibbon}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Debits</Text>
              <Text style={[styles.summaryVal, { color: '#ef4444' }]}>
                -₹{totals.debitsSum.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Credits</Text>
              <Text style={[styles.summaryVal, { color: '#2dba4e' }]}>
                +₹{totals.creditsSum.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Net Flow</Text>
              <Text
                style={[
                  styles.summaryVal,
                  {
                    color:
                      totals.creditsSum - totals.debitsSum >= 0 ? '#2dba4e' : '#ef4444',
                  },
                ]}
              >
                {totals.creditsSum - totals.debitsSum >= 0 ? '+' : '-'}₹
                {Math.abs(totals.creditsSum - totals.debitsSum).toLocaleString('en-IN', {
                  maximumFractionDigits: 2,
                })}
              </Text>
            </View>
          </View>

          {/* List of Editable Items */}
          <ScrollView
            style={styles.scrollList}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {items.map((item, idx) => {
              const isDebit = item.type === 'debit';
              return (
                <View key={item.id} style={styles.itemCard}>
                  {/* Item Header & Delete */}
                  <View style={styles.itemHeader}>
                    <View style={styles.indexBadge}>
                      <Text style={styles.indexText}>#{idx + 1}</Text>
                    </View>

                    {/* Debit / Credit Switcher */}
                    <View style={styles.typeSwitcher}>
                      <TouchableOpacity
                        onPress={() => updateItem(item.id, 'type', 'debit')}
                        style={[
                          styles.typeBtn,
                          isDebit && styles.typeBtnDebitActive,
                        ]}
                        activeOpacity={0.8}
                      >
                        <Feather
                          name="arrow-down-left"
                          size={14}
                          color={isDebit ? '#ffffff' : '#8E8E9F'}
                        />
                        <Text style={[styles.typeBtnText, isDebit && { color: '#ffffff' }]}>
                          Debit (Spent)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => updateItem(item.id, 'type', 'credit')}
                        style={[
                          styles.typeBtn,
                          !isDebit && styles.typeBtnCreditActive,
                        ]}
                        activeOpacity={0.8}
                      >
                        <Feather
                          name="arrow-up-right"
                          size={14}
                          color={!isDebit ? '#ffffff' : '#8E8E9F'}
                        />
                        <Text style={[styles.typeBtnText, !isDebit && { color: '#ffffff' }]}>
                          Credit (Received)
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      onPress={() => removeItem(item.id)}
                      style={styles.deleteRowBtn}
                      activeOpacity={0.7}
                      accessibilityLabel="Remove transaction"
                    >
                      <Feather name="trash-2" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>

                  {/* Amount & Date Row */}
                  <View style={styles.inputGridRow}>
                    <View style={{ flex: 1.2, marginRight: 10 }}>
                      <Text style={styles.fieldLabel}>Amount (₹)</Text>
                      <View style={styles.inputContainer}>
                        <Text style={[styles.inlineCurrency, { color: isDebit ? '#ef4444' : '#2dba4e' }]}>
                          {isDebit ? '-' : '+'}₹
                        </Text>
                        <TextInput
                          style={styles.textInput}
                          value={item.amount}
                          onChangeText={(v) => updateItem(item.id, 'amount', v)}
                          keyboardType="numeric"
                          placeholder="0.00"
                          placeholderTextColor={colors.textTertiary}
                        />
                      </View>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
                      <View style={styles.inputContainer}>
                        <Feather name="calendar" size={14} color="#8E8E9F" style={{ marginRight: 6 }} />
                        <TextInput
                          style={styles.textInput}
                          value={item.date}
                          onChangeText={(v) => updateItem(item.id, 'date', v)}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.textTertiary}
                        />
                      </View>
                    </View>
                  </View>

                  {/* Merchant / Payee Description */}
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.fieldLabel}>Merchant / Payee / Description</Text>
                    <View style={styles.inputContainer}>
                      <TextInput
                        style={styles.textInput}
                        value={item.merchant}
                        onChangeText={(v) => updateItem(item.id, 'merchant', v)}
                        placeholder="e.g. Swiggy, Salary, UPI Transfer"
                        placeholderTextColor={colors.textTertiary}
                      />
                    </View>
                  </View>

                  {/* Category Pills */}
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.fieldLabel}>Category</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 6, paddingVertical: 4 }}
                    >
                      {CATEGORIES.map((cat) => {
                        const active = item.category === cat.id;
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            onPress={() => updateItem(item.id, 'category', cat.id)}
                            style={[
                              styles.catChip,
                              active && styles.catChipActive,
                            ]}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.catChipText,
                                active && styles.catChipTextActive,
                              ]}
                            >
                              {cat.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* Balance After Transaction */}
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.fieldLabel}>
                      Statement Balance After This Tx (Optional ₹)
                    </Text>
                    <View style={styles.inputContainer}>
                      <Text style={styles.inlineCurrency}>₹</Text>
                      <TextInput
                        style={styles.textInput}
                        value={item.balanceAfter}
                        onChangeText={(v) => updateItem(item.id, 'balanceAfter', v)}
                        keyboardType="numeric"
                        placeholder="e.g. 5,523.43"
                        placeholderTextColor={colors.textTertiary}
                      />
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Add Another Transaction Button */}
            <TouchableOpacity
              onPress={addNewItem}
              style={styles.addBtn}
              activeOpacity={0.8}
            >
              <Feather name="plus-circle" size={18} color={colors.accent || '#03DAC6'} />
              <Text style={styles.addBtnText}>Add Another Transaction</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Footer Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.cancelBtn}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelBtnText}>Discard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleConfirmSave}
              style={[styles.saveBtn, saving && { opacity: 0.7 }]}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Feather name="check" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.saveBtnText}>
                    Confirm & Save ({totals.totalCount})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'flex-end',
      ...(Platform.OS === 'web' ? { height: '100dvh' as any, width: '100vw' as any, position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0 } : {}),
    },
    keyboardAvoidingWrap: {
      width: '100%',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: isDark ? '#121217' : '#ffffff',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      display: 'flex',
      flexDirection: 'column',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#23232c' : '#f0f0f4',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
    },
    headerSubtitle: {
      fontSize: 13,
      color: colors.textSecondary || '#8E8E9F',
      marginTop: 2,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? '#1f1f28' : '#f4f4f8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statementBalanceCard: {
      marginHorizontal: 16,
      marginTop: 12,
      padding: 14,
      borderRadius: 16,
      backgroundColor: isDark ? '#181822' : '#f6f7fb',
      borderWidth: 1,
      borderColor: isDark ? '#2b2b3b' : '#e5e7f0',
    },
    balanceCardLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    balanceCardHint: {
      fontSize: 11,
      color: colors.textTertiary || '#8E8E9F',
      marginTop: 2,
      lineHeight: 15,
    },
    toggleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
    },
    toggleChipActive: {
      backgroundColor: 'rgba(45, 186, 78, 0.1)',
      borderColor: '#2dba4e',
    },
    toggleChipInactive: {
      backgroundColor: 'transparent',
      borderColor: isDark ? '#333344' : '#d8d8e4',
    },
    toggleChipText: {
      fontSize: 12,
      fontWeight: '700',
    },
    balanceInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 10,
      backgroundColor: isDark ? '#0e0e14' : '#ffffff',
      borderRadius: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: isDark ? '#2f2f40' : '#e0e2ec',
    },
    currencyPrefix: {
      fontSize: 18,
      fontWeight: '800',
      color: '#2dba4e',
      marginRight: 6,
    },
    balanceInput: {
      flex: 1,
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      paddingVertical: 8,
    },
    summaryRibbon: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      marginHorizontal: 16,
      marginVertical: 10,
      paddingVertical: 10,
      paddingHorizontal: 8,
      backgroundColor: isDark ? '#161620' : '#f4f5fa',
      borderRadius: 12,
    },
    summaryItem: {
      alignItems: 'center',
      flex: 1,
    },
    summaryLabel: {
      fontSize: 11,
      color: colors.textSecondary || '#8E8E9F',
      fontWeight: '600',
    },
    summaryVal: {
      fontSize: 14,
      fontWeight: '800',
      marginTop: 2,
    },
    summaryDivider: {
      width: 1,
      height: 24,
      backgroundColor: isDark ? '#262636' : '#dedee8',
    },
    scrollList: {
      flex: 1,
      paddingHorizontal: 16,
    },
    itemCard: {
      backgroundColor: isDark ? '#171721' : '#ffffff',
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: isDark ? '#262636' : '#e6e8f0',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    itemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    indexBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: isDark ? '#232332' : '#edf0f7',
    },
    indexText: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textSecondary || '#8E8E9F',
    },
    typeSwitcher: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#0f0f15' : '#f0f2f8',
      borderRadius: 8,
      padding: 2,
      gap: 4,
    },
    typeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
    },
    typeBtnDebitActive: {
      backgroundColor: '#ef4444',
    },
    typeBtnCreditActive: {
      backgroundColor: '#2dba4e',
    },
    typeBtnText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#8E8E9F',
    },
    deleteRowBtn: {
      padding: 6,
      borderRadius: 6,
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    inputGridRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    fieldLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary || '#8E8E9F',
      marginBottom: 4,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#0e0e14' : '#fcfcfd',
      borderWidth: 1,
      borderColor: isDark ? '#2a2a3b' : '#dcdfe8',
      borderRadius: 10,
      paddingHorizontal: 10,
      height: 40,
    },
    inlineCurrency: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text,
      marginRight: 4,
    },
    textInput: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      paddingVertical: 6,
    },
    catChip: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
      backgroundColor: isDark ? '#232332' : '#f0f2f8',
      borderWidth: 1,
      borderColor: 'transparent',
    },
    catChipActive: {
      backgroundColor: isDark ? 'rgba(3, 218, 198, 0.18)' : 'rgba(3, 218, 198, 0.22)',
      borderColor: colors.accent || '#03DAC6',
    },
    catChipText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary || '#8E8E9F',
    },
    catChipTextActive: {
      color: colors.accent || '#03DAC6',
      fontWeight: '700',
    },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.accent || '#03DAC6',
      borderStyle: 'dashed',
      backgroundColor: isDark ? 'rgba(3, 218, 198, 0.05)' : 'rgba(3, 218, 198, 0.08)',
      marginTop: 4,
    },
    addBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.accent || '#03DAC6',
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? '#23232c' : '#f0f0f4',
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: isDark ? '#1f1f28' : '#f0f0f5',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textSecondary || '#8E8E9F',
    },
    saveBtn: {
      flex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: '#2dba4e',
    },
    saveBtnText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#ffffff',
    },
  });
