// src/navigation/EditBankScreen.tsx
//
// Edit an account: a live brand-card preview on top, then the fields.

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet, Platform, BackHandler } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Font from 'expo-font';
import { useTheme, useBankStore, BankProfileType } from '../store';
import { authService } from '../services/authService';
import { getBackendUrl } from '../config/api';
import { BankIcon } from '../components/BankIcon';
import { SmsSenderTagsManager } from '../components/SmsSenderTagsManager';
import { formatSmsSenderTags, parseSmsSenderTags } from '../constants/bankSmsSenders';
import { bankBrandColor, getBankCode } from '../constants/bankBrand';

const BACKEND_URL = getBackendUrl();
const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

// Still exported: AddBankModal uses the same list
export const ACCOUNT_TYPES = [
  { id: 'Savings', label: 'Savings Account', icon: 'pocket' },
  { id: 'Current', label: 'Current Account', icon: 'briefcase' },
  { id: 'Salary', label: 'Salary Account', icon: 'award' },
  { id: 'Credit Card', label: 'Credit Card Account', icon: 'credit-card' },
  { id: 'Overdraft', label: 'Overdraft (OD) Account', icon: 'repeat' },
];

export interface EditBankScreenProps {
  bank?: BankProfileType;
  returnToBankId?: string;
  onBack?: () => void;
  onSuccess?: (bank: BankProfileType) => void;
}

const toBalanceString = (v: any) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return isNaN(n) ? '' : String(Math.round(n * 100) / 100);
};

