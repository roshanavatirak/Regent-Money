import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, useBankStore, BankProfileType } from '../store';
import { authService } from '../services/authService';
import { getBackendUrl } from '../config/api';
import { BankIcon } from '../components/BankIcon';
import { SmsSenderTagsManager } from '../components/SmsSenderTagsManager';
import { formatSmsSenderTags, parseSmsSenderTags } from '../constants/bankSmsSenders';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

const BACKEND_URL = getBackendUrl();

export const ACCOUNT_TYPES = [
  { id: 'Savings', label: 'Savings Account', icon: 'pocket' },
  { id: 'Current', label: 'Current Account', icon: 'briefcase' },
  { id: 'Salary', label: 'Salary Account', icon: 'award' },
  { id: 'Credit Card', label: 'Credit Card Account', icon: 'credit-card' },
  { id: 'Overdraft', label: 'Overdraft (OD) Account', icon: 'repeat' },
];

export const EditBankScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark } = useTheme();

  const bank: BankProfileType = route.params?.bank;

  const [bankNameInput, setBankNameInput] = useState(bank?.bankName || '');
  const [accountType, setAccountType] = useState(bank?.accountType || 'Savings');
  const [accountTypeDropdownOpen, setAccountTypeDropdownOpen] = useState(false);
  const [accountSuffix, setAccountSuffix] = useState(bank?.accountNumberSuffix || '');
  const [balance, setBalance] = useState(bank?.currentBalance !== undefined ? String(bank.currentBalance) : '');
  const [smsSenderTags, setSmsSenderTags] = useState<string[]>(
    parseSmsSenderTags(bank?.smsSenderId)
  );
  const [upiId, setUpiId] = useState(bank?.upiId || '');
  const [customKeywords, setCustomKeywords] = useState(bank?.customKeywords || '');

  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { scrollBottomPadding } = useKeyboardHeight(40);

  if (!bank) {
    navigation.goBack();
    return null;
  }

  const handleSubmit = async () => {
    if (!bankNameInput.trim() || !accountSuffix.trim() || !balance.trim()) {
      setFormError('Please fill in all required fields.');
      return;
    }
    if (accountSuffix.trim().length !== 4 || isNaN(Number(accountSuffix))) {
      setFormError('Account suffix must be exactly 4 digits.');
      return;
    }
    if (isNaN(Number(balance))) {
      setFormError('Current balance must be a valid number.');
      return;
    }

    setFormError('');
    setSubmitting(true);

    try {
      const token = authService.getAccessToken();
      if (!token) {
        throw new Error('Authentication session expired. Please log in again.');
      }

      const updatedData = {
        id: bank.id,
        bankName: bankNameInput.trim(),
        accountType: accountType || 'Savings',
        accountNumberSuffix: accountSuffix.trim(),
        currentBalance: parseFloat(balance),
        smsSenderId: formatSmsSenderTags(smsSenderTags) || undefined,
        upiId: upiId.trim() || undefined,
        customKeywords: customKeywords.trim() || undefined,
        smsConsent: bank.smsConsent !== undefined ? bank.smsConsent : true,
      };

      const response = await fetch(`${BACKEND_URL}/sync/bank-profile`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedData),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to update bank details on server.');
      }

      const updatedBank: BankProfileType = {
        ...bank,
        ...updatedData,
        lastSyncTimestamp: Date.now(),
      };

      useBankStore.getState().updateBankProfileState(updatedBank);
      navigation.goBack();
    } catch (e: any) {
      setFormError(e.message || 'Could not save bank changes.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAccountTypeObj =
    ACCOUNT_TYPES.find((t) => t.id === accountType) || ACCOUNT_TYPES[0];

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
          <Text style={styles.headerTitle}>Edit Bank Details</Text>
          <Text style={styles.headerSubtitle}>Direct Mapping Setup</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPadding }]}
        >
          {/* Bank Icon & Hero Header */}
          <View style={styles.bankFormHeader}>
            <View style={{ marginBottom: 12 }}>
              <BankIcon
                code={smsSenderTags[0] || bankNameInput || bank.bankName}
                name={bankNameInput || bank.bankName}
                size={60}
              />
            </View>
            <Text style={styles.bankFormTitle}>{bankNameInput || bank.bankName}</Text>
            <Text style={styles.bankFormSubtitle}>Account Ending in •••• {accountSuffix || bank.accountNumberSuffix}</Text>
          </View>

          {formError ? (
            <View style={styles.errorContainer}>
              <Feather name="alert-circle" size={16} color="#FF5252" style={{ marginRight: 8 }} />
              <Text style={styles.errorTextInline}>{formError}</Text>
            </View>
          ) : null}

          {/* Bank Name Field */}
          <View style={styles.formFieldContainer}>
            <Text style={styles.fieldLabel}>
              BANK NAME <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.inputField}
                value={bankNameInput}
                onChangeText={(t) => {
                  setBankNameInput(t);
                  if (formError) setFormError('');
                }}
                placeholder="Bank Name (e.g. State Bank of India)"
                placeholderTextColor={colors.textTertiary}
              />
            </View>
          </View>

          {/* Account Type Dropdown */}
          <View style={[styles.formFieldContainer, { zIndex: 1000 }]}>
            <Text style={styles.fieldLabel}>ACCOUNT TYPE</Text>
            <TouchableOpacity
              style={[
                styles.inputContainer,
                styles.dropdownTrigger,
                accountTypeDropdownOpen && styles.dropdownTriggerActive,
              ]}
              onPress={() => setAccountTypeDropdownOpen(!accountTypeDropdownOpen)}
              activeOpacity={0.8}
            >
              <View style={styles.dropdownSelectedRow}>
                <Feather
                  name={selectedAccountTypeObj.icon as any}
                  size={16}
                  color={colors.accent}
                  style={{ marginRight: 10 }}
                />
                <Text style={styles.dropdownSelectedText}>{selectedAccountTypeObj.label}</Text>
              </View>
              <Feather
                name={accountTypeDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>

            {accountTypeDropdownOpen && (
              <View style={styles.dropdownMenu}>
                {ACCOUNT_TYPES.map((typeOption) => {
                  const isSelected = accountType === typeOption.id;
                  return (
                    <TouchableOpacity
                      key={typeOption.id}
                      style={[styles.dropdownMenuItem, isSelected && styles.dropdownMenuItemActive]}
                      onPress={() => {
                        setAccountType(typeOption.id);
                        setAccountTypeDropdownOpen(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Feather
                          name={typeOption.icon as any}
                          size={16}
                          color={isSelected ? colors.accent : colors.textSecondary}
                          style={{ marginRight: 10 }}
                        />
                        <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                          {typeOption.label}
                        </Text>
                      </View>
                      {isSelected && <Feather name="check" size={16} color={colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Account Suffix Field */}
          <View style={styles.formFieldContainer}>
            <Text style={styles.fieldLabel}>
              ACCOUNT NUMBER SUFFIX (LAST 4 DIGITS) <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.inputField}
                value={accountSuffix}
                onChangeText={(t) => {
                  setAccountSuffix(t.replace(/[^0-9]/g, '').slice(0, 4));
                  if (formError) setFormError('');
                }}
                placeholder="4020"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numeric"
                maxLength={4}
              />
            </View>
          </View>

          {/* Current Balance Field */}
          <View style={styles.formFieldContainer}>
            <Text style={styles.fieldLabel}>
              CURRENT BALANCE (₹) <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.inputField}
                value={balance}
                onChangeText={(t) => {
                  setBalance(t);
                  if (formError) setFormError('');
                }}
                placeholder="e.g. 15000.00"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {/* SMS Sender Tags Manager */}
          <View style={styles.formFieldContainer}>
            <SmsSenderTagsManager
              tags={smsSenderTags}
              onChangeTags={setSmsSenderTags}
              bankCodeOrName={bankNameInput || bank.bankName}
              colors={colors}
              isDark={isDark}
              label="SMS SENDER CODES / HEADERS"
              hint="Add all SMS codes used by your bank (e.g. SBIPSG, SBIBNK, SBIUPI) to capture salary, UPI, and ATM alerts."
            />
          </View>

          {/* UPI ID Field */}
          <View style={styles.formFieldContainer}>
            <Text style={styles.fieldLabel}>UPI ID (VPA)</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.inputField}
                value={upiId}
                onChangeText={setUpiId}
                placeholder="e.g. username@okhdfcbank"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Custom Keywords Field */}
          <View style={styles.formFieldContainer}>
            <Text style={styles.fieldLabel}>CUSTOM KEYWORDS (COMMA-SEPARATED)</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.inputField}
                value={customKeywords}
                onChangeText={setCustomKeywords}
                placeholder="e.g. salary, freelance, rent"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Submit Button */}
          {submitting ? (
            <View style={styles.submittingContainer}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.submittingText}>Saving changes...</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              activeOpacity={0.8}
            >
              <Text style={styles.submitBtnText}>Save Changes</Text>
            </TouchableOpacity>
          )}
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
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.buttonSecondaryBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text,
    },
    headerSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    bankFormHeader: {
      alignItems: 'center',
      paddingVertical: 14,
      marginBottom: 8,
    },
    bankFormTitle: {
      fontSize: 19,
      fontWeight: '800',
      color: colors.text,
    },
    bankFormSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 82, 82, 0.1)',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'rgba(255, 82, 82, 0.2)',
      padding: 12,
      marginBottom: 16,
    },
    errorTextInline: {
      color: '#FF5252',
      fontSize: 12,
      fontWeight: '600',
      flex: 1,
    },
    formFieldContainer: {
      marginBottom: 14,
    },
    fieldLabel: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.textSecondary,
      marginBottom: 6,
      letterSpacing: 0.5,
    },
    requiredStar: {
      color: '#FF5252',
    },
    inputContainer: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      height: 48,
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    inputField: {
      color: colors.text,
      fontSize: 13.5,
      fontWeight: '600',
      height: '100%',
    },
    dropdownTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dropdownTriggerActive: {
      borderColor: colors.accent,
    },
    dropdownSelectedRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dropdownSelectedText: {
      color: colors.text,
      fontSize: 13.5,
      fontWeight: '600',
    },
    dropdownMenu: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      marginTop: 6,
      overflow: 'hidden',
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
    },
    dropdownMenuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    dropdownMenuItemActive: {
      backgroundColor: 'rgba(45, 186, 78, 0.08)',
    },
    dropdownItemText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    dropdownItemTextActive: {
      color: colors.accent,
      fontWeight: '700',
    },
    submittingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      marginTop: 10,
    },
    submittingText: {
      color: colors.accent,
      fontSize: 13,
      fontWeight: '700',
      marginLeft: 10,
    },
    submitBtn: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 4,
    },
    submitBtnText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '800',
    },
  });
