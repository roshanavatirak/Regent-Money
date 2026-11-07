// src/navigation/AutoTrackingSetupScreen.tsx
//
// First-run SMS setup. Shows what auto-tracking does (a bank SMS becoming a
// transaction), says what is and isn't read, then asks for permission.
// On grant, discovers accounts from SMS and lets the user review/edit/remove them.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  StatusBar,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { useTheme, usePrivacyModalStore, useBankStore } from '../store';
import { mmkvStorage } from '../db/mmkv';
import { smsPermissionService } from '../services/smsPermissionService';
import { smsCatchupService } from '../services/smsCatchupService';
import { bankDiscoveryService, DiscoveredBank } from '../services/bankDiscoveryService';
import { BankIcon } from '../components/BankIcon';
import { CategoryIcon } from '../components/CategoryIcon';
import { authService } from '../services/authService';
import { getBackendUrl } from '../config/api';

export const TRACKING_SETUP_KEY = 'has_setup_tracking_v1';

const BACKEND_URL = getBackendUrl();
const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

type Phase = 'intro' | 'scanning' | 'review_banks' | 'done';

interface AutoTrackingSetupScreenProps {
  navigation: any;
}

/** Counts up to the target for the result screen. */
const useCountUp = (target: number, run: boolean) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    const start = Date.now();
    const duration = Math.min(1200, 400 + target * 20);
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setN(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return n;
};

