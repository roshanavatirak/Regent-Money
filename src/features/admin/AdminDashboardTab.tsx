import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useAuthStore } from '../../store';
import { adminService, AdminStats, AdminAuditLogItem } from '../../services/adminService';

export const AdminDashboardTab: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const currentUser = useAuthStore((s) => s.user);

  const [stats, setStats] = useState<AdminStats>({ totalUsers: 0, activeUsers: 0, bannedUsers: 0 });
  const [recentLogs, setRecentLogs] = useState<AdminAuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [statsData, logsData] = await Promise.all([
        adminService.getStats().catch(() => ({ totalUsers: 0, activeUsers: 0, bannedUsers: 0 })),
        adminService.getLogs(1, 4).catch(() => ({ logs: [], total: 0, page: 1, limit: 4, totalPages: 1 })),
      ]);
      setStats(statsData);
      setRecentLogs(logsData.logs || []);
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

  const formatDate = (ts: number | null) => {
    if (!ts) return 'Unknown';
    const d = new Date(Number(ts));
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes('BAN')) return '#EF4444';
    if (action.includes('UNBAN')) return '#10B981';
    if (action.includes('DELETE')) return '#DC2626';
    return '#EAB308';
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Admin Console</Text>
            <View style={styles.badgeGold}>
              <Text style={styles.badgeGoldText}>
                {currentUser?.role?.toUpperCase() || 'ADMIN'}
              </Text>
            </View>
          </View>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Platform overview & administrative operations
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleRefresh}
          style={[
            styles.refreshBtn,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
          ]}
          activeOpacity={0.7}
        >
          <Feather name="refresh-cw" size={16} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 90 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />
        }
      >
        {/* KPI Metric Cards */}
        <View style={styles.statsRow}>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.statIconWrap}>
              <Ionicons name="people" size={18} color={colors.accent} />
            </View>
            <Text style={[styles.statValue, { color: colors.text }]}>{stats.totalUsers}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Users</Text>
          </View>

          <View
            style={[
              styles.statCard,
              {
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#ECFDF5',
                borderColor: 'rgba(16, 185, 129, 0.25)',
              },
            ]}
          >
            <View style={[styles.statIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            </View>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.activeUsers}</Text>
            <Text style={[styles.statLabel, { color: isDark ? '#A7F3D0' : '#065F46' }]}>Active</Text>
          </View>

          <View
            style={[
              styles.statCard,
              {
                backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2',
                borderColor: 'rgba(239, 68, 68, 0.25)',
              },
            ]}
          >
            <View style={[styles.statIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
              <Ionicons name="alert-circle" size={18} color="#EF4444" />
            </View>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.bannedUsers}</Text>
            <Text style={[styles.statLabel, { color: isDark ? '#FECACA' : '#991B1B' }]}>Suspended</Text>
          </View>
        </View>

        {/* System Infrastructure Status */}
        <View
          style={[
            styles.systemCard,
            {
              backgroundColor: isDark ? 'rgba(22, 27, 34, 0.7)' : colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.systemHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={styles.pulseDot} />
              <Text style={[styles.systemTitle, { color: colors.text }]}>Platform Infrastructure</Text>
            </View>
            <View style={styles.healthyPill}>
              <Text style={styles.healthyText}>ONLINE</Text>
            </View>
          </View>

          <View style={styles.systemGrid}>
            <View style={styles.systemItem}>
              <Text style={[styles.systemItemLabel, { color: colors.textSecondary }]}>Database</Text>
              <Text style={[styles.systemItemValue, { color: colors.text }]}>PostgreSQL 16</Text>
            </View>
            <View style={styles.systemItem}>
              <Text style={[styles.systemItemLabel, { color: colors.textSecondary }]}>Cache Layer</Text>
              <Text style={[styles.systemItemValue, { color: colors.text }]}>Redis Active</Text>
            </View>
            <View style={styles.systemItem}>
              <Text style={[styles.systemItemLabel, { color: colors.textSecondary }]}>API Gateway</Text>
              <Text style={[styles.systemItemValue, { color: '#10B981' }]}>Operational</Text>
            </View>
            <View style={styles.systemItem}>
              <Text style={[styles.systemItemLabel, { color: colors.textSecondary }]}>Security Engine</Text>
              <Text style={[styles.systemItemValue, { color: colors.text }]}>JWT & HMAC Encrypted</Text>
            </View>
          </View>
        </View>

        {/* Quick Navigation Cards */}
        <Text style={[styles.sectionHeading, { color: colors.text }]}>Admin Shortcuts</Text>
        <View style={styles.quickActionsContainer}>
          <TouchableOpacity
            style={[
              styles.actionTile,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => navigation.navigate('AdminUsers')}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
              <Ionicons name="people" size={22} color="#3B82F6" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Users Directory</Text>
              <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>
                Search, suspend, or permanently purge users
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionTile,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => navigation.navigate('AdminLogs')}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(234, 179, 8, 0.12)' }]}>
              <Ionicons name="shield-checkmark" size={22} color="#EAB308" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Audit Trail & Logs</Text>
              <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>
                Tamper-evident logs of administrative actions
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionTile,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => navigation.navigate('AdminSettings')}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
              <Ionicons name="settings" size={22} color="#10B981" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Admin Settings</Text>
              <Text style={[styles.actionSubtitle, { color: colors.textSecondary }]}>
                Appearance, credentials, and security controls
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Recent Audit Logs Snapshot */}
        <View style={styles.recentLogsHeader}>
          <Text style={[styles.sectionHeading, { color: colors.text, marginBottom: 0 }]}>
            Recent Administrative Actions
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('AdminLogs')}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.accent }}>View All</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#EAB308" />
          </View>
        ) : recentLogs.length === 0 ? (
          <View
            style={[
              styles.emptyLogCard,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons name="document-text-outline" size={28} color={colors.textTertiary} />
            <Text style={[styles.emptyLogText, { color: colors.textSecondary }]}>
              No administrative actions recorded yet.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8, marginTop: 10 }}>
            {recentLogs.map((log) => (
              <View
                key={log.id}
                style={[
                  styles.logItem,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View
                    style={[
                      styles.actionBadge,
                      { backgroundColor: `${getActionColor(log.action)}18`, borderColor: `${getActionColor(log.action)}35` },
                    ]}
                  >
                    <Text style={[styles.actionBadgeText, { color: getActionColor(log.action) }]}>
                      {log.action}
                    </Text>
                  </View>
                  <Text style={[styles.logDate, { color: colors.textTertiary }]}>
                    {formatDate(log.createdAt)}
                  </Text>
                </View>
                <Text style={[styles.logReason, { color: colors.text }]}>{log.reason}</Text>
                <Text style={[styles.logMeta, { color: colors.textSecondary }]}>
                  Target ID: {log.targetUserId ? log.targetUserId.slice(0, 8) + '...' : 'System'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
  badgeGold: {
    backgroundColor: 'rgba(234, 179, 8, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.4)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeGoldText: {
    color: '#EAB308',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(45, 186, 78, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  systemCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  systemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  systemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  healthyPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  healthyText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
  },
  systemGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
  },
  systemItem: {
    width: '50%',
  },
  systemItemLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  systemItemValue: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  quickActionsContainer: {
    gap: 10,
    marginBottom: 20,
  },
  actionTile: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  actionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  recentLogsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  emptyLogCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  emptyLogText: {
    fontSize: 13,
    fontWeight: '500',
  },
  logItem: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  actionBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  logDate: {
    fontSize: 11,
    fontWeight: '500',
  },
  logReason: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  logMeta: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
});
