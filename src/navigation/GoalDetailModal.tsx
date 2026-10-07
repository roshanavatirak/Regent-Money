import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, Goal, SavingsEntry, useBankStore, useGoalsStore } from '../store';
import {
  getGoalPacing,
  goalService,
  GOAL_CATEGORIES,
} from '../services/goalService';
import {
  getBankAllocationSummary,
  validateBankDeposit,
  formatBankOptionSubtitle,
} from '../features/goals/services/goalBankAllocationService';
import {
  formatIndianFullRupees,
  formatIndianCompactRupees,
} from '../features/goals/services/goalNudgeTemplates';
import { GoalImagePickerModal } from '../features/goals/components/GoalImagePickerModal';
import { getCoverImageUri } from '../features/goals/services/goalIllustrationMap';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';

const formatEntryDate = (dateVal: string | number | undefined) => {
  if (!dateVal) return '—';
  try {
    const raw = String(dateVal).trim();
    const d = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return String(dateVal);
  }
};

interface GoalDetailModalProps {
  goal: Goal | null;
  visible: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export const GoalDetailModal: React.FC<GoalDetailModalProps> = ({
  goal,
  visible,
  onClose,
  onUpdated,
}) => {
  const { colors, isDark } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const { keyboardHeight, isKeyboardVisible } = useKeyboardHeight();

  // Deposit input state
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [showDepositBox, setShowDepositBox] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Withdraw input state
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showWithdrawBox, setShowWithdrawBox] = useState(false);

