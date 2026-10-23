// src/navigation/AddBankModal.tsx
//
// Link an account in two steps: choose the bank, then add the account details.
// Moved out of index.tsx. Same props as before: { visible, onClose, onSuccess }.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown, FadeInRight, ZoomIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { useTheme } from '../store';
import { authService } from '../services/authService';
import { getBackendUrl } from '../config/api';
import { BankIcon } from '../components/BankIcon';
import { SmsSenderTagsManager } from '../components/SmsSenderTagsManager';
import { getSmsSenderSuggestions, formatSmsSenderTags } from '../constants/bankSmsSenders';
import { ALL_BANKS_SORTED, POPULAR_BANKS } from '../constants/bankBrand';
import { ACCOUNT_TYPES } from './EditBankScreen';

const BACKEND_URL = getBackendUrl();
const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

export interface AddBankModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Bank = { code: string; name: string };

export const AddBankModal: React.FC<AddBankModalProps> = ({ visible, onClose, onSuccess }) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const [step, setStep] = useState<1 | 2>(1);
  const [query, setQuery] = useState('');
  const [bank, setBank] = useState<Bank | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [accountType, setAccountType] = useState('Savings');
  const [suffix, setSuffix] = useState('');
  const [balance, setBalance] = useState('');
  const [senderTags, setSenderTags] = useState<string[]>([]);
  const [upiId, setUpiId] = useState('');
  const [keywords, setKeywords] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [done, setDone] = useState(false);

  const suffixRef = useRef<TextInput>(null);
  const [suffixFocused, setSuffixFocused] = useState(false);

  const reset = () => {
    setStep(1);
    setQuery('');
    setBank(null);
    setDisplayName('');
    setAccountType('Savings');
    setSuffix('');
    setBalance('');
    setSenderTags([]);
    setUpiId('');
    setKeywords('');
    setMoreOpen(false);
    setErrorText('');
    setDone(false);
  };

  useEffect(() => {
    if (visible) reset();
  }, [visible]);

  const close = () => {
    Keyboard.dismiss();
    reset();
    onClose();
  };

  const back = () => {
    if (step === 2) {
      setStep(1);
      setErrorText('');
    } else {
      close();
    }
  };

  const pickBank = (b: Bank) => {
    setBank(b);
    setDisplayName(b.name);
    const suggestions = getSmsSenderSuggestions(b.code);
    setSenderTags(suggestions.length > 0 ? suggestions.slice(0, 4) : [`${b.code}BK`]);
    setStep(2);
    setTimeout(() => suffixRef.current?.focus(), 350);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_BANKS_SORTED;
    return ALL_BANKS_SORTED.filter((b) => b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q));
  }, [query]);

  const onBalanceChange = (t: string) => {
    let c = t.replace(/[^0-9.]/g, '');
    const parts = c.split('.');
    if (parts.length > 1) c = `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
    setBalance(c);
    if (errorText) setErrorText('');
  };

  const submit = async () => {
    if (!displayName.trim()) return setErrorText('Add a name for this account.');
    if (!/^\d{4}$/.test(suffix)) return setErrorText('Enter the last 4 digits of the account number.');
    if (!balance.trim() || isNaN(Number(balance))) return setErrorText('Enter the current balance.');

    setErrorText('');
    setSubmitting(true);
    try {
      const token = authService.getAccessToken();
      if (!token) throw new Error('Sign in again to link an account.');

      const response = await fetch(`${BACKEND_URL}/sync/bank-profile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'bank_' + Math.random().toString(36).slice(2, 11),
          bankName: displayName.trim(),
          accountType: accountType || 'Savings',
          accountNumberSuffix: suffix,
          currentBalance: Math.round(parseFloat(balance) * 100) / 100,
          smsSenderId: formatSmsSenderTags(senderTags) || undefined,
          upiId: upiId.trim() || undefined,
          customKeywords: keywords.trim() || undefined,
          smsConsent: true,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Could not link this account. Try again.');
      }
      Keyboard.dismiss();
      setDone(true);
      setTimeout(() => {
        reset();
        onSuccess();
      }, 900);
    } catch (e: any) {
      setErrorText(e?.message || 'Could not link this account. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const field = isDark ? colors.border : '#DCE5E0';
  const accent = isDark ? LIME : FOREST;
  const accentInk = isDark ? FOREST : '#FFFFFF';

  /* ---------------- Step 1: choose bank ---------------- */

  const renderPopular = () =>
    query.trim() ? null : (
      <View>
        <Text style={[s.label, { color: muted }]}>Popular</Text>
        <View style={s.grid}>
          {POPULAR_BANKS.map((b, i) => (
            <Animated.View key={b.code} entering={FadeInDown.delay(i * 25).duration(300)} style={s.gridCell}>
              <Pressable
                onPress={() => pickBank(b)}
                style={({ pressed }) => [s.gridItem, pressed && { transform: [{ scale: 0.94 }] }]}
                accessibilityRole="button"
                accessibilityLabel={b.name}
              >
                <View style={[s.logoRing, { borderColor: line, backgroundColor: '#FFFFFF' }]}>
                  <BankIcon code={b.code} name={b.name} size={52} />
                </View>
                <Text style={[s.gridLabel, { color: ink }]} numberOfLines={1}>
                  {b.short}
                </Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>
        <Text style={[s.label, { color: muted, marginTop: 8 }]}>All banks</Text>
      </View>
    );

  const step1 = (
    <View style={{ flex: 1 }}>
      <View style={s.headPad}>
        <Text style={[s.title, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>Link an account</Text>
        <Text style={[s.subtitle, { color: muted }]}>Pick your bank to start tracking its balance.</Text>
        <View style={[s.search, { backgroundColor: surface, borderColor: field }]}>
          <Feather name="search" size={17} color={muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${ALL_BANKS_SORTED.length.toLocaleString('en-IN')} banks`}
            placeholderTextColor={muted}
            style={[s.searchInput, { color: ink }]}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search banks"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
              <Feather name="x-circle" size={16} color={muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(b, i) => `${b.code}_${i}`}
        ListHeaderComponent={renderPopular}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        initialNumToRender={30}
        maxToRenderPerBatch={40}
        windowSize={10}
        getItemLayout={(_, index) => ({ length: 62, offset: 62 * index, index })}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 16) + 16 }}
        ListEmptyComponent={
          <Text style={[s.empty, { color: muted }]}>No bank called “{query.trim()}”. Check the spelling.</Text>
        }
        renderItem={({ item, index }) => {
          const first = index === 0;
          const last = index === filtered.length - 1;
          return (
            <Pressable
              onPress={() => pickBank(item)}
              style={({ pressed }) => [
                s.bankRow,
                {
                  backgroundColor: surface,
                  borderColor: line,
                  borderTopWidth: first ? 1 : 0,
                  borderBottomWidth: last ? 1 : 0,
                  borderTopLeftRadius: first ? 20 : 0,
                  borderTopRightRadius: first ? 20 : 0,
                  borderBottomLeftRadius: last ? 20 : 0,
                  borderBottomRightRadius: last ? 20 : 0,
                },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
            >
              <BankIcon code={item.code} name={item.name} size={38} />
              <View style={[s.bankRowBody, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.bankName, { color: ink }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[s.bankCode, { color: muted }]}>{item.code}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={muted} />
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );

  /* ---------------- Step 2: account details ---------------- */

  const digits = suffix.padEnd(4, ' ').split('');
  const step2 = bank && (
    <Animated.View entering={FadeInRight.duration(260)} style={{ flex: 1 }}>
      <View style={[s.headPad, s.step2Head]}>
        <Pressable onPress={back} style={[s.roundBtn, { backgroundColor: surface }]} accessibilityLabel="Back to banks">
          <Feather name="arrow-left" size={18} color={ink} />
        </Pressable>
        <BankIcon code={bank.code} name={bank.name} size={40} />
        <Text style={[s.step2Title, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]} numberOfLines={2}>
          {bank.name}
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
      >
        <Text style={[s.label, { color: muted }]}>Account type</Text>
        <View style={s.chips}>
          {ACCOUNT_TYPES.map((t: any) => {
            const on = accountType === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setAccountType(t.id)}
                style={[s.chip, on ? { backgroundColor: accent, borderColor: accent } : { backgroundColor: surface, borderColor: field }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={[s.chipText, { color: on ? accentInk : ink }, on && { fontWeight: '700' }]}>
                  {String(t.label).replace(/\s*account$/i, '')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[s.label, { color: muted }]}>Last 4 digits of account number</Text>
        <Pressable onPress={() => suffixRef.current?.focus()} style={s.digitRow} accessibilityLabel="Last 4 digits">
          {digits.map((d, i) => {
            const active = suffixFocused && i === Math.min(suffix.length, 3);
            return (
              <View
                key={i}
                style={[
                  s.digitBox,
                  { backgroundColor: surface, borderColor: active ? accent : field, borderWidth: active ? 2 : 1 },
                ]}
              >
                <Text style={[s.digitText, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                  {d.trim()}
                </Text>
              </View>
            );
          })}
          <TextInput
            ref={suffixRef}
            value={suffix}
            onChangeText={(t) => {
              setSuffix(t.replace(/\D/g, '').slice(0, 4));
              if (errorText) setErrorText('');
            }}
            onFocus={() => setSuffixFocused(true)}
            onBlur={() => setSuffixFocused(false)}
            keyboardType="number-pad"
            maxLength={4}
            caretHidden
            style={s.hiddenInput}
            accessibilityLabel="Last 4 digits of account number"
          />
        </Pressable>

        <Text style={[s.label, { color: muted }]}>Current balance</Text>
        <View style={[s.balanceBox, { backgroundColor: surface, borderColor: field }]}>
          <Text style={[s.rupee, { color: muted, fontFamily: display }]}>₹</Text>
          <TextInput
            value={balance}
            onChangeText={onBalanceChange}
            placeholder="0"
            placeholderTextColor={muted}
            keyboardType="decimal-pad"
            style={[s.balanceInput, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}
            accessibilityLabel="Current balance in rupees"
          />
        </View>

        <View style={{ marginTop: 18 }}>
          <SmsSenderTagsManager
            tags={senderTags}
            onChangeTags={setSenderTags}
            bankCodeOrName={bank.code || displayName}
            colors={colors}
            isDark={isDark}
            label="Bank SMS senders"
            hint="We read transaction alerts from these senders."
          />
        </View>

        {/* More options */}
        <Pressable
          onPress={() => setMoreOpen((v) => !v)}
          style={[s.moreRow, { backgroundColor: surface, borderColor: line }]}
          accessibilityRole="button"
          accessibilityState={{ expanded: moreOpen }}
        >
          <Text style={[s.moreTitle, { color: ink }]}>More options</Text>
          <Text style={[s.moreHint, { color: muted }]} numberOfLines={1}>
            {moreOpen ? '' : 'Name, UPI ID, keywords'}
          </Text>
          <Feather name={moreOpen ? 'chevron-up' : 'chevron-down'} size={16} color={muted} />
        </Pressable>

        {moreOpen && (
          <Animated.View entering={FadeInDown.duration(220)}>
            {[
              { label: 'Account name', value: displayName, set: setDisplayName, placeholder: 'Like Kotak Salary', icon: 'type' },
              { label: 'UPI ID', value: upiId, set: setUpiId, placeholder: 'name@okbank', icon: 'at-sign', hint: 'Helps match UPI payment alerts.' },
              { label: 'Matching words', value: keywords, set: setKeywords, placeholder: 'salary, rent', icon: 'key', hint: 'Separate with commas.' },
            ].map((f) => (
              <View key={f.label}>
                <Text style={[s.label, { color: muted }]}>{f.label}</Text>
                <View style={[s.fieldBox, { backgroundColor: surface, borderColor: field }]}>
                  <Feather name={f.icon as any} size={16} color={muted} />
                  <TextInput
                    value={f.value}
                    onChangeText={f.set}
                    placeholder={f.placeholder}
                    placeholderTextColor={muted}
                    autoCapitalize={f.label === 'UPI ID' ? 'none' : 'sentences'}
                    style={[s.fieldInput, { color: ink }]}
                    accessibilityLabel={f.label}
                  />
                </View>
                {f.hint ? <Text style={[s.fieldHint, { color: muted }]}>{f.hint}</Text> : null}
              </View>
            ))}
          </Animated.View>
        )}

        {errorText ? (
          <Animated.View entering={FadeIn.duration(200)} style={s.errorRow}>
            <Feather name="alert-circle" size={14} color={isDark ? '#FFA8A8' : '#C92A2A'} />
            <Text style={[s.errorText, { color: isDark ? '#FFA8A8' : '#C92A2A' }]}>{errorText}</Text>
          </Animated.View>
        ) : null}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8, backgroundColor: pageBg }]}>
        <Pressable
          onPress={submit}
          disabled={submitting}
          style={({ pressed }) => [s.cta, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.98 }] }]}
          accessibilityRole="button"
        >
          {submitting ? <ActivityIndicator color={isDark ? FOREST : LIME} /> : <Text style={[s.ctaText, { color: isDark ? FOREST : LIME }]}>Link account</Text>}
        </Pressable>
      </View>
    </Animated.View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={back}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        <View style={[s.sheet, { backgroundColor: pageBg, height: height * 0.92 }]}>
          <View style={[s.grabber, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#C9D4CE' }]} />
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            {step === 1 ? step1 : step2}
          </KeyboardAvoidingView>

          {done && bank && (
            <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, s.doneWrap, { backgroundColor: pageBg }]}>
              <Animated.View entering={ZoomIn.springify().damping(12)}>
                <View style={[s.doneLogo, { borderColor: accent }]}>
                  <BankIcon code={bank.code} name={bank.name} size={72} />
                </View>
                <View style={[s.doneCheck, { backgroundColor: accent, borderColor: pageBg }]}>
                  <Feather name="check" size={16} color={accentInk} />
                </View>
              </Animated.View>
              <Text style={[s.doneTitle, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                Account linked
              </Text>
              <Text style={[s.doneSub, { color: muted }]}>{displayName} •• {suffix}</Text>
            </Animated.View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, overflow: 'hidden', width: '100%', maxWidth: 640, alignSelf: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },

  headPad: { paddingHorizontal: 20, paddingBottom: 6 },
  title: { fontSize: 24, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, marginTop: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, marginTop: 16 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },

  label: { fontSize: 13, fontWeight: '700', paddingHorizontal: 4, paddingTop: 20, paddingBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  gridCell: { width: '25%' },
  gridItem: { alignItems: 'center', gap: 8 },
  logoRing: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  gridLabel: { fontSize: 12, fontWeight: '600', maxWidth: 80, textAlign: 'center' },

  bankRow: { height: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, borderLeftWidth: 1, borderRightWidth: 1 },
  bankRowBody: { flex: 1, height: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 14 },
  bankName: { fontSize: 15, fontWeight: '600' },
  bankCode: { fontSize: 12, marginTop: 2 },
  empty: { textAlign: 'center', fontSize: 14, paddingTop: 32 },

  step2Head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  roundBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  step2Title: { flex: 1, fontSize: 20, letterSpacing: -0.3 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' },

  digitRow: { flexDirection: 'row', gap: 10 },
  digitBox: { flex: 1, height: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  digitText: { fontSize: 26 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },

  balanceBox: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 66, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16 },
  rupee: { fontSize: 22, fontWeight: '700' },
  balanceInput: { flex: 1, fontSize: 30, letterSpacing: -0.6, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },

  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 54, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, marginTop: 20 },
  moreTitle: { fontSize: 14, fontWeight: '600' },
  moreHint: { flex: 1, fontSize: 12, textAlign: 'right' },
  fieldBox: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14 },
  fieldInput: { flex: 1, fontSize: 15, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  fieldHint: { fontSize: 12, marginTop: 6, paddingHorizontal: 4 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 4 },
  errorText: { fontSize: 13, fontWeight: '600', flex: 1 },

  footer: { paddingHorizontal: 16, paddingTop: 10 },
  cta: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },

  doneWrap: { alignItems: 'center', justifyContent: 'center' },
  doneLogo: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#FFFFFF' },
  doneCheck: { position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 24, marginTop: 20 },
  doneSub: { fontSize: 14, marginTop: 4 },
});