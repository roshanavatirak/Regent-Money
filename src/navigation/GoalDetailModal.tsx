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
  ActivityIndicator,
  Keyboard,
  BackHandler,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, Goal, SavingsEntry, useBankStore, useGoalsStore, showGlobalConfirm, showGlobalAlert } from '../store';
import {
  getGoalPacing,
  goalService,
  GOAL_CATEGORIES,
  calculateRequiredMonthly,
  calculateRequiredMonths,
  getStrategyRecommendation,
  formatIndianCompactAmount,
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
import { BankIcon } from '../components/BankIcon';

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

const formatFullEntryDate = (dateVal: string | number | undefined) => {
  if (!dateVal) return '—';
  try {
    const raw = String(dateVal).trim();
    const d = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
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

  // Action Modal state (Add Savings / Withdraw)
  const [actionModalType, setActionModalType] = useState<'deposit' | 'withdraw' | null>(null);
  const [actionAmount, setActionAmount] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Selected Transaction for Detail & Delete view
  const [selectedEntry, setSelectedEntry] = useState<SavingsEntry | null>(null);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);

  // Options menu (Three dots) state
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  // Edit Goal & Savings Plan modal state
  const [showEditGoalModal, setShowEditGoalModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTargetAmount, setEditTargetAmount] = useState('');
  const [editSolverMode, setEditSolverMode] = useState<'by_date' | 'by_monthly'>('by_date');
  const [editTargetMonths, setEditTargetMonths] = useState<number>(12);
  const [editMonthlyContribution, setEditMonthlyContribution] = useState('');
  const [editPriority, setEditPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const editScrollViewRef = useRef<ScrollView>(null);

  // Android hardware back button handler when any sheet or modal is open
  useEffect(() => {
    if (
      (actionModalType !== null ||
        selectedEntry !== null ||
        showOptionsMenu ||
        showEditGoalModal) &&
      Platform.OS === 'android'
    ) {
      const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (showEditGoalModal) {
          setShowEditGoalModal(false);
          return true;
        }
        if (showOptionsMenu) {
          setShowOptionsMenu(false);
          return true;
        }
        if (selectedEntry !== null) {
          setSelectedEntry(null);
          return true;
        }
        if (actionModalType !== null) {
          Keyboard.dismiss();
          setActionModalType(null);
          return true;
        }
        return false;
      });
      return () => backSub.remove();
    }
  }, [actionModalType, selectedEntry, showOptionsMenu, showEditGoalModal]);

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
  const [heroWidth, setHeroWidth] = useState<number>(0);

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

  // Edit Goal Planning & Intelligence Calculations
  const handleOpenEditGoal = () => {
    if (!activeGoal) return;
    setShowOptionsMenu(false);
    setEditName(activeGoal.name);
    setEditTargetAmount(String(activeGoal.targetAmount));

    let initialMonths = 12;
    if (activeGoal.targetDate) {
      const raw = String(activeGoal.targetDate).trim();
      const dateStr = raw.length === 7 ? `${raw}-01` : raw;
      const targetTime =
        typeof activeGoal.targetDate === 'number'
          ? activeGoal.targetDate
          : new Date(dateStr).getTime();
      if (!isNaN(targetTime)) {
        initialMonths = Math.max(
          1,
          Math.ceil((targetTime - Date.now()) / (1000 * 60 * 60 * 24 * 30))
        );
      }
    }
    setEditTargetMonths(initialMonths);

    const initialMonthly =
      activeGoal.committedMonthly ||
      activeGoal.monthlyContribution ||
      requiredMonthlySavings;
    setEditMonthlyContribution(initialMonthly > 0 ? String(initialMonthly) : '');
    setEditSolverMode(activeGoal.category === 'wealth_stash' ? 'by_monthly' : 'by_date');
    setEditPriority((activeGoal.priority as any) || 'medium');
    setShowEditGoalModal(true);
  };

  const parsedEditTarget = Math.max(1000, parseFloat(editTargetAmount) || 0);
  const editCurrentSaved = activeGoal?.currentAmount || 0;
  const editRemainingNeeded = Math.max(0, parsedEditTarget - editCurrentSaved);

  const editStrategy = useMemo(() => {
    if (!activeGoal) return { title: 'Balanced Plan', expectedReturn: 8.5 };
    return getStrategyRecommendation(editTargetMonths, activeGoal.category);
  }, [editTargetMonths, activeGoal?.category]);

  const editSolvedMonthly = useMemo(() => {
    return calculateRequiredMonthly(
      parsedEditTarget,
      editCurrentSaved,
      editTargetMonths,
      editStrategy.expectedReturn
    );
  }, [parsedEditTarget, editCurrentSaved, editTargetMonths, editStrategy.expectedReturn]);

  const parsedEditMonthly = Math.max(
    100,
    parseFloat(editMonthlyContribution) || editSolvedMonthly
  );

  const editSolvedMonths = useMemo(() => {
    return calculateRequiredMonths(
      parsedEditTarget,
      editCurrentSaved,
      parsedEditMonthly,
      editStrategy.expectedReturn
    );
  }, [parsedEditTarget, editCurrentSaved, parsedEditMonthly, editStrategy.expectedReturn]);

  const effectiveEditMonths =
    editSolverMode === 'by_date' ? editTargetMonths : editSolvedMonths;
  const effectiveEditMonthly =
    editSolverMode === 'by_date' ? editSolvedMonthly : parsedEditMonthly;
  const effectiveEditTargetDate = useMemo(() => {
    const d = new Date(Date.now() + effectiveEditMonths * 30 * 24 * 60 * 60 * 1000);
    return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }, [effectiveEditMonths]);

  const handleSaveEditGoal = async () => {
    if (!activeGoal) return;
    if (!editName.trim()) {
      showGlobalAlert('Goal Name Required', 'Please enter a name for your goal.');
      return;
    }
    if (parsedEditTarget <= 0) {
      showGlobalAlert('Invalid Target', 'Please enter a valid target amount.');
      return;
    }
    if (parsedEditTarget < editCurrentSaved) {
      showGlobalAlert(
        'Target Below Current Balance',
        `Target amount (₹${parsedEditTarget.toLocaleString('en-IN')}) cannot be less than your current saved amount (₹${editCurrentSaved.toLocaleString('en-IN')}).`
      );
      return;
    }

    setIsSavingEdit(true);
    try {
      const finalMonths =
        editSolverMode === 'by_date' ? editTargetMonths : editSolvedMonths;
      const finalTargetTime = Date.now() + finalMonths * 30 * 24 * 60 * 60 * 1000;
      const finalTargetDateStr = new Date(finalTargetTime).toISOString().slice(0, 10);
      const finalMonthly =
        editSolverMode === 'by_date' ? editSolvedMonthly : parsedEditMonthly;

      const updates: Partial<Goal> = {
        name: editName.trim(),
        targetAmount: parsedEditTarget,
        targetDate: finalTargetDateStr,
        committedMonthly: finalMonthly,
        monthlyContribution: finalMonthly,
        priority: editPriority,
      };

      await goalService.updateGoal(activeGoal.id, updates);
      setShowEditGoalModal(false);
      if (onUpdated) onUpdated();
      showGlobalAlert('Goal Updated', `"${editName.trim()}" has been successfully updated.`);
    } catch (err: any) {
      showGlobalAlert('Update Failed', err?.message || 'Could not save goal updates.');
    } finally {
      setIsSavingEdit(false);
    }
  };

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

  const handleConfirmAction = async () => {
    const value = parseFloat(actionAmount);
    if (!value || value <= 0) return;

    if (actionModalType === 'deposit') {
      if (linkedBank) {
        const validation = validateBankDeposit(linkedBank, allGoals, value, activeGoal.id);
        if (!validation.valid) {
          alert(validation.errorMessage || 'Deposit exceeds available balance in the linked bank account.');
          return;
        }
      }

      setIsSubmittingAction(true);
      try {
        await goalService.contribute(activeGoal.id, value, actionNote.trim() || undefined);
        setActionAmount('');
        setActionNote('');
        setActionModalType(null);
        if (onUpdated) onUpdated();
      } catch (e: any) {
        showGlobalAlert('Deposit Failed', e?.message || e);
      } finally {
        setIsSubmittingAction(false);
      }
    } else if (actionModalType === 'withdraw') {
      if (value > activeGoal.currentAmount) {
        showGlobalAlert(
          'Withdrawal Limit',
          `Withdrawal amount (₹${value.toLocaleString('en-IN')}) cannot exceed current goal savings (₹${activeGoal.currentAmount.toLocaleString('en-IN')}).`
        );
        return;
      }

      setIsSubmittingAction(true);
      try {
        await goalService.withdraw(activeGoal.id, value, actionNote.trim() || undefined);
        setActionAmount('');
        setActionNote('');
        setActionModalType(null);
        if (onUpdated) onUpdated();
      } catch (e: any) {
        showGlobalAlert('Withdrawal Failed', e?.message || e);
      } finally {
        setIsSubmittingAction(false);
      }
    }
  };

  const handleDeleteEntry = async (entry: SavingsEntry) => {
    const isWithdraw = entry.type === 'withdraw';
    const amountStr = `₹${Number(entry.amount).toLocaleString('en-IN')}`;
    const confirmMsg = isWithdraw
      ? `Delete withdrawal of ${amountStr}? This will restore ${amountStr} back to your goal balance.`
      : `Delete savings deposit of ${amountStr}? This will deduct ${amountStr} from your goal balance.`;

    const doDelete = async () => {
      setIsDeletingEntry(true);
      try {
        await goalService.deleteEntry(activeGoal.id, entry.id);
        setSelectedEntry(null);
        if (onUpdated) onUpdated();
      } catch (err: any) {
        showGlobalAlert('Delete Failed', 'Failed to delete transaction: ' + (err?.message || err));
      } finally {
        setIsDeletingEntry(false);
      }
    };

    showGlobalConfirm({
      title: 'Delete Transaction',
      message: confirmMsg,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: doDelete,
    });
  };

  const handleSelectBank = async (bankId: string | null) => {
    try {
      if (bankId) {
        const targetBank = bankProfiles.find((b) => b.id === bankId);
        if (targetBank) {
          const validation = validateBankDeposit(targetBank, allGoals, activeGoal.currentAmount, activeGoal.id);
          if (!validation.valid) {
            showGlobalAlert('Linked Bank Error', validation.errorMessage || 'Target bank account does not have sufficient unallocated balance.');
            return;
          }
        }
      }
      await goalService.updateGoal(activeGoal.id, { linkedBankId: bankId || undefined });
      setShowBankPickerModal(false);
      if (onUpdated) onUpdated();
    } catch (err: any) {
      showGlobalAlert('Update Failed', 'Failed to update linked bank: ' + (err?.message || err));
    }
  };

  const handleDelete = async () => {
    const confirmMsg = `Are you sure you want to give up on "${activeGoal.name}"? This goal will be removed.`;
    const doDelete = async () => {
      try {
        await goalService.deleteGoal(activeGoal.id);
        onClose();
        if (onUpdated) onUpdated();
      } catch (e: any) {
        showGlobalAlert('Delete Failed', 'Failed to delete goal: ' + (e?.message || e));
      }
    };

    showGlobalConfirm({
      title: 'Give Up on Goal',
      message: confirmMsg,
      confirmText: 'Give Up',
      cancelText: 'Keep Goal',
      isDestructive: true,
      icon: 'alert-triangle',
      onConfirm: doDelete,
    });
  };

  const handleAdvanceMilestone = async (increment: number = 100000) => {
    try {
      await goalService.advanceMilestone(activeGoal.id, increment);
      if (onUpdated) onUpdated();
    } catch (e: any) {
      showGlobalAlert('Milestone Error', 'Failed to advance milestone: ' + (e?.message || e));
    }
  };

  const handleDeployCapital = async () => {
    const amt = parseFloat(deployAmount);
    if (!amt || amt <= 0) {
      showGlobalAlert('Invalid Amount', 'Please enter a valid amount to deploy');
      return;
    }
    if (amt > activeGoal.currentAmount) {
      showGlobalAlert('Limit Exceeded', `Cannot deploy more than available capital (₹${activeGoal.currentAmount.toLocaleString('en-IN')})`);
      return;
    }
    if (!deployName.trim()) {
      showGlobalAlert('Title Required', 'Please enter a title for your new goal');
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
      showGlobalAlert('Deployment Failed', 'Failed to deploy capital: ' + (e?.message || e));
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
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => {
          if (showEditGoalModal) {
            setShowEditGoalModal(false);
          } else if (showOptionsMenu) {
            setShowOptionsMenu(false);
          } else if (selectedEntry !== null) {
            setSelectedEntry(null);
          } else if (actionModalType !== null) {
            Keyboard.dismiss();
            setActionModalType(null);
          } else {
            onClose();
          }
        }}
      >
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
            {/* 1. HERO COVER BANNER (Progressive Blur & Clear Reveal matching saved percentage) */}
            <View
              style={styles.heroFrame}
              onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}
            >
              {/* Layer A: Base Grayed/Blurred Image (0% or unreached progress) with subtle reduced blur matching GoalCard */}
              <Image
                source={{ uri: coverUri }}
                blurRadius={Platform.OS === 'web' ? undefined : 2.5}
                style={[
                  styles.heroImage,
                  (Platform.OS === 'web'
                    ? { filter: 'blur(2.5px) grayscale(100%) contrast(1.05) brightness(0.65)' }
                    : {}) as any,
                ]}
                resizeMode="cover"
              />
              {/* Tone wash overlay matching global theme background */}
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: isDark ? 'rgba(36, 41, 46, 0.45)' : 'rgba(226, 232, 240, 0.35)',
                  },
                ]}
              />

              {/* Layer B: Revealed Vivid Full-Color Clear Portion (matching achieved goal progress percentage) */}
              {pacing && pacing.progressPercent > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: `${Math.min(100, Math.max(0, pacing.progressPercent))}%`,
                    overflow: 'hidden',
                  }}
                >
                  <Image
                    source={{ uri: coverUri }}
                    style={{ width: heroWidth > 0 ? heroWidth : '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                  {pacing.progressPercent < 100 ? (
                    <LinearGradient
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      colors={[
                        'transparent',
                        isDark ? 'rgba(43, 49, 55, 0.35)' : 'rgba(226, 232, 240, 0.3)',
                        isDark ? 'rgba(43, 49, 55, 0.8)' : 'rgba(226, 232, 240, 0.7)',
                      ]}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 24 }}
                    />
                  ) : null}
                </View>
              ) : null}

              {/* Layer A: Subtle top vignette for button contrast */}
              <LinearGradient
                colors={['rgba(0,0,0,0.45)', 'transparent']}
                locations={[0.0, 0.35]}
                style={StyleSheet.absoluteFill}
              />

              {/* Layer B: Downward fade out gradient seamlessly dissolving into modal background */}
              <LinearGradient
                colors={[
                  'transparent',
                  'transparent',
                  isDark ? 'rgba(36, 41, 46, 0.45)' : 'rgba(255, 255, 255, 0.45)',
                  isDark ? 'rgba(36, 41, 46, 0.92)' : 'rgba(255, 255, 255, 0.92)',
                  bgModal,
                ]}
                locations={[0.0, 0.35, 0.65, 0.88, 1.0]}
                style={StyleSheet.absoluteFill}
              />

              {/* Circular Action Button at top-right (Three-dot Goal Options) */}
              <View style={styles.heroTopActions}>
                <TouchableOpacity
                  onPress={() => setShowOptionsMenu(true)}
                  style={styles.heroIconCircle}
                  accessibilityLabel="Goal Options"
                >
                  <Ionicons name="ellipsis-vertical" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              {/* Goal Title placed in the lower fade area */}
              <View style={styles.heroBottomBar}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.heroGoalTitle, { color: textColor }]} numberOfLines={1}>
                    {activeGoal.name}
                  </Text>
                  {activeGoal.priority ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <View style={[styles.heroPriorityPill, { backgroundColor: cardBg, borderColor }]}>
                        <Text style={[styles.heroPriorityText, { color: subTextColor }]}>
                          {activeGoal.priority.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>
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

              {/* Linked Bank Card with Logo & Change Option */}
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => setShowBankPickerModal(true)}
                style={[
                  styles.sectionCard,
                  {
                    backgroundColor: cardBg,
                    borderColor,
                    marginTop: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 16,
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
                  {linkedBank ? (
                    <BankIcon
                      name={linkedBank.bankName}
                      code={linkedBank.bankName}
                      size={40}
                      style={{ marginRight: 12 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                        borderWidth: 1,
                        borderColor: borderColor,
                      }}
                    >
                      <Ionicons name="business" size={19} color={subTextColor} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: textColor }} numberOfLines={1}>
                      {linkedBank ? linkedBank.bankName : 'No Bank Linked'}
                    </Text>
                    <Text style={{ fontSize: 12, color: subTextColor, marginTop: 2 }} numberOfLines={1}>
                      {linkedBank
                        ? (linkedBank.accountNumberSuffix
                            ? `•••• ${linkedBank.accountNumberSuffix} · ₹${(linkedBank.currentBalance || 0).toLocaleString('en-IN')}`
                            : `₹${(linkedBank.currentBalance || 0).toLocaleString('en-IN')}`)
                        : 'Tap to link a bank account'}
                    </Text>
                    {bankSummary?.isOverallocated ? (
                      <Text style={{ fontSize: 11, color: colors.danger, fontWeight: '600', marginTop: 2 }}>
                        Deficit: -{formatIndianCompactRupees(bankSummary.deficitAmount)}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(45, 186, 78, 0.08)',
                    borderWidth: 1,
                    borderColor: `${goalColor}40`,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: goalColor }}>
                    {linkedBank ? 'Change' : 'Link'}
                  </Text>
                </View>
              </TouchableOpacity>



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
                    <Text style={[styles.boxTitle, { color: textColor }]}>Goal History</Text>
                  </View>
                  {/* <View style={[styles.planBadge, { backgroundColor: `${goalColor}18`, borderColor: goalColor }]}>
                    <Text style={[styles.planBadgeText, { color: goalColor }]}>
                      {goalEntries.length} {goalEntries.length === 1 ? 'RECORD' : 'RECORDS'}
                    </Text>
                  </View> */}
                </View>

                {/* <Text style={{ fontSize: 12, color: subTextColor, marginTop: 4, marginBottom: 10 }}>
                  Track all additions and withdrawals. Deleting a transaction automatically restores or deducts your balance.
                </Text> */}

                {goalEntries.length === 0 ? (
                  <View style={styles.emptyHistoryBox}>
                    <Ionicons name="receipt-outline" size={28} color={subTextColor} style={{ opacity: 0.6, marginBottom: 6 }} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: textColor }}>No transaction history</Text>
                    <Text style={{ fontSize: 11.5, color: subTextColor, textAlign: 'center', marginTop: 2 }}>
                      Use "+ Add Savings" above to log your first contribution.
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.historyListContainer, { borderColor, backgroundColor: cardBg }]}>
                    {goalEntries.map((item, index) => {
                      const isWithdraw = item.type === 'withdraw';
                      const isOpening = item.type === 'opening';
                      const iconName = isWithdraw ? 'arrow-up' : isOpening ? 'wallet' : 'arrow-down';
                      const iconColor = isWithdraw ? colors.danger : isOpening ? '#3b82f6' : '#10B981';
                      const iconBg = isWithdraw
                        ? (isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2')
                        : isOpening
                        ? (isDark ? 'rgba(59, 130, 246, 0.15)' : '#DBEAFE')
                        : (isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5');
                      const title = isWithdraw
                        ? 'Withdrawal'
                        : isOpening
                        ? 'Opening Balance'
                        : 'Savings Deposit';
                      const dateStr = formatEntryDate(item.at);

                      return (
                        <TouchableOpacity
                          key={item.id || `entry_${index}`}
                          activeOpacity={0.7}
                          onPress={() => setSelectedEntry(item)}
                          style={[
                            styles.historyItemRow,
                            index > 0 && { borderTopWidth: 1, borderTopColor: borderColor },
                          ]}
                        >
                          <View style={[styles.historyItemIconCircle, { backgroundColor: iconBg }]}>
                            <Ionicons name={iconName as any} size={13} color={iconColor} />
                          </View>

                          <View style={{ flex: 1, marginLeft: 10, marginRight: 6 }}>
                            <Text style={{ fontSize: 12.5, fontWeight: '700', color: textColor }} numberOfLines={1}>
                              {title}
                            </Text>
                            <Text style={{ fontSize: 10.5, color: subTextColor, marginTop: 1 }}>
                              {dateStr}
                            </Text>
                          </View>

                          <View style={{ alignItems: 'center', flexDirection: 'row' }}>
                            <Text
                              style={{
                                fontSize: 13.5,
                                fontWeight: '700',
                                color: isWithdraw ? colors.danger : '#10B981',
                                marginRight: 4,
                              }}
                            >
                              {isWithdraw ? '-' : '+'}₹{Number(item.amount).toLocaleString('en-IN')}
                            </Text>
                            <Ionicons name="chevron-forward" size={13} color={subTextColor} />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            </ScrollView>

            {/* Bottom Sticky Action Buttons */}
            <View style={[styles.footer, { borderTopColor: borderColor, paddingBottom: Platform.OS === 'ios' ? 20 : 12 }]}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setActionAmount('');
                  setActionNote('');
                  setActionModalType('deposit');
                }}
                style={[
                  styles.bottomActionBtn,
                  {
                    flex: 1,
                    backgroundColor: goalColor,
                  },
                ]}
              >
                <Ionicons name="add-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.bottomActionBtnText}>Add Savings</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  if (activeGoal.currentAmount <= 0) {
                    alert('No funds available in this goal to withdraw.');
                    return;
                  }
                  setActionAmount('');
                  setActionNote('');
                  setActionModalType('withdraw');
                }}
                disabled={activeGoal.currentAmount <= 0}
                style={[
                  styles.bottomActionBtn,
                  {
                    flex: 1,
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEE2E2',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5',
                    opacity: activeGoal.currentAmount > 0 ? 1 : 0.5,
                  },
                ]}
              >
                <Ionicons
                  name="arrow-down-circle"
                  size={18}
                  color={colors.danger}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.bottomActionBtnText, { color: colors.danger }]}>
                  Withdraw
                </Text>
              </TouchableOpacity>

              {(activeGoal.category === 'wealth_stash' || activeGoal.isMilestoneBased) && activeGoal.currentAmount > 0 && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowDeployModal(true)}
                  style={[
                    styles.bottomActionBtn,
                    {
                      backgroundColor: cardBg,
                      borderWidth: 1,
                      borderColor: `${goalColor}60`,
                      paddingHorizontal: 14,
                    },
                  ]}
                >
                  <Ionicons name="rocket-outline" size={18} color={goalColor} />
                  <Text style={[styles.bottomActionBtnText, { color: goalColor, marginLeft: 6 }]}>Deploy</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Dedicated Action Sheet (Add Savings / Withdraw) rendered inside single modal to prevent Android Dialog keyboard overlay */}
        {actionModalType !== null && (
          <View style={styles.actionSheetBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => {
                Keyboard.dismiss();
                setActionModalType(null);
              }}
            />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={[
                styles.keyboardAvoidingWrap,
                Platform.OS === 'android' && isKeyboardVisible && { paddingBottom: Math.max(0, keyboardHeight - 12) },
              ]}
            >
              <View
                style={[
                  styles.modalContent,
                  {
                    backgroundColor: bgModal,
                    borderColor,
                    maxHeight: isKeyboardVisible ? windowHeight * 0.58 : windowHeight * 0.85,
                  },
                ]}
              >
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.goalTitle, { color: textColor }]}>
                      {actionModalType === 'deposit' ? 'Add Savings' : 'Withdraw Funds'}
                    </Text>
                    <Text style={{ fontSize: 12, color: subTextColor, marginTop: 2 }}>
                      {actionModalType === 'deposit'
                        ? `Deposit towards ${activeGoal.name}`
                        : `From ${activeGoal.name} • Available: ₹${activeGoal.currentAmount.toLocaleString('en-IN')}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      Keyboard.dismiss();
                      setActionModalType(null);
                    }}
                    style={[styles.actionIconBtn, { backgroundColor: cardBg }]}
                  >
                    <Ionicons name="close" size={20} color={textColor} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 28 : 20 }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      color: subTextColor,
                      marginTop: 6,
                      marginBottom: 8,
                    }}
                  >
                    Amount
                  </Text>
                  <View
                    style={[
                      styles.customDepositRow,
                      {
                        borderColor,
                        backgroundColor: cardBg,
                        height: 52,
                        borderRadius: 14,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.currencyPrefix,
                        {
                          color: actionModalType === 'deposit' ? goalColor : colors.danger,
                          fontSize: 22,
                        },
                      ]}
                    >
                      ₹
                    </Text>
                    <TextInput
                      style={[
                        styles.depositInput,
                        { color: textColor, fontSize: 18, fontWeight: '700' },
                      ]}
                      value={actionAmount}
                      onChangeText={setActionAmount}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor={subTextColor}
                      autoFocus
                    />
                  </View>

                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      color: subTextColor,
                      marginTop: 14,
                      marginBottom: 8,
                    }}
                  >
                    {actionModalType === 'deposit' ? 'Note (Optional)' : 'Reason (Optional)'}
                  </Text>
                  <TextInput
                    style={[
                      styles.noteInput,
                      {
                        backgroundColor: cardBg,
                        color: textColor,
                        borderColor,
                        borderRadius: 14,
                        height: 48,
                        paddingHorizontal: 14,
                        fontSize: 14,
                        marginTop: 0,
                      },
                    ]}
                    value={actionNote}
                    onChangeText={setActionNote}
                    placeholder={
                      actionModalType === 'deposit'
                        ? 'e.g. Salary, bonus, gift'
                        : 'e.g. Expense, emergency'
                    }
                    placeholderTextColor={subTextColor}
                  />

                  <TouchableOpacity
                    onPress={handleConfirmAction}
                    disabled={
                      isSubmittingAction ||
                      !actionAmount ||
                      parseFloat(actionAmount) <= 0
                    }
                    style={[
                      styles.bottomActionBtn,
                      {
                        backgroundColor:
                          actionModalType === 'deposit' ? goalColor : colors.danger,
                        marginTop: 20,
                        height: 50,
                        borderRadius: 14,
                        opacity:
                          isSubmittingAction ||
                          !actionAmount ||
                          parseFloat(actionAmount) <= 0
                            ? 0.6
                            : 1,
                      },
                    ]}
                  >
                    {isSubmittingAction ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons
                          name={
                            actionModalType === 'deposit'
                              ? 'add-circle'
                              : 'arrow-down-circle'
                          }
                          size={20}
                          color="#FFFFFF"
                          style={{ marginRight: 8 }}
                        />
                        <Text style={[styles.bottomActionBtnText, { fontSize: 15 }]}>
                          {actionModalType === 'deposit'
                            ? actionAmount && parseFloat(actionAmount) > 0
                              ? `Deposit ₹${Number(actionAmount).toLocaleString('en-IN')}`
                              : 'Deposit Funds'
                            : actionAmount && parseFloat(actionAmount) > 0
                              ? `Withdraw ₹${Number(actionAmount).toLocaleString('en-IN')}`
                              : 'Withdraw Funds'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        )}

        {/* Transaction Detail & Delete Modal */}
        {selectedEntry !== null && (
          <View style={styles.actionSheetBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setSelectedEntry(null)}
            />
            <View
              style={[
                styles.modalContent,
                {
                  backgroundColor: bgModal,
                  borderColor,
                  paddingBottom: Platform.OS === 'ios' ? 28 : 20,
                  maxHeight: windowHeight * 0.85,
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.goalTitle, { color: textColor }]}>
                    Transaction Details
                  </Text>
                  <Text style={{ fontSize: 12, color: subTextColor, marginTop: 2 }}>
                    {activeGoal.name}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedEntry(null)}
                  style={[styles.actionIconBtn, { backgroundColor: cardBg }]}
                >
                  <Ionicons name="close" size={20} color={textColor} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
              >
                {/* Hero Amount Display */}
                <View
                  style={{
                    alignItems: 'center',
                    paddingVertical: 18,
                    borderRadius: 18,
                    backgroundColor: cardBg,
                    borderWidth: 1,
                    borderColor,
                    marginBottom: 16,
                  }}
                >
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: selectedEntry.type === 'withdraw'
                        ? (isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2')
                        : selectedEntry.type === 'opening'
                        ? (isDark ? 'rgba(59, 130, 246, 0.15)' : '#DBEAFE')
                        : (isDark ? 'rgba(16, 185, 129, 0.15)' : '#D1FAE5'),
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Ionicons
                      name={
                        selectedEntry.type === 'withdraw'
                          ? 'arrow-up'
                          : selectedEntry.type === 'opening'
                          ? 'wallet'
                          : 'arrow-down'
                      }
                      size={24}
                      color={
                        selectedEntry.type === 'withdraw'
                          ? colors.danger
                          : selectedEntry.type === 'opening'
                          ? '#3b82f6'
                          : '#10B981'
                      }
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 28,
                      fontWeight: '800',
                      letterSpacing: -0.5,
                      color: selectedEntry.type === 'withdraw' ? colors.danger : '#10B981',
                    }}
                  >
                    {selectedEntry.type === 'withdraw' ? '-' : '+'}₹{Number(selectedEntry.amount).toLocaleString('en-IN')}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: subTextColor, marginTop: 4, letterSpacing: 0.5 }}>
                    {selectedEntry.type === 'withdraw'
                      ? 'Withdrawal from Goal'
                      : selectedEntry.type === 'opening'
                      ? 'Opening Balance'
                      : 'Savings Deposit to Goal'}
                  </Text>
                </View>

                {/* Details Breakdown */}
                <View
                  style={{
                    borderRadius: 16,
                    backgroundColor: cardBg,
                    borderWidth: 1,
                    borderColor,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    marginBottom: 18,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: borderColor }}>
                    <Text style={{ fontSize: 13, color: subTextColor, fontWeight: '500' }}>Date</Text>
                    <Text style={{ fontSize: 13, color: textColor, fontWeight: '700' }}>
                      {formatFullEntryDate(selectedEntry.at)}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: borderColor }}>
                    <Text style={{ fontSize: 13, color: subTextColor, fontWeight: '500' }}>Category</Text>
                    <Text style={{ fontSize: 13, color: textColor, fontWeight: '700' }}>
                      {selectedEntry.type === 'withdraw' ? 'Withdrawal' : selectedEntry.type === 'opening' ? 'Initial Savings' : 'Goal Contribution'}
                    </Text>
                  </View>

                  {/* Note / Description */}
                  <View style={{ paddingVertical: 10 }}>
                    <Text style={{ fontSize: 13, color: subTextColor, fontWeight: '500', marginBottom: 6 }}>
                      Note / Description
                    </Text>
                    <Text
                      style={{
                        fontSize: 13.5,
                        color: selectedEntry.note ? textColor : subTextColor,
                        fontStyle: selectedEntry.note ? 'normal' : 'italic',
                        lineHeight: 19,
                      }}
                    >
                      {selectedEntry.note || 'No note added for this transaction.'}
                    </Text>
                  </View>
                </View>

                {/* Delete Button */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => handleDeleteEntry(selectedEntry)}
                  disabled={isDeletingEntry}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5',
                    opacity: isDeletingEntry ? 0.6 : 1,
                  }}
                >
                  {isDeletingEntry ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} style={{ marginRight: 8 }} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: colors.danger }}>
                        Delete Transaction
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        )}
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
                    <BankIcon
                      name={bank.bankName}
                      code={bank.smsSenderId || bank.bankName}
                      size={38}
                    />
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

    {/* Goal Options Sheet (Three Dots Action Menu) */}
    <Modal
      visible={showOptionsMenu}
      transparent
      animationType="fade"
      onRequestClose={() => setShowOptionsMenu(false)}
    >
      <TouchableOpacity
        style={styles.actionSheetBackdrop}
        activeOpacity={1}
        onPress={() => setShowOptionsMenu(false)}
      >
        <View
          style={[styles.optionsSheetCard, { backgroundColor: isDark ? '#1C2128' : '#FFFFFF', borderColor }]}
          onStartShouldSetResponder={() => true}
        >
          {/* Drag Pill */}
          <View style={styles.dragPill} />

          {/* Header */}
          <View style={styles.optionsSheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.optionsSheetTitle, { color: textColor }]}>Goal Options</Text>
              <Text style={{ fontSize: 11.5, color: subTextColor, marginTop: 2 }} numberOfLines={1}>
                {activeGoal?.name}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowOptionsMenu(false)}
              style={[styles.closeCircleBtn, { backgroundColor: cardBg }]}
            >
              <Ionicons name="close" size={18} color={textColor} />
            </TouchableOpacity>
          </View>

          {/* Action List */}
          <View style={{ marginTop: 14, gap: 10 }}>
            {/* 1. Edit Target & Savings Plan */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleOpenEditGoal}
              style={[styles.optionRowItem, { backgroundColor: cardBg, borderColor }]}
            >
              <View style={[styles.optionIconBadge, { backgroundColor: `${colors.accent}15` }]}>
                <Ionicons name="options-outline" size={20} color={colors.accent} />
              </View>
              <Text style={[styles.optionItemTitle, { color: textColor, flex: 1, marginLeft: 12 }]}>
                Edit Target & Savings Plan
              </Text>
              <Ionicons name="chevron-forward" size={18} color={subTextColor} />
            </TouchableOpacity>

            {/* 2. Change Cover Photo */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setShowOptionsMenu(false);
                setShowImagePickerModal(true);
              }}
              style={[styles.optionRowItem, { backgroundColor: cardBg, borderColor }]}
            >
              <View style={[styles.optionIconBadge, { backgroundColor: `${colors.accent}15` }]}>
                <Ionicons name="image-outline" size={20} color={colors.accent} />
              </View>
              <Text style={[styles.optionItemTitle, { color: textColor, flex: 1, marginLeft: 12 }]}>
                Change Cover Photo
              </Text>
              <Ionicons name="chevron-forward" size={18} color={subTextColor} />
            </TouchableOpacity>

            {/* 3. Give Up on Goal (Delete option in red) */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setShowOptionsMenu(false);
                handleDelete();
              }}
              style={[styles.optionRowItem, { backgroundColor: cardBg, borderColor }]}
            >
              <View style={[styles.optionIconBadge, { backgroundColor: `${colors.danger}18` }]}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </View>
              <Text style={[styles.optionItemTitle, { color: textColor, flex: 1, marginLeft: 12 }]}>
                Give Up on Goal
              </Text>
              <Ionicons name="chevron-forward" size={18} color={subTextColor} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>

    {/* Edit Target & Savings Plan Modal */}
    <Modal
      visible={showEditGoalModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowEditGoalModal(false)}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoidingWrap}
        >
          <View
            style={[
              styles.editModalContainer,
              {
                backgroundColor: isDark ? '#1C2128' : '#FFFFFF',
                borderColor,
                maxHeight: windowHeight * 0.9,
              },
            ]}
          >
            {/* Drag Handle */}
            <View style={styles.dragPill} />

            {/* Modal Header */}
            <View style={styles.editModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.editModalTitle, { color: textColor }]}>Edit Target & Savings Plan</Text>
                <Text style={{ fontSize: 11.5, color: subTextColor, marginTop: 2 }}>
                  Recalculate your monthly SIP or target timeline
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowEditGoalModal(false)}
                style={[styles.closeCircleBtn, { backgroundColor: cardBg }]}
              >
                <Ionicons name="close" size={18} color={textColor} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={editScrollViewRef}
              style={{ paddingHorizontal: 20 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 30 }}
            >
              {/* Goal Title */}
              <Text style={[styles.editSectionLabel, { color: textColor, marginTop: 12 }]}>Goal Name</Text>
              <TextInput
                style={[styles.editTextInput, { backgroundColor: cardBg, color: textColor, borderColor }]}
                value={editName}
                onChangeText={setEditName}
                placeholder="e.g. New Motorbike"
                placeholderTextColor={subTextColor}
              />

              {/* Target Amount */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                <Text style={[styles.editSectionLabel, { color: textColor }]}>Target Amount (₹)</Text>
                <Text style={{ fontSize: 11, color: subTextColor }}>
                  Current Saved: ₹{editCurrentSaved.toLocaleString('en-IN')}
                </Text>
              </View>
              <View style={[styles.customDepositRow, { borderColor, backgroundColor: cardBg, marginTop: 6 }]}>
                <Text style={[styles.currencyPrefix, { color: goalColor }]}>₹</Text>
                <TextInput
                  style={[styles.depositInput, { color: textColor }]}
                  value={editTargetAmount}
                  onChangeText={setEditTargetAmount}
                  keyboardType="numeric"
                  placeholder="e.g. 200000"
                  placeholderTextColor={subTextColor}
                />
              </View>

              {/* Quick Target Increment Chips */}
              <View style={styles.quickChipsRow}>
                {[
                  { label: '+₹25k', val: 25000 },
                  { label: '+₹50k', val: 50000 },
                  { label: '+₹1L', val: 100000 },
                  { label: '+₹5L', val: 500000 },
                ].map((chip) => (
                  <TouchableOpacity
                    key={chip.label}
                    onPress={() => {
                      const cur = parseFloat(editTargetAmount) || 0;
                      setEditTargetAmount(String(cur + chip.val));
                    }}
                    style={[styles.quickChipBtn, { backgroundColor: cardBg, borderColor }]}
                  >
                    <Text style={[styles.quickChipText, { color: colors.accent }]}>{chip.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Savings Plan Mode Selector */}
              <Text style={[styles.editSectionLabel, { color: textColor, marginTop: 16 }]}>
                Savings Plan Mode
              </Text>
              <Text style={{ fontSize: 11, color: subTextColor, marginBottom: 8 }}>
                Choose how you want Regent Money to calculate your plan
              </Text>
              <View style={[styles.modeSwitcher, { backgroundColor: cardBg, borderColor }]}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setEditSolverMode('by_date')}
                  style={[
                    styles.modeBtn,
                    editSolverMode === 'by_date' && { backgroundColor: `${colors.accent}20`, borderColor: colors.accent },
                  ]}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color={editSolverMode === 'by_date' ? colors.accent : subTextColor}
                  />
                  <Text
                    style={[
                      styles.modeBtnText,
                      { color: editSolverMode === 'by_date' ? colors.accent : textColor },
                    ]}
                  >
                    Time-wise Plan
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setEditSolverMode('by_monthly')}
                  style={[
                    styles.modeBtn,
                    editSolverMode === 'by_monthly' && { backgroundColor: `${colors.accent}20`, borderColor: colors.accent },
                  ]}
                >
                  <Ionicons
                    name="repeat-outline"
                    size={16}
                    color={editSolverMode === 'by_monthly' ? colors.accent : subTextColor}
                  />
                  <Text
                    style={[
                      styles.modeBtnText,
                      { color: editSolverMode === 'by_monthly' ? colors.accent : textColor },
                    ]}
                  >
                    Monthly SIP Plan
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Mode A: Time-wise Plan (Pick Timeline -> Calculates Monthly SIP) */}
              {editSolverMode === 'by_date' ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.editSectionLabel, { color: textColor }]}>
                    Target Timeframe: <Text style={{ color: colors.accent, fontWeight: '700' }}>{editTargetMonths} Months</Text>
                  </Text>

                  {/* Quick Month Chips */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                    <View style={styles.quickMonthsRow}>
                      {[3, 6, 12, 18, 24, 36, 48, 60].map((m) => (
                        <TouchableOpacity
                          key={m}
                          onPress={() => setEditTargetMonths(m)}
                          style={[
                            styles.monthPill,
                            {
                              backgroundColor: editTargetMonths === m ? `${colors.accent}25` : cardBg,
                              borderColor: editTargetMonths === m ? colors.accent : borderColor,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.monthPillText,
                              { color: editTargetMonths === m ? colors.accent : textColor },
                            ]}
                          >
                            {m < 12 ? `${m}m` : m % 12 === 0 ? `${m / 12}y` : `${m}m`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  {/* Stepper Row */}
                  <View style={[styles.monthStepperRow, { backgroundColor: cardBg, borderColor, marginTop: 10 }]}>
                    <TouchableOpacity
                      onPress={() => setEditTargetMonths((prev) => Math.max(1, prev - 1))}
                      style={styles.stepperBtn}
                    >
                      <Ionicons name="remove" size={18} color={textColor} />
                      <Text style={[styles.stepperBtnText, { color: textColor }]}>1 mo</Text>
                    </TouchableOpacity>

                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: textColor }}>
                        {editTargetMonths} {editTargetMonths === 1 ? 'Month' : 'Months'}
                      </Text>
                      <Text style={{ fontSize: 11, color: subTextColor, marginTop: 2 }}>
                        Target: {effectiveEditTargetDate}
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => setEditTargetMonths((prev) => prev + 1)}
                      style={styles.stepperBtn}
                    >
                      <Ionicons name="add" size={18} color={textColor} />
                      <Text style={[styles.stepperBtnText, { color: textColor }]}>1 mo</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Realtime Solved Result Card */}
                  <View style={[styles.resultCard, { backgroundColor: `${colors.accent}12`, borderColor: `${colors.accent}35`, marginTop: 12 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.resultLabel, { color: subTextColor }]}>Required Monthly Savings (SIP)</Text>
                      <View style={[styles.planBadge, { backgroundColor: `${colors.accent}20`, borderColor: colors.accent }]}>
                        <Text style={[styles.planBadgeText, { color: colors.accent }]}>{editStrategy.title}</Text>
                      </View>
                    </View>
                    <Text style={[styles.resultBigNum, { color: colors.accent }]}>
                      ₹{editSolvedMonthly.toLocaleString('en-IN')}
                      <Text style={{ fontSize: 13, fontWeight: '500', color: subTextColor }}>/month</Text>
                    </Text>
                    <Text style={[styles.resultSub, { color: textColor }]}>
                      Saving ₹{editSolvedMonthly.toLocaleString('en-IN')}/mo in your account reaches ₹{parsedEditTarget.toLocaleString('en-IN')} by <Text style={{ fontWeight: '700', color: colors.accent }}>{effectiveEditTargetDate}</Text> (with {editStrategy.expectedReturn}% CAGR).
                    </Text>
                  </View>
                </View>
              ) : (
                /* Mode B: Monthly SIP Plan (Pick Monthly -> Calculates Months) */
                <View style={{ marginTop: 12 }}>
                  <Text style={[styles.editSectionLabel, { color: textColor }]}>
                    Monthly SIP Contribution (₹)
                  </Text>
                  <View style={[styles.customDepositRow, { borderColor, backgroundColor: cardBg, marginTop: 6 }]}>
                    <Text style={[styles.currencyPrefix, { color: goalColor }]}>₹</Text>
                    <TextInput
                      style={[styles.depositInput, { color: textColor }]}
                      value={editMonthlyContribution}
                      onChangeText={setEditMonthlyContribution}
                      keyboardType="numeric"
                      placeholder="e.g. 10000"
                      placeholderTextColor={subTextColor}
                    />
                  </View>

                  {/* Quick Monthly Chips */}
                  <View style={styles.quickChipsRow}>
                    {[2000, 5000, 10000, 25000, 50000].map((amt) => (
                      <TouchableOpacity
                        key={amt}
                        onPress={() => setEditMonthlyContribution(String(amt))}
                        style={[
                          styles.quickChipBtn,
                          {
                            backgroundColor: parsedEditMonthly === amt ? `${colors.accent}20` : cardBg,
                            borderColor: parsedEditMonthly === amt ? colors.accent : borderColor,
                          },
                        ]}
                      >
                        <Text style={[styles.quickChipText, { color: parsedEditMonthly === amt ? colors.accent : textColor }]}>
                          ₹{formatIndianCompactAmount(amt)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Realtime Solved Result Card */}
                  <View style={[styles.resultCard, { backgroundColor: `${colors.accent}12`, borderColor: `${colors.accent}35`, marginTop: 12 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={[styles.resultLabel, { color: subTextColor }]}>Estimated Completion Timeline</Text>
                      <View style={[styles.planBadge, { backgroundColor: `${colors.accent}20`, borderColor: colors.accent }]}>
                        <Text style={[styles.planBadgeText, { color: colors.accent }]}>{editSolvedMonths} MO TO GO</Text>
                      </View>
                    </View>
                    <Text style={[styles.resultBigNum, { color: colors.accent }]}>
                      {editSolvedMonths} {editSolvedMonths === 1 ? 'Month' : 'Months'}
                    </Text>
                    <Text style={[styles.resultSub, { color: textColor }]}>
                      At ₹{parsedEditMonthly.toLocaleString('en-IN')}/mo, you will achieve your target of ₹{parsedEditTarget.toLocaleString('en-IN')} by <Text style={{ fontWeight: '700', color: colors.accent }}>{effectiveEditTargetDate}</Text>.
                    </Text>
                  </View>
                </View>
              )}

              {/* Priority Selector */}
              <Text style={[styles.editSectionLabel, { color: textColor, marginTop: 16 }]}>Priority</Text>
              <View style={styles.priorityRow}>
                {(['high', 'medium', 'low'] as const).map((p) => {
                  const isSelected = editPriority === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setEditPriority(p)}
                      style={[
                        styles.priorityBtn,
                        {
                          backgroundColor: isSelected ? `${colors.accent}20` : cardBg,
                          borderColor: isSelected ? colors.accent : borderColor,
                        },
                      ]}
                    >
                      <Ionicons
                        name={p === 'high' ? 'flame' : p === 'medium' ? 'flag' : 'leaf'}
                        size={14}
                        color={isSelected ? colors.accent : subTextColor}
                      />
                      <Text
                        style={[
                          styles.priorityText,
                          { color: isSelected ? colors.accent : textColor, marginLeft: 5 },
                        ]}
                      >
                        {p.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Footer Buttons */}
              <View style={[styles.footerRow, { marginTop: 22 }]}>
                <TouchableOpacity
                  onPress={() => setShowEditGoalModal(false)}
                  style={[styles.backBtn, { borderColor, backgroundColor: cardBg }]}
                >
                  <Text style={[styles.backBtnText, { color: subTextColor }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSaveEditGoal}
                  disabled={isSavingEdit || !editName.trim() || parsedEditTarget <= 0}
                  style={[
                    styles.nextBtn,
                    {
                      backgroundColor: colors.accent,
                      opacity: isSavingEdit || !editName.trim() || parsedEditTarget <= 0 ? 0.6 : 1,
                    },
                  ]}
                >
                  {isSavingEdit ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13.5 }}>Save Changes</Text>
                      <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  actionSheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'flex-end',
    zIndex: 999,
    elevation: 20,
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroTopActions: {
    position: 'absolute',
    top: 14,
    right: 16,
    zIndex: 2,
  },
  heroIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(30, 41, 59, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBottomBar: {
    position: 'absolute',
    bottom: 12,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    zIndex: 2,
  },
  heroGoalTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
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
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
  },
  bottomActionBtn: {
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomActionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
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
  historyListContainer: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 6,
  },
  historyItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  historyItemIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyHistoryBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  // Three-dots options sheet and edit goal plan styles
  heroHeaderDotsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  dragPill: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignSelf: 'center',
    marginBottom: 8,
  },
  optionsSheetCard: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    paddingTop: 10,
  },
  optionsSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
  },
  optionsSheetTitle: {
    fontSize: 16.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  closeCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  optionIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionItemTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  optionItemDesc: {
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 15,
  },
  editModalContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    paddingTop: 10,
    width: '100%',
  },
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  editModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  editSectionLabel: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  editTextInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: 6,
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  quickChipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modeSwitcher: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 6,
  },
  modeBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  quickMonthsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  monthPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  monthPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  monthStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  stepperBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    gap: 3,
  },
  stepperBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  resultCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  resultLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  resultBigNum: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: -0.4,
  },
  resultSub: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 6,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  priorityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  priorityText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  backBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  nextBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

