// src/navigation/LinkDebitCardScreen.tsx
//
// Link (or edit) a debit card on a bank account. Only the card's last 4 digits are
// collected; they appear live on a realistic card as the user types.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  BackHandler,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Font from 'expo-font';
import { useTheme, useBankStore, useNotificationStore, BankProfileType } from '../store';
import { authService } from '../services/authService';
import { notificationService } from '../services/notificationService';
import { getBackendUrl } from '../config/api';
import { BankIcon } from '../components/BankIcon';
import { bankBrandColor, getBankCode } from '../constants/bankBrand';

const BACKEND_URL = getBackendUrl();
const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
const CARD_RATIO = 1.586; // ISO/IEC 7810 ID-1, the size of every bank card

export interface LinkDebitCardParams {
  /** Account the card belongs to. */
  bankId?: string;
  /** Other accounts the card could belong to (from a detection notification). */
  bankIds?: string[];
  /** Existing card being edited. */
  cardSuffix?: string;
  /** Card last-4 seen in a bank SMS. */
  suggestedSuffix?: string;
  /** Detection notification to resolve once the card is linked. */
  notificationId?: string;
}

export interface LinkDebitCardScreenProps extends LinkDebitCardParams {
  onBack?: () => void;
  onSuccess?: (bank: BankProfileType) => void;
}

/** Blends a hex colour toward black; amount 0..1. */
const shade = (hex: string, amount: number) => {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
};

