import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
  StyleSheet,
  Platform,
  BackHandler,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withSequence,
  withRepeat,
  interpolateColor,
  FadeIn,
  ZoomIn,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Font from 'expo-font';
import { useTheme, useBankStore, useTransactionStore, useIncomeStore } from '../store';
import { authService } from '../services/authService';
import { getBackendUrl } from '../config/api';
import { CategoryIcon } from '../components/CategoryIcon';
import { TagPaymentModal } from '../components/TagPaymentModal';
import { getCategory } from '../constants/categories';
import { BankIcon } from '../components/BankIcon';
import { DateTimePickerSheet } from '../components/DateTimePickerSheet';
import { format, isSameDay } from 'date-fns';

const BACKEND_URL = getBackendUrl();

type TxType = 'credit' | 'debit';
type When = 'today' | 'yesterday' | 'custom';

// Quick picks shown in the row; everything else is under "More"
const OUT_QUICK = ['food', 'groceries', 'shopping', 'transport', 'bills', 'rent', 'entertainment', 'medical'];
const IN_QUICK = ['salary', 'money_received', 'investment', 'cashback', 'interest', 'self_transfer'];
const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
const RED = '#E03131';

const formatAmount = (raw: string) => {
  if (!raw) return '';
  const [int, dec] = raw.split('.');
  const grouped = Number(int || 0).toLocaleString('en-IN');
  return dec !== undefined ? `${grouped}.${dec}` : grouped;
};

const sanitizeAmount = (text: string) => {
  let t = text.replace(/[^0-9.]/g, '');
  const firstDot = t.indexOf('.');
  if (firstDot !== -1) {
    t = t.slice(0, firstDot + 1) + t.slice(firstDot + 1).replace(/\./g, '');
    const [i, d] = t.split('.');
    t = `${i.slice(0, 10)}.${d.slice(0, 2)}`;
  } else {
    t = t.slice(0, 10);
  }
  return t.replace(/^0+(?=\d)/, '');
};

