// src/features/voice/VoiceReview.tsx
//
// Review what Regent heard before it is saved. Same layout as the transaction detail
// screen (coloured band, amount, date and account chips, category and note rows), so there
// is nothing new to learn: tap anything to fix it, then add.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, Platform, Modal, ScrollView } from 'react-native';
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
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { format } from 'date-fns';
import { useTheme, useBankStore } from '../../store';
import { TagPaymentModal } from '../../components/TagPaymentModal';
import { DateTimePickerSheet } from '../../components/DateTimePickerSheet';
import { CategoryIcon } from '../../components/CategoryIcon';
import { BankIcon } from '../../components/BankIcon';
import { getCategory } from '../../constants/categories';
import { getBankCode, niceName } from '../../constants/bankBrand';
import { isCashProfile } from '../../services/cashService';
import { tagLearningService } from '../../services/tagLearningService';
import { addTransaction } from '../../services/addTransaction';
import {
  VoiceDraft,
  resolveDraftAccount,
  resolveDraftCategory,
  resolveDraftTimestamp,
} from '../../services/voiceEntryService';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

export interface VoiceReviewProps {
  drafts: VoiceDraft[];
  transcript: string;
  /** Back arrow: leave voice entry without saving what is left. */
  onClose: () => void;
  /** Mic button: throw this away and record again. */
  onSpeakAgain: () => void;
  /** Every draft was added or skipped. `added` is how many were saved. */
  onFinished: (added: number) => void;
}

const firstWord = (s: string) => s.split(/\s+/)[0] || s;

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

const inr = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const formatWhen = (ts: number) => {
  const d = new Date(ts);
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'd MMM, HH:mm' : 'd MMM yyyy, HH:mm');
};

/** Shows the drafts one at a time. Each one gets a fresh form, so nothing leaks between them. */
export const VoiceReview: React.FC<VoiceReviewProps> = ({ drafts, transcript, onClose, onSpeakAgain, onFinished }) => {
  const [index, setIndex] = useState(0);
  const addedRef = useRef(0);
  const draft = drafts[Math.min(index, drafts.length - 1)];
  if (!draft) return null;
  return (
    <DraftForm
      key={index}
      draft={draft}
      index={index}
      total={drafts.length}
      transcript={transcript}
      onClose={onClose}
      onSpeakAgain={onSpeakAgain}
      onDone={(added) => {
        if (added) addedRef.current += 1;
        if (index < drafts.length - 1) setIndex(index + 1);
        else onFinished(addedRef.current);
      }}
    />
  );
};

interface DraftFormProps {
  draft: VoiceDraft;
  index: number;
  total: number;
  transcript: string;
  onClose: () => void;
  onSpeakAgain: () => void;
  /** This draft is finished: `added` is true when it was saved, false when skipped. */
  onDone: (added: boolean) => void;
}

const DraftForm: React.FC<DraftFormProps> = ({ draft, index, total, transcript, onClose, onSpeakAgain, onDone }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const bankProfiles = useBankStore((s) => s.bankProfiles);

  const [type, setType] = useState<'debit' | 'credit'>(draft.type);
  const [amountStr, setAmountStr] = useState(draft.amount ? String(draft.amount) : '');
  const [category, setCategory] = useState(() => resolveDraftCategory(draft));
  const [note, setNote] = useState(draft.merchant);
  const [timestamp, setTimestamp] = useState(() => resolveDraftTimestamp(draft));
  const [account, setAccount] = useState(() => resolveDraftAccount(draft.account));
  const [amountChecked, setAmountChecked] = useState(draft.amountVerified && draft.amount !== null);
  const [rememberRule, setRememberRule] = useState<boolean | null>(null);

  const [editingAmount, setEditingAmount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [tagSheet, setTagSheet] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [bankModalOpen, setBankModalOpen] = useState(false);

  const amountRef = useRef<TextInput>(null);
  const display =
    typeof Font?.isLoaded === 'function' && Font.isLoaded('BricolageGrotesque_800ExtraBold')
      ? 'BricolageGrotesque_800ExtraBold'
      : undefined;

  const caret = useSharedValue(1);
  useEffect(() => {
    caret.value = withRepeat(withSequence(withTiming(1, { duration: 450 }), withTiming(0, { duration: 450 })), -1);
  }, [caret]);
  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }));

  const selectedBank = useMemo(
    () => (account.id ? bankProfiles.find((b) => b.id === account.id) || null : null),
    [bankProfiles, account.id],
  );

  /* ---------------- Derived ---------------- */

  const isCredit = type === 'credit';
  const parsedAmount = parseFloat(amountStr) || 0;
  const catLabel = getCategory(category).label;
  const payee = niceName(note.trim()) || (isCredit ? 'Money received' : 'Payment');
  const bankName = selectedBank?.bankName;
  const currentBal = Number(selectedBank?.currentBalance) || 0;
  const newBal = isCredit ? currentBal + parsedAmount : currentBal - parsedAmount;
  const canSave = parsedAmount > 0 && !!selectedBank;

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const band = isCredit ? (isDark ? '#0F2A1E' : '#E4F4EA') : isDark ? '#2A1512' : '#FFEFEA';
  const accentText = isCredit ? (isDark ? LIME : '#0B6B3A') : isDark ? '#FFA8A8' : '#B42318';
  const chip = isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF';
  const line = isDark ? colors.border : '#E1E9E4';
  const red = isDark ? '#FFA8A8' : '#C92A2A';
  const warnBg = isDark ? 'rgba(234, 179, 8, 0.15)' : '#FEF3C7';
  const warnBorder = isDark ? 'rgba(234, 179, 8, 0.4)' : '#FDE68A';
  const warnText = isDark ? '#FEF08A' : '#B45309';
  const warnIcon = isDark ? '#FACC15' : '#D97706';

  const amountHint =
    parsedAmount <= 0
      ? 'Regent did not hear an amount. Tap to enter it'
      : !amountChecked
        ? 'Please check the amount'
        : null;

  /* ---------------- Actions ---------------- */

  const switchType = () => {
    const nextType = isCredit ? 'debit' : 'credit';
    setType(nextType);
    // Keep a category that fits the new direction
    const id = getCategory(category).id;
    if (nextType === 'credit' && !['salary', 'money_received', 'investment', 'cashback', 'interest', 'self_transfer'].includes(id)) {
      setCategory('money_received');
    } else if (nextType === 'debit' && ['salary', 'money_received', 'cashback', 'interest'].includes(id)) {
      setCategory('miscellaneous');
    }
  };

  const save = async () => {
    if (saving) return;
    if (parsedAmount <= 0) {
      setErrorText('Enter an amount above ₹0.');
      setEditingAmount(true);
      setTimeout(() => amountRef.current?.focus(), 30);
      return;
    }
    if (!selectedBank) {
      setErrorText('Choose which account this belongs to.');
      setBankModalOpen(true);
      return;
    }
    setSaving(true);
    setErrorText('');
    try {
      await addTransaction({
        bankProfileId: selectedBank.id,
        type,
        amount: parsedAmount,
        category,
        note: note.trim(),
        timestamp,
      });
      if (rememberRule && note.trim()) tagLearningService.saveLearnedTag(note.trim(), category).catch(() => {});
      setSaved(true);
      setTimeout(() => onDone(true), 850);
    } catch (e: any) {
      setErrorText(e?.message || 'Could not save this transaction. Try again.');
    } finally {
      setSaving(false);
    }
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
            <Pressable onPress={onClose} style={[styles.roundBtn, { backgroundColor: chip }]} accessibilityRole="button" accessibilityLabel="Back">
              <Feather name="arrow-left" size={20} color={ink} />
            </Pressable>
            <Pressable
              onPress={switchType}
              style={({ pressed }) => [styles.typeTag, { backgroundColor: chip }, pressed && { opacity: 0.75 }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${isCredit ? 'Money in' : 'Money out'}. Tap to switch`}
            >
              <Feather name={isCredit ? 'arrow-down-left' : 'arrow-up-right'} size={14} color={accentText} />
              <Text style={[styles.typeText, { color: accentText }]}>{isCredit ? 'Money in' : 'Money out'}</Text>
              <Feather name="repeat" size={12} color={muted} style={{ marginLeft: 2 }} />
            </Pressable>
            <Pressable onPress={onSpeakAgain} style={[styles.roundBtn, { backgroundColor: chip }]} accessibilityRole="button" accessibilityLabel="Speak again">
              <Feather name="mic" size={18} color={ink} />
            </Pressable>
          </View>

          <Animated.View key={`icon_${index}`} entering={ZoomIn.duration(200).withInitialValues({ scale: 0.9 })} style={{ marginTop: 12 }}>
            <CategoryIcon category={category} size={60} />
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
                setAmountChecked(true);
                if (errorText) setErrorText('');
              }}
              onBlur={() => setEditingAmount(false)}
              keyboardType="decimal-pad"
              caretHidden
              style={styles.hiddenInput}
              accessibilityLabel="Amount in rupees"
            />
          </Pressable>

          {amountHint ? (
            <View style={[styles.hint, { backgroundColor: warnBg, borderColor: warnBorder }]}>
              <Feather name="alert-circle" size={13} color={warnIcon} />
              <Text style={[styles.hintText, { color: warnText }]}>{amountHint}</Text>
            </View>
          ) : selectedBank && parsedAmount > 0 ? (
            <Text style={[styles.impact, { color: muted }]}>
              {firstWord(bankName || '')} balance will be {newBal < 0 ? '−' : ''}{inr(newBal)}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <Pressable
              onPress={() => setDatePickerOpen(true)}
              style={({ pressed }) => [styles.metaChip, { backgroundColor: chip }, pressed && { opacity: 0.75 }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Date and time ${formatWhen(timestamp)}. Tap to edit`}
            >
              <Feather name="calendar" size={13} color={ink} />
              <Text style={[styles.metaText, { color: ink }]}>{formatWhen(timestamp)}</Text>
              <Feather name="edit-2" size={11} color={muted} style={{ marginLeft: 3 }} />
            </Pressable>

            {selectedBank ? (
              <Pressable
                onPress={() => setBankModalOpen(true)}
                style={({ pressed }) => [
                  styles.metaChip,
                  { backgroundColor: chip, paddingLeft: 4 },
                  !account.said && { borderWidth: 1, borderColor: warnBorder },
                  pressed && { opacity: 0.75 },
                ]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Account ${bankName}${account.said ? '' : ', not said, please check'}. Tap to change`}
              >
                {isCashProfile(selectedBank) ? (
                  <View style={styles.cashDot}>
                    <MaterialCommunityIcons name="cash" size={16} color={FOREST} />
                  </View>
                ) : (
                  <BankIcon code={getBankCode(bankName)} name={bankName || ''} size={26} />
                )}
                <Text style={[styles.metaText, { color: ink }]} numberOfLines={1}>
                  {firstWord(bankName || '')}
                  {selectedBank.accountNumberSuffix ? ` •• ${selectedBank.accountNumberSuffix}` : ''}
                </Text>
                <Feather name="chevron-down" size={12} color={muted} style={{ marginLeft: 2 }} />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setBankModalOpen(true)}
                style={({ pressed }) => [
                  styles.metaChip,
                  { backgroundColor: warnBg, borderColor: warnBorder, borderWidth: 1 },
                  pressed && { opacity: 0.75 },
                ]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="No account chosen. Tap to choose"
              >
                <Feather name="plus-circle" size={13} color={warnIcon} />
                <Text style={[styles.metaText, { color: warnText, fontWeight: '700' }]}>Choose account</Text>
              </Pressable>
            )}
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

          <View style={styles.row}>
            <View style={[styles.noteIcon, { backgroundColor: pageBg }]}>
              <Feather name="mic" size={16} color={muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: muted }]}>You said</Text>
              <Text style={[styles.saidText, { color: ink }]} numberOfLines={3}>
                {transcript}
              </Text>
            </View>
          </View>
        </Animated.View>

        {errorText ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.errorRow}>
            <Feather name="alert-circle" size={14} color={red} />
            <Text style={[styles.errorText, { color: red }]}>{errorText}</Text>
          </Animated.View>
        ) : null}

        <View style={{ flex: 1 }} />

        {/* Add */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          {total > 1 ? (
            <View style={styles.stepRow}>
              <Text style={[styles.stepText, { color: muted }]}>
                {index + 1} of {total}
              </Text>
              <Pressable onPress={() => onDone(false)} disabled={saving || saved} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip this one">
                <Text style={[styles.stepSkip, { color: ink }]}>Skip this one</Text>
              </Pressable>
            </View>
          ) : null}
          <Pressable
            onPress={save}
            disabled={saving || saved}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: isDark ? LIME : FOREST, opacity: canSave ? 1 : 0.5 },
              pressed && { transform: [{ scale: 0.98 }] },
            ]}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color={isDark ? FOREST : LIME} />
            ) : (
              <Text style={[styles.ctaText, { color: isDark ? FOREST : LIME }]}>
                {parsedAmount > 0 ? `Add ${inr(parsedAmount)} ${isCredit ? 'income' : 'expense'}` : 'Enter an amount'}
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
            {inr(parsedAmount)} added
          </Text>
        </Animated.View>
      )}

      <TagPaymentModal
        visible={tagSheet}
        onClose={() => setTagSheet(false)}
        selectedTag={category}
        onSelectTag={(tag, updateRule) => {
          setCategory(tag);
          if (updateRule !== undefined) setRememberRule(Boolean(updateRule));
        }}
        merchantName={niceName(note.trim()) || undefined}
        transactionType={type}
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

      {/* Account picker */}
      <Modal visible={bankModalOpen} transparent animationType="fade" onRequestClose={() => setBankModalOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setBankModalOpen(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: line }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: ink }]}>Which account?</Text>
              <Pressable
                onPress={() => setBankModalOpen(false)}
                style={[styles.sheetCloseBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EDF1EE' }]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Feather name="x" size={17} color={ink} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {bankProfiles.length === 0 ? (
                <Text style={[styles.emptyText, { color: muted }]}>
                  Add a bank account or a cash wallet from the Banks tab first, then come back.
                </Text>
              ) : null}
              {bankProfiles.map((b) => {
                const isSelected = account.id === b.id;
                const accent = isDark ? LIME : FOREST;
                const sub = `${b.accountNumberSuffix ? `••${b.accountNumberSuffix} · ` : ''}₹${Number(b.currentBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => {
                      setAccount({ id: b.id, said: true });
                      setBankModalOpen(false);
                      if (errorText) setErrorText('');
                    }}
                    style={({ pressed }) => [
                      styles.bankItem,
                      {
                        borderColor: isSelected ? accent : 'transparent',
                        backgroundColor: isSelected ? (isDark ? 'rgba(184,243,107,0.08)' : '#FFFFFF') : 'transparent',
                      },
                      pressed && !isSelected && { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#EEF3F0' },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${b.bankName}, ${sub}`}
                  >
                    {isCashProfile(b) ? (
                      <View style={[styles.cashIcon, { borderColor: line, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF' }]}>
                        <MaterialCommunityIcons name="cash" size={22} color={muted} />
                      </View>
                    ) : (
                      <BankIcon code={getBankCode(b.bankName)} name={b.bankName} size={40} />
                    )}
                    <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                      <Text style={[styles.bankItemName, { color: ink }]} numberOfLines={1}>{b.bankName}</Text>
                      <Text style={[styles.bankItemBalance, { color: muted }]} numberOfLines={1}>{sub}</Text>
                    </View>
                    <View
                      style={[
                        styles.radioCircle,
                        isSelected ? { backgroundColor: accent, borderColor: accent } : { borderColor: isDark ? colors.border : '#CBD5CF' },
                      ]}
                    >
                      {isSelected && <Feather name="check" size={13} color={isDark ? FOREST : LIME} />}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  band: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingHorizontal: 16, paddingBottom: 24, alignItems: 'center' },
  headerRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  typeTag: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 18 },
  typeText: { fontSize: 13, fontWeight: '700' },

  payee: { fontSize: 17, fontWeight: '600', marginTop: 12, maxWidth: '90%' },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', marginTop: 8 },
  amountSign: { fontSize: 28, fontWeight: '700', marginTop: 8, marginRight: 2 },
  amount: { fontSize: 60, letterSpacing: -2.4, lineHeight: 66, maxWidth: 260 },
  caret: { width: 3, height: 50, borderRadius: 2, marginTop: 8, marginLeft: 4 },
  editDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 12, marginLeft: 8 },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  impact: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 30, borderRadius: 15, borderWidth: 1, marginTop: 6 },
  hintText: { fontSize: 12, fontWeight: '700' },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 14 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, maxWidth: 220 },
  metaText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  cashDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#E4F4EA', alignItems: 'center', justifyContent: 'center' },

  group: { marginHorizontal: 16, marginTop: 18, borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 60 },
  rowLabel: { fontSize: 12 },
  rowValue: { fontSize: 15, fontWeight: '700', marginTop: 1 },
  rowAction: { fontSize: 13, fontWeight: '600' },
  noteIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  noteInput: { fontSize: 15, fontWeight: '600', paddingVertical: 0, marginTop: 1, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  saidText: { fontSize: 14, fontWeight: '500', lineHeight: 19, marginTop: 1 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, marginTop: 12 },
  errorText: { fontSize: 13, fontWeight: '600', flex: 1 },

  footer: { paddingHorizontal: 16, paddingTop: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 10 },
  stepText: { fontSize: 13, fontWeight: '600' },
  stepSkip: { fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  cta: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },

  savedWrap: { alignItems: 'center', justifyContent: 'center' },
  savedCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  savedText: { fontSize: 24, marginTop: 18 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, borderWidth: 1, borderBottomWidth: 0 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.4)', alignSelf: 'center', marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingHorizontal: 2 },
  sheetTitle: { fontSize: 21, fontWeight: '700', letterSpacing: -0.3 },
  sheetCloseBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, paddingVertical: 16, paddingHorizontal: 4 },
  bankItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 18, borderWidth: 1, marginBottom: 4 },
  bankItemName: { fontSize: 15, fontWeight: '600' },
  bankItemBalance: { fontSize: 12.5, marginTop: 2, fontVariant: ['tabular-nums'] },
  radioCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cashIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
