import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTheme, useAuthStore, useSecurityStore, useThemeStore, showGlobalConfirm } from '../../store';
import { authService } from '../../services/authService';
import { getBackendUrl } from '../../config/api';

export const AdminSettingsTab: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const setTheme = useThemeStore((s) => s.setTheme);
  const user = useAuthStore((s) => s.user);

  const {
    biometricsEnabled,
    setBiometricsEnabled,
    autoLockTimeout,
    setAutoLockTimeout,
  } = useSecurityStore();

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

  const getInitials = (name?: string | null, email?: string | null) => {
    if (name && name.trim()) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return parts[0].slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return 'AD';
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: Math.max(insets.top, 16) + 8,
            backgroundColor: isDark ? 'rgba(22, 27, 34, 0.95)' : colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Admin Settings</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Security, appearance & administrative session
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 90 }}
      >
        {/* Admin Profile Card */}
        <View
          style={[
            styles.profileCard,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={[styles.avatarCircle, { backgroundColor: 'rgba(234, 179, 8, 0.15)', borderColor: '#EAB308' }]}>
            <Text style={styles.avatarText}>{getInitials(user?.name, user?.email)}</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.profileName, { color: colors.text }]}>
                {user?.name || 'Administrator'}
              </Text>
              <View style={styles.badgeGold}>
                <Text style={styles.badgeGoldText}>
                  {user?.role?.toUpperCase() || 'ADMIN'}
                </Text>
              </View>
            </View>
            <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>
              {user?.email || 'admin@regentmoney.com'}
            </Text>
            <Text style={[styles.profileId, { color: colors.textTertiary }]}>
              ID: {user?.id ? `${user.id.slice(0, 16)}...` : 'Active Admin'}
            </Text>
          </View>
        </View>

        {/* Section: Interface & Theme */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Interface</Text>
        <View
          style={[
            styles.cardGroup,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.settingRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View style={[styles.iconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                <Feather name={isDark ? 'moon' : 'sun'} size={18} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Dark Mode</Text>
                <Text style={[styles.settingSub, { color: colors.textSecondary }]}>
                  {isDark ? 'High-contrast dark theme enabled' : 'Clean light theme enabled'}
                </Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={() => setTheme(isDark ? 'light' : 'dark')}
              trackColor={{ false: '#767577', true: '#2dba4e' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Section: Security */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Security Controls</Text>
        <View
          style={[
            styles.cardGroup,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.settingRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View style={[styles.iconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                <Ionicons name="finger-print" size={20} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Biometric Lock</Text>
                <Text style={[styles.settingSub, { color: colors.textSecondary }]}>
                  Require fingerprint / Face ID to unlock console
                </Text>
              </View>
            </View>
            <Switch
              value={biometricsEnabled}
              onValueChange={setBiometricsEnabled}
              trackColor={{ false: '#767577', true: '#2dba4e' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
              <View style={[styles.iconWrap, { backgroundColor: 'rgba(234, 179, 8, 0.12)' }]}>
                <Feather name="clock" size={18} color="#EAB308" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Auto-Lock Timeout</Text>
                <Text style={[styles.settingSub, { color: colors.textSecondary }]}>
                  Lock app after {autoLockTimeout} minute(s) in background
                </Text>
              </View>
            </View>
            <View style={styles.timeoutOptions}>
              {([1, 5, 10] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setAutoLockTimeout(t)}
                  style={[
                    styles.timeoutPill,
                    {
                      backgroundColor: autoLockTimeout === t ? colors.accent : 'transparent',
                      borderColor: autoLockTimeout === t ? colors.accent : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.timeoutText,
                      { color: autoLockTimeout === t ? '#FFFFFF' : colors.textSecondary },
                    ]}
                  >
                    {t}m
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Section: System Metadata */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>System Diagnostic</Text>
        <View
          style={[
            styles.cardGroup,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.diagnosticRow}>
            <Text style={[styles.diagLabel, { color: colors.textSecondary }]}>Console Version</Text>
            <Text style={[styles.diagValue, { color: colors.text }]}>v1.0.42 (Build 125)</Text>
          </View>
          <View style={[styles.diagnosticRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[styles.diagLabel, { color: colors.textSecondary }]}>API Endpoint</Text>
            <Text style={[styles.diagValue, { color: colors.text }]} numberOfLines={1}>
              {getBackendUrl()}
            </Text>
          </View>
          <View style={[styles.diagnosticRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
            <Text style={[styles.diagLabel, { color: colors.textSecondary }]}>Security Architecture</Text>
            <Text style={[styles.diagValue, { color: '#10B981' }]}>Role-Guarded + HMAC Anonymized</Text>
          </View>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: 'rgba(239, 68, 68, 0.3)' }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Feather name="log-out" size={18} color="#EF4444" style={{ marginRight: 8 }} />
          <Text style={styles.logoutBtnText}>End Administrative Session</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#EAB308',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
  },
  badgeGold: {
    backgroundColor: 'rgba(234, 179, 8, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.4)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgeGoldText: {
    color: '#EAB308',
    fontSize: 9,
    fontWeight: '800',
  },
  profileEmail: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  profileId: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  cardGroup: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  settingSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  timeoutOptions: {
    flexDirection: 'row',
    gap: 4,
  },
  timeoutPill: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  timeoutText: {
    fontSize: 11,
    fontWeight: '700',
  },
  diagnosticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  diagLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  diagValue: {
    fontSize: 12,
    fontWeight: '700',
    maxWidth: '60%',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 10,
  },
  logoutBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '700',
  },
});
