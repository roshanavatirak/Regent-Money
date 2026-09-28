import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useThemeStore, useSecurityStore, showGlobalConfirm } from '../store';
import { biometricService } from '../services/biometricService';
import { authService } from '../services/authService';
import { smsPermissionService } from '../services/smsPermissionService';
import { notificationService } from '../services/notificationService';

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark, theme } = useTheme();
  const setTheme = useThemeStore((state) => state.setTheme);

  // Biometrics
  const biometricsEnabled = useSecurityStore((state) => state.biometricsEnabled);
  const setBiometricsEnabled = useSecurityStore((state) => state.setBiometricsEnabled);
  const autoLockTimeout = useSecurityStore((state) => state.autoLockTimeout);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Permissions
  const [smsGranted, setSmsGranted] = useState(false);
  const [smsChecking, setSmsChecking] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    if (Platform.OS === 'android') {
      const granted = await smsPermissionService.isPermissionGranted();
      setSmsGranted(granted);
    } else {
      setSmsGranted(true);
    }

    const notifGranted = await notificationService.isPermissionGranted();
    setNotificationsEnabled(notifGranted);
  };

  const handleToggleBiometrics = async (enable: boolean) => {
    if (!enable) {
      setBiometricsEnabled(false);
      authService.updateSecuritySettings({ biometricsEnabled: false, autoLockTimeout });
      return;
    }

    setBiometricLoading(true);
    try {
      const check = await biometricService.checkBiometrics();
      if (!check.available) {
        showGlobalConfirm({
          title: 'Biometrics Unavailable',
          message: check.errorMessage || 'Biometric hardware is not available on this device.',
          confirmText: 'OK',
          icon: 'alert-triangle',
          onConfirm: () => {},
        });
        return;
      }

      const auth = await biometricService.authenticate('Scan fingerprint or face to activate Regent App Lock');
      if (auth.success) {
        setBiometricsEnabled(true);
        authService.updateSecuritySettings({ biometricsEnabled: true, autoLockTimeout });
      }
    } catch (e: any) {
      console.warn('[SettingsScreen] Biometrics error:', e);
    } finally {
      setBiometricLoading(false);
    }
  };

  const handleToggleSmsPermission = async () => {
    if (Platform.OS !== 'android') return;
    setSmsChecking(true);
    try {
      const granted = await smsPermissionService.requestSmsPermissions();
      setSmsGranted(granted);
    } catch (e) {
      console.warn('[SettingsScreen] SMS permission error:', e);
    } finally {
      setSmsChecking(false);
    }
  };

  const handleToggleNotifications = async (enable: boolean) => {
    setNotificationLoading(true);
    try {
      if (enable) {
        const token = await notificationService.registerForPushNotifications();
        if (token) {
          setNotificationsEnabled(true);
        } else {
          setNotificationsEnabled(false);
          showGlobalConfirm({
            title: 'Permission Notice',
            message: 'Please enable notifications in your phone device settings to receive digest alerts.',
            confirmText: 'OK',
            icon: 'alert-triangle',
            onConfirm: () => {},
          });
        }
      } else {
        await notificationService.unregisterPushToken();
        setNotificationsEnabled(false);
      }
    } catch (e) {
      console.warn('[SettingsScreen] Notification error:', e);
    } finally {
      setNotificationLoading(false);
    }
  };

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
          <Text style={styles.headerTitle}>Settings & Preferences</Text>
          <Text style={styles.headerSubtitle}>Appearance, security, and system permissions</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* 1. Interface Theme */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="moon" size={14} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={styles.cardKicker}>INTERFACE THEME</Text>
          </View>
          <Text style={styles.cardDescription}>
            Customize your visual interface appearance.
          </Text>
          <View style={styles.themePillRow}>
            {(['light', 'dark', 'system'] as const).map((mode) => {
              const isSelected = theme === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  onPress={() => setTheme(mode)}
                  style={[styles.themePill, isSelected && styles.themePillActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.themePillText, isSelected && styles.themePillTextActive]}>
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 2. Biometric Security */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={styles.cardKicker}>BIOMETRIC SECURITY</Text>
          </View>
          <Text style={styles.cardDescription}>
            Protect your financial portfolio with fingerprint or facial recognition upon app resume.
          </Text>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.toggleTitle}>Biometric App Lock</Text>
              <Text style={styles.toggleSubtitle}>
                {biometricsEnabled
                  ? 'Enabled • Device authentication required on resume'
                  : 'Disabled • Open without lock'}
              </Text>
            </View>
            {biometricLoading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Switch
                value={biometricsEnabled}
                onValueChange={handleToggleBiometrics}
                thumbColor={biometricsEnabled ? colors.accent : colors.text}
                trackColor={{ false: colors.buttonSecondaryBackground, true: colors.accentMuted }}
              />
            )}
          </View>
        </View>

        {/* 3. Permissions Management */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="key" size={14} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={styles.cardKicker}>APP PERMISSIONS</Text>
          </View>
          <Text style={styles.cardDescription}>
            Manage capabilities required for automated bank ledger synchronization.
          </Text>

          {/* SMS Permission */}
          {Platform.OS === 'android' && (
            <View style={styles.permissionItem}>
              <View style={styles.permissionMeta}>
                <Text style={styles.permissionTitle}>Financial SMS Sync</Text>
                <Text style={styles.permissionDesc}>
                  {smsGranted
                    ? 'Granted • Automatic bank transaction detection'
                    : 'Not Granted • Required to read bank credit & debit alerts'}
                </Text>
              </View>
              {smsChecking ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : !smsGranted ? (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleToggleSmsPermission}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionBtnText}>Allow</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.badgeGranted}>
                  <Feather name="check" size={11} color={colors.accent} style={{ marginRight: 3 }} />
                  <Text style={styles.badgeGrantedText}>Active</Text>
                </View>
              )}
            </View>
          )}

          {/* Push Notifications */}
          <View style={[styles.permissionItem, { borderBottomWidth: 0, paddingBottom: 0 }]}>
            <View style={styles.permissionMeta}>
              <Text style={styles.permissionTitle}>Push Notifications</Text>
              <Text style={styles.permissionDesc}>
                {notificationsEnabled
                  ? 'Active • Daily morning & evening wealth digests'
                  : 'Disabled • Toggle to receive notifications'}
              </Text>
            </View>
            {notificationLoading ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Switch
                value={notificationsEnabled}
                onValueChange={handleToggleNotifications}
                thumbColor={notificationsEnabled ? colors.accent : colors.text}
                trackColor={{ false: colors.buttonSecondaryBackground, true: colors.accentMuted }}
              />
            )}
          </View>
        </View>

        {/* 4. Financial Preferences */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="globe" size={14} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={styles.cardKicker}>REGIONAL & CURRENCY</Text>
          </View>
          <View style={styles.prefRow}>
            <Text style={styles.prefLabel}>Base Currency</Text>
            <View style={styles.prefValueBadge}>
              <Text style={styles.prefValueText}>INR (₹)</Text>
            </View>
          </View>
          <View style={[styles.prefRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
            <Text style={styles.prefLabel}>Number Formatting</Text>
            <View style={styles.prefValueBadge}>
              <Text style={styles.prefValueText}>Indian (Lakhs & Crores)</Text>
            </View>
          </View>
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
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    cardKicker: {
      fontSize: 10.5,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: colors.accent,
    },
    cardDescription: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 14,
      lineHeight: 17,
    },
    themePillRow: {
      flexDirection: 'row',
      gap: 8,
    },
    themePill: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f8fafc',
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    themePillActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    themePillText: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.text,
    },
    themePillTextActive: {
      color: '#ffffff',
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    toggleTitle: {
      fontSize: 13.5,
      fontWeight: '700',
      color: colors.text,
    },
    toggleSubtitle: {
      fontSize: 11.5,
      color: colors.textSecondary,
      marginTop: 2,
    },
    permissionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    permissionMeta: {
      flex: 1,
      marginRight: 12,
    },
    permissionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    permissionDesc: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 15,
    },
    actionBtn: {
      backgroundColor: colors.accent,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 8,
    },
    actionBtnText: {
      color: '#ffffff',
      fontSize: 11.5,
      fontWeight: '700',
    },
    badgeGranted: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(45, 186, 78, 0.08)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    badgeGrantedText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.accent,
    },
    prefRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    prefLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    prefValueBadge: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
    },
    prefValueText: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.textSecondary,
    },
  });
