import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  StyleProp,
  ViewStyle,
  LayoutChangeEvent,
} from 'react-native';
import { useTheme } from '../store';
import { BankIcon } from './BankIcon';
import { CategoryIcon } from './CategoryIcon';
import { getCategory } from '../constants/categories';
import { ActivityBank, ActivityFilter, ActivityItem, isSameFilter } from '../hooks/useActivityFeed';

/* Shared pieces for the Home "Recent" card and the All Transactions screen. */

export const EMERALD = '#10B981';

export interface ActivityFonts {
  body?: string;
  bodySemi?: string;
  bodyBold?: string;
  displayBold?: string;
}

const formatINR = (value: number) =>
  `₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const toNumber = (v: number | string | undefined) => {
  const n = typeof v === 'string' ? parseFloat(v) : v ?? 0;
  return isNaN(n as number) ? 0 : Math.abs(n as number);
};

export const relativeDay = (ts: number) => {
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** Bank logo + masked account number. The bank name is intentionally never shown. */
export const BankAccountBadge = ({ bank, font }: { bank?: ActivityBank; font?: ActivityFonts }) => {
  const { colors, isDark } = useTheme();
  if (!bank) return null;
  return (
    <View
      style={[badgeStyles.badge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F6F4' }]}
      accessibilityLabel={bank.code === 'CASH' ? 'Cash' : `Account ending ${bank.mask.replace(/•/g, '')}`}
    >
      <BankIcon code={bank.code} name={bank.bankName} size={16} />
      <Text
        style={[
          badgeStyles.mask,
          { color: colors.textSecondary, fontFamily: font?.bodySemi, fontWeight: font?.bodySemi ? undefined : '600' },
        ]}
      >
        {bank.mask}
      </Text>
    </View>
  );
};

export const ActivityFilterChips = ({
  value,
  onChange,
  banks,
  font,
  inset = 16,
  style,
}: {
  value: ActivityFilter;
  onChange: (f: ActivityFilter) => void;
  banks: ActivityBank[];
  font?: ActivityFonts;
  /** Horizontal padding at both ends of the scroll row. */
  inset?: number;
  /** Extra style for the outer row (vertical spacing). */
  style?: StyleProp<ViewStyle>;
}) => {
  const { colors, isDark } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const chipLayouts = useRef<Record<string, { x: number; width: number }>>({});
  const [viewportWidth, setViewportWidth] = useState(0);
  const options: { key: string; filter: ActivityFilter; label: string; bank?: ActivityBank; a11y: string }[] = [
    { key: 'all', filter: 'all', label: 'All', a11y: 'All transactions' },
    { key: 'credit', filter: 'credit', label: 'Credit', a11y: 'Credits only' },
    { key: 'debit', filter: 'debit', label: 'Debit', a11y: 'Debits only' },
    ...banks.map((b) => ({
      key: `bank_${b.id}`,
      filter: { bankId: b.id } as ActivityFilter,
      label: b.mask,
      bank: b,
      a11y: `Account ending ${b.mask.replace(/•/g, '')}`,
    })),
  ];
  const selectedKey = options.find((o) => isSameFilter(o.filter, value))?.key;

  // Keep the selected chip fully visible (centred when possible) instead of clipped at an edge.
  useEffect(() => {
    const layout = selectedKey ? chipLayouts.current[selectedKey] : undefined;
    if (!layout || !viewportWidth) return;
    const target = Math.max(0, layout.x - (viewportWidth - layout.width) / 2);
    scrollRef.current?.scrollTo({ x: target, animated: true });
  }, [selectedKey, viewportWidth]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[chipStyles.scroll, style]}
      contentContainerStyle={[chipStyles.row, { paddingLeft: inset }]}
      onLayout={(e: LayoutChangeEvent) => setViewportWidth(e.nativeEvent.layout.width)}
      fadingEdgeLength={24}
    >
      {options.map((o) => {
        const selected = o.key === selectedKey;
        return (
          <Pressable
            key={o.key}
            onLayout={(e: LayoutChangeEvent) => {
              const { x, width } = e.nativeEvent.layout;
              chipLayouts.current[o.key] = { x, width };
            }}
            onPress={() => onChange(o.filter)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={o.a11y}
            style={[
              chipStyles.chip,
              selected
                ? { backgroundColor: EMERALD, borderColor: EMERALD }
                : { backgroundColor: colors.card, borderColor: isDark ? colors.border : '#E3E9E6' },
            ]}
          >
            {o.bank ? <BankIcon code={o.bank.code} name={o.bank.bankName} size={20} /> : null}
            <Text
              style={[
                chipStyles.label,
                {
                  color: selected ? '#FFFFFF' : colors.text,
                  fontFamily: selected ? font?.bodyBold : font?.bodySemi,
                  fontWeight: (selected ? font?.bodyBold : font?.bodySemi) ? undefined : selected ? '700' : '600',
                },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
      {/* Trailing spacer: Android drops end padding on horizontal content containers. */}
      <View style={{ width: Math.max(0, inset - 8) }} />
    </ScrollView>
  );
};

export const ActivityRow = ({
  tx,
  bank,
  hidden,
  divider,
  meta,
  font,
  onPress,
}: {
  tx: ActivityItem;
  bank?: ActivityBank;
  hidden?: boolean;
  divider?: boolean;
  /** Overrides the default "<category>, <day>" subtitle. */
  meta?: string;
  font?: ActivityFonts;
  onPress?: (tx: ActivityItem) => void;
}) => {
  const { colors, isDark } = useTheme();
  const isCredit = tx.type === 'credit';
  const catKey = isCredit ? 'money_received' : tx.category || 'miscellaneous';
  const label = isCredit ? 'Money received' : getCategory(catKey).label;

  const row = (
    <View
      style={[
        rowStyles.row,
        divider && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
      ]}
    >
      <CategoryIcon category={catKey} variant="soft" size={42} style={{ marginRight: 12 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[rowStyles.name, { color: colors.text, fontFamily: font?.bodySemi, fontWeight: font?.bodySemi ? undefined : '600' }]}
          numberOfLines={1}
        >
          {tx.merchant || (isCredit ? 'Money received' : 'Unknown merchant')}
        </Text>
        <Text style={[rowStyles.meta, { color: colors.textSecondary, fontFamily: font?.body }]} numberOfLines={1}>
          {meta ?? `${label}, ${relativeDay(Number(tx.timestamp))}`}
        </Text>
      </View>
      <View style={rowStyles.right}>
        <Text
          style={[
            rowStyles.amount,
            {
              color: isCredit ? (isDark ? '#4ADE80' : '#0B7A3E') : colors.text,
              fontFamily: font?.displayBold,
              fontWeight: font?.displayBold ? undefined : '700',
            },
          ]}
        >
          {hidden ? '•••' : `${isCredit ? '+' : '−'}${formatINR(toNumber(tx.amount))}`}
        </Text>
        <BankAccountBadge bank={bank} font={font} />
      </View>
    </View>
  );

  return onPress ? (
    <Pressable onPress={() => onPress(tx)} accessibilityRole="button">
      {row}
    </Pressable>
  ) : (
    row
  );
};

const badgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingLeft: 2,
    paddingRight: 7,
    borderRadius: 999,
  },
  mask: {
    fontSize: 11,
    letterSpacing: 0.3,
    fontVariant: ['tabular-nums'],
  },
});

const chipStyles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    height: 36,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    fontSize: 13,
  },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
  },
  name: {
    fontSize: 15,
  },
  meta: {
    fontSize: 12,
    marginTop: 2,
  },
  right: {
    alignItems: 'flex-end',
    gap: 5,
    marginLeft: 8,
    flexShrink: 0,
  },
  amount: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
});
