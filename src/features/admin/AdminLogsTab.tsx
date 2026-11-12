import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { adminService, AdminAuditLogItem } from '../../services/adminService';
import {
  useAdminTheme,
  ff,
  AdminHeader,
  IconTile,
  Pill,
  Segmented,
  SectionLabel,
  HeroRings,
  shortId,
  FOREST,
  LIME,
  MIST,
  MONO,
} from './adminTheme';
import { actionKind, actionMeta, fmtTime, fmtLongDay } from './adminActions';

type LogFilter = 'all' | 'purge' | 'suspend';

export const AdminLogsTab: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { p, font } = useAdminTheme();

  const [logs, setLogs] = useState<AdminAuditLogItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async (targetPage = 1) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await adminService.getLogs(targetPage, 20);
      setLogs(res.logs || []);
      setPage(res.page || 1);
      setTotalPages(res.totalPages || 1);
      setTotalCount(res.total || 0);
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

  const copyHash = async (log: AdminAuditLogItem) => {
    if (!log.targetEmailHmac) return;
    await Clipboard.setStringAsync(log.targetEmailHmac);
    setCopiedId(log.id);
    setTimeout(() => setCopiedId((cur) => (cur === log.id ? null : cur)), 1500);
  };

  // Filter, then group by calendar day (logs arrive newest first).
  const groups = useMemo(() => {
    const filtered = logs.filter((l) => {
      if (filter === 'all') return true;
      const k = actionKind(l.action);
      return filter === 'purge' ? k === 'purge' : k === 'suspend' || k === 'reinstate';
    });
    const out: { day: string; items: AdminAuditLogItem[] }[] = [];
    for (const l of filtered) {
      const day = fmtLongDay(l.createdAt);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(l);
      else out.push({ day, items: [l] });
    }
    return out;
  }, [logs, filter]);

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      <AdminHeader
        title="Audit trail"
        subtitle="Every admin action, signed and kept"
        badge={<Pill tint={p.tint.amber} label={`${totalCount} events`} font={font} />}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={p.segActive} />}
      >
        {/* Trust card */}
        <View style={styles.trust}>
          <HeroRings big={160} small={100} />
          <IconTile tint={{ bg: LIME, fg: FOREST }} size={42}>
            <Feather name="lock" size={19} color={FOREST} />
          </IconTile>
          <View style={{ flex: 1 }}>
            <Text style={[{ fontSize: 17, color: '#FFFFFF' }, ff(font.displayBold, '700')]}>Tamper-evident by design</Text>
            <Text style={[{ fontSize: 13, lineHeight: 19, color: MIST, marginTop: 4 }, ff(font.body, '500')]}>
              Each purge and suspension is signed with HMAC-SHA256. IDs are anonymised, so no raw personal data is stored.
            </Text>
          </View>
        </View>

        <Segmented<LogFilter>
          style={{ marginTop: 16 }}
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'All events' },
            { id: 'purge', label: 'Purges' },
            { id: 'suspend', label: 'Suspensions' },
          ]}
        />

        {loading && !refreshing && (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={p.segActive} />
            <Text style={[{ marginTop: 10, fontSize: 13, color: p.sub }, ff(font.body, '500')]}>Loading audit trail…</Text>
          </View>
        )}

        {fetchError && !loading && (
          <View style={[styles.card, styles.errorCard, { backgroundColor: p.card, borderColor: p.line }]}>
            <IconTile tint={p.tint.coral} size={40}>
              <Feather name="wifi-off" size={18} color={p.tint.coral.fg} />
            </IconTile>
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 14, color: p.text }, ff(font.bodyBold, '700')]}>Can't load the audit trail</Text>
              <Text style={[{ fontSize: 12, color: p.sub, marginTop: 2 }, ff(font.body, '500')]} numberOfLines={2}>
                {fetchError.includes('Failed to fetch') ? 'The backend is temporarily unreachable.' : fetchError}
              </Text>
            </View>
            <TouchableOpacity onPress={() => fetchLogs(page)} style={[styles.smallBtn, { backgroundColor: p.segActive }]}>
              <Text style={[{ fontSize: 13, color: p.segActiveText }, ff(font.bodyBold, '700')]}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !fetchError && groups.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 48, gap: 8 }}>
            <IconTile tint={p.tint.amber} size={56} radius={20}>
              <Feather name="file-text" size={24} color={p.tint.amber.fg} />
            </IconTile>
            <Text style={[{ fontSize: 17, color: p.text, marginTop: 6 }, ff(font.displayBold, '700')]}>No events yet</Text>
            <Text style={[{ fontSize: 13, color: p.sub, textAlign: 'center', maxWidth: 300 }, ff(font.body, '500')]}>
              Suspensions, reinstatements and account purges will show up here.
            </Text>
          </View>
        )}

        {!loading &&
          groups.map((g) => (
            <View key={g.day}>
              <SectionLabel>{g.day}</SectionLabel>
              <View style={[styles.listCard, { backgroundColor: p.card, borderColor: p.line }]}>
                {g.items.map((log, i) => {
                  const meta = actionMeta(log.action, p);
                  const copied = copiedId === log.id;
                  return (
                    <View
                      key={log.id}
                      style={{ paddingVertical: 16, borderBottomWidth: i < g.items.length - 1 ? 1 : 0, borderBottomColor: p.divider }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <IconTile tint={meta.tint} size={40}>
                          <Feather name={meta.icon} size={18} color={meta.tint.fg} />
                        </IconTile>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[{ fontSize: 15, color: p.text }, ff(font.bodySemi, '600')]} numberOfLines={1}>
                            {meta.label}
                          </Text>
                          <Text style={[{ fontSize: 12, color: p.muted, marginTop: 2 }, ff(font.body, '500')]} numberOfLines={1}>
                            {log.reason || log.action}
                          </Text>
                        </View>
                        <Text style={[{ fontSize: 13, color: p.sub }, ff(font.bodySemi, '600')]}>{fmtTime(log.createdAt)}</Text>
                      </View>

                      <View style={styles.idRow}>
                        <View style={[styles.idTile, { backgroundColor: p.bg }]}>
                          <Text style={[{ fontSize: 11, color: p.muted }, ff(font.bodySemi, '600')]}>Admin</Text>
                          <Text style={{ fontFamily: MONO, fontSize: 13, color: p.text, marginTop: 3 }}>{shortId(log.adminId)}</Text>
                        </View>
                        <View style={[styles.idTile, { backgroundColor: p.bg }]}>
                          <Text style={[{ fontSize: 11, color: p.muted }, ff(font.bodySemi, '600')]}>Target user</Text>
                          <Text style={{ fontFamily: MONO, fontSize: 13, color: p.text, marginTop: 3 }}>
                            {shortId(log.targetUserId, 'System')}
                          </Text>
                        </View>
                      </View>

                      {log.targetEmailHmac ? (
                        <View style={[styles.hashRow, { borderColor: p.line }]}>
                          <Feather name="shield" size={14} color={p.link} />
                          <Text style={{ flex: 1, fontFamily: MONO, fontSize: 11, color: p.sub }} numberOfLines={1}>
                            {log.targetEmailHmac}
                          </Text>
                          <TouchableOpacity
                            onPress={() => copyHash(log)}
                            accessibilityLabel="Copy checksum"
                            style={[styles.copyBtn, { backgroundColor: copied ? p.tint.green.bg : p.soft }]}
                          >
                            <Feather name={copied ? 'check' : 'copy'} size={14} color={copied ? p.tint.green.fg : p.text} />
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}

        {totalPages > 1 && (
          <View style={styles.pagination}>
            <TouchableOpacity
              disabled={page <= 1}
              onPress={() => fetchLogs(page - 1)}
              style={[styles.pageBtn, { opacity: page <= 1 ? 0.4 : 1, borderColor: p.line, backgroundColor: p.card }]}
              accessibilityLabel="Newer events"
            >
              <Feather name="chevron-left" size={18} color={p.text} />
            </TouchableOpacity>
            <Text style={[{ fontSize: 13, color: p.sub }, ff(font.bodySemi, '600')]}>
              Page {page} of {totalPages}
            </Text>
            <TouchableOpacity
              disabled={page >= totalPages}
              onPress={() => fetchLogs(page + 1)}
              style={[styles.pageBtn, { opacity: page >= totalPages ? 0.4 : 1, borderColor: p.line, backgroundColor: p.card }]}
              accessibilityLabel="Older events"
            >
              <Feather name="chevron-right" size={18} color={p.text} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  trust: {
    backgroundColor: FOREST,
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    overflow: 'hidden',
  },
  card: { borderWidth: 1, borderRadius: 24, padding: 16, marginTop: 18 },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  smallBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  listCard: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 16 },
  idRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  idTile: { flex: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  hashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  copyBtn: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingTop: 18 },
  pageBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
