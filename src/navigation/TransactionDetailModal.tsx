import React, { useState, useEffect, useMemo } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, showGlobalConfirm } from '../store';
import { authService } from '../services/authService';
import { getBackendUrl } from '../config/api';

const BACKEND_URL = getBackendUrl();

export interface TransactionItem {
  id: string;
  amount: number;
  category?: string;
  merchant?: string;
  timestamp?: number;
  type: 'credit' | 'debit';
  bankProfileId?: string;
}

export interface TransactionDetailModalProps {
  visible: boolean;
  onClose: () => void;
  transaction: TransactionItem | null;
  bankName?: string;
  onSuccess: (action: 'updated' | 'deleted', data: any) => void;
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

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  visible,
  onClose,
  transaction,
  bankName,
  onSuccess,
}) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [amountStr, setAmountStr] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (visible && transaction) {
      setAmountStr(String(transaction.amount || 0));
      setSelectedCategory((transaction.category || (transaction.type === 'credit' ? 'salary' : 'food')).toLowerCase());
      setNote(transaction.merchant || '');
      setSaving(false);
      setDeleting(false);
    }
  }, [visible, transaction]);

  if (!transaction) return null;

  const isCredit = transaction.type === 'credit';
  const categories = isCredit ? CREDIT_CATEGORIES : DEBIT_CATEGORIES;
  const parsedAmount = parseFloat(amountStr) || 0;
  const originalAmount = Number(transaction.amount || 0);
  const amountDiff = parsedAmount - originalAmount;

  const handleSave = async () => {
    if (parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid positive amount.');
      return;
    }

    if (!selectedCategory) {
      Alert.alert('Category Required', 'Please select a category.');
      return;
    }

    setSaving(true);
    try {
      const token = authService.getAccessToken();
      if (!token) throw new Error('Not authenticated.');

      const response = await fetch(`${BACKEND_URL}/sync/transaction-entry`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: transaction.id,
          type: transaction.type,
          amount: parsedAmount,
          category: selectedCategory,
          note: note.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update transaction.');
      }

      const res = await response.json();
      onSuccess('updated', {
        ...res,
        id: transaction.id,
        type: transaction.type,
        newAmount: parsedAmount,
        category: selectedCategory,
        merchant: note.trim() || selectedCategory,
      });
      onClose();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Unable to update transaction.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    showGlobalConfirm({
      title: `Delete ${isCredit ? 'Income' : 'Spending'} Record`,
      message: `Are you sure you want to delete this ₹${originalAmount.toLocaleString('en-IN')} ${isCredit ? 'credit' : 'debit'} record? Your bank balance will be automatically ${isCredit ? 'reduced' : 'restored'}.`,
      confirmText: 'Yes, Delete',
      cancelText: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        setDeleting(true);
        try {
          const token = authService.getAccessToken();
          if (!token) throw new Error('Not authenticated.');

          const response = await fetch(
            `${BACKEND_URL}/sync/transaction-entry/${transaction.id}?type=${transaction.type}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to delete transaction.');
          }

          const res = await response.json();
          onSuccess('deleted', {
            id: transaction.id,
            type: transaction.type,
            amount: originalAmount,
            updatedBalance: res.updatedBalance,
          });
          onClose();
        } catch (e: any) {
          Alert.alert('Delete Failed', e.message || 'Unable to delete transaction.');
        } finally {
          setDeleting(false);
        }
      },
    });
  };

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
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        </View>

        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View
                style={[
                  styles.headerIconBadge,
                  {
                    backgroundColor: isCredit ? 'rgba(45, 186, 78, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    borderColor: isCredit ? 'rgba(45, 186, 78, 0.35)' : 'rgba(239, 68, 68, 0.35)',
                  },
                ]}
              >
                <Feather
                  name={isCredit ? 'arrow-up-left' : 'arrow-down-right'}
                  size={14}
                  color={isCredit ? '#2dba4e' : '#ef4444'}
                />
              </View>
              <View style={{ marginLeft: 8, flex: 1 }}>
                <Text style={styles.modalTitle}>Transaction Details</Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {transaction.timestamp
                    ? new Date(transaction.timestamp).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Transaction Record'}
                  {bankName ? ` • ${bankName}` : ''}
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
            {/* Type Indicator Banner */}
            <View
              style={[
                styles.typeBanner,
                {
                  backgroundColor: isCredit ? 'rgba(45, 186, 78, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  borderColor: isCredit ? 'rgba(45, 186, 78, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                },
              ]}
            >
              <Text
                style={[
                  styles.typeBannerText,
                  { color: isCredit ? '#2dba4e' : '#ef4444' },
                ]}
              >
                {isCredit ? '+ CREDIT (INCOME)' : '- DEBIT (SPENDING)'}
              </Text>
            </View>

            {/* Editable Amount */}
            <View style={styles.inputSection}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>AMOUNT</Text>
                {amountDiff !== 0 && (
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: isCredit
                        ? amountDiff > 0 ? '#2dba4e' : '#ef4444'
                        : amountDiff > 0 ? '#ef4444' : '#2dba4e',
                    }}
                  >
                    Balance impact: {isCredit
                      ? (amountDiff > 0 ? `+₹${amountDiff}` : `-₹${Math.abs(amountDiff)}`)
                      : (amountDiff > 0 ? `-₹${amountDiff}` : `+₹${Math.abs(amountDiff)}`)}
                  </Text>
                )}
              </View>

              <View style={styles.amountInputRow}>
                <Text
                  style={[
                    styles.currencySymbol,
                    { color: isCredit ? '#2dba4e' : '#ef4444' },
                  ]}
                >
                  ₹
                </Text>
                <TextInput
                  style={[
                    styles.amountInput,
                    { color: isCredit ? '#2dba4e' : '#ef4444' },
                  ]}
                  placeholder="0"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  value={amountStr}
                  onChangeText={(t) => setAmountStr(t.replace(/[^0-9.]/g, ''))}
                />
              </View>
            </View>

            {/* Editable Category Chips */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>CATEGORY</Text>
              <View style={styles.categoryWrap}>
                {categories.map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  const activeColor = isCredit ? '#2dba4e' : '#ef4444';
                  const activeBg = isCredit ? 'rgba(45, 186, 78, 0.15)' : 'rgba(239, 68, 68, 0.15)';

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
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Editable Note / Merchant */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>NOTE / SOURCE / MERCHANT</Text>
              <View style={styles.textInputWrap}>
                <Feather name="edit-3" size={12} color={colors.textSecondary} style={{ marginRight: 6 }} />
                <TextInput
                  style={styles.textInputField}
                  placeholder="Description or merchant name"
                  placeholderTextColor={colors.textTertiary}
                  value={note}
                  onChangeText={setNote}
                  maxLength={50}
                />
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons: Delete & Save */}
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDelete}
              disabled={deleting || saving}
              activeOpacity={0.8}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#FF5252" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="trash-2" size={14} color="#FF5252" style={{ marginRight: 5 }} />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                { opacity: saving || deleting || parsedAmount <= 0 ? 0.6 : 1 },
              ]}
              onPress={handleSave}
              disabled={saving || deleting || parsedAmount <= 0}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Feather name="check" size={14} color="#ffffff" style={{ marginRight: 5 }} />
                  <Text style={styles.saveBtnText}>Save Changes</Text>
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
    typeBanner: {
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: 'center',
      marginBottom: 10,
    },
    typeBannerText: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    inputSection: {
      marginBottom: 10,
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
    footer: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: Platform.OS === 'ios' ? 24 : 18,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    },
    deleteBtn: {
      flex: 0.35,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    deleteBtnText: {
      color: '#FF5252',
      fontSize: 12,
      fontWeight: '700',
    },
    saveBtn: {
      flex: 0.65,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#2dba4e',
    },
    saveBtnText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '800',
    },
  });
