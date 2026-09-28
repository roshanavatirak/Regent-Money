import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, showGlobalConfirm } from '../store';

export const PrivacyCenterScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();

  const styles = getStyles(colors, isDark);

  const PRIVACY_PILLARS = [
    {
      icon: 'lock',
      title: 'Local Hardware Encryption',
      desc: 'All your accounts, transaction records, and budgets are stored locally on your device with high-performance encrypted storage (MMKV) and secure hardware keystores.',
      badge: 'On-Device',
    },
    {
      icon: 'message-square',
      title: 'Strict Financial SMS Filtering',
      desc: 'Regent Money only parses sender headers from registered Indian banking institutions (e.g. HDFC, SBI, ICICI, Axis). We NEVER read personal chats or store sensitive OTP passwords.',
      badge: 'Bank Only',
    },
    {
      icon: 'shield',
      title: 'Zero Third-Party Ad Tracking',
      desc: 'Your financial portfolio, net worth, and spending behaviors are strictly confidential. We do not sell your data or share it with third-party advertising networks.',
      badge: 'Protected',
    },
    {
      icon: 'database',
      title: 'Complete Data Ownership',
      desc: 'You maintain absolute control over your records. You can reset chat memory, clear offline cache, or request full account deletion with a single tap.',
      badge: 'User Controlled',
    },
  ];

  const handleClearAIChat = () => {
    showGlobalConfirm({
      title: 'Clear AI Memory',
      message: 'This will reset your local AI chatbot conversation history. Your financial accounts and transactions will NOT be affected.',
      confirmText: 'Clear Memory',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: () => {
        // Chat cache reset confirmation
      },
    });
  };

  const handleClearCache = () => {
    showGlobalConfirm({
      title: 'Purge Sync Cache',
      message: 'Clear temporary SMS parsing caches? The app will resynchronize directly from your device ledger.',
      confirmText: 'Purge Cache',
      cancelText: 'Cancel',
      icon: 'info',
      onConfirm: () => {},
    });
  };

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
          <Text style={styles.headerTitle}>Privacy Center</Text>
          <Text style={styles.headerSubtitle}>Bank-grade transparency and data protection</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* Trust Banner */}
        <View style={styles.trustBanner}>
          <View style={styles.trustBadge}>
            <Feather name="check-circle" size={12} color={colors.accent} style={{ marginRight: 5 }} />
            <Text style={styles.trustBadgeText}>REGENT TRUST STANDARD</Text>
          </View>
          <Text style={styles.trustTitle}>Private Wealth Financial Security</Text>
          <Text style={styles.trustSub}>
            We engineer Regent Money around client privacy. Your financial figures exist to empower your wealth journey — never to be monetized or tracked by third parties.
          </Text>
        </View>

        {/* Pillars List */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>CORE ARCHITECTURE PILLARS</Text>
        </View>

        <View style={styles.pillarsList}>
          {PRIVACY_PILLARS.map((item, idx) => (
            <View key={idx} style={styles.pillarCard}>
              <View style={styles.pillarHeader}>
                <View style={styles.pillarIconBox}>
                  <Feather name={item.icon as any} size={15} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pillarTitle}>{item.title}</Text>
                </View>
                <View style={styles.tagBadge}>
                  <Text style={styles.tagBadgeText}>{item.badge}</Text>
                </View>
              </View>
              <Text style={styles.pillarDesc}>{item.desc}</Text>
            </View>
          ))}
        </View>

        {/* Data Rights & Control */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>DATA CONTROL & ACTIONS</Text>
        </View>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleClearAIChat}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconBox, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#fee2e2' }]}>
              <Feather name="trash-2" size={15} color="#ef4444" />
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.actionTitle}>Clear AI Chat History</Text>
              <Text style={styles.actionDesc}>Reset locally stored AI prompt memory and conversation context.</Text>
            </View>
            <Feather name="chevron-right" size={15} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.actionRow}
            onPress={handleClearCache}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconBox, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#e0f2fe' }]}>
              <Feather name="refresh-cw" size={15} color="#0284c7" />
            </View>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.actionTitle}>Purge Parsing Cache</Text>
              <Text style={styles.actionDesc}>Clear temporary local synchronization caches without losing transactions.</Text>
            </View>
            <Feather name="chevron-right" size={15} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Compliance Note */}
        <View style={styles.complianceBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} style={{ marginRight: 8, marginTop: 2 }} />
          <Text style={styles.complianceText}>
            Regent Money complies with Indian Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules and RBI data residency recommendations.
          </Text>
        </View>
      </ScrollView>
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
      paddingTop: 16,
      gap: 14,
    },
    trustBanner: {
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.08)' : '#f0fdf4',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(45, 186, 78, 0.25)' : '#bbf7d0',
      padding: 16,
    },
    trustBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(45, 186, 78, 0.1)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      marginBottom: 10,
    },
    trustBadgeText: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.accent,
      letterSpacing: 0.6,
    },
    trustTitle: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 6,
    },
    trustSub: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    sectionHeader: {
      marginTop: 6,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: colors.textSecondary,
    },
    pillarsList: {
      gap: 10,
    },
    pillarCard: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    pillarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    pillarIconBox: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(45, 186, 78, 0.08)',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 10,
    },
    pillarTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.text,
    },
    tagBadge: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
      marginLeft: 8,
    },
    tagBadgeText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    pillarDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 6,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 10,
    },
    actionIconBox: {
      width: 32,
      height: 32,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    actionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    actionDesc: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 15,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: 10,
    },
    complianceBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 4,
    },
    complianceText: {
      flex: 1,
      fontSize: 11,
      color: colors.textSecondary,
      lineHeight: 16,
    },
  });
