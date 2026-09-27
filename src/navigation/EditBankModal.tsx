import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, useBankStore, BankProfileType } from '../store';
import { authService } from '../services/authService';
import { getBackendUrl } from '../config/api';
import { BankIcon } from '../components/BankIcon';

const BACKEND_URL = getBackendUrl();

export const ACCOUNT_TYPES = [
  { id: 'Savings', label: 'Savings Account', icon: 'pocket' },
  { id: 'Current', label: 'Current Account', icon: 'briefcase' },
  { id: 'Salary', label: 'Salary Account', icon: 'award' },
  { id: 'Credit Card', label: 'Credit Card Account', icon: 'credit-card' },
  { id: 'Overdraft', label: 'Overdraft (OD) Account', icon: 'repeat' },
];

interface EditBankModalProps {
  visible: boolean;
  onClose: () => void;
  bank: BankProfileType | any;
  onSuccess: (updatedBank: BankProfileType) => void;
}

export const EditBankModal: React.FC<EditBankModalProps> = ({
  visible,
  onClose,
  bank,
  onSuccess,
}) => {
  const { colors, isDark } = useTheme();
  const { height: windowHeight } = useWindowDimensions();

  const [bankNameInput, setBankNameInput] = useState('');
  const [accountType, setAccountType] = useState('Savings');
  const [accountTypeDropdownOpen, setAccountTypeDropdownOpen] = useState(false);
  const [accountSuffix, setAccountSuffix] = useState('');
  const [balance, setBalance] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('');
  const [upiId, setUpiId] = useState('');
  const [customKeywords, setCustomKeywords] = useState('');

  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (bank) {
      setBankNameInput(bank.bankName || '');
      setAccountType(bank.accountType || 'Savings');
      setAccountTypeDropdownOpen(false);
      setAccountSuffix(bank.accountNumberSuffix || '');
      setBalance(bank.currentBalance !== undefined ? String(bank.currentBalance) : '');
      setSmsSenderId(bank.smsSenderId || '');
      setUpiId(bank.upiId || '');
      setCustomKeywords(bank.customKeywords || '');
      setFormError('');
    }
  }, [bank, visible]);

  if (!bank) return null;

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
        smsSenderId: smsSenderId.trim() || undefined,
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
      onSuccess(updatedBank);
      onClose();
    } catch (e: any) {
      setFormError(e.message || 'Could not save bank changes.');
    } finally {
      setSubmitting(false);
    }
  };

  const styles = getStyles(colors, isDark);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlayFull}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingWrap}
        >
          <View style={[styles.modalCardFull, { maxHeight: windowHeight * 0.92 }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Bank Details</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                <Feather name="x" size={20} color="#8E8E9F" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 100 }}
            >
              {/* Bank Icon & Hero Header */}
              <View style={styles.bankFormHeader}>
                <View style={{ marginBottom: 12 }}>
                  <BankIcon
                    code={smsSenderId || ''}
                    name={bankNameInput || bank.bankName}
                    size={64}
                  />
                </View>
                <Text style={styles.bankFormTitle}>{bankNameInput || bank.bankName}</Text>
                <Text style={styles.bankFormSubtitle}>Direct Mapping Setup</Text>
              </View>

              <View style={{ paddingHorizontal: 4 }}>
                {/* Bank Display Name */}
                <View style={styles.formFieldContainer}>
                  <Text style={styles.formFieldLabel}>BANK DISPLAY NAME</Text>
                  <View style={styles.formInputGroup}>
                    <Feather name="home" size={16} color={colors.textSecondary} style={styles.formInputIcon} />
                    <TextInput
                      style={styles.formInputField}
                      placeholder="e.g. State Bank of India"
                      placeholderTextColor={isDark ? 'rgba(250, 251, 252, 0.4)' : colors.textTertiary}
                      value={bankNameInput}
                      onChangeText={setBankNameInput}
                    />
                  </View>
                </View>

                {/* Account Type Dropdown */}
                <View style={styles.formFieldContainer}>
                  <Text style={styles.formFieldLabel}>ACCOUNT TYPE</Text>
                  <TouchableOpacity
                    style={[
                      styles.formInputGroup,
                      { justifyContent: 'space-between', paddingVertical: 13 },
                      accountTypeDropdownOpen && { borderColor: colors.accent },
                    ]}
                    onPress={() => setAccountTypeDropdownOpen(!accountTypeDropdownOpen)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Feather name="credit-card" size={16} color={colors.accent} style={styles.formInputIcon} />
                      <Text style={{ fontSize: 14, color: colors.text, fontWeight: '600' }}>
                        {ACCOUNT_TYPES.find((t) => t.id === accountType)?.label || `${accountType} Account`}
                      </Text>
                    </View>
                    <Feather
                      name={accountTypeDropdownOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>

                  {accountTypeDropdownOpen && (
                    <View
                      style={{
                        marginTop: 6,
                        backgroundColor: colors.isDark ? '#14141e' : '#f8fafc',
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 14,
                        overflow: 'hidden',
                      }}
                    >
                      {ACCOUNT_TYPES.map((type, idx) => {
                        const isSelected = accountType === type.id;
                        return (
                          <TouchableOpacity
                            key={type.id}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingVertical: 12,
                              paddingHorizontal: 14,
                              backgroundColor: isSelected
                                ? colors.isDark
                                  ? 'rgba(45, 186, 78, 0.15)'
                                  : 'rgba(22, 163, 74, 0.12)'
                                : 'transparent',
                              borderBottomWidth: idx < ACCOUNT_TYPES.length - 1 ? 1 : 0,
                              borderBottomColor: colors.isDark
                                ? 'rgba(255, 255, 255, 0.06)'
                                : colors.border,
                            }}
                            onPress={() => {
                              setAccountType(type.id);
                              setAccountTypeDropdownOpen(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Feather
                                name={type.icon as any}
                                size={15}
                                color={isSelected ? colors.accent : colors.textSecondary}
                                style={{ marginRight: 10 }}
                              />
                              <Text
                                style={{
                                  fontSize: 13,
                                  fontWeight: isSelected ? '700' : '500',
                                  color: isSelected ? colors.accent : colors.text,
                                }}
                              >
                                {type.label}
                              </Text>
                            </View>
                            {isSelected && <Feather name="check" size={16} color={colors.accent} />}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Last 4 Digits of Account Number */}
                <View style={styles.formFieldContainer}>
                  <Text style={styles.formFieldLabel}>LAST 4 DIGITS OF ACCOUNT NUMBER</Text>
                  <View style={styles.formInputGroup}>
                    <Feather name="hash" size={16} color={colors.textSecondary} style={styles.formInputIcon} />
                    <TextInput
                      style={styles.formInputField}
                      placeholder="e.g. 5678"
                      placeholderTextColor={isDark ? 'rgba(250, 251, 252, 0.4)' : colors.textTertiary}
                      keyboardType="numeric"
                      maxLength={4}
                      value={accountSuffix}
                      onChangeText={setAccountSuffix}
                    />
                  </View>
                </View>

                {/* Current / Starting Balance (INR) */}
                <View style={styles.formFieldContainer}>
                  <Text style={styles.formFieldLabel}>CURRENT / STARTING BALANCE (INR)</Text>
                  <View style={styles.formInputGroup}>
                    <MaterialCommunityIcons name="currency-inr" size={16} color={colors.textSecondary} style={styles.formInputIcon} />
                    <TextInput
                      style={styles.formInputField}
                      placeholder="e.g. 75000"
                      placeholderTextColor={isDark ? 'rgba(250, 251, 252, 0.4)' : colors.textTertiary}
                      keyboardType="numeric"
                      value={balance}
                      onChangeText={setBalance}
                    />
                  </View>
                </View>

                {/* SMS Sender ID / Header */}
                <View style={styles.formFieldContainer}>
                  <Text style={styles.formFieldLabel}>SMS SENDER ID / HEADER</Text>
                  <View style={styles.formInputGroup}>
                    <Feather name="message-square" size={16} color={colors.textSecondary} style={styles.formInputIcon} />
                    <TextInput
                      style={styles.formInputField}
                      placeholder="e.g. SBIIN"
                      placeholderTextColor={isDark ? 'rgba(250, 251, 252, 0.4)' : colors.textTertiary}
                      value={smsSenderId}
                      onChangeText={setSmsSenderId}
                      autoCapitalize="characters"
                    />
                  </View>
                  <Text style={styles.fieldHelperText}>
                    The sender address of the SMS notification (e.g. AD-HDFCBK to HDFCBK).
                  </Text>
                </View>

                {/* Associated UPI ID (Optional) */}
                <View style={styles.formFieldContainer}>
                  <Text style={styles.formFieldLabel}>ASSOCIATED UPI ID (OPTIONAL)</Text>
                  <View style={styles.formInputGroup}>
                    <Feather name="at-sign" size={16} color={colors.textSecondary} style={styles.formInputIcon} />
                    <TextInput
                      style={styles.formInputField}
                      placeholder="e.g. success@okhdfcbank"
                      placeholderTextColor={isDark ? 'rgba(250, 251, 252, 0.4)' : colors.textTertiary}
                      value={upiId}
                      onChangeText={setUpiId}
                      autoCapitalize="none"
                    />
                  </View>
                  <Text style={styles.fieldHelperText}>
                    Used for mapping UPI payment transaction notifications.
                  </Text>
                </View>

                {/* Custom Matching Keywords (Optional) */}
                <View style={styles.formFieldContainer}>
                  <Text style={styles.formFieldLabel}>CUSTOM MATCHING KEYWORDS (OPTIONAL)</Text>
                  <View style={styles.formInputGroup}>
                    <Feather name="key" size={16} color={colors.textSecondary} style={styles.formInputIcon} />
                    <TextInput
                      style={styles.formInputField}
                      placeholder="e.g. SBI, salary, pension"
                      placeholderTextColor={isDark ? 'rgba(250, 251, 252, 0.4)' : colors.textTertiary}
                      value={customKeywords}
                      onChangeText={setCustomKeywords}
                    />
                  </View>
                  <Text style={styles.fieldHelperText}>
                    Comma-separated words that must appear in messages or screenshots for auto-matching.
                  </Text>
                </View>
              </View>

              {formError ? (
                <View style={styles.errorContainer}>
                  <Feather name="alert-circle" size={16} color="#fafbfc" style={{ marginRight: 8 }} />
                  <Text style={styles.errorTextInline}>{formError}</Text>
                </View>
              ) : null}

              {submitting ? (
                <ActivityIndicator size="large" color="#2dba4e" style={{ marginTop: 24 }} />
              ) : (
                <TouchableOpacity
                  style={styles.submitBankBtn}
                  onPress={handleSubmit}
                  activeOpacity={0.8}
                >
                  <Text style={styles.submitBankBtnText}>Save Changes</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    modalOverlayFull: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      justifyContent: 'flex-end',
      ...(Platform.OS === 'web' ? { height: '100dvh' as any, width: '100vw' as any, position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0 } : {}),
    },
    keyboardAvoidingWrap: {
      width: '100%',
      justifyContent: 'flex-end',
    },
    modalCardFull: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 16,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
    },
    closeBtn: {
      padding: 6,
      borderRadius: 20,
      backgroundColor: colors.buttonSecondaryBackground,
    },
    bankFormHeader: {
      alignItems: 'center',
      paddingVertical: 14,
      marginBottom: 12,
    },
    bankFormTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 4,
    },
    bankFormSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    formFieldContainer: {
      marginBottom: 16,
    },
    formFieldLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: colors.textSecondary,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    formInputGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 12,
    },
    formInputIcon: {
      marginRight: 10,
    },
    formInputField: {
      flex: 1,
      paddingVertical: 13,
      fontSize: 14,
      color: colors.text,
    },
    fieldHelperText: {
      color: colors.textTertiary || colors.textSecondary,
      fontSize: 11,
      marginTop: 5,
      lineHeight: 15,
      paddingHorizontal: 2,
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#cf6679',
      padding: 12,
      borderRadius: 12,
      marginTop: 8,
    },
    errorTextInline: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '600',
      flex: 1,
    },
    submitBankBtn: {
      backgroundColor: '#2dba4e',
      paddingVertical: 15,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 22,
      shadowColor: '#2dba4e',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    submitBankBtnText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
    },
  });
