import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  RefreshControl,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTheme, useAuthStore, showGlobalAlert } from '../../store';
import { adminService, AdminUserItem } from '../../services/adminService';

// Global Theme Brand Tokens (Strictly Green, White, and Neutral Ink/Gray)
const BRAND_GREEN = '#2dba4e';
const BRAND_GREEN_DARK = '#1f8f3a';
const BRAND_GREEN_TINT = 'rgba(45, 186, 78, 0.12)';
const BRAND_GREEN_BORDER = 'rgba(45, 186, 78, 0.28)';

const getInitials = (name?: string | null, email?: string | null) => {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email?.trim()) {
    return email.trim().slice(0, 2).toUpperCase();
  }
  return 'U';
};

const UserAvatarItem: React.FC<{
  avatarUrl?: string | null;
  initials: string;
  isBanned: boolean;
  isDark: boolean;
}> = ({ avatarUrl, initials, isBanned, isDark }) => {
  const [loadError, setLoadError] = useState(false);
  const hasAvatar = !!avatarUrl && !loadError;

  return (
    <View style={styles.avatarWrap}>
      {hasAvatar ? (
        <Image
          source={{ uri: avatarUrl! }}
          style={styles.avatarImg}
          onError={() => setLoadError(true)}
          resizeMode="cover"
        />
      ) : (
        <Text style={styles.avatarText}>{initials}</Text>
      )}
      <View
        style={[
          styles.statusDot,
          {
            backgroundColor: isBanned ? '#94a3b8' : BRAND_GREEN,
            borderColor: isDark ? '#161B22' : '#FFFFFF',
          },
        ]}
      />
    </View>
  );
};