const shortBankName = (name?: string) =>
  (name || 'Bank')
    .replace(/\b(?:mahindra|bank|limited|ltd|of india)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || name || 'Bank';

export const LinkDebitCardScreen: React.FC<LinkDebitCardScreenProps> = (props) => {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  let navigation: any = null;
  let route: any = null;
  try {
    navigation = useNavigation<any>();
  } catch {}
  try {
    route = useRoute<any>();
  } catch {}
  const params: LinkDebitCardParams = { ...(route?.params || {}), ...props };
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const bankProfiles = useBankStore((s) => s.bankProfiles);
  const choices = useMemo(() => {
    const ids = params.bankIds?.length ? params.bankIds : params.bankId ? [params.bankId] : [];
    return ids.map((id) => bankProfiles.find((b) => b.id === id)).filter(Boolean) as BankProfileType[];
  }, [bankProfiles, params.bankId, params.bankIds]);

  const [bankId, setBankId] = useState(params.bankId || choices[0]?.id);
  const bank = bankProfiles.find((b) => b.id === bankId) || choices[0];

  const isEdit = !!params.cardSuffix;
  const [digits, setDigits] = useState(params.cardSuffix || '');
  const [focused, setFocused] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const goBack = () => {
    if (props.onBack) return props.onBack();
    navigation?.goBack?.();
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  }, []);

  // Card motion: a small tilt per keystroke and a sheen that sweeps as digits fill in
  const tilt = useSharedValue(0);
  const sheen = useSharedValue(0);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${tilt.value}deg` }, { rotateX: `${Math.abs(tilt.value) * 0.4}deg` }],
  }));
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -220 + sheen.value * 120 }, { rotate: '20deg' }],
  }));

  useEffect(() => {
    sheen.value = withTiming(digits.length, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [digits.length]);

  const onChangeDigits = (t: string) => {
    const next = t.replace(/\D/g, '').slice(0, 4);
    if (next.length > digits.length) {
      const dir = next.length % 2 ? -1 : 1;
      tilt.value = withSequence(withTiming(4 * dir, { duration: 110 }), withSpring(0, { damping: 9, stiffness: 140 }));
    }
    setDigits(next);
    if (errorText) setErrorText('');
  };

  if (!bank) {
    return null;
  }

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const line = isDark ? colors.border : '#D3DBD6';
  const accent = isDark ? LIME : FOREST;
  const ctaBg = isDark ? LIME : FOREST;
  const ctaFg = isDark ? FOREST : LIME;

  const brand = bankBrandColor(bank.bankName);
  const cardWidth = Math.min(screenWidth - 48, 340);
  const cardHeight = cardWidth / CARD_RATIO;
  const complete = digits.length === 4;
  const seenInSms = !!params.suggestedSuffix && digits === params.suggestedSuffix;
  const existing = bank.debitCardSuffixes || [];
  const unchanged = isEdit && digits === params.cardSuffix;

  const persist = async (cards: string[]) => {
    const token = authService.getAccessToken();
    if (!token) throw new Error('Sign in again to update this account.');
    const response = await fetch(`${BACKEND_URL}/sync/bank-profile/${bank.id}/debit-cards`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardSuffixes: cards }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Could not save this card. Try again.');
    }
    const updated: BankProfileType = { ...bank, debitCardSuffixes: cards };
    useBankStore.getState().updateBankProfileState(updated);
    return updated;
  };

  const save = async () => {
    if (saving || saved) return;
    if (!complete) {
      setErrorText('Enter all 4 digits.');
      inputRef.current?.focus();
      return;
    }
    if (unchanged) return goBack();
    if (!isEdit && existing.includes(digits)) {
      setErrorText('This card is already linked to this account.');
      return;
    }
    setErrorText('');
    setSaving(true);
    try {
      const cards = isEdit ? existing.map((c) => (c === params.cardSuffix ? digits : c)) : [...existing, digits];
      const updated = await persist(Array.from(new Set(cards)));
      if (params.notificationId) {
        notificationService.markAsRead(params.notificationId).catch(() => {});
        useNotificationStore.getState().resolveNotificationState?.(params.notificationId, 'linked');
      }
      setSaved(true);
      setTimeout(() => {
        if (props.onSuccess) props.onSuccess(updated);
        else goBack();
      }, 900);
    } catch (e: any) {
      setErrorText(e?.message || 'Could not save this card. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    Alert.alert(`Remove card ••${params.cardSuffix}?`, 'Spends on this card will go to review instead of this account.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            const updated = await persist(existing.filter((c) => c !== params.cardSuffix));
            if (props.onSuccess) props.onSuccess(updated);
            else goBack();
          } catch (e: any) {
            setErrorText(e?.message || 'Could not remove this card. Try again.');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={s.headerRow}>
            <Pressable onPress={goBack} hitSlop={12} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
              <Feather name="chevron-left" size={26} color={ink} />
            </Pressable>
          </View>
          <View style={s.titleWrap}>
            <Text style={[s.title, { color: ink, fontFamily: display }]}>{isEdit ? 'Edit debit card' : 'Link debit card'}</Text>
            <Text style={[s.subtitle, { color: muted }]} numberOfLines={1}>
              {bank.bankName} · {bank.accountType || 'Savings'} ••{bank.accountNumberSuffix}
            </Text>
          </View>

          {choices.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceRow}>
              {choices.map((c) => {
                const active = c.id === bank.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setBankId(c.id)}
                    style={[s.choice, { borderColor: active ? accent : line, backgroundColor: active ? (isDark ? 'rgba(184,243,107,0.12)' : '#E8F8D2') : 'transparent' }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[s.choiceText, { color: active ? accent : muted }]}>
                      {c.accountType || 'Savings'} ••{c.accountNumberSuffix}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {/* Card */}
          <View style={s.stage}>
            <Animated.View
              entering={FadeInDown.duration(500)}
              style={[s.cardShadow, { width: cardWidth, height: cardHeight, shadowColor: shade(brand, 0.6) }, cardStyle]}
            >
              <LinearGradient
                colors={[shade(brand, 0.55), shade(brand, 0.82), shade(brand, 0.66)]}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[s.card, { width: cardWidth, height: cardHeight }]}
              >
                {/* Engraved rings */}
                {[260, 200, 140].map((d, i) => (
                  <View
                    key={d}
                    style={[s.ring, { width: d, height: d, borderRadius: d / 2, right: -d / 2.6, top: -d / 2.4, opacity: 0.06 + i * 0.03 }]}
                  />
                ))}
                <Animated.View pointerEvents="none" style={[s.sheen, { height: cardHeight * 2 }, sheenStyle]}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>

                <View style={s.cardTop}>
                  <View style={s.brandRow}>
                    <BankIcon code={getBankCode(bank.bankName)} name={bank.bankName} size={28} />
                    <Text style={s.brandName} numberOfLines={1}>{shortBankName(bank.bankName)}</Text>
                  </View>
                  <Text style={s.debitTag}>DEBIT</Text>
                </View>

                <View style={s.chipRow}>
                  <LinearGradient
                    colors={['#EBD9A6', '#B8995A', '#E2CC8F', '#A88A4E']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.chip}
                  >
                    <View style={[s.chipLine, { top: 9, left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
                    <View style={[s.chipLine, { top: 18, left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
                    <View style={[s.chipLine, { left: 12, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
                    <View style={[s.chipLine, { left: 24, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
                  </LinearGradient>
                  <MaterialCommunityIcons name="contactless-payment" size={20} color="rgba(255,255,255,0.55)" />
                </View>

                <View style={s.numberRow} accessibilityLabel={`Card ending ${digits || 'not entered'}`}>
                  {[0, 1, 2].map((g) => (
                    <Text key={g} style={[s.numberGroup, s.numberMasked]}>••••</Text>
                  ))}
                  <View style={{ flexDirection: 'row' }}>
                    {[0, 1, 2, 3].map((i) =>
                      digits[i] ? (
                        <Animated.Text key={`${i}-${digits[i]}`} entering={FadeInDown.duration(260)} style={[s.numberGroup, s.digit]}>
                          {digits[i]}
                        </Animated.Text>
                      ) : (
                        <Text key={`${i}-empty`} style={[s.numberGroup, s.digit, s.numberMasked]}>•</Text>
                      )
                    )}
                  </View>
                </View>

                <View style={s.cardBottom}>
                  <Text style={s.cardStatus}>{complete ? `CARD ••${digits}` : 'ENTER LAST 4 DIGITS'}</Text>
                  {seenInSms && (
                    <Animated.View entering={FadeIn.duration(300)} style={s.verified}>
                      <Feather name="check-circle" size={11} color={LIME} />
                      <Text style={s.verifiedText}>Seen in SMS</Text>
                    </Animated.View>
                  )}
                </View>
              </LinearGradient>
            </Animated.View>
          </View>

          {/* Input */}
          <View style={s.inputWrap}>
            <Text style={[s.label, { color: muted }]}>Last 4 digits</Text>
            <Pressable onPress={() => inputRef.current?.focus()} style={s.slots} accessibilityRole="button" accessibilityLabel="Enter last 4 digits">
              {[0, 1, 2, 3].map((i) => {
                const filled = !!digits[i];
                const current = focused && i === Math.min(digits.length, 3) && !(i === 3 && complete);
                return (
                  <View key={i} style={[s.slot, { borderBottomColor: filled || current ? accent : line, borderBottomWidth: filled || current ? 2 : 1 }]}>
                    {filled ? (
                      <Text style={[s.slotText, { color: ink, fontFamily: display }]}>{digits[i]}</Text>
                    ) : current ? (
                      <View style={[s.caret, { backgroundColor: accent }]} />
                    ) : null}
                  </View>
                );
              })}
            </Pressable>
            <TextInput
              ref={inputRef}
              value={digits}
              onChangeText={onChangeDigits}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus={!params.suggestedSuffix}
              caretHidden
              style={s.hiddenInput}
              accessibilityLabel="Last 4 digits of your debit card"
            />

            {!!params.suggestedSuffix && !isEdit && digits !== params.suggestedSuffix && (
              <Animated.View entering={FadeIn.duration(250)} style={[s.suggest, { borderColor: line, backgroundColor: isDark ? colors.card : '#FFFFFF' }]}>
                <Text style={[s.suggestText, { color: muted }]}>
                  Seen in your SMS · <Text style={{ color: ink, fontWeight: '600' }}>XX{params.suggestedSuffix}</Text>
                </Text>
                <Pressable
                  onPress={() => onChangeDigits(params.suggestedSuffix!)}
                  style={[s.usePill, { backgroundColor: isDark ? 'rgba(184,243,107,0.14)' : '#E8F8D2' }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Use card ending ${params.suggestedSuffix}`}
                >
                  <Text style={[s.usePillText, { color: accent }]}>Use</Text>
                </Pressable>
              </Animated.View>
            )}

            {!!errorText && <Text style={s.error}>{errorText}</Text>}
          </View>

          <View style={{ flex: 1 }} />

          {/* Footer */}
          <View style={s.footer}>
            <View style={s.privacy}>
              <Feather name="lock" size={12} color={muted} />
              <Text style={[s.privacyText, { color: muted }]}>We store only these 4 digits</Text>
            </View>
            <Pressable
              onPress={save}
              disabled={saving}
              style={[s.cta, { backgroundColor: ctaBg, opacity: complete || saved ? 1 : 0.35 }]}
              accessibilityRole="button"
              accessibilityLabel={isEdit ? 'Save changes' : 'Link card'}
            >
              {saving ? (
                <ActivityIndicator color={ctaFg} />
              ) : saved ? (
                <Animated.View entering={FadeIn.duration(200)} style={s.ctaRow}>
                  <Feather name="check" size={18} color={ctaFg} />
                  <Text style={[s.ctaText, { color: ctaFg }]}>{isEdit ? 'Saved' : 'Card linked'}</Text>
                </Animated.View>
              ) : (
                <Text style={[s.ctaText, { color: ctaFg }]}>{isEdit ? 'Save changes' : 'Link card'}</Text>
              )}
            </Pressable>
            {isEdit && !saved && (
              <Pressable onPress={remove} disabled={saving} hitSlop={8} style={s.removeBtn} accessibilityRole="button">
                <Text style={[s.removeText, { color: muted }]}>Remove card</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default LinkDebitCardScreen;

const s = StyleSheet.create({
  headerRow: { paddingHorizontal: 12, height: 44, justifyContent: 'center' },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  titleWrap: { paddingHorizontal: 24, marginTop: 4 },
  title: { fontSize: 28, letterSpacing: -0.6 },
  subtitle: { fontSize: 14, marginTop: 6 },
  choiceRow: { paddingHorizontal: 24, gap: 8, paddingTop: 16 },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  choiceText: { fontSize: 13, fontWeight: '600' },

  stage: { alignItems: 'center', paddingTop: 32 },
  cardShadow: {
    borderRadius: 16,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.45,
    shadowRadius: 22,
    elevation: 14,
  },
  card: { borderRadius: 16, overflow: 'hidden', paddingHorizontal: 20, paddingVertical: 16, justifyContent: 'space-between' },
  ring: { position: 'absolute', borderWidth: 1, borderColor: '#FFFFFF' },
  sheen: { position: 'absolute', top: '-50%', left: 0, width: 90 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  brandName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', letterSpacing: -0.2, flexShrink: 1 },
  debitTag: { color: 'rgba(255,255,255,0.6)', fontSize: 10, letterSpacing: 2.4, fontWeight: '600' },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chip: { width: 38, height: 28, borderRadius: 6, overflow: 'hidden' },
  chipLine: { position: 'absolute', backgroundColor: 'rgba(80,60,20,0.55)' },
  numberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  numberGroup: {
    color: '#F2F4F7',
    fontSize: 18,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  numberMasked: { color: 'rgba(255,255,255,0.42)' },
  digit: { width: 14, textAlign: 'center', letterSpacing: 0 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 16 },
  cardStatus: { color: 'rgba(255,255,255,0.6)', fontSize: 10, letterSpacing: 1.2, fontWeight: '600' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { color: LIME, fontSize: 11, fontWeight: '600' },

  inputWrap: { paddingHorizontal: 24, paddingTop: 36 },
  label: { fontSize: 13, letterSpacing: 0.2, textAlign: 'center' },
  slots: { flexDirection: 'row', gap: 16, marginTop: 8, alignSelf: 'center' },
  slot: { width: 48, height: 52, alignItems: 'center', justifyContent: 'center' },
  slotText: { fontSize: 30 },
  caret: { width: 2, height: 26, borderRadius: 1 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  suggest: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 10,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  suggestText: { fontSize: 13 },
  usePill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  usePillText: { fontSize: 13, fontWeight: '700' },
  error: { color: '#E03131', fontSize: 13, marginTop: 14, textAlign: 'center' },

  footer: { paddingHorizontal: 20, paddingTop: 24 },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 },
  privacyText: { fontSize: 12 },
  cta: { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaText: { fontSize: 16, fontWeight: '700' },
  removeBtn: { alignSelf: 'center', marginTop: 16, paddingVertical: 4 },
  removeText: { fontSize: 14, fontWeight: '600' },
});
