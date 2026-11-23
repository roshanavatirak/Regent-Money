// Admin page: inbox of suggestions and bug reports, with counts, search and filters.
// Tapping an item opens AdminFeedbackDetail.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  adminFeedbackService,
  AdminFeedbackItem,
  FeedbackKind,
  FeedbackPriority,
  FeedbackStats,
  FeedbackStatus,
} from '../../../services/adminFeedbackService';
import {
  useAdminTheme,
  ff,
  FOREST,
  LIME,
  MIST,
  CORAL,
  LILAC,
  HeroRings,
  IconTile,
  Pill,
  Segmented,
  SectionLabel,
  AdminPalette,
  AdminFont,
} from '../adminTheme';
import {
  STATUS_ORDER,
  STATUS_INFO,
  PRIORITY_ORDER,
  PRIORITY_LABEL,
  FEEDBACK_AREAS,
  statusTint,
  priorityDot,
  kindMeta,
  ago,
  spanWords,
  displayName,
} from './feedbackMeta';

const PAGE = 30;
const DAY = 24 * 60 * 60 * 1000;

type KindTab = 'all' | FeedbackKind;
type DateRange = 'any' | '7' | '30' | '90';
type Filters = { status?: FeedbackStatus; priority?: FeedbackPriority; area?: string; range: DateRange };

const RANGE_LABEL: Record<DateRange, string> = { any: 'Any time', '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days' };
const EMPTY_FILTERS: Filters = { range: 'any' };

export const AdminFeedbackScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { p, font, isDark } = useAdminTheme();

  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [items, setItems] = useState<AdminFeedbackItem[]>([]);
  const [total, setTotal] = useState(0);
  // Which filter set the list currently shows; differs from queryKey while a new set loads.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<KindTab>('all');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);

  // Ignore responses from older requests when filters change quickly.
  const requestId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchText.trim()), 350);
    return () => clearTimeout(t);
  }, [searchText]);

  const query = useMemo(
    () => ({
      kind: kind === 'all' ? undefined : kind,
      status: filters.status,
      priority: filters.priority,
      area: filters.area,
      range: filters.range,
      search: search || undefined,
    }),
    [kind, filters, search],
  );
  const queryKey = useMemo(() => JSON.stringify(query), [query]);
  const loading = loadedKey !== queryKey;

  const load = useCallback(
    async (mode: 'replace' | 'more' = 'replace') => {
      const id = ++requestId.current;
      const key = queryKey;
      try {
        const offset = mode === 'more' ? items.length : 0;
        const { range, ...rest } = query;
        const since = range === 'any' ? undefined : Date.now() - Number(range) * DAY;
        const [list, counts] = await Promise.all([
          adminFeedbackService.list({ ...rest, since, limit: PAGE, offset }),
          mode === 'replace' ? adminFeedbackService.stats() : Promise.resolve(null),
        ]);
        if (id !== requestId.current) return;
        setError(null);
        setItems((prev) => (mode === 'more' ? [...prev, ...list.items] : list.items));
        setTotal(list.total);
        if (counts) setStats(counts);
      } catch (err: any) {
        if (id !== requestId.current) return;
        setError(err?.message || 'Couldn’t load feedback.');
      } finally {
        if (id === requestId.current) {
          setLoadedKey(key);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [query, queryKey, items.length],
  );

  // Reload when filters change.
  useEffect(() => {
    // Deferred so the fetch's state updates don't run inside the effect body.
    const t = setTimeout(() => load('replace'), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Coming back from a detail page: refresh quietly so new statuses show.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      load('replace');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]),
  );

  const refresh = () => {
    setRefreshing(true);
    load('replace');
  };

  const loadMore = () => {
    if (loading || loadingMore || items.length >= total) return;
    setLoadingMore(true);
    load('more');
  };

  const openSheet = () => {
    setDraft(filters);
    setSheetOpen(true);
  };

  const activeFilterCount =
    (filters.status ? 1 : 0) + (filters.priority ? 1 : 0) + (filters.area ? 1 : 0) + (filters.range !== 'any' ? 1 : 0);

  const header = (
    <View>
      {/* Search */}
      <View style={[styles.search, { backgroundColor: p.card, borderColor: p.line }]}>
        <Feather name="search" size={18} color={p.muted} />
        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search title, message or user"
          placeholderTextColor={p.muted}
          accessibilityLabel="Search feedback"
          returnKeyType="search"
          autoCorrect={false}
          style={[styles.searchInput, { color: p.text }, ff(font.body, '500')]}
        />
        {searchText ? (
          <TouchableOpacity onPress={() => setSearchText('')} hitSlop={10} accessibilityLabel="Clear search">
            <Feather name="x-circle" size={17} color={p.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        <HeroRings />
        <View style={styles.rowBetween}>
          <Text style={[{ fontSize: 14, color: MIST }, ff(font.bodySemi, '600')]}>Waiting for a reply</Text>
          {stats && stats.criticalOpen > 0 ? (
            <Pill
              tint={{ bg: 'rgba(255,138,107,0.16)', fg: '#FFB29E' }}
              dot={CORAL}
              label={`${stats.criticalOpen} critical`}
              font={font}
            />
          ) : (
            <Pill tint={{ bg: 'rgba(184,243,107,0.14)', fg: LIME }} dot={LIME} label="No critical" font={font} />
          )}
        </View>
        {stats ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
            <Text style={[styles.heroAmount, ff(font.display, '800')]}>{stats.awaitingReply}</Text>
            <Text style={[{ fontSize: 14, color: MIST }, ff(font.bodySemi, '600')]}>
              {stats.awaitingReply === 0
                ? 'all caught up'
                : stats.oldestAwaitingAt
                  ? `oldest ${spanWords(stats.oldestAwaitingAt)}`
                  : 'items'}
            </Text>
          </View>
        ) : (
          <ActivityIndicator color={LIME} style={{ alignSelf: 'flex-start', marginVertical: 20 }} />
        )}
        <View style={styles.flowRow}>
          {[
            { label: 'Open', value: stats?.byStatus.open, dot: '#93C5FD' },
            { label: 'In progress', value: stats ? stats.byStatus.investigating + stats.byStatus.in_progress : undefined, dot: LILAC },
            { label: 'Fixed · 7d', value: stats?.fixedLast7d, dot: LIME },
          ].map((f) => (
            <View key={f.label} style={styles.flowTile}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: f.dot }} />
                <Text style={[{ fontSize: 12, color: MIST }, ff(font.body, '500')]} numberOfLines={1}>
                  {f.label}
                </Text>
              </View>
              <Text style={[styles.flowValue, ff(font.displayBold, '700')]}>{f.value ?? '—'}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Kind */}
      <Segmented<KindTab>
        style={{ marginTop: 16 }}
        value={kind}
        onChange={setKind}
        options={[
          { id: 'all', label: 'All', count: stats?.total },
          { id: 'feature', label: 'Suggestions', count: stats?.feature },
          { id: 'bug', label: 'Reports', count: stats?.bug },
        ]}
      />

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 12 }}
      >
        <FilterChip
          label={filters.status ? `Status: ${STATUS_INFO[filters.status].label}` : 'Status'}
          active={!!filters.status}
          onPress={openSheet}
          p={p}
          font={font}
        />
        <FilterChip
          label={filters.priority ? `Priority: ${PRIORITY_LABEL[filters.priority]}` : 'Priority'}
          active={!!filters.priority}
          onPress={openSheet}
          p={p}
          font={font}
        />
        <FilterChip label={filters.area || 'Area'} active={!!filters.area} onPress={openSheet} p={p} font={font} />
        <FilterChip
          label={RANGE_LABEL[filters.range]}
          active={filters.range !== 'any'}
          onPress={openSheet}
          p={p}
          font={font}
        />
        {activeFilterCount > 0 ? (
          <TouchableOpacity onPress={() => setFilters(EMPTY_FILTERS)} style={styles.clearChip} accessibilityRole="button">
            <Text style={[{ fontSize: 13, color: p.link }, ff(font.bodyBold, '700')]}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: p.tint.coral.bg }]}>
          <Feather name="wifi-off" size={16} color={p.tint.coral.fg} />
          <Text style={[{ flex: 1, fontSize: 13, color: p.tint.coral.fg }, ff(font.bodySemi, '600')]}>{error}</Text>
          <TouchableOpacity onPress={refresh} hitSlop={8}>
            <Text style={[{ fontSize: 13, color: p.tint.coral.fg }, ff(font.bodyBold, '700')]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.roundBtn, { backgroundColor: p.card, borderColor: p.line }]}
        >
          <Feather name="chevron-left" size={22} color={p.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[{ fontSize: 12, color: p.sub }, ff(font.bodySemi, '600')]}>Admin Console</Text>
          <Text style={[{ fontSize: 26, color: p.text, letterSpacing: -0.5 }, ff(font.display, '800')]}>Feedback</Text>
        </View>
        <TouchableOpacity
          onPress={refresh}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          style={[styles.roundBtn, { backgroundColor: p.card, borderColor: p.line }]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={p.segActive} />
          ) : (
            <Feather name="refresh-cw" size={17} color={p.text} />
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={p.segActive} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <FeedbackRow
            item={item}
            p={p}
            font={font}
            isDark={isDark}
            onPress={() => navigation.navigate('AdminFeedbackDetail', { id: item.id })}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={p.segActive} style={{ marginTop: 40 }} />
          ) : error ? null : (
            <View style={styles.empty}>
              <IconTile tint={p.tint.green} size={56} radius={20}>
                <Feather name="inbox" size={24} color={p.tint.green.fg} />
              </IconTile>
              <Text style={[{ fontSize: 17, color: p.text, marginTop: 12 }, ff(font.displayBold, '700')]}>
                Nothing here
              </Text>
              <Text style={[{ fontSize: 14, color: p.sub, marginTop: 4, textAlign: 'center' }, ff(font.body, '500')]}>
                {activeFilterCount > 0 || search
                  ? 'No suggestions or reports match these filters.'
                  : 'New suggestions and reports will show up here.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={p.segActive} style={{ marginVertical: 18 }} /> : null
        }
      />

      {/* Filters sheet */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: p.card, paddingBottom: insets.bottom + 20 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={[styles.grabber, { backgroundColor: p.line }]} />
            <View style={styles.rowBetween}>
              <Text style={[{ fontSize: 20, color: p.text }, ff(font.displayBold, '700')]}>Filters</Text>
              <TouchableOpacity onPress={() => setSheetOpen(false)} hitSlop={10} accessibilityLabel="Close">
                <Feather name="x" size={20} color={p.sub} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
              <SectionLabel style={{ marginHorizontal: 0, marginTop: 16 }}>Status</SectionLabel>
              <Chips
                p={p}
                font={font}
                value={draft.status}
                onChange={(status) => setDraft((d) => ({ ...d, status }))}
                options={STATUS_ORDER.map((s) => ({ id: s, label: STATUS_INFO[s].label }))}
              />
              <SectionLabel style={{ marginHorizontal: 0, marginTop: 16 }}>Priority</SectionLabel>
              <Chips
                p={p}
                font={font}
                value={draft.priority}
                onChange={(priority) => setDraft((d) => ({ ...d, priority }))}
                options={PRIORITY_ORDER.map((x) => ({ id: x, label: PRIORITY_LABEL[x] }))}
              />
              <SectionLabel style={{ marginHorizontal: 0, marginTop: 16 }}>Area</SectionLabel>
              <Chips
                p={p}
                font={font}
                value={draft.area}
                onChange={(area) => setDraft((d) => ({ ...d, area }))}
                options={FEEDBACK_AREAS.map((a) => ({ id: a, label: a }))}
              />
              <SectionLabel style={{ marginHorizontal: 0, marginTop: 16 }}>Sent</SectionLabel>
              <Chips
                p={p}
                font={font}
                value={draft.range === 'any' ? undefined : draft.range}
                onChange={(range) => setDraft((d) => ({ ...d, range: (range as DateRange) || 'any' }))}
                options={(['7', '30', '90'] as DateRange[]).map((r) => ({ id: r, label: RANGE_LABEL[r] }))}
              />
            </ScrollView>
            <View style={[styles.btnRow, { marginTop: 20 }]}>
              <TouchableOpacity
                style={[styles.btn, styles.btnOutline, { borderColor: p.line }]}
                onPress={() => setDraft(EMPTY_FILTERS)}
                accessibilityRole="button"
              >
                <Text style={[{ fontSize: 15, color: p.text }, ff(font.bodySemi, '600')]}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: p.segActive }]}
                onPress={() => {
                  setFilters(draft);
                  setSheetOpen(false);
                }}
                accessibilityRole="button"
              >
                <Text style={[{ fontSize: 15, color: p.segActiveText }, ff(font.bodyBold, '700')]}>Show results</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

/* ------------------------------------------------------------------ */

const FeedbackRow: React.FC<{
  item: AdminFeedbackItem;
  p: AdminPalette;
  font: AdminFont;
  isDark: boolean;
  onPress: () => void;
}> = ({ item, p, font, isDark, onPress }) => {
  const k = kindMeta(item.kind, p);
  const st = statusTint(item.status, p);
  const needsReply = !item.adminNotes && !['fixed', 'resolved', 'closed'].includes(item.status);
  const meta = [displayName(item.user?.name, item.user?.email), item.area, item.kind === 'feature' ? item.impact : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${k.short}: ${item.title}. ${STATUS_INFO[item.status].label}.`}
      style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}
    >
      <IconTile tint={k.tint} size={40} radius={14}>
        <Feather name={k.icon} size={18} color={k.tint.fg} />
      </IconTile>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Text numberOfLines={2} style={[{ flex: 1, fontSize: 15, lineHeight: 20, color: p.text }, ff(font.bodyBold, '700')]}>
            {item.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            {needsReply ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isDark ? LIME : FOREST }} /> : null}
            <Text style={[{ fontSize: 12, color: p.muted }, ff(font.bodySemi, '600')]}>{ago(item.createdAt)}</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={[{ fontSize: 13, color: p.sub }, ff(font.body, '500')]}>
          {meta}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <Pill tint={st} label={STATUS_INFO[item.status].label} font={font} small />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: priorityDot(item.priority, isDark) }} />
            <Text style={[{ fontSize: 12, color: p.sub }, ff(font.bodySemi, '600')]}>{PRIORITY_LABEL[item.priority]}</Text>
          </View>
          {item.mediaUrls.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name="image" size={13} color={p.muted} />
              <Text style={[{ fontSize: 12, color: p.muted }, ff(font.bodySemi, '600')]}>{item.mediaUrls.length}</Text>
            </View>
          ) : null}
          {item.adminNotes ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name="corner-up-left" size={13} color={p.muted} />
              <Text style={[{ fontSize: 12, color: p.muted }, ff(font.bodySemi, '600')]}>Replied</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const FilterChip: React.FC<{ label: string; active: boolean; onPress: () => void; p: AdminPalette; font: AdminFont }> = ({
  label,
  active,
  onPress,
  p,
  font,
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.8}
    accessibilityRole="button"
    style={[
      styles.chip,
      {
        backgroundColor: active ? p.tint.green.bg : p.card,
        borderColor: active ? p.tint.green.fg : p.line,
      },
    ]}
  >
    <Text style={[{ fontSize: 13, color: active ? p.tint.green.fg : p.text }, ff(active ? font.bodyBold : font.bodySemi, active ? '700' : '600')]}>
      {label}
    </Text>
    <Feather name="chevron-down" size={14} color={active ? p.tint.green.fg : p.sub} />
  </TouchableOpacity>
);

/** Single-select chips; tapping the selected one clears it. */
function Chips<T extends string>({
  options,
  value,
  onChange,
  p,
  font,
}: {
  options: { id: T; label: string }[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  p: AdminPalette;
  font: AdminFont;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <TouchableOpacity
            key={o.id}
            onPress={() => onChange(on ? undefined : o.id)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[styles.chip, { backgroundColor: on ? p.segActive : p.card, borderColor: on ? p.segActive : p.line }]}
          >
            <Text style={[{ fontSize: 13, color: on ? p.segActiveText : p.sub }, ff(font.bodySemi, '600')]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 10 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  search: {
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  hero: { backgroundColor: FOREST, borderRadius: 22, padding: 18, marginTop: 14, overflow: 'hidden' },
  heroAmount: { fontSize: 46, color: '#FFFFFF', letterSpacing: -1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flowRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  flowTile: { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 14, padding: 10 },
  flowValue: { fontSize: 20, color: '#FFFFFF', marginTop: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  clearChip: { height: 36, paddingHorizontal: 6, justifyContent: 'center' },
  card: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, marginBottom: 10 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
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
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnOutline: { borderWidth: 1, backgroundColor: 'transparent' },
});
