import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../store';
import { adminService, AdminAuditLogItem } from '../../services/adminService';

export const AdminLogsTab: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [logs, setLogs] = useState<AdminAuditLogItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchLogs = useCallback(async (targetPage = 1) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await adminService.getLogs(targetPage, 20);
      setLogs(res.logs || []);
      setPage(res.page || 1);
      setTotalPages(res.totalPages || 1);
      setTotalCount(res.total || 0);
      setFetchError(null);
    } catch (err: any) {
      setFetchError(err.message || 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLogs(page);
  };

  const formatDate = (ts: number | null) => {
    if (!ts) return 'Unknown';
    const d = new Date(Number(ts));
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
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
            <Text style={[styles.headerTitle, { color: colors.text }]}>Audit Trail</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{totalCount} Events</Text>
            </View>
          </View>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Immutable cryptographic records of administrative actions
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
        {/* Security / Compliance Badge Banner */}
        <View
          style={[
            styles.securityBanner,
            {
              backgroundColor: isDark ? 'rgba(234, 179, 8, 0.08)' : '#FEFCE8',
              borderColor: 'rgba(234, 179, 8, 0.25)',
            },
          ]}
        >
          <Feather name="shield" size={16} color="#EAB308" style={{ marginTop: 1 }} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={[styles.securityTitle, { color: isDark ? '#FEF08A' : '#713F12' }]}>
              HMAC-SHA256 Anonymized Audit Log
            </Text>
            <Text style={[styles.securityText, { color: isDark ? '#FDE047' : '#854D0E' }]}>
              All administrative purges and suspensions are logged with cryptographic HMACs to maintain zero raw
              PII compliance while ensuring forensic traceability.
            </Text>
          </View>
        </View>

        {/* Loading State */}
        {loading && !refreshing && (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#EAB308" />
            <Text style={{ marginTop: 10, fontSize: 13, color: colors.textSecondary }}>
              Loading audit logs...
            </Text>
          </View>
        )}

        {/* Error State */}
        {fetchError && !loading && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
              borderWidth: 1,
              borderColor: 'rgba(239, 68, 68, 0.3)',
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <Feather name="alert-triangle" size={20} color="#EF4444" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>Unable to Load Logs</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                {fetchError.includes('Failed to fetch')
                  ? 'Backend server was temporarily unreachable. Tap Retry to reconnect.'
                  : fetchError}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => fetchLogs(page)}
              style={{ backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty State */}
        {!loading && !fetchError && logs.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={38} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Audit Logs Recorded</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Administrative actions such as user suspensions, unbans, and account deletions will appear here.
            </Text>
          </View>
        )}

        {/* Logs List */}
        {!loading &&
          logs.map((log) => {
            const actionColor = getActionColor(log.action);

            return (
              <View
                key={log.id}
                style={[
                  styles.logCard,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={styles.logCardHeader}>
                  <View
                    style={[
                      styles.actionBadge,
                      { backgroundColor: `${actionColor}18`, borderColor: `${actionColor}35` },
                    ]}
                  >
                    <Text style={[styles.actionBadgeText, { color: actionColor }]}>{log.action}</Text>
                  </View>
                  <Text style={[styles.logTimestamp, { color: colors.textTertiary }]}>
                    {formatDate(log.createdAt)}
                  </Text>
                </View>

                <Text style={[styles.logReason, { color: colors.text }]}>{log.reason}</Text>

                <View style={styles.logDetailGrid}>
                  <View style={styles.logDetailItem}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Admin ID</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {log.adminId ? log.adminId.slice(0, 8) + '...' : 'System'}
                    </Text>
                  </View>

                  <View style={styles.logDetailItem}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Target User</Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {log.targetUserId ? log.targetUserId.slice(0, 8) + '...' : 'System Target'}
                    </Text>
                  </View>

                  {log.targetEmailHmac ? (
                    <View style={[styles.logDetailItem, { width: '100%', marginTop: 4 }]}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>HMAC Checksum</Text>
                      <Text style={[styles.detailValueMono, { color: colors.textTertiary }]} numberOfLines={1}>
                        {log.targetEmailHmac}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <View style={styles.paginationRow}>
            <TouchableOpacity
              disabled={page <= 1}
              onPress={() => fetchLogs(page - 1)}
              style={[
                styles.pageBtn,
                { opacity: page <= 1 ? 0.4 : 1, borderColor: colors.border },
              ]}
            >
              <Feather name="chevron-left" size={16} color={colors.text} />
              <Text style={[styles.pageBtnText, { color: colors.text }]}>Prev</Text>
            </TouchableOpacity>
            <Text style={[styles.pageIndicator, { color: colors.textSecondary }]}>
              Page {page} of {totalPages}
            </Text>
            <TouchableOpacity
              disabled={page >= totalPages}
              onPress={() => fetchLogs(page + 1)}
              style={[
                styles.pageBtn,
                { opacity: page >= totalPages ? 0.4 : 1, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.pageBtnText, { color: colors.text }]}>Next</Text>
              <Feather name="chevron-right" size={16} color={colors.text} />
            </TouchableOpacity>
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
  countBadge: {
    backgroundColor: 'rgba(234, 179, 8, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countBadgeText: {
    color: '#EAB308',
    fontSize: 11,
    fontWeight: '700',
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityBanner: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  securityTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  securityText: {
    fontSize: 11,
    lineHeight: 16,
  },
  emptyCard: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 320,
  },
  logCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  logCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionBadge: {
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  actionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  logTimestamp: {
    fontSize: 11,
    fontWeight: '500',
  },
  logReason: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  logDetailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    rowGap: 6,
  },
  logDetailItem: {
    width: '50%',
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  detailValueMono: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 1,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 14,
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  pageBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pageIndicator: {
    fontSize: 12,
    fontWeight: '600',
  },
});
