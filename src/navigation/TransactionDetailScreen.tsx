// src/navigation/TransactionDetailScreen.tsx
//
// One transaction at a glance: who, how much, when, which account.
// Edit the amount, category or note in place. Fits on one screen, no scrolling.

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Switch,
  BackHandler,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
  FadeInDown,
  ZoomIn,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Font from 'expo-font';
import { format } from 'date-fns';
import { useTheme, showGlobalConfirm, useBankStore, useTransactionStore, useIncomeStore, usePeerStore } from '../store';
import { authService } from '../services/authService';
import { getBackendUrl } from '../config/api';
import { TagPaymentModal } from '../components/TagPaymentModal';
import { DateTimePickerSheet } from '../components/DateTimePickerSheet';
import { CategoryIcon } from '../components/CategoryIcon';
import { BankIcon } from '../components/BankIcon';
import { getCategory } from '../constants/categories';
import { tagLearningService } from '../services/tagLearningService';
import bankNamesJson from './banknames.json';

const BACKEND_URL = getBackendUrl();
const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

export interface TransactionItem {
  id: string;
  amount: number;
  category?: string;
  merchant?: string;
  timestamp?: number;
  type: 'credit' | 'debit';
  bankProfileId?: string;
}

export interface TransactionDetailScreenProps {
  transaction?: TransactionItem;
  bankName?: string;
  accountNumberSuffix?: string;
  onBack?: () => void;
  onSuccess?: (action: 'updated' | 'deleted', data?: any) => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** "UTTARAYAN PURE VEG R" → "Uttarayan Pure Veg R"; leaves mixed-case names alone. */
const niceName = (s?: string) => {
  const t = (s || '').trim();
  if (!t) return '';
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};

const firstWord = (s: string) => s.split(/\s+/)[0] || s;

const formatWhen = (ts?: number) => {
  if (!ts) return null;
  const d = new Date(ts);
  const dateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  if (dateOnly) return format(d, sameYear ? 'd MMM' : 'd MMM yyyy');
  return format(d, sameYear ? 'd MMM, HH:mm' : 'd MMM yyyy, HH:mm');
};

const getBankCode = (bankName?: string) => {
  if (!bankName) return '';
  const entry = Object.entries(bankNamesJson as Record<string, string>).find(
    ([, name]) => name.toLowerCase() === bankName.toLowerCase()
  );
  return entry ? entry[0] : '';
};

const sanitizeAmount = (text: string) => {
  let t = text.replace(/[^0-9.]/g, '');
  const dot = t.indexOf('.');
  if (dot !== -1) {
    t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '');
    const [i, d] = t.split('.');
    t = `${i.slice(0, 10)}.${d.slice(0, 2)}`;
  } else {
    t = t.slice(0, 10);
  }
  return t.replace(/^0+(?=\d)/, '');
};

const formatAmount = (raw: string) => {
  if (!raw) return '0';
  const [i, d] = raw.split('.');
  const grouped = Number(i || 0).toLocaleString('en-IN');
  return d !== undefined ? `${grouped}.${d}` : grouped;
};