export const AdminUsersTab: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const currentUser = useAuthStore((s) => s.user);

  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filter States
  const [activeTabFilter, setActiveTabFilter] = useState<'all' | 'active' | 'suspended' | 'admins'>('all');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterRole, setFilterRole] = useState<'all' | 'user' | 'admin'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'email'>('newest');

  // Ban Modal
  const [banModalVisible, setBanModalVisible] = useState(false);
  const [selectedUserForBan, setSelectedUserForBan] = useState<AdminUserItem | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banSubmitting, setBanSubmitting] = useState(false);

  // Delete Modal
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedUserForDelete, setSelectedUserForDelete] = useState<AdminUserItem | null>(null);
  const [confirmEmailInput, setConfirmEmailInput] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const searchTimer = useRef<any>(null);

  const fetchUsers = useCallback(
    async (targetPage = 1, search = searchQuery) => {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await adminService.getUsers(targetPage, 25, search);
        setUsers(res.users || []);
        setPage(res.page || 1);
        setTotalPages(res.totalPages || 1);
        setTotalUsersCount(res.total || 0);
        setFetchError(null);
      } catch (err: any) {
        setFetchError(err.message || 'Failed to connect to backend server');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchQuery],
  );

  useEffect(() => {
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
    await fetchUsers(page, searchQuery);
    setRefreshing(false);
  };

  // Quick Counts
  const counts = useMemo(() => {
    const total = totalUsersCount || users.length;
    const active = users.filter((u) => !u.isBanned).length;
    const suspended = users.filter((u) => u.isBanned).length;
    const admins = users.filter((u) => u.role === 'admin' || u.role === 'superadmin').length;
    return { total, active, suspended, admins };
  }, [users, totalUsersCount]);

  const hasAdvancedFilters = useMemo(() => {
    return filterRole !== 'all' || filterStatus !== 'all' || sortBy !== 'newest';
  }, [filterRole, filterStatus, sortBy]);

  const resetFilters = () => {
    setFilterRole('all');
    setFilterStatus('all');
    setSortBy('newest');
    setActiveTabFilter('all');
  };

  // Filtered & Sorted List
  const displayedUsers = useMemo(() => {
    let result = [...users];

    // Quick Tab filter
    if (activeTabFilter === 'active') {
      result = result.filter((u) => !u.isBanned);
    } else if (activeTabFilter === 'suspended') {
      result = result.filter((u) => u.isBanned);
    } else if (activeTabFilter === 'admins') {
      result = result.filter((u) => u.role === 'admin' || u.role === 'superadmin');
    }

    // Modal role filter
    if (filterRole === 'admin') {
      result = result.filter((u) => u.role === 'admin' || u.role === 'superadmin');
    } else if (filterRole === 'user') {
      result = result.filter((u) => u.role === 'user');
    }

    // Modal status filter
    if (filterStatus === 'active') {
      result = result.filter((u) => !u.isBanned);
    } else if (filterStatus === 'suspended') {
      result = result.filter((u) => u.isBanned);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'newest') {
        return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
      }
      if (sortBy === 'oldest') {
        return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
      }
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'email') {
        return (a.email || '').localeCompare(b.email || '');
      }
      return 0;
    });

    return result;
  }, [users, activeTabFilter, filterRole, filterStatus, sortBy]);

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
      await fetchUsers(page, searchQuery);
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
      await fetchUsers(page, searchQuery);
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
      await fetchUsers(page, searchQuery);
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
            <Text style={[styles.headerTitle, { color: colors.text }]}>Users Directory</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{totalUsersCount} Total</Text>
            </View>
          </View>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Directory inspection, suspensions & account purges
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleRefresh}
          style={[styles.reloadBtn, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff' }]}
          disabled={loading || refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={BRAND_GREEN} />
          ) : (
            <Feather name="refresh-cw" size={13} color={colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Search Bar + Filter Trigger */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 }}>
        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchContainer,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
                borderColor: colors.border,
              },
            ]}
          >
            <Feather name="search" size={15} color={colors.textTertiary} style={{ marginRight: 8 }} />
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

          {/* Filter Icon Button */}
          <TouchableOpacity
            style={[
              styles.filterBtn,
              {
                backgroundColor: hasAdvancedFilters ? BRAND_GREEN_TINT : isDark ? 'rgba(255,255,255,0.05)' : '#ffffff',
                borderColor: hasAdvancedFilters ? BRAND_GREEN : colors.border,
              },
            ]}
            onPress={() => setFilterModalVisible(true)}
            activeOpacity={0.7}
          >
            <Feather
              name="filter"
              size={15}
              color={hasAdvancedFilters ? BRAND_GREEN : colors.textSecondary}
            />
            {hasAdvancedFilters && <View style={styles.filterActiveDot} />}
          </TouchableOpacity>
        </View>

        {/* Filter Pills Row (Green & White Theme) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterPillsContainer}
        >
          <TouchableOpacity
            style={[
              styles.filterPill,
              activeTabFilter === 'all'
                ? styles.filterPillActive
                : { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff', borderColor: colors.border },
            ]}
            onPress={() => setActiveTabFilter('all')}
          >
            <Text
              style={[
                styles.filterPillText,
                activeTabFilter === 'all'
                  ? styles.filterPillTextActive
                  : { color: colors.textSecondary },
              ]}
            >
              All ({counts.total})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              activeTabFilter === 'active'
                ? styles.filterPillActive
                : { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff', borderColor: colors.border },
            ]}
            onPress={() => setActiveTabFilter('active')}
          >
            <View
              style={[
                styles.pillDot,
                { backgroundColor: activeTabFilter === 'active' ? '#ffffff' : BRAND_GREEN },
              ]}
            />
            <Text
              style={[
                styles.filterPillText,
                activeTabFilter === 'active'
                  ? styles.filterPillTextActive
                  : { color: colors.textSecondary },
              ]}
            >
              Active ({counts.active})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              activeTabFilter === 'suspended'
                ? styles.filterPillActive
                : { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff', borderColor: colors.border },
            ]}
            onPress={() => setActiveTabFilter('suspended')}
          >
            <Text
              style={[
                styles.filterPillText,
                activeTabFilter === 'suspended'
                  ? styles.filterPillTextActive
                  : { color: colors.textSecondary },
              ]}
            >
              Suspended ({counts.suspended})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterPill,
              activeTabFilter === 'admins'
                ? styles.filterPillActive
                : { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff', borderColor: colors.border },
            ]}
            onPress={() => setActiveTabFilter('admins')}
          >
            <Text
              style={[
                styles.filterPillText,
                activeTabFilter === 'admins'
                  ? styles.filterPillTextActive
                  : { color: colors.textSecondary },
              ]}
            >
              Admins ({counts.admins})
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 90 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={BRAND_GREEN} />
        }
      >
        {/* Loading State */}
        {loading && !refreshing && (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={BRAND_GREEN} />
            <Text style={{ marginTop: 10, fontSize: 13, color: colors.textSecondary }}>
              Loading user accounts...
            </Text>
          </View>
        )}

        {/* Error State */}
        {fetchError && !loading && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 14,
              marginBottom: 12,
            }}
          >
            <Feather name="alert-circle" size={18} color={BRAND_GREEN} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Server Connection Offline</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                {fetchError.includes('Failed to fetch')
                  ? 'Backend server was temporarily unreachable. Tap Retry to reconnect.'
                  : fetchError}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => fetchUsers(page, searchQuery)}
              style={{ backgroundColor: BRAND_GREEN, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Empty State */}
        {!loading && !fetchError && displayedUsers.length === 0 && (
          <View style={styles.emptyCard}>
            <Feather name="users" size={32} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No Users Found</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {searchQuery
                ? `No accounts matching "${searchQuery}"`
                : 'No registered accounts match the selected filter.'}
            </Text>
            {(activeTabFilter !== 'all' || hasAdvancedFilters) && (
              <TouchableOpacity
                onPress={resetFilters}
                style={[styles.resetFilterBtn, { borderColor: BRAND_GREEN, backgroundColor: BRAND_GREEN_TINT }]}
              >
                <Text style={[styles.resetFilterText, { color: BRAND_GREEN }]}>Clear All Filters</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Standardized & Space-Efficient Users List (Green & White Theme) */}
        {!loading &&
          displayedUsers.map((u) => {
            const isSelf = currentUser?.id === u.id;
            const isSuperOrAdmin = u.role === 'admin' || u.role === 'superadmin';
            const initials = getInitials(u.name, u.email);

            return (
              <View
                key={u.id}
                style={[
                  styles.userCard,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.card,
                    borderColor: colors.border,
                    borderLeftColor: isSuperOrAdmin || isSelf ? BRAND_GREEN : colors.border,
                    borderLeftWidth: isSuperOrAdmin || isSelf ? 3 : 1,
                  },
                ]}
              >
                {/* Header Row: Avatar + Details */}
                <View style={styles.cardMainRow}>
                  {/* User Logo or Green Initials Avatar */}
                  <UserAvatarItem
                    avatarUrl={u.avatarUrl}
                    initials={initials}
                    isBanned={u.isBanned}
                    isDark={isDark}
                  />

                  {/* Middle Content */}
                  <View style={styles.userInfoWrap}>
                    {/* Line 1: Name + Badges */}
                    <View style={styles.userNameRow}>
                      <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                        {u.name || 'Unnamed Account'}
                      </Text>

                      {isSelf && (
                        <View style={styles.selfBadge}>
                          <Text style={styles.selfBadgeText}>YOU</Text>
                        </View>
                      )}

                      {isSuperOrAdmin && (
                        <View style={styles.adminBadge}>
                          <Text style={styles.adminBadgeText}>
                            {u.role.toUpperCase()}
                          </Text>
                        </View>
                      )}

                      {!isSuperOrAdmin && (
                        <View style={[styles.userBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }]}>
                          <Text style={[styles.userBadgeText, { color: colors.textSecondary }]}>
                            USER
                          </Text>
                        </View>
                      )}

                      {u.isBanned && (
                        <View style={styles.bannedBadge}>
                          <Text style={styles.bannedBadgeText}>SUSPENDED</Text>
                        </View>
                      )}
                    </View>

                    {/* Line 2: Email */}
                    <Text style={[styles.userEmail, { color: colors.textSecondary }]} numberOfLines={1}>
                      {u.email || 'No email provided'}
                    </Text>

                    {/* Line 3: Compact Metadata Row */}
                    <View style={styles.compactMetaRow}>
                      {u.phone ? (
                        <>
                          <View style={styles.metaInlineItem}>
                            <Feather name="phone" size={10} color={colors.textTertiary} />
                            <Text style={[styles.metaInlineText, { color: colors.textTertiary }]}>{u.phone}</Text>
                          </View>
                          <Text style={[styles.metaDot, { color: colors.textTertiary }]}>•</Text>
                        </>
                      ) : null}

                      <View style={styles.metaInlineItem}>
                        <Feather name="calendar" size={10} color={colors.textTertiary} />
                        <Text style={[styles.metaInlineText, { color: colors.textTertiary }]}>
                          {formatDate(u.createdAt)}
                        </Text>
                      </View>

                      <Text style={[styles.metaDot, { color: colors.textTertiary }]}>•</Text>

                      <View style={styles.metaInlineItem}>
                        <Feather name="shield" size={10} color={colors.textTertiary} />
                        <Text style={[styles.metaInlineText, { color: colors.textTertiary }]}>
                          {u.authProvider || 'email'}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Suspension notice strip if banned */}
                {u.isBanned && (
                  <View style={[styles.banNoticeBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', borderColor: colors.border }]}>
                    <Feather name="info" size={11} color={colors.textSecondary} style={{ marginTop: 1 }} />
                    <Text style={[styles.banNoticeReason, { color: colors.textSecondary }]} numberOfLines={1}>
                      Suspended: {u.banReason || 'Administrative suspension'}
                      {u.bannedAt ? ` (${formatDate(u.bannedAt)})` : ''}
                    </Text>
                  </View>
                )}

                {/* Standardized Action Buttons (Only if not self) */}
                {!isSelf && (
                  <View style={styles.cardActionsRow}>
                    {u.isBanned ? (
                      <TouchableOpacity
                        style={[styles.compactBtn, styles.compactBtnReinstate]}
                        onPress={() => handleUnban(u)}
                        activeOpacity={0.7}
                      >
                        <Feather name="check" size={11} color={BRAND_GREEN} />
                        <Text style={styles.compactBtnReinstateText}>Reinstate</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.compactBtn, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff' }]}
                        onPress={() => openBanModal(u)}
                        activeOpacity={0.7}
                      >
                        <Feather name="slash" size={10} color={colors.textSecondary} />
                        <Text style={[styles.compactBtnNeutralText, { color: colors.textSecondary }]}>Suspend</Text>
                      </TouchableOpacity>
                    )}

                    {(!isSuperOrAdmin || currentUser?.role === 'superadmin') && (
                      <TouchableOpacity
                        style={[styles.compactBtn, { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff' }]}
                        onPress={() => openDeleteModal(u)}
                        activeOpacity={0.7}
                      >
                        <Feather name="trash-2" size={10} color={colors.textSecondary} />
                        <Text style={[styles.compactBtnNeutralText, { color: colors.textSecondary }]}>Purge Account</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <View style={styles.paginationRow}>
            <TouchableOpacity
              disabled={page <= 1}
              onPress={() => fetchUsers(page - 1)}
              style={[
                styles.pageBtn,
                { opacity: page <= 1 ? 0.4 : 1, borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff' },
              ]}
            >
              <Feather name="chevron-left" size={14} color={colors.text} />
              <Text style={[styles.pageBtnText, { color: colors.text }]}>Prev</Text>
            </TouchableOpacity>
            <Text style={[styles.pageIndicator, { color: colors.textSecondary }]}>
              Page {page} of {totalPages}
            </Text>
            <TouchableOpacity
              disabled={page >= totalPages}
              onPress={() => fetchUsers(page + 1)}
              style={[
                styles.pageBtn,
                { opacity: page >= totalPages ? 0.4 : 1, borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff' },
              ]}
            >
              <Text style={[styles.pageBtnText, { color: colors.text }]}>Next</Text>
              <Feather name="chevron-right" size={14} color={colors.text} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Filter & Sort Modal (Green & White Theme) */}
      <Modal visible={filterModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterModalVisible(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: isDark ? '#161B22' : '#FFFFFF', borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="filter" size={16} color={BRAND_GREEN} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Filter & Sort Users</Text>
              </View>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)} style={{ padding: 4 }}>
                <Feather name="x" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* Role Filter */}
            <Text style={[styles.filterSectionTitle, { color: colors.textSecondary }]}>ROLE</Text>
            <View style={styles.modalOptionsRow}>
              {(['all', 'user', 'admin'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.modalOptionPill,
                    filterRole === r
                      ? styles.modalOptionPillActive
                      : { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff' },
                  ]}
                  onPress={() => setFilterRole(r)}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      filterRole === r ? styles.modalOptionTextActive : { color: colors.textSecondary },
                    ]}
                  >
                    {r === 'all' ? 'All Roles' : r === 'user' ? 'Users Only' : 'Admins Only'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Status Filter */}
            <Text style={[styles.filterSectionTitle, { color: colors.textSecondary, marginTop: 14 }]}>STATUS</Text>
            <View style={styles.modalOptionsRow}>
              {(['all', 'active', 'suspended'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.modalOptionPill,
                    filterStatus === s
                      ? styles.modalOptionPillActive
                      : { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff' },
                  ]}
                  onPress={() => setFilterStatus(s)}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      filterStatus === s ? styles.modalOptionTextActive : { color: colors.textSecondary },
                    ]}
                  >
                    {s === 'all' ? 'All Status' : s === 'active' ? 'Active' : 'Suspended'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Sort Filter */}
            <Text style={[styles.filterSectionTitle, { color: colors.textSecondary, marginTop: 14 }]}>SORT ORDER</Text>
            <View style={styles.modalOptionsGrid}>
              {[
                { id: 'newest', label: 'Newest First' },
                { id: 'oldest', label: 'Oldest First' },
                { id: 'name', label: 'Name (A-Z)' },
                { id: 'email', label: 'Email (A-Z)' },
              ].map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.modalOptionPill,
                    sortBy === s.id
                      ? styles.modalOptionPillActive
                      : { borderColor: colors.border, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#ffffff' },
                  ]}
                  onPress={() => setSortBy(s.id as any)}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      sortBy === s.id ? styles.modalOptionTextActive : { color: colors.textSecondary },
                    ]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Bottom Actions */}
            <View style={[styles.modalBtnRow, { marginTop: 18 }]}>
              <TouchableOpacity
                style={[styles.modalBtnCancel, { borderColor: colors.border }]}
                onPress={resetFilters}
              >
                <Text style={[styles.modalBtnCancelText, { color: colors.textSecondary }]}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, { backgroundColor: BRAND_GREEN }]}
                onPress={() => setFilterModalVisible(false)}
              >
                <Text style={[styles.modalBtnConfirmText, { color: '#FFFFFF', fontWeight: '800' }]}>
                  Apply Filters
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Ban / Suspend Modal */}
      <Modal visible={banModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setBanModalVisible(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: isDark ? '#161B22' : '#FFFFFF', borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={[styles.modalIconWrap, { backgroundColor: BRAND_GREEN_TINT }]}>
                <Feather name="slash" size={18} color={BRAND_GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Suspend Account</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  {selectedUserForBan?.email}
                </Text>
              </View>
            </View>

            <Text style={[styles.modalBodyText, { color: colors.textSecondary }]}>
              Suspended users will immediately lose access and have their active refresh tokens revoked.
            </Text>

            <Text style={[styles.inputLabel, { color: colors.text }]}>Suspension Reason</Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  color: colors.text,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC',
                  borderColor: colors.border,
                },
              ]}
              placeholder="e.g. Terms violation or suspicious activity..."
              placeholderTextColor={colors.textTertiary}
              value={banReason}
              onChangeText={setBanReason}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setBanModalVisible(false)}
                disabled={banSubmitting}
              >
                <Text style={[styles.modalBtnCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, { backgroundColor: BRAND_GREEN }]}
                onPress={submitBan}
                disabled={banSubmitting}
              >
                {banSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalBtnConfirmText}>Suspend User</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Delete / Purge Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setDeleteModalVisible(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: isDark ? '#161B22' : '#FFFFFF', borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={[styles.modalIconWrap, { backgroundColor: BRAND_GREEN_TINT }]}>
                <Feather name="alert-circle" size={18} color={BRAND_GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Permanent Account Purge</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                  Target: {selectedUserForDelete?.email}
                </Text>
              </View>
            </View>

            <View style={[styles.warningBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', borderColor: colors.border }]}>
              <Text style={[styles.warningText, { color: colors.textSecondary }]}>
                Notice: This permanently removes this user and cascades across ALL database tables. This action
                cannot be undone.
              </Text>
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Type <Text style={{ fontWeight: '800', color: colors.text }}>{selectedUserForDelete?.email}</Text> to confirm:
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  color: colors.text,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC',
                  borderColor:
                    confirmEmailInput.trim().toLowerCase() === selectedUserForDelete?.email?.trim().toLowerCase()
                      ? BRAND_GREEN
                      : colors.border,
                },
              ]}
              placeholder="Confirm exact email address"
              placeholderTextColor={colors.textTertiary}
              value={confirmEmailInput}
              onChangeText={setConfirmEmailInput}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[styles.inputLabel, { color: colors.text, marginTop: 8 }]}>Audit Reason</Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  color: colors.text,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC',
                  borderColor: colors.border,
                },
              ]}
              placeholder="Reason for account deletion..."
              placeholderTextColor={colors.textTertiary}
              value={deleteReason}
              onChangeText={setDeleteReason}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtnCancel, { borderColor: colors.border }]}
                onPress={() => setDeleteModalVisible(false)}
                disabled={deleteSubmitting}
              >
                <Text style={[styles.modalBtnCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtnConfirm,
                  {
                    backgroundColor: BRAND_GREEN,
                    opacity:
                      confirmEmailInput.trim().toLowerCase() === selectedUserForDelete?.email?.trim().toLowerCase()
                        ? 1
                        : 0.4,
                  },
                ]}
                onPress={submitDelete}
                disabled={
                  deleteSubmitting ||
                  confirmEmailInput.trim().toLowerCase() !== selectedUserForDelete?.email?.trim().toLowerCase()
                }
              >
                {deleteSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalBtnConfirmText}>Purge Account</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
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
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: BRAND_GREEN_TINT,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countBadgeText: {
    color: BRAND_GREEN,
    fontSize: 10.5,
    fontWeight: '700',
  },
  reloadBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    paddingVertical: 0,
  },
  filterBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterActiveDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BRAND_GREEN,
  },
  filterPillsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    paddingBottom: 2,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillActive: {
    backgroundColor: BRAND_GREEN,
    borderColor: BRAND_GREEN,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emptyCard: {
    paddingVertical: 45,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  resetFilterBtn: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  resetFilterText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  userCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 8,
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND_GREEN_TINT,
    borderWidth: 1,
    borderColor: BRAND_GREEN_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarImg: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  avatarText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: BRAND_GREEN,
  },
  statusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
  },
  userInfoWrap: {
    flex: 1,
    marginLeft: 10,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexWrap: 'wrap',
  },
  userName: {
    fontSize: 13,
    fontWeight: '700',
  },
  selfBadge: {
    backgroundColor: BRAND_GREEN_TINT,
    borderWidth: 1,
    borderColor: BRAND_GREEN_BORDER,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  selfBadgeText: {
    color: BRAND_GREEN,
    fontSize: 8.5,
    fontWeight: '800',
  },
  adminBadge: {
    backgroundColor: BRAND_GREEN_TINT,
    borderWidth: 1,
    borderColor: BRAND_GREEN_BORDER,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  adminBadgeText: {
    color: BRAND_GREEN,
    fontSize: 8.5,
    fontWeight: '800',
  },
  userBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  userBadgeText: {
    fontSize: 8.5,
    fontWeight: '700',
  },
  bannedBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  bannedBadgeText: {
    color: '#64748b',
    fontSize: 8.5,
    fontWeight: '800',
  },
  userEmail: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 1.5,
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 3,
  },
  metaInlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaInlineText: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  metaDot: {
    fontSize: 9,
    opacity: 0.5,
  },
  banNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 3.5,
    paddingHorizontal: 7,
    marginTop: 6,
    gap: 5,
  },
  banNoticeReason: {
    fontSize: 10.5,
    fontWeight: '500',
    flex: 1,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 7,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  compactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  compactBtnNeutralText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  compactBtnReinstate: {
    backgroundColor: BRAND_GREEN_TINT,
    borderWidth: 1,
    borderColor: BRAND_GREEN_BORDER,
  },
  compactBtnReinstateText: {
    color: BRAND_GREEN,
    fontSize: 10.5,
    fontWeight: '700',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  pageBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  pageIndicator: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },
  modalBodyText: {
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 17,
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 5,
  },
  modalInput: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 9,
    fontSize: 12.5,
    marginBottom: 10,
  },
  warningBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 9,
    marginBottom: 10,
  },
  warningText: {
    fontSize: 10.5,
    fontWeight: '500',
    lineHeight: 15,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancelText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalBtnConfirm: {
    flex: 1.2,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnConfirmText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 7,
  },
  modalOptionsRow: {
    flexDirection: 'row',
    gap: 7,
  },
  modalOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  modalOptionPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalOptionPillActive: {
    backgroundColor: BRAND_GREEN,
    borderColor: BRAND_GREEN,
  },
  modalOptionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  modalOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
