import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useTheme } from '../store';
import { notificationService } from '../services/notificationService';

interface NotificationPermissionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onGranted?: () => void;
}

export const NotificationPermissionModal: React.FC<NotificationPermissionModalProps> = ({
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
      const token = await notificationService.registerForPushNotifications();
      if (token && onGranted) {
        onGranted();
      }
    } catch (e) {
      console.warn('[NotificationModal] Failed to grant notifications:', e);
    } finally {
      setLoading(false);
      onDismiss();
    }
  };

  const handleDismiss = () => {
    notificationService.setPrompted(true);
    onDismiss();
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
          {/* Top Bell Icon Glow */}
          <View style={styles.iconCircle}>
            <Ionicons name="notifications" size={32} color={colors.accent} />
            <View style={styles.iconBadge}>
              <Ionicons name="sparkles" size={10} color="#ffffff" />
            </View>
          </View>

          {/* Kicker & Title */}
          <Text style={styles.kicker}>DAILY DIGEST & HUMOR</Text>
          <Text style={styles.title}>Never Miss a Check-in</Text>
          <Text style={styles.subtitle}>
            Regent Money keeps your wealth in check with daily humor digests and real-time transaction updates.
          </Text>

          {/* Highlights List */}
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <View style={[styles.featureIconWrap, { backgroundColor: isDark ? 'rgba(255, 183, 77, 0.15)' : '#fff8e1' }]}>
                <Ionicons name="sunny-outline" size={18} color="#f59e0b" />
              </View>
              <View style={styles.featureTextWrap}>
                <Text style={styles.featureTitle}>9:00 AM Morning Vibe</Text>
                <Text style={styles.featureDesc}>Light-hearted financial motivation to kick off your day.</Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View style={[styles.featureIconWrap, { backgroundColor: isDark ? 'rgba(129, 140, 248, 0.15)' : '#eef2ff' }]}>
                <Ionicons name="moon-outline" size={18} color="#6366f1" />
              </View>
              <View style={styles.featureTextWrap}>
                <Text style={styles.featureTitle}>9:00 PM Daily Humor Digest</Text>
                <Text style={styles.featureDesc}>A fun recap of your day's spending before you sleep.</Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View style={[styles.featureIconWrap, { backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : '#e8f5e9' }]}>
                <Feather name="zap" size={18} color="#2dba4e" />
              </View>
              <View style={styles.featureTextWrap}>
                <Text style={styles.featureTitle}>Instant Transaction Alerts</Text>
                <Text style={styles.featureDesc}>Immediate insight when debit or credit SMS arrives.</Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleEnable}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View style={styles.btnContentRow}>
                <Ionicons name="notifications" size={16} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.primaryButtonText}>Enable Notifications</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={handleDismiss}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.secondaryButtonText}>Maybe Later</Text>
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
      backgroundColor: 'rgba(0, 0, 0, 0.72)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 22,
    },
    container: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 24,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.4,
      shadowRadius: 20,
      elevation: 15,
    },
    iconCircle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: isDark ? 'rgba(3, 218, 198, 0.12)' : 'rgba(3, 218, 198, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      position: 'relative',
    },
    iconBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    kicker: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: colors.accent,
      marginBottom: 4,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 20,
    },
    featuresList: {
      width: '100%',
      backgroundColor: colors.background,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 22,
      gap: 12,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    featureIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    featureTextWrap: {
      flex: 1,
    },
    featureTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    featureDesc: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    primaryButton: {
      width: '100%',
      backgroundColor: colors.accent,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    btnContentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
    },
    secondaryButton: {
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    secondaryButtonText: {
      color: colors.textTertiary || colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
  });
