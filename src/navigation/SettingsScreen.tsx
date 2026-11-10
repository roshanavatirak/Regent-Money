import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
  Pressable,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Font from 'expo-font';
import Constants from 'expo-constants';
import { useTheme, useThemeStore, useSecurityStore, showGlobalConfirm } from '../store';
import { biometricService } from '../services/biometricService';
import { authService } from '../services/authService';
import { smsPermissionService } from '../services/smsPermissionService';
import { notificationService } from '../services/notificationService';
import { smsCatchupService } from '../services/smsCatchupService';
import { DeleteAccountModal } from '../components/DeleteAccountModal';

type ThemeMode = 'light' | 'dark' | 'system';
type FeatherName = keyof typeof Feather.glyphMap;
type Tone = 'mint' | 'blue' | 'amber' | 'lilac' | 'coral' | 'danger';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

const THEME_OPTIONS: { value: ThemeMode; label: string; description?: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System', description: 'Match your device' },
];

const SYNC_RANGES: { value: number; label: string; short: string }[] = [
  { value: 1, label: 'Last hour', short: '1 hour' },
  { value: 4, label: 'Last 4 hours', short: '4 hours' },
  { value: 12, label: 'Last 12 hours', short: '12 hours' },
  { value: 24, label: 'Last 24 hours', short: '24 hours' },
  { value: 168, label: 'Last 7 days', short: '7 days' },
];

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

const getPalette = (colors: any, isDark: boolean) => ({
  page: isDark ? colors.background : '#F3F6F4',
  card: isDark ? colors.card : '#FFFFFF',
  border: isDark ? 'rgba(250, 251, 252, 0.08)' : '#E1E9E4',
  divider: isDark ? 'rgba(250, 251, 252, 0.08)' : '#EEF3F0',
  ink: isDark ? '#FFFFFF' : '#0B1F17',
  muted: isDark ? 'rgba(250, 251, 252, 0.66)' : '#5B6B63',
  primary: isDark ? LIME : FOREST,
  onPrimary: isDark ? FOREST : '#FFFFFF',
  danger: isDark ? '#FF8A6B' : '#B42E17',
  backIcon: isDark ? LIME : FOREST,
  trackOff: isDark ? 'rgba(250, 251, 252, 0.18)' : '#D5DFD9',
  knobOff: isDark ? '#C9CED2' : '#FFFFFF',
  tones: {
    mint: isDark ? { bg: 'rgba(184, 243, 107, 0.16)', fg: LIME } : { bg: '#E3F2E8', fg: FOREST },
    blue: isDark ? { bg: 'rgba(59, 130, 246, 0.18)', fg: '#93C5FD' } : { bg: '#DCEBFF', fg: '#1450A3' },
    amber: isDark ? { bg: 'rgba(255, 194, 77, 0.16)', fg: '#FFC24D' } : { bg: '#FFF1D6', fg: '#9A5B00' },
    lilac: isDark ? { bg: 'rgba(167, 139, 250, 0.18)', fg: '#C4B5FD' } : { bg: '#EDE7FF', fg: '#3E2A8C' },
    coral: isDark ? { bg: 'rgba(255, 138, 107, 0.18)', fg: '#FFB29E' } : { bg: '#FFE3D6', fg: '#A63A12' },
    danger: isDark ? { bg: 'rgba(255, 138, 107, 0.18)', fg: '#FF8A6B' } : { bg: '#FDE4DF', fg: '#B42E17' },
  } as Record<Tone, { bg: string; fg: string }>,
});

const getFonts = () => ({
  display: Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined,
  body: Font.isLoaded('Figtree_500Medium') ? 'Figtree_500Medium' : undefined,
  semi: Font.isLoaded('Figtree_600SemiBold') ? 'Figtree_600SemiBold' : undefined,
  bold: Font.isLoaded('Figtree_700Bold') ? 'Figtree_700Bold' : undefined,
});

/** Uses the loaded font family, or falls back to a system weight. */
const ff = (family: string | undefined, weight: '500' | '600' | '700' | '800') =>
  family ? { fontFamily: family } : { fontWeight: weight };

const useSettingsTheme = () => {
  const { colors, isDark } = useTheme();
  const p = useMemo(() => getPalette(colors, isDark), [colors, isDark]);
  const font = getFonts();
  return { p, font, isDark };
};

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  const { p, font } = useSettingsTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: p.muted }, ff(font.semi, '600')]}>{title}</Text>
      <View style={[styles.group, { backgroundColor: p.card, borderColor: p.border }]}>{children}</View>
    </View>
  );
};

type RowProps = {
  icon: FeatherName;
  tone: Tone;
  title: string;
  subtitle?: string;
  subtitleTone?: 'muted' | 'danger';
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
  tone,
  title,
  subtitle,
  subtitleTone = 'muted',
  value,
  right,
  onPress,
  showChevron,
  destructive,
  disabled,
  isLast,
}) => {
  const { p, font } = useSettingsTheme();
  const t = p.tones[tone];

  const content = (
    <>
      <View style={[styles.rowIcon, { backgroundColor: t.bg }]}>
        <Feather name={icon} size={18} color={t.fg} />
      </View>
      <View style={styles.rowText}>
        <Text
          style={[styles.rowTitle, { color: destructive ? p.danger : p.ink }, ff(font.bold, '700')]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[
              styles.rowSubtitle,
              { color: subtitleTone === 'danger' ? p.danger : p.muted },
              ff(font.body, '500'),
            ]}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text style={[styles.rowValue, { color: p.muted }, ff(font.semi, '600')]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right}
      {showChevron ? <Feather name="chevron-right" size={17} color={p.muted} style={styles.chevron} /> : null}
      {!isLast ? <View style={[styles.divider, { backgroundColor: p.divider }]} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, disabled && styles.rowDisabled]}>{content}</View>;
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.row, disabled && styles.rowDisabled, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {content}
    </Pressable>
  );
};

const KNOB_TRAVEL = 18;

const ToggleSwitch: React.FC<{
  value: boolean;
  onValueChange: (v: boolean) => void;
  loading?: boolean;
  label: string;
}> = ({ value, onValueChange, loading, label }) => {
  const { p } = useSettingsTheme();
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [value, anim]);

  if (loading) return <ActivityIndicator size="small" color={p.muted} style={styles.switchSpinner} />;

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      hitSlop={8}
      style={[styles.switchTrack, { backgroundColor: value ? p.primary : p.trackOff }]}
    >
      <Animated.View
        style={[
          styles.switchKnob,
          {
            backgroundColor: value ? (p.primary === LIME ? FOREST : LIME) : p.knobOff,
            transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, KNOB_TRAVEL] }) }],
          },
        ]}
      />
    </Pressable>
  );
};

const PillButton: React.FC<{
  label: string;
  onPress: () => void;
  variant: 'primary' | 'lime';
  disabled?: boolean;
  busy?: boolean;
}> = ({ label, onPress, variant, disabled, busy }) => {
  const { p, font } = useSettingsTheme();
  const bg = variant === 'primary' ? p.primary : LIME;
  const fg = variant === 'primary' ? p.onPrimary : FOREST;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <Text style={[styles.pillText, { color: fg }, ff(font.bold, '700')]}>{label}</Text>
      )}
    </Pressable>
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
  const { p, font, isDark } = useSettingsTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: p.card, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={[styles.sheetHandle, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#D5DFD9' }]} />
          <Text style={[styles.sheetTitle, { color: p.ink }, ff(font.display, '800')]}>{title}</Text>
          <View style={[styles.sheetList, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F3F6F4' }]}>
            {options.map((option) => {
              const isSelected = option.value === selected;
              return (
                <Pressable
                  key={String(option.value)}
                  style={({ pressed }) => [
                    styles.sheetOption,
                    { backgroundColor: isSelected ? p.card : 'transparent', opacity: pressed ? 0.7 : 1 },
                  ]}
                  onPress={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sheetOptionLabel, { color: p.ink }, ff(font.bold, '700')]}>
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text style={[styles.rowSubtitle, { color: p.muted }, ff(font.body, '500')]}>
                        {option.description}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: isSelected ? p.primary : p.trackOff,
                        backgroundColor: isSelected ? p.primary : 'transparent',
                      },
                    ]}
                  >
                    {isSelected ? <Feather name="check" size={13} color={p.onPrimary} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
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
  const { p, font } = useSettingsTheme();
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
  const themeLabel = THEME_OPTIONS.find((o) => o.value === theme)?.label ?? 'System';
  const rangeLabel = SYNC_RANGES.find((r) => r.value === selectedLookback)?.short ?? '24 hours';
  const appVersion = Constants.expoConfig?.version;

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
        message: count > 0 ? `${count} new transaction${count > 1 ? 's' : ''} added` : 'You’re up to date',
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
    // 1. Turning OFF: User must verify biometric before App Lock is turned off.
    // If verification fails or is cancelled, App Lock remains ON.
    if (!enable) {
      setBiometricLoading(true);
      try {
        const auth = await biometricService.authenticate(
          'Confirm your fingerprint or face to turn off App lock'
        );

        if (auth.success) {
          setBiometricsEnabled(false);
          authService.updateSecuritySettings({ biometricsEnabled: false, autoLockTimeout });
        } else {
          showGlobalConfirm({
            title: 'Verification Required',
            message:
              auth.error && auth.error !== 'user_cancel'
                ? auth.error
                : 'App lock remains on because biometric verification was not completed.',
            confirmText: 'OK',
            icon: 'alert-triangle',
            onConfirm: () => {},
          });
        }
      } catch (e: any) {
        console.warn('[SettingsScreen] Failed to verify biometric to disable lock:', e);
        showGlobalConfirm({
          title: 'Verification Error',
          message: 'Unable to verify biometric identity. App lock remains on.',
          confirmText: 'OK',
          icon: 'alert-triangle',
          onConfirm: () => {},
        });
      } finally {
        setBiometricLoading(false);
      }
      return;
    }

    // 2. Turning ON: Verify hardware availability and confirm biometric
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

  const syncSubtitle = manualSyncing
    ? 'Checking messages…'
    : syncFeedback
      ? syncFeedback.message
      : smsGranted
        ? 'Recheck your inbox'
        : 'Allow SMS access first';

  return (
    <View style={[styles.container, { backgroundColor: p.page }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: p.card, borderColor: p.border, opacity: pressed ? 0.7 : 1 },
          ]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={18} color={p.backIcon} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: p.ink }, ff(font.display, '800')]}>Settings</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 28 }]}
      >
        <Section title="Display">
          <Row
            icon={theme === 'dark' ? 'moon' : 'sun'}
            tone="mint"
            title="Appearance"
            value={themeLabel}
            onPress={() => setThemeSheetVisible(true)}
            showChevron
            isLast
          />
        </Section>

        <Section title="Privacy">
          <Row
            icon="lock"
            tone="blue"
            title="App lock"
            subtitle="Unlock with fingerprint or face"
            right={
              <ToggleSwitch
                label="App lock"
                value={biometricsEnabled}
                onValueChange={handleToggleBiometrics}
                loading={biometricLoading}
              />
            }
            isLast
          />
        </Section>

        <Section title="Notifications">
          <Row
            icon="bell"
            tone="amber"
            title="Daily summaries"
            subtitle="Morning and evening"
            right={
              <ToggleSwitch
                label="Daily summaries"
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
              tone="amber"
              title="SMS access"
              subtitle="Read bank messages"
              right={
                smsGranted ? (
                  <View style={styles.allowed}>
                    <Feather name="check" size={15} color={p.primary === LIME ? LIME : '#0B6B3A'} />
                    <Text
                      style={[
                        styles.allowedText,
                        { color: p.primary === LIME ? LIME : '#0B6B3A' },
                        ff(font.bold, '700'),
                      ]}
                    >
                      Allowed
                    </Text>
                  </View>
                ) : (
                  <PillButton label="Allow" variant="primary" onPress={handleRequestSms} busy={smsChecking} />
                )
              }
              isLast
            />
          )}
        </Section>

        {isAndroid && (
          <Section title="Transactions">
            <Row
              icon="clock"
              tone="lilac"
              title="Scan period"
              value={rangeLabel}
              onPress={() => setRangeSheetVisible(true)}
              disabled={manualSyncing}
              showChevron
            />
            <Row
              icon="refresh-cw"
              tone="lilac"
              title="Missed messages"
              subtitle={syncSubtitle}
              subtitleTone={syncFeedback && !syncFeedback.isSuccess ? 'danger' : 'muted'}
              right={
                <PillButton
                  label="Sync now"
                  variant="lime"
                  onPress={handleManualSync}
                  disabled={!smsGranted}
                  busy={manualSyncing}
                />
              }
              isLast
            />
          </Section>
        )}

        <Section title="Region">
          <Row icon="credit-card" tone="coral" title="Currency" value="INR (₹)" />
          <Row icon="hash" tone="coral" title="Number format" value="Lakhs, crores" isLast />
        </Section>

        <Section title="Account">
          <Row
            icon="trash-2"
            tone="danger"
            title="Delete account"
            subtitle="Restore within 7 days"
            onPress={() => setDeleteModalVisible(true)}
            destructive
            showChevron
            isLast
          />
        </Section>

        {appVersion ? (
          <Text style={[styles.version, { color: p.muted }, ff(font.semi, '600')]}>Regent v{appVersion}</Text>
        ) : null}
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

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 28, letterSpacing: -0.5 },

  scrollContent: { paddingHorizontal: 20, paddingTop: 4 },

  // Sections
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 13, marginBottom: 8, marginLeft: 4 },
  group: { borderRadius: 22, borderWidth: 1, overflow: 'hidden' },

  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 64,
  },
  rowDisabled: { opacity: 0.5 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15 },
  rowSubtitle: { fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  rowValue: { fontSize: 14, maxWidth: 140 },
  chevron: { marginLeft: -6 },
  divider: { position: 'absolute', left: 68, right: 0, bottom: 0, height: 1 },

  allowed: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  allowedText: { fontSize: 13 },

  // Switch
  switchTrack: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  switchKnob: { width: 22, height: 22, borderRadius: 11 },
  switchSpinner: { width: 46 },

  // Pill button
  pill: {
    height: 34,
    minWidth: 72,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { fontSize: 13 },

  version: { fontSize: 12, textAlign: 'center', marginTop: 28 },

  // Option sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 16 },
  sheetTitle: { fontSize: 22, letterSpacing: -0.4, marginBottom: 14, marginLeft: 2 },
  sheetList: { borderRadius: 22, padding: 6, gap: 2 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  sheetOptionLabel: { fontSize: 15 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
});
