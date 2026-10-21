import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useThemeStore, useSecurityStore, showGlobalConfirm } from '../store';
import { biometricService } from '../services/biometricService';
import { authService } from '../services/authService';
import { smsPermissionService } from '../services/smsPermissionService';
import { notificationService } from '../services/notificationService';
import { smsCatchupService } from '../services/smsCatchupService';
import { DeleteAccountModal } from '../components/DeleteAccountModal';

type ThemeMode = 'light' | 'dark' | 'system';
type FeatherName = keyof typeof Feather.glyphMap;

const THEME_OPTIONS: { value: ThemeMode; label: string; description?: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System default', description: 'Match your device setting' },
];

const SYNC_RANGES: { value: number; label: string }[] = [
  { value: 1, label: 'Last hour' },
  { value: 4, label: 'Last 4 hours' },
  { value: 12, label: 'Last 12 hours' },
  { value: 24, label: 'Last 24 hours' },
  { value: 168, label: 'Last 7 days' },
];

/* ------------------------------------------------------------------ */
/* Shared styles hook                                                  */
/* ------------------------------------------------------------------ */

const useSettingsStyles = () => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  return { styles, colors, isDark };
};

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

const Section: React.FC<{ title?: string; footer?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  footer,
  children,
}) => {
  const { styles } = useSettingsStyles();
  return (
    <View style={styles.section}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.group}>{children}</View>
      {footer ? <View style={styles.sectionFooter}>{footer}</View> : null}
    </View>
  );
};

type RowProps = {
  icon: FeatherName;
  title: string;
  subtitle?: string;
  value?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  isLast?: boolean;
};

const Row: React.FC<RowProps> = ({
  icon,
  title,
  subtitle,
  value,
  right,
  onPress,
  showChevron,
  destructive,
  disabled,
  isLast,
}) => {
  const { styles, colors } = useSettingsStyles();
  const tint = destructive ? colors.danger : colors.text;

  const content = (
    <>
      <View style={styles.rowIcon}>
        <Feather name={icon} size={17} color={destructive ? colors.danger : colors.textSecondary} />
      </View>
      <View style={[styles.rowBody, !isLast && styles.rowDivider]}>
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: tint }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.rowSubtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text style={styles.rowValue} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {right}
        {showChevron ? (
          <Feather name="chevron-right" size={16} color={colors.textTertiary} style={styles.chevron} />
        ) : null}
      </View>
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, disabled && styles.rowDisabled]}>{content}</View>;
  }

  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
      accessibilityRole="button"
    >
      {content}
    </TouchableOpacity>
  );
};

const SettingSwitch: React.FC<{ value: boolean; onValueChange: (v: boolean) => void; loading?: boolean }> = ({
  value,
  onValueChange,
  loading,
}) => {
  const { colors, isDark } = useSettingsStyles();
  if (loading) return <ActivityIndicator size="small" color={colors.textSecondary} />;
  const offTrack = isDark ? 'rgba(250, 251, 252, 0.16)' : colors.border;
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: offTrack, true: colors.accent }}
      thumbColor={Platform.OS === 'android' ? (value ? '#ffffff' : '#f8fafc') : '#ffffff'}
      ios_backgroundColor={offTrack}
      style={Platform.select({
        web: { transform: [{ scale: 0.85 }] } as any,
        ios: { transform: [{ scaleX: 0.82 }, { scaleY: 0.82 }] },
        android: { transform: [{ scaleX: 0.88 }, { scaleY: 0.88 }] },
      })}
    />
  );
};

type SheetOption<T> = { value: T; label: string; description?: string };