  // Deploy Capital state (for Freedom Stash & open-ended wealth goals)
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [deployAmount, setDeployAmount] = useState('');
  const [deployName, setDeployName] = useState('');
  const [deployCategory, setDeployCategory] = useState<string>('travel');
  const [deployTarget, setDeployTarget] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);

  // Bank switching modal state
  const [showBankPickerModal, setShowBankPickerModal] = useState(false);

  // Cover image picker state
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);

  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const allGoals = useGoalsStore((state) => state.goals);
  const updateGoal = useGoalsStore((state) => state.updateGoal);

  // Use the reactive goal from allGoals store to ensure immediate UI updates on contribution/withdraw/delete
  const activeGoal = useMemo(() => {
    if (!goal) return null;
    return allGoals.find((g) => g.id === goal.id) || goal;
  }, [goal, allGoals]);

  // Sync latest history from backend on open
  useEffect(() => {
    if (visible && activeGoal?.id) {
      goalService
        .getGoalHistory(activeGoal.id)
        .then((history) => {
          if (Array.isArray(history) && history.length > 0) {
            const mappedEntries: SavingsEntry[] = history.map((h: any) => ({
              id: h.id,
              amount: parseFloat(String(h.amount || 0)),
              at: h.at,
              type: h.type as any,
              note: h.note || undefined,
            }));
            updateGoal(activeGoal.id, { entries: mappedEntries });
          }
        })
        .catch((err) => {
          console.warn('[GoalDetailModal] Failed to fetch goal history:', err);
        });
    }
  }, [visible, activeGoal?.id]);

  const linkedBank = useMemo(() => {
    if (!activeGoal?.linkedBankId) return null;
    return bankProfiles.find((b) => b.id === activeGoal.linkedBankId) || null;
  }, [activeGoal?.linkedBankId, bankProfiles]);

  const bankSummary = useMemo(() => {
    if (!linkedBank) return null;
    return getBankAllocationSummary(linkedBank, allGoals);
  }, [linkedBank, allGoals]);

  const coverUri = useMemo(() => {
    if (!activeGoal) return '';
    return getCoverImageUri(activeGoal);
  }, [activeGoal]);

  const pacing = useMemo(() => {
    if (!activeGoal) return null;
    return getGoalPacing(activeGoal);
  }, [activeGoal]);

  const formattedTargetDate = useMemo(() => {
    if (!activeGoal?.targetDate) return null;
    const raw = String(activeGoal.targetDate).trim();
    const dateStr = raw.length === 7 ? `${raw}-01` : raw;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }, [activeGoal?.targetDate]);

  const remainingAmount = useMemo(() => {
    if (!activeGoal) return 0;
    return Math.max(0, activeGoal.targetAmount - activeGoal.currentAmount);
  }, [activeGoal?.targetAmount, activeGoal?.currentAmount]);

  const requiredMonthlySavings = useMemo(() => {
    if (remainingAmount <= 0 || !pacing) return 0;
    return Math.ceil(remainingAmount / Math.max(1, pacing.monthsLeft));
  }, [remainingAmount, pacing?.monthsLeft]);

  const goalEntries: SavingsEntry[] = useMemo(() => {
    if (!activeGoal?.entries) return [];
    return [...activeGoal.entries];
  }, [activeGoal?.entries]);

  if (!activeGoal || !pacing) return null;

  const goalColor = activeGoal.color || '#2dba4e';
  const progressPercent = pacing.progressPercent;

  const handleSelectPreset = async (goalId: string, presetKey: string) => {
    updateGoal(goalId, { coverPresetKey: presetKey, coverImageUri: undefined });
    setShowImagePickerModal(false);
    try {
      await goalService.updateGoal(goalId, { coverPresetKey: presetKey, coverImageUri: undefined });
    } catch (err) {
      console.warn('[GoalDetailModal] Failed to save coverPresetKey:', err);
    }
    if (onUpdated) onUpdated();
  };

  const handleCustomImagePicked = async (goalId: string, imageUri: string) => {
    updateGoal(goalId, { coverImageUri: imageUri, coverPresetKey: undefined });
    setShowImagePickerModal(false);
    try {
      await goalService.updateGoal(goalId, { coverImageUri: imageUri, coverPresetKey: undefined });
    } catch (err) {
      console.warn('[GoalDetailModal] Failed to save coverImageUri:', err);
    }
    if (onUpdated) onUpdated();
  };

  const handleResetToAuto = async (goalId: string) => {
    updateGoal(goalId, { coverImageUri: undefined, coverPresetKey: undefined });
    setShowImagePickerModal(false);
    try {
      await goalService.updateGoal(goalId, { coverImageUri: undefined, coverPresetKey: undefined });
    } catch (err) {
      console.warn('[GoalDetailModal] Failed to reset cover:', err);
    }
    if (onUpdated) onUpdated();
  };

  const handleDeposit = async (amt?: number) => {
    const value = amt !== undefined ? amt : parseFloat(depositAmount);
    if (!value || value <= 0) return;

    if (linkedBank) {
      const validation = validateBankDeposit(linkedBank, allGoals, value, activeGoal.id);
      if (!validation.valid) {
        alert(validation.errorMessage || 'Deposit exceeds available balance in the linked bank account.');
        return;
      }
    }

    setIsDepositing(true);
    try {
      await goalService.contribute(activeGoal.id, value, depositNote.trim() || undefined);
      setDepositAmount('');
      setDepositNote('');
      setShowDepositBox(false);
      if (onUpdated) onUpdated();
    } catch (e: any) {
      alert('Deposit failed: ' + (e?.message || e));
    } finally {
      setIsDepositing(false);
    }
  };

  const handleWithdraw = async (amt?: number) => {
    const value = amt !== undefined ? amt : parseFloat(withdrawAmount);
    if (!value || value <= 0) return;

    if (value > activeGoal.currentAmount) {
      alert(`Withdrawal amount (₹${value.toLocaleString('en-IN')}) cannot exceed current goal savings (₹${activeGoal.currentAmount.toLocaleString('en-IN')}).`);
      return;
    }

    setIsWithdrawing(true);
    try {
      await goalService.withdraw(activeGoal.id, value, withdrawNote.trim() || undefined);
      setWithdrawAmount('');
      setWithdrawNote('');
      setShowWithdrawBox(false);
      if (onUpdated) onUpdated();
    } catch (e: any) {
      alert('Withdrawal failed: ' + (e?.message || e));
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleDeleteEntry = async (entry: SavingsEntry) => {
    const isWithdraw = entry.type === 'withdraw';
    const amountStr = `₹${Number(entry.amount).toLocaleString('en-IN')}`;
    const confirmMsg = isWithdraw
      ? `Delete withdrawal of ${amountStr}? This will restore ${amountStr} back to your goal balance.`
      : `Delete savings deposit of ${amountStr}? This will deduct ${amountStr} from your goal balance.`;

    const confirmed = Platform.OS === 'web'
      ? window.confirm(confirmMsg)
      : true;

    if (confirmed) {
      try {
        await goalService.deleteEntry(activeGoal.id, entry.id);
        if (onUpdated) onUpdated();
      } catch (err: any) {
        alert('Failed to delete transaction: ' + (err?.message || err));
      }
    }
  };

  const handleSelectBank = async (bankId: string | null) => {
    try {
      if (bankId) {
        const targetBank = bankProfiles.find((b) => b.id === bankId);
        if (targetBank) {
          const validation = validateBankDeposit(targetBank, allGoals, activeGoal.currentAmount, activeGoal.id);
          if (!validation.valid) {
            alert(validation.errorMessage || 'Target bank account does not have sufficient unallocated balance.');
            return;
          }
        }
      }
      await goalService.updateGoal(activeGoal.id, { linkedBankId: bankId || undefined });
      setShowBankPickerModal(false);
      if (onUpdated) onUpdated();
    } catch (err: any) {
      alert('Failed to update linked bank: ' + (err?.message || err));
    }
  };

  const handleDelete = async () => {
    const confirmed = Platform.OS === 'web' 
      ? window.confirm(`Are you sure you want to delete goal "${activeGoal.name}"?`)
      : true;

    if (confirmed) {
      try {
        await goalService.deleteGoal(activeGoal.id);
        onClose();
        if (onUpdated) onUpdated();
      } catch (e: any) {
        alert('Failed to delete: ' + (e?.message || e));
      }
    }
  };

  const handleAdvanceMilestone = async (increment: number = 100000) => {
    try {
      await goalService.advanceMilestone(activeGoal.id, increment);
      if (onUpdated) onUpdated();
    } catch (e: any) {
      alert('Failed to advance milestone: ' + (e?.message || e));
    }
  };

  const handleDeployCapital = async () => {
    const amt = parseFloat(deployAmount);
    if (!amt || amt <= 0) {
      alert('Please enter a valid amount to deploy');
      return;
    }
    if (amt > activeGoal.currentAmount) {
      alert(`Cannot deploy more than available capital (₹${activeGoal.currentAmount.toLocaleString('en-IN')})`);
      return;
    }
    if (!deployName.trim()) {
      alert('Please enter a title for your new goal');
      return;
    }

    const catObj = GOAL_CATEGORIES.find((c) => c.id === deployCategory) || GOAL_CATEGORIES[0];
    const targetAmt = parseFloat(deployTarget) || Math.max(amt, catObj.defaultAmount);

    setIsDeploying(true);
    try {
      await goalService.deployCapital(activeGoal.id, amt, {
        name: deployName.trim(),
        category: deployCategory,
        targetAmount: targetAmt,
        targetMonths: catObj.typicalMonths,
        color: catObj.color,
        icon: catObj.icon,
      });
      setShowDeployModal(false);
      setDeployAmount('');
      setDeployName('');
      setDeployTarget('');
      if (onUpdated) onUpdated();
    } catch (e: any) {
      alert('Failed to deploy capital: ' + (e?.message || e));
    } finally {
      setIsDeploying(false);
    }
  };

  // Milestone checks
  const milestones = [
    { label: '25%', unlocked: progressPercent >= 25, icon: 'shield-outline' },
    { label: '50%', unlocked: progressPercent >= 50, icon: 'flash-outline' },
    { label: '75%', unlocked: progressPercent >= 75, icon: 'star-outline' },
    { label: '100%', unlocked: progressPercent >= 100, icon: 'trophy-outline' },
  ];

  // Standard Theme Colors
  const bgModal = colors.card;
  const cardBg = isDark ? colors.background : colors.buttonSecondaryBackground;
  const borderColor = colors.border;
  const textColor = colors.text;
  const subTextColor = colors.textSecondary;

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.keyboardAvoidingWrap,
            Platform.OS === 'android' && isKeyboardVisible && { paddingBottom: keyboardHeight },
          ]}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: bgModal,
                borderColor,
                maxHeight: isKeyboardVisible
                  ? Math.max(300, windowHeight - keyboardHeight - (Platform.OS === 'android' ? 36 : 20))
                  : windowHeight * 0.94,
              },
            ]}
          >
            {/* 1. HERO COVER BANNER WITH SEAMLESS FADE-OUT */}
            <View style={styles.heroFrame}>
              <Image source={{ uri: coverUri }} style={styles.heroImage} resizeMode="cover" />

              {/* Layer A: Subtle top vignette for button contrast */}
              <LinearGradient
                colors={['rgba(0,0,0,0.55)', 'transparent']}
                locations={[0.0, 0.38]}
                style={StyleSheet.absoluteFill}
              />

              {/* Layer B: Downward fade out gradient seamlessly dissolving into modal background */}
              <LinearGradient
                colors={[
                  'transparent',
                  'transparent',
                  isDark ? 'rgba(36, 41, 46, 0.45)' : 'rgba(255, 255, 255, 0.45)',
                  isDark ? 'rgba(36, 41, 46, 0.88)' : 'rgba(255, 255, 255, 0.88)',
                  bgModal,
                ]}
                locations={[0.0, 0.32, 0.64, 0.88, 1.0]}
                style={StyleSheet.absoluteFill}
              />

              {/* Floating Top Actions: Delete & Close */}
              <View style={styles.heroTopActions}>
                <TouchableOpacity
                  onPress={handleDelete}
                  style={styles.heroIconCircle}
                  accessibilityLabel="Delete goal"
                >
                  <Ionicons name="trash-outline" size={17} color="#FFFFFF" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onClose}
                  style={styles.heroIconCircle}
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              {/* Floating Bottom Bar in fade transition zone */}
              <View style={styles.heroBottomBar}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.heroGoalTitle, { color: textColor }]} numberOfLines={1}>
                    {activeGoal.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
                    <View style={[styles.heroStatusPill, { backgroundColor: `${pacing.statusColor}25`, borderColor: pacing.statusColor }]}>
                      <Text style={[styles.heroStatusText, { color: pacing.statusColor }]}>
                        {pacing.statusText}
                      </Text>
                    </View>
                    {activeGoal.priority ? (
                      <View style={[styles.heroPriorityPill, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.heroPriorityText, { color: subTextColor }]}>
                          {activeGoal.priority.toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Pencil Edit Image Button */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setShowImagePickerModal(true)}
                  style={[
                    styles.heroEditPill,
                    {
                      backgroundColor: cardBg,
                      borderColor,
                    },
                  ]}
                  accessibilityLabel="Change Cover Image"
                >
                  <Ionicons name="pencil" size={13} color={textColor} />
                  <Text style={[styles.heroEditText, { color: textColor }]}>Edit Image</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView 
              ref={scrollViewRef}
              style={styles.scrollBody} 
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 60 }}
            >
              {/* Progress Big Ring & Summary */}
              <View style={[styles.heroSummaryCard, { backgroundColor: cardBg, borderColor, marginTop: 14 }]}>
                <View style={styles.heroRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.metricLabel, { color: subTextColor }]}>
                      {activeGoal.category === 'wealth_stash' || activeGoal.isMilestoneBased ? 'Accumulated Capital' : 'Saved Toward Goal'}
                    </Text>
                    <Text style={[styles.metricBig, { color: goalColor }]}>
                      ₹{activeGoal.currentAmount.toLocaleString('en-IN')}
                    </Text>
                    <Text style={[styles.metricSub, { color: subTextColor }]}>
                      {activeGoal.category === 'wealth_stash' || activeGoal.isMilestoneBased
                        ? `Milestone ${activeGoal.milestoneStep || 1}: ₹${activeGoal.targetAmount.toLocaleString('en-IN')}`
                        : `Target: ₹${activeGoal.targetAmount.toLocaleString('en-IN')}${
                            formattedTargetDate ? ` • ${formattedTargetDate}` : ''
                          } (${pacing.daysLeft} days left)`}
                    </Text>
                  </View>

                  {/* Circular Percentage Pill */}
                  <View style={[styles.percentBadge, { backgroundColor: `${goalColor}18`, borderColor: goalColor }]}>
                    <Text style={[styles.percentNumber, { color: goalColor }]}>{progressPercent}%</Text>
                    <Text style={[styles.percentSub, { color: subTextColor }]}>COMPLETE</Text>
                  </View>
                </View>

                {/* Progress Bar with Glow */}
                <View style={[styles.progressBarTrack, { backgroundColor: isDark ? '#141724' : '#e2e8f0' }]}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${progressPercent}%`, backgroundColor: goalColor },
                    ]}
                  />
                </View>

                {/* Milestone Tracker */}
                <View style={styles.milestoneRow}>
                  {milestones.map((m, idx) => (
                    <View key={idx} style={styles.milestoneCol}>
                      <View
                        style={[
                          styles.milestoneCircle,
                          { borderColor: m.unlocked ? goalColor : borderColor, backgroundColor: m.unlocked ? `${goalColor}25` : cardBg },
                        ]}
                      >
                        <Ionicons
                          name={m.icon as any}
                          size={14}
                          color={m.unlocked ? goalColor : subTextColor}
                        />
                      </View>
                      <Text
                        style={[
                          styles.milestoneLabel,
                          { color: m.unlocked ? goalColor : subTextColor, fontWeight: m.unlocked ? '700' : '500' },
                        ]}
                      >
                        {m.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Milestone Reached Banner for Freedom Stash */}
              {(activeGoal.category === 'wealth_stash' || activeGoal.isMilestoneBased) && progressPercent >= 100 && (
                <View style={[styles.milestoneAchievedBanner, { backgroundColor: `${goalColor}15`, borderColor: goalColor }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="trophy" size={24} color={goalColor} />
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <Text style={[styles.bannerTitle, { color: textColor }]}>Milestone {activeGoal.milestoneStep || 1} Achieved!</Text>
                      <Text style={[styles.bannerSub, { color: subTextColor }]}>
                        You've accumulated ₹{activeGoal.currentAmount.toLocaleString('en-IN')}. Level up your milestone or deploy capital to a specific goal.
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <TouchableOpacity
                      onPress={() => handleAdvanceMilestone(100000)}
                      style={[styles.bannerActionBtn, { backgroundColor: goalColor }]}
                    >
                      <Text style={styles.bannerActionBtnText}>Level Up (+₹1L)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setShowDeployModal(true)}
                      style={[styles.bannerActionBtn, { backgroundColor: cardBg, borderWidth: 1, borderColor: goalColor }]}
                    >
                      <Text style={[styles.bannerActionBtnText, { color: goalColor }]}>Deploy Capital</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Backed Savings Account Section */}
              <View style={[styles.sectionCard, { backgroundColor: cardBg, borderColor, marginTop: 14 }]}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons
                      name="business-outline"
                      size={16}
                      color={bankSummary?.isOverallocated ? colors.danger : colors.accent}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.boxTitle, { color: textColor }]}>Backed Savings Account</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowBankPickerModal(true)}
                    style={[styles.smallLinkBtn, { borderColor }]}
                  >
                    <Text style={[styles.smallLinkText, { color: goalColor }]}>
                      {linkedBank ? 'Change' : 'Link Account'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {linkedBank && bankSummary ? (
                  <View style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: textColor }}>
                        {linkedBank.bankName || 'Savings Account'} {linkedBank.accountNumberSuffix ? `•••• ${linkedBank.accountNumberSuffix}` : ''}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: bankSummary.isOverallocated ? colors.danger : colors.accent }}>
                        {bankSummary.isOverallocated ? `Deficit: -${formatIndianCompactRupees(bankSummary.deficitAmount)}` : `${formatIndianCompactRupees(bankSummary.unallocatedBalance)} unallocated`}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 11, color: subTextColor, marginTop: 2 }}>
                      Account Total: {formatIndianFullRupees(bankSummary.totalBalance)} · Allocated across {bankSummary.linkedGoalsCount} goal{bankSummary.linkedGoalsCount !== 1 ? 's' : ''}: {formatIndianFullRupees(bankSummary.totalAllocated)}
                    </Text>
                    {bankSummary.isOverallocated ? (
                      <View style={[styles.deficitNotice, { backgroundColor: isDark ? 'rgba(255, 82, 82, 0.12)' : '#FEE2E2', borderColor: colors.danger }]}>
                        <Ionicons name="alert-circle" size={14} color={colors.danger} style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 11.5, color: colors.danger, flex: 1, fontWeight: '600' }}>
                          Account balance is {formatIndianFullRupees(bankSummary.deficitAmount)} below total goals allocated. Please deposit into your bank account or adjust goal savings.
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={{ marginTop: 6 }}>
                    <Text style={{ fontSize: 12, color: subTextColor, lineHeight: 16 }}>
                      This goal is currently tracked manually without a bank balance cap. Link an account to verify real savings.
                    </Text>
                  </View>
                )}
              </View>

              {/* Quick Action: Add Funds / Withdraw / Deploy */}
              {!showDepositBox && !showWithdrawBox ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      setShowDepositBox(true);
                      setShowWithdrawBox(false);
                    }}
                    style={[styles.depositPromptBtn, { flex: 1, backgroundColor: `${goalColor}15`, borderColor: `${goalColor}40`, marginTop: 0 }]}
                  >
                    <Ionicons name="add-circle" size={18} color={goalColor} />
                    <Text style={[styles.depositPromptText, { color: goalColor }]}>
                      + Add Savings
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      if (activeGoal.currentAmount <= 0) {
                        alert('No funds available in this goal to withdraw.');
                        return;
                      }
                      setShowWithdrawBox(true);
                      setShowDepositBox(false);
                    }}
                    style={[
                      styles.depositPromptBtn,
                      {
                        flex: 1,
                        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
                        borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA',
                        marginTop: 0,
                        opacity: activeGoal.currentAmount > 0 ? 1 : 0.5,
                      },
                    ]}
                  >
                    <Ionicons name="arrow-down-circle" size={18} color={colors.danger} />
                    <Text style={[styles.depositPromptText, { color: colors.danger }]}>
                      - Withdraw
                    </Text>
                  </TouchableOpacity>

                  {(activeGoal.category === 'wealth_stash' || activeGoal.isMilestoneBased) && activeGoal.currentAmount > 0 && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setShowDeployModal(true)}
                      style={[styles.depositPromptBtn, { flex: 1, backgroundColor: cardBg, borderColor: `${goalColor}60`, marginTop: 0 }]}
                    >
                      <Ionicons name="rocket-outline" size={18} color={goalColor} />
                      <Text style={[styles.depositPromptText, { color: goalColor }]}>
                        Deploy
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : showDepositBox ? (
                <View style={[styles.depositBox, { backgroundColor: cardBg, borderColor, marginTop: 10 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.boxTitle, { color: textColor }]}>Deposit Funds to Goal</Text>
                    <TouchableOpacity onPress={() => setShowDepositBox(false)}>
                      <Ionicons name="close" size={20} color={subTextColor} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.quickDepositPills}>
                    {[1000, 2500, 5000, 10000].map((amt) => (
                      <TouchableOpacity
                        key={amt}
                        onPress={() => handleDeposit(amt)}
                        disabled={isDepositing}
                        style={[styles.depositPill, { backgroundColor: `${goalColor}18`, borderColor: goalColor }]}
                      >
                        <Text style={[styles.depositPillText, { color: goalColor }]}>
                          +₹{amt.toLocaleString('en-IN')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={[styles.customDepositRow, { borderColor }]}>
                    <Text style={[styles.currencyPrefix, { color: goalColor }]}>₹</Text>
                    <TextInput
                      style={[styles.depositInput, { color: textColor }]}
                      value={depositAmount}
                      onChangeText={setDepositAmount}
                      keyboardType="numeric"
                      placeholder="Enter custom amount..."
                      placeholderTextColor={subTextColor}
                      onFocus={() => {
                        setTimeout(() => scrollViewRef.current?.scrollTo({ y: 180, animated: true }), 150);
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => handleDeposit()}
                      disabled={isDepositing || !depositAmount}
                      style={[styles.saveDepositBtn, { backgroundColor: goalColor, opacity: isDepositing ? 0.6 : 1 }]}
                    >
                      <Text style={styles.saveDepositBtnText}>Deposit</Text>
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={[styles.noteInput, { backgroundColor: bgModal, color: textColor, borderColor }]}
                    value={depositNote}
                    onChangeText={setDepositNote}
                    placeholder="Add a note (e.g. Salary, bonus, gift)..."
                    placeholderTextColor={subTextColor}
                  />
                </View>
              ) : (
                <View style={[styles.depositBox, { backgroundColor: cardBg, borderColor, marginTop: 10 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.boxTitle, { color: colors.danger }]}>Withdraw Funds from Goal</Text>
                    <TouchableOpacity onPress={() => setShowWithdrawBox(false)}>
                      <Ionicons name="close" size={20} color={subTextColor} />
                    </TouchableOpacity>
                  </View>

                  <Text style={{ fontSize: 12, color: subTextColor, marginTop: 2, marginBottom: 8 }}>
                    Available in Goal: ₹{activeGoal.currentAmount.toLocaleString('en-IN')}
                  </Text>

                  <View style={styles.quickDepositPills}>
                    {[500, 1000, 2500].filter((amt) => amt <= activeGoal.currentAmount).map((amt) => (
                      <TouchableOpacity
                        key={amt}
                        onPress={() => handleWithdraw(amt)}
                        disabled={isWithdrawing}
                        style={[styles.depositPill, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2', borderColor: colors.danger }]}
                      >
                        <Text style={[styles.depositPillText, { color: colors.danger }]}>
                          -₹{amt.toLocaleString('en-IN')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {activeGoal.currentAmount > 0 && (
                      <TouchableOpacity
                        onPress={() => handleWithdraw(activeGoal.currentAmount)}
                        disabled={isWithdrawing}
                        style={[styles.depositPill, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FECACA', borderColor: colors.danger }]}
                      >
                        <Text style={[styles.depositPillText, { color: colors.danger, fontWeight: '700' }]}>
                          All (₹{activeGoal.currentAmount.toLocaleString('en-IN')})
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={[styles.customDepositRow, { borderColor }]}>
                    <Text style={[styles.currencyPrefix, { color: colors.danger }]}>₹</Text>
                    <TextInput
                      style={[styles.depositInput, { color: textColor }]}
                      value={withdrawAmount}
                      onChangeText={setWithdrawAmount}
                      keyboardType="numeric"
                      placeholder="Enter amount to withdraw..."
                      placeholderTextColor={subTextColor}
                      onFocus={() => {
                        setTimeout(() => scrollViewRef.current?.scrollTo({ y: 180, animated: true }), 150);
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => handleWithdraw()}
                      disabled={isWithdrawing || !withdrawAmount}
                      style={[styles.saveDepositBtn, { backgroundColor: colors.danger, opacity: isWithdrawing ? 0.6 : 1 }]}
                    >
                      <Text style={styles.saveDepositBtnText}>Withdraw</Text>
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={[styles.noteInput, { backgroundColor: bgModal, color: textColor, borderColor }]}
                    value={withdrawNote}
                    onChangeText={setWithdrawNote}
                    placeholder="Add a reason (e.g. Emergency, expense)..."
                    placeholderTextColor={subTextColor}
                  />
                </View>
              )}

              {/* Actionable Monthly Savings Plan (Clean, practical, no jargon) */}
              <View style={[styles.sectionCard, { backgroundColor: cardBg, borderColor, marginTop: 14 }]}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="calendar-outline" size={16} color={goalColor} style={{ marginRight: 6 }} />
                    <Text style={[styles.boxTitle, { color: textColor }]}>Monthly Savings Plan</Text>
                  </View>
                  <View style={[styles.planBadge, { backgroundColor: `${goalColor}18`, borderColor: goalColor }]}>
                    <Text style={[styles.planBadgeText, { color: goalColor }]}>
                      {remainingAmount <= 0 ? 'GOAL ACHIEVED' : `${pacing.monthsLeft} MO TO GO`}
                    </Text>
                  </View>
                </View>

                <View style={styles.planMetricsRow}>
                  <View style={styles.planMetricCol}>
                    <Text style={[styles.planMetricLabel, { color: subTextColor }]}>Required Pace</Text>
                    <Text style={[styles.planMetricVal, { color: goalColor }]}>
                      {remainingAmount <= 0 ? '₹0' : `₹${requiredMonthlySavings.toLocaleString('en-IN')}`}
                      <Text style={{ fontSize: 11, fontWeight: '500', color: subTextColor }}>/mo</Text>
                    </Text>
                  </View>

                  <View style={[styles.planMetricDivider, { backgroundColor: borderColor }]} />

                  <View style={styles.planMetricCol}>
                    <Text style={[styles.planMetricLabel, { color: subTextColor }]}>Remaining</Text>
                    <Text style={[styles.planMetricVal, { color: textColor }]}>
                      ₹{remainingAmount.toLocaleString('en-IN')}
                    </Text>
                  </View>

                  <View style={[styles.planMetricDivider, { backgroundColor: borderColor }]} />

                  <View style={styles.planMetricCol}>
                    <Text style={[styles.planMetricLabel, { color: subTextColor }]}>Status</Text>
                    <Text style={[styles.planMetricVal, { color: pacing.statusColor }]}>
                      {pacing.statusText}
                    </Text>
                  </View>
                </View>

                {remainingAmount > 0 ? (
                  <View style={[styles.planTipBox, { backgroundColor: `${goalColor}12`, borderColor: `${goalColor}30` }]}>
                    <Ionicons name="sparkles" size={14} color={goalColor} style={{ marginRight: 6, marginTop: 1 }} />
                    <Text style={[styles.planTipText, { color: textColor }]}>
                      Saving <Text style={{ fontWeight: '700', color: goalColor }}>₹{requiredMonthlySavings.toLocaleString('en-IN')}/month</Text> in your {linkedBank ? linkedBank.bankName : 'savings'} account reaches this target by <Text style={{ fontWeight: '700' }}>{formattedTargetDate || 'schedule'}</Text>.
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Goal Transaction History Section */}
              <View style={[styles.sectionCard, { backgroundColor: cardBg, borderColor, marginTop: 14 }]}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="time-outline" size={16} color={goalColor} style={{ marginRight: 6 }} />
                    <Text style={[styles.boxTitle, { color: textColor }]}>Goal History & Transactions</Text>
                  </View>
                  <View style={[styles.planBadge, { backgroundColor: `${goalColor}18`, borderColor: goalColor }]}>
                    <Text style={[styles.planBadgeText, { color: goalColor }]}>
                      {goalEntries.length} {goalEntries.length === 1 ? 'RECORD' : 'RECORDS'}
                    </Text>
                  </View>
                </View>

                <Text style={{ fontSize: 12, color: subTextColor, marginTop: 4, marginBottom: 10 }}>
                  Track all additions and withdrawals. Deleting a transaction automatically restores or deducts your balance.
                </Text>

                {goalEntries.length === 0 ? (
                  <View style={styles.emptyHistoryBox}>
                    <Ionicons name="receipt-outline" size={28} color={subTextColor} style={{ opacity: 0.6, marginBottom: 6 }} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: textColor }}>No transaction history</Text>
                    <Text style={{ fontSize: 11.5, color: subTextColor, textAlign: 'center', marginTop: 2 }}>
                      Use "+ Add Savings" above to log your first contribution.
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.historyTableContainer, { borderColor }]}>
                    {/* Table Header */}
                    <View style={[styles.historyTableHeader, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F3F4F6', borderBottomColor: borderColor }]}>
                      <Text style={[styles.historyHeaderCol, { flex: 1.1, color: subTextColor }]}>DATE</Text>
                      <Text style={[styles.historyHeaderCol, { flex: 1.1, color: subTextColor }]}>TYPE</Text>
                      <Text style={[styles.historyHeaderCol, { flex: 2, color: subTextColor }]}>NOTE</Text>
                      <Text style={[styles.historyHeaderCol, { flex: 1.4, textAlign: 'right', color: subTextColor }]}>AMOUNT</Text>
                      <Text style={[styles.historyHeaderCol, { width: 34, textAlign: 'center', color: subTextColor }]}>DEL</Text>
                    </View>

                    {/* Table Rows */}
                    {goalEntries.map((item, index) => {
                      const isWithdraw = item.type === 'withdraw';
                      const isOpening = item.type === 'opening';
                      const typeLabel = isWithdraw ? 'Withdraw' : isOpening ? 'Opening' : 'Deposit';
                      const typeBg = isWithdraw
                        ? (isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2')
                        : isOpening
                        ? (isDark ? 'rgba(59, 130, 246, 0.15)' : '#DBEAFE')
                        : (isDark ? 'rgba(45, 186, 78, 0.15)' : '#DCFCE7');
                      const typeColor = isWithdraw
                        ? colors.danger
                        : isOpening
                        ? '#3b82f6'
                        : '#2dba4e';

                      return (
                        <View
                          key={item.id || `entry_${index}`}
                          style={[
                            styles.historyTableRow,
                            {
                              borderBottomColor: borderColor,
                              backgroundColor: index % 2 === 1 ? (isDark ? 'rgba(255,255,255,0.02)' : '#FAFAFA') : 'transparent',
                            },
                          ]}
                        >
                          <Text style={[styles.historyRowText, { flex: 1.1, color: subTextColor }]} numberOfLines={1}>
                            {formatEntryDate(item.at)}
                          </Text>

                          <View style={{ flex: 1.1, justifyContent: 'center' }}>
                            <View style={[styles.typeBadge, { backgroundColor: typeBg, borderColor: typeColor }]}>
                              <Text style={[styles.typeBadgeText, { color: typeColor }]} numberOfLines={1}>
                                {typeLabel}
                              </Text>
                            </View>
                          </View>

                          <Text style={[styles.historyRowText, { flex: 2, color: textColor }]} numberOfLines={1}>
                            {item.note || (isWithdraw ? 'Withdrawal' : isOpening ? 'Opening balance' : 'Savings')}
                          </Text>

                          <Text
                            style={[
                              styles.historyRowText,
                              {
                                flex: 1.4,
                                textAlign: 'right',
                                fontWeight: '700',
                                color: isWithdraw ? colors.danger : colors.accent,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {isWithdraw ? '-' : '+'}₹{Number(item.amount).toLocaleString('en-IN')}
                          </Text>

                          <TouchableOpacity
                            onPress={() => handleDeleteEntry(item)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={[styles.deleteEntryBtn, { width: 34, alignItems: 'center', justifyContent: 'center' }]}
                            accessibilityLabel="Delete entry"
                          >
                            <Ionicons name="trash-outline" size={15} color={subTextColor} />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Close button */}
            <View style={[styles.footer, { borderTopColor: borderColor }]}>
              <TouchableOpacity onPress={onClose} style={[styles.doneBtn, { backgroundColor: goalColor }]}>
                <Text style={styles.doneBtnText}>Close Roadmap</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>

    {/* Sub-modal: Deploy Capital */}
    <Modal visible={showDeployModal} animationType="slide" transparent statusBarTranslucent onRequestClose={() => setShowDeployModal(false)}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowDeployModal(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.keyboardAvoidingWrap,
            Platform.OS === 'android' && isKeyboardVisible && { paddingBottom: keyboardHeight },
          ]}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: bgModal,
                borderColor,
                maxHeight: isKeyboardVisible
                  ? Math.max(280, windowHeight - keyboardHeight - (Platform.OS === 'android' ? 36 : 20))
                  : windowHeight * 0.88,
                paddingBottom: 24,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.goalTitle, { color: textColor }]}>Deploy Capital</Text>
                <Text style={{ fontSize: 12, color: subTextColor, marginTop: 2 }}>
                  From {activeGoal.name} (Available: ₹{activeGoal.currentAmount.toLocaleString('en-IN')})
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowDeployModal(false)} style={[styles.actionIconBtn, { backgroundColor: cardBg }]}>
                <Ionicons name="close" size={20} color={textColor} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[styles.deployInputLabel, { color: textColor, marginTop: 8 }]}>Amount to Deploy (₹)</Text>
              <View style={[styles.customDepositRow, { borderColor, backgroundColor: cardBg }]}>
                <Text style={[styles.currencyPrefix, { color: goalColor }]}>₹</Text>
                <TextInput
                  style={[styles.depositInput, { color: textColor }]}
                  value={deployAmount}
                  onChangeText={setDeployAmount}
                  keyboardType="numeric"
                  placeholder="e.g. 50000"
                  placeholderTextColor={subTextColor}
                />
              </View>

              <Text style={[styles.deployInputLabel, { color: textColor, marginTop: 14 }]}>New Goal Title</Text>
              <TextInput
                style={[styles.deployTextInput, { backgroundColor: cardBg, color: textColor, borderColor }]}
                value={deployName}
                onChangeText={setDeployName}
                placeholder="e.g. Europe Trip or Gold Sovereign"
                placeholderTextColor={subTextColor}
              />

              <Text style={[styles.deployInputLabel, { color: textColor, marginTop: 14 }]}>Total Target for New Goal (₹)</Text>
              <View style={[styles.customDepositRow, { borderColor, backgroundColor: cardBg }]}>
                <Text style={[styles.currencyPrefix, { color: goalColor }]}>₹</Text>
                <TextInput
                  style={[styles.depositInput, { color: textColor }]}
                  value={deployTarget}
                  onChangeText={setDeployTarget}
                  keyboardType="numeric"
                  placeholder="e.g. 150000"
                  placeholderTextColor={subTextColor}
                />
              </View>

              <Text style={[styles.deployInputLabel, { color: textColor, marginTop: 14 }]}>Goal Category</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {GOAL_CATEGORIES.filter((c) => c.id !== 'wealth_stash').map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    onPress={() => setDeployCategory(cat.id)}
                    style={[
                      styles.deployCatPill,
                      {
                        backgroundColor: deployCategory === cat.id ? `${cat.color}25` : cardBg,
                        borderColor: deployCategory === cat.id ? cat.color : borderColor,
                      },
                    ]}
                  >
                    <Ionicons name={cat.icon as any} size={14} color={deployCategory === cat.id ? cat.color : subTextColor} />
                    <Text style={{ fontSize: 11.5, fontWeight: '600', color: deployCategory === cat.id ? cat.color : textColor, marginLeft: 4 }}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={handleDeployCapital}
                disabled={isDeploying || !deployAmount || !deployName}
                style={[styles.deploySubmitBtn, { backgroundColor: goalColor, opacity: isDeploying ? 0.7 : 1 }]}
              >
                <Text style={styles.deploySubmitBtnText}>{isDeploying ? 'Deploying Capital...' : 'Deploy & Create Goal'}</Text>
                <Ionicons name="arrow-forward" size={16} color="#ffffff" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>

    {/* Bank Account Selection Modal */}
    <Modal
      visible={showBankPickerModal}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={() => setShowBankPickerModal(false)}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setShowBankPickerModal(false)}
        />
        <View
          style={[
            styles.modalContent,
            {
              backgroundColor: bgModal,
              borderColor,
              maxHeight: windowHeight * 0.82,
              paddingBottom: 24,
            },
          ]}
        >
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.goalTitle, { color: textColor }]}>Link Savings Account</Text>
              <Text style={{ fontSize: 12, color: subTextColor, marginTop: 2 }}>
                Enforces balance caps so goals don't exceed actual bank savings.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowBankPickerModal(false)}
              style={[styles.actionIconBtn, { backgroundColor: cardBg }]}
            >
              <Ionicons name="close" size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false}>
            {/* Option to unlink / Manual */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => handleSelectBank(null)}
              style={[
                styles.bankPickerItem,
                {
                  backgroundColor: !goal?.linkedBankId ? `${colors.accent}15` : cardBg,
                  borderColor: !goal?.linkedBankId ? colors.accent : borderColor,
                },
              ]}
            >
              <View style={[styles.bankPickerIcon, { backgroundColor: `${colors.textSecondary}20` }]}>
                <Ionicons name="cash-outline" size={20} color={!goal?.linkedBankId ? colors.accent : subTextColor} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: textColor }}>
                  Manual / Unlinked (No Bank Account)
                </Text>
                <Text style={{ fontSize: 11.5, color: subTextColor, marginTop: 2 }}>
                  Track savings freely without bank balance verification
                </Text>
              </View>
              {!goal?.linkedBankId && (
                <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
              )}
            </TouchableOpacity>

            {bankProfiles.length === 0 ? (
              <View style={[styles.emptyBankState, { backgroundColor: cardBg, borderColor }]}>
                <Ionicons name="business-outline" size={32} color={subTextColor} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: textColor, marginTop: 8 }}>
                  No Bank Accounts Connected
                </Text>
                <Text style={{ fontSize: 11.5, color: subTextColor, textAlign: 'center', marginTop: 4 }}>
                  Add a savings bank account in your profile to enable automated balance envelope protection.
                </Text>
              </View>
            ) : (
              bankProfiles.map((bank) => {
                const summary = getBankAllocationSummary(bank, allGoals);
                const isSelected = goal?.linkedBankId === bank.id;
                const validation = validateBankDeposit(bank, allGoals, goal?.currentAmount || 0, goal?.id);
                const canAffordCurrentGoal = validation.valid;

                return (
                  <TouchableOpacity
                    key={bank.id}
                    activeOpacity={0.7}
                    onPress={() => handleSelectBank(bank.id)}
                    style={[
                      styles.bankPickerItem,
                      {
                        backgroundColor: isSelected ? `${colors.accent}15` : cardBg,
                        borderColor: isSelected ? colors.accent : borderColor,
                      },
                    ]}
                  >
                    <View style={[styles.bankPickerIcon, { backgroundColor: isSelected ? `${colors.accent}25` : `${colors.accent}15` }]}>
                      <Ionicons
                        name="business"
                        size={20}
                        color={isSelected ? colors.accent : colors.accent}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: '700', color: textColor }}>
                        {bank.bankName || 'Savings Account'} {bank.accountNumberSuffix ? `•••• ${bank.accountNumberSuffix}` : ''}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: summary.isOverallocated || (!isSelected && !canAffordCurrentGoal) ? colors.danger : colors.accent, marginTop: 2, fontWeight: '600' }}>
                        {formatBankOptionSubtitle(summary)}
                      </Text>
                      <Text style={{ fontSize: 10.5, color: subTextColor, marginTop: 1 }}>
                        Balance: {formatIndianFullRupees(bank.currentBalance)} · Allocated: {formatIndianFullRupees(summary.totalAllocated)}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* Cover Image Picker Modal */}
    <GoalImagePickerModal
      goal={goal}
      visible={showImagePickerModal}
      onClose={() => setShowImagePickerModal(false)}
      onSelectPreset={handleSelectPreset}
      onCustomImagePicked={handleCustomImagePicked}
      onResetToAuto={handleResetToAuto}
    />
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'flex-end',
    ...(Platform.OS === 'web' ? { height: '100dvh' as any, width: '100vw' as any, position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0 } : {}),
  },
  keyboardAvoidingWrap: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  heroFrame: {
    width: '100%',
    height: 220,
    position: 'relative',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroTopActions: {
    position: 'absolute',
    top: 14,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 2,
  },
  heroIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBottomBar: {
    position: 'absolute',
    bottom: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    zIndex: 2,
  },
  heroGoalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  heroStatusText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  heroPriorityPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  heroPriorityText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroEditPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    gap: 5,
  },
  heroEditText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
  },
  goalIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statusBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    textTransform: 'uppercase',
  },
  priorityBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: 6,
  },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    paddingHorizontal: 20,
    maxHeight: 560,
  },
  heroSummaryCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricBig: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginVertical: 2,
  },
  metricSub: {
    fontSize: 11,
  },
  percentBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentNumber: {
    fontSize: 14,
    fontWeight: '800',
  },
  percentSub: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  progressBarTrack: {
    height: 5,
    borderRadius: 2.5,
    marginTop: 14,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2.5,
  },
  milestoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  milestoneCol: {
    alignItems: 'center',
  },
  milestoneCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  milestoneLabel: {
    fontSize: 11,
  },
  depositPromptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    marginTop: 10,
    gap: 6,
  },
  depositPromptText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  depositBox: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginTop: 12,
  },
  boxTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  quickDepositPills: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  depositPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  depositPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  customDepositRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: '800',
    marginRight: 6,
  },
  depositInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  saveDepositBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  saveDepositBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  planBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  planMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginTop: 10,
    marginBottom: 8,
  },
  planMetricCol: {
    flex: 1,
    alignItems: 'center',
  },
  planMetricLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  planMetricVal: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 3,
  },
  planMetricDivider: {
    width: 1,
    height: 28,
  },
  planTipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
  },
  planTipText: {
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  doneBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  milestoneAchievedBanner: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 12,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  bannerSub: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
  bannerActionBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerActionBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#ffffff',
  },
  deployInputLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 6,
  },
  deployTextInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  deployCatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  deploySubmitBtn: {
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    marginBottom: 12,
  },
  deploySubmitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  smallLinkBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  smallLinkText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  deficitNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  bankPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  bankPickerIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBankState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 8,
  },
  noteInput: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 12.5,
    marginTop: 8,
  },
  historyTableContainer: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 6,
  },
  historyTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  historyHeaderCol: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  historyTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  historyRowText: {
    fontSize: 12,
    fontWeight: '500',
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  typeBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  deleteEntryBtn: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  emptyHistoryBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
});
