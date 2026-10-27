// src/navigation/BanksScreen.tsx
//
// Banks tab: total balance, where the money sits, and one card per account.
// Lives in its own file; index.tsx passes in the shared top bar and Add Bank sheet.

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Platform,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Font from 'expo-font';
import { useTheme, useBankStore, showGlobalConfirm } from '../store';
import { useSyncDb } from '../services/useSyncDb';
import { smsCatchupService } from '../services/smsCatchupService';
import { authService } from '../services/authService';
import { getBackendUrl } from '../config/api';
import { BankIcon } from '../components/BankIcon';
import { BankDetailsModal } from './BankDetailsModal';
import { AddBankModal } from './AddBankModal';
import { bankBrandColor as brandColor, getBankCode } from '../constants/bankBrand';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

const shortName = (name: string) =>
  name
    .replace(/\b(bank|ltd|limited|of india)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || name;

const inr = (n: number, decimals = 2) =>
  `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: decimals })}`;

const sharePct = (part: number, total: number): string => {
  if (total <= 0 || part <= 0) return '0%';
  if (part >= total) return '100%';
  const p = (part / total) * 100;
  if (p > 0 && p < 1) return '<1%';
  if (p > 99 && p < 100) return '>99%';
  return `${Math.round(p)}%`;
};

/** Smooth count-up for the total. */
const useCountUp = (target: number, duration = 800) => {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      current.current = target;
      setValue(target);
      return;
    }
    const from = current.current;
    if (from === target) return;
    const start = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    let raf = 0;
    const tick = (nowTime?: number) => {
      const now = nowTime || (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
      const t = Math.min(1, (now - start) / duration);
      const v = from + (target - from) * (1 - Math.pow(1 - t, 3));
      current.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
};

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

const ShareBar: React.FC<{ items: { id: string; value: number; color: string }[]; total: number; track: string }> = ({
  items,
  total,
  track,
}) => {
  const [width, setWidth] = useState(0);
  const reveal = useSharedValue(0);
  useEffect(() => {
    if (width > 0) {
      reveal.value = 0;
      reveal.value = withDelay(150, withTiming(width, { duration: 700, easing: Easing.out(Easing.cubic) }));
    }
  }, [width, total]);
  const style = useAnimatedStyle(() => ({ width: reveal.value }));

  return (
    <View
      style={{ height: 10, borderRadius: 5, backgroundColor: track, overflow: 'hidden' }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View style={[{ height: 10, overflow: 'hidden' }, style]}>
        <View style={{ flexDirection: 'row', width, height: 10, gap: 3 }}>
          {items.map((it) => (
            <View
              key={it.id}
              style={{
                width: total > 0 ? Math.max((it.value / total) * width - 3, 6) : 0,
                backgroundColor: it.color,
                borderRadius: 5,
              }}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
};

const AccountCard: React.FC<{
  bank: any;
  share: string;
  display?: string;
  onOpen: () => void;
  onMoneyIn: () => void;
  onMoneyOut: () => void;
  onLongPress: () => void;
}> = ({ bank, share, display, onOpen, onMoneyIn, onMoneyOut, onLongPress }) => {
  const color = brandColor(bank.bankName);
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const balance = Number(bank.currentBalance) || 0;

  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onLongPress}
      delayLongPress={450}
      onPressIn={() => (scale.value = withSpring(0.97, { damping: 15, stiffness: 300 }))}
      onPressOut={() => (scale.value = withSpring(1, { damping: 15, stiffness: 300 }))}
      accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
      accessibilityLabel={`${bank.bankName}, ${bank.accountType || 'Savings'} ending ${bank.accountNumberSuffix}, balance ${inr(balance)}`}
      accessibilityHint="Opens account details. Long press to remove."
    >
      <Animated.View style={[styles.card, { backgroundColor: color }, pressStyle]}>
        <View pointerEvents="none" style={[styles.ring, { width: 220, height: 220, borderRadius: 110, right: -80, top: -100 }]} />
        <View pointerEvents="none" style={[styles.ring, { width: 140, height: 140, borderRadius: 70, right: -40, top: -60, borderColor: 'rgba(255,255,255,0.2)' }]} />

        <View style={styles.cardTop}>
          <BankIcon code={getBankCode(bank.bankName)} name={bank.bankName} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardName} numberOfLines={1}>
              {bank.bankName}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {bank.accountType || 'Savings'} •• {bank.accountNumberSuffix}
            </Text>
          </View>
          <View style={styles.sharePill}>
            <Text style={styles.shareText}>{share}</Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardLabel}>Balance</Text>
            <Text
              style={[styles.cardBalance, { fontFamily: display, fontWeight: display ? undefined : '800' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {balance < 0 ? '−' : ''}
              {inr(balance)}
            </Text>
          </View>
          <View style={styles.cardActions}>
            <Pressable
              onPress={(e) => {
                e?.stopPropagation?.();
                onMoneyIn();
              }}
              hitSlop={6}
              style={({ pressed }) => [styles.actionGhost, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel={`Add money in to ${bank.bankName}`}
            >
              <Feather name="arrow-down-left" size={18} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={(e) => {
                e?.stopPropagation?.();
                onMoneyOut();
              }}
              hitSlop={6}
              style={({ pressed }) => [styles.actionSolid, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel={`Add money out from ${bank.bankName}`}
            >
              <Feather name="arrow-up-right" size={18} color={color} />
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
};

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export interface BanksScreenProps {
  AppTopBarComponent?: React.ComponentType<{ onOpenAddBank?: () => void }>;
  AddBankModalComponent?: React.ComponentType<{ visible: boolean; onClose: () => void; onSuccess: () => void }>;
}

export const BanksScreen: React.FC<BanksScreenProps> = ({ AppTopBarComponent, AddBankModalComponent = AddBankModal }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { sync } = useSyncDb();
  const { width } = useWindowDimensions();

  const bankProfiles = useBankStore((s) => s.bankProfiles);
  const activeBankModalId = useBankStore((s) => s.activeBankModalId);
  const setActiveBankModalId = useBankStore((s) => s.setActiveBankModalId);

  const [addBankVisible, setAddBankVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const heading = { fontFamily: display, fontWeight: display ? undefined : ('800' as const) };
  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;

  // Space for the floating tab bar
  const tabOffset = Platform.OS === 'web' ? 18 : Math.max(insets.bottom + (Platform.OS === 'ios' ? 4 : 8), 16);
  const bottomSpace = tabOffset + (width < 380 ? 58 : 64) + 24;

  const sorted = useMemo(
    () => [...bankProfiles].sort((a, b) => (Number(b.currentBalance) || 0) - (Number(a.currentBalance) || 0)),
    [bankProfiles]
  );
  const total = useMemo(() => sorted.reduce((s, b) => s + (Number(b.currentBalance) || 0), 0), [sorted]);
  const positiveTotal = useMemo(() => sorted.reduce((s, b) => s + Math.max(0, Number(b.currentBalance) || 0), 0), [sorted]);
  const animatedTotal = useCountUp(total);

  const whole = Math.floor(Math.abs(animatedTotal)).toLocaleString('en-IN');
  const paise = (Math.abs(total) % 1).toFixed(2).slice(1);

  const shareItems = sorted.map((b) => ({
    id: b.id,
    value: Math.max(0, Number(b.currentBalance) || 0),
    color: brandColor(b.bankName),
    label: shortName(b.bankName),
  }));

  useFocusEffect(
    useCallback(() => {
      sync();
      if (Platform.OS === 'android') {
        smsCatchupService.reconcile(false, smsCatchupService.getDynamicStartupLookback()).catch(() => { });
      }
    }, [sync])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await smsCatchupService.reconcile(true, 10 / 60).catch(() => { });
      await sync();
    } finally {
      setRefreshing(false);
    }
  }, [sync]);

  const removeBank = (bank: any) => {
    showGlobalConfirm({
      title: `Remove ${shortName(bank.bankName)} •• ${bank.accountNumberSuffix}?`,
      message: 'This account will stop syncing and disappear from your totals. Past transactions stay in your history.',
      confirmText: 'Remove account',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: async () => {
        useBankStore.getState().removeBankProfileState(bank.id);
        try {
          const token = authService.getAccessToken();
          await fetch(`${getBackendUrl()}/sync/bank-profile/${bank.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          });
          await sync();
        } catch (e: any) {
          console.warn('[Banks] Remove error:', e?.message);
        }
      },
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: Math.max(insets.top, 16) + 8,
          paddingBottom: bottomSpace,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#16A34A" colors={['#16A34A']} />}
      >
        {/* ---------------- Header ---------------- */}
        <View style={styles.titleRow}>
          <Text style={[styles.pageTitle, { color: ink }, heading]}>Banks</Text>
          <Pressable
            onPress={() => setAddBankVisible(true)}
            style={({ pressed }) => [styles.plus, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.94 }] }]}
            accessibilityRole="button"
            accessibilityLabel="Link another account"
          >
            <Feather name="plus" size={18} color={accentFg} />
          </Pressable>
        </View>

        {sorted.length === 0 ? (
          /* ---------------- Empty ---------------- */
          <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyWrap}>
            <View style={[styles.emptyCard, { borderColor: isDark ? '#2B4A3B' : '#9DB2A7' }]}>
              <View style={[styles.emptyIcon, { backgroundColor: isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8' }]}>
                <Feather name="credit-card" size={24} color={isDark ? LIME : FOREST} />
              </View>
              <Text style={[styles.emptyTitle, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                Link your first account
              </Text>
              <Text style={[styles.emptyText, { color: muted }]}>
                See your balance here and track spending from bank messages automatically.
              </Text>
              <Pressable
                onPress={() => setAddBankVisible(true)}
                style={({ pressed }) => [styles.emptyBtn, { backgroundColor: isDark ? LIME : FOREST }, pressed && { transform: [{ scale: 0.98 }] }]}
                accessibilityRole="button"
              >
                <Feather name="plus" size={16} color={isDark ? FOREST : LIME} />
                <Text style={[styles.emptyBtnText, { color: isDark ? FOREST : LIME }]}>Link account</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : (
          <>
            {/* ---------------- Total ---------------- */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.totalRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.totalLabel, { color: muted }]}>Total balance</Text>
                <View style={styles.totalAmountRow}>
                  <Text style={[styles.totalAmount, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                    {total < 0 ? '−' : ''}₹{whole}
                  </Text>
                  <Text style={[styles.totalPaise, { color: muted, fontFamily: display }]}>{paise}</Text>
                </View>
                <Text style={[styles.totalSub, { color: muted }]}>
                  Across {sorted.length} account{sorted.length > 1 ? 's' : ''}
                </Text>
              </View>
            </Animated.View>

            {/* ---------------- Where it sits ---------------- */}
            {sorted.length > 1 && positiveTotal > 0 && (
              <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.shareWrap}>
                <ShareBar items={shareItems} total={positiveTotal} track={isDark ? '#1E3329' : '#E3EAE6'} />
                <View style={styles.legend}>
                  {shareItems.map((it) => (
                    <View key={it.id} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: it.color }]} />
                      <Text style={[styles.legendText, { color: muted }]} numberOfLines={1}>
                        {it.label} {sharePct(it.value, positiveTotal)}
                      </Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* ---------------- Accounts ---------------- */}
            <View style={styles.cards}>
              {sorted.map((bank, i) => (
                <Animated.View key={bank.id} entering={FadeInDown.delay(140 + i * 80).duration(420)}>
                  <AccountCard
                    bank={bank}
                    share={sharePct(Math.max(0, Number(bank.currentBalance) || 0), positiveTotal)}
                    display={display}
                    onOpen={() => setActiveBankModalId(bank.id)}
                    onMoneyIn={() => navigation.navigate('ManualTransaction', { bank, initialType: 'credit' })}
                    onMoneyOut={() => navigation.navigate('ManualTransaction', { bank, initialType: 'debit' })}
                    onLongPress={() => removeBank(bank)}
                  />
                </Animated.View>
              ))}

              <Animated.View entering={FadeInDown.delay(140 + sorted.length * 80).duration(420)}>
                <Pressable
                  onPress={() => setAddBankVisible(true)}
                  style={({ pressed }) => [
                    styles.linkCard,
                    { borderColor: isDark ? '#2B4A3B' : '#9DB2A7' },
                    pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(11,61,44,0.04)' },
                  ]}
                  accessibilityRole="button"
                >
                  <Feather name="plus" size={16} color={ink} />
                  <Text style={[styles.linkText, { color: ink }]}>Link another account</Text>
                </Pressable>
              </Animated.View>
            </View>
          </>
        )}
      </ScrollView>

      {AddBankModalComponent ? (
        <AddBankModalComponent
          visible={addBankVisible}
          onClose={() => setAddBankVisible(false)}
          onSuccess={async () => {
            setAddBankVisible(false);
            await sync();
          }}
        />
      ) : null}

      <BankDetailsModal
        visible={!!activeBankModalId}
        onClose={() => setActiveBankModalId(null)}
        bank={activeBankModalId ? bankProfiles.find((b) => b.id === activeBankModalId) || null : null}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  pageTitle: { fontSize: 24, letterSpacing: -0.5 },
  plus: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  totalRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 10 },
  totalLabel: { fontSize: 13, fontWeight: '600' },
  totalAmountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  totalAmount: { fontSize: 40, letterSpacing: -1.4, fontVariant: ['tabular-nums'] },
  totalPaise: { fontSize: 22, fontWeight: '700', marginLeft: 1 },
  totalSub: { fontSize: 13, marginTop: 2 },

  shareWrap: { paddingHorizontal: 20, paddingTop: 18 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '48%' },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12 },

  cards: { paddingHorizontal: 16, paddingTop: 22, gap: 12 },
  card: { height: 168, borderRadius: 26, padding: 18, overflow: 'hidden' },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  cardSub: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 2 },
  sharePill: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  shareText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  cardBottom: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 'auto', gap: 12 },
  cardLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 12 },
  cardBalance: { color: '#FFFFFF', fontSize: 30, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  cardActions: { flexDirection: 'row', gap: 8 },
  actionGhost: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  actionSolid: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },

  linkCard: {
    height: 64,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  linkText: { fontSize: 15, fontWeight: '600' },

  emptyWrap: { paddingHorizontal: 16, paddingTop: 28 },
  emptyCard: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 26, padding: 24, alignItems: 'center' },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 22, letterSpacing: -0.4, marginTop: 16, textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center', maxWidth: 280 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, paddingHorizontal: 22, borderRadius: 25, marginTop: 18 },
  emptyBtnText: { fontSize: 15, fontWeight: '700' },
});