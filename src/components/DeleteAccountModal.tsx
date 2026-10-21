import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTheme, useAuthStore, showGlobalAlert } from '../store';
import { authService } from '../services/authService';

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
}

const DELETION_REASONS = [
  { code: 'SWITCHING_ALTERNATIVE', label: 'Found another finance app or alternative' },
  { code: 'PRIVACY_SECURITY', label: 'Concerns regarding data privacy & security' },
  { code: 'BANK_SYNC_ISSUES', label: 'Difficulty connecting or syncing bank accounts' },
  { code: 'COMPLEX_UI', label: 'App is too complicated or difficult to use' },
  { code: 'GOALS_ACHIEVED', label: 'Financial goals achieved / Starting fresh' },
  { code: 'TOO_MANY_NOTIFS', label: 'Too many notifications or alert interruptions' },
  { code: 'BUGS_CRASHES', label: 'Experiencing technical bugs or frequent crashes' },
  { code: 'OTHER', label: 'Other (please specify below)' },
];

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({
  visible,
  onClose,
}) => {
  const { colors, isDark } = useTheme();
  const user = useAuthStore((state) => state.user);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customFeedback, setCustomFeedback] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 7-day cooldown check: User cannot delete within 7 days of recent restoration
  const isCooldownActive = useMemo(() => {
    if (!user?.deletionCooldownUntil) return false;
    return Date.now() < user.deletionCooldownUntil;
  }, [user?.deletionCooldownUntil]);

  const cooldownDateStr = useMemo(() => {
    if (!user?.deletionCooldownUntil) return '';
    return new Date(user.deletionCooldownUntil).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, [user?.deletionCooldownUntil]);

  const resetState = () => {
    setStep(1);
    setSelectedReason(null);
    setCustomFeedback('');
    setPassword('');
    setShowPassword(false);
    setErrorMsg(null);
    setLoading(false);
  };

  const handleClose = () => {
    if (loading) return;
    resetState();
    onClose();
  };

  const handleNextFromStep1 = () => {
    if (isCooldownActive) return;
    setErrorMsg(null);
    setStep(2);
  };

  const handleNextFromStep2 = () => {
    if (!selectedReason) {
      setErrorMsg('Please select a reason before continuing.');
      return;
    }
    if (selectedReason === 'OTHER' && customFeedback.trim().length < 5) {
      setErrorMsg('Please provide at least 5 characters of feedback.');
      return;
    }
    setErrorMsg(null);
    setStep(3);
  };

  const handleConfirmDeletion = async () => {
    if (!selectedReason) return;

    if (user?.authProvider === 'email' && !password.trim()) {
      setErrorMsg('Please enter your account password to confirm.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      await authService.requestAccountDeletion(
        selectedReason,
        selectedReason === 'OTHER' ? customFeedback.trim() : undefined,
        password ? password.trim() : undefined,
      );

      handleClose();

      // Log out session cleanly
      await authService.logOut();

      showGlobalAlert(
        'Account Scheduled for Deletion',
        'Your account has been deactivated and scheduled for permanent deletion in 7 days.\n\nChanged your mind? Simply log back in anytime within the next 7 days with the same credentials to cancel deletion and restore your data.',
      );
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to schedule account deletion. Please try again.');
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: isDark ? '#141824' : '#FFFFFF',
                borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
              },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.alertIconWrap}>
                  <Feather name="alert-triangle" size={18} color="#EF4444" />
                </View>
                <View>
                  <Text style={[styles.headerTitle, { color: colors.text }]}>
                    {step === 1
                      ? 'Delete Account'
                      : step === 2
                      ? 'Why Are You Leaving?'
                      : 'Final Confirmation'}
                  </Text>
                  <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                    Step {step} of 3
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleClose}
                disabled={loading}
                style={[styles.closeBtn, { backgroundColor: isDark ? '#1F2437' : '#F3F4F6' }]}
                activeOpacity={0.7}
              >
                <Feather name="x" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Error Banner */}
            {errorMsg ? (
              <View style={styles.errorBanner}>
                <Feather name="alert-circle" size={14} color="#EF4444" style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{errorMsg}</Text>
              </View>
            ) : null}

            {/* Step 1: Information & 7-Day Grace Disclosure */}
            {step === 1 && (
              <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
                {isCooldownActive ? (
                  <View style={styles.cooldownBanner}>
                    <Feather name="clock" size={18} color="#F59E0B" style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cooldownTitle}>Deletion Locked (Cooldown Active)</Text>
                      <Text style={styles.cooldownDesc}>
                        You recently restored this account. To prevent accidental abuse, account deletion is unavailable during the 7-day cooldown period until {cooldownDateStr}.
                      </Text>
                    </View>
                  </View>
                ) : null}

                <Text style={[styles.sectionHeading, { color: colors.text }]}>
                  What happens when you delete your account:
                </Text>

                <View
                  style={[
                    styles.infoCard,
                    {
                      backgroundColor: isDark ? '#1A2035' : '#F9FAFB',
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.infoRow}>
                    <Feather name="calendar" size={16} color="#3B82F6" style={styles.infoIcon} />
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoTitle, { color: colors.text }]}>
                        7-Day Recovery Grace Period
                      </Text>
                      <Text style={[styles.infoDesc, { color: colors.textSecondary }]}>
                        Your account will not be erased immediately. It enters a 7-day scheduled deletion window during which your data remains safely frozen.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.infoRow}>
                    <Feather name="rotate-ccw" size={16} color="#10B981" style={styles.infoIcon} />
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoTitle, { color: colors.text }]}>
                        Instant Self-Service Restore
                      </Text>
                      <Text style={[styles.infoDesc, { color: colors.textSecondary }]}>
                        If you change your mind, simply log back in with your credentials within 7 days. Deletion will be instantly cancelled and all your data restored.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.infoRow}>
                    <Feather name="trash-2" size={16} color="#EF4444" style={styles.infoIcon} />
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoTitle, { color: colors.text }]}>
                        Permanent Purge After 7 Days
                      </Text>
                      <Text style={[styles.infoDesc, { color: colors.textSecondary }]}>
                        After 7 days have passed without login, our automated system permanently and irreversibly purges your transaction history, budgets, bank profiles, and personal data.
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={[styles.btnSecondary, { borderColor: colors.border }]}
                    onPress={handleClose}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.btnSecondaryText, { color: colors.text }]}>Keep Account</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.btnDanger,
                      isCooldownActive && { opacity: 0.5, backgroundColor: '#6B7280' },
                    ]}
                    onPress={handleNextFromStep1}
                    disabled={isCooldownActive}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnDangerText}>
                      {isCooldownActive ? 'Cooldown Active' : 'Continue'}
                    </Text>
                    {!isCooldownActive && (
                      <Feather name="chevron-right" size={15} color="#FFFFFF" style={{ marginLeft: 4 }} />
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {/* Step 2: Survey Reason Selection */}
            {step === 2 && (
              <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
                <Text style={[styles.sectionHeading, { color: colors.text, marginBottom: 12 }]}>
                  Please let us know why you wish to delete your account:
                </Text>

                {DELETION_REASONS.map((reason) => {
                  const isSelected = selectedReason === reason.code;
                  return (
                    <TouchableOpacity
                      key={reason.code}
                      style={[
                        styles.radioItem,
                        {
                          backgroundColor: isDark ? '#1A2035' : '#F9FAFB',
                          borderColor: isSelected ? '#EF4444' : colors.border,
                        },
                      ]}
                      onPress={() => {
                        setSelectedReason(reason.code);
                        setErrorMsg(null);
                      }}
                      activeOpacity={0.8}
                    >
                      <View
                        style={[
                          styles.radioCircle,
                          {
                            borderColor: isSelected ? '#EF4444' : colors.textTertiary,
                            backgroundColor: isSelected ? '#EF4444' : 'transparent',
                          },
                        ]}
                      >
                        {isSelected && <View style={styles.radioInnerDot} />}
                      </View>
                      <Text style={[styles.radioLabel, { color: colors.text }]}>
                        {reason.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Optional Expandable Feedback for 'OTHER' */}
                {selectedReason === 'OTHER' && (
                  <View style={styles.customFeedbackWrap}>
                    <Text style={[styles.customFeedbackLabel, { color: colors.textSecondary }]}>
                      Please describe your reason (min 5 characters):
                    </Text>
                    <TextInput
                      style={[
                        styles.customInput,
                        {
                          backgroundColor: isDark ? '#1F2437' : '#F3F4F6',
                          color: colors.text,
                          borderColor: colors.border,
                        },
                      ]}
                      multiline
                      numberOfLines={3}
                      placeholder="Tell us what we could have done better..."
                      placeholderTextColor={colors.textTertiary}
                      value={customFeedback}
                      onChangeText={setCustomFeedback}
                      maxLength={300}
                    />
                    <Text style={[styles.charCount, { color: colors.textTertiary }]}>
                      {customFeedback.length}/300
                    </Text>
                  </View>
                )}

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={[styles.btnSecondary, { borderColor: colors.border }]}
                    onPress={() => setStep(1)}
                    activeOpacity={0.8}
                  >
                    <Feather name="chevron-left" size={15} color={colors.text} style={{ marginRight: 4 }} />
                    <Text style={[styles.btnSecondaryText, { color: colors.text }]}>Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.btnDanger,
                      !selectedReason && { opacity: 0.5 },
                    ]}
                    onPress={handleNextFromStep2}
                    disabled={!selectedReason}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.btnDangerText}>Next: Verification</Text>
                    <Feather name="chevron-right" size={15} color="#FFFFFF" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {/* Step 3: Password / Verification & Execute */}
            {step === 3 && (
              <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
                <View style={styles.warningBox}>
                  <Feather name="alert-triangle" size={16} color="#DC2626" style={{ marginRight: 8, marginTop: 2 }} />
                  <Text style={styles.warningBoxText}>
                    Final Confirmation: You will be logged out immediately. Your account will be permanently erased after 7 days unless you log back in.
                  </Text>
                </View>

                {user?.authProvider === 'email' ? (
                  <View style={styles.fieldWrap}>
                    <Text style={[styles.fieldLabel, { color: colors.text }]}>
                      Enter your password to confirm:
                    </Text>
                    <View
                      style={[
                        styles.passwordInputWrap,
                        {
                          backgroundColor: isDark ? '#1F2437' : '#F3F4F6',
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <TextInput
                        style={[styles.passwordInput, { color: colors.text }]}
                        secureTextEntry={!showPassword}
                        placeholder="Current account password"
                        placeholderTextColor={colors.textTertiary}
                        value={password}
                        onChangeText={(t) => {
                          setPassword(t);
                          setErrorMsg(null);
                        }}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeBtn}
                      >
                        <Feather
                          name={showPassword ? 'eye-off' : 'eye'}
                          size={16}
                          color={colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.oauthInfoCard,
                      {
                        backgroundColor: isDark ? '#1F2437' : '#F3F4F6',
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons name="logo-google" size={18} color="#EA4335" style={{ marginRight: 8 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.oauthTitle, { color: colors.text }]}>Google Account Authorization</Text>
                      <Text style={[styles.oauthDesc, { color: colors.textSecondary }]}>
                        Signed in as {user?.email || 'Google User'}. Tap the button below to authorize scheduling 7-day account deletion.
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.btnRow}>
                  <TouchableOpacity
                    style={[styles.btnSecondary, { borderColor: colors.border }]}
                    onPress={() => setStep(2)}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <Feather name="chevron-left" size={15} color={colors.text} style={{ marginRight: 4 }} />
                    <Text style={[styles.btnSecondaryText, { color: colors.text }]}>Back</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btnConfirmDanger, loading && { opacity: 0.7 }]}
                    onPress={handleConfirmDeletion}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Feather name="trash-2" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                        <Text style={styles.btnDangerText}>Schedule Deletion</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  keyboardWrap: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90%',
  },
  modalCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.15)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  alertIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    flex: 1,
    fontWeight: '500',
  },
  cooldownBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  cooldownTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F59E0B',
    marginBottom: 2,
  },
  cooldownDesc: {
    fontSize: 11,
    color: '#D97706',
    lineHeight: 16,
  },
  scrollArea: {
    maxHeight: 460,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  infoCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  infoIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  infoDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  radioInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  radioLabel: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  customFeedbackWrap: {
    marginTop: 6,
    marginBottom: 12,
  },
  customFeedbackLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  customInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    textAlignVertical: 'top',
    minHeight: 64,
  },
  charCount: {
    fontSize: 10,
    textAlign: 'right',
    marginTop: 4,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  warningBoxText: {
    fontSize: 12,
    color: '#EF4444',
    lineHeight: 18,
    flex: 1,
    fontWeight: '500',
  },
  fieldWrap: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  passwordInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    height: 42,
    fontSize: 13,
  },
  eyeBtn: {
    padding: 6,
  },
  oauthInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  oauthTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  oauthDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  btnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
  },
  btnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  btnConfirmDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  btnDangerText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
