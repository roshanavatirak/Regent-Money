import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../store';
import { smsPermissionService } from '../services/smsPermissionService';
import { smsCatchupService } from '../services/smsCatchupService';

interface SmsPermissionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onGranted?: () => void;
}

export const SmsPermissionModal: React.FC<SmsPermissionModalProps> = ({
  visible,
  onDismiss,
  onGranted,
}) => {
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(false);

  if (!visible) return null;

  const handleEnable = async () => {
    setLoading(true);
    try {
      const granted = await smsPermissionService.requestSmsPermissions();
      if (granted) {
        setLoading(false);
        // Explain background sync before navigating to system battery settings
        Alert.alert(
          'Background Tracking',
          'For instant tracking when the app is closed, allow Regent Money to run in the background in system settings.',
          [
            {
              text: 'Continue',
              onPress: async () => {
                await smsPermissionService.requestBatteryOptimizationExemption();
                smsCatchupService.reconcile().catch(() => {});
                if (onGranted) onGranted();
                onDismiss();
              },
            },
            {
              text: 'Skip',
              style: 'cancel',
              onPress: () => {
                smsCatchupService.reconcile().catch(() => {});
                if (onGranted) onGranted();
                onDismiss();
              },
            },
          ]
        );
        return;
      }
    } catch (e) {
      console.warn('[SmsPermissionModal] Failed to grant SMS permissions:', e);
    } finally {
      setLoading(false);
      onDismiss();
    }
  };

  const handleDismiss = () => {
    smsPermissionService.setPrompted(true);
    onDismiss();
  };

  const openPrivacyPolicy = () => {
    Linking.openURL('https://regentmoney.com/privacy').catch(() => {});
  };

  const styles = getStyles(colors, isDark);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleDismiss}
    >
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* Top Message Icon */}
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="message-text-lock" size={30} color="#2dba4e" />
          </View>

          {/* Kicker & Title */}
          <Text style={styles.kicker}>PROMINENT DISCLOSURE</Text>
          <Text style={styles.title}>Automatic expense tracking from bank SMS</Text>
          <Text style={styles.subtitle}>
            Regent Money reads SMS messages from your banks to record transactions automatically, including recent messages already in your inbox.
          </Text>

          {/* Disclosure Points */}
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <View
                style={[
                  styles.featureIconWrap,
                  { backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : '#e8f5e9' },
                ]}
              >
                <Feather name="shield" size={17} color="#2dba4e" />
              </View>
              <View style={styles.featureTextWrap}>
                <Text style={styles.featureTitle}>Only bank transaction messages</Text>
                <Text style={styles.featureDesc}>
                  Messages from banks you use are checked on your phone. OTPs, personal messages and messages from anyone else are never read or sent.
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View
                style={[
                  styles.featureIconWrap,
                  { backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#e0f2fe' },
                ]}
              >
                <Feather name="lock" size={17} color="#38bdf8" />
              </View>
              <View style={styles.featureTextWrap}>
                <Text style={styles.featureTitle}>How it's used</Text>
                <Text style={styles.featureDesc}>
                  Bank transaction messages are sent securely to Regent Money's servers to extract the amount, merchant and account. The message text is not stored; only the resulting transaction is saved to your account.
                </Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View
                style={[
                  styles.featureIconWrap,
                  { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb' },
                ]}
              >
                <Feather name="sliders" size={17} color="#f59e0b" />
              </View>
              <View style={styles.featureTextWrap}>
                <Text style={styles.featureTitle}>You're in control</Text>
                <Text style={styles.featureDesc}>
                  You can turn this off anytime in Settings, or add transactions manually instead.
                </Text>
              </View>
            </View>
          </View>

          {/* Privacy Policy Link */}
          <TouchableOpacity
            onPress={openPrivacyPolicy}
            style={styles.privacyLinkRow}
            activeOpacity={0.7}
          >
            <Feather name="external-link" size={12} color="#2dba4e" style={{ marginRight: 4 }} />
            <Text style={styles.privacyLinkText}>Read our Privacy Policy</Text>
          </TouchableOpacity>

          {/* Action Buttons */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleEnable}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#0B0E14" />
            ) : (
              <View style={styles.btnContentRow}>
                <Feather name="check" size={17} color="#0B0E14" style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>Allow SMS access</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleDismiss}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonText}>Not now</Text>
          </TouchableOpacity>
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
      paddingHorizontal: 20,
    },
    container: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: isDark ? '#11151C' : '#FFFFFF',
      borderRadius: 24,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(45, 186, 78, 0.3)' : 'rgba(0, 0, 0, 0.08)',
      shadowColor: '#2dba4e',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.3 : 0.15,
      shadowRadius: 24,
      elevation: 12,
    },
    iconCircle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(45, 186, 78, 0.1)',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
      borderWidth: 1.5,
      borderColor: 'rgba(45, 186, 78, 0.35)',
      position: 'relative',
    },
    iconBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: '#2dba4e',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: isDark ? '#11151C' : '#FFFFFF',
    },
    kicker: {
      fontSize: 11,
      fontWeight: '800',
      color: '#2dba4e',
      letterSpacing: 2,
      marginBottom: 6,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: 21,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      letterSpacing: -0.3,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: 20,
      paddingHorizontal: 8,
    },
    featuresList: {
      width: '100%',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC',
      borderRadius: 16,
      padding: 14,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
    },
    featureIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    featureTextWrap: {
      flex: 1,
    },
    featureTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 2,
    },
    featureDesc: {
      fontSize: 11,
      color: colors.textSecondary,
      lineHeight: 15,
    },
    primaryButton: {
      width: '100%',
      height: 52,
      borderRadius: 26,
      backgroundColor: '#2dba4e',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 10,
      shadowColor: '#2dba4e',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 5,
    },
    btnContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      fontSize: 15,
      fontWeight: '800',
      color: '#0B0E14',
      letterSpacing: 0.3,
    },
    privacyLinkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      marginBottom: 14,
    },
    privacyLinkText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#2dba4e',
      textDecorationLine: 'underline',
    },
    secondaryButton: {
      width: '100%',
      paddingVertical: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    secondaryButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textTertiary || '#8E8E9F',
    },
  });
