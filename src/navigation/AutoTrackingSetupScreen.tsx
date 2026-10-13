import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useTheme } from '../store';
import { mmkvStorage } from '../db/mmkv';
import { smsPermissionService } from '../services/smsPermissionService';
import { smsCatchupService } from '../services/smsCatchupService';

export const TRACKING_SETUP_KEY = 'has_setup_tracking_v1';

interface AutoTrackingSetupScreenProps {
  navigation: any;
}

export const AutoTrackingSetupScreen: React.FC<AutoTrackingSetupScreenProps> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ count: number } | null>(null);

  const handleFinish = () => {
    mmkvStorage.setBoolean(TRACKING_SETUP_KEY, true);
    smsPermissionService.setPrompted(true);
    navigation.replace('Main');
  };

  const handleEnableTracking = async () => {
    if (Platform.OS !== 'android') {
      handleFinish();
      return;
    }

    try {
      const granted = await smsPermissionService.requestSmsPermissions();
      if (!granted) {
        // User denied native prompt, proceed smoothly to dashboard
        handleFinish();
        return;
      }

      // Start live 30-day initial scan
      setScanning(true);
      const lookbackHours = 720; // 30 days
      const result = await smsCatchupService.reconcile(false, lookbackHours);
      const count = result?.syncedCount ?? 0;
      setScanResult({ count });
    } catch (e) {
      console.warn('[AutoTrackingSetup] Scan error:', e);
      handleFinish();
    } finally {
      setScanning(false);
    }
  };

  const handleSkip = () => {
    mmkvStorage.setBoolean(TRACKING_SETUP_KEY, true);
    smsPermissionService.setPrompted(true);
    navigation.replace('Main');
  };

  const styles = getStyles(colors, isDark);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Ambient background glow */}
      <View style={styles.ambientGlow} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Top Progress / Step Indicator */}
        <Animated.View entering={FadeIn.delay(100)} style={styles.topBar}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>QUICK SETUP</Text>
          </View>
          {!scanning && !scanResult && (
            <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.skipTopText}>Skip</Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        {scanning ? (
          /* Live Scanning State */
          <Animated.View entering={FadeIn.duration(400)} style={styles.centeredState}>
            <View style={styles.scanningIconCircle}>
              <ActivityIndicator size="large" color="#2dba4e" />
            </View>
            <Text style={styles.scanningTitle}>Scanning bank messages...</Text>
            <Text style={styles.scanningSubtitle}>
              Detecting transaction SMS from the last 30 days to build your initial cashflow history.
            </Text>
            <View style={styles.scanningPill}>
              <Feather name="shield" size={14} color="#2dba4e" style={{ marginRight: 6 }} />
              <Text style={styles.scanningPillText}>Processed 100% locally on your phone</Text>
            </View>
          </Animated.View>
        ) : scanResult ? (
          /* Scan Complete Success State ("Aha!" moment) */
          <Animated.View entering={FadeInUp.duration(500)} style={styles.centeredState}>
            <View style={styles.successIconCircle}>
              <MaterialCommunityIcons name="check-decagram" size={48} color="#2dba4e" />
            </View>
            <Text style={styles.successTitle}>
              {scanResult.count > 0 ? `Found ${scanResult.count} Transactions!` : 'Auto-Tracking Ready!'}
            </Text>
            <Text style={styles.successSubtitle}>
              {scanResult.count > 0
                ? `Successfully imported your recent bank expenses and credits from the past 30 days.`
                : `We didn't detect past bank SMS in this inbox, but upcoming transaction alerts will appear automatically.`}
            </Text>

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleFinish}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>View Dashboard</Text>
              <Feather name="arrow-right" size={18} color="#0B0E14" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </Animated.View>
        ) : (
          /* Standard Prominent Disclosure State */
          <>
            <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.headerSection}>
              <View style={styles.iconCircle}>
                <MaterialCommunityIcons name="message-text-lock" size={36} color="#2dba4e" />
              </View>

              <Text style={styles.kicker}>PROMINENT DISCLOSURE</Text>
              <Text style={styles.title}>Automatic Expense Tracking</Text>
              <Text style={styles.subtitle}>
                Regent Money reads SMS messages from your banks to record expenses and income automatically—eliminating manual entries.
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(350).duration(600)} style={styles.featuresList}>
              <View style={styles.featureItem}>
                <View style={styles.featureIconWrap}>
                  <Feather name="shield" size={18} color="#2dba4e" />
                </View>
                <View style={styles.featureTextWrap}>
                  <Text style={styles.featureTitle}>Only bank transaction messages</Text>
                  <Text style={styles.featureDesc}>
                    We strictly filter for financial alerts from recognized banks. Personal messages, OTPs, and spam are completely ignored.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <View style={styles.featureIconWrap}>
                  <Feather name="cpu" size={18} color="#2dba4e" />
                </View>
                <View style={styles.featureTextWrap}>
                  <Text style={styles.featureTitle}>100% on-device parsing</Text>
                  <Text style={styles.featureDesc}>
                    Your raw SMS text never leaves your phone. SMS extraction happens entirely offline on your local device.
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <View style={styles.featureIconWrap}>
                  <Feather name="zap" size={18} color="#2dba4e" />
                </View>
                <View style={styles.featureTextWrap}>
                  <Text style={styles.featureTitle}>Instant catch-up import</Text>
                  <Text style={styles.featureDesc}>
                    Imports your last 30 days of bank SMS on first setup so your charts and balances are accurate right away.
                  </Text>
                </View>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(500).duration(600)} style={styles.actionsSection}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleEnableTracking}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Enable Auto-Tracking</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={handleSkip}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryBtnText}>Skip for now</Text>
              </TouchableOpacity>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    ambientGlow: {
      position: 'absolute',
      top: -60,
      alignSelf: 'center',
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.08)' : 'rgba(45, 186, 78, 0.04)',
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 24,
      justifyContent: 'space-between',
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      marginBottom: 20,
    },
    stepBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : '#e8f5e9',
    },
    stepBadgeText: {
      color: '#2dba4e',
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
    },
    skipTopText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    headerSection: {
      alignItems: 'center',
      marginBottom: 24,
    },
    iconCircle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : '#e8f5e9',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(45, 186, 78, 0.25)' : 'rgba(45, 186, 78, 0.2)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    kicker: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: '#2dba4e',
      marginBottom: 6,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: 8,
    },
    featuresList: {
      marginVertical: 12,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: isDark ? colors.card : '#F8F9FA',
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    featureIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : '#e8f5e9',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
      marginTop: 2,
    },
    featureTextWrap: {
      flex: 1,
    },
    featureTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 3,
    },
    featureDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 17,
    },
    actionsSection: {
      marginTop: 20,
      marginBottom: 8,
    },
    primaryBtn: {
      backgroundColor: '#2dba4e',
      borderRadius: 14,
      height: 52,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#2dba4e',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    primaryBtnText: {
      color: '#0B0E14',
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    secondaryBtn: {
      marginTop: 12,
      height: 44,
      justifyContent: 'center',
      alignItems: 'center',
    },
    secondaryBtnText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    centeredState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginVertical: 40,
    },
    scanningIconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.1)' : '#e8f5e9',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    scanningTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 8,
    },
    scanningSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: 20,
      paddingHorizontal: 12,
    },
    scanningPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : '#e8f5e9',
    },
    scanningPillText: {
      color: '#2dba4e',
      fontSize: 12,
      fontWeight: '600',
    },
    successIconCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : '#e8f5e9',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 18,
    },
    successTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 8,
    },
    successSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 28,
      paddingHorizontal: 16,
    },
  });