function OptionSheet<T extends string | number>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SheetOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const { styles, colors } = useSettingsStyles();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{title}</Text>
        {options.map((option, index) => {
          const isSelected = option.value === selected;
          return (
            <TouchableOpacity
              key={String(option.value)}
              style={[styles.sheetOption, index < options.length - 1 && styles.rowDivider]}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
              activeOpacity={0.6}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetOptionLabel}>{option.label}</Text>
                {option.description ? (
                  <Text style={styles.rowSubtitle}>{option.description}</Text>
                ) : null}
              </View>
              <View style={[styles.radio, isSelected && { borderColor: colors.accent }]}>
                {isSelected ? <View style={[styles.radioDot, { backgroundColor: colors.accent }]} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export const SettingsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { styles, colors } = useSettingsStyles();
  const setTheme = useThemeStore((state) => state.setTheme);

  // Security
  const biometricsEnabled = useSecurityStore((state) => state.biometricsEnabled);
  const setBiometricsEnabled = useSecurityStore((state) => state.setBiometricsEnabled);
  const autoLockTimeout = useSecurityStore((state) => state.autoLockTimeout);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Permissions
  const [smsGranted, setSmsGranted] = useState(false);
  const [smsChecking, setSmsChecking] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);

  // SMS sync
  const [selectedLookback, setSelectedLookback] = useState(24);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; isSuccess: boolean } | null>(null);

  // Sheets and modals
  const [themeSheetVisible, setThemeSheetVisible] = useState(false);
  const [rangeSheetVisible, setRangeSheetVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const isAndroid = Platform.OS === 'android';
  const themeLabel = THEME_OPTIONS.find((o) => o.value === theme)?.label ?? 'System default';
  const rangeLabel = SYNC_RANGES.find((r) => r.value === selectedLookback)?.label ?? 'Last 24 hours';

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    if (isAndroid) {
      const granted = await smsPermissionService.isPermissionGranted();
      setSmsGranted(granted);
    } else {
      setSmsGranted(true);
    }
    const notifGranted = await notificationService.isPermissionGranted();
    setNotificationsEnabled(notifGranted);
  };

  const handleManualSync = async () => {
    if (!isAndroid) return;
    setManualSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await smsCatchupService.reconcile(true, selectedLookback);
      const count = res?.syncedCount ?? 0;
      setSyncFeedback({
        message:
          count > 0
            ? `${count} new transaction${count > 1 ? 's' : ''} added.`
            : 'You’re up to date. No new transactions found.',
        isSuccess: true,
      });
    } catch (e: any) {
      setSyncFeedback({
        message: e?.message || 'Sync failed. Check SMS access and try again.',
        isSuccess: false,
      });
    } finally {
      setManualSyncing(false);
    }
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
          title: 'App lock unavailable',
          message: check.errorMessage || 'Set up a fingerprint or face unlock on this device first.',
          confirmText: 'OK',
          icon: 'alert-triangle',
          onConfirm: () => {},
        });
        return;
      }

      const auth = await biometricService.authenticate('Confirm it’s you to turn on app lock');
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

  const handleRequestSms = async () => {
    if (!isAndroid) return;
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
        setNotificationsEnabled(!!token);
        if (!token) {
          showGlobalConfirm({
            title: 'Notifications are off',
            message: 'Turn on notifications for this app in your device settings.',
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* Display */}
        <Section title="Display">
          <Row
            icon="sun"
            title="Appearance"
            value={themeLabel}
            onPress={() => setThemeSheetVisible(true)}
            showChevron
            isLast
          />
        </Section>

        {/* Privacy & security */}
        <Section title="Privacy and security">
          <Row
            icon="lock"
            title="App lock"
            subtitle="Require biometric unlock to open the app"
            right={
              <SettingSwitch
                value={biometricsEnabled}
                onValueChange={handleToggleBiometrics}
                loading={biometricLoading}
              />
            }
            isLast
          />
        </Section>

        {/* Notifications & permissions */}
        <Section title="Notifications and permissions">
          <Row
            icon="bell"
            title="Notifications"
            subtitle="Morning and evening spending summaries"
            right={
              <SettingSwitch
                value={notificationsEnabled}
                onValueChange={handleToggleNotifications}
                loading={notificationLoading}
              />
            }
            isLast={!isAndroid}
          />
          {isAndroid && (
            <Row
              icon="message-square"
              title="SMS access"
              subtitle="Detect transactions from bank messages"
              onPress={smsGranted ? undefined : handleRequestSms}
              right={
                smsChecking ? (
                  <ActivityIndicator size="small" color={colors.textSecondary} />
                ) : smsGranted ? (
                  <Text style={styles.statusText}>Allowed</Text>
                ) : (
                  <Text style={[styles.linkText, { color: colors.accent }]}>Allow</Text>
                )
              }
              isLast
            />
          )}
        </Section>

        {/* Transactions (Android only) */}
        {isAndroid && (
          <Section
            title="Transactions"
            footer={
              syncFeedback ? (
                <Text
                  style={[
                    styles.footerText,
                    !syncFeedback.isSuccess && { color: colors.danger },
                  ]}
                >
                  {syncFeedback.message}
                </Text>
              ) : (
                <Text style={styles.footerText}>
                  Check your inbox for bank messages missed while your phone was offline or in battery saver.
                </Text>
              )
            }
          >
            <Row
              icon="clock"
              title="Scan period"
              value={rangeLabel}
              onPress={() => setRangeSheetVisible(true)}
              disabled={manualSyncing}
              showChevron
            />
            <Row
              icon="refresh-cw"
              title={manualSyncing ? 'Checking messages…' : 'Sync now'}
              onPress={handleManualSync}
              disabled={manualSyncing || !smsGranted}
              right={manualSyncing ? <ActivityIndicator size="small" color={colors.textSecondary} /> : null}
              isLast
            />
          </Section>
        )}

        {/* Region */}
        <Section title="Region">
          <Row icon="credit-card" title="Currency" value="INR (₹)" />
          <Row icon="hash" title="Number format" value="Lakhs and crores" isLast />
        </Section>

        {/* Account */}
        <Section
          title="Account"
          footer={
            <Text style={styles.footerText}>
              Your account and transaction history are deleted after 7 days. Sign in during that time to restore it.
            </Text>
          }
        >
          <Row
            icon="trash-2"
            title="Delete account"
            onPress={() => setDeleteModalVisible(true)}
            destructive
            isLast
          />
        </Section>
      </ScrollView>

      <OptionSheet<ThemeMode>
        visible={themeSheetVisible}
        title="Appearance"
        options={THEME_OPTIONS}
        selected={theme as ThemeMode}
        onSelect={setTheme}
        onClose={() => setThemeSheetVisible(false)}
      />

      <OptionSheet<number>
        visible={rangeSheetVisible}
        title="Scan period"
        options={SYNC_RANGES}
        selected={selectedLookback}
        onSelect={(v) => {
          setSelectedLookback(v);
          setSyncFeedback(null);
        }}
        onClose={() => setRangeSheetVisible(false)}
      />

      <DeleteAccountModal visible={deleteModalVisible} onClose={() => setDeleteModalVisible(false)} />
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 10,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.buttonSecondaryBackground,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
    },

    scrollContent: {
      paddingHorizontal: 14,
      paddingTop: 6,
    },

    // Sections
    section: {
      marginTop: 10,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textTertiary,
      marginBottom: 4,
      marginLeft: 4,
    },
    group: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    sectionFooter: {
      marginTop: 4,
      paddingHorizontal: 4,
    },
    footerText: {
      fontSize: 11.5,
      lineHeight: 15,
      color: colors.textTertiary,
    },

    // Rows
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 12,
      minHeight: 42,
    },
    rowDisabled: {
      opacity: 0.5,
    },
    rowIcon: {
      width: 20,
      alignItems: 'center',
      marginRight: 10,
    },
    rowBody: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 9,
      paddingRight: 12,
    },
    rowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowText: {
      flex: 1,
      marginRight: 8,
    },
    rowTitle: {
      fontSize: 14,
      fontWeight: '500',
    },
    rowSubtitle: {
      fontSize: 11.5,
      lineHeight: 15,
      color: colors.textSecondary,
      marginTop: 1,
    },
    rowValue: {
      fontSize: 13,
      color: colors.textSecondary,
      maxWidth: 160,
    },
    chevron: {
      marginLeft: 4,
    },
    statusText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    linkText: {
      fontSize: 13,
      fontWeight: '600',
    },

    // Option sheet
    backdrop: {
      ...StyleSheet.absoluteFill as any,
      backgroundColor: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(15, 23, 42, 0.4)',
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingTop: 8,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 32,
      height: 3.5,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 10,
    },
    sheetTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 2,
    },
    sheetOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
    },
    sheetOptionLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    radio: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 12,
    },
    radioDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
  });