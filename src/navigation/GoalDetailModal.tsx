// src/navigation/GoalDetailModal.tsx
//
// One goal in full: photo that fills with colour as you save, a milestone path,
// your monthly plan, linked account, history, and one big "Add money" button.
// Every sub-sheet (add, take out, history item, options, edit plan, account,
// move money) opens inside this one modal so the keyboard behaves on Android.

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  useWindowDimensions,
  Image,
  ActivityIndicator,
  Keyboard,
  BackHandler,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut, SlideInDown, ZoomIn, useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { useTheme, Goal, SavingsEntry, useBankStore, useGoalsStore, showGlobalConfirm } from '../store';
import {
  getGoalPacing,
  goalService,
  GOAL_CATEGORIES,
  calculateRequiredMonthly,
  calculateRequiredMonths,
  getStrategyRecommendation,
  formatIndianCompactAmount,
} from '../services/goalService';
import { getBankAllocationSummary, validateBankDeposit, formatBankOptionSubtitle } from '../features/goals/services/goalBankAllocationService';
import { formatIndianFullRupees, formatIndianCompactRupees } from '../features/goals/services/goalNudgeTemplates';
import { GoalImagePickerModal } from '../features/goals/components/GoalImagePickerModal';
import { getCoverImageUri } from '../features/goals/services/goalIllustrationMap';
import { BankIcon } from '../components/BankIcon';
import { getBankCode } from '../constants/bankBrand';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
const MILESTONES = [25, 50, 75, 100];

type Sheet = null | 'deposit' | 'withdraw' | 'entry' | 'options' | 'edit' | 'bank' | 'deploy';

const toDate = (v: string | number | undefined) => {
  if (!v) return null;
  const raw = String(v).trim();
  const d = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw.length === 7 ? `${raw}-01T00:00:00` : raw);
  return isNaN(d.getTime()) ? null : d;
};
const shortDate = (v: any) => toDate(v)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) || '';
const longDate = (v: any) => toDate(v)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) || '';
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

interface GoalDetailModalProps {
  goal: Goal | null;
  visible: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export const GoalDetailModal: React.FC<GoalDetailModalProps> = ({ goal, visible, onClose, onUpdated }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const heading = { fontFamily: display, fontWeight: display ? undefined : ('800' as const) };

  const bankProfiles = useBankStore((s) => s.bankProfiles);
  const allGoals = useGoalsStore((s) => s.goals);
  const updateGoal = useGoalsStore((s) => s.updateGoal);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [sheetError, setSheetError] = useState('');
  const [busy, setBusy] = useState(false);
  const [heroWidth, setHeroWidth] = useState(0);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [celebrate, setCelebrate] = useState<null | { title: string; text: string }>(null);

  // Add / take out
  const [amountStr, setAmountStr] = useState('');
  const [note, setNote] = useState('');
  // History item
  const [selectedEntry, setSelectedEntry] = useState<SavingsEntry | null>(null);
  // Edit plan
  const [editName, setEditName] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editMode, setEditMode] = useState<'by_date' | 'by_monthly'>('by_date');
  const [editMonths, setEditMonths] = useState(12);
  const [editMonthly, setEditMonthly] = useState('');
  const [editPriority, setEditPriority] = useState<'high' | 'medium' | 'low'>('medium');
  // Move money (wealth stash)
  const [deployAmount, setDeployAmount] = useState('');
  const [deployName, setDeployName] = useState('');
  const [deployCategory, setDeployCategory] = useState('travel');
  const [deployTarget, setDeployTarget] = useState('');

  const activeGoal = useMemo(() => (goal ? allGoals.find((g) => g.id === goal.id) || goal : null), [goal, allGoals]);

  // Sync history from the server when opened
  useEffect(() => {
    if (!visible || !activeGoal?.id) return;
    goalService
      .getGoalHistory(activeGoal.id)
      .then((history: any[]) => {
        if (Array.isArray(history) && history.length > 0) {
          updateGoal(activeGoal.id, {
            entries: history.map((h: any) => ({ id: h.id, amount: parseFloat(String(h.amount || 0)), at: h.at, type: h.type, note: h.note || undefined })),
          });
        }
      })
      .catch((err: any) => console.warn('[GoalDetail] History fetch failed:', err));
  }, [visible, activeGoal?.id]);

  // Android back closes the top sheet first
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (celebrate) {
        setCelebrate(null);
        return true;
      }
      if (sheet) {
        Keyboard.dismiss();
        setSheet(null);
        setSheetError('');
        setSelectedEntry(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [visible, sheet, celebrate]);

  const linkedBank = useMemo(() => (activeGoal?.linkedBankId ? bankProfiles.find((b) => b.id === activeGoal.linkedBankId) || null : null), [activeGoal?.linkedBankId, bankProfiles]);
  const bankSummary = useMemo(() => (linkedBank ? getBankAllocationSummary(linkedBank, allGoals) : null), [linkedBank, allGoals]);
  const coverUri = useMemo(() => (activeGoal ? getCoverImageUri(activeGoal) : ''), [activeGoal]);
  const pacing = useMemo(() => (activeGoal ? getGoalPacing(activeGoal) : null), [activeGoal]);

  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(Math.min(100, pacing?.progressPercent || 0), { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [pacing?.progressPercent]);
  const pathStyle = useAnimatedStyle(() => ({ width: `${fill.value}%` }));

  // Edit plan maths (unchanged)
  const parsedEditTarget = Math.max(1000, parseFloat(editTarget) || 0);
  const editSaved = activeGoal?.currentAmount || 0;
  const editStrategy = useMemo(
    () => (activeGoal ? getStrategyRecommendation(editMonths, activeGoal.category) : { title: 'Balanced', expectedReturn: 8.5 }),
    [editMonths, activeGoal?.category]
  );
  const editSolvedMonthly = useMemo(
    () => calculateRequiredMonthly(parsedEditTarget, editSaved, editMonths, editStrategy.expectedReturn),
    [parsedEditTarget, editSaved, editMonths, editStrategy.expectedReturn]
  );
  const parsedEditMonthly = Math.max(100, parseFloat(editMonthly) || editSolvedMonthly);
  const editSolvedMonths = useMemo(
    () => calculateRequiredMonths(parsedEditTarget, editSaved, parsedEditMonthly, editStrategy.expectedReturn),
    [parsedEditTarget, editSaved, parsedEditMonthly, editStrategy.expectedReturn]
  );
  const effectiveMonths = editMode === 'by_date' ? editMonths : editSolvedMonths;
  const effectiveMonthly = editMode === 'by_date' ? editSolvedMonthly : parsedEditMonthly;
  const effectiveDateLabel = new Date(Date.now() + effectiveMonths * 30 * 86400000).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  if (!activeGoal || !pacing) return null;

  /* ---------------- Derived ---------------- */

  const pct = Math.min(100, Math.max(0, pacing.progressPercent));
  const remaining = Math.max(0, activeGoal.targetAmount - activeGoal.currentAmount);
  const requiredMonthly = remaining > 0 ? Math.ceil(remaining / Math.max(1, pacing.monthsLeft)) : 0;
  const isStash = activeGoal.category === 'wealth_stash' || !!activeGoal.isMilestoneBased;
  const done = pct >= 100;
  const targetDateLabel = toDate(activeGoal.targetDate)?.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) || null;
  const nextMilestone = MILESTONES.find((m) => pct < m) || 100;
  const toNext = Math.max(0, (activeGoal.targetAmount * nextMilestone) / 100 - activeGoal.currentAmount);
  const entries = [...(activeGoal.entries || [])].sort((a, b) => (toDate(b.at)?.getTime() || 0) - (toDate(a.at)?.getTime() || 0));

  /* ---------------- Theme ---------------- */

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const field = isDark ? colors.border : '#DCE5E0';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const accentInk = isDark ? FOREST : '#FFFFFF';
  const green = isDark ? LIME : '#0B6B3A';
  const red = isDark ? '#FFA8A8' : '#C92A2A';
  const softGreen = isDark ? 'rgba(184,243,107,0.12)' : '#E3F2E8';

  /* ---------------- Actions ---------------- */

  const closeSheet = () => {
    Keyboard.dismiss();
    setSheet(null);
    setSheetError('');
    setSelectedEntry(null);
  };
  const openSheet = (s: Sheet) => {
    setSheetError('');
    setSheet(s);
  };
  const refresh = () => onUpdated?.();

  const openAdd = (preset?: number) => {
    setAmountStr(preset ? String(preset) : '');
    setNote('');
    openSheet('deposit');
  };
  const openWithdraw = () => {
    setAmountStr('');
    setNote('');
    openSheet('withdraw');
  };

  const confirmMoney = async () => {
    const value = parseFloat(amountStr);
    if (!value || value <= 0) return;
    setBusy(true);
    setSheetError('');
    try {
      if (sheet === 'deposit') {
        if (linkedBank) {
          const v = validateBankDeposit(linkedBank, allGoals, value, activeGoal.id);
          if (!v.valid) throw new Error(v.errorMessage || `${linkedBank.bankName} doesn’t have that much free.`);
        }
        const before = pct;
        const after = Math.min(100, ((activeGoal.currentAmount + value) / activeGoal.targetAmount) * 100);
        await goalService.contribute(activeGoal.id, value, note.trim() || undefined);
        closeSheet();
        refresh();
        const crossed = [...MILESTONES].reverse().find((m) => before < m && after >= m);
        if (crossed === 100) setCelebrate({ title: 'Goal reached', text: `You saved the full ${inr(activeGoal.targetAmount)} for ${activeGoal.name}.` });
        else if (crossed) setCelebrate({ title: `${crossed}% there`, text: `${inr(activeGoal.targetAmount - activeGoal.currentAmount - value)} left for ${activeGoal.name}. Keep going.` });
      } else {
        if (value > activeGoal.currentAmount) throw new Error(`You can take out up to ${inr(activeGoal.currentAmount)}.`);
        await goalService.withdraw(activeGoal.id, value, note.trim() || undefined);
        closeSheet();
        refresh();
      }
    } catch (e: any) {
      setSheetError(e?.message || 'That didn’t go through. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const deleteEntry = (entry: SavingsEntry) => {
    const amt = inr(Number(entry.amount));
    showGlobalConfirm({
      title: 'Delete this entry?',
      message: entry.type === 'withdraw' ? `${amt} goes back into ${activeGoal.name}.` : `${amt} comes off ${activeGoal.name}.`,
      confirmText: 'Delete',
      cancelText: 'Keep it',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: async () => {
        await goalService.deleteEntry(activeGoal.id, entry.id);
        closeSheet();
        refresh();
      },
    });
  };

  const openEdit = () => {
    setEditName(activeGoal.name);
    setEditTarget(String(activeGoal.targetAmount));
    const t = toDate(activeGoal.targetDate)?.getTime();
    setEditMonths(t ? Math.max(1, Math.ceil((t - Date.now()) / (30 * 86400000))) : 12);
    const m = activeGoal.committedMonthly || activeGoal.monthlyContribution || requiredMonthly;
    setEditMonthly(m > 0 ? String(m) : '');
    setEditMode(isStash ? 'by_monthly' : 'by_date');
    setEditPriority((activeGoal.priority as any) || 'medium');
    openSheet('edit');
  };

  const saveEdit = async () => {
    if (!editName.trim()) return setSheetError('Give your goal a name.');
    if (parsedEditTarget < editSaved) return setSheetError(`The target can’t be less than the ${inr(editSaved)} you’ve already saved.`);
    setBusy(true);
    setSheetError('');
    try {
      const finalMonths = editMode === 'by_date' ? editMonths : editSolvedMonths;
      await goalService.updateGoal(activeGoal.id, {
        name: editName.trim(),
        targetAmount: parsedEditTarget,
        targetDate: new Date(Date.now() + finalMonths * 30 * 86400000).toISOString().slice(0, 10),
        committedMonthly: effectiveMonthly,
        monthlyContribution: effectiveMonthly,
        priority: editPriority,
      });
      closeSheet();
      refresh();
    } catch (e: any) {
      setSheetError(e?.message || 'Couldn’t save your plan. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const selectBank = async (bankId: string | null) => {
    setSheetError('');
    try {
      if (bankId) {
        const target = bankProfiles.find((b) => b.id === bankId);
        if (target) {
          const v = validateBankDeposit(target, allGoals, activeGoal.currentAmount, activeGoal.id);
          if (!v.valid) return setSheetError(v.errorMessage || 'That account doesn’t have enough free money for this goal.');
        }
      }
      await goalService.updateGoal(activeGoal.id, { linkedBankId: bankId || undefined });
      closeSheet();
      refresh();
    } catch (e: any) {
      setSheetError(e?.message || 'Couldn’t change the account. Try again.');
    }
  };

  const giveUp = () => {
    closeSheet();
    showGlobalConfirm({
      title: `Delete ${activeGoal.name}?`,
      message: 'The goal and its history will be removed. Money in your bank isn’t affected.',
      confirmText: 'Delete goal',
      cancelText: 'Keep goal',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: async () => {
        await goalService.deleteGoal(activeGoal.id);
        onClose();
        refresh();
      },
    });
  };

  const levelUp = async () => {
    try {
      await goalService.advanceMilestone(activeGoal.id, 100000);
      refresh();
    } catch (e: any) {
      console.warn('[GoalDetail] Milestone failed:', e);
    }
  };

  const deploy = async () => {
    const amt = parseFloat(deployAmount);
    if (!amt || amt <= 0) return setSheetError('Enter an amount to move.');
    if (amt > activeGoal.currentAmount) return setSheetError(`You can move up to ${inr(activeGoal.currentAmount)}.`);
    if (!deployName.trim()) return setSheetError('Name the new goal.');
    const cat = GOAL_CATEGORIES.find((c: any) => c.id === deployCategory) || GOAL_CATEGORIES[0];
    setBusy(true);
    setSheetError('');
    try {
      await goalService.deployCapital(activeGoal.id, amt, {
        name: deployName.trim(),
        category: deployCategory,
        targetAmount: parseFloat(deployTarget) || Math.max(amt, cat.defaultAmount),
        targetMonths: cat.typicalMonths,
        color: cat.color,
        icon: cat.icon,
      });
      setDeployAmount('');
      setDeployName('');
      setDeployTarget('');
      closeSheet();
      refresh();
    } catch (e: any) {
      setSheetError(e?.message || 'Couldn’t move the money. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const saveCover = async (patch: Partial<Goal>) => {
    updateGoal(activeGoal.id, patch);
    setImagePickerOpen(false);
    try {
      await goalService.updateGoal(activeGoal.id, patch);
    } catch (e) {
      console.warn('[GoalDetail] Cover save failed:', e);
    }
    refresh();
  };

  /* ---------------- Pieces ---------------- */

  const Label = ({ children }: { children: React.ReactNode }) => <Text style={[s.label, { color: muted }]}>{children}</Text>;

  const Chip = ({ label, on, onPress, key }: { label: string; on?: boolean; onPress: () => void; key?: React.Key }) => (
    <Pressable key={key} onPress={onPress} style={[s.chip, on ? { backgroundColor: accent, borderColor: accent } : { backgroundColor: surface, borderColor: field }]} accessibilityState={{ selected: !!on }}>
      <Text style={[s.chipText, { color: on ? accentInk : ink }, on && { fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );

  const AmountBox = ({ value, onChange, autoFocus, placeholder = '0' }: { value: string; onChange: (t: string) => void; autoFocus?: boolean; placeholder?: string }) => (
    <View style={[s.amountBox, { backgroundColor: pageBg, borderColor: field }]}>
      <Text style={[s.rupee, { color: muted }, heading]}>₹</Text>
      <TextInput
        value={value}
        onChangeText={(t) => {
          onChange(t.replace(/[^0-9.]/g, ''));
          if (sheetError) setSheetError('');
        }}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={muted}
        autoFocus={autoFocus}
        style={[s.amountInput, { color: ink }, heading]}
      />
    </View>
  );

  const Primary = ({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [s.primary, { backgroundColor: danger ? '#E03131' : accent, opacity: disabled ? 0.5 : 1 }, pressed && !disabled && { transform: [{ scale: 0.98 }] }]}
    >
      {busy ? <ActivityIndicator color={danger ? '#FFFFFF' : accentFg} /> : <Text style={[s.primaryText, { color: danger ? '#FFFFFF' : accentFg }]}>{label}</Text>}
    </Pressable>
  );

  const ErrorLine = () =>
    sheetError ? (
      <Animated.View entering={FadeIn.duration(200)} style={s.errorRow}>
        <Feather name="alert-circle" size={14} color={red} />
        <Text style={[s.errorText, { color: red }]}>{sheetError}</Text>
      </Animated.View>
    ) : null;

  /* ---------------- Sheets ---------------- */

  const renderSheet = () => {
    if (!sheet) return null;
    let title = '';
    let sub = '';
    let body: React.ReactNode = null;

    if (sheet === 'deposit' || sheet === 'withdraw') {
      const isDep = sheet === 'deposit';
      const v = parseFloat(amountStr) || 0;
      title = isDep ? 'Add money' : 'Take money out';
      sub = isDep ? `To ${activeGoal.name}` : `From ${activeGoal.name}, ${inr(activeGoal.currentAmount)} saved`;
      const quick = isDep
        ? Array.from(new Set([requiredMonthly, 500, 1000, 5000].filter((n) => n > 0 && n <= Math.max(remaining, 1000)))).slice(0, 3)
        : [];
      body = (
        <>
          {AmountBox({ value: amountStr, onChange: setAmountStr, autoFocus: true })}
          {isDep && (
            <View style={s.chipRow}>
              {quick.map((n) => Chip({ key: n, label: n === requiredMonthly ? `${inr(n)} plan` : inr(n), on: v === n, onPress: () => setAmountStr(String(n)) }))}
              {remaining > 0 && Chip({ label: `Rest ${formatIndianCompactRupees(remaining)}`, on: v === remaining, onPress: () => setAmountStr(String(remaining)) })}
            </View>
          )}
          {isDep && v > 0 && remaining > 0 && (
            <Text style={[s.preview, { color: muted }]}>
              {v >= remaining ? 'This reaches your goal.' : `Takes you to ${Math.min(99, Math.floor(((activeGoal.currentAmount + v) / activeGoal.targetAmount) * 100))}%, ${inr(remaining - v)} left.`}
            </Text>
          )}
          {Label({ children: isDep ? 'Note (optional)' : 'Reason (optional)' })}
          <View style={[s.textBox, { backgroundColor: pageBg, borderColor: field }]}>
            <TextInput value={note} onChangeText={setNote} placeholder={isDep ? 'Like salary or bonus' : 'Like an emergency'} placeholderTextColor={muted} style={[s.textInput, { color: ink }]} />
          </View>
          {ErrorLine()}
          {Primary({ label: v > 0 ? `${isDep ? 'Add' : 'Take out'} ${inr(v)}` : isDep ? 'Add money' : 'Take money out', onPress: confirmMoney, disabled: !(v > 0), danger: !isDep })}
        </>
      );
    }

    if (sheet === 'entry' && selectedEntry) {
      const e = selectedEntry;
      const out = e.type === 'withdraw';
      title = out ? 'Taken out' : e.type === 'opening' ? 'Starting amount' : 'Added';
      sub = longDate(e.at);
      body = (
        <>
          <Text style={[s.entryAmount, { color: out ? red : green }, heading]}>
            {out ? '−' : '+'}
            {inr(Number(e.amount))}
          </Text>
          <View style={[s.infoCard, { borderColor: line }]}>
            <Text style={[s.infoKey, { color: muted }]}>Note</Text>
            <Text style={[s.infoVal, { color: e.note ? ink : muted }]}>{e.note || 'No note'}</Text>
          </View>
          <Pressable onPress={() => deleteEntry(e)} style={[s.dangerRow, { borderColor: line }]}>
            <Feather name="trash-2" size={18} color={red} />
            <Text style={[s.dangerText, { color: red }]}>Delete entry</Text>
          </Pressable>
        </>
      );
    }

    if (sheet === 'options') {
      title = activeGoal.name;
      sub = 'Goal options';
      const rows: [keyof typeof Feather.glyphMap, string, () => void][] = [
        ['sliders', 'Change target or plan', openEdit],
        ['image', 'Change photo', () => { closeSheet(); setImagePickerOpen(true); }],
        ['credit-card', linkedBank ? 'Change linked account' : 'Link an account', () => openSheet('bank')],
      ];
      body = (
        <>
          <View style={[s.group, { borderColor: line }]}>
            {rows.map(([icon, label, fn], i) => (
              <Pressable key={label} onPress={fn} style={[s.groupRow, i < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}>
                <Feather name={icon} size={18} color={ink} />
                <Text style={[s.groupText, { color: ink }]}>{label}</Text>
                <Feather name="chevron-right" size={16} color={muted} />
              </Pressable>
            ))}
          </View>
          <Pressable onPress={giveUp} style={[s.dangerRow, { borderColor: line }]}>
            <Feather name="trash-2" size={18} color={red} />
            <Text style={[s.dangerText, { color: red }]}>Delete goal</Text>
          </Pressable>
        </>
      );
    }

    if (sheet === 'edit') {
      title = 'Change target or plan';
      sub = `${inr(editSaved)} saved so far`;
      body = (
        <>
          {Label({ children: "Name" })}
          <View style={[s.textBox, { backgroundColor: pageBg, borderColor: field }]}>
            <TextInput value={editName} onChangeText={setEditName} style={[s.textInput, { color: ink, fontWeight: '600' }]} placeholder="Like New motorbike" placeholderTextColor={muted} />
          </View>
          {Label({ children: "Target" })}
          {AmountBox({ value: editTarget, onChange: setEditTarget })}
          <View style={s.chipRow}>
            {[25000, 50000, 100000].map((n) => Chip({ key: n, label: `+${formatIndianCompactRupees(n)}`, onPress: () => setEditTarget(String((parseFloat(editTarget) || 0) + n)) }))}
          </View>

          {Label({ children: "Plan by" })}
          <View style={[s.segment, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E9EFEB' }]}>
            {(['by_date', 'by_monthly'] as const).map((m) => {
              const on = editMode === m;
              return (
                <Pressable key={m} onPress={() => setEditMode(m)} style={[s.segBtn, on && { backgroundColor: isDark ? '#1E3329' : '#FFFFFF' }]}>
                  <Text style={[s.segText, { color: on ? ink : muted }, on && { fontWeight: '700' }]}>{m === 'by_date' ? 'When I want it' : 'What I can save'}</Text>
                </Pressable>
              );
            })}
          </View>

          {editMode === 'by_date' ? (
            <>
              {Label({ children: "Finish in" })}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                {[6, 12, 18, 24, 36, 60].map((m) => Chip({ key: m, label: m % 12 === 0 ? `${m / 12} year${m === 12 ? '' : 's'}` : `${m} months`, on: editMonths === m, onPress: () => setEditMonths(m) }))}
              </ScrollView>
              <View style={[s.stepper, { borderColor: field, backgroundColor: pageBg }]}>
                <Pressable onPress={() => setEditMonths((m) => Math.max(1, m - 1))} hitSlop={8} style={[s.stepBtn, { backgroundColor: surface }]} accessibilityLabel="One month less">
                  <Feather name="minus" size={16} color={ink} />
                </Pressable>
                <Text style={[s.stepText, { color: ink }]}>{editMonths} month{editMonths === 1 ? '' : 's'}</Text>
                <Pressable onPress={() => setEditMonths((m) => m + 1)} hitSlop={8} style={[s.stepBtn, { backgroundColor: surface }]} accessibilityLabel="One month more">
                  <Feather name="plus" size={16} color={ink} />
                </Pressable>
              </View>
            </>
          ) : (
            <>
              {Label({ children: "Each month" })}
              {AmountBox({ value: editMonthly, onChange: setEditMonthly })}
              <View style={s.chipRow}>
                {[2000, 5000, 10000, 25000].map((n) => Chip({ key: n, label: `₹${formatIndianCompactAmount(n)}`, on: parsedEditMonthly === n, onPress: () => setEditMonthly(String(n)) }))}
              </View>
            </>
          )}

          <View style={[s.result, { backgroundColor: softGreen }]}>
            <Text style={[s.resultBig, { color: ink }, heading]}>
              {editMode === 'by_date' ? `${inr(effectiveMonthly)} a month` : `${effectiveMonths} month${effectiveMonths === 1 ? '' : 's'}`}
            </Text>
            <Text style={[s.resultText, { color: muted }]}>
              Reaches {inr(parsedEditTarget)} by {effectiveDateLabel}, assuming about {editStrategy.expectedReturn}% growth a year.
            </Text>
          </View>

          {Label({ children: "Priority" })}
          <View style={s.chipRow}>
            {(['high', 'medium', 'low'] as const).map((p) => Chip({ key: p, label: p[0].toUpperCase() + p.slice(1), on: editPriority === p, onPress: () => setEditPriority(p) }))}
          </View>
          {ErrorLine()}
          {Primary({ label: "Save plan", onPress: saveEdit, disabled: !editName.trim() })}
        </>
      );
    }

    if (sheet === 'bank') {
      title = 'Where is this money kept?';
      sub = 'Linking an account checks your goals never add up to more than it holds.';
      const items: { id: string | null; name: string; sub: string; warn?: boolean; bank?: any }[] = [
        { id: null, name: 'Not linked', sub: 'Track without checking a balance' },
        ...bankProfiles.map((b) => {
          const sum = getBankAllocationSummary(b, allGoals);
          const ok = validateBankDeposit(b, allGoals, activeGoal.currentAmount, activeGoal.id).valid;
          return { id: b.id, name: `${b.bankName}${b.accountNumberSuffix ? ` •• ${b.accountNumberSuffix}` : ''}`, sub: formatBankOptionSubtitle(sum), warn: sum.isOverallocated || (!ok && activeGoal.linkedBankId !== b.id), bank: b };
        }),
      ];
      body = (
        <>
          <View style={[s.group, { borderColor: line }]}>
            {items.map((it, i) => {
              const on = (activeGoal.linkedBankId || null) === it.id;
              return (
                <Pressable key={it.id || 'none'} onPress={() => selectBank(it.id)} style={[s.groupRow, i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}>
                  {it.bank ? (
                    <BankIcon code={getBankCode(it.bank.bankName)} name={it.bank.bankName} size={36} />
                  ) : (
                    <View style={[s.noBank, { backgroundColor: pageBg }]}>
                      <Feather name="slash" size={16} color={muted} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.groupText, { color: ink, flex: 0 }]} numberOfLines={1}>{it.name}</Text>
                    <Text style={[s.groupSub, { color: it.warn ? red : muted }]} numberOfLines={1}>{it.sub}</Text>
                  </View>
                  <View style={[s.radio, { borderColor: on ? accent : field }]}>{on && <View style={[s.radioDot, { backgroundColor: accent }]} />}</View>
                </Pressable>
              );
            })}
          </View>
          {ErrorLine()}
        </>
      );
    }

    if (sheet === 'deploy') {
      title = 'Move money to a new goal';
      sub = `${inr(activeGoal.currentAmount)} available in ${activeGoal.name}`;
      body = (
        <>
          {Label({ children: "Amount to move" })}
          {AmountBox({ value: deployAmount, onChange: setDeployAmount, autoFocus: true })}
          {Label({ children: "New goal" })}
          <View style={[s.textBox, { backgroundColor: pageBg, borderColor: field }]}>
            <TextInput value={deployName} onChangeText={setDeployName} placeholder="Like Europe trip" placeholderTextColor={muted} style={[s.textInput, { color: ink, fontWeight: '600' }]} />
          </View>
          {Label({ children: "Its target (optional)" })}
          {AmountBox({ value: deployTarget, onChange: setDeployTarget })}
          {Label({ children: "Type" })}
          <View style={s.chipRow}>
            {GOAL_CATEGORIES.filter((c: any) => c.id !== 'wealth_stash').map((c: any) => Chip({ key: c.id, label: c.name, on: deployCategory === c.id, onPress: () => setDeployCategory(c.id) }))}
          </View>
          {ErrorLine()}
          {Primary({ label: "Move and create goal", onPress: deploy, disabled: !deployAmount || !deployName.trim() })}
        </>
      );
    }

    return (
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={[StyleSheet.absoluteFill, s.backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
          <Animated.View entering={SlideInDown.duration(260)} style={[s.sheet, { backgroundColor: surface, maxHeight: windowHeight * 0.9, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <View style={[s.grabber, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#D5DED9' }]} />
            <Text style={[s.sheetTitle, { color: ink }, heading]}>{title}</Text>
            {!!sub && <Text style={[s.sheetSub, { color: muted }]}>{sub}</Text>}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 6 }}>
              {body}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    );
  };

  /* ---------------- Main ---------------- */

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => (celebrate ? setCelebrate(null) : sheet ? closeSheet() : onClose())}>
        <View style={s.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close goal" />
          <View style={[s.container, { backgroundColor: pageBg, height: windowHeight * 0.94 }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {/* Hero photo with progress reveal */}
              <View style={s.hero} onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}>
                <Image
                  source={{ uri: coverUri }}
                  blurRadius={Platform.OS === 'web' ? undefined : 2}
                  style={[s.heroImg, (Platform.OS === 'web' ? { filter: 'blur(2px) grayscale(100%) brightness(0.7)' } : {}) as any]}
                  resizeMode="cover"
                />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(30,38,34,0.35)' }]} />
                {heroWidth > 0 && pct > 0 && (
                  <View style={[s.reveal, { width: `${pct}%` }]}>
                    <Image source={{ uri: coverUri }} style={{ width: heroWidth, height: '100%' }} resizeMode="cover" />
                  </View>
                )}
                <LinearGradient colors={['rgba(7,17,13,0.4)', 'rgba(7,17,13,0)', 'rgba(7,17,13,0.85)']} locations={[0, 0.3, 1]} style={StyleSheet.absoluteFill} />
                <View style={s.heroGrabber} />
                <Pressable onPress={() => openSheet('options')} style={s.heroDots} accessibilityLabel="Goal options">
                  <Feather name="more-horizontal" size={18} color="#FFFFFF" />
                </Pressable>
                <View style={s.heroText}>
                  <View style={s.statusChip}>
                    <View style={[s.statusDot, { backgroundColor: done ? '#D4A017' : pacing.statusColor || '#16A34A' }]} />
                    <Text style={s.statusText}>{done ? 'Reached' : pacing.statusText}</Text>
                  </View>
                  <Text style={[s.heroName, heading]} numberOfLines={1}>{activeGoal.name}</Text>
                  <View style={s.heroAmountRow}>
                    <Text style={[s.heroAmount, heading]}>{inr(activeGoal.currentAmount)}</Text>
                    <Text style={s.heroOf}>{isStash ? `milestone ${activeGoal.milestoneStep || 1}, ${inr(activeGoal.targetAmount)}` : `of ${inr(activeGoal.targetAmount)}`}</Text>
                  </View>
                </View>
              </View>

              <View style={{ paddingHorizontal: 16 }}>
                {/* Milestone path */}
                <Animated.View entering={FadeIn.delay(100).duration(350)} style={[s.card, { backgroundColor: surface, borderColor: line, marginTop: 14 }]}>
                  <View style={s.path}>
                    <View style={[s.pathTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#EDF2EF' }]}>
                      <Animated.View style={[s.pathFill, { backgroundColor: isDark ? LIME : '#16A34A' }, pathStyle]} />
                    </View>
                    {MILESTONES.map((m) => {
                      const reached = pct >= m;
                      const current = !reached && m === nextMilestone;
                      return (
                        <View key={m} style={s.node}>
                          <View style={[s.nodeDot, reached ? { backgroundColor: accent, borderColor: accent } : { backgroundColor: surface, borderColor: current ? accent : field }]}>
                            {reached ? <Feather name="check" size={14} color={accentFg} /> : m === 100 ? <Feather name="award" size={13} color={muted} /> : null}
                          </View>
                          <Text style={[s.nodeLabel, { color: reached || current ? ink : muted }, (reached || current) && { fontWeight: '700' }]}>{m === 100 ? 'Goal' : `${m}%`}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={[s.pathText, { color: ink }]}>
                    {done ? (
                      <Text style={{ fontWeight: '700' }}>You did it. Every rupee saved.</Text>
                    ) : (
                      <>
                        <Text style={{ fontWeight: '700' }}>{inr(toNext)} to {nextMilestone === 100 ? 'your goal' : `${nextMilestone}%`}.</Text>
                        <Text style={{ color: muted }}> You’re {Math.floor(pct)}% there.</Text>
                      </>
                    )}
                  </Text>
                </Animated.View>

                {/* Stash milestone reached */}
                {isStash && done && (
                  <View style={[s.card, { backgroundColor: softGreen, borderColor: 'transparent', marginTop: 12 }]}>
                    <Text style={[s.cardTitle, { color: ink }]}>Milestone {activeGoal.milestoneStep || 1} reached</Text>
                    <Text style={[s.cardText, { color: muted }]}>Raise the bar, or move some of it into a specific goal.</Text>
                    <View style={[s.chipRow, { marginTop: 12 }]}>
                      {Chip({ label: "Next milestone +₹1L", on: true, onPress: levelUp })}
                      {Chip({ label: "Move money", onPress: () => openSheet('deploy') })}
                    </View>
                  </View>
                )}

                {/* Plan */}
                {!done && (
                  <Animated.View entering={FadeIn.delay(160).duration(350)} style={s.plan}>
                    <View pointerEvents="none" style={s.planRing} />
                    <Text style={s.planLabel}>Your plan</Text>
                    <Text style={[s.planBig, heading]}>{inr(requiredMonthly)} a month</Text>
                    <Text style={s.planSub}>
                      {targetDateLabel ? `Finishes by ${targetDateLabel}, ${pacing.monthsLeft} month${pacing.monthsLeft === 1 ? '' : 's'} from now` : `${pacing.monthsLeft} months to go`}
                    </Text>
                    <Pressable onPress={openEdit} style={s.planBtn} accessibilityRole="button">
                      <Text style={s.planBtnText}>Change plan</Text>
                    </Pressable>
                  </Animated.View>
                )}

                {/* Account */}
                <Pressable onPress={() => openSheet('bank')} style={({ pressed }) => [s.card, s.bankRow, { backgroundColor: surface, borderColor: line, marginTop: 12 }, pressed && { opacity: 0.8 }]}>
                  {linkedBank ? (
                    <BankIcon code={getBankCode(linkedBank.bankName)} name={linkedBank.bankName} size={40} />
                  ) : (
                    <View style={[s.noBank, { width: 40, height: 40, borderRadius: 20, backgroundColor: pageBg }]}>
                      <Feather name="credit-card" size={17} color={muted} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.groupText, { color: ink, flex: 0 }]} numberOfLines={1}>
                      {linkedBank ? `${linkedBank.bankName}${linkedBank.accountNumberSuffix ? ` •• ${linkedBank.accountNumberSuffix}` : ''}` : 'Kept in any account'}
                    </Text>
                    <Text style={[s.groupSub, { color: bankSummary?.isOverallocated ? red : muted }]} numberOfLines={1}>
                      {bankSummary?.isOverallocated
                        ? `Goals are ${formatIndianCompactRupees(bankSummary.deficitAmount)} more than this account holds`
                        : linkedBank
                          ? `${formatIndianFullRupees(linkedBank.currentBalance || 0)} in the account`
                          : 'Link one to check the money is really there'}
                    </Text>
                  </View>
                  <Text style={[s.link, { color: green }]}>{linkedBank ? 'Change' : 'Link'}</Text>
                </Pressable>

                {/* History */}
                <Text style={[s.section, { color: ink }]}>History</Text>
                {entries.length === 0 ? (
                  <View style={[s.empty, { borderColor: field }]}>
                    <Text style={[s.cardText, { color: muted, textAlign: 'center' }]}>Nothing added yet. Your first amount shows up here.</Text>
                  </View>
                ) : (
                  <View style={[s.card, { backgroundColor: surface, borderColor: line, paddingVertical: 0 }]}>
                    {entries.map((e, i) => {
                      const out = e.type === 'withdraw';
                      const opening = e.type === 'opening';
                      return (
                        <Pressable
                          key={e.id || i}
                          onPress={() => {
                            setSelectedEntry(e);
                            openSheet('entry');
                          }}
                          style={[s.histRow, i < entries.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}
                        >
                          <View style={[s.histIcon, { backgroundColor: out ? (isDark ? 'rgba(224,49,49,0.2)' : '#FFE3E3') : opening ? (isDark ? 'rgba(59,130,246,0.18)' : '#DCEBFF') : softGreen }]}>
                            <Feather name={out ? 'minus' : opening ? 'flag' : 'plus'} size={16} color={out ? red : opening ? (isDark ? '#93C5FD' : '#1450A3') : accent} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[s.histTitle, { color: ink }]} numberOfLines={1}>{e.note || (out ? 'Taken out' : opening ? 'Starting amount' : 'Added')}</Text>
                            <Text style={[s.histDate, { color: muted }]}>{shortDate(e.at)}</Text>
                          </View>
                          <Text style={[s.histAmt, { color: out ? red : green }]}>
                            {out ? '−' : '+'}
                            {inr(Number(e.amount))}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={[s.footer, { borderTopColor: line, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
              {isStash && activeGoal.currentAmount > 0 ? (
                <Pressable onPress={() => openSheet('deploy')} style={[s.roundAction, { borderColor: field, backgroundColor: surface }]} accessibilityLabel="Move money to a new goal">
                  <Feather name="share" size={18} color={ink} />
                </Pressable>
              ) : null}
              <Pressable onPress={() => openAdd()} style={({ pressed }) => [s.addBtn, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.98 }] }]} accessibilityRole="button">
                <Feather name="plus" size={18} color={accentFg} />
                <Text style={[s.addText, { color: accentFg }]}>Add money</Text>
              </Pressable>
              <Pressable
                onPress={openWithdraw}
                disabled={activeGoal.currentAmount <= 0}
                style={[s.roundAction, { borderColor: field, backgroundColor: surface, opacity: activeGoal.currentAmount > 0 ? 1 : 0.4 }]}
                accessibilityLabel="Take money out"
              >
                <Feather name="minus" size={18} color={ink} />
              </Pressable>
            </View>
          </View>

          {renderSheet()}

          {/* Milestone celebration */}
          {celebrate && (
            <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={[StyleSheet.absoluteFill, s.celebrateWrap]}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setCelebrate(null)} accessibilityLabel="Close" />
              <Animated.View entering={ZoomIn.springify().damping(12)} style={[s.celebrateCard, { backgroundColor: surface }]}>
                <View style={[s.celebrateIcon, { backgroundColor: FOREST }]}>
                  <Feather name="award" size={34} color={LIME} />
                </View>
                <Text style={[s.celebrateTitle, { color: ink }, heading]}>{celebrate.title}</Text>
                <Text style={[s.celebrateText, { color: muted }]}>{celebrate.text}</Text>
                <Pressable onPress={() => setCelebrate(null)} style={[s.primary, { backgroundColor: accent, alignSelf: 'stretch', marginTop: 18 }]}>
                  <Text style={[s.primaryText, { color: accentFg }]}>Nice</Text>
                </Pressable>
              </Animated.View>
            </Animated.View>
          )}
        </View>
      </Modal>

      <GoalImagePickerModal
        goal={activeGoal}
        visible={imagePickerOpen}
        onClose={() => setImagePickerOpen(false)}
        onSelectPreset={(_id: string, key: string) => saveCover({ coverPresetKey: key, coverImageUri: undefined })}
        onCustomImagePicked={(_id: string, uri: string) => saveCover({ coverImageUri: uri, coverPresetKey: undefined })}
        onResetToAuto={() => saveCover({ coverImageUri: undefined, coverPresetKey: undefined })}
      />
    </>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  container: { borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', width: '100%', maxWidth: 640, alignSelf: 'center' },

  hero: { height: 260, width: '100%', overflow: 'hidden' },
  heroImg: { width: '100%', height: '100%' },
  reveal: { position: 'absolute', top: 0, left: 0, bottom: 0, overflow: 'hidden' },
  heroGrabber: { position: 'absolute', top: 10, alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  heroDots: { position: 'absolute', top: 24, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(7,17,13,0.45)', alignItems: 'center', justifyContent: 'center' },
  heroText: { position: 'absolute', left: 20, right: 20, bottom: 18 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.92)' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '700', color: '#0B1F17' },
  heroName: { color: '#FFFFFF', fontSize: 28, letterSpacing: -0.6, marginTop: 10 },
  heroAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  heroAmount: { color: '#FFFFFF', fontSize: 36, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  heroOf: { color: 'rgba(255,255,255,0.8)', fontSize: 15 },

  card: { borderWidth: 1, borderRadius: 24, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardText: { fontSize: 14, lineHeight: 20, marginTop: 4 },

  path: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 },
  pathTrack: { position: 'absolute', left: 21, right: 21, top: 14, height: 3, borderRadius: 2, overflow: 'hidden' },
  pathFill: { height: 3 },
  node: { alignItems: 'center', gap: 6, width: 32 },
  nodeDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  nodeLabel: { fontSize: 12 },
  pathText: { fontSize: 15, lineHeight: 21, marginTop: 16 },

  plan: { marginTop: 12, borderRadius: 24, backgroundColor: FOREST, padding: 18, overflow: 'hidden' },
  planRing: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: 'rgba(184,243,107,0.16)', right: -60, top: -80 },
  planLabel: { color: '#B5CEC1', fontSize: 13 },
  planBig: { color: '#FFFFFF', fontSize: 26, letterSpacing: -0.5, marginTop: 4 },
  planSub: { color: '#D9E7DF', fontSize: 14, marginTop: 2 },
  planBtn: { alignSelf: 'flex-start', height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', marginTop: 14 },
  planBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  noBank: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  link: { fontSize: 13, fontWeight: '600' },

  section: { fontSize: 15, fontWeight: '700', paddingHorizontal: 4, paddingTop: 22, paddingBottom: 10 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 20, padding: 18 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  histIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  histTitle: { fontSize: 15, fontWeight: '600' },
  histDate: { fontSize: 12, marginTop: 2 },
  histAmt: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },

  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  addBtn: { flex: 1, height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addText: { fontSize: 16, fontWeight: '700' },
  roundAction: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  backdrop: { backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, width: '100%', maxWidth: 640, alignSelf: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 22, letterSpacing: -0.4 },
  sheetSub: { fontSize: 14, lineHeight: 20, marginTop: 4 },

  label: { fontSize: 13, fontWeight: '700', paddingHorizontal: 4, paddingTop: 16, paddingBottom: 8 },
  amountBox: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 64, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16, marginTop: 10 },
  rupee: { fontSize: 22 },
  amountInput: { flex: 1, fontSize: 30, letterSpacing: -0.6, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' },
  preview: { fontSize: 13, marginTop: 10, paddingHorizontal: 4 },
  textBox: { height: 50, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center' },
  textInput: { fontSize: 15, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  primary: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  primaryText: { fontSize: 16, fontWeight: '700' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600' },

  entryAmount: { fontSize: 40, letterSpacing: -1, marginTop: 12 },
  infoCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 14 },
  infoKey: { fontSize: 12 },
  infoVal: { fontSize: 15, marginTop: 2 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 56, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, marginTop: 12 },
  dangerText: { fontSize: 15, fontWeight: '600' },

  group: { borderWidth: 1, borderRadius: 20, overflow: 'hidden', marginTop: 12 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 56 },
  groupText: { flex: 1, fontSize: 15, fontWeight: '600' },
  groupSub: { fontSize: 12, marginTop: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },

  segment: { flexDirection: 'row', borderRadius: 14, padding: 4 },
  segBtn: { flex: 1, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 13, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 16, padding: 6, marginTop: 10 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 15, fontWeight: '700' },
  result: { borderRadius: 18, padding: 16, marginTop: 14 },
  resultBig: { fontSize: 24, letterSpacing: -0.4 },
  resultText: { fontSize: 13, lineHeight: 19, marginTop: 4 },

  celebrateWrap: { backgroundColor: 'rgba(7, 17, 13, 0.6)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  celebrateCard: { width: '100%', maxWidth: 360, borderRadius: 28, padding: 24, alignItems: 'center' },
  celebrateIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  celebrateTitle: { fontSize: 26, letterSpacing: -0.5, marginTop: 18, textAlign: 'center' },
  celebrateText: { fontSize: 15, lineHeight: 22, marginTop: 6, textAlign: 'center' },
});