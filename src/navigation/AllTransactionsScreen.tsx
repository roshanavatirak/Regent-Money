// src/navigation/AllTransactionsScreen.tsx
//
// Full credit + debit history ("See all" from the Home Recent card), grouped by day,
// with All / Credit / Debit / per-bank filters.

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, SectionList, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Font from 'expo-font';
import { useTheme } from '../store';
import { getCategory } from '../constants/categories';
import { ActivityFilterChips, ActivityRow, ActivityFonts, relativeDay } from '../components/ActivityFeed';
import { ActivityFilter, ActivityItem, filterActivity, useActivityFeed } from '../hooks/useActivityFeed';
import { isExcludedFromBudget } from '../utils/budget';

const formatINR = (value: number) =>
  `₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const timeOf = (ts: number) =>
  new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export const AllTransactionsScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { items, banks } = useActivityFeed();
  const [filter, setFilter] = useState<ActivityFilter>('all');

  const font: ActivityFonts = {
    body: Font.isLoaded('Figtree_500Medium') ? 'Figtree_500Medium' : undefined,
    bodySemi: Font.isLoaded('Figtree_600SemiBold') ? 'Figtree_600SemiBold' : undefined,
    bodyBold: Font.isLoaded('Figtree_700Bold') ? 'Figtree_700Bold' : undefined,
    displayBold: Font.isLoaded('BricolageGrotesque_700Bold') ? 'BricolageGrotesque_700Bold' : undefined,
  };
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const bankById = useMemo(() => new Map(banks.map((b) => [b.id, b])), [banks]);
  // A bank chip already names the account, so rows skip the per-row bank badge.
  const isBankFilter = typeof filter !== 'string';
  const filtered = useMemo(() => filterActivity(items, filter), [items, filter]);

  const totals = useMemo(() => {
    let moneyIn = 0;
    let moneyOut = 0;
    for (const tx of filtered) {
      if (isExcludedFromBudget(tx)) continue;
      const amt = Math.abs(parseFloat(String(tx.amount)) || 0);
      if (tx.type === 'credit') moneyIn += amt;
      else moneyOut += amt;
    }
    return { moneyIn, moneyOut };
  }, [filtered]);

  const sections = useMemo(() => {
    const out: { title: string; data: ActivityItem[] }[] = [];
    for (const tx of filtered) {
      const title = relativeDay(Number(tx.timestamp));
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(tx);
      else out.push({ title, data: [tx] });
    }
    return out;
  }, [filtered]);

  const bg = isDark ? colors.background : '#F3F6F4';
  const cardBorder = isDark ? colors.border : '#E1E9E4';

  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={[styles.backBtn, { backgroundColor: colors.card, borderColor: cardBorder }]}
        >
          <Feather name="chevron-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
          Transactions
        </Text>
      </View>

      <View style={styles.totalsRow}>
        {[
          { label: 'Money in', value: `+${formatINR(totals.moneyIn)}`, color: isDark ? '#4ADE80' : '#0B7A3E' },
          { label: 'Money out', value: `−${formatINR(totals.moneyOut)}`, color: colors.text },
        ].map((t) => (
          <View key={t.label} style={[styles.totalCard, { backgroundColor: colors.card, borderColor: cardBorder }]}>
            <Text style={[styles.totalLabel, { color: colors.textSecondary, fontFamily: font.bodySemi }]}>{t.label}</Text>
            <Text
              style={[styles.totalValue, { color: t.color, fontFamily: font.displayBold, fontWeight: font.displayBold ? undefined : '700' }]}
              numberOfLines={1}
            >
              {t.value}
            </Text>
          </View>
        ))}
      </View>

      <View>
        <ActivityFilterChips
          value={filter}
          onChange={setFilter}
          banks={banks}
          font={font}
          inset={16}
          style={{ paddingVertical: 12 }}
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(tx, i) => tx.id || `tx_${i}`}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontFamily: font.bodyBold }]}>
            {section.title}
          </Text>
        )}
        renderItem={({ item, index, section }) => {
          const first = index === 0;
          const last = index === section.data.length - 1;
          const isCredit = item.type === 'credit';
          return (
            <View
              style={[
                styles.rowWrap,
                { backgroundColor: colors.card, borderColor: cardBorder },
                first && styles.rowFirst,
                last && styles.rowLast,
              ]}
            >
              <ActivityRow
                tx={item}
                bank={!isBankFilter && item.bankProfileId ? bankById.get(item.bankProfileId) : undefined}
                divider={!last}
                font={font}
                meta={`${isCredit ? 'Money received' : getCategory(item.category || 'miscellaneous').label} · ${timeOf(
                  Number(item.timestamp),
                )}`}
                onPress={(tx) => navigation.navigate('TransactionDetail', { transaction: tx })}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textSecondary, fontFamily: font.body }]}>
            {items.length === 0 ? 'No transactions yet.' : 'No transactions match this filter.'}
          </Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
  },
  totalsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  totalCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  totalLabel: {
    fontSize: 12,
  },
  totalValue: {
    fontSize: 18,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
    marginLeft: 4,
  },
  rowWrap: {
    paddingHorizontal: 16,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 4,
  },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    paddingBottom: 4,
  },
  empty: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 32,
  },
});