export const EditBankScreen: React.FC<EditBankScreenProps> = (props) => {
  const insets = useSafeAreaInsets();
  let navigation: any = null;
  let route: any = null;
  try {
    navigation = useNavigation<any>();
  } catch {}
  try {
    route = useRoute<any>();
  } catch {}
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const bank: BankProfileType = props.bank || route?.params?.bank;

  const [name, setName] = useState(bank?.bankName || '');
  const [accountType, setAccountType] = useState(bank?.accountType || 'Savings');
  const [suffix, setSuffix] = useState(bank?.accountNumberSuffix || '');
  const [balance, setBalance] = useState(toBalanceString(bank?.currentBalance));
  const [senderTags, setSenderTags] = useState<string[]>(parseSmsSenderTags(bank?.smsSenderId));
  const [upiId, setUpiId] = useState(bank?.upiId || '');
  const [keywords, setKeywords] = useState(bank?.customKeywords || '');
  const [moreOpen, setMoreOpen] = useState(!!(bank?.upiId || bank?.customKeywords));
  const [errorText, setErrorText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [suffixFocused, setSuffixFocused] = useState(false);
  const suffixRef = useRef<TextInput>(null);

  const handleGoBack = () => {
    if (props.onBack) {
      props.onBack();
      return;
    }
    const returnToBankId = props.returnToBankId || route?.params?.returnToBankId || bank?.id;
    if (returnToBankId) useBankStore.getState().setActiveBankModalId(returnToBankId);
    navigation?.goBack?.();
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleGoBack();
      return true;
    });
    return () => sub.remove();
  }, [props.onBack, props.returnToBankId, route?.params?.returnToBankId, bank?.id]);

  if (!bank) {
    handleGoBack();
    return null;
  }

  const dirty =
    name.trim() !== (bank.bankName || '') ||
    accountType !== (bank.accountType || 'Savings') ||
    suffix !== (bank.accountNumberSuffix || '') ||
    balance !== toBalanceString(bank.currentBalance) ||
    formatSmsSenderTags(senderTags) !== formatSmsSenderTags(parseSmsSenderTags(bank.smsSenderId)) ||
    upiId.trim() !== (bank.upiId || '') ||
    keywords.trim() !== (bank.customKeywords || '');

  const onBalanceChange = (t: string) => {
    let c = t.replace(/[^0-9.]/g, '');
    const parts = c.split('.');
    if (parts.length > 1) c = `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
    setBalance(c);
    if (errorText) setErrorText('');
  };

  const save = async () => {
    if (!dirty || saving) return;
    if (!name.trim()) return setErrorText('Add a name for this account.');
    if (!/^\d{4}$/.test(suffix)) return setErrorText('Enter the last 4 digits of the account number.');
    if (!balance.trim() || isNaN(Number(balance))) return setErrorText('Enter the current balance.');

    setErrorText('');
    setSaving(true);
    try {
      const token = authService.getAccessToken();
      if (!token) throw new Error('Sign in again to edit this account.');
      const data = {
        id: bank.id,
        bankName: name.trim(),
        accountType: accountType || 'Savings',
        accountNumberSuffix: suffix,
        currentBalance: Math.round(parseFloat(balance) * 100) / 100,
        smsSenderId: formatSmsSenderTags(senderTags) || undefined,
        upiId: upiId.trim() || undefined,
        customKeywords: keywords.trim() || undefined,
        smsConsent: bank.smsConsent !== undefined ? bank.smsConsent : true,
      };
      const response = await fetch(`${BACKEND_URL}/sync/bank-profile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Could not save your changes. Try again.');
      }
      const updated: BankProfileType = { ...bank, ...data, lastSyncTimestamp: Date.now() };
      useBankStore.getState().updateBankProfileState(updated);
      setSaved(true);
      setTimeout(() => {
        if (props.onSuccess) props.onSuccess(updated);
        else handleGoBack();
      }, 700);
    } catch (e: any) {
      setErrorText(e?.message || 'Could not save your changes. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const field = isDark ? colors.border : '#DCE5E0';
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const accentInk = isDark ? FOREST : '#FFFFFF';
  const brand = bankBrandColor(name || bank.bankName);
  const previewBalance = parseFloat(balance) || 0;
  const digits = suffix.padEnd(4, ' ').split('');

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={[s.header, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
          <Pressable onPress={handleGoBack} style={[s.roundBtn, { backgroundColor: surface }]} accessibilityLabel="Back">
            <Feather name="arrow-left" size={20} color={ink} />
          </Pressable>
          <Text style={[s.headerTitle, { color: ink }]}>Edit account</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          {/* Live preview */}
          <Animated.View entering={FadeInDown.duration(380)} style={[s.card, { backgroundColor: brand }]}>
            <View pointerEvents="none" style={[s.ring, { width: 220, height: 220, borderRadius: 110, right: -80, top: -100 }]} />
            <View pointerEvents="none" style={[s.ring, { width: 140, height: 140, borderRadius: 70, right: -40, top: -60, borderColor: 'rgba(255,255,255,0.2)' }]} />
            <View style={s.cardTop}>
              <BankIcon code={getBankCode(bank.bankName)} name={bank.bankName} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.cardName} numberOfLines={1}>{name.trim() || bank.bankName}</Text>
                <Text style={s.cardSub}>{accountType} •• {suffix || '····'}</Text>
              </View>
            </View>
            <View style={{ marginTop: 'auto' }}>
              <Text style={s.cardLabel}>Balance</Text>
              <Text style={[s.cardBalance, { fontFamily: display, fontWeight: display ? undefined : '800' }]} numberOfLines={1} adjustsFontSizeToFit>
                ₹{previewBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </Text>
            </View>
          </Animated.View>
          <Text style={[s.previewHint, { color: muted }]}>Preview updates as you edit</Text>

          <Text style={[s.label, { color: muted }]}>Account name</Text>
          <View style={[s.fieldBox, { backgroundColor: surface, borderColor: field }]}>
            <TextInput
              value={name}
              onChangeText={(t) => {
                setName(t);
                if (errorText) setErrorText('');
              }}
              placeholder="Like State Bank of India"
              placeholderTextColor={muted}
              style={[s.fieldInput, { color: ink }]}
              accessibilityLabel="Account name"
            />
          </View>

          <Text style={[s.label, { color: muted }]}>Account type</Text>
          <View style={s.chips}>
            {ACCOUNT_TYPES.map((t) => {
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
                    {t.label.replace(/\s*(\(OD\)\s*)?account$/i, '')}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[s.label, { color: muted }]}>Last 4 digits</Text>
          <Pressable onPress={() => suffixRef.current?.focus()} style={s.digitRow} accessibilityLabel="Last 4 digits">
            {digits.map((d, i) => {
              const active = suffixFocused && i === Math.min(suffix.length, 3);
              return (
                <View key={i} style={[s.digitBox, { backgroundColor: surface, borderColor: active ? accent : field, borderWidth: active ? 2 : 1 }]}>
                  <Text style={[s.digitText, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>{d.trim()}</Text>
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
              bankCodeOrName={name || bank.bankName}
              colors={colors}
              isDark={isDark}
              label="Bank SMS senders"
              hint="We read transaction alerts from these senders."
            />
          </View>

          <Pressable onPress={() => setMoreOpen((v) => !v)} style={[s.moreRow, { backgroundColor: surface, borderColor: line }]} accessibilityRole="button" accessibilityState={{ expanded: moreOpen }}>
            <Text style={[s.moreTitle, { color: ink }]}>More options</Text>
            <Text style={[s.moreHint, { color: muted }]} numberOfLines={1}>{moreOpen ? '' : 'UPI ID, matching words'}</Text>
            <Feather name={moreOpen ? 'chevron-up' : 'chevron-down'} size={16} color={muted} />
          </Pressable>

          {moreOpen && (
            <Animated.View entering={FadeInDown.duration(220)}>
              <Text style={[s.label, { color: muted }]}>UPI ID</Text>
              <View style={[s.fieldBox, { backgroundColor: surface, borderColor: field }]}>
                <Feather name="at-sign" size={16} color={muted} />
                <TextInput value={upiId} onChangeText={setUpiId} placeholder="name@okbank" placeholderTextColor={muted} autoCapitalize="none" style={[s.fieldInput, { color: ink }]} accessibilityLabel="UPI ID" />
              </View>
              <Text style={[s.hint, { color: muted }]}>Helps match UPI payment alerts.</Text>

              <Text style={[s.label, { color: muted }]}>Matching words</Text>
              <View style={[s.fieldBox, { backgroundColor: surface, borderColor: field }]}>
                <Feather name="key" size={16} color={muted} />
                <TextInput value={keywords} onChangeText={setKeywords} placeholder="salary, rent" placeholderTextColor={muted} autoCapitalize="none" style={[s.fieldInput, { color: ink }]} accessibilityLabel="Matching words" />
              </View>
              <Text style={[s.hint, { color: muted }]}>Separate with commas.</Text>
            </Animated.View>
          )}

          {errorText ? (
            <Animated.View entering={FadeIn.duration(200)} style={s.errorRow}>
              <Feather name="alert-circle" size={14} color={isDark ? '#FFA8A8' : '#C92A2A'} />
              <Text style={[s.errorText, { color: isDark ? '#FFA8A8' : '#C92A2A' }]}>{errorText}</Text>
            </Animated.View>
          ) : null}
        </ScrollView>

        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8, borderTopColor: line }]}>
          <Pressable
            onPress={save}
            disabled={!dirty || saving}
            style={({ pressed }) => [s.cta, { backgroundColor: accent, opacity: dirty ? 1 : 0.5 }, pressed && dirty && { transform: [{ scale: 0.98 }] }]}
            accessibilityRole="button"
          >
            {saving ? <ActivityIndicator color={isDark ? FOREST : LIME} /> : <Text style={[s.ctaText, { color: isDark ? FOREST : LIME }]}>{dirty ? 'Save changes' : 'No changes yet'}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {saved && (
        <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, s.savedWrap, { backgroundColor: pageBg }]}>
          <Animated.View entering={ZoomIn.springify().damping(12)} style={[s.savedCircle, { backgroundColor: FOREST }]}>
            <Feather name="check" size={40} color={LIME} />
          </Animated.View>
          <Text style={[s.savedText, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>Saved</Text>
        </Animated.View>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  card: { height: 150, borderRadius: 26, padding: 18, overflow: 'hidden', marginTop: 6 },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  cardSub: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 2 },
  cardLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 12 },
  cardBalance: { color: '#FFFFFF', fontSize: 30, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  previewHint: { textAlign: 'center', fontSize: 12, marginTop: 8 },

  label: { fontSize: 13, fontWeight: '700', paddingHorizontal: 4, paddingTop: 18, paddingBottom: 10 },
  fieldBox: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14 },
  fieldInput: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  hint: { fontSize: 12, marginTop: 6, paddingHorizontal: 4 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' },

  digitRow: { flexDirection: 'row', gap: 10 },
  digitBox: { flex: 1, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  digitText: { fontSize: 24 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },

  balanceBox: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 64, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16 },
  rupee: { fontSize: 22, fontWeight: '700' },
  balanceInput: { flex: 1, fontSize: 30, letterSpacing: -0.6, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },

  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, marginTop: 18 },
  moreTitle: { fontSize: 14, fontWeight: '600' },
  moreHint: { flex: 1, fontSize: 12, textAlign: 'right' },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 4 },
  errorText: { fontSize: 13, fontWeight: '600', flex: 1 },

  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },

  savedWrap: { alignItems: 'center', justifyContent: 'center' },
  savedCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  savedText: { fontSize: 24, marginTop: 18 },
});