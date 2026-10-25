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
  Platform,
  useWindowDimensions,
  Switch,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useTransactionStore } from '../store';
import { authService } from '../services/authService';
import { syncService } from '../services/syncService';
import { getBackendUrl } from '../config/api';

const BACKEND_URL = getBackendUrl();

export interface EditableTransactionItem {
  id: string;
  date: string;
  time: string;
  amount: string;
  type: 'debit' | 'credit';
  merchant: string;
  category: string;
  balanceAfter: string;
  referenceId?: string;
}

export interface ReviewTransactionsModalProps {
  visible: boolean;
  onClose: () => void;
  bank: any | null;
  rawTransactions: Array<{
    id?: string;
    date: string;
    time?: string | null;
    timestamp?: number | null;
    amount: number;
    type: 'debit' | 'credit';
    merchant: string;
    category?: string;
    balanceAfter?: number | null;
    referenceId?: string | null;
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

  const existingTransactions = useTransactionStore((s) => s.transactions);
  const [items, setItems] = useState<EditableTransactionItem[]>([]);
  const [updateAccountBalance, setUpdateAccountBalance] = useState<boolean>(true);
  const [useExactClosingBalance, setUseExactClosingBalance] = useState<boolean>(false);
  const [statementBalance, setStatementBalance] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  const checkIsPossibleDuplicate = (item: EditableTransactionItem): boolean => {
    const amt = parseFloat(item.amount);
    if (isNaN(amt) || amt <= 0) return false;
    const normMerchant = (item.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!normMerchant) return false;

    return existingTransactions.some((tx) => {
      if (Math.abs(Number(tx.amount) - amt) >= 0.01) return false;
      const txNorm = (tx.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (txNorm !== normMerchant) return false;

      const txDate = new Date(Number(tx.timestamp));
      if (isNaN(txDate.getTime())) return false;
      const txDay = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}-${String(txDate.getDate()).padStart(2, '0')}`;
      return item.date.includes(txDay) || txDay.includes(item.date.trim());
    });
  };

  useEffect(() => {
    if (visible && rawTransactions) {
      setItems(
        rawTransactions.map((tx, idx) => {
          let timeVal = tx.time || '';
          if (!timeVal && tx.timestamp) {
            const d = new Date(Number(tx.timestamp));
            if (!isNaN(d.getTime())) {
              const hh = String(d.getHours()).padStart(2, '0');
              const mm = String(d.getMinutes()).padStart(2, '0');
              timeVal = `${hh}:${mm}`;
            }
          }
          return {
            id: tx.id || `item_${Date.now()}_${idx}`,
            date: tx.date || new Date().toISOString().split('T')[0],
            time: timeVal,
            amount: String(tx.amount || ''),
            type: tx.type === 'credit' ? 'credit' : 'debit',
            merchant: tx.merchant || '',
            category: tx.category || 'transfer',
            balanceAfter:
              tx.balanceAfter !== undefined && tx.balanceAfter !== null
                ? String(tx.balanceAfter)
                : '',
            referenceId: tx.referenceId ? String(tx.referenceId) : '',
          };
        })
      );

      // Default balance update is ON
      setUpdateAccountBalance(true);

      if (detectedFinalBalance !== undefined && detectedFinalBalance !== null) {
        setStatementBalance(String(detectedFinalBalance));
        setUseExactClosingBalance(true);
      } else {
        // Fallback: check if the last item has balanceAfter
        const lastWithBalance = [...rawTransactions]
          .reverse()
          .find((t) => t.balanceAfter !== undefined && t.balanceAfter !== null);
        if (lastWithBalance && lastWithBalance.balanceAfter !== undefined && lastWithBalance.balanceAfter !== null) {
          setStatementBalance(String(lastWithBalance.balanceAfter));
          setUseExactClosingBalance(true);
        } else {
          setStatementBalance('');
          setUseExactClosingBalance(false);
        }
      }
    }
  }, [visible, rawTransactions, detectedFinalBalance]);

  // Calculations for live summary header & balance adjustments
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

  const currentBankBalance = useMemo(() => {
    const b = Number(bank?.currentBalance);
    return isNaN(b) ? 0 : b;
  }, [bank?.currentBalance]);

  const netFlow = totals.creditsSum - totals.debitsSum;
  const projectedBalance = currentBankBalance + netFlow;

  const parsedStatementBalance = useMemo(() => {
    if (!useExactClosingBalance || !statementBalance.trim()) return undefined;
    const p = parseFloat(statementBalance.trim());
    return isNaN(p) ? undefined : p;
  }, [useExactClosingBalance, statementBalance]);

  const finalEffectiveBalance =
    parsedStatementBalance !== undefined ? parsedStatementBalance : projectedBalance;

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
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const newItem: EditableTransactionItem = {
      id: `manual_new_${Date.now()}`,
      date: today,
      time: currentTime,
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

      const payload = {
        bankProfileId: bank.id,
        applyBalanceChange: updateAccountBalance,
        transactions: items.map((it, idx) => {
          let itemTimestamp: number | undefined = undefined;
          const trimmedDate = it.date.trim();
          const trimmedTime = it.time.trim();
          let normalizedDate = trimmedDate;

          if (trimmedDate) {
            const now = new Date();
            const currentYear = now.getFullYear();
            let y = currentYear;
            let m = now.getMonth() + 1;
            let d = now.getDate();

            const isoMatch = trimmedDate.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
            const dmyMatch = trimmedDate.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
            const textMatch = trimmedDate.match(/^(\d{1,2})\s*[-/.\s]?\s*([a-zA-Z]+)(?:\s*[-/.\s]?\s*(\d{2,4}))?$/);
            const MONTH_MAP: Record<string, number> = {
              jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
              jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
            };

            if (isoMatch) {
              y = parseInt(isoMatch[1], 10);
              m = parseInt(isoMatch[2], 10);
              d = parseInt(isoMatch[3], 10);
            } else if (dmyMatch) {
              d = parseInt(dmyMatch[1], 10);
              m = parseInt(dmyMatch[2], 10);
              y = parseInt(dmyMatch[3], 10);
              if (y < 100) y += 2000;
            } else if (textMatch) {
              d = parseInt(textMatch[1], 10);
              const mStr = textMatch[2].toLowerCase().slice(0, 3);
              m = MONTH_MAP[mStr] || (now.getMonth() + 1);
              if (textMatch[3]) {
                let yVal = parseInt(textMatch[3], 10);
                if (yVal < 100) yVal += 2000;
                y = yVal;
              } else {
                y = currentYear;
              }
            } else {
              const dt = new Date(trimmedDate);
              if (!isNaN(dt.getTime())) {
                y = dt.getFullYear();
                m = dt.getMonth() + 1;
                d = dt.getDate();
              }
            }

            // Safety clamp on year: default to current year if model drifted into distant past or future
            if (y < currentYear - 1 || y > currentYear + 1) {
              y = currentYear;
            }

            normalizedDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

            let h = 12;
            let min = Math.floor(idx / 60) % 60;
            let sec = idx % 60;
            if (trimmedTime) {
              const ampmMatch = trimmedTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
              if (ampmMatch) {
                let parsedH = parseInt(ampmMatch[1], 10);
                const parsedM = parseInt(ampmMatch[2], 10);
                const parsedS = ampmMatch[3] ? parseInt(ampmMatch[3], 10) : undefined;
                const ampm = ampmMatch[4]?.toLowerCase();
                if (ampm === 'pm' && parsedH < 12) parsedH += 12;
                if (ampm === 'am' && parsedH === 12) parsedH = 0;
                if (!isNaN(parsedH) && !isNaN(parsedM)) {
                  h = parsedH;
                  min = parsedM;
                  sec = parsedS !== undefined && !isNaN(parsedS) ? parsedS : (idx % 60);
                }
              }
            } else {
              h = 12 + Math.floor(idx / 3600);
            }
            const computed = new Date(y, m - 1, d, h, min, sec);
            if (!isNaN(computed.getTime())) {
              itemTimestamp = computed.getTime();
            }
          }

          return {
            amount: parseFloat(it.amount),
            type: it.type,
            date: normalizedDate,
            time: trimmedTime || null,
            timestamp: itemTimestamp,
            merchant: it.merchant.trim(),
            category: it.category,
            balanceAfter: it.balanceAfter.trim() ? parseFloat(it.balanceAfter) : null,
            referenceId: it.referenceId ? it.referenceId.trim() : undefined,
          };
        }),
        updatedBalance: updateAccountBalance ? finalEffectiveBalance : undefined,
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
        const raw = resJson.message || resJson.error;
        const msg = Array.isArray(raw) ? raw.join('\n') : (typeof raw === 'string' ? raw : 'Failed to save transactions.');
        throw new Error(msg);
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
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior="padding"
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

          {/* Top Master Balance Update Toggle Card */}
          <View
            style={[
              styles.masterBalanceCard,
              updateAccountBalance ? styles.masterBalanceCardActive : styles.masterBalanceCardInactive,
            ]}
          >
            <View style={styles.masterBalanceHeaderRow}>
              <View
                style={[
                  styles.masterBalanceIconWrap,
                  updateAccountBalance ? styles.masterBalanceIconActive : styles.masterBalanceIconInactive,
                ]}
              >
                <Feather
                  name={updateAccountBalance ? 'trending-up' : 'slash'}
                  size={18}
                  color={updateAccountBalance ? '#2dba4e' : '#8E8E9F'}
                />
              </View>
              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.masterBalanceTitle}>Update Account Balance</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      updateAccountBalance ? styles.statusBadgeActive : styles.statusBadgeInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        updateAccountBalance ? styles.statusBadgeTextActive : styles.statusBadgeTextInactive,
                      ]}
                    >
                      {updateAccountBalance ? 'ENABLED' : 'OFF'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.masterBalanceSubtitle}>
                  {updateAccountBalance
                    ? 'Statement transactions will adjust your bank balance'
                    : 'Records transactions only • Balance stays unchanged'}
                </Text>
              </View>
              <Switch
                value={updateAccountBalance}
                onValueChange={(val) => setUpdateAccountBalance(val)}
                trackColor={{ false: isDark ? '#2c2c38' : '#d5d7e2', true: '#2dba4e' }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={isDark ? '#2c2c38' : '#d5d7e2'}
              />
            </View>

            {updateAccountBalance ? (
              <View style={styles.balanceImpactContainer}>
                {/* Visual Impact Flow */}
                <View style={styles.impactFlowRow}>
                  <View style={styles.flowBalanceBox}>
                    <Text style={styles.flowLabel}>CURRENT</Text>
                    <Text style={styles.flowAmount}>
                      ₹{currentBankBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </Text>
                  </View>

                  <View style={styles.flowArrowBox}>
                    <Feather name="arrow-right" size={16} color={colors.textTertiary || '#8E8E9F'} />
                    <View
                      style={[
                        styles.netFlowPill,
                        netFlow >= 0 ? styles.netFlowPillCredit : styles.netFlowPillDebit,
                      ]}
                    >
                      <Text
                        style={[
                          styles.netFlowPillText,
                          netFlow >= 0 ? styles.netFlowTextCredit : styles.netFlowTextDebit,
                        ]}
                      >
                        {netFlow >= 0
                          ? `+₹${netFlow.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                          : `-₹${Math.abs(netFlow).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.flowBalanceBox, styles.flowBalanceBoxHighlight]}>
                    <Text style={styles.flowLabelHighlight}>NEW BALANCE</Text>
                    <Text style={styles.flowAmountHighlight}>
                      ₹{finalEffectiveBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                </View>

                {/* Optional Override with exact Statement Closing Balance */}
                <View style={styles.closingBalanceToggleRow}>
                  <TouchableOpacity
                    style={styles.overrideCheckbox}
                    activeOpacity={0.7}
                    onPress={() => setUseExactClosingBalance(!useExactClosingBalance)}
                  >
                    <Feather
                      name={useExactClosingBalance ? 'check-square' : 'square'}
                      size={15}
                      color={useExactClosingBalance ? '#2dba4e' : '#8E8E9F'}
                    />
                    <Text style={styles.overrideCheckboxLabel}>
                      Override with exact statement closing balance
                    </Text>
                  </TouchableOpacity>
                </View>

                {useExactClosingBalance && (
                  <View style={styles.exactBalanceInputRow}>
                    <Text style={styles.exactCurrencyPrefix}>₹</Text>
                    <TextInput
                      style={styles.exactBalanceInput}
                      value={statementBalance}
                      onChangeText={setStatementBalance}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor={colors.textTertiary}
                    />
                    {detectedFinalBalance !== undefined && detectedFinalBalance !== null && (
                      <View style={styles.detectedBadge}>
                        <Text style={styles.detectedBadgeText}>OCR Detected</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.balanceDisabledBanner}>
                <Feather name="shield" size={14} color="#8E8E9F" />
                <Text style={styles.balanceDisabledBannerText}>
                  Safe Mode: Bank balance will remain ₹{currentBankBalance.toLocaleString('en-IN')}. Only transactions will be imported.
                </Text>
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
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={styles.indexBadge}>
                        <Text style={styles.indexText}>#{idx + 1}</Text>
                      </View>
                      {checkIsPossibleDuplicate(item) && (
                        <View style={styles.duplicateWarningBadge}>
                          <Feather name="alert-triangle" size={11} color="#d97706" />
                          <Text style={styles.duplicateWarningText}>Matches existing</Text>
                        </View>
                      )}
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

                  {/* Amount Field */}
                  <View style={{ marginTop: 6 }}>
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

                  {/* Date & Time Row */}
                  <View style={[styles.inputGridRow, { marginTop: 10 }]}>
                    <View style={{ flex: 1.2, marginRight: 10 }}>
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

                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>Time (HH:MM)</Text>
                      <View style={styles.inputContainer}>
                        <Feather name="clock" size={14} color="#8E8E9F" style={{ marginRight: 6 }} />
                        <TextInput
                          style={styles.textInput}
                          value={item.time}
                          onChangeText={(v) => updateItem(item.id, 'time', v)}
                          placeholder="14:30"
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
    masterBalanceCard: {
      marginHorizontal: 16,
      marginTop: 12,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
    },
    masterBalanceCardActive: {
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.06)' : 'rgba(45, 186, 78, 0.05)',
      borderColor: isDark ? 'rgba(45, 186, 78, 0.3)' : 'rgba(45, 186, 78, 0.35)',
    },
    masterBalanceCardInactive: {
      backgroundColor: isDark ? '#161620' : '#f7f8fc',
      borderColor: isDark ? '#262633' : '#e4e6f0',
    },
    masterBalanceHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    masterBalanceIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    masterBalanceIconActive: {
      backgroundColor: 'rgba(45, 186, 78, 0.15)',
    },
    masterBalanceIconInactive: {
      backgroundColor: isDark ? '#242430' : '#ebeef5',
    },
    masterBalanceTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text,
    },
    statusBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    statusBadgeActive: {
      backgroundColor: 'rgba(45, 186, 78, 0.18)',
    },
    statusBadgeInactive: {
      backgroundColor: isDark ? '#272736' : '#e5e7f0',
    },
    statusBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    statusBadgeTextActive: {
      color: '#2dba4e',
    },
    statusBadgeTextInactive: {
      color: '#8E8E9F',
    },
    masterBalanceSubtitle: {
      fontSize: 11,
      color: colors.textSecondary || '#8E8E9F',
      marginTop: 2,
      lineHeight: 15,
    },
    balanceImpactContainer: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    },
    impactFlowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? '#0e0e14' : '#ffffff',
      padding: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#262635' : '#e6e8f2',
    },
    flowBalanceBox: {
      flex: 1,
      alignItems: 'flex-start',
    },
    flowBalanceBoxHighlight: {
      alignItems: 'flex-end',
    },
    flowLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textTertiary || '#8E8E9F',
      letterSpacing: 0.4,
      marginBottom: 2,
    },
    flowLabelHighlight: {
      fontSize: 10,
      fontWeight: '800',
      color: '#2dba4e',
      letterSpacing: 0.4,
      marginBottom: 2,
    },
    flowAmount: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    flowAmountHighlight: {
      fontSize: 14,
      fontWeight: '900',
      color: '#2dba4e',
    },
    flowArrowBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    netFlowPill: {
      marginTop: 2,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    netFlowPillCredit: {
      backgroundColor: 'rgba(45, 186, 78, 0.12)',
    },
    netFlowPillDebit: {
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
    },
    netFlowPillText: {
      fontSize: 10,
      fontWeight: '800',
    },
    netFlowTextCredit: {
      color: '#2dba4e',
    },
    netFlowTextDebit: {
      color: '#ef4444',
    },
    closingBalanceToggleRow: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
    },
    overrideCheckbox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 4,
    },
    overrideCheckboxLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary || '#8E8E9F',
    },
    exactBalanceInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 6,
      backgroundColor: isDark ? '#0a0a0f' : '#ffffff',
      borderRadius: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: isDark ? '#2f2f40' : '#e0e2ec',
    },
    exactCurrencyPrefix: {
      fontSize: 16,
      fontWeight: '800',
      color: '#2dba4e',
      marginRight: 6,
    },
    exactBalanceInput: {
      flex: 1,
      fontSize: 15,
      fontWeight: '800',
      color: colors.text,
      paddingVertical: 6,
    },
    detectedBadge: {
      backgroundColor: 'rgba(45, 186, 78, 0.15)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    detectedBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#2dba4e',
    },
    balanceDisabledBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
    },
    balanceDisabledBannerText: {
      flex: 1,
      fontSize: 11,
      color: colors.textTertiary || '#8E8E9F',
      lineHeight: 15,
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
    duplicateWarningBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fef3c7',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(245, 158, 11, 0.3)' : '#fde68a',
    },
    duplicateWarningText: {
      fontSize: 10,
      fontWeight: '700',
      color: isDark ? '#fbbf24' : '#b45309',
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
