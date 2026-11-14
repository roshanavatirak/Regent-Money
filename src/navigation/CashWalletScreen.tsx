// src/navigation/CashWalletScreen.tsx
//
// Cash wallet: set up cash in hand, add cash in / cash out (through the existing
// manual-entry screen with the Cash account picked), correct the balance, and see
// this month's cash history. Cash itself is an ordinary account (see cashService).

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Font from 'expo-font';
import { useBankStore, useTheme } from '../store';
import { getCategory } from '../constants/categories';
import { ActivityFonts, ActivityRow, relativeDay } from '../components/ActivityFeed';
import { ActivityItem, useActivityFeed } from '../hooks/useActivityFeed';
import { isExcludedFromBudget } from '../utils/budget';
import { createCashAccount, getCashProfile, setCashBalance } from '../services/cashService';
import { cashWalletItems } from '../services/cashTopups';

const FOREST = '#0B3D2C';
const FOREST_RAISED = '#124B37';
const LIME = '#B8F36B';
const MIST_INK = '#B5CEC1';

const inr = (v: number) => `₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const timeOf = (ts: number) => new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const cleanAmount = (t: string) => {
  let c = t.replace(/[^0-9.]/g, '');
  const parts = c.split('.');
  if (parts.length > 1) c = `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
  return c;
};