export const AutoTrackingSetupScreen: React.FC<AutoTrackingSetupScreenProps> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const [phase, setPhase] = useState<Phase>('intro');
  const [found, setFound] = useState(0);
  const shown = useCountUp(found, phase === 'done');

  // Discovered accounts state
  const [discoveredBanks, setDiscoveredBanks] = useState<DiscoveredBank[]>([]);
  const [alreadyLinkedBanks, setAlreadyLinkedBanks] = useState<DiscoveredBank[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  // Accounts the user unchecked; kept in the list so they can be re-added
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  // Edit sheet for one account's digits and balance
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftSuffix, setDraftSuffix] = useState('');
  const [draftBalance, setDraftBalance] = useState('');
  const [sheetError, setSheetError] = useState('');

  const selectedBanks = useMemo(
    () => discoveredBanks.filter((b) => !skippedIds.has(b.tempId)),
    [discoveredBanks, skippedIds]
  );
  const selectedTotal = useMemo(
    () => selectedBanks.reduce((sum, b) => sum + (parseFloat(b.currentBalance) || 0), 0),
    [selectedBanks]
  );
  const editingBank = discoveredBanks.find((b) => b.tempId === editingId) || null;

  // Pulse for the scanning state
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (phase === 'scanning') {
      pulse.value = 0;
      pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1);
    }
  }, [phase]);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.6 }],
  }));

  const finish = () => {
    mmkvStorage.setBoolean(TRACKING_SETUP_KEY, true);
    smsPermissionService.setPrompted(true);
    navigation.replace('Main');
  };

  const allow = async () => {
    if (Platform.OS !== 'android') {
      finish();
      return;
    }
    try {
      const granted = await smsPermissionService.requestSmsPermissions();
      if (!granted) {
        finish();
        return;
      }

      setPhase('scanning');
      // Discover bank accounts from SMS on-device
      const discovered = await bankDiscoveryService.discoverBanksFromSms(720);
      const existingBanks = useBankStore.getState().bankProfiles || [];

      const isBankMatch = (disc: DiscoveredBank, exist: any) => {
        const discSuffix = (disc.accountNumberSuffix || '').trim();
        const existSuffix = (exist.accountNumberSuffix || '').trim();
        const discName = (disc.bankName || '').trim().toLowerCase();
        const existName = (exist.bankName || '').trim().toLowerCase();
        const suffixMatch = Boolean(discSuffix && existSuffix && discSuffix === existSuffix);
        const nameMatch = discName === existName || discName.includes(existName) || existName.includes(discName);
        return suffixMatch && nameMatch;
      };

      const newDiscovered = (discovered || []).filter(
        (d) => !existingBanks.some((e: any) => isBankMatch(d, e))
      );
      const matchedExisting = (discovered || []).filter(
        (d) => existingBanks.some((e: any) => isBankMatch(d, e))
      );

      // If all discovered accounts already match existing profiles, bypass setup!
      if (newDiscovered.length === 0) {
        mmkvStorage.setBoolean(TRACKING_SETUP_KEY, true);
        smsPermissionService.setPrompted(true);
        const result = await smsCatchupService.reconcile(false, 720);
        setFound(result?.syncedCount ?? 0);
        navigation.replace('Main');
        return;
      }

      setDiscoveredBanks(newDiscovered);
      setAlreadyLinkedBanks(matchedExisting);
      setPhase('review_banks');
    } catch (e) {
      console.warn('[AutoTrackingSetup] Scan error:', e);
      finish();
    }
  };

  const hasValidSuffix = (b: DiscoveredBank) => /^\d{4}$/.test(b.accountNumberSuffix.trim());

  const toggleBank = (tempId: string) => {
    setSkippedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
    if (errorText) setErrorText('');
  };

  const openEditor = (b: DiscoveredBank, error = '') => {
    setDraftSuffix(b.accountNumberSuffix);
    setDraftBalance(b.currentBalance);
    setSheetError(error);
    setEditingId(b.tempId);
  };

  const saveEditor = () => {
    const suffix = draftSuffix.replace(/\D/g, '').slice(0, 4);
    if (!/^\d{4}$/.test(suffix)) {
      setSheetError('Enter the last 4 digits of this account.');
      return;
    }
    const balance = draftBalance.replace(/[^0-9.]/g, '');
    setDiscoveredBanks((prev) =>
      prev.map((b) => (b.tempId === editingId ? { ...b, accountNumberSuffix: suffix, currentBalance: balance } : b))
    );
    setEditingId(null);
    if (errorText) setErrorText('');
  };

  const confirmDiscoveredBanks = async () => {
    // An account missing its digits opens straight in the editor instead of failing at the bottom
    const incomplete = selectedBanks.find((b) => !hasValidSuffix(b));
    if (incomplete) {
      openEditor(incomplete, 'Add the last 4 digits to link this account.');
      return;
    }

    setErrorText('');
    setIsSaving(true);

    try {
      const token = authService.getAccessToken();
      if (!token) throw new Error('Authentication required.');

      // 1. Create bank profiles in backend
      for (const bank of selectedBanks) {
        const profileId = 'bank_' + Math.random().toString(36).slice(2, 11);
        const bal = parseFloat(bank.currentBalance) || 0;
        const res = await fetch(`${BACKEND_URL}/sync/bank-profile`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: profileId,
            bankName: bank.bankName.trim(),
            accountType: bank.accountType || 'Savings',
            accountNumberSuffix: bank.accountNumberSuffix.trim(),
            currentBalance: Math.round(bal * 100) / 100,
            smsSenderId: bank.smsSenderId || undefined,
            smsConsent: true,
          }),
        });

        if (res.ok) {
          // After a reinstall the server keeps the existing profile for this account and returns it;
          // using its id keeps catch-up and old transactions on the same profile (no ghost copy)
          const saved = await res.json().catch(() => null);
          const savedId: string = saved?.id || profileId;
          const store = useBankStore.getState();
          const profile = {
            id: savedId,
            bankName: bank.bankName.trim(),
            accountType: bank.accountType || 'Savings',
            accountNumberSuffix: bank.accountNumberSuffix.trim(),
            currentBalance: Math.round(bal * 100) / 100,
            lastSyncTimestamp: Date.now(),
            smsSenderId: bank.smsSenderId || undefined,
            smsConsent: true,
          };
          if (store.bankProfiles.some((b: any) => b.id === savedId)) {
            store.updateBankProfileState(profile);
          } else {
            store.addBankProfileState(profile);
          }
        }
      }

      // 2. Strict catch-up reconciliation: only import transactions matching confirmed banks & suffixes!
      const catchup = await smsCatchupService.reconcile(true, 720, undefined, true);
      setFound(catchup?.syncedCount ?? 0);
      setPhase('done');
    } catch (e: any) {
      console.warn('[AutoTrackingSetup] Error saving discovered banks:', e);
      setErrorText(e?.message || 'Could not link accounts. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const soft = isDark ? 'rgba(184,243,107,0.12)' : '#E3F2E8';

  const PrimaryButton = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [s.primary, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.98 }] }]} accessibilityRole="button">
      <Text style={[s.primaryText, { color: accentFg }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[s.container, { backgroundColor: pageBg, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={pageBg} />

      {phase === 'intro' && (
        <>
          <ScrollView style={s.scroll} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            {/* What it does: a bank SMS becomes a transaction */}
            <Animated.View entering={FadeInDown.duration(450)} style={[s.demo, { backgroundColor: surface, borderColor: line }]}>
              <View style={s.senderRow}>
                <Feather name="message-square" size={13} color={muted} />
                <Text style={[s.sender, { color: muted }]}>Bank alert</Text>
              </View>
              <View style={[s.bubble, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F2' }]}>
                <Text style={[s.bubbleText, { color: isDark ? '#C9D9D0' : '#3A4A42' }]}>
                  Rs 450.00 debited from a/c XX5039 to Swiggy on 12-Oct. UPI Ref 4021…
                </Text>
              </View>
              <Animated.View entering={FadeIn.delay(450).duration(300)} style={s.arrow}>
                <Feather name="arrow-down" size={18} color={isDark ? LIME : '#16A34A'} />
              </Animated.View>
              <Animated.View entering={FadeInUp.delay(650).duration(420)} style={[s.txRow, { backgroundColor: pageBg }]}>
                <CategoryIcon category="food" size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.txName, { color: ink }]}>Swiggy</Text>
                  <Text style={[s.txSub, { color: muted }]}>Food, account •• 5039</Text>
                </View>
                <Text style={[s.txAmt, { color: ink }]}>−₹450</Text>
              </Animated.View>
            </Animated.View>

            <Animated.Text
              entering={FadeInDown.delay(150).duration(450)}
              style={[s.title, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}
              accessibilityRole="header"
            >
              Track spending automatically
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(220).duration(450)} style={[s.sub, { color: muted }]}>
              Regent reads your bank’s SMS alerts and adds each payment for you. No typing.
            </Animated.Text>

            <Animated.View entering={FadeInDown.delay(300).duration(450)} style={s.points}>
              <View style={s.point}>
                <View style={[s.pointIcon, { backgroundColor: soft }]}>
                  <Feather name="shield" size={16} color={accent} />
                </View>
                <Text style={[s.pointText, { color: ink }]}>Only bank alerts. Never personal chats or OTPs.</Text>
              </View>
              <View style={s.point}>
                <View style={[s.pointIcon, { backgroundColor: soft }]}>
                  <Feather name="rotate-ccw" size={16} color={accent} />
                </View>
                <Text style={[s.pointText, { color: ink }]}>
                  Adds bank alerts from the last 30 days, then keeps reading new ones in the background as they arrive.
                </Text>
              </View>
              <View style={s.point}>
                <View style={[s.pointIcon, { backgroundColor: soft }]}>
                  <Feather name="upload-cloud" size={16} color={accent} />
                </View>
                <Text style={[s.pointText, { color: ink }]}>
                  Alerts are read on your phone. Only the amount, merchant, date, account digits and balance are sent securely to your Regent account. The message text never leaves your phone.
                </Text>
              </View>
            </Animated.View>

            <Pressable
              onPress={() => usePrivacyModalStore.getState().openPrivacyModal()}
              style={s.privacyLink}
              accessibilityRole="link"
            >
              <Text style={[s.privacyLinkText, { color: accent }]}>Read our Privacy policy</Text>
            </Pressable>
          </ScrollView>

          <Animated.View entering={FadeInDown.delay(380).duration(450)}>
            <PrimaryButton label="Allow SMS access" onPress={allow} />
            <Pressable onPress={finish} style={s.secondary} accessibilityRole="button">
              <Text style={[s.secondaryText, { color: muted }]}>Not now</Text>
            </Pressable>
          </Animated.View>
        </>
      )}

      {phase === 'scanning' && (
        <Animated.View entering={FadeIn.duration(300)} style={s.center}>
          <View style={s.hero}>
            <Animated.View style={[s.pulse, { borderColor: accent }, pulseStyle]} />
            <View style={[s.heroCore, { backgroundColor: soft }]}>
              <Feather name="message-square" size={32} color={accent} />
            </View>
          </View>
          <Text style={[s.stateTitle, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
            Finding your bank accounts
          </Text>
          <Text style={[s.stateSub, { color: muted }]}>Scanning financial alerts securely on your phone.</Text>
        </Animated.View>
      )}

      {phase === 'review_banks' && (
        <View style={{ flex: 1 }}>
          <Animated.View entering={FadeInDown.duration(350)}>
            <View style={[s.eyebrow, { backgroundColor: soft }]}>
              <Feather name="message-square" size={12} color={accent} />
              <Text style={[s.eyebrowText, { color: accent }]}>From your bank SMS</Text>
            </View>
            <Text style={[s.reviewTitle, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
              {discoveredBanks.length === 1 ? '1 new account found' : `${discoveredBanks.length} new accounts found`}
            </Text>
            <Text style={[s.reviewSub, { color: muted }]}>Tap to edit. Uncheck to skip.</Text>
          </Animated.View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            <Animated.View entering={FadeInDown.delay(80).duration(350)} style={[s.totalCard, { backgroundColor: FOREST }]}>
              <Text style={s.totalLabel}>Total balance · {selectedBanks.length} selected</Text>
              <Text style={[s.totalValue, { fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                ₹{selectedTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(140).duration(350)} style={[s.listCard, { backgroundColor: surface, borderColor: line }]}>
              {discoveredBanks.map((b, i) => {
                const selected = !skippedIds.has(b.tempId);
                const balance = parseFloat(b.currentBalance) || 0;
                return (
                  <Pressable
                    key={b.tempId}
                    onPress={() => openEditor(b)}
                    style={({ pressed }) => [
                      s.bankRow,
                      i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line },
                      pressed && { backgroundColor: soft },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${b.bankName}`}
                  >
                    <View style={[s.bankRowMain, !selected && { opacity: 0.4 }]}>
                      <View style={[s.logoWrap, { borderColor: line }]}>
                        <BankIcon code={b.bankCode} name={b.bankName} size={34} />
                      </View>
                      <View style={s.bankRowText}>
                        <Text style={[s.bankRowName, { color: ink }]} numberOfLines={1}>
                          {b.bankName}
                        </Text>
                        {hasValidSuffix(b) ? (
                          <Text style={[s.bankRowMeta, { color: muted }]} numberOfLines={1}>
                            {b.accountType} ··{b.accountNumberSuffix}
                          </Text>
                        ) : (
                          <View style={[s.missingChip, { backgroundColor: isDark ? 'rgba(239,159,39,0.16)' : '#FAEEDA' }]}>
                            <Text style={[s.missingChipText, { color: isDark ? '#FAC775' : '#633806' }]}>Add last 4 digits</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[s.bankRowBalance, { color: ink }]}>
                        ₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => toggleBank(b.tempId)}
                      hitSlop={12}
                      style={[s.check, selected ? { backgroundColor: accent, borderColor: accent } : { borderColor: line }]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`Track ${b.bankName}`}
                    >
                      {selected && <Feather name="check" size={13} color={accentFg} />}
                    </Pressable>
                  </Pressable>
                );
              })}
            </Animated.View>

            {/* Already Active / Linked Accounts */}
            {alreadyLinkedBanks.length > 0 && (
              <View style={{ marginTop: 20 }}>
                <View style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="check-circle" size={14} color={isDark ? LIME : '#16A34A'} />
                  <Text style={[s.sectionTitle, { color: ink }]}>
                    Already linked ({alreadyLinkedBanks.length})
                  </Text>
                </View>
                <View style={[s.listCard, { backgroundColor: surface, borderColor: line, opacity: 0.9 }]}>
                  {alreadyLinkedBanks.map((b, i) => {
                    const balance = parseFloat(b.currentBalance) || 0;
                    return (
                      <View
                        key={b.tempId}
                        style={[
                          s.bankRow,
                          i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line },
                        ]}
                      >
                        <View style={s.bankRowMain}>
                          <View style={[s.logoWrap, { borderColor: line }]}>
                            <BankIcon code={b.bankCode} name={b.bankName} size={34} />
                          </View>
                          <View style={s.bankRowText}>
                            <Text style={[s.bankRowName, { color: ink }]} numberOfLines={1}>
                              {b.bankName}
                            </Text>
                            <Text style={[s.bankRowMeta, { color: muted }]} numberOfLines={1}>
                              {b.accountType} ··{b.accountNumberSuffix}
                            </Text>
                          </View>
                          <Text style={[s.bankRowBalance, { color: ink }]}>
                            ₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </Text>
                        </View>
                        <View style={[s.activeBadge, { backgroundColor: isDark ? 'rgba(184,243,107,0.16)' : '#E3F2E8' }]}>
                          <Text style={[s.activeBadgeText, { color: isDark ? LIME : '#15803D' }]}>Active</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {errorText ? (
              <View style={s.errorRow}>
                <Feather name="alert-circle" size={14} color={isDark ? '#FFA8A8' : '#C92A2A'} />
                <Text style={[s.errorText, { color: isDark ? '#FFA8A8' : '#C92A2A' }]}>{errorText}</Text>
              </View>
            ) : null}
          </ScrollView>

          <Animated.View entering={FadeInDown.delay(200).duration(350)} style={{ paddingTop: 8 }}>
            {selectedBanks.length > 0 ? (
              <>
                <Pressable
                  onPress={confirmDiscoveredBanks}
                  disabled={isSaving}
                  style={({ pressed }) => [s.primary, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.98 }] }]}
                  accessibilityRole="button"
                >
                  {isSaving ? (
                    <ActivityIndicator color={accentFg} />
                  ) : (
                    <Text style={[s.primaryText, { color: accentFg }]}>
                      Link {selectedBanks.length} new account{selectedBanks.length === 1 ? '' : 's'}
                    </Text>
                  )}
                </Pressable>
                <Pressable onPress={finish} disabled={isSaving} style={s.secondary} accessibilityRole="button">
                  <Text style={[s.secondaryText, { color: muted }]}>Skip for now</Text>
                </Pressable>
              </>
            ) : (
              <PrimaryButton label="Skip & Continue to Dashboard" onPress={finish} />
            )}
          </Animated.View>

          <Modal
            visible={!!editingBank}
            transparent
            animationType="slide"
            statusBarTranslucent
            navigationBarTranslucent
            onRequestClose={() => setEditingId(null)}
          >
            <KeyboardAvoidingView behavior="padding" style={s.sheetOverlay}>
              <Pressable style={s.sheetBackdrop} onPress={() => setEditingId(null)} accessibilityLabel="Close" />
              {editingBank && (
                <View style={[s.sheet, { backgroundColor: surface, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
                  <View style={[s.grabBar, { backgroundColor: line }]} />
                  <View style={s.sheetHead}>
                    <View style={[s.logoWrap, { borderColor: line }]}>
                      <BankIcon code={editingBank.bankCode} name={editingBank.bankName} size={34} />
                    </View>
                    <View style={s.bankRowText}>
                      <Text style={[s.bankRowName, { color: ink }]} numberOfLines={1}>{editingBank.bankName}</Text>
                      <Text style={[s.bankRowMeta, { color: muted }]}>{editingBank.accountType}</Text>
                    </View>
                  </View>

                  <View style={s.sheetFields}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.fieldLabel, { color: muted }]}>Last 4 digits</Text>
                      <View style={[s.fieldBox, { backgroundColor: pageBg, borderColor: sheetError ? (isDark ? '#FFA8A8' : '#C92A2A') : line }]}>
                        <Text style={[s.fieldPrefix, { color: muted }]}>••</Text>
                        <TextInput
                          value={draftSuffix}
                          onChangeText={(t) => {
                            setDraftSuffix(t.replace(/\D/g, ''));
                            if (sheetError) setSheetError('');
                          }}
                          keyboardType="number-pad"
                          maxLength={4}
                          placeholder="0000"
                          placeholderTextColor={muted}
                          autoFocus={!hasValidSuffix(editingBank)}
                          style={[s.fieldInput, { color: ink }]}
                          accessibilityLabel="Account last 4 digits"
                        />
                      </View>
                    </View>
                    <View style={{ flex: 1.3 }}>
                      <Text style={[s.fieldLabel, { color: muted }]}>Balance</Text>
                      <View style={[s.fieldBox, { backgroundColor: pageBg, borderColor: line }]}>
                        <Text style={[s.fieldPrefix, { color: muted }]}>₹</Text>
                        <TextInput
                          value={draftBalance}
                          onChangeText={(t) => setDraftBalance(t.replace(/[^0-9.]/g, ''))}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={muted}
                          style={[s.fieldInput, { color: ink }]}
                          accessibilityLabel="Current balance"
                        />
                      </View>
                    </View>
                  </View>

                  {sheetError ? (
                    <Text style={[s.sheetError, { color: isDark ? '#FFA8A8' : '#C92A2A' }]}>{sheetError}</Text>
                  ) : null}

                  <Pressable
                    onPress={saveEditor}
                    style={({ pressed }) => [s.primary, { backgroundColor: accent, marginTop: 20 }, pressed && { transform: [{ scale: 0.98 }] }]}
                    accessibilityRole="button"
                  >
                    <Text style={[s.primaryText, { color: accentFg }]}>Save</Text>
                  </Pressable>
                </View>
              )}
            </KeyboardAvoidingView>
          </Modal>
        </View>
      )}

      {phase === 'done' && (
        <>
          <View style={s.center}>
            <Animated.View entering={ZoomIn.springify().damping(12)} style={s.hero}>
              <View style={[s.ring, { borderColor: isDark ? 'rgba(184,243,107,0.2)' : 'rgba(11,61,44,0.14)' }]} />
              <View style={[s.heroCore, { backgroundColor: FOREST }]}>
                <Feather name="check" size={38} color={LIME} />
              </View>
            </Animated.View>
            {found > 0 ? (
              <>
                <Text style={[s.bigNumber, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>{shown}</Text>
                <Text style={[s.stateTitle, { color: ink, marginTop: 6, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                  transaction{found === 1 ? '' : 's'} added
                </Text>
                <Text style={[s.stateSub, { color: muted }]}>From the last 30 days. New payments will appear as they happen.</Text>
              </>
            ) : (
              <>
                <Text style={[s.stateTitle, { color: ink, marginTop: 26, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                  You’re all set
                </Text>
                <Text style={[s.stateSub, { color: muted }]}>
                  No bank alerts from the last 30 days on this phone. New payments will appear as they happen.
                </Text>
              </>
            )}
          </View>
          <Animated.View entering={FadeInDown.delay(300).duration(400)}>
            <PrimaryButton label="Go to dashboard" onPress={finish} />
          </Animated.View>
        </>
      )}

    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  scroll: { flex: 1 },
  body: { flexGrow: 1, justifyContent: 'center', paddingBottom: 12 },

  demo: { borderWidth: 1, borderRadius: 28, padding: 18 },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sender: { fontSize: 12, fontWeight: '600' },
  bubble: { borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 12 },
  bubbleText: { fontSize: 13, lineHeight: 19 },
  arrow: { alignItems: 'center', paddingVertical: 10 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 12 },
  txName: { fontSize: 15, fontWeight: '700' },
  txSub: { fontSize: 12, marginTop: 2 },
  txAmt: { fontSize: 15, fontWeight: '700' },

  title: { fontSize: 30, letterSpacing: -0.8, lineHeight: 34, marginTop: 32 },
  sub: { fontSize: 15, lineHeight: 22, marginTop: 10 },
  points: { marginTop: 22, gap: 14 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pointText: { flex: 1, fontSize: 14, lineHeight: 20 },
  privacyLink: { marginTop: 16, alignSelf: 'flex-start', paddingVertical: 6 },
  privacyLinkText: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },

  primary: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontWeight: '700' },
  secondary: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryText: { fontSize: 15, fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  hero: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1 },
  pulse: { position: 'absolute', width: 88, height: 88, borderRadius: 44, borderWidth: 2 },
  heroCore: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  bigNumber: { fontSize: 64, letterSpacing: -2.4, lineHeight: 70, marginTop: 22, fontVariant: ['tabular-nums'] },
  stateTitle: { fontSize: 24, letterSpacing: -0.4, marginTop: 24, textAlign: 'center' },
  stateSub: { fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center', maxWidth: 300 },

  eyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 12,
  },
  eyebrowText: { fontSize: 12, fontWeight: '600' },
  reviewTitle: { fontSize: 30, letterSpacing: -0.8, lineHeight: 34, marginTop: 14 },
  reviewSub: { fontSize: 15, lineHeight: 22, marginTop: 6, marginBottom: 18 },

  totalCard: { borderRadius: 22, paddingHorizontal: 20, paddingVertical: 18, marginBottom: 12 },
  totalLabel: { fontSize: 13, fontWeight: '500', color: '#A7C9B5' },
  totalValue: { fontSize: 34, letterSpacing: -1, lineHeight: 40, marginTop: 2, color: LIME, fontVariant: ['tabular-nums'] },

  listCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, overflow: 'hidden' },
  bankRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 12 },
  bankRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bankRowText: { flex: 1, minWidth: 0 },
  bankRowName: { fontSize: 15, fontWeight: '700' },
  bankRowMeta: { fontSize: 12, marginTop: 2 },
  bankRowBalance: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  logoWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  missingChip: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 3 },
  missingChipText: { fontSize: 11, fontWeight: '600' },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 10 },
  grabBar: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  sheetFields: { flexDirection: 'row', gap: 10 },
  sheetError: { fontSize: 13, fontWeight: '600', marginTop: 10 },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 44,
  },
  fieldPrefix: {
    fontSize: 14,
    fontWeight: '700',
    marginRight: 4,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  activeBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
});
