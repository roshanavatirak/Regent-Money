import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useAuthStore, useSecurityStore, useThemeStore, showGlobalConfirm } from '../../store';
import { authService } from '../../services/authService';
import { biometricService } from '../../services/biometricService';
import { getBackendUrl } from '../../config/api';
import {
  useAdminTheme,
  ff,
  AdminHeader,
  IconTile,
  Pill,
  Segmented,
  SectionLabel,
  HeroRings,
  FOREST,
  FOREST_RAISED,
  LIME,
  MIST,
  MONO,
} from './adminTheme';

const getInitials = (name?: string | null, email?: string | null) => {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return 'AD';
};

export const AdminSettingsTab: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { p, font, isDark } = useAdminTheme();
  const setTheme = useThemeStore((s) => s.setTheme);
  const navigation = useNavigation<any>();
  const openEmailPage = () => navigation.navigate('AdminEmailConfig');
  const user = useAuthStore((s) => s.user);
  const { biometricsEnabled, setBiometricsEnabled, autoLockTimeout, setAutoLockTimeout } = useSecurityStore();

  const handleToggleBiometrics = async (enable: boolean) => {
    if (!enable) {
      const auth = await biometricService.authenticate('Confirm your fingerprint or face to turn off biometric lock');
      if (auth.success) {
        setBiometricsEnabled(false);
        authService.updateSecuritySettings({ biometricsEnabled: false, autoLockTimeout });
      } else {
        showGlobalConfirm({
          title: 'Verification Required',
          message:
            auth.error && auth.error !== 'user_cancel'
              ? auth.error
              : 'Biometric lock remains on because verification was not completed.',
          confirmText: 'OK',
          icon: 'alert-triangle',
          onConfirm: () => {},
        });
      }
      return;
    }

    const check = await biometricService.checkBiometrics();
    if (!check.available) {
      showGlobalConfirm({
        title: 'Biometric Lock Unavailable',
        message: check.errorMessage || 'Please configure biometric security on this device first.',
        confirmText: 'OK',
        icon: 'alert-triangle',
        onConfirm: () => {},
      });
      return;
    }

    const auth = await biometricService.authenticate('Confirm biometric to enable biometric lock');
    if (auth.success) {
      setBiometricsEnabled(true);
      authService.updateSecuritySettings({ biometricsEnabled: true, autoLockTimeout });
    }
  };

  const handleLogout = () => {
    showGlobalConfirm({
      title: 'Sign Out',
      message: 'Are you sure you want to end your administrative session?',
      confirmText: 'Sign Out',
      onConfirm: async () => {
        await authService.logOut();
      },
    });
  };

  const switchProps = {
    trackColor: { false: isDark ? 'rgba(255,255,255,0.18)' : '#CBD5E1', true: isDark ? LIME : FOREST },
    thumbColor: isDark ? '#FFFFFF' : '#FFFFFF',
    ios_backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#CBD5E1',
  };

  const titleText = [{ fontSize: 15, color: p.text }, ff(font.bodySemi, '600')];
  const subText = [{ fontSize: 12, color: p.muted, marginTop: 2 }, ff(font.body, '500')];

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      <AdminHeader title="Settings" subtitle="Your profile, security and console details" />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile */}
        <View style={styles.profile}>
          <HeroRings big={220} small={130} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={styles.avatar}>
              <Text style={[{ fontSize: 22, color: FOREST }, ff(font.display, '800')]}>{getInitials(user?.name, user?.email)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[{ fontSize: 20, color: '#FFFFFF', flexShrink: 1 }, ff(font.displayBold, '700')]} numberOfLines={1}>
                  {user?.name || 'Administrator'}
                </Text>
                <Pill tint={{ bg: 'rgba(184,243,107,0.16)', fg: LIME }} label={(user?.role || 'admin').toUpperCase()} font={font} small />
              </View>
              <Text style={[{ fontSize: 13, color: MIST, marginTop: 2 }, ff(font.body, '500')]} numberOfLines={1}>
                {user?.email || '—'}
              </Text>
            </View>
          </View>
          <View style={styles.idChip}>
            <Text style={[{ fontSize: 12, color: MIST }, ff(font.body, '500')]}>Admin ID</Text>
            <Text style={{ fontFamily: MONO, fontSize: 12, color: '#FFFFFF' }} numberOfLines={1}>
              {user?.id ? `${user.id.slice(0, 16)}…` : '—'}
            </Text>
          </View>
        </View>

        {/* Appearance */}
        <SectionLabel>Appearance</SectionLabel>
        <View style={[styles.group, { backgroundColor: p.card, borderColor: p.line }]}>
          <View style={styles.row}>
            <IconTile tint={p.tint.blue}>
              <Feather name={isDark ? 'moon' : 'sun'} size={18} color={p.tint.blue.fg} />
            </IconTile>
            <View style={{ flex: 1 }}>
              <Text style={titleText}>Dark mode</Text>
              <Text style={subText}>{isDark ? 'Dark theme is on' : 'Light theme is on'}</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={() => setTheme(isDark ? 'light' : 'dark')}
              accessibilityLabel="Dark mode"
              {...switchProps}
            />
          </View>
        </View>

        {/* Security */}
        <SectionLabel>Security</SectionLabel>
        <View style={[styles.group, { backgroundColor: p.card, borderColor: p.line }]}>
          <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: p.divider }]}>
            <IconTile tint={p.tint.green}>
              <Ionicons name="finger-print" size={20} color={p.tint.green.fg} />
            </IconTile>
            <View style={{ flex: 1 }}>
              <Text style={titleText}>Biometric lock</Text>
              <Text style={subText}>Fingerprint or Face ID to open console</Text>
            </View>
            <Switch
              value={biometricsEnabled}
              onValueChange={handleToggleBiometrics}
              accessibilityLabel="Biometric lock"
              {...switchProps}
            />
          </View>
          <View style={{ paddingVertical: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile tint={p.tint.amber}>
                <Feather name="clock" size={18} color={p.tint.amber.fg} />
              </IconTile>
              <View style={{ flex: 1 }}>
                <Text style={titleText}>Auto-lock</Text>
                <Text style={subText}>
                  Locks after {autoLockTimeout} {autoLockTimeout === 1 ? 'minute' : 'minutes'} in background
                </Text>
              </View>
            </View>
            <Segmented<'1' | '5' | '10'>
              style={{ marginTop: 12, backgroundColor: p.soft }}
              value={String(autoLockTimeout) as '1' | '5' | '10'}
              onChange={(v) => setAutoLockTimeout(Number(v) as 1 | 5 | 10)}
              options={[
                { id: '1', label: '1 min' },
                { id: '5', label: '5 min' },
                { id: '10', label: '10 min' },
              ]}
            />
          </View>
        </View>

        {/* Communications & Mail */}
        <SectionLabel>Communications & Mail</SectionLabel>
        <View style={[styles.group, { backgroundColor: p.card, borderColor: p.line }]}>
          <TouchableOpacity
            style={styles.row}
            onPress={openEmailPage}
            activeOpacity={0.7}
          >
            <IconTile tint={p.tint.lilac}>
              <Feather name="mail" size={18} color={p.tint.lilac.fg} />
            </IconTile>
            <View style={{ flex: 1 }}>
              <Text style={titleText}>Email</Text>
              <Text style={subText}>Daily limits and test sends</Text>
            </View>
            <Feather name="chevron-right" size={18} color={p.muted} />
          </TouchableOpacity>
        </View>

        {/* System */}
        <SectionLabel>System</SectionLabel>
        <View style={[styles.group, { backgroundColor: p.card, borderColor: p.line }]}>
          <View style={[styles.infoRow, { borderBottomWidth: 1, borderBottomColor: p.divider }]}>
            <Text style={[{ fontSize: 14, color: p.sub }, ff(font.body, '500')]}>Console version</Text>
            <Text style={[{ fontSize: 14, color: p.text }, ff(font.bodySemi, '600')]}>v1.0.51 · Build 134</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 1, borderBottomColor: p.divider }]}>
            <Text style={[{ fontSize: 14, color: p.sub }, ff(font.body, '500')]}>API endpoint</Text>
            <View style={[styles.codeChip, { backgroundColor: p.bg }]}>
              <Text style={{ fontFamily: MONO, fontSize: 12, color: p.text }} numberOfLines={1}>
                {getBackendUrl().replace(/^https?:\/\//, '')}
              </Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={[{ fontSize: 14, color: p.sub }, ff(font.body, '500')]}>Security model</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: p.success }} />
              <Text style={[{ fontSize: 13, color: p.link }, ff(font.bodyBold, '700')]}>Role-guarded · HMAC</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.logout, { borderColor: p.dangerLine, backgroundColor: p.card }]}
          onPress={handleLogout}
          activeOpacity={0.75}
          accessibilityRole="button"
        >
          <Feather name="log-out" size={18} color={p.danger} />
          <Text style={[{ fontSize: 15, color: p.danger }, ff(font.bodyBold, '700')]}>Sign out of admin console</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  profile: { backgroundColor: FOREST, borderRadius: 28, padding: 20, overflow: 'hidden' },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  idChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: FOREST_RAISED,
    borderRadius: 16,
  },
  group: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14 },
  codeChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, maxWidth: '60%' },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 22,
  },
});
