import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useAuthStore, showGlobalAlert } from '../../store';
import { adminService, AdminUserItem, AdminStats } from '../../services/adminService';

export const AdminDashboardScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const currentUser = useAuthStore((s) => s.user);

  const [stats, setStats] = useState<AdminStats>({ totalUsers: 0, activeUsers: 0, bannedUsers: 0 });
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Ban Modal State
  const [banModalVisible, setBanModalVisible] = useState(false);
  const [selectedUserForBan, setSelectedUserForBan] = useState<AdminUserItem | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banSubmitting, setBanSubmitting] = useState(false);

  // Delete Modal State
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedUserForDelete, setSelectedUserForDelete] = useState<AdminUserItem | null>(null);
  const [confirmEmailInput, setConfirmEmailInput] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const searchTimer = useRef<any>(null);

  const fetchStats = async () => {
    try {
      const data = await adminService.getStats();
      setStats(data);
    } catch (err: any) {
      console.warn('[Admin] Failed to fetch stats:', err.message);
    }
  };

  const fetchUsers = useCallback(
    async (targetPage = 1, search = searchQuery) => {
      setLoading(true);
      try {
        const res = await adminService.getUsers(targetPage, 15, search);
        setUsers(res.users);
        setPage(res.page);
        setTotalPages(res.totalPages || 1);
      } catch (err: any) {
        showGlobalAlert('Error Loading Users', err.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchQuery],
  );

  useEffect(() => {
    fetchStats();
    fetchUsers(1, '');
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchUsers(1, text);
    }, 350);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStats(), fetchUsers(page, searchQuery)]);
    setRefreshing(false);
  };

  // Ban / Unban Actions
  const openBanModal = (user: AdminUserItem) => {
    setSelectedUserForBan(user);
    setBanReason('');
    setBanModalVisible(true);
  };

  const submitBan = async () => {
    if (!selectedUserForBan) return;
    setBanSubmitting(true);
    try {
      await adminService.banUser(selectedUserForBan.id, banReason || 'Administrative suspension');
      setBanModalVisible(false);
      await Promise.all([fetchStats(), fetchUsers(page, searchQuery)]);
      showGlobalAlert('User Suspended', `${selectedUserForBan.email} has been suspended.`);
    } catch (err: any) {
      showGlobalAlert('Ban Failed', err.message);
    } finally {
      setBanSubmitting(false);
    }
  };

  const handleUnban = async (user: AdminUserItem) => {
    try {
      await adminService.unbanUser(user.id);
      await Promise.all([fetchStats(), fetchUsers(page, searchQuery)]);
      showGlobalAlert('User Reinstated', `${user.email} is now active.`);
    } catch (err: any) {
      showGlobalAlert('Unban Failed', err.message);
    }
  };

  // Delete Actions
  const openDeleteModal = (user: AdminUserItem) => {
    setSelectedUserForDelete(user);
    setConfirmEmailInput('');
    setDeleteReason('');
    setDeleteModalVisible(true);
  };

  const submitDelete = async () => {
    if (!selectedUserForDelete) return;
    setDeleteSubmitting(true);
    try {
      await adminService.deleteUser(
        selectedUserForDelete.id,
        confirmEmailInput.trim(),
        deleteReason || 'Permanent account purge',
      );
      setDeleteModalVisible(false);
      await Promise.all([fetchStats(), fetchUsers(page, searchQuery)]);
      showGlobalAlert(
        'User Deleted',
        `${selectedUserForDelete.email} and all related records have been permanently erased.`,
      );
    } catch (err: any) {
      showGlobalAlert('Delete Failed', err.message);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const formatDate = (ts: number | null) => {
    if (!ts) return 'Unknown';
    const date = new Date(Number(ts));
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Admin Portal</Text>
            <View style={styles.badgeGold}>
              <Text style={styles.badgeGoldText}>ADMIN</Text>
            </View>
          </View>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Directory, moderation & user purge controls
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
      >
        {/* Metric Cards Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.text }]}>{stats.totalUsers}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Total Users</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#ECFDF5', borderColor: 'rgba(16, 185, 129, 0.25)' }]}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.activeUsers}</Text>
            <Text style={[styles.statLabel, { color: isDark ? '#A7F3D0' : '#065F46' }]}>Active</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2', borderColor: 'rgba(239, 68, 68, 0.25)' }]}>
            <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.bannedUsers}</Text>
            <Text style={[styles.statLabel, { color: isDark ? '#FECACA' : '#991B1B' }]}>Suspended</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.textTertiary} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search by name, email, or phone..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange('')} style={{ padding: 4 }}>
              <Feather name="x" size={14} color={colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Directory Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Registered Accounts</Text>
          <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>{users.length} shown</Text>
        </View>

        {/* Loading State */}
        {loading && !refreshing && (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#EAB308" />
            <Text style={{ marginTop: 10, fontSize: 13, color: colors.textSecondary }}>Loading users...</Text>
          </View>
        )}

        {/* Empty State */}
        {!loading && users.length === 0 && (
          <View style={styles.emptyCard}>
            <Feather name="users" size={32} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Users Found</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {searchQuery ? `No registered user matches "${searchQuery}"` : 'Database contains no user rows.'}
            </Text>
          </View>
        )}

        {/* User Card List */}
        {!loading &&
          users.map((item) => {
            const isSelf = item.id === currentUser?.id;
            const isPrivileged = item.role === 'admin' || item.role === 'superadmin';

            return (
              <View
                key={item.id}
                style={[
                  styles.userCard,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                    borderColor: item.isBanned ? 'rgba(239, 68, 68, 0.35)' : colors.border,
                  },
                ]}
              >
                {/* Header row: Avatar + Identity + Status */}
                <View style={styles.userCardHeader}>
                  <View style={[styles.avatarCircle, { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' }]}>
                    <Text style={[styles.avatarText, { color: colors.text }]}>
                      {(item.name?.[0] || item.email?.[0] || 'U').toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                        {item.name || 'Anonymous User'}
                      </Text>
                      {item.role === 'admin' && (
                        <View style={styles.badgeGold}>
                          <Text style={styles.badgeGoldText}>ADMIN</Text>
                        </View>
                      )}
                      {item.role === 'superadmin' && (
                        <View style={styles.badgePurple}>
                          <Text style={styles.badgePurpleText}>SUPERADMIN</Text>
                        </View>
                      )}
                      {isSelf && (
                        <View style={styles.badgeSelf}>
                          <Text style={styles.badgeSelfText}>YOU</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.userEmail, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.email || 'No email registered'}
                    </Text>
                  </View>

                  {/* Status Tag */}
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: item.isBanned
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'rgba(16, 185, 129, 0.15)',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: item.isBanned ? '#EF4444' : '#10B981' },
                      ]}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: item.isBanned ? '#EF4444' : '#10B981' },
                      ]}
                    >
                      {item.isBanned ? 'SUSPENDED' : 'ACTIVE'}
                    </Text>
                  </View>
                </View>

                {/* Details Row: Phone + Joined Date */}
                <View style={[styles.userMetaRow, { borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}>
                  <View style={styles.metaItem}>
                    <Feather name="phone" size={12} color={colors.textTertiary} style={{ marginRight: 4 }} />
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                      {item.phone || 'No phone'}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Feather name="calendar" size={12} color={colors.textTertiary} style={{ marginRight: 4 }} />
                    <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                      Joined {formatDate(item.createdAt)}
                    </Text>
                  </View>
                </View>

                {item.banReason && (
                  <View style={styles.banReasonBox}>
                    <Text style={styles.banReasonLabel}>Reason:</Text>
                    <Text style={styles.banReasonValue}>{item.banReason}</Text>
                  </View>
                )}

                {/* Action Buttons Row */}
                {!isSelf && (
                  <View style={styles.actionRow}>
                    {/* Ban / Unban Button */}
                    {item.isBanned ? (
                      <TouchableOpacity
                        style={[styles.btnOutline, { borderColor: '#10B981' }]}
                        onPress={() => handleUnban(item)}
                        activeOpacity={0.7}
                      >
                        <Feather name="check-circle" size={13} color="#10B981" style={{ marginRight: 5 }} />
                        <Text style={[styles.btnOutlineText, { color: '#10B981' }]}>Unban Access</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.btnOutline, { borderColor: '#EAB308' }]}
                        onPress={() => openBanModal(item)}
                        activeOpacity={0.7}
                        disabled={isPrivileged && currentUser?.role !== 'superadmin'}
                      >
                        <Feather name="slash" size={13} color="#EAB308" style={{ marginRight: 5 }} />
                        <Text style={[styles.btnOutlineText, { color: '#EAB308' }]}>Ban User</Text>
                      </TouchableOpacity>
                    )}

                    {/* Hard Delete Button */}
                    <TouchableOpacity
                      style={[styles.btnOutline, { borderColor: '#EF4444' }]}
                      onPress={() => openDeleteModal(item)}
                      activeOpacity={0.7}
                      disabled={isPrivileged && currentUser?.role !== 'superadmin'}
                    >
                      <Feather name="trash-2" size={13} color="#EF4444" style={{ marginRight: 5 }} />
                      <Text style={[styles.btnOutlineText, { color: '#EF4444' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <View style={styles.paginationRow}>
            <TouchableOpacity
              style={[styles.pageBtn, { opacity: page <= 1 ? 0.4 : 1 }]}
              onPress={() => fetchUsers(page - 1)}
              disabled={page <= 1 || loading}
            >
              <Feather name="chevron-left" size={16} color={colors.text} />
              <Text style={[styles.pageBtnText, { color: colors.text }]}>Previous</Text>
            </TouchableOpacity>
            <Text style={[styles.pageIndicator, { color: colors.textSecondary }]}>
              Page {page} of {totalPages}
            </Text>
            <TouchableOpacity
              style={[styles.pageBtn, { opacity: page >= totalPages ? 0.4 : 1 }]}
              onPress={() => fetchUsers(page + 1)}
              disabled={page >= totalPages || loading}
            >
              <Text style={[styles.pageBtnText, { color: colors.text }]}>Next</Text>
              <Feather name="chevron-right" size={16} color={colors.text} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ============================================================ */}
      {/* 1. Ban User Modal */}
      {/* ============================================================ */}
      <Modal visible={banModalVisible} transparent animationType="fade" onRequestClose={() => setBanModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setBanModalVisible(false)} />
          <View style={[styles.modalCard, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconBox, { backgroundColor: 'rgba(234, 179, 8, 0.15)' }]}>
                <Feather name="slash" size={20} color="#EAB308" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Suspend Account</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  {selectedUserForBan?.email}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setBanModalVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalBodyText, { color: colors.textSecondary }]}>
              Banning this user will immediately revoke all access. Active sessions will receive a suspension popup on their next request and be forcibly logged out.
            </Text>

            <Text style={[styles.inputLabel, { color: colors.text }]}>Reason for suspension (optional)</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.text, borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC' }]}
              placeholder="e.g. Suspicious activity or terms violation"
              placeholderTextColor={colors.textTertiary}
              value={banReason}
              onChangeText={setBanReason}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setBanModalVisible(false)}
                disabled={banSubmitting}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: '#EAB308' }]}
                onPress={submitBan}
                disabled={banSubmitting}
              >
                {banSubmitting ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.modalSubmitText}>Confirm Ban</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* 2. Hard Delete User Modal (High Security Email Match) */}
      {/* ============================================================ */}
      <Modal visible={deleteModalVisible} transparent animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDeleteModalVisible(false)} />
          <View style={[styles.modalCard, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: 'rgba(239, 68, 68, 0.35)' }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                <Feather name="alert-triangle" size={20} color="#EF4444" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.modalTitle, { color: '#EF4444' }]}>Permanent Hard Delete</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  {selectedUserForDelete?.email}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDeleteModalVisible(false)} style={styles.closeBtn}>
                <Feather name="x" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            <View style={styles.dangerNoticeBox}>
              <Text style={styles.dangerNoticeText}>
                CRITICAL WARNING: This action is permanent and completely irreversible. It will wipe all transactions, budgets, bank profiles, goals, and user account records from the database.
              </Text>
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Type <Text style={{ fontWeight: '800', color: '#EF4444' }}>{selectedUserForDelete?.email}</Text> to confirm:
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  color: colors.text,
                  borderColor: confirmEmailInput.trim().toLowerCase() === selectedUserForDelete?.email?.toLowerCase() ? '#EF4444' : colors.border,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
                },
              ]}
              placeholder={selectedUserForDelete?.email || 'email'}
              placeholderTextColor={colors.textTertiary}
              value={confirmEmailInput}
              onChangeText={setConfirmEmailInput}
              autoCapitalize="none"
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setDeleteModalVisible(false)}
                disabled={deleteSubmitting}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSubmitBtn,
                  {
                    backgroundColor: '#EF4444',
                    opacity: confirmEmailInput.trim().toLowerCase() === selectedUserForDelete?.email?.toLowerCase() ? 1 : 0.4,
                  },
                ]}
                onPress={submitDelete}
                disabled={
                  confirmEmailInput.trim().toLowerCase() !== selectedUserForDelete?.email?.toLowerCase() ||
                  deleteSubmitting
                }
              >
                {deleteSubmitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={[styles.modalSubmitText, { color: '#FFF' }]}>Permanently Purge</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  badgeGold: {
    backgroundColor: '#EAB308',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgeGoldText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#000',
  },
  badgePurple: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgePurpleText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFF',
  },
  badgeSelf: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  badgeSelfText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionCount: {
    fontSize: 12,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
  },
  emptyText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  userCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  userCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
  },
  userEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 11,
  },
  banReasonBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  banReasonLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
  },
  banReasonValue: {
    fontSize: 11,
    color: '#EF4444',
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  btnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnOutlineText: {
    fontSize: 12,
    fontWeight: '700',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingVertical: 12,
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pageBtnText: {
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 4,
  },
  pageIndicator: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  modalBodyText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  dangerNoticeBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.10)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  dangerNoticeText: {
    fontSize: 11,
    color: '#EF4444',
    lineHeight: 16,
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  modalInput: {
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13,
    marginBottom: 16,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalSubmitBtn: {
    flex: 1.4,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
});