const inr = (n: number) =>
  `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export interface ManualTransactionScreenProps {
  bank?: any;
  initialType?: TxType;
  returnToBankId?: string;
  onBack?: () => void;
  onSuccess?: (result: any) => void;
}

export const ManualTransactionScreen: React.FC<ManualTransactionScreenProps> = (props) => {
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
  const bankProfiles = useBankStore((s) => s.bankProfiles);

  const initialBank = props.bank || route?.params?.bank;
  const initialType: TxType = props.initialType || route?.params?.initialType || 'debit';

  const [bank, setBank] = useState<any>(initialBank);
  const [type, setType] = useState<TxType>(initialType);
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState(initialType === 'credit' ? 'salary' : 'food');
  const [note, setNote] = useState('');
  const [when, setWhen] = useState<When>('today');
  const [customDate, setCustomDate] = useState<Date>(new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [focused, setFocused] = useState(false);
  const [bankSheet, setBankSheet] = useState(false);
  const [tagSheet, setTagSheet] = useState(false);
  const [success, setSuccess] = useState<{ amount: number; type: TxType } | null>(null);

  const inputRef = useRef<TextInput>(null);
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const handleGoBack = () => {
    if (props.onBack) {
      props.onBack();
      return;
    }
    const returnToBankId = props.returnToBankId || route?.params?.returnToBankId;
    if (returnToBankId) useBankStore.getState().setActiveBankModalId(returnToBankId);
    navigation?.goBack?.();
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pickerOpen) {
        setPickerOpen(false);
        return true;
      }
      if (bankSheet) {
        setBankSheet(false);
        return true;
      }
      handleGoBack();
      return true;
    });
    return () => sub.remove();
  }, [pickerOpen, bankSheet, props.onBack, props.returnToBankId, route?.params?.returnToBankId]);

  /* ---------------- Animations ---------------- */

  const typeProgress = useSharedValue(initialType === 'credit' ? 1 : 0);
  const amountScale = useSharedValue(1);
  const caret = useSharedValue(1);

  useEffect(() => {
    caret.value = withRepeat(withSequence(withTiming(1, { duration: 450 }), withTiming(0, { duration: 450 })), -1);
  }, []);

  const bandStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      typeProgress.value,
      [0, 1],
      isDark ? ['#2A1512', '#0F2A1E'] : ['#FFEFEA', '#E4F4EA']
    ),
  }));
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: typeProgress.value * 126 }],
    backgroundColor: interpolateColor(typeProgress.value, [0, 1], [RED, FOREST]),
  }));
  const amountStyle = useAnimatedStyle(() => ({ transform: [{ scale: amountScale.value }] }));
  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }));

  const pulse = () => {
    amountScale.value = withSequence(withTiming(1.06, { duration: 90 }), withSpring(1, { damping: 10, stiffness: 260 }));
  };

  const quickList = useMemo(() => {
    const base = type === 'credit' ? IN_QUICK : OUT_QUICK;
    const selectedId = getCategory(category).id;
    return base.includes(selectedId) ? base : [category, ...base];
  }, [type, category]);

  if (!bank) {
    handleGoBack();
    return null;
  }

  /* ---------------- Derived values ---------------- */

  const parsedAmount = parseFloat(amountStr) || 0;
  const currentBal = Number(bank?.currentBalance) || 0;
  const newBal = type === 'credit' ? currentBal + parsedAmount : currentBal - parsedAmount;
  const overdraw = type === 'debit' && parsedAmount > 0 && newBal < 0;

  const isOut = type === 'debit';
  const amountColor = isOut ? (isDark ? '#FFA8A8' : '#B42318') : isDark ? LIME : '#0B6B3A';
  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const line = isDark ? colors.border : '#DCE5E0';
  const surface = colors.card;
  const chipBg = isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF';

  /* ---------------- Actions ---------------- */

  const switchType = (next: TxType) => {
    if (next === type) return;
    setType(next);
    setCategory(next === 'credit' ? 'salary' : 'food');
    setErrorText('');
    typeProgress.value = withSpring(next === 'credit' ? 1 : 0, { damping: 18, stiffness: 220 });
  };

  const quickAdd = (n: number) => {
    const next = (parseFloat(amountStr) || 0) + n;
    setAmountStr(String(Math.round(next * 100) / 100));
    setErrorText('');
    pulse();
  };

  const submit = async () => {
    if (parsedAmount <= 0) {
      setErrorText('Enter an amount above ₹0.');
      inputRef.current?.focus();
      return;
    }
    setLoading(true);
    setErrorText('');
    try {
      const token = authService.getAccessToken();
      if (!token) throw new Error('Sign in again to add transactions.');

      const timestamp =
        when === 'custom'
          ? customDate.getTime()
          : when === 'yesterday'
            ? Date.now() - 24 * 60 * 60 * 1000
            : Date.now();
      const response = await fetch(`${BACKEND_URL}/sync/manual-transaction`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bankProfileId: bank.id,
          type,
          amount: parsedAmount,
          category,
          note: note.trim() || undefined,
          timestamp,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || `Could not save this transaction (error ${response.status}).`);
      }

      const result = await response.json();
      const updatedBalance = result.updatedBalance !== undefined ? result.updatedBalance : newBal;
      useBankStore.getState().updateBankBalance(bank.id, updatedBalance);

      const recordTs = result.record?.timestamp ? Number(result.record.timestamp) : timestamp;
      const label = note.trim() || getCategory(category).label;

      if (type === 'credit' && result.record) {
        useIncomeStore.getState().addIncomeRecordState({
          id: result.record.id,
          amount: parsedAmount,
          category,
          merchant: label,
          source: label,
          timestamp: recordTs,
          bankProfileId: bank.id,
          updatedAt: Date.now(),
          type: 'credit',
        });
      } else if (type === 'debit' && result.record) {
        useTransactionStore.getState().addTransactionState({
          id: result.record.id,
          amount: parsedAmount,
          category,
          merchant: label,
          timestamp: recordTs,
          bankProfileId: bank.id,
          type: 'debit',
          status: 'confirmed',
        });
      }

      const payload = { type, amount: parsedAmount, updatedBalance, record: result.record };
      if (props.onSuccess) props.onSuccess(payload);
      else if (typeof route?.params?.onSuccess === 'function') route.params.onSuccess(payload);

      setSuccess({ amount: parsedAmount, type });
      setTimeout(handleGoBack, 1100);
    } catch (err: any) {
      setErrorText(err?.message || 'Could not save this transaction. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const ctaLabel =
    parsedAmount > 0 ? `Add ${inr(parsedAmount)} ${isOut ? 'expense' : 'income'}` : 'Enter an amount';

  /* ---------------- Render ---------------- */

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          {/* Hero band */}
          <Animated.View style={[styles.band, { paddingTop: Math.max(insets.top, 12) + 4 }, bandStyle]}>
            <View style={styles.headerRow}>
              <Pressable onPress={handleGoBack} style={[styles.roundBtn, { backgroundColor: chipBg }]} accessibilityLabel="Back">
                <Feather name="arrow-left" size={20} color={ink} />
              </Pressable>
              <Text style={[styles.headerTitle, { color: ink }]}>Add transaction</Text>
              <View style={{ width: 44 }} />
            </View>

            {/* Account pill */}
            <Pressable
              onPress={() => setBankSheet(true)}
              style={[styles.bankPill, { backgroundColor: chipBg }]}
              accessibilityRole="button"
              accessibilityLabel={`Account: ${bank.bankName} ending ${bank.accountNumberSuffix}. Change account`}
            >
              <BankIcon name={bank.bankName} code="" size={28} />
              <Text style={[styles.bankName, { color: ink }]} numberOfLines={1}>
                {bank.bankName}
                <Text style={{ color: muted, fontWeight: '500' }}>  •• {bank.accountNumberSuffix}</Text>
              </Text>
              <View style={[styles.pencil, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F2' }]}>
                <Feather name="edit-2" size={13} color={ink} />
              </View>
            </Pressable>

            {/* Money out / Money in */}
            <View style={[styles.segment, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)' }]}>
              <Animated.View style={[styles.segmentIndicator, indicatorStyle]} />
              {(['debit', 'credit'] as TxType[]).map((t) => {
                const active = type === t;
                const fg = active ? (t === 'credit' ? LIME : '#FFFFFF') : muted;
                return (
                  <Pressable
                    key={t}
                    onPress={() => switchType(t)}
                    style={styles.segmentBtn}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Feather name={t === 'debit' ? 'arrow-up-right' : 'arrow-down-left'} size={15} color={fg} />
                    <Text style={[styles.segmentText, { color: fg }, active && { fontWeight: '700' }]}>
                      {t === 'debit' ? 'Money out' : 'Money in'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Amount */}
            <Pressable onPress={() => inputRef.current?.focus()} accessibilityLabel="Amount">
              <Animated.View style={[styles.amountRow, amountStyle]}>
                <Text style={[styles.rupee, { color: amountColor, fontFamily: display }]}>₹</Text>
                <Text
                  style={[
                    styles.amount,
                    { color: amountStr ? amountColor : isDark ? 'rgba(255,255,255,0.3)' : 'rgba(11,31,23,0.25)', fontFamily: display, fontWeight: display ? undefined : '800' },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {amountStr ? formatAmount(amountStr) : '0'}
                </Text>
                {focused && <Animated.View style={[styles.caret, { backgroundColor: isOut ? RED : isDark ? LIME : FOREST }, caretStyle]} />}
              </Animated.View>
              <TextInput
                ref={inputRef}
                value={amountStr}
                onChangeText={(t) => {
                  setAmountStr(sanitizeAmount(t));
                  if (errorText) setErrorText('');
                }}
                keyboardType="decimal-pad"
                autoFocus
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={styles.hiddenInput}
                caretHidden
                accessibilityLabel="Amount in rupees"
              />
            </Pressable>

            <Text style={[styles.preview, { color: isDark ? '#C9D9D0' : '#3A4A42' }]}>
              Balance {inr(currentBal)}
              {parsedAmount > 0 ? (
                <>
                  {'  →  '}
                  <Text style={{ color: amountColor, fontWeight: '700' }}>
                    {newBal < 0 ? '−' : ''}
                    {inr(newBal)}
                  </Text>
                </>
              ) : null}
            </Text>
            {overdraw && (
              <Animated.View entering={FadeIn.duration(200)} style={styles.warnRow}>
                <Feather name="alert-circle" size={13} color={amountColor} />
                <Text style={[styles.warnText, { color: amountColor }]}>More than this account holds</Text>
              </Animated.View>
            )}

            <View style={styles.quickRow}>
              {QUICK_AMOUNTS.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => quickAdd(n)}
                  style={({ pressed }) => [styles.quickChip, { backgroundColor: chipBg }, pressed && { transform: [{ scale: 0.95 }] }]}
                  accessibilityLabel={`Add ${n} rupees`}
                >
                  <Text style={[styles.quickText, { color: ink }]}>+{inr(n)}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* Category */}
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: muted }]}>Category</Text>
            <Pressable onPress={() => setTagSheet(true)} hitSlop={10}>
              <Text style={[styles.link, { color: isDark ? LIME : '#0B6B3A' }]}>See all</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            {quickList.map((id) => {
              const cat = getCategory(id);
              const selected = getCategory(category).id === cat.id;
              return (
                <Pressable
                  key={id}
                  onPress={() => setCategory(id)}
                  style={styles.catItem}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={cat.label}
                >
                  <CategoryIcon category={id} size={52} selected={selected} backgroundColor={pageBg} />
                  <Text style={[styles.catLabel, { color: ink }, selected && { fontWeight: '700' }]} numberOfLines={1}>
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setTagSheet(true)} style={styles.catItem} accessibilityLabel="More categories">
              <View style={[styles.moreTile, { borderColor: isDark ? 'rgba(255,255,255,0.3)' : '#9DB2A7' }]}>
                <Feather name="more-horizontal" size={20} color={isDark ? LIME : FOREST} />
              </View>
              <Text style={[styles.catLabel, { color: ink }]}>More</Text>
            </Pressable>
          </ScrollView>

          {/* Note */}
          <View style={[styles.noteBox, { backgroundColor: surface, borderColor: line }]}>
            <Feather name="edit-3" size={16} color={muted} />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={isOut ? 'Add a note, like Swiggy dinner' : 'Add a note, like October salary'}
              placeholderTextColor={muted}
              style={[styles.noteInput, { color: ink }]}
              maxLength={50}
              accessibilityLabel="Note"
            />
          </View>

          {/* When */}
          <View style={styles.whenRow}>
            {(['today', 'yesterday'] as When[]).map((w) => {
              const active = when === w;
              return (
                <Pressable
                  key={w}
                  onPress={() => setWhen(w)}
                  style={[
                    styles.whenChip,
                    active
                      ? { backgroundColor: isDark ? LIME : FOREST, borderColor: 'transparent' }
                      : { backgroundColor: surface, borderColor: line },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  {active && <Feather name="check" size={13} color={isDark ? FOREST : '#FFFFFF'} />}
                  <Text style={[styles.whenText, { color: active ? (isDark ? FOREST : '#FFFFFF') : ink }, active && { fontWeight: '700' }]}>
                    {w === 'today' ? 'Today' : 'Yesterday'}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={[
                styles.whenChip,
                when === 'custom'
                  ? { backgroundColor: isDark ? LIME : FOREST, borderColor: 'transparent' }
                  : { backgroundColor: surface, borderColor: line },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: when === 'custom' }}
              accessibilityLabel={when === 'custom' ? `Date ${format(customDate, 'd MMMM, HH:mm')}. Change` : 'Pick a date and time'}
            >
              <Feather name="calendar" size={13} color={when === 'custom' ? (isDark ? FOREST : '#FFFFFF') : muted} />
              <Text
                style={[
                  styles.whenText,
                  { color: when === 'custom' ? (isDark ? FOREST : '#FFFFFF') : ink },
                  when === 'custom' && { fontWeight: '700' },
                ]}
              >
                {when === 'custom' ? format(customDate, 'd MMM, HH:mm') : 'Pick date'}
              </Text>
            </Pressable>
          </View>

          {errorText ? (
            <Animated.View entering={FadeIn.duration(200)} style={styles.errorRow}>
              <Feather name="alert-circle" size={14} color={isDark ? '#FFA8A8' : '#C92A2A'} />
              <Text style={[styles.errorText, { color: isDark ? '#FFA8A8' : '#C92A2A' }]}>{errorText}</Text>
            </Animated.View>
          ) : null}
        </ScrollView>

        {/* Confirm */}
        <View style={[styles.footer, { backgroundColor: pageBg, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <Pressable
            onPress={submit}
            disabled={loading}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: isOut ? RED : isDark ? LIME : FOREST, opacity: parsedAmount > 0 ? 1 : 0.55 },
              pressed && parsedAmount > 0 && { transform: [{ scale: 0.98 }] },
            ]}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color={isOut ? '#FFFFFF' : isDark ? FOREST : LIME} />
            ) : (
              <Text style={[styles.ctaText, { color: isOut ? '#FFFFFF' : isDark ? FOREST : LIME }]}>{ctaLabel}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Success */}
      {success && (
        <Animated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, styles.successWrap, { backgroundColor: pageBg }]}>
          <Animated.View
            entering={ZoomIn.springify().damping(12)}
            style={[styles.successCircle, { backgroundColor: success.type === 'debit' ? RED : FOREST }]}
          >
            <Feather name="check" size={44} color={success.type === 'debit' ? '#FFFFFF' : LIME} />
          </Animated.View>
          <Animated.Text
            entering={FadeIn.delay(180).duration(300)}
            style={[styles.successTitle, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}
          >
            {inr(success.amount)} {success.type === 'debit' ? 'expense added' : 'income added'}
          </Animated.Text>
          <Animated.Text entering={FadeIn.delay(260).duration(300)} style={[styles.successSub, { color: muted }]}>
            {bank.bankName} •• {bank.accountNumberSuffix} updated
          </Animated.Text>
        </Animated.View>
      )}

      {/* Change account */}
      <Modal visible={bankSheet} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setBankSheet(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setBankSheet(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { backgroundColor: surface, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <View style={[styles.grabber, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#D5DED9' }]} />
            <Text style={[styles.sheetTitle, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
              {isOut ? 'Pay from' : 'Received in'}
            </Text>
            <Text style={[styles.sheetSub, { color: muted }]}>Pick the account this money moved in.</Text>
            <ScrollView style={{ maxHeight: 360, marginTop: 8 }}>
              {bankProfiles.map((b, i) => {
                const selected = b.id === bank.id;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => {
                      setBank(b);
                      setBankSheet(false);
                    }}
                    style={[styles.bankRow, i < bankProfiles.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <BankIcon name={b.bankName} code="" size={38} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.bankRowName, { color: ink }]} numberOfLines={1}>{b.bankName}</Text>
                      <Text style={[styles.bankRowSub, { color: muted }]}>
                        {b.accountType || 'Savings'} ending {b.accountNumberSuffix}
                      </Text>
                    </View>
                    <Text style={[styles.bankRowBal, { color: ink }]}>{inr(Number(b.currentBalance) || 0)}</Text>
                    <View style={[styles.radio, { borderColor: selected ? (isDark ? LIME : FOREST) : line }]}>
                      {selected && <View style={[styles.radioDot, { backgroundColor: isDark ? LIME : FOREST }]} />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              onPress={() => {
                setBankSheet(false);
                navigation?.navigate?.('Main', { screen: 'Banks' });
              }}
              style={[styles.linkBank, { borderColor: isDark ? 'rgba(255,255,255,0.3)' : '#9DB2A7' }]}
            >
              <Feather name="plus" size={15} color={isDark ? LIME : FOREST} />
              <Text style={[styles.linkBankText, { color: isDark ? LIME : FOREST }]}>Link another account</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Date and time (global picker) */}
      <DateTimePickerSheet
        visible={pickerOpen}
        mode="datetime"
        title="When did this happen?"
        value={when === 'custom' ? customDate : new Date()}
        maximumDate={new Date()}
        onClose={() => setPickerOpen(false)}
        onConfirm={(d) => {
          // Picking today's date and the current minute is the same as "Today"
          const now = new Date();
          if (isSameDay(d, now) && Math.abs(now.getTime() - d.getTime()) < 60000) {
            setWhen('today');
          } else {
            setCustomDate(d);
            setWhen('custom');
          }
          setPickerOpen(false);
        }}
      />

      {/* Full category picker */}
      <TagPaymentModal
        visible={tagSheet}
        onClose={() => setTagSheet(false)}
        selectedTag={category}
        onSelectTag={(tag) => setCategory(tag)}
        isDark={isDark}
        colors={colors}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  band: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingHorizontal: 16, paddingBottom: 22 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  bankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'center',
    maxWidth: '92%',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 14,
  },
  bankName: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  pencil: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },

  segment: { flexDirection: 'row', alignSelf: 'center', width: 260, borderRadius: 999, padding: 4, marginTop: 18 },
  segmentIndicator: { position: 'absolute', top: 4, left: 4, width: 126, height: 40, borderRadius: 999 },
  segmentBtn: { flex: 1, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segmentText: { fontSize: 14, fontWeight: '600' },

  amountRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', marginTop: 22, paddingHorizontal: 12 },
  rupee: { fontSize: 30, fontWeight: '700', marginTop: 8, marginRight: 4 },
  amount: { fontSize: 64, letterSpacing: -2.5, lineHeight: 72, maxWidth: '86%' },
  caret: { width: 3, height: 54, borderRadius: 2, marginTop: 9, marginLeft: 4 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },

  preview: { textAlign: 'center', fontSize: 13, marginTop: 10 },
  warnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  warnText: { fontSize: 12, fontWeight: '600' },
  quickRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  quickChip: { height: 36, paddingHorizontal: 12, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 13, fontWeight: '600' },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700' },
  link: { fontSize: 13, fontWeight: '600' },
  catRow: { paddingHorizontal: 10, paddingTop: 6, gap: 2 },
  catItem: { width: 72, alignItems: 'center', gap: 8 },
  catLabel: { fontSize: 12, fontWeight: '600', maxWidth: 70 },
  moreTile: { width: 52, height: 52, borderRadius: 17, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },

  noteBox: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, marginHorizontal: 16, marginTop: 20 },
  noteInput: { flex: 1, fontSize: 15, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  whenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  whenChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1 },
  whenText: { fontSize: 13, fontWeight: '600' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginTop: 14 },
  errorText: { fontSize: 13, fontWeight: '600', flex: 1 },

  footer: { paddingHorizontal: 16, paddingTop: 10 },
  cta: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },

  successWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  successCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 24, letterSpacing: -0.5, marginTop: 22, textAlign: 'center' },
  successSub: { fontSize: 14, marginTop: 6, textAlign: 'center' },

  backdrop: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, width: '100%', maxWidth: 640, alignSelf: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center' },
  sheetTitle: { fontSize: 22, letterSpacing: -0.4, marginTop: 18 },
  sheetSub: { fontSize: 14, marginTop: 4 },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  bankRowName: { fontSize: 15, fontWeight: '600' },
  bankRowSub: { fontSize: 12, marginTop: 2 },
  bankRowBal: { fontSize: 14, fontWeight: '700' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  linkBank: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 50, borderRadius: 25, borderWidth: 1, borderStyle: 'dashed', marginTop: 12 },
  linkBankText: { fontSize: 14, fontWeight: '700' },
});