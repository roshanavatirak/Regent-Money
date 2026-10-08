import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useGoalsStore, useBankStore } from '../../../store';
import { BankIcon } from '../../../components/BankIcon';
import type { Goal } from '../services/goalPacingService';
import {
  getGoalPacing,
  getSaved,
  roundUpTo100,
  toISTDateString,
} from '../services/goalPacingService';
import {
  formatIndianCompactRupees,
  formatIndianFullRupees,
  formatFinishMonthDisplay,
} from '../services/goalNudgeTemplates';
import {
  getBankAllocationSummary,
  validateBankDeposit,
} from '../services/goalBankAllocationService';

interface LogSavingsBottomSheetProps {
  goal: Goal | null;
  visible: boolean;
  onClose: () => void;
  onLogged?: () => void;
}

export const LogSavingsBottomSheet: React.FC<LogSavingsBottomSheetProps> = ({
  goal,
  visible,
  onClose,
  onLogged,
}) => {
  const { colors, isDark } = useTheme();
  const contributeToGoal = useGoalsStore((state) => state.contributeToGoal);
  const allGoals = useGoalsStore((state) => state.goals);
  const bankProfiles = useBankStore((state) => state.bankProfiles);

  const [amountStr, setAmountStr] = useState('');
  const [entryType, setEntryType] = useState<'save' | 'withdraw'>('save');
  const [note, setNote] = useState('');

  // Linked Bank Profile & Allocation Summary
  const linkedBank = useMemo(() => {
    if (!goal?.linkedBankId) return null;
    return bankProfiles.find((b) => b.id === goal.linkedBankId) || null;
  }, [goal?.linkedBankId, bankProfiles]);

  const bankSummary = useMemo(() => {
    if (!linkedBank) return null;
    return getBankAllocationSummary(linkedBank, allGoals);
  }, [linkedBank, allGoals]);

  const parsedAmount = Math.max(0, parseInt(amountStr.replace(/[^0-9]/g, ''), 10) || 0);
  const currentSavedInGoal = goal ? getSaved(goal) : 0;

  // Validation
  const depositValidation = useMemo(() => {
    if (entryType === 'withdraw') {
      if (parsedAmount > currentSavedInGoal) {
        return {
          valid: false,
          maxAllowed: currentSavedInGoal,
          errorMessage: `Cannot withdraw more than current saved amount (${formatIndianFullRupees(currentSavedInGoal)}).`,
        };
      }
      return { valid: true, maxAllowed: currentSavedInGoal };
    }

    if (!linkedBank) {
      return { valid: true, maxAllowed: Infinity };
    }

    return validateBankDeposit(linkedBank, allGoals, parsedAmount, goal?.id);
  }, [linkedBank, allGoals, parsedAmount, goal?.id, entryType, currentSavedInGoal]);

  // Quick preset chips based on goal facts & bank buffer
  const quickChips = useMemo<{ label: string; amount: number }[]>(() => {
    if (!goal) return [
      { label: '₹500', amount: 500 },
      { label: '₹1,000', amount: 1000 },
      { label: '₹5,000', amount: 5000 },
    ];
    const pacing = getGoalPacing(goal);
    const chips: { label: string; amount: number }[] = [
      { label: '₹500', amount: 500 },
      { label: '₹1,000', amount: 1000 },
    ];
    if (goal.committedMonthly && goal.committedMonthly > 1000) {
      chips.push({
        label: `Planned: ${formatIndianCompactRupees(goal.committedMonthly)}`,
        amount: goal.committedMonthly,
      });
    }
    if (pacing.thisMonthRemaining > 0 && pacing.thisMonthRemaining !== goal.committedMonthly) {
      chips.push({
        label: `Month left: ${formatIndianCompactRupees(pacing.thisMonthRemaining)}`,
        amount: pacing.thisMonthRemaining,
      });
    }

    // Filter chips to maxAllowed if bank is linked and saving
    if (linkedBank && bankSummary && entryType === 'save') {
      return chips.filter((c) => c.amount <= bankSummary.unallocatedBalance);
    }
    return chips;
  }, [goal, linkedBank, bankSummary, entryType]);

  // Live preview before confirming
  const preview = useMemo(() => {
    if (!goal || parsedAmount === 0 || !depositValidation.valid) return null;

    const delta = entryType === 'withdraw' ? -parsedAmount : parsedAmount;
    const hypotheticalGoal: Goal = {
      ...goal,
      entries: [
        ...(goal.entries || []),
        {
          id: 'hypothetical',
          amount: parsedAmount,
          at: toISTDateString(new Date()),
          type: entryType,
        },
      ],
    };

    const newPacing = getGoalPacing(hypotheticalGoal);
    return {
      newSaved: newPacing.saved,
      newPct: newPacing.pctSaved,
      newFinish: newPacing.projectedFinish
        ? formatFinishMonthDisplay(newPacing.projectedFinish)
        : null,
      statusDot: newPacing.status === 'on_pace' || newPacing.status === 'ahead' ? colors.accent : colors.warning,
    };
  }, [goal, parsedAmount, entryType, colors, depositValidation.valid]);

  if (!goal) return null;

  const handleConfirm = () => {
    if (parsedAmount <= 0 || !depositValidation.valid) return;
    const finalDelta = entryType === 'withdraw' ? -parsedAmount : parsedAmount;
    contributeToGoal(goal.id, finalDelta, note.trim() || undefined);
    setAmountStr('');
    setNote('');
    onClose();
    if (onLogged) onLogged();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={[styles.sheetContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header Indicator */}
          <View style={styles.grabBar} />

          {/* Title Row & Save / Withdraw Toggle */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {entryType === 'save' ? 'Log Savings' : 'Log Withdrawal'}
              </Text>
              <Text style={[styles.goalSubName, { color: colors.textSecondary }]} numberOfLines={1}>
                {goal.name}
              </Text>
            </View>

            {/* Toggle */}
            <View style={[styles.typeToggle, { backgroundColor: colors.buttonSecondaryBackground }]}>
              <TouchableOpacity
                onPress={() => setEntryType('save')}
                style={[
                  styles.typeToggleBtn,
                  entryType === 'save' && { backgroundColor: colors.accent },
                ]}
              >
                <Text style={[styles.typeToggleText, { color: entryType === 'save' ? '#FFFFFF' : colors.textSecondary }]}>
                  Save
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEntryType('withdraw')}
                style={[
                  styles.typeToggleBtn,
                  entryType === 'withdraw' && { backgroundColor: colors.warning },
                ]}
              >
                <Text style={[styles.typeToggleText, { color: entryType === 'withdraw' ? '#FFFFFF' : colors.textSecondary }]}>
                  Withdraw
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Linked Bank Account Pill */}
          {linkedBank && bankSummary ? (
            <View
              style={[
                styles.bankPillRow,
                {
                  backgroundColor: bankSummary.isOverallocated
                    ? (isDark ? 'rgba(255, 82, 82, 0.12)' : '#FEE2E2')
                    : colors.buttonSecondaryBackground,
                  borderColor: bankSummary.isOverallocated ? colors.danger : colors.border,
                },
              ]}
            >
              <BankIcon
                name={linkedBank.bankName}
                code={linkedBank.smsSenderId || linkedBank.bankName}
                size={18}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.bankPillText,
                  { color: bankSummary.isOverallocated ? colors.danger : colors.text },
                ]}
                numberOfLines={1}
              >
                {linkedBank.bankName || 'Bank'} {linkedBank.accountNumberSuffix ? `••${linkedBank.accountNumberSuffix}` : ''}
                {' · '}
                <Text style={{ fontWeight: '700' }}>
                  {bankSummary.isOverallocated
                    ? `Deficit: -${formatIndianFullRupees(bankSummary.deficitAmount)}`
                    : `${formatIndianFullRupees(bankSummary.unallocatedBalance)} unallocated buffer`}
                </Text>
              </Text>
            </View>
          ) : null}

          {/* Amount Input */}
          <View
            style={[
              styles.inputBox,
              {
                borderColor: !depositValidation.valid ? colors.danger : colors.border,
                backgroundColor: colors.background,
              },
              !depositValidation.valid && { borderWidth: 1.5 },
            ]}
          >
            <Text style={[styles.rupeeSymbol, { color: !depositValidation.valid ? colors.danger : colors.text }]}>₹</Text>
            <TextInput
              value={amountStr}
              onChangeText={(txt) => setAmountStr(txt.replace(/[^0-9]/g, ''))}
              placeholder="0"
              placeholderTextColor={colors.textTertiary}
              keyboardType="number-pad"
              style={[styles.amountInput, { color: colors.text }]}
              autoFocus
            />
          </View>

          {/* Quick Amount Chips */}
          <View style={styles.chipsRow}>
            {quickChips.map((chip, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => setAmountStr(String(chip.amount))}
                style={[
                  styles.chip,
                  {
                    backgroundColor: colors.buttonSecondaryBackground,
                    borderColor: parsedAmount === chip.amount ? colors.accent : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: parsedAmount === chip.amount ? colors.accent : colors.textSecondary }]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
            {linkedBank && bankSummary && entryType === 'save' && bankSummary.unallocatedBalance > 0 ? (
              <TouchableOpacity
                onPress={() => setAmountStr(String(bankSummary.unallocatedBalance))}
                style={[
                  styles.chip,
                  {
                    backgroundColor: colors.buttonSecondaryBackground,
                    borderColor: parsedAmount === bankSummary.unallocatedBalance ? colors.accent : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: colors.accent, fontWeight: '700' }]}>
                  Max: {formatIndianCompactRupees(bankSummary.unallocatedBalance)}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Error / Validation Warning */}
          {!depositValidation.valid ? (
            <View style={[styles.errorCard, { backgroundColor: isDark ? 'rgba(255, 82, 82, 0.12)' : '#FEE2E2', borderColor: colors.danger }]}>
              <Ionicons name="alert-circle" size={15} color={colors.danger} style={{ marginRight: 6 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.errorCardText, { color: colors.danger }]}>
                  {depositValidation.errorMessage}
                </Text>
                {depositValidation.maxAllowed > 0 ? (
                  <TouchableOpacity
                    onPress={() => setAmountStr(String(depositValidation.maxAllowed))}
                    style={{ marginTop: 3 }}
                  >
                    <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.danger, textDecorationLine: 'underline' }}>
                      Set to max {formatIndianFullRupees(depositValidation.maxAllowed)}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Live Preview Before Confirm */}
          {preview ? (
            <View style={[styles.previewCard, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC' }]}>
              <View style={[styles.previewDot, { backgroundColor: preview.statusDot }]} />
              <Text style={[styles.previewText, { color: colors.text }]}>
                Will take you to <Text style={{ fontWeight: '700' }}>{preview.newPct}%</Text>
                {preview.newFinish ? ` · Projected finish: ${preview.newFinish}` : ''}
              </Text>
            </View>
          ) : null}

          {/* Confirm Button */}
          <TouchableOpacity
            disabled={parsedAmount <= 0 || !depositValidation.valid}
            activeOpacity={0.8}
            onPress={handleConfirm}
            style={[
              styles.confirmBtn,
              {
                backgroundColor:
                  parsedAmount > 0 && depositValidation.valid
                    ? entryType === 'save'
                      ? colors.accent
                      : colors.warning
                    : colors.border,
                opacity: parsedAmount > 0 && depositValidation.valid ? 1 : 0.6,
              },
            ]}
          >
            <Text style={styles.confirmBtnText}>
              {parsedAmount > 0
                ? `${entryType === 'save' ? 'Log' : 'Withdraw'} ${formatIndianFullRupees(parsedAmount)}`
                : 'Enter an amount'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 32,
  },
  grabBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  goalSubName: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
  },
  typeToggle: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 2,
  },
  typeToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  typeToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  rupeeSymbol: {
    fontSize: 24,
    fontWeight: '700',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    padding: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  previewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  previewText: {
    fontSize: 13,
    flex: 1,
  },
  confirmBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  bankPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  bankPillText: {
    fontSize: 12,
    flex: 1,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  errorCardText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
});
