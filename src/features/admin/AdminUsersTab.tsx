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
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuthStore, showGlobalAlert } from '../../store';
import { adminService, AdminUserItem } from '../../services/adminService';
import {
  useAdminTheme,
  ff,
  AdminHeader,
  IconTile,
  Pill,
  Segmented,
  SectionLabel,
  AdminPalette,
  AdminFont,
  FOREST,
  LIME,
  CORAL,
} from './adminTheme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type QuickFilter = 'all' | 'active' | 'suspended' | 'admins';
type SortKey = 'newest' | 'oldest' | 'name' | 'email';

const getInitials = (name?: string | null, email?: string | null) => {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email?.trim()) return email.trim().slice(0, 2).toUpperCase();
  return 'U';
};

// Avatar palette borrowed from the home dashboard banners (lilac, blue, amber, coral, mint, lime).
const AVATAR_TINTS = [
  { bg: '#C9B8FF', fg: '#1C0F4A' },
  { bg: '#DCEBFF', fg: '#1450A3' },
  { bg: '#FFD27A', fg: '#2B1700' },
  { bg: '#FFB29E', fg: '#3A0D00' },
  { bg: '#CFE9D9', fg: '#0B3D2C' },
  { bg: '#B8F36B', fg: '#0B3D2C' },
];

const avatarTint = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(h) % AVATAR_TINTS.length];
};

const formatDate = (ts: number | null) => {
  if (!ts) return 'Unknown';
  return new Date(Number(ts)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const providerLabel = (p?: string | null) => {
  const v = (p || 'email').toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
};

const UserAvatar: React.FC<{ user: AdminUserItem; ring: string; font: AdminFont }> = ({ user, ring, font }) => {
  const [loadError, setLoadError] = useState(false);
  const tint = user.role === 'admin' || user.role === 'superadmin' ? { bg: LIME, fg: FOREST } : avatarTint(user.id);
  const hasAvatar = !!user.avatarUrl && !loadError;
  return (
    <View style={[styles.avatar, { backgroundColor: tint.bg }]}>
      {hasAvatar ? (
        <Image source={{ uri: user.avatarUrl! }} style={styles.avatarImg} onError={() => setLoadError(true)} />
      ) : (
        <Text style={[{ fontSize: 17, color: tint.fg }, ff(font.displayBold, '700')]}>
          {getInitials(user.name, user.email)}
        </Text>
      )}
      <View
        style={[
          styles.statusDot,
          { backgroundColor: user.isBanned ? '#94A3B8' : '#16A34A', borderColor: ring },
        ]}
      />
    </View>
  );
};

const OptionChips = <T extends string>({
  options,
  value,
  onChange,
  p,
  font,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  p: AdminPalette;
  font: AdminFont;
}) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
    {options.map((o) => {
      const on = o.id === value;
      return (
        <TouchableOpacity
          key={o.id}
          onPress={() => onChange(o.id)}
          activeOpacity={0.8}
          accessibilityRole="radio"
          accessibilityState={{ selected: on }}
          style={[
            styles.chip,
            { backgroundColor: on ? p.segActive : p.card, borderColor: on ? p.segActive : p.line },
          ]}
        >
          <Text style={[{ fontSize: 13, color: on ? p.segActiveText : p.sub }, ff(font.bodySemi, '600')]}>{o.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

export const AdminUsersTab: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { p, font } = useAdminTheme();
  const currentUser = useAuthStore((s) => s.user);

  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [activeTabFilter, setActiveTabFilter] = useState<QuickFilter>('all');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterRole, setFilterRole] = useState<'all' | 'user' | 'admin'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'suspended'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('newest');

  // Suspend
  const [banModalVisible, setBanModalVisible] = useState(false);
  const [selectedUserForBan, setSelectedUserForBan] = useState<AdminUserItem | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banSubmitting, setBanSubmitting] = useState(false);

  // Purge
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
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchUsers(1, text), 350);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUsers(page, searchQuery);
  };

  const counts = useMemo(() => {
    const total = totalUsersCount || users.length;
    const active = users.filter((u) => !u.isBanned).length;
    const suspended = users.filter((u) => u.isBanned).length;
    const admins = users.filter((u) => u.role === 'admin' || u.role === 'superadmin').length;
    return { total, active, suspended, admins };
  }, [users, totalUsersCount]);

  const hasAdvancedFilters = filterRole !== 'all' || filterStatus !== 'all' || sortBy !== 'newest';

  const resetFilters = () => {
    setFilterRole('all');
    setFilterStatus('all');
    setSortBy('newest');
    setActiveTabFilter('all');
  };

  const displayedUsers = useMemo(() => {
    let result = [...users];
    if (activeTabFilter === 'active') result = result.filter((u) => !u.isBanned);
    else if (activeTabFilter === 'suspended') result = result.filter((u) => u.isBanned);
    else if (activeTabFilter === 'admins') result = result.filter((u) => u.role === 'admin' || u.role === 'superadmin');

    if (filterRole === 'admin') result = result.filter((u) => u.role === 'admin' || u.role === 'superadmin');
    else if (filterRole === 'user') result = result.filter((u) => u.role === 'user');

    if (filterStatus === 'active') result = result.filter((u) => !u.isBanned);
    else if (filterStatus === 'suspended') result = result.filter((u) => u.isBanned);

    result.sort((a, b) => {
      if (sortBy === 'newest') return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
      if (sortBy === 'oldest') return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      return (a.email || '').localeCompare(b.email || '');
    });
    return result;
  }, [users, activeTabFilter, filterRole, filterStatus, sortBy]);

  const toggleExpanded = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((cur) => (cur === id ? null : id));
  };

  // Suspend / reinstate
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

  // Purge
  const openDeleteModal = (user: AdminUserItem) => {
    setSelectedUserForDelete(user);
    setConfirmEmailInput('');
    setDeleteReason('');
    setDeleteModalVisible(true);
  };

  const emailMatches =
    !!selectedUserForDelete?.email &&
    confirmEmailInput.trim().toLowerCase() === selectedUserForDelete.email.trim().toLowerCase();

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
      setExpandedId(null);
      await fetchUsers(page, searchQuery);
      showGlobalAlert('User Deleted', `${selectedUserForDelete.email} and all related records have been permanently erased.`);
    } catch (err: any) {
      showGlobalAlert('Delete Failed', err.message);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const inputStyle = [styles.input, { color: p.text, backgroundColor: p.bg, borderColor: p.line }, ff(font.body, '500')];

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      <AdminHeader
        title="Users"
        subtitle="Search, suspend or purge accounts"
        badge={<Pill tint={p.tint.green} label={`${totalUsersCount} total`} font={font} />}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {/* Search + filters */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={[styles.search, { backgroundColor: p.card, borderColor: p.line }]}>
            <Feather name="search" size={18} color={p.muted} />
            <TextInput
              style={[styles.searchInput, { color: p.text }, ff(font.body, '500')]}
              placeholder="Name, email or phone"
              placeholderTextColor={p.muted}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search users"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => handleSearchChange('')} hitSlop={10} accessibilityLabel="Clear search">
                <Feather name="x-circle" size={16} color={p.muted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            onPress={() => setFilterModalVisible(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Filter and sort"
            style={[styles.filterBtn, { backgroundColor: FOREST }]}
          >
            <Feather name="sliders" size={18} color={LIME} />
            {hasAdvancedFilters && <View style={[styles.filterDot, { borderColor: FOREST }]} />}
          </TouchableOpacity>
        </View>

        <Segmented<QuickFilter>
          style={{ marginTop: 14 }}
          value={activeTabFilter}
          onChange={(v) => {
            setActiveTabFilter(v);
            setExpandedId(null);
          }}
          options={[
            { id: 'all', label: 'All', count: counts.total },
            { id: 'active', label: 'Active', count: counts.active },
            { id: 'suspended', label: 'Suspended', count: counts.suspended },
            { id: 'admins', label: 'Admins', count: counts.admins },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={p.segActive} />}
      >
        {loading && !refreshing && (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={p.segActive} />
            <Text style={[{ marginTop: 10, fontSize: 13, color: p.sub }, ff(font.body, '500')]}>Loading accounts…</Text>
          </View>
        )}

        {fetchError && !loading && (
          <View style={[styles.errorCard, { backgroundColor: p.card, borderColor: p.line }]}>
            <IconTile tint={p.tint.coral} size={40}>
              <Feather name="wifi-off" size={18} color={p.tint.coral.fg} />
            </IconTile>
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 14, color: p.text }, ff(font.bodyBold, '700')]}>Can't reach the server</Text>
              <Text style={[{ fontSize: 12, color: p.sub, marginTop: 2 }, ff(font.body, '500')]} numberOfLines={2}>
                {fetchError.includes('Failed to fetch') ? 'The backend is temporarily unreachable.' : fetchError}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => fetchUsers(page, searchQuery)}
              style={[styles.smallBtn, { backgroundColor: p.segActive }]}
            >
              <Text style={[{ fontSize: 13, color: p.segActiveText }, ff(font.bodyBold, '700')]}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !fetchError && displayedUsers.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 48, gap: 8 }}>
            <IconTile tint={p.tint.green} size={56} radius={20}>
              <Feather name="users" size={24} color={p.tint.green.fg} />
            </IconTile>
            <Text style={[{ fontSize: 17, color: p.text, marginTop: 6 }, ff(font.displayBold, '700')]}>No users found</Text>
            <Text style={[{ fontSize: 13, color: p.sub, textAlign: 'center' }, ff(font.body, '500')]}>
              {searchQuery ? `Nothing matches "${searchQuery}"` : 'No accounts match this filter.'}
            </Text>
            {(activeTabFilter !== 'all' || hasAdvancedFilters) && (
              <TouchableOpacity onPress={resetFilters} style={[styles.ghostBtn, { borderColor: p.line, backgroundColor: p.card }]}>
                <Text style={[{ fontSize: 13, color: p.text }, ff(font.bodySemi, '600')]}>Clear filters</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {!loading && displayedUsers.length > 0 && (
          <>
            <SectionLabel
              right={<Text style={[{ fontSize: 12, color: p.muted }, ff(font.body, '500')]}>Tap a user for actions</Text>}
            >
              {sortBy === 'newest' ? 'Newest first' : sortBy === 'oldest' ? 'Oldest first' : sortBy === 'name' ? 'By name' : 'By email'}
            </SectionLabel>

            <View style={[styles.listCard, { backgroundColor: p.card, borderColor: p.line }]}>
              {displayedUsers.map((u, i) => {
                const isSelf = currentUser?.id === u.id;
                const isAdmin = u.role === 'admin' || u.role === 'superadmin';
                const canPurge = !isSelf && (!isAdmin || currentUser?.role === 'superadmin');
                const canAct = !isSelf;
                const open = expandedId === u.id;
                return (
                  <View
                    key={u.id}
                    style={{ borderBottomWidth: i < displayedUsers.length - 1 ? 1 : 0, borderBottomColor: p.divider }}
                  >
                    <TouchableOpacity
                      activeOpacity={0.7}
                      disabled={!canAct}
                      onPress={() => toggleExpanded(u.id)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      style={styles.userRow}
                    >
                      <UserAvatar user={u} ring={p.card} font={font} />
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={[{ fontSize: 15, color: p.text, flexShrink: 1 }, ff(font.bodySemi, '600')]} numberOfLines={1}>
                            {u.name || 'Unnamed account'}
                          </Text>
                          {isSelf && <Pill tint={p.tint.green} label="YOU" font={font} small />}
                          {isAdmin && <Pill tint={p.tint.lilac} label={u.role.toUpperCase()} font={font} small />}
                          {u.isBanned && <Pill tint={p.tint.coral} label="SUSPENDED" font={font} small />}
                        </View>
                        <Text style={[{ fontSize: 13, color: p.sub }, ff(font.body, '500')]} numberOfLines={1}>
                          {u.email || 'No email provided'}
                        </Text>
                        <Text style={[{ fontSize: 12, color: p.muted }, ff(font.body, '500')]} numberOfLines={1}>
                          {providerLabel(u.authProvider)} · Joined {formatDate(u.createdAt)}
                          {u.phone ? ` · ${u.phone}` : ''}
                        </Text>
                      </View>
                      {canAct && (
                        <View style={[styles.chevron, { backgroundColor: p.soft, transform: [{ rotate: open ? '180deg' : '0deg' }] }]}>
                          <Feather name="chevron-down" size={16} color={p.sub} />
                        </View>
                      )}
                    </TouchableOpacity>

                    {u.isBanned && (
                      <View style={[styles.banNote, { backgroundColor: p.tint.coral.bg }]}>
                        <Feather name="info" size={12} color={p.tint.coral.fg} />
                        <Text style={[{ flex: 1, fontSize: 12, color: p.tint.coral.fg }, ff(font.body, '500')]} numberOfLines={2}>
                          {u.banReason || 'Administrative suspension'}
                          {u.bannedAt ? ` · ${formatDate(u.bannedAt)}` : ''}
                        </Text>
                      </View>
                    )}

                    {open && canAct && (
                      <View style={styles.actionRow}>
                        {u.isBanned ? (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: p.tint.green.bg }]}
                            onPress={() => handleUnban(u)}
                            activeOpacity={0.8}
                          >
                            <Feather name="check-circle" size={15} color={p.tint.green.fg} />
                            <Text style={[{ fontSize: 13, color: p.tint.green.fg }, ff(font.bodyBold, '700')]}>Reinstate</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: p.tint.amber.bg }]}
                            onPress={() => openBanModal(u)}
                            activeOpacity={0.8}
                          >
                            <Feather name="slash" size={15} color={p.tint.amber.fg} />
                            <Text style={[{ fontSize: 13, color: p.tint.amber.fg }, ff(font.bodyBold, '700')]}>Suspend</Text>
                          </TouchableOpacity>
                        )}
                        {canPurge && (
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: p.tint.coral.bg }]}
                            onPress={() => openDeleteModal(u)}
                            activeOpacity={0.8}
                          >
                            <Feather name="trash-2" size={15} color={p.tint.coral.fg} />
                            <Text style={[{ fontSize: 13, color: p.tint.coral.fg }, ff(font.bodyBold, '700')]}>Purge account</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {totalPages > 1 && (
          <View style={styles.pagination}>
            <TouchableOpacity
              disabled={page <= 1}
              onPress={() => fetchUsers(page - 1)}
              style={[styles.pageBtn, { opacity: page <= 1 ? 0.4 : 1, borderColor: p.line, backgroundColor: p.card }]}
              accessibilityLabel="Previous page"
            >
              <Feather name="chevron-left" size={18} color={p.text} />
            </TouchableOpacity>
            <Text style={[{ fontSize: 13, color: p.sub }, ff(font.bodySemi, '600')]}>
              Page {page} of {totalPages}
            </Text>
            <TouchableOpacity
              disabled={page >= totalPages}
              onPress={() => fetchUsers(page + 1)}
              style={[styles.pageBtn, { opacity: page >= totalPages ? 0.4 : 1, borderColor: p.line, backgroundColor: p.card }]}
              accessibilityLabel="Next page"
            >
              <Feather name="chevron-right" size={18} color={p.text} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Filter & sort sheet */}
      <Modal visible={filterModalVisible} transparent animationType="slide" onRequestClose={() => setFilterModalVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setFilterModalVisible(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: p.card, paddingBottom: insets.bottom + 20 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.grabber, { backgroundColor: p.line }]} />
            <View style={styles.rowBetween}>
              <Text style={[{ fontSize: 20, color: p.text }, ff(font.displayBold, '700')]}>Filter & sort</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)} hitSlop={10} accessibilityLabel="Close">
                <Feather name="x" size={20} color={p.sub} />
              </TouchableOpacity>
            </View>

            <SectionLabel style={{ marginHorizontal: 0, marginTop: 18 }}>Role</SectionLabel>
            <OptionChips
              p={p}
              font={font}
              value={filterRole}
              onChange={setFilterRole}
              options={[
                { id: 'all', label: 'All roles' },
                { id: 'user', label: 'Users' },
                { id: 'admin', label: 'Admins' },
              ]}
            />

            <SectionLabel style={{ marginHorizontal: 0, marginTop: 18 }}>Status</SectionLabel>
            <OptionChips
              p={p}
              font={font}
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { id: 'all', label: 'Any status' },
                { id: 'active', label: 'Active' },
                { id: 'suspended', label: 'Suspended' },
              ]}
            />

            <SectionLabel style={{ marginHorizontal: 0, marginTop: 18 }}>Sort by</SectionLabel>
            <OptionChips
              p={p}
              font={font}
              value={sortBy}
              onChange={setSortBy}
              options={[
                { id: 'newest', label: 'Newest' },
                { id: 'oldest', label: 'Oldest' },
                { id: 'name', label: 'Name A–Z' },
                { id: 'email', label: 'Email A–Z' },
              ]}
            />

            <View style={[styles.btnRow, { marginTop: 24 }]}>
              <TouchableOpacity style={[styles.btn, styles.btnOutline, { borderColor: p.line }]} onPress={resetFilters}>
                <Text style={[{ fontSize: 15, color: p.text }, ff(font.bodySemi, '600')]}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: p.segActive }]}
                onPress={() => setFilterModalVisible(false)}
              >
                <Text style={[{ fontSize: 15, color: p.segActiveText }, ff(font.bodyBold, '700')]}>Show results</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Suspend sheet */}
      <Modal visible={banModalVisible} transparent animationType="slide" onRequestClose={() => setBanModalVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !banSubmitting && setBanModalVisible(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: p.card, paddingBottom: insets.bottom + 20 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.grabber, { backgroundColor: p.line }]} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile tint={p.tint.amber} size={48} radius={16}>
                <Feather name="slash" size={20} color={p.tint.amber.fg} />
              </IconTile>
              <View style={{ flex: 1 }}>
                <Text style={[{ fontSize: 20, color: p.text }, ff(font.displayBold, '700')]}>Suspend account</Text>
                <Text style={[{ fontSize: 13, color: p.sub, marginTop: 2 }, ff(font.body, '500')]} numberOfLines={1}>
                  {selectedUserForBan?.email}
                </Text>
              </View>
            </View>
            <Text style={[{ fontSize: 14, lineHeight: 20, color: p.sub, marginTop: 16 }, ff(font.body, '500')]}>
              They'll lose access right away and their active sessions will be signed out. You can reinstate them later.
            </Text>
            <Text style={[styles.label, { color: p.text }, ff(font.bodySemi, '600')]}>Reason</Text>
            <TextInput
              style={[...inputStyle, { minHeight: 84, textAlignVertical: 'top' }]}
              placeholder="e.g. Terms violation or suspicious activity"
              placeholderTextColor={p.muted}
              value={banReason}
              onChangeText={setBanReason}
              multiline
            />
            <View style={[styles.btnRow, { marginTop: 20 }]}>
              <TouchableOpacity
                style={[styles.btn, styles.btnOutline, { borderColor: p.line }]}
                onPress={() => setBanModalVisible(false)}
                disabled={banSubmitting}
              >
                <Text style={[{ fontSize: 15, color: p.text }, ff(font.bodySemi, '600')]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { backgroundColor: p.segActive }]} onPress={submitBan} disabled={banSubmitting}>
                {banSubmitting ? (
                  <ActivityIndicator size="small" color={p.segActiveText} />
                ) : (
                  <Text style={[{ fontSize: 15, color: p.segActiveText }, ff(font.bodyBold, '700')]}>Suspend user</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Purge sheet */}
      <Modal visible={deleteModalVisible} transparent animationType="slide" onRequestClose={() => setDeleteModalVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !deleteSubmitting && setDeleteModalVisible(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: p.card, paddingBottom: insets.bottom + 20 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.grabber, { backgroundColor: p.line }]} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconTile tint={p.tint.coral} size={48} radius={16}>
                <Feather name="trash-2" size={20} color={p.tint.coral.fg} />
              </IconTile>
              <View style={{ flex: 1 }}>
                <Text style={[{ fontSize: 20, color: p.text }, ff(font.displayBold, '700')]}>Purge account</Text>
                <Text style={[{ fontSize: 13, color: p.sub, marginTop: 2 }, ff(font.body, '500')]} numberOfLines={1}>
                  {selectedUserForDelete?.email}
                </Text>
              </View>
            </View>

            <View style={[styles.warn, { backgroundColor: p.tint.coral.bg }]}>
              <Feather name="alert-triangle" size={15} color={p.tint.coral.fg} style={{ marginTop: 1 }} />
              <Text style={[{ flex: 1, fontSize: 13, lineHeight: 19, color: p.tint.coral.fg }, ff(font.bodySemi, '600')]}>
                This permanently deletes the user and every record linked to them. It can't be undone.
              </Text>
            </View>

            <Text style={[styles.label, { color: p.text }, ff(font.bodySemi, '600')]}>
              Type <Text style={ff(font.bodyBold, '800')}>{selectedUserForDelete?.email}</Text> to confirm
            </Text>
            <TextInput
              style={[...inputStyle, { borderColor: emailMatches ? p.success : p.line }]}
              placeholder="Exact email address"
              placeholderTextColor={p.muted}
              value={confirmEmailInput}
              onChangeText={setConfirmEmailInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.label, { color: p.text }, ff(font.bodySemi, '600')]}>Reason for audit log</Text>
            <TextInput
              style={inputStyle}
              placeholder="Why is this account being removed?"
              placeholderTextColor={p.muted}
              value={deleteReason}
              onChangeText={setDeleteReason}
            />

            <View style={[styles.btnRow, { marginTop: 20 }]}>
              <TouchableOpacity
                style={[styles.btn, styles.btnOutline, { borderColor: p.line }]}
                onPress={() => setDeleteModalVisible(false)}
                disabled={deleteSubmitting}
              >
                <Text style={[{ fontSize: 15, color: p.text }, ff(font.bodySemi, '600')]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: CORAL, opacity: emailMatches ? 1 : 0.4 }]}
                onPress={submitDelete}
                disabled={deleteSubmitting || !emailMatches}
              >
                {deleteSubmitting ? (
                  <ActivityIndicator size="small" color="#3A0D00" />
                ) : (
                  <Text style={[{ fontSize: 15, color: '#3A0D00' }, ff(font.bodyBold, '700')]}>Purge forever</Text>
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
  container: { flex: 1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 50,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  filterBtn: { width: 50, height: 50, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  filterDot: {
    position: 'absolute',
    top: 11,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: CORAL,
    borderWidth: 2,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    marginTop: 18,
  },
  smallBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  ghostBtn: { marginTop: 10, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  listCard: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 4 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 46, height: 46, borderRadius: 23 },
  statusDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
  },
  chevron: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  banNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginLeft: 58,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  actionRow: { flexDirection: 'row', gap: 10, paddingLeft: 58, paddingBottom: 16 },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, paddingTop: 18 },
  pageBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(11, 31, 23, 0.45)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  warn: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 16, marginTop: 16 },
  label: { fontSize: 13, marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnOutline: { borderWidth: 1, backgroundColor: 'transparent' },
});
