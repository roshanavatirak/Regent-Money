import React, { useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../store';

interface PrivacyPolicyModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({
  visible,
  onDismiss,
}) => {
  const { colors, isDark } = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  if (!visible) return null;

  const styles = getStyles(colors, isDark);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
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
                <Text style={styles.headerSubtitle}>Privacy Policy & Data Protection</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={onDismiss}
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Privacy Trust Banner */}
          <View style={styles.statusBanner}>
            <Ionicons name="shield-checkmark" size={14} color="#10B981" />
            <Text style={styles.statusBannerText}>Privacy by Design • 100% On-Device Processing</Text>
          </View>

          {/* Scrollable Privacy Content */}
          <View style={styles.scrollWrapper}>
            <ScrollView
              ref={scrollRef}
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              {/* Section 1 */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>1. Scope & Privacy Commitment</Text>
                <Text style={styles.paragraph}>
                  At Regent Money, we believe your personal finances, spending patterns, and bank balances belong exclusively to you.
                  This Privacy Policy explains how information is collected, processed, and safeguarded when you use our mobile application and associated services.
                </Text>
                <Text style={styles.paragraph}>
                  We adhere strictly to a &ldquo;Privacy by Design&rdquo; architecture, prioritizing local on-device computation over centralized data aggregation.
                </Text>
              </View>

              {/* Section 2 */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>2. Information We Collect (and Don&apos;t Collect)</Text>
                <Text style={styles.paragraph}>
                  To deliver real-time financial intelligence while keeping your identity private, we strictly minimize data collection:
                </Text>
                <View style={styles.bulletList}>
                  <View style={styles.bulletItem}>
                    <Ionicons name="shield-checkmark" size={14} color="#10B981" style={styles.bulletIcon} />
                    <Text style={styles.bulletText}>
                      <Text style={styles.boldText}>Account Credentials: </Text>
                      Your name, email address, and optional phone number used solely for authentication, session verification, and security sync.
                    </Text>
                  </View>
                  <View style={styles.bulletItem}>
                    <Ionicons name="shield-checkmark" size={14} color="#10B981" style={styles.bulletIcon} />
                    <Text style={styles.bulletText}>
                      <Text style={styles.boldText}>Bank Transaction SMS: </Text>
                      Sender headers (e.g. HDFC, SBI, ICICI, AXIS) and numerical transaction figures extracted locally to track income and expenses.
                    </Text>
                  </View>
                  <View style={styles.bulletItem}>
                    <Ionicons name="close-circle" size={14} color="#FF5252" style={styles.bulletIcon} />
                    <Text style={styles.bulletText}>
                      <Text style={styles.boldText}>What We NEVER Access: </Text>
                      We never read, process, or transmit personal conversations, contacts, photos, or sensitive One-Time Passwords (OTPs).
                    </Text>
                  </View>
                </View>
              </View>

              {/* Section 3 */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>3. 100% On-Device SMS Extraction</Text>
                <Text style={styles.paragraph}>
                  Unlike traditional expense trackers that upload your full inbox to remote cloud servers, Regent Money executes regex pattern matching and merchant classification directly on your local device.
                </Text>
                <Text style={styles.paragraph}>
                  Your raw SMS text messages never leave your phone. They are processed in volatile memory and discarded immediately once parsed into a local ledger transaction.
                </Text>
              </View>

              {/* Section 4 */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>4. Zero Data Selling & Non-Custodial Architecture</Text>
                <Text style={styles.paragraph}>
                  We have zero partnerships with third-party advertising networks or data aggregators:
                </Text>
                <View style={styles.bulletList}>
                  <View style={styles.bulletItem}>
                    <Ionicons name="checkmark-done" size={14} color="#10B981" style={styles.bulletIcon} />
                    <Text style={styles.bulletText}>
                      <Text style={styles.boldText}>No Data Monetization: </Text>
                      We do not sell, rent, trade, or monetize your spending profiles, net worth, or merchant records.
                    </Text>
                  </View>
                  <View style={styles.bulletItem}>
                    <Ionicons name="checkmark-done" size={14} color="#10B981" style={styles.bulletIcon} />
                    <Text style={styles.bulletText}>
                      <Text style={styles.boldText}>Non-Custodial Privileges: </Text>
                      Regent Money has read-only parsing privileges. We cannot withdraw funds, initiate bank debits, or manage your banking credentials.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Section 5 */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>5. Storage Security & Hardware Encryption</Text>
                <Text style={styles.paragraph}>
                  Your ledger and account caches are secured using hardware-backed keystores and AES-256 local encrypted storage (MMKV).
                </Text>
                <Text style={styles.paragraph}>
                  All communications with our authentication and synchronization endpoints enforce Transport Layer Security (TLS 1.3) with encrypted token payloads to prevent interception.
                </Text>
              </View>

              {/* Section 6 */}
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>6. Your Privacy Rights & Deletion</Text>
                <Text style={styles.paragraph}>
                  You have complete sovereignty over your financial data. You may revoke SMS monitoring permissions in system settings, export your transactions, or purge your account and cloud profile completely at any time from the in-app Privacy Center.
                </Text>
                <Text style={styles.paragraph}>
                  For privacy inquiries, data deletion requests, or grievance redressal, contact our Data Protection team at: privacy@regentmoney.com.
                </Text>
              </View>

              {/* End of Document Anchor */}
              <View style={styles.endAnchor}>
                <View style={styles.endBrandingWrap}>
                  <Text style={styles.endFromLabel}>FROM</Text>
                  <Text style={styles.endStudioBrand}>RAO DEV STUDIOS</Text>
                </View>
                <Text style={styles.endTimestamp}>Effective Date: October 2026 &bull; Privacy Policy v2.0</Text>
              </View>
            </ScrollView>
          </View>

          {/* Bottom Action Area */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
              onPress={onDismiss}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Close</Text>
            </TouchableOpacity>
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
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 24,
    },
    modalCard: {
      width: '100%',
      maxWidth: 440,
      backgroundColor: isDark ? '#12161F' : '#FFFFFF',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    logoBadge: {
      width: 42,
      height: 42,
      borderRadius: 11,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
      overflow: 'hidden',
    },
    logoImage: {
      width: '100%',
      height: '100%',
      borderRadius: 11,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    brandTitle: {
      fontSize: 16,
      fontWeight: '900',
      color: isDark ? '#FFFFFF' : '#0B0E14',
      letterSpacing: 1.2,
    },
    brandAccent: {
      fontSize: 16,
      fontWeight: '900',
      color: '#10B981',
      letterSpacing: 1.2,
    },
    headerSubtitle: {
      fontSize: 11,
      color: isDark ? '#94A3B8' : '#64748B',
      fontWeight: '500',
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
      maxHeight: 400,
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
    footer: {
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 18,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
      backgroundColor: isDark ? '#0F131C' : '#F8FAFC',
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
    primaryBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#0B0E14',
    },
  });
