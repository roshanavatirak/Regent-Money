import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  Switch,
  BackHandler,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, showGlobalConfirm, useBankStore, useTransactionStore } from '../store';
import { authService } from '../services/authService';
import { getBackendUrl } from '../config/api';
import { TagPaymentModal } from '../components/TagPaymentModal';
import { getTagDef } from '../constants/transactionTags';
import { tagLearningService } from '../services/tagLearningService';
import { KeyboardScreen } from '../components/KeyboardScreen';

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

export interface TransactionDetailScreenProps {
  transaction?: TransactionItem;
  bankName?: string;
  accountNumberSuffix?: string;
  onBack?: () => void;
  onSuccess?: (action: 'updated' | 'deleted', data?: any) => void;
}

export const TransactionDetailScreen: React.FC<TransactionDetailScreenProps> = (props) => {
  const insets = useSafeAreaInsets();
  let navigation: any = null;
  try {
    navigation = useNavigation<any>();
  } catch (e) {}
  let route: any = null;
  try {
    route = useRoute<any>();
  } catch (e) {}
  const { colors, isDark } = useTheme();

  const transaction: TransactionItem = props.transaction || route?.params?.transaction;
  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const matchedBank = useMemo(() => {
    if (transaction?.bankProfileId) {
      return bankProfiles.find((b) => b.id === transaction.bankProfileId);
    }
    const bName = (props.bankName || route?.params?.bankName || '').toLowerCase();
    if (bName) {
      return bankProfiles.find((b) => b.bankName.toLowerCase() === bName);
    }
    return null;
  }, [bankProfiles, transaction?.bankProfileId, props.bankName, route?.params?.bankName]);

  const displayBankName = props.bankName || route?.params?.bankName || matchedBank?.bankName;
  const accountSuffix =
    props.accountNumberSuffix ||
    route?.params?.accountNumberSuffix ||
    matchedBank?.accountNumberSuffix;

  const [amountStr, setAmountStr] = useState(transaction?.amount ? String(transaction.amount) : '');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    (transaction?.category || (transaction?.type === 'credit' ? 'salary' : 'food')).toLowerCase()
  );
  const [note, setNote] = useState(transaction?.merchant || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [updatePayeeRule, setUpdatePayeeRule] = useState(false);

  const handleGoBack = () => {
    if (props.onBack) {
      props.onBack();
      return;
    }
    const returnToBankId = route?.params?.returnToBankId || transaction?.bankProfileId;
    if (returnToBankId) {
      useBankStore.getState().setActiveBankModalId(returnToBankId);
    }
    navigation?.goBack?.();
  };

  useEffect(() => {
    const onBackPress = () => {
      handleGoBack();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [props.onBack, route?.params?.returnToBankId, transaction?.bankProfileId]);

  if (!transaction) {
    handleGoBack();
    return null;
  }

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
          updateMerchantRule: updatePayeeRule,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to update transaction.');
      }

      const res = await response.json();

      // If bank profile balance was updated, update bank store
      if (transaction.bankProfileId && res.updatedBalance !== undefined) {
        useBankStore.getState().updateBankBalance(transaction.bankProfileId, res.updatedBalance);
      }

      // Update transaction store if transaction exists there
      try {
        useTransactionStore.getState().updateTransactionState(transaction.id, {
          amount: parsedAmount,
          category: selectedCategory,
          merchant: note.trim() || selectedCategory,
        });
      } catch (err) {
        // Store might not track all modal transactions
      }

      // Save user learning rule for this merchant ONLY if user opted to update default!
      const targetMerchant = note.trim() || transaction.merchant;
      if (targetMerchant && updatePayeeRule) {
        await tagLearningService.saveLearnedTag(targetMerchant, selectedCategory).catch(() => {});
      }

      if (typeof props.onSuccess === 'function') {
        props.onSuccess('updated', {
          ...res,
          id: transaction.id,
          type: transaction.type,
          newAmount: parsedAmount,
          category: selectedCategory,
          merchant: note.trim() || selectedCategory,
        });
      } else if (typeof route?.params?.onSuccess === 'function') {
        route.params.onSuccess('updated', {
          ...res,
          id: transaction.id,
          type: transaction.type,
          newAmount: parsedAmount,
          category: selectedCategory,
          merchant: note.trim() || selectedCategory,
        });
      }

      handleGoBack();
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

          // Update bank store if updatedBalance returned
          if (transaction.bankProfileId && res.updatedBalance !== undefined) {
            useBankStore.getState().updateBankBalance(transaction.bankProfileId, res.updatedBalance);
          }

          // Remove from transaction store if present
          try {
            useTransactionStore.getState().removeTransactionState(transaction.id);
          } catch (err) {
            // Store might not track all
          }

          if (typeof props.onSuccess === 'function') {
            props.onSuccess('deleted', {
              id: transaction.id,
              type: transaction.type,
              amount: originalAmount,
              updatedBalance: res.updatedBalance,
            });
          } else if (typeof route?.params?.onSuccess === 'function') {
            route.params.onSuccess('deleted', {
              id: transaction.id,
              type: transaction.type,
              amount: originalAmount,
              updatedBalance: res.updatedBalance,
            });
          }

          handleGoBack();
        } catch (e: any) {
          Alert.alert('Delete Failed', e.message || 'Unable to delete transaction.');
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  const styles = getStyles(colors, isDark);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity
          onPress={handleGoBack}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Transaction Details</Text>
          <Text style={styles.headerSubtitle} numberOfLines={2}>
            {transaction.timestamp
              ? (() => {
                  const d = new Date(transaction.timestamp);
                  const isUtcMidnight =
                    d.getUTCHours() === 0 &&
                    d.getUTCMinutes() === 0 &&
                    d.getUTCSeconds() === 0 &&
                    d.getUTCMilliseconds() === 0;
                  if (isUtcMidnight) {
                    return d.toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    });
                  }
                  return d.toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                })()
              : 'Transaction Record'}
            {displayBankName
              ? ` • ${displayBankName}${accountSuffix ? ` •••• ${accountSuffix}` : ''}`
              : accountSuffix
              ? ` • •••• ${accountSuffix}`
              : ''}
          </Text>
        </View>
        <View
          style={[
            styles.headerBadge,
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
      </View>

      <KeyboardScreen
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
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
                    fontSize: 11,
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

          {/* Category Section */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>CATEGORY</Text>

            {(() => {
              const currentTagDef = getTagDef(selectedCategory);
              const targetName = note.trim() || transaction.merchant;

              return (
                <>
                  <TouchableOpacity
                    style={[
                      styles.selectedTagCard,
                      {
                        backgroundColor: isDark ? '#1C1C26' : '#F9FAFB',
                        borderColor: isDark ? '#2D2D3D' : '#E5E7EB',
                      },
                    ]}
                    onPress={() => setTagModalVisible(true)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.selectedTagIconWrap,
                        {
                          backgroundColor: isDark ? currentTagDef.bgColorDark : currentTagDef.bgColorLight,
                        },
                      ]}
                    >
                      {currentTagDef.iconType === 'ionicons' ? (
                        <Ionicons
                          name={currentTagDef.iconName as any}
                          size={22}
                          color={currentTagDef.iconColor}
                        />
                      ) : (
                        <Feather
                          name={currentTagDef.iconName as any}
                          size={20}
                          color={currentTagDef.iconColor}
                        />
                      )}
                    </View>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text
                        style={[
                          styles.selectedTagName,
                          { color: isDark ? '#FFFFFF' : '#111827' },
                        ]}
                      >
                        {currentTagDef.label}
                      </Text>
                      <Text style={styles.selectedTagSub}>
                        Tap to change category
                      </Text>
                    </View>

                    <Feather
                      name="chevron-right"
                      size={20}
                      color={isDark ? '#6B7280' : '#9CA3AF'}
                      style={{ marginRight: 6 }}
                    />
                  </TouchableOpacity>

                  {/* Clear & Simple Payee Default Switch */}
                  {targetName ? (
                    <View
                      style={[
                        styles.ruleToggleCard,
                        {
                          backgroundColor: isDark ? '#1C1F2B' : '#F8FAFC',
                          borderColor: isDark ? '#2D3446' : '#E2E8F0',
                        },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[
                          styles.ruleToggleTitle,
                          { color: isDark ? '#F1F5F9' : '#0F172A', flex: 1, marginRight: 12 },
                        ]}
                      >
                        Always use {currentTagDef.label} for {targetName}
                      </Text>

                      <Switch
                        value={updatePayeeRule}
                        onValueChange={setUpdatePayeeRule}
                        trackColor={{
                          false: isDark ? '#2D3446' : '#D1D5DB',
                          true: '#0070F3',
                        }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  ) : null}
                </>
              );
            })()}
          </View>

          {/* Editable Note / Merchant */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>NOTE / SOURCE / MERCHANT</Text>
            <View style={styles.textInputWrap}>
              <Feather name="edit-3" size={14} color={colors.textSecondary} style={{ marginRight: 8 }} />
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

          {/* Action Buttons: Delete & Save */}
          <View style={styles.actionRow}>
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
                  <Feather name="trash-2" size={15} color="#FF5252" style={{ marginRight: 6 }} />
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
                  <Feather name="check" size={15} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
      </KeyboardScreen>

      {/* Paytm-Style Tag Payment Modal */}
      <TagPaymentModal
        visible={tagModalVisible}
        onClose={() => setTagModalVisible(false)}
        selectedTag={selectedCategory}
        onSelectTag={(tag, updateRule) => {
          setSelectedCategory(tag);
          if (updateRule !== undefined) {
            setUpdatePayeeRule(Boolean(updateRule));
          }
        }}
        merchantName={note.trim() || transaction.merchant}
        isDark={isDark}
        colors={colors}
      />
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
    typeBanner: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      marginBottom: 18,
    },
    typeBannerText: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
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
    actionRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 12,
    },
    deleteBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: 'rgba(255, 82, 82, 0.3)',
      backgroundColor: 'rgba(255, 82, 82, 0.08)',
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteBtnText: {
      color: '#FF5252',
      fontSize: 14,
      fontWeight: '700',
    },
    saveBtn: {
      flex: 2,
      backgroundColor: '#0070F3',
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#0070F3',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 4,
    },
    saveBtnText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
    },
    selectedTagCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      marginTop: 8,
    },
    selectedTagIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectedTagName: {
      fontSize: 15,
      fontWeight: '800',
      marginBottom: 2,
    },
    selectedTagSub: {
      fontSize: 11,
      color: '#8E8E9F',
    },
    changeTagBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    changeTagBtnText: {
      fontSize: 12,
      fontWeight: '700',
      marginRight: 2,
    },
    quickTagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 10,
    },
    quickTagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      paddingHorizontal: 11,
      borderRadius: 10,
      borderWidth: 1,
    },
    quickTagChipText: {
      fontSize: 11,
    },
    ruleToggleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
    },
    ruleToggleTitle: {
      fontSize: 13,
      fontWeight: '700',
    },
  });
