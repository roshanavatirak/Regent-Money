import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme, useAuthStore } from '../store';
import { authService } from '../services/authService';

interface TermsAndConditionsModalProps {
  visible: boolean;
  readOnly?: boolean;
  onDismiss?: () => void;
  onAccepted?: () => void;
}

export const TermsAndConditionsModal: React.FC<TermsAndConditionsModalProps> = ({
  visible,
  readOnly = false,
  onDismiss,
  onAccepted,
}) => {
  const { colors, isDark } = useTheme();
  const user = useAuthStore((state) => state.user);

  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  if (!visible) return null;

  const handleScroll = (event: any) => {
    if (hasScrolledToBottom) return;

    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    // Threshold to prevent floating point inaccuracy on various screen densities
    const paddingToBottom = 32;
    const reachedBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;

    if (reachedBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const handleScrollToEnd = () => {
    scrollRef.current?.scrollToEnd({ animated: true });
    // Also unlock after smooth scroll
    setTimeout(() => {
      setHasScrolledToBottom(true);
    }, 350);
  };

  const handleAccept = async () => {
    if (!isChecked || loading) return;

    setLoading(true);
    try {
      await authService.acceptTerms();
      if (onAccepted) {
        onAccepted();
      }
      if (onDismiss) {
        onDismiss();
      }
    } catch (error) {
      console.warn('[TermsModal] Failed to accept terms:', error);
    } finally {
      setLoading(false);
    }
  };

  const styles = getStyles(colors, isDark);

  const formattedAcceptedDate = user?.termsAcceptedAt
    ? new Date(Number(user.termsAcceptedAt)).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={readOnly ? onDismiss : undefined}
    >
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.logoBadge}>
                <Image
                  source={require('../../assets/insideicon.png')}
                  style={styles.logoImage}
                  resizeMode="cover"
                />
              </View>
              <View>
                <View style={styles.headerTitleRow}>
                  <Text style={styles.brandTitle}>REGENT</Text>
                  <Text style={styles.brandAccent}>MONEY</Text>
                </View>
                <Text style={styles.headerSubtitle}>Terms of Service & Agreement</Text>
              </View>
            </View>

            {readOnly && (
              <TouchableOpacity
                onPress={onDismiss}
                style={styles.closeButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Status pill for readOnly mode */}
          {readOnly && (
            <View style={styles.statusBanner}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
              <Text style={styles.statusBannerText}>
                {formattedAcceptedDate
                  ? `Terms Accepted & Active (${formattedAcceptedDate})`
                  : 'Terms Accepted & Active'}
              </Text>
            </View>
          )}

          {/* Scrollable Terms Content */}
          <View style={styles.scrollWrapper}>
            <ScrollView
              ref={scrollRef}
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              onScroll={handleScroll}
              scrollEventThrottle={32}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {/* Introduction */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>1. Acceptance of Terms</Text>
                <Text style={styles.paragraph}>
                  Welcome to Regent Money. By creating an account, accessing, or using the Regent Money
                  mobile application and associated services (collectively, the &ldquo;Service&rdquo;),
                  you acknowledge that you have read, understood, and agree to be bound by these Terms and
                  Conditions (&ldquo;Terms&rdquo;) and our Privacy Policy.
                </Text>
                <Text style={styles.paragraph}>
                  If you do not agree to these Terms in their entirety, you must not access or use the
                  Service. Acceptance is required to ensure consistent protection and regulatory compliance
                  across all financial intelligence tools provided.
                </Text>
              </View>

              {/* Automated SMS & Bank Synchronization */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>2. Financial Tracking & On-Device SMS Intelligence</Text>
                <Text style={styles.paragraph}>
                  Regent Money offers automated expense tracking by processing financial transaction SMS
                  notifications delivered by your authorized banking institutions, credit card issuers, and UPI
                  providers.
                </Text>
                <View style={styles.bulletList}>
                  <View style={styles.bulletItem}>
                    <Ionicons name="checkmark-done" size={14} color="#10B981" style={styles.bulletIcon} />
                    <Text style={styles.bulletText}>
                      <Text style={styles.boldText}>Strict Read-Only Parsing: </Text>
                      The app monitors transactional notifications on-device. We never access, transmit, or store
                      personal conversations, contacts, OTPs, or non-financial messages.
                    </Text>
                  </View>
                  <View style={styles.bulletItem}>
                    <Ionicons name="checkmark-done" size={14} color="#10B981" style={styles.bulletIcon} />
                    <Text style={styles.bulletText}>
                      <Text style={styles.boldText}>Non-Custodial Architecture: </Text>
                      Regent Money is not a bank, broker, or custodian. The Service does not initiate debit
                      transfers, alter banking balances, or control your funds. All money movements take place solely
                      within your bank&rsquo;s official channels.
                    </Text>
                  </View>
                  <View style={styles.bulletItem}>
                    <Ionicons name="checkmark-done" size={14} color="#10B981" style={styles.bulletIcon} />
                    <Text style={styles.bulletText}>
                      <Text style={styles.boldText}>Privacy by Design: </Text>
                      All pattern recognition and merchant identification runs locally through native algorithms.
                      Your raw SMS messages are never sold or shared with third-party advertisers.
                    </Text>
                  </View>
                </View>
              </View>

              {/* User Account & Security */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>3. Account Security & Biometric Protection</Text>
                <Text style={styles.paragraph}>
                  You are solely responsible for maintaining the confidentiality of your login credentials,
                  including your Google account, password, and device passcode.
                </Text>
                <Text style={styles.paragraph}>
                  You may enable biometric authentication (Fingerprint, Face Unlock) within Regent Money.
                  Biometric signatures are evaluated securely within your device&rsquo;s hardware Trusted Execution
                  Environment (TEE) or Keystore and are never transmitted to our remote servers.
                </Text>
              </View>

              {/* Disclaimers */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>4. Financial & Investment Disclaimer</Text>
                <Text style={styles.paragraph}>
                  All financial metrics, automated categorizations, net worth calculations, budget summaries,
                  and daily scheduled notifications provided by Regent Money are for personal informational and
                  budgeting convenience only.
                </Text>
                <Text style={styles.paragraph}>
                  None of the data or insights generated by the Service constitute professional financial, tax,
                  legal, or investment advice. You should consult certified financial professionals before making
                  substantial monetary decisions.
                </Text>
              </View>

              {/* Data Protection */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>5. Data Encryption & Storage</Text>
                <Text style={styles.paragraph}>
                  We utilize AES-256 local storage encryption and TLS 1.3 network layer protection. You have the
                  unrestricted right to request account data deletion, export your transaction history, or revoke
                  SMS monitoring permissions at any time through the in-app Privacy Center.
                </Text>
              </View>

              {/* Termination & Updates */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>6. Modifications to Terms</Text>
                <Text style={styles.paragraph}>
                  Regent Money reserves the right to modify these Terms to accommodate legislative changes or
                  product enhancements. Continued use of the Service following published updates constitutes your
                  binding acceptance of the revised Terms.
                </Text>
              </View>

              {/* End of Document Anchor */}
              <View style={styles.endAnchor}>
                <View style={styles.endBrandingWrap}>
                  <Text style={styles.endFromLabel}>FROM</Text>
                  <Text style={styles.endStudioBrand}>RAO DEV STUDIOS</Text>
                </View>
                <Text style={styles.endTimestamp}>Effective Date: October 2026 &bull; Version 2.0</Text>
              </View>
            </ScrollView>

            {/* Quick jump to bottom helper when user hasn't scrolled down */}
            {!hasScrolledToBottom && !readOnly && (
              <TouchableOpacity
                style={styles.scrollDownHelper}
                onPress={handleScrollToEnd}
                activeOpacity={0.8}
              >
                <Text style={styles.scrollDownHelperText}>Scroll to bottom to review & accept</Text>
                <Feather name="chevron-down" size={14} color="#10B981" />
              </TouchableOpacity>
            )}
          </View>

          {/* Bottom Action Area */}
          <View style={styles.footer}>
            {readOnly ? (
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
                onPress={onDismiss}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Close</Text>
              </TouchableOpacity>
            ) : (
              <>
                {/* Mandatory Agreement Checkbox */}
                <TouchableOpacity
                  style={[
                    styles.checkboxRow,
                    !hasScrolledToBottom && styles.checkboxRowDisabled,
                  ]}
                  onPress={() => {
                    if (hasScrolledToBottom) {
                      setIsChecked(!isChecked);
                    }
                  }}
                  activeOpacity={hasScrolledToBottom ? 0.7 : 1}
                >
                  <View
                    style={[
                      styles.checkbox,
                      isChecked && styles.checkboxChecked,
                      !hasScrolledToBottom && styles.checkboxDisabled,
                    ]}
                  >
                    {isChecked && <Ionicons name="checkmark" size={13} color="#0B0E14" />}
                  </View>
                  <View style={styles.checkboxLabelWrap}>
                    <Text
                      style={[
                        styles.checkboxLabel,
                        !hasScrolledToBottom && styles.checkboxLabelDisabled,
                      ]}
                    >
                      I have read, understood, and agree to the Regent Money Terms & Conditions.
                    </Text>
                    {!hasScrolledToBottom && (
                      <Text style={styles.scrollPromptText}>
                        (Please scroll to the end of the terms to unlock agreement)
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>

                {/* Accept Button */}
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    (!isChecked || loading) && styles.primaryBtnDisabled,
                  ]}
                  onPress={handleAccept}
                  disabled={!isChecked || loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#0B0E14" />
                  ) : (
                    <>
                      <Text
                        style={[
                          styles.primaryBtnText,
                          (!isChecked || loading) && styles.primaryBtnTextDisabled,
                        ]}
                      >
                        Accept & Continue
                      </Text>
                      <Ionicons
                        name="arrow-forward"
                        size={16}
                        color={!isChecked ? 'rgba(255, 255, 255, 0.4)' : '#0B0E14'}
                        style={{ marginLeft: 6 }}
                      />
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.78)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: Platform.OS === 'ios' ? 44 : 24,
    },
    modalCard: {
      width: '100%',
      maxWidth: 440,
      maxHeight: '90%',
      backgroundColor: isDark ? '#12161F' : '#FFFFFF',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? '#232A3B' : '#E2E8F0',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.4,
      shadowRadius: 24,
      elevation: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 18,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    logoBadge: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(16, 185, 129, 0.25)',
    },
    logoImage: {
      width: 38,
      height: 38,
      borderRadius: 9,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    brandTitle: {
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: isDark ? '#F1F5F9' : '#0F172A',
    },
    brandAccent: {
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: '#10B981',
    },
    headerSubtitle: {
      fontSize: 12,
      color: isDark ? '#94A3B8' : '#64748B',
      marginTop: 1,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.1)',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(16, 185, 129, 0.15)',
    },
    statusBannerText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#10B981',
    },
    scrollWrapper: {
      position: 'relative',
      flexShrink: 1,
    },
    scrollView: {
      maxHeight: 380,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 24,
    },
    section: {
      marginBottom: 20,
    },
    sectionHeader: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#F8FAFC' : '#0F172A',
      marginBottom: 8,
    },
    paragraph: {
      fontSize: 13,
      lineHeight: 19,
      color: isDark ? '#94A3B8' : '#475569',
      marginBottom: 8,
    },
    bulletList: {
      marginTop: 4,
      gap: 10,
    },
    bulletItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    bulletIcon: {
      marginTop: 2,
    },
    bulletText: {
      flex: 1,
      fontSize: 12.5,
      lineHeight: 18,
      color: isDark ? '#94A3B8' : '#475569',
    },
    boldText: {
      fontWeight: '700',
      color: isDark ? '#E2E8F0' : '#1E293B',
    },
    endAnchor: {
      alignItems: 'center',
      paddingVertical: 16,
      marginTop: 8,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
    },
    endBrandingWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    endFromLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: isDark ? '#64748B' : '#94A3B8',
      letterSpacing: 0.5,
      textAlign: 'center',
      marginBottom: 2,
    },
    endStudioBrand: {
      fontSize: 13,
      fontWeight: '800',
      color: isDark ? '#E2E8F0' : '#0F172A',
      letterSpacing: 1.6,
      textAlign: 'center',
    },
    endTimestamp: {
      fontSize: 11,
      color: isDark ? '#64748B' : '#94A3B8',
    },
    scrollDownHelper: {
      position: 'absolute',
      bottom: 8,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? 'rgba(18, 22, 31, 0.95)' : 'rgba(255, 255, 255, 0.95)',
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'rgba(16, 185, 129, 0.4)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 4,
    },
    scrollDownHelperText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: '#10B981',
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 18,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
      backgroundColor: isDark ? '#0F131C' : '#F8FAFC',
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 14,
    },
    checkboxRowDisabled: {
      opacity: 0.65,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 5,
      borderWidth: 1.5,
      borderColor: isDark ? '#475569' : '#CBD5E1',
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    checkboxChecked: {
      backgroundColor: '#10B981',
      borderColor: '#10B981',
    },
    checkboxDisabled: {
      borderColor: isDark ? '#334155' : '#E2E8F0',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
    },
    checkboxLabelWrap: {
      flex: 1,
    },
    checkboxLabel: {
      fontSize: 12.5,
      lineHeight: 18,
      color: isDark ? '#E2E8F0' : '#1E293B',
      fontWeight: '500',
    },
    checkboxLabelDisabled: {
      color: isDark ? '#64748B' : '#94A3B8',
    },
    scrollPromptText: {
      fontSize: 11,
      color: '#10B981',
      marginTop: 2,
      fontWeight: '600',
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#10B981',
      paddingVertical: 13,
      borderRadius: 12,
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 3,
    },
    primaryBtnDisabled: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
      shadowOpacity: 0,
      elevation: 0,
    },
    primaryBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#0B0E14',
    },
    primaryBtnTextDisabled: {
      color: isDark ? '#475569' : '#94A3B8',
    },
  });
