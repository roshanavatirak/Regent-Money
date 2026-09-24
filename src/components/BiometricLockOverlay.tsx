import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useSecurityStore, useTheme } from '../store';
import { biometricService } from '../services/biometricService';

export const BiometricLockOverlay = () => {
  const isLocked = useSecurityStore((state) => state.isLocked);
  const setLocked = useSecurityStore((state) => state.setLocked);
  const { colors, isDark } = useTheme();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Pulse animation for the fingerprint scanner icon
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.4);

  useEffect(() => {
    if (isLocked) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 1200, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 1200, easing: Easing.in(Easing.ease) })
        ),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.85, { duration: 1200 }),
          withTiming(0.3, { duration: 1200 })
        ),
        -1,
        true
      );
    }
  }, [isLocked]);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const handleUnlock = useCallback(async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const result = await biometricService.authenticate('Scan fingerprint to access Regent Money');
      if (result.success) {
        setLocked(false);
        setAuthError(null);
      } else {
        setAuthError(result.error || 'Authentication unverified. Please try again.');
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Biometric authentication failed.');
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAuthenticating, setLocked]);

  // Prompt automatically when the lock screen appears
  useEffect(() => {
    let timer: any;
    if (isLocked) {
      timer = setTimeout(() => {
        handleUnlock();
      }, 350);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isLocked]);

  if (!isLocked) return null;

  return (
    <Modal
      visible={isLocked}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={() => {
        // Prevent hardware back button from bypassing lock screen on Android
      }}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Background Decorative Security Rings */}
        <View style={styles.topSection}>
          <View style={[styles.logoBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logoImage}
            />
          </View>
          <View style={styles.brandRow}>
            <Text style={[styles.regentText, { color: colors.accent }]}>REGENT</Text>
            <Text style={[styles.moneyText, { color: colors.text }]}>MONEY</Text>
          </View>
          <View style={[styles.securityTag, { backgroundColor: colors.accentMuted }]}>
            <Feather name="shield" size={12} color={colors.accent} style={{ marginRight: 5 }} />
            <Text style={[styles.securityTagText, { color: colors.accent }]}>BANK-GRADE PRIVACY LOCK</Text>
          </View>
        </View>

        {/* Center Biometric Visual */}
        <View style={styles.centerSection}>
          <View style={styles.pulseContainer}>
            <Animated.View
              style={[
                styles.pulseRing,
                { backgroundColor: colors.accentMuted, borderColor: colors.accent },
                animatedPulseStyle,
              ]}
            />
            <TouchableOpacity
              onPress={handleUnlock}
              activeOpacity={0.8}
              style={[
                styles.scannerCircle,
                {
                  backgroundColor: isDark ? '#1a1f26' : '#ffffff',
                  borderColor: isDark ? 'rgba(45, 186, 78, 0.4)' : 'rgba(22, 163, 74, 0.3)',
                  shadowColor: colors.accent,
                },
              ]}
            >
              {isAuthenticating ? (
                <ActivityIndicator size="large" color={colors.accent} />
              ) : (
                <Ionicons name="finger-print" size={54} color={colors.accent} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={[styles.lockTitle, { color: colors.text }]}>App Is Locked</Text>
          <Text style={[styles.lockSubtitle, { color: colors.textSecondary }]}>
            Auto-locked after inactivity. Please scan your fingerprint to continue your session.
          </Text>

          {authError && (
            <View style={styles.errorBanner}>
              <Feather name="alert-triangle" size={14} color="#FF5252" style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{authError}</Text>
            </View>
          )}
        </View>

        {/* Bottom Action Section */}
        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={[styles.unlockButton, { backgroundColor: colors.accent }]}
            onPress={handleUnlock}
            activeOpacity={0.85}
            disabled={isAuthenticating}
          >
            <Ionicons name="finger-print-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.unlockButtonText}>
              {isAuthenticating ? 'Scanning...' : 'Touch to Unlock'}
            </Text>
          </TouchableOpacity>

          <Text style={[styles.footerText, { color: colors.textTertiary }]}>
            Protected with local on-device hardware cryptography
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 40,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topSection: {
    alignItems: 'center',
    marginTop: 20,
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  regentText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    marginRight: 6,
  },
  moneyText: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  securityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginTop: 4,
  },
  securityTagText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  centerSection: {
    alignItems: 'center',
    width: '100%',
  },
  pulseContainer: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  pulseRing: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 1.5,
  },
  scannerCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  lockTitle: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  lockSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 290,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.25)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 18,
    maxWidth: '95%',
  },
  errorText: {
    color: '#FF5252',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
  },
  unlockButton: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  unlockButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
});