const inr = (n: number) =>
  `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export const TransactionDetailScreen: React.FC<TransactionDetailScreenProps> = (props) => {
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

  const transaction: TransactionItem = props.transaction || route?.params?.transaction;
  const bankProfiles = useBankStore((s) => s.bankProfiles);

  const matchedBank = useMemo(() => {
    if (transaction?.bankProfileId) return bankProfiles.find((b) => b.id === transaction.bankProfileId);
    const name = (props.bankName || route?.params?.bankName || '').toLowerCase();
    return name ? bankProfiles.find((b) => b.bankName.toLowerCase() === name) : null;
  }, [bankProfiles, transaction?.bankProfileId, props.bankName, route?.params?.bankName]);

  const bankName: string | undefined = props.bankName || route?.params?.bankName || matchedBank?.bankName;
  const accountSuffix: string | undefined =
    props.accountNumberSuffix || route?.params?.accountNumberSuffix || matchedBank?.accountNumberSuffix;

  const originalAmount = Number(transaction?.amount || 0);
  const originalCategory = (transaction?.category || (transaction?.type === 'credit' ? 'money_received' : 'miscellaneous')).toLowerCase();
  const originalNote = transaction?.merchant || '';
  const originalTimestamp = Number(transaction?.timestamp) || Date.now();

  const initialMerchant = originalNote.trim() || transaction?.merchant || '';
  const cleanMerchant = initialMerchant.replace(/\s*\([^)]*\)/g, '').trim();
  const initialSavedRuleTag = initialMerchant
    ? tagLearningService.getLearnedTag(initialMerchant) ||
      tagLearningService.getLearnedTag(firstWord(niceName(initialMerchant))) ||
      (cleanMerchant ? tagLearningService.getLearnedTag(cleanMerchant) : null)
    : null;
  const initialHasActiveRule = Boolean(
    initialSavedRuleTag &&
    getCategory(initialSavedRuleTag).id === getCategory(originalCategory).id
  );

  const [amountStr, setAmountStr] = useState(originalAmount ? String(originalAmount) : '');
  const [category, setCategory] = useState(originalCategory);
  const [note, setNote] = useState(originalNote);
  const [timestamp, setTimestamp] = useState<number>(originalTimestamp);
  const [rememberRule, setRememberRule] = useState<boolean>(initialHasActiveRule);

  // Sync rules from backend on mount so devices always have latest rules
  useEffect(() => {
    let isMounted = true;
    tagLearningService.syncWithBackend().then(() => {
      if (!isMounted) return;
      const merchantToCheck = note.trim() || transaction?.merchant || '';
      const clean = merchantToCheck.replace(/\s*\([^)]*\)/g, '').trim();
      const tag =
        tagLearningService.getLearnedTag(merchantToCheck) ||
        tagLearningService.getLearnedTag(firstWord(niceName(merchantToCheck))) ||
        (clean ? tagLearningService.getLearnedTag(clean) : null);
      if (tag && getCategory(tag).id === getCategory(category).id) {
        setRememberRule(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [initialMerchant, category]);
  const [editingAmount, setEditingAmount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tagSheet, setTagSheet] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [saved, setSaved] = useState(false);

  const amountRef = useRef<TextInput>(null);
  const display =
    typeof Font?.isLoaded === 'function' && Font.isLoaded('BricolageGrotesque_800ExtraBold')
      ? 'BricolageGrotesque_800ExtraBold'
      : undefined;

  const caret = useSharedValue(1);
  useEffect(() => {
    caret.value = withRepeat(withSequence(withTiming(1, { duration: 450 }), withTiming(0, { duration: 450 })), -1);
  }, []);
  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }));

  const handleGoBack = () => {
    if (props.onBack) {
      props.onBack();
      return;
    }
    const returnToBankId = route?.params?.returnToBankId || transaction?.bankProfileId;
    if (returnToBankId) useBankStore.getState().setActiveBankModalId(returnToBankId);
    navigation?.goBack?.();
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleGoBack();
      return true;
    });
    return () => sub.remove();
  }, [props.onBack, route?.params?.returnToBankId, transaction?.bankProfileId]);

  if (!transaction) {
    handleGoBack();
    return null;
  }

  /* ---------------- Derived ---------------- */

  const currentMerchant = note.trim() || transaction?.merchant || '';
  const cleanCurrentMerchant = currentMerchant.replace(/\s*\([^)]*\)/g, '').trim();
  const currentSavedRuleTag = currentMerchant
    ? tagLearningService.getLearnedTag(currentMerchant) ||
      tagLearningService.getLearnedTag(firstWord(niceName(currentMerchant))) ||
      (cleanCurrentMerchant ? tagLearningService.getLearnedTag(cleanCurrentMerchant) : null)
    : null;

  const isCredit = transaction.type === 'credit';
  const parsedAmount = parseFloat(amountStr) || 0;
  const diff = parsedAmount - originalAmount;
  const dirty =
    Math.abs(diff) > 0.001 ||
    getCategory(category).id !== getCategory(originalCategory).id ||
    note.trim() !== originalNote.trim() ||
    Math.abs(timestamp - originalTimestamp) > 60000 ||
    rememberRule !== initialHasActiveRule;

  const payee = niceName(note.trim() || transaction.merchant) || (isCredit ? 'Money received' : 'Payment');
  const catLabel = getCategory(category).label;
  const when = formatWhen(timestamp);

  // Balance effect of an edited amount
  const balanceEffect = isCredit ? diff : -diff;

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const band = isCredit ? (isDark ? '#0F2A1E' : '#E4F4EA') : isDark ? '#2A1512' : '#FFEFEA';
  const accentText = isCredit ? (isDark ? LIME : '#0B6B3A') : isDark ? '#FFA8A8' : '#B42318';
  const chip = isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF';
  const line = isDark ? colors.border : '#E1E9E4';
  const red = isDark ? '#FFA8A8' : '#C92A2A';

  /* ---------------- Actions ---------------- */

  const save = async () => {
    if (!dirty || saving) return;
    if (parsedAmount <= 0) {
      setErrorText('Enter an amount above ₹0.');
      return;
    }
    setSaving(true);
    setErrorText('');
    try {
      const token = authService.getAccessToken();
      if (!token) throw new Error('Sign in again to edit transactions.');

      const response = await fetch(`${BACKEND_URL}/sync/transaction-entry`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: transaction.id,
          type: transaction.type,
          amount: parsedAmount,
          category,
          note: note.trim() || undefined,
          timestamp,
          updateMerchantRule: rememberRule,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Could not save your changes. Try again.');
      }
      const res = await response.json();

      if (transaction.bankProfileId && res.updatedBalance !== undefined) {
        useBankStore.getState().updateBankBalance(transaction.bankProfileId, res.updatedBalance);
      }

      const label = note.trim() || category;
      const isPeer = category.startsWith('peer_');
      if (isCredit) {
        if (isPeer) {
          useIncomeStore.getState().removeIncomeRecordState(transaction.id);
        } else {
          useIncomeStore.getState().updateIncomeRecordState(transaction.id, {
            amount: parsedAmount,
            category,
            merchant: label,
            source: label,
            timestamp,
          });
        }
      } else {
        useTransactionStore.getState().updateTransactionState(transaction.id, {
          amount: parsedAmount,
          category,
          merchant: label,
          timestamp,
        });
      }

      // Sync with Peer Ledger
      const dateStr = format(new Date(timestamp), 'yyyy-MM-dd');
      const merchant = note.trim() || transaction.merchant;
      usePeerStore.getState().syncWithTransactionTag(
        transaction.id,
        category,
        parsedAmount,
        dateStr,
        merchant
      );

      if (merchant && rememberRule) {
        await tagLearningService.saveLearnedTag(merchant, category).catch(() => {});
      } else if (merchant && initialHasActiveRule && !rememberRule) {
        await tagLearningService.removeLearnedTag(merchant).catch(() => {});
      }

      const payload = {
        ...res,
        id: transaction.id,
        type: transaction.type,
        newAmount: parsedAmount,
        category,
        merchant: label,
        timestamp,
      };
      if (typeof props.onSuccess === 'function') props.onSuccess('updated', payload);
      else if (typeof route?.params?.onSuccess === 'function') route.params.onSuccess('updated', payload);

      setSaved(true);
      setTimeout(handleGoBack, 800);
    } catch (e: any) {
      setErrorText(e?.message || 'Could not save your changes. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    showGlobalConfirm({
      title: `Delete this ${inr(originalAmount)} ${isCredit ? 'income' : 'expense'}?`,
      message: isCredit
        ? `It will be removed and ${bankName || 'your account'} balance goes down by ${inr(originalAmount)}.`
        : `It will be removed and ${inr(originalAmount)} goes back to ${bankName || 'your account'} balance.`,
      confirmText: 'Delete',
      cancelText: 'Keep it',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: async () => {
        const token = authService.getAccessToken();
        if (!token) throw new Error('Sign in again to delete transactions.');
        const response = await fetch(
          `${BACKEND_URL}/sync/transaction-entry/${transaction.id}?type=${transaction.type}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          setErrorText(err.message || 'Could not delete this transaction. Try again.');
          return;
        }
        const res = await response.json();
        if (transaction.bankProfileId && res.updatedBalance !== undefined) {
          useBankStore.getState().updateBankBalance(transaction.bankProfileId, res.updatedBalance);
        }
        if (isCredit) useIncomeStore.getState().removeIncomeRecordState(transaction.id);
        else useTransactionStore.getState().removeTransactionState(transaction.id);

        const payload = { id: transaction.id, type: transaction.type, amount: originalAmount, updatedBalance: res.updatedBalance };
        if (typeof props.onSuccess === 'function') props.onSuccess('deleted', payload);
        else if (typeof route?.params?.onSuccess === 'function') route.params.onSuccess('deleted', payload);

        handleGoBack();
      },
    });
  };

  /* ---------------- Render ---------------- */

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {/* Hero */}
        <Animated.View
          entering={FadeIn.duration(300)}
          style={[styles.band, { backgroundColor: band, paddingTop: Math.max(insets.top, 12) + 4 }]}
        >
          <View style={styles.headerRow}>
            <Pressable onPress={handleGoBack} style={[styles.roundBtn, { backgroundColor: chip }]} accessibilityLabel="Back">
              <Feather name="arrow-left" size={20} color={ink} />
            </Pressable>
            <View style={styles.typeTag}>
              <Feather name={isCredit ? 'arrow-down-left' : 'arrow-up-right'} size={14} color={accentText} />
              <Text style={[styles.typeText, { color: accentText }]}>{isCredit ? 'Money in' : 'Money out'}</Text>
            </View>
            <Pressable onPress={remove} style={[styles.roundBtn, { backgroundColor: chip }]} accessibilityLabel="Delete transaction">
              <Feather name="trash-2" size={18} color={red} />
            </Pressable>
          </View>

          <Animated.View entering={ZoomIn.springify().damping(14)} style={{ marginTop: 12 }}>
            <CategoryIcon category={isCredit && category === 'money_received' ? 'money_received' : category} size={60} />
          </Animated.View>

          <Text style={[styles.payee, { color: ink }]} numberOfLines={1}>
            {payee}
          </Text>

          {/* Amount, tap to edit */}
          <Pressable
            onPress={() => {
              setEditingAmount(true);
              setTimeout(() => amountRef.current?.focus(), 30);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Amount ${inr(parsedAmount)}. Tap to edit`}
          >
            <View style={styles.amountRow}>
              <Text style={[styles.amountSign, { color: accentText, fontFamily: display }]}>{isCredit ? '+₹' : '−₹'}</Text>
              <Text
                style={[styles.amount, { color: accentText, fontFamily: display, fontWeight: display ? undefined : '800' }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatAmount(amountStr)}
              </Text>
              {editingAmount ? (
                <Animated.View style={[styles.caret, { backgroundColor: accentText }, caretStyle]} />
              ) : (
                <View style={[styles.editDot, { backgroundColor: chip }]}>
                  <Feather name="edit-2" size={12} color={ink} />
                </View>
              )}
            </View>
            <TextInput
              ref={amountRef}
              value={amountStr}
              onChangeText={(t) => {
                setAmountStr(sanitizeAmount(t));
                if (errorText) setErrorText('');
              }}
              onBlur={() => setEditingAmount(false)}
              keyboardType="decimal-pad"
              caretHidden
              style={styles.hiddenInput}
              accessibilityLabel="Amount in rupees"
            />
          </Pressable>

          {Math.abs(diff) > 0.001 ? (
            <Animated.Text entering={FadeIn.duration(200)} style={[styles.impact, { color: muted }]}>
              Balance will go {balanceEffect >= 0 ? 'up' : 'down'} by {inr(balanceEffect)}
            </Animated.Text>
          ) : null}

          <View style={styles.metaRow}>
            {when ? (
              <Pressable
                onPress={() => setDatePickerOpen(true)}
                style={({ pressed }) => [
                  styles.metaChip,
                  { backgroundColor: chip },
                  pressed && { opacity: 0.75 },
                ]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Date and time ${when}. Tap to edit`}
              >
                <Feather name="calendar" size={13} color={ink} />
                <Text style={[styles.metaText, { color: ink }]}>{when}</Text>
                <Feather name="edit-2" size={11} color={muted} style={{ marginLeft: 3 }} />
              </Pressable>
            ) : null}
            {bankName ? (
              <View style={[styles.metaChip, { backgroundColor: chip, paddingLeft: 4 }]}>
                <BankIcon code={getBankCode(bankName)} name={bankName} size={26} />
                <Text style={[styles.metaText, { color: ink }]} numberOfLines={1}>
                  {firstWord(bankName)}
                  {accountSuffix ? ` •• ${accountSuffix}` : ''}
                </Text>
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* Details */}
        <Animated.View
          entering={FadeInDown.delay(120).duration(380)}
          style={[styles.group, { backgroundColor: colors.card, borderColor: line }]}
        >
          <Pressable
            onPress={() => setTagSheet(true)}
            style={({ pressed }) => [styles.row, { borderBottomColor: line, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`Category ${catLabel}. Change`}
          >
            <CategoryIcon category={category} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: muted }]}>Category</Text>
              <Text style={[styles.rowValue, { color: ink }]} numberOfLines={1}>{catLabel}</Text>
            </View>
            <Text style={[styles.rowAction, { color: muted }]}>Change</Text>
            <Feather name="chevron-right" size={16} color={muted} />
          </Pressable>

          <View style={[styles.row, { borderBottomColor: line, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <View style={[styles.noteIcon, { backgroundColor: pageBg }]}>
              <Feather name="edit-3" size={16} color={muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: muted }]}>Note</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={isCredit ? 'Who sent it' : 'Where you paid'}
                placeholderTextColor={muted}
                maxLength={50}
                style={[styles.noteInput, { color: ink }]}
                accessibilityLabel="Note"
              />
            </View>
          </View>

          {note.trim() || transaction.merchant ? (
            <View style={styles.row}>
              <Text style={[styles.ruleText, { color: ink }]} numberOfLines={2}>
                Always tag {firstWord(niceName(note.trim() || transaction.merchant))} as {catLabel}
              </Text>
              <Switch
                value={rememberRule}
                onValueChange={setRememberRule}
                trackColor={{ false: isDark ? '#3A3A3C' : '#D1D5DB', true: '#16A34A' }}
                thumbColor="#FFFFFF"
                ios_backgroundColor={isDark ? '#3A3A3C' : '#D1D5DB'}
              />
            </View>
          ) : null}
        </Animated.View>

        {errorText ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.errorRow}>
            <Feather name="alert-circle" size={14} color={red} />
            <Text style={[styles.errorText, { color: red }]}>{errorText}</Text>
          </Animated.View>
        ) : null}

        <View style={{ flex: 1 }} />

        {/* Save */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <Pressable
            onPress={save}
            disabled={!dirty || saving}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: isDark ? LIME : FOREST, opacity: dirty ? 1 : 0.5 },
              pressed && dirty && { transform: [{ scale: 0.98 }] },
            ]}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color={isDark ? FOREST : LIME} />
            ) : (
              <Text style={[styles.ctaText, { color: isDark ? FOREST : LIME }]}>
                {dirty ? 'Save changes' : 'No changes yet'}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {saved && (
        <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, styles.savedWrap, { backgroundColor: pageBg }]}>
          <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.savedCircle, { backgroundColor: FOREST }]}>
            <Feather name="check" size={40} color={LIME} />
          </Animated.View>
          <Text style={[styles.savedText, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
            Saved
          </Text>
        </Animated.View>
      )}

      <TagPaymentModal
        visible={tagSheet}
        onClose={() => setTagSheet(false)}
        selectedTag={category}
        onSelectTag={(tag, updateRule) => {
          setCategory(tag);
          if (updateRule !== undefined) {
            setRememberRule(Boolean(updateRule));
          } else {
            const matchesRule =
              currentSavedRuleTag &&
              getCategory(currentSavedRuleTag).id === getCategory(tag).id;
            setRememberRule(Boolean(matchesRule));
          }
        }}
        merchantName={niceName(note.trim() || transaction.merchant) || undefined}
        transactionType={transaction.type}
        isDark={isDark}
        colors={colors}
      />

      <DateTimePickerSheet
        visible={datePickerOpen}
        mode="datetime"
        title="Edit date and time"
        value={new Date(timestamp)}
        maximumDate={new Date()}
        onClose={() => setDatePickerOpen(false)}
        onConfirm={(selectedDate) => {
          setTimestamp(selectedDate.getTime());
          setDatePickerOpen(false);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  band: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingHorizontal: 16, paddingBottom: 24, alignItems: 'center' },
  headerRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  typeTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeText: { fontSize: 13, fontWeight: '700' },

  payee: { fontSize: 17, fontWeight: '600', marginTop: 12, maxWidth: '90%' },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', marginTop: 8 },
  amountSign: { fontSize: 28, fontWeight: '700', marginTop: 8, marginRight: 2 },
  amount: { fontSize: 60, letterSpacing: -2.4, lineHeight: 66, maxWidth: 260 },
  caret: { width: 3, height: 50, borderRadius: 2, marginTop: 8, marginLeft: 4 },
  editDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12, marginLeft: 8 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  impact: { fontSize: 12, fontWeight: '600', marginTop: 4 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, maxWidth: 220 },
  metaText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },

  group: { marginHorizontal: 16, marginTop: 18, borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 60 },
  rowLabel: { fontSize: 12 },
  rowValue: { fontSize: 15, fontWeight: '700', marginTop: 1 },
  rowAction: { fontSize: 13, fontWeight: '600' },
  noteIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  noteInput: { fontSize: 15, fontWeight: '600', paddingVertical: 0, marginTop: 1, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  ruleText: { flex: 1, fontSize: 14, fontWeight: '600', marginRight: 12 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginTop: 12 },
  errorText: { fontSize: 13, fontWeight: '600', flex: 1 },

  footer: { paddingHorizontal: 16, paddingTop: 10 },
  cta: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },

  savedWrap: { alignItems: 'center', justifyContent: 'center' },
  savedCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  savedText: { fontSize: 24, marginTop: 18 },
});