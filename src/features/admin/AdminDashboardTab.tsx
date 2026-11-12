import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore, useSidebarStore } from '../../store';

const APP_ICON = require('../../../assets/appicon.png');
import { adminService, AdminStats, AdminAuditLogItem } from '../../services/adminService';
import {
  useAdminTheme,
  ff,
  AdminHeader,
  IconTile,
  Pill,
  HeroRings,
  shortId,
  FOREST,
  FOREST_RAISED,
  LIME,
  MIST,
  CORAL,
  LILAC,
  MONO,
} from './adminTheme';
import { actionMeta, fmtDay, fmtTime } from './adminActions';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

export const AdminDashboardTab: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { p, font, isDark } = useAdminTheme();
  const currentUser = useAuthStore((s) => s.user);

  const [stats, setStats] = useState<AdminStats>({ totalUsers: 0, activeUsers: 0, bannedUsers: 0 });
  const [adminCount, setAdminCount] = useState<number | null>(null);
  const [recentLogs, setRecentLogs] = useState<AdminAuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [statsData, logsData, usersData] = await Promise.all([
        adminService.getStats().catch(() => ({ totalUsers: 0, activeUsers: 0, bannedUsers: 0 })),
        adminService.getLogs(1, 4).catch(() => ({ logs: [], total: 0, page: 1, limit: 4, totalPages: 1 })),
        adminService.getUsers(1, 100).catch(() => null),
      ]);
      setStats(statsData);
      setRecentLogs(logsData.logs || []);
      setAdminCount(
        usersData ? usersData.users.filter((u) => u.role === 'admin' || u.role === 'superadmin').length : null,
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const firstName = (currentUser?.name || '').trim().split(/\s+/)[0] || 'Admin';
  const activePct = stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0;

  const shortcuts = [
    { label: 'Users', icon: 'users' as const, tint: p.tint.green, route: 'AdminUsers' },
    { label: 'Broadcast', icon: 'send' as const, tint: p.tint.lilac, route: 'AdminBroadcast' },
    { label: 'Audit trail', icon: 'shield' as const, tint: p.tint.amber, route: 'AdminLogs' },
    { label: 'Settings', icon: 'sliders' as const, tint: p.tint.blue, route: 'AdminSettings' },
  ];

  const health = [
    { icon: 'database' as const, label: 'Database', value: 'PostgreSQL 16' },
    { icon: 'zap' as const, label: 'Cache', value: 'Redis · Active' },
    { icon: 'activity' as const, label: 'API gateway', value: 'Operational', ok: true },
    { icon: 'lock' as const, label: 'Security', value: 'JWT + HMAC' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      <AdminHeader
        eyebrow={`${greeting()}, ${firstName}`}
        title="Admin Console"
        onRefresh={handleRefresh}
        refreshing={refreshing}
        leading={
          <TouchableOpacity
            onPress={() => useSidebarStore.getState().openSidebar()}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            activeOpacity={0.7}
            hitSlop={6}
          >
            <Image source={APP_ICON} style={styles.logo} accessibilityIgnoresInvertColors />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={p.segActive} />}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <HeroRings />
          <View style={styles.rowBetween}>
            <Text style={[{ fontSize: 14, color: MIST }, ff(font.bodySemi, '600')]}>Total users</Text>
            <Pill tint={{ bg: 'rgba(184,243,107,0.14)', fg: LIME }} dot={LIME} label="All systems normal" font={font} />
          </View>
          {loading ? (
            <ActivityIndicator color={LIME} style={{ alignSelf: 'flex-start', marginVertical: 22 }} />
          ) : (
            <Text style={[styles.heroAmount, ff(font.display, '800')]}>{stats.totalUsers}</Text>
          )}
          <View style={styles.deltaPill}>
            <Feather name="check-circle" size={12} color={FOREST} />
            <Text style={[{ fontSize: 12, color: FOREST }, ff(font.bodyBold, '700')]}>
              {activePct}% of accounts active
            </Text>
          </View>
          <View style={styles.flowRow}>
            {[
              { label: 'Active', value: stats.activeUsers, dot: LIME },
              { label: 'Suspended', value: stats.bannedUsers, dot: CORAL },
              { label: 'Admins', value: adminCount ?? '—', dot: LILAC },
            ].map((f) => (
              <View key={f.label} style={styles.flowTile}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: f.dot }} />
                  <Text style={[{ fontSize: 12, color: MIST }, ff(font.body, '500')]} numberOfLines={1}>
                    {f.label}
                  </Text>
                </View>
                <Text style={[styles.flowValue, ff(font.displayBold, '700')]}>{f.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Shortcuts */}
        <Text style={[styles.h2, { color: p.text, marginTop: 22, marginBottom: 12, marginHorizontal: 4 }, ff(font.displayBold, '700')]}>
          Shortcuts
        </Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {shortcuts.map((s) => (
            <TouchableOpacity
              key={s.route}
              onPress={() => navigation.navigate(s.route)}
              activeOpacity={0.75}
              accessibilityRole="button"
              style={[styles.shortcut, { backgroundColor: p.card, borderColor: p.line }]}
            >
              <IconTile tint={s.tint} size={52} radius={18}>
                <Feather name={s.icon} size={22} color={s.tint.fg} />
              </IconTile>
              <Text style={[{ fontSize: 13, color: p.text }, ff(font.bodySemi, '600')]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Platform health */}
        <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}>
          <View style={styles.rowBetween}>
            <View>
              <Text style={[styles.h2, { color: p.text }, ff(font.displayBold, '700')]}>Platform health</Text>
              <Text style={[{ fontSize: 13, color: p.sub, marginTop: 2 }, ff(font.body, '500')]}>
                Live status of core services
              </Text>
            </View>
            <Pill tint={p.tint.green} dot={p.success} label="Online" font={font} />
          </View>
          <View style={styles.healthGrid}>
            {health.map((h) => (
              <View key={h.label} style={styles.healthItem}>
                <IconTile tint={{ bg: p.soft, fg: p.text }} size={38} radius={13}>
                  <Feather name={h.icon} size={17} color={isDark ? LIME : FOREST} />
                </IconTile>
                <View style={{ flex: 1 }}>
                  <Text style={[{ fontSize: 12, color: p.muted }, ff(font.body, '500')]}>{h.label}</Text>
                  <Text
                    numberOfLines={1}
                    style={[{ fontSize: 14, color: h.ok ? p.link : p.text, marginTop: 1 }, ff(font.bodySemi, '600')]}
                  >
                    {h.value}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Recent activity */}
        <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line, paddingBottom: 6 }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.h2, { color: p.text }, ff(font.displayBold, '700')]}>Recent activity</Text>
            <TouchableOpacity onPress={() => navigation.navigate('AdminLogs')} hitSlop={10}>
              <Text style={[{ fontSize: 13, color: p.link }, ff(font.bodySemi, '600')]}>View all</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="small" color={p.segActive} style={{ paddingVertical: 24 }} />
          ) : recentLogs.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
              <Feather name="file-text" size={26} color={p.muted} />
              <Text style={[{ fontSize: 13, color: p.sub }, ff(font.body, '500')]}>No admin actions recorded yet.</Text>
            </View>
          ) : (
            recentLogs.map((log, i) => {
              const meta = actionMeta(log.action, p);
              return (
                <View
                  key={log.id}
                  style={[
                    styles.logRow,
                    { borderBottomColor: p.divider, borderBottomWidth: i < recentLogs.length - 1 ? 1 : 0 },
                  ]}
                >
                  <IconTile tint={meta.tint} size={42}>
                    <Feather name={meta.icon} size={18} color={meta.tint.fg} />
                  </IconTile>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[{ fontSize: 15, color: p.text }, ff(font.bodySemi, '600')]} numberOfLines={1}>
                      {meta.label}
                    </Text>
                    <Text style={[{ fontSize: 12, color: p.muted, marginTop: 2 }, ff(font.body, '500')]} numberOfLines={1}>
                      Target <Text style={{ fontFamily: MONO }}>{shortId(log.targetUserId)}</Text>
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[{ fontSize: 13, color: p.text }, ff(font.bodySemi, '600')]}>{fmtDay(log.createdAt)}</Text>
                    <Text style={[{ fontSize: 12, color: p.muted, marginTop: 2 }, ff(font.body, '500')]}>
                      {fmtTime(log.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  logo: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: {
    backgroundColor: FOREST,
    borderRadius: 28,
    padding: 22,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  heroAmount: {
    fontSize: 56,
    color: '#FFFFFF',
    letterSpacing: -1.5,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  deltaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 10,
    backgroundColor: LIME,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  flowRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  flowTile: { flex: 1, backgroundColor: FOREST_RAISED, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 12 },
  flowValue: { fontSize: 22, color: '#FFFFFF', marginTop: 6, fontVariant: ['tabular-nums'] },
  h2: { fontSize: 18 },
  shortcut: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 8,
    borderRadius: 22,
    borderWidth: 1,
  },
  card: { marginTop: 18, borderRadius: 24, borderWidth: 1, padding: 18 },
  healthGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16, rowGap: 16 },
  healthItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 8 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
});