export const CashWalletScreen = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const bankProfiles = useBankStore((s) => s.bankProfiles);
  const cash = useMemo(() => getCashProfile(bankProfiles), [bankProfiles]);
  const { items } = useActivityFeed();

  const [opening, setOpening] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [balanceSheet, setBalanceSheet] = useState(false);
  const [newBalance, setNewBalance] = useState('');

  const font: ActivityFonts = {
    body: Font.isLoaded('Figtree_500Medium') ? 'Figtree_500Medium' : undefined,
    bodySemi: Font.isLoaded('Figtree_600SemiBold') ? 'Figtree_600SemiBold' : undefined,
    bodyBold: Font.isLoaded('Figtree_700Bold') ? 'Figtree_700Bold' : undefined,
    displayBold: Font.isLoaded('BricolageGrotesque_700Bold') ? 'BricolageGrotesque_700Bold' : undefined,
  };
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const displayStyle = { fontFamily: display, fontWeight: display ? undefined : ('800' as const) };

  const bg = isDark ? colors.background : '#F3F6F4';
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;

  // Cash entries plus ATM withdrawals the server added to the wallet (shown as cash in)
  const cashItems = useMemo(() => cashWalletItems(items, cash), [items, cash]);

  const month = useMemo(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    let moneyIn = 0;
    let moneyOut = 0;
    for (const tx of cashItems) {
      if (Number(tx.timestamp) < start.getTime()) continue;
      const amt = Math.abs(parseFloat(String(tx.amount)) || 0);
      // ATM cash is money into the wallet (it is left out of overall spending, not out of here)
      if (tx.atmTopup) {
        moneyIn += amt;
        continue;
      }
      if (isExcludedFromBudget(tx)) continue;
      if (tx.type === 'credit') moneyIn += amt;
      else moneyOut += amt;
    }
    return { moneyIn, moneyOut };
  }, [cashItems]);

  const sections = useMemo(() => {
    const out: { title: string; data: ActivityItem[] }[] = [];
    for (const tx of cashItems) {
      const title = relativeDay(Number(tx.timestamp));
      const last = out[out.length - 1];
      if (last && last.title === title) last.data.push(tx);
      else out.push({ title, data: [tx] });
    }
    return out;
  }, [cashItems]);

  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'));

  const addEntry = (type: 'credit' | 'debit') => {
    if (!cash) return;
    navigation.navigate('ManualTransaction', { bank: cash, initialType: type });
  };

  const startTracking = async (amount: number) => {
    setBusy(true);
    setError('');
    try {
      await createCashAccount(amount);
    } catch (e: any) {
      setError(e?.message || 'Could not set up cash. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const saveBalance = async () => {
    const v = parseFloat(newBalance);
    if (isNaN(v)) {
      setError('Enter the cash you have now.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await setCashBalance(v);
      setBalanceSheet(false);
    } catch (e: any) {
      setError(e?.message || 'Could not update the balance. Try again.');
    } finally {
      setBusy(false);
    }
  };

  /* ---------------- header ---------------- */

  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={[styles.backBtn, { backgroundColor: colors.card, borderColor: line }]}
      >
        <Feather name="chevron-left" size={22} color={colors.text} />
      </Pressable>
      <Text style={[styles.title, { color: colors.text }, displayStyle]}>Cash</Text>
      {cash ? (
        <Pressable
          onPress={() => {
            setNewBalance(String(cash.currentBalance ?? 0));
            setError('');
            setBalanceSheet(true);
          }}
          style={[styles.setBalance, { backgroundColor: colors.card, borderColor: line }]}
          accessibilityRole="button"
        >
          <Text style={[styles.setBalanceText, { color: accent }]}>Set balance</Text>
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}
    </View>
  );

  /* ---------------- first-time setup ---------------- */

  if (!cash) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, paddingTop: insets.top }}>
          {header}
          <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 24, flexGrow: 1 }}>
            <View style={[styles.setupIcon, { backgroundColor: isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8' }]}>
              <MaterialCommunityIcons name="cash-multiple" size={34} color={accent} />
            </View>
            <Text style={[styles.setupTitle, { color: colors.text }, displayStyle]}>Track your cash too</Text>
            <Text style={[styles.setupBody, { color: colors.textSecondary }]}>
              How much cash do you have right now? It’s added to your net worth.
            </Text>

            <View style={[styles.amountBox, { backgroundColor: colors.card, borderColor: accent }]}>
              <Text style={[styles.amountRupee, { color: colors.textTertiary }, displayStyle]}>₹</Text>
              <TextInput
                value={opening}
                onChangeText={(t) => setOpening(cleanAmount(t))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textTertiary}
                style={[styles.amountInput, { color: colors.text }, displayStyle]}
                accessibilityLabel="Cash in hand"
              />
            </View>

            <View style={styles.quickRow}>
              {[500, 1000, 2000, 5000].map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setOpening(String((parseFloat(opening) || 0) + v))}
                  style={[styles.quickChip, { backgroundColor: colors.card, borderColor: line }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${v} rupees`}
                >
                  <Text style={[styles.quickText, { color: accent }]}>+₹{v.toLocaleString('en-IN')}</Text>
                </Pressable>
              ))}
            </View>

            {!!error && <Text style={styles.error}>{error}</Text>}
            <View style={{ flex: 1 }} />

            <Pressable
              onPress={() => startTracking(parseFloat(opening) || 0)}
              disabled={busy}
              style={[styles.primary, { backgroundColor: FOREST, opacity: busy ? 0.6 : 1 }]}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color={LIME} /> : <Text style={styles.primaryText}>Start tracking cash</Text>}
            </Pressable>
            <Pressable onPress={() => startTracking(0)} disabled={busy} style={styles.secondary} accessibilityRole="button">
              <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>Skip, start at ₹0</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    );
  }

  /* ---------------- wallet ---------------- */

  const balance = Number(cash.currentBalance) || 0;

  return (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
        <View style={styles.hero}>
          <View style={[styles.heroRing, { width: 220, height: 220, borderRadius: 110, right: -80, top: -100 }]} />
          <Text style={styles.heroLabel}>Cash in hand</Text>
          <Text style={[styles.heroAmount, displayStyle]}>
            {balance < 0 ? '−' : ''}
            {inr(balance)}
          </Text>
          <View style={styles.heroRow}>
            <View style={styles.heroTile}>
              <Text style={styles.heroTileLabel}>In this month</Text>
              <Text style={[styles.heroTileValue, { color: LIME }]}>+{inr(month.moneyIn)}</Text>
            </View>
            <View style={styles.heroTile}>
              <Text style={styles.heroTileLabel}>Out this month</Text>
              <Text style={styles.heroTileValue}>−{inr(month.moneyOut)}</Text>
            </View>
          </View>
          <View style={styles.heroRow}>
            <Pressable onPress={() => addEntry('credit')} style={[styles.heroBtn, { backgroundColor: LIME }]} accessibilityRole="button">
              <Text style={[styles.heroBtnText, { color: FOREST }]}>+ Cash in</Text>
            </Pressable>
            <Pressable
              onPress={() => addEntry('debit')}
              style={[styles.heroBtn, { borderWidth: 1, borderColor: 'rgba(184,243,107,0.4)' }]}
              accessibilityRole="button"
            >
              <Text style={[styles.heroBtnText, { color: LIME }]}>− Cash out</Text>
            </Pressable>
          </View>
        </View>

        {sections.length === 0 ? (
          <Text style={[styles.empty, { color: colors.textSecondary }]}>
            No cash entries yet. Add cash in or cash out to see them here.
          </Text>
        ) : (
          sections.map((section) => (
            <View key={section.title}>
              <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{section.title.toUpperCase()}</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: line }]}>
                {section.data.map((tx, i) => (
                  <ActivityRow
                    key={tx.id || `cash_${i}`}
                    tx={tx}
                    divider={i < section.data.length - 1}
                    font={font}
                    meta={`${
                      tx.atmTopup
                        ? 'Cash from ATM'
                        : tx.type === 'credit'
                          ? 'Money received'
                          : getCategory(tx.category || 'miscellaneous').label
                    } · ${timeOf(Number(tx.timestamp))}`}
                    // An ATM row opens the bank withdrawal it came from
                    onPress={() => navigation.navigate('TransactionDetail', { transaction: tx.source ?? tx })}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={balanceSheet} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setBalanceSheet(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setBalanceSheet(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <View style={[styles.grabber, { backgroundColor: line }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }, displayStyle]}>Set cash balance</Text>
            <Text style={[styles.sheetBody, { color: colors.textSecondary }]}>
              Counted your cash? Enter what you have now. This fixes the balance and isn’t counted as spending or income.
            </Text>
            <View style={[styles.amountBox, { backgroundColor: bg, borderColor: accent, marginTop: 16 }]}>
              <Text style={[styles.amountRupee, { color: colors.textTertiary }, displayStyle]}>₹</Text>
              <TextInput
                value={newBalance}
                onChangeText={(t) => setNewBalance(cleanAmount(t))}
                keyboardType="decimal-pad"
                autoFocus
                style={[styles.amountInput, { color: colors.text }, displayStyle]}
                accessibilityLabel="Cash in hand"
              />
            </View>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              onPress={saveBalance}
              disabled={busy}
              style={[styles.primary, { backgroundColor: FOREST, marginTop: 18, opacity: busy ? 0.6 : 1 }]}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color={LIME} /> : <Text style={styles.primaryText}>Save balance</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 24, letterSpacing: -0.5 },
  setBalance: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  setBalanceText: { fontSize: 13, fontWeight: '700' },

  setupIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  setupTitle: { marginTop: 20, fontSize: 26, letterSpacing: -0.6 },
  setupBody: { marginTop: 8, fontSize: 15, lineHeight: 22 },
  amountBox: { marginTop: 22, height: 72, borderRadius: 20, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, gap: 6 },
  amountRupee: { fontSize: 30 },
  amountInput: { flex: 1, fontSize: 32, padding: 0 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  quickChip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 13, fontWeight: '700' },
  error: { marginTop: 12, fontSize: 13, color: '#C92A2A' },
  primary: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  primaryText: { fontSize: 16, fontWeight: '700', color: LIME },
  secondary: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryText: { fontSize: 14, fontWeight: '600' },

  hero: { backgroundColor: FOREST, borderRadius: 28, padding: 22, overflow: 'hidden' },
  heroRing: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(184,243,107,0.16)' },
  heroLabel: { fontSize: 14, color: MIST_INK },
  heroAmount: { marginTop: 6, fontSize: 38, color: '#FFFFFF', letterSpacing: -1.2 },
  heroRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  heroTile: { flex: 1, backgroundColor: FOREST_RAISED, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  heroTileLabel: { fontSize: 12, color: MIST_INK },
  heroTileValue: { marginTop: 4, fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  heroBtn: { flex: 1, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  heroBtnText: { fontSize: 15, fontWeight: '700' },

  sectionTitle: { marginTop: 20, marginBottom: 8, marginLeft: 4, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.6 },
  card: { borderRadius: 22, borderWidth: 1, paddingHorizontal: 16 },
  empty: { marginTop: 28, textAlign: 'center', fontSize: 14, lineHeight: 21, paddingHorizontal: 20 },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(7,17,13,0.55)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 14 },
  sheetTitle: { fontSize: 20, letterSpacing: -0.3 },
  sheetBody: { marginTop: 6, fontSize: 14, lineHeight: 21 },
});
