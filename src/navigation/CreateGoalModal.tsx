import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useBankStore, useGoalsStore } from '../store';
import {
  GOAL_CATEGORIES,
  GoalCategoryOption,
  getStrategyRecommendation,
  calculateRequiredMonthly,
  calculateRequiredMonths,
  calculateCompoundProjections,
  goalService,
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
import { BankIcon } from '../components/BankIcon';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

const { width } = Dimensions.get('window');

interface CreateGoalModalProps {
  visible: boolean;
  onClose: () => void;
  onGoalCreated?: () => void;
}

export const CreateGoalModal: React.FC<CreateGoalModalProps> = ({
  visible,
  onClose,
  onGoalCreated,
}) => {
  const { colors, isDark } = useTheme();
  const { height: windowHeight } = useWindowDimensions();

  // Wizard step state: 1 (Category) -> 2 (Target & Initial) -> 3 (Timeline & Strategy)
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Selected Category
  const [selectedCat, setSelectedCat] = useState<GoalCategoryOption>(GOAL_CATEGORIES[0]);

  // Form states
  const [name, setName] = useState(GOAL_CATEGORIES[0].defaultTitle);
  const [targetAmount, setTargetAmount] = useState(GOAL_CATEGORIES[0].defaultAmount.toString());
  const [currentAmount, setCurrentAmount] = useState('0');
  const [targetMonths, setTargetMonths] = useState(GOAL_CATEGORIES[0].typicalMonths);
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [solverMode, setSolverMode] = useState<'by_date' | 'by_monthly'>('by_date');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [selectedBankId, setSelectedBankId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Bank Profiles & Goals for envelope accounting
  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const allGoals = useGoalsStore((state) => state.goals);

  // Auto-select first bank account if available and none selected
  useEffect(() => {
    if (!selectedBankId && bankProfiles && bankProfiles.length > 0) {
      setSelectedBankId(bankProfiles[0].id);
    }
  }, [bankProfiles]);

  // Category selection handler
  const handleSelectCategory = (cat: GoalCategoryOption) => {
    setSelectedCat(cat);
    setName(cat.defaultTitle);
    setTargetAmount(cat.defaultAmount.toString());
    setTargetMonths(cat.typicalMonths);
    if (cat.id === 'wealth_stash') {
      setSolverMode('by_monthly');
    }
    setStep(2);
  };

  const parsedTarget = Math.max(1000, parseFloat(targetAmount) || 0);
  const parsedCurrent = Math.max(0, parseFloat(currentAmount) || 0);

  // Selected bank and allocation validation
  const selectedBank = useMemo(() => {
    return bankProfiles.find((b) => b.id === selectedBankId);
  }, [bankProfiles, selectedBankId]);

  const bankValidation = useMemo(() => {
    if (!selectedBank) return { valid: true, maxAllowed: Infinity };
    return validateBankDeposit(selectedBank, allGoals, parsedCurrent);
  }, [selectedBank, allGoals, parsedCurrent]);

  // Investment strategy recommendation based on months and category
  const strategy = useMemo(() => {
    return getStrategyRecommendation(targetMonths, selectedCat.id);
  }, [targetMonths, selectedCat.id]);

  // Solved monthly requirement when solverMode === 'by_date'
  const solvedMonthly = useMemo(() => {
    return calculateRequiredMonthly(parsedTarget, parsedCurrent, targetMonths, strategy.expectedReturn);
  }, [parsedTarget, parsedCurrent, targetMonths, strategy.expectedReturn]);

  // Solved duration when solverMode === 'by_monthly'
  const parsedMonthly = Math.max(100, parseFloat(monthlyContribution) || solvedMonthly);
  const solvedMonths = useMemo(() => {
    return calculateRequiredMonths(parsedTarget, parsedCurrent, parsedMonthly, strategy.expectedReturn);
  }, [parsedTarget, parsedCurrent, parsedMonthly, strategy.expectedReturn]);

  const effectiveMonths = solverMode === 'by_date' ? targetMonths : solvedMonths;
  const effectiveMonthly = solverMode === 'by_date' ? solvedMonthly : parsedMonthly;

  // Compound wealth projections across 1, 3, and 5 years (for Freedom Stash)
  const compoundProjections = useMemo(() => {
    if (selectedCat.id === 'wealth_stash') {
      return calculateCompoundProjections(effectiveMonthly, parsedCurrent, strategy.expectedReturn);
    }
    return [];
  }, [selectedCat.id, effectiveMonthly, parsedCurrent, strategy.expectedReturn]);

  const handleSave = async () => {
    if (!name.trim() || parsedTarget <= 0) return;
    if (!bankValidation.valid) {
      alert(bankValidation.errorMessage || 'Initial savings exceeds available balance in the linked bank account.');
      return;
    }
    setIsSubmitting(true);
    try {
      const targetDate = Date.now() + effectiveMonths * 30 * 24 * 60 * 60 * 1000;
      await goalService.createGoal({
        name: name.trim(),
        category: selectedCat.id,
        targetAmount: parsedTarget,
        currentAmount: parsedCurrent,
        monthlyContribution: effectiveMonthly,
        expectedReturnRate: strategy.expectedReturn,
        targetDate,
        priority,
        color: selectedCat.color,
        icon: selectedCat.icon,
        isMilestoneBased: selectedCat.id === 'wealth_stash',
        milestoneStep: 1,
        linkedBankId: selectedBankId,
      });

      // Reset & Close
      setStep(1);
      onClose();
      if (onGoalCreated) onGoalCreated();
    } catch (e: any) {
      alert('Failed to create goal: ' + (e?.message || e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const addQuickTarget = (extra: number) => {
    const cur = parseFloat(targetAmount) || 0;
    setTargetAmount((cur + extra).toString());
  };

  // Standard Theme Colors
  const bgModal = colors.card;
  const cardBg = isDark ? colors.background : colors.buttonSecondaryBackground;
  const borderColor = colors.border;
  const textColor = colors.text;
  const subTextColor = colors.textSecondary;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.keyboardAvoidingWrap}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: bgModal,
                borderColor,
                maxHeight: windowHeight * 0.9,
              },
            ]}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  {step === 1 && 'Choose Goal Type'}
                  {step === 2 && 'Target & Starting Fund'}
                  {step === 3 && 'Roadmap & Strategy'}
                </Text>
                <Text style={[styles.modalSub, { color: subTextColor }]}>
                  Step {step} of 3 • {step === 1 ? 'Select a category' : selectedCat.name}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: cardBg }]} activeOpacity={0.7}>
                <Ionicons name="close" size={17} color={textColor} />
              </TouchableOpacity>
            </View>

            {/* Segmented Stepper */}
            <View style={styles.stepperContainer}>
              {[1, 2, 3].map((stepIdx) => {
                const isActive = step === stepIdx;
                const isPassed = step > stepIdx;
                return (
                  <View
                    key={stepIdx}
                    style={[
                      styles.stepperSegment,
                      {
                        backgroundColor: isPassed
                          ? (selectedCat.color || colors.accent)
                          : isActive
                          ? (selectedCat.color || colors.accent)
                          : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                        opacity: isActive ? 1 : isPassed ? 0.6 : 0.3,
                      },
                    ]}
                  />
                );
              })}
            </View>

            <KeyboardAwareScrollView 
              ref={scrollViewRef as any}
              bottomOffset={24}
              style={styles.scrollBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 24 }}
            >
            {/* STEP 1: CATEGORY SELECTION */}
            {step === 1 && (
              <View style={styles.stepContainer}>
                <Text style={[styles.sectionLabel, { color: textColor }]}>What are you saving towards?</Text>
                <View style={styles.categoryGrid}>
                  {GOAL_CATEGORIES.map((cat) => {
                    const isSelected = selectedCat.id === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        activeOpacity={0.7}
                        onPress={() => handleSelectCategory(cat)}
                        style={[
                          styles.catCard,
                          {
                            backgroundColor: isSelected
                              ? (isDark ? `${cat.color}15` : `${cat.color}10`)
                              : cardBg,
                            borderColor: isSelected ? cat.color : borderColor,
                          },
                          isSelected && { borderWidth: 1.5 },
                        ]}
                      >
                        <View style={[styles.catIconWrap, { backgroundColor: `${cat.color}20` }]}>
                          <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                        </View>
                        <Text style={[styles.catName, { color: textColor }]} numberOfLines={2}>
                          {cat.name}
                        </Text>
                        <Text style={[styles.catTypical, { color: subTextColor }]}>
                          ~{formatIndianCompactAmount(cat.defaultAmount)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* STEP 2: TARGET AMOUNT & NAME */}
            {step === 2 && (
              <View style={styles.stepContainer}>
                <View style={[styles.selectedBanner, { backgroundColor: `${selectedCat.color}15`, borderColor: `${selectedCat.color}30` }]}>
                  <Ionicons name={selectedCat.icon as any} size={28} color={selectedCat.color} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={[styles.bannerTitle, { color: textColor }]}>{selectedCat.name}</Text>
                    <Text style={[styles.bannerDesc, { color: subTextColor }]}>{selectedCat.description}</Text>
                  </View>
                </View>

                {/* Goal Title */}
                <Text style={[styles.inputLabel, { color: textColor }]}>Goal Title</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: cardBg, color: textColor, borderColor }]}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g., Royal Enfield Hunter 350"
                  placeholderTextColor={subTextColor}
                />

                {/* Target Amount */}
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.inputLabel, { color: textColor }]}>
                    {selectedCat.id === 'wealth_stash' ? 'First Milestone Target (₹)' : 'Target Amount (₹)'}
                  </Text>
                  {selectedCat.id === 'wealth_stash' && (
                    <Text style={{ fontSize: 11.5, color: subTextColor, marginTop: -4, marginBottom: 8 }}>
                      No strict deadline. Reach this milestone, then level up or deploy to a specific goal.
                    </Text>
                  )}
                </View>
                <View style={[styles.amountInputRow, { backgroundColor: cardBg, borderColor }]}>
                  <Text style={[styles.currencyPrefix, { color: selectedCat.color }]}>₹</Text>
                  <TextInput
                    style={[styles.amountInput, { color: textColor }]}
                    value={targetAmount}
                    onChangeText={setTargetAmount}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={subTextColor}
                  />
                </View>

                {/* Quick Add Pills */}
                <View style={styles.quickAddRow}>
                  <TouchableOpacity onPress={() => addQuickTarget(10000)} style={[styles.quickPill, { backgroundColor: cardBg }]}>
                    <Text style={[styles.quickPillText, { color: textColor }]}>+10K</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => addQuickTarget(50000)} style={[styles.quickPill, { backgroundColor: cardBg }]}>
                    <Text style={[styles.quickPillText, { color: textColor }]}>+50K</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => addQuickTarget(100000)} style={[styles.quickPill, { backgroundColor: cardBg }]}>
                    <Text style={[styles.quickPillText, { color: textColor }]}>+1L</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => addQuickTarget(500000)} style={[styles.quickPill, { backgroundColor: cardBg }]}>
                    <Text style={[styles.quickPillText, { color: textColor }]}>+5L</Text>
                  </TouchableOpacity>
                </View>

                {/* Linked Bank Account Selector */}
                <View style={{ marginTop: 18 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={[styles.inputLabel, { color: textColor, marginBottom: 0 }]}>
                      Backed By Bank Account (Savings)
                    </Text>
                    {selectedBank ? (
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>
                        Verified Balance
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 11.5, color: subTextColor, marginBottom: 10, lineHeight: 16 }}>
                    Goals act as virtual envelopes. Linking an account guarantees your goals never exceed your actual savings balance.
                  </Text>

                  {bankProfiles.length === 0 ? (
                    <View
                      style={[
                        styles.bankEmptyCard,
                        { backgroundColor: cardBg, borderColor },
                      ]}
                    >
                      <Ionicons name="card-outline" size={24} color={subTextColor} style={{ marginRight: 12 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.bankEmptyTitle, { color: textColor }]}>
                          No bank accounts connected
                        </Text>
                        <Text style={[styles.bankEmptySub, { color: subTextColor }]}>
                          Connect an account in settings for automatic balance checks, or continue unlinked.
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.bankListWrap}>
                      {bankProfiles.map((b) => {
                        const isSelected = selectedBankId === b.id;
                        const summary = getBankAllocationSummary(b, allGoals);
                        const sub = formatBankOptionSubtitle(summary);

                        return (
                          <TouchableOpacity
                            key={b.id}
                            activeOpacity={0.8}
                            onPress={() => setSelectedBankId(b.id)}
                            style={[
                              styles.bankOptionCard,
                              {
                                backgroundColor: isSelected ? (isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(22, 163, 74, 0.08)') : cardBg,
                                borderColor: isSelected ? colors.accent : borderColor,
                              },
                              isSelected && { borderWidth: 1.5 },
                            ]}
                          >
                            <BankIcon
                              name={b.bankName}
                              code={b.smsSenderId || b.bankName}
                              size={32}
                              style={{ marginRight: 10 }}
                            />

                            <View style={{ flex: 1, marginRight: 8 }}>
                              <Text style={[styles.bankOptionTitle, { color: textColor }]} numberOfLines={1}>
                                {b.bankName || 'Bank Account'} {b.accountNumberSuffix ? `•••• ${b.accountNumberSuffix}` : ''}
                              </Text>
                              <Text
                                style={[
                                  styles.bankOptionSub,
                                  { color: summary.isOverallocated ? colors.warning : subTextColor },
                                ]}
                                numberOfLines={1}
                              >
                                {sub}
                              </Text>
                            </View>

                            <View
                              style={[
                                styles.radioCircle,
                                {
                                  borderColor: isSelected ? colors.accent : subTextColor,
                                  backgroundColor: isSelected ? colors.accent : 'transparent',
                                },
                              ]}
                            >
                              {isSelected ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}

                      {/* Option to create without bank account */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setSelectedBankId(undefined)}
                        style={[
                          styles.bankOptionCard,
                          {
                            backgroundColor: selectedBankId === undefined ? (isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(22, 163, 74, 0.08)') : cardBg,
                            borderColor: selectedBankId === undefined ? colors.accent : borderColor,
                          },
                          selectedBankId === undefined && { borderWidth: 1.5 },
                        ]}
                      >
                        <View style={[styles.bankIconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]}>
                          <Ionicons name="wallet-outline" size={14} color={textColor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.bankOptionTitle, { color: textColor }]}>
                            No Linked Bank Account
                          </Text>
                          <Text style={[styles.bankOptionSub, { color: subTextColor }]}>
                            Manual tracking without balance cap
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.radioCircle,
                            {
                              borderColor: selectedBankId === undefined ? colors.accent : subTextColor,
                              backgroundColor: selectedBankId === undefined ? colors.accent : 'transparent',
                            },
                          ]}
                        >
                          {selectedBankId === undefined ? <Ionicons name="checkmark" size={11} color="#FFFFFF" /> : null}
                        </View>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* Initial Savings */}
                <Text style={[styles.inputLabel, { color: textColor, marginTop: 18 }]}>
                  Current Savings Already Saved (₹)
                </Text>
                <View style={[
                  styles.amountInputRow,
                  { backgroundColor: cardBg, borderColor: !bankValidation.valid ? colors.danger : borderColor },
                  !bankValidation.valid && { borderWidth: 1.5 },
                ]}>
                  <Text style={[styles.currencyPrefix, { color: !bankValidation.valid ? colors.danger : subTextColor }]}>₹</Text>
                  <TextInput
                    style={[styles.amountInput, { color: textColor }]}
                    value={currentAmount}
                    onChangeText={setCurrentAmount}
                    keyboardType="numeric"
                    placeholder="0 (starting fresh)"
                    placeholderTextColor={subTextColor}
                    onFocus={() => {
                      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 150);
                    }}
                  />
                </View>

                {/* Real-time Allocation Validation Feedback */}
                {selectedBank ? (
                  !bankValidation.valid ? (
                    <View style={[styles.validationWarningBox, { backgroundColor: isDark ? 'rgba(255, 82, 82, 0.12)' : '#FEE2E2', borderColor: colors.danger }]}>
                      <Ionicons name="alert-circle" size={16} color={colors.danger} style={{ marginRight: 6 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.validationWarningText, { color: colors.danger }]}>
                          {bankValidation.errorMessage}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setCurrentAmount(String(bankValidation.maxAllowed))}
                          style={{ marginTop: 4 }}
                        >
                          <Text style={{ fontSize: 11.5, fontWeight: '700', color: colors.danger, textDecorationLine: 'underline' }}>
                            Use max available ({formatIndianFullRupees(bankValidation.maxAllowed)})
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : parsedCurrent > 0 ? (
                    <View style={[styles.validationSuccessBox, { backgroundColor: isDark ? 'rgba(45, 186, 78, 0.10)' : 'rgba(22, 163, 74, 0.08)', borderColor: colors.accent }]}>
                      <Ionicons name="checkmark-circle" size={14} color={colors.accent} style={{ marginRight: 6 }} />
                      <Text style={[styles.validationSuccessText, { color: colors.accent }]}>
                        {formatIndianFullRupees(parsedCurrent)} allocated · {formatIndianCompactRupees(bankValidation.maxAllowed - parsedCurrent)} will remain unallocated in {selectedBank.bankName || 'account'}.
                      </Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: 11, color: subTextColor, marginTop: 4, marginLeft: 2 }}>
                      Max available to allocate from this account: {formatIndianCompactRupees(bankValidation.maxAllowed)}
                    </Text>
                  )
                ) : null}
              </View>
            )}

            {/* STEP 3: TIMELINE & INTELLIGENCE SOLVER */}
            {step === 3 && (
              <View style={styles.stepContainer}>
                {/* Solver Mode Switcher */}
                <View style={[styles.modeSwitcher, { backgroundColor: cardBg }]}>
                  <TouchableOpacity
                    onPress={() => setSolverMode('by_date')}
                    style={[
                      styles.modeBtn,
                      solverMode === 'by_date' && { backgroundColor: selectedCat.color },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeBtnText,
                        { color: solverMode === 'by_date' ? '#ffffff' : subTextColor },
                      ]}
                    >
                      Target by Timeline
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSolverMode('by_monthly')}
                    style={[
                      styles.modeBtn,
                      solverMode === 'by_monthly' && { backgroundColor: selectedCat.color },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeBtnText,
                        { color: solverMode === 'by_monthly' ? '#ffffff' : subTextColor },
                      ]}
                    >
                      Target by Monthly SIP
                    </Text>
                  </TouchableOpacity>
                </View>

                {solverMode === 'by_date' ? (
                  <View style={{ marginTop: 16 }}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.inputLabel, { color: textColor }]}>Target Timeframe</Text>
                      <Text style={[styles.highlightValue, { color: selectedCat.color }]}>
                        {targetMonths} months ({(targetMonths / 12).toFixed(1)} yrs)
                      </Text>
                    </View>

                    {/* Quick Month Selectors */}
                    <View style={styles.quickMonthsRow}>
                      {[6, 12, 24, 36, 60, 120].map((m) => (
                        <TouchableOpacity
                          key={m}
                          onPress={() => setTargetMonths(m)}
                          style={[
                            styles.monthPill,
                            { backgroundColor: cardBg, borderColor },
                            targetMonths === m && { borderColor: selectedCat.color, borderWidth: 1.5 },
                          ]}
                        >
                          <Text style={[styles.monthPillText, { color: targetMonths === m ? selectedCat.color : textColor }]}>
                            {m >= 12 ? `${m / 12}y` : `${m}m`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Calculated Required Monthly */}
                    <View style={[styles.resultCard, { backgroundColor: `${selectedCat.color}12`, borderColor: `${selectedCat.color}40` }]}>
                      <Text style={[styles.resultLabel, { color: subTextColor }]}>Required Monthly Savings:</Text>
                      <Text style={[styles.resultBigNum, { color: selectedCat.color }]}>
                        ₹{solvedMonthly.toLocaleString('en-IN')}{' '}
                        <Text style={{ fontSize: 14, fontWeight: 'normal' }}>/ month</Text>
                      </Text>
                      <Text style={[styles.resultSub, { color: subTextColor }]}>
                        At projected {strategy.expectedReturn}% annual compounded return.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.inputLabel, { color: textColor }]}>I can commit monthly:</Text>
                    <View style={[styles.amountInputRow, { backgroundColor: cardBg, borderColor }]}>
                      <Text style={[styles.currencyPrefix, { color: selectedCat.color }]}>₹</Text>
                      <TextInput
                        style={[styles.amountInput, { color: textColor }]}
                        value={monthlyContribution}
                        onChangeText={setMonthlyContribution}
                        keyboardType="numeric"
                        placeholder={solvedMonthly.toString()}
                        placeholderTextColor={subTextColor}
                        onFocus={() => {
                          setTimeout(() => scrollViewRef.current?.scrollTo({ y: 80, animated: true }), 150);
                        }}
                      />
                    </View>

                    {/* Calculated Time Required */}
                    <View style={[styles.resultCard, { backgroundColor: `${selectedCat.color}12`, borderColor: `${selectedCat.color}40` }]}>
                      <Text style={[styles.resultLabel, { color: subTextColor }]}>Estimated Time to Reach Milestone:</Text>
                      <Text style={[styles.resultBigNum, { color: selectedCat.color }]}>
                        {solvedMonths} months (~{(solvedMonths / 12).toFixed(1)} years)
                      </Text>
                      <Text style={[styles.resultSub, { color: subTextColor }]}>
                        Estimated Date: {new Date(Date.now() + solvedMonths * 30 * 86400000).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Compound Wealth Outlook for Freedom Stash */}
                {selectedCat.id === 'wealth_stash' && compoundProjections.length > 0 && (
                  <View style={[styles.projectionContainer, { backgroundColor: `${selectedCat.color}08`, borderColor: `${selectedCat.color}35` }]}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.projectionHeader, { color: textColor }]}>Compound Wealth Outlook</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="flash" size={11} color={selectedCat.color} style={{ marginRight: 3 }} />
                        <Text style={{ fontSize: 11, color: selectedCat.color, fontWeight: '700' }}>Zero Lock-in</Text>
                      </View>
                    </View>
                    <View style={styles.projectionGrid}>
                      {compoundProjections.map((p) => (
                        <View key={p.period} style={[styles.projectionCol, { backgroundColor: cardBg, borderColor }]}>
                          <Text style={[styles.projPeriod, { color: subTextColor }]}>{p.period}</Text>
                          <Text style={[styles.projValue, { color: textColor }]}>{formatIndianCompactAmount(p.futureValue)}</Text>
                          <Text style={[styles.projGains, { color: '#10b981' }]}>+{formatIndianCompactAmount(p.gains)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Horizon-Based Recommended Strategy */}
                <View style={[styles.strategyCard, { backgroundColor: cardBg, borderColor }]}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.strategyBadge, { backgroundColor: `${selectedCat.color}25`, color: selectedCat.color }]}>
                      Recommended Asset Strategy
                    </Text>
                    <Text style={[styles.strategyReturn, { color: textColor }]}>~{strategy.expectedReturn}% CAGR</Text>
                  </View>
                  <Text style={[styles.strategyTitle, { color: textColor }]}>{strategy.title}</Text>
                  <Text style={[styles.strategyVehicle, { color: subTextColor }]}>
                    Vehicle: <Text style={{ color: textColor, fontWeight: '600' }}>{strategy.assetVehicle}</Text>
                  </Text>
                  <Text style={[styles.strategyDesc, { color: subTextColor }]}>{strategy.rationale}</Text>
                </View>

                {/* Priority Selector */}
                <Text style={[styles.inputLabel, { color: textColor, marginTop: 16 }]}>Goal Priority</Text>
                <View style={styles.priorityRow}>
                  {(['high', 'medium', 'low'] as const).map((p) => {
                    const isSelected = priority === p;
                    const pColor = p === 'high' ? '#f43f5e' : p === 'medium' ? '#f59e0b' : '#3b82f6';
                    return (
                      <TouchableOpacity
                        key={p}
                        onPress={() => setPriority(p)}
                        style={[
                          styles.priorityBtn,
                          { backgroundColor: cardBg, borderColor: isSelected ? pColor : borderColor },
                          isSelected && { borderWidth: 1.5 },
                        ]}
                      >
                        <Text style={[styles.priorityText, { color: isSelected ? pColor : textColor }]}>
                          {p.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </KeyboardAwareScrollView>

          {/* Footer Buttons */}
          <View style={[styles.footerRow, { borderTopColor: borderColor }]}>
            {step > 1 && (
              <TouchableOpacity
                onPress={() => setStep((s) => (s - 1) as any)}
                style={[styles.backBtn, { borderColor, backgroundColor: cardBg }]}
              >
                <Text style={[styles.backBtnText, { color: textColor }]}>Back</Text>
              </TouchableOpacity>
            )}

            {step < 3 ? (
              <TouchableOpacity
                onPress={() => {
                  if (step === 2 && !bankValidation.valid) {
                    alert(bankValidation.errorMessage || 'Initial savings exceeds available balance in the linked bank account.');
                    return;
                  }
                  setStep((s) => (s + 1) as any);
                }}
                style={[styles.nextBtn, { backgroundColor: selectedCat.color }]}
              >
                <Text style={styles.nextBtnText}>Continue</Text>
                <Ionicons name="arrow-forward" size={16} color="#ffffff" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleSave}
                disabled={isSubmitting}
                style={[styles.nextBtn, { backgroundColor: selectedCat.color, opacity: isSubmitting ? 0.7 : 1 }]}
              >
                <Text style={styles.nextBtnText}>{isSubmitting ? 'Creating Goal...' : 'Launch Goal'}</Text>
                <Ionicons name="checkmark-circle" size={18} color="#ffffff" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            )}
          </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
    ...(Platform.OS === 'web' ? { height: '100dvh' as any, width: '100vw' as any, position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0 } : {}),
  },
  keyboardAvoidingWrap: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  modalSub: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  stepperSegment: {
    flex: 1,
    height: 3.5,
    borderRadius: 2,
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 6,
    maxHeight: 540,
  },
  stepContainer: {
    paddingBottom: 16,
  },
  sectionLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    marginBottom: 10,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
  },
  catCard: {
    width: '31.3%',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
  },
  catIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  catName: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 14,
    marginBottom: 2,
  },
  catTypical: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  bannerDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  textInput: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '500',
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  currencyPrefix: {
    fontSize: 20,
    fontWeight: '800',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  quickPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  quickPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modeSwitcher: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  highlightValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  quickMonthsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  monthPill: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  resultCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 16,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  resultBigNum: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  resultSub: {
    fontSize: 12,
    marginTop: 4,
  },
  projectionContainer: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginTop: 12,
  },
  projectionHeader: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 8,
  },
  projectionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  projectionCol: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  projPeriod: {
    fontSize: 10.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  projValue: {
    fontSize: 12.5,
    fontWeight: '800',
    marginBottom: 2,
  },
  projGains: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  strategyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 16,
  },
  strategyBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    textTransform: 'uppercase',
  },
  strategyReturn: {
    fontSize: 13,
    fontWeight: '700',
  },
  strategyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  strategyVehicle: {
    fontSize: 12,
    marginBottom: 4,
  },
  strategyDesc: {
    fontSize: 11,
    lineHeight: 16,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  priorityBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 8 : 4,
    borderTopWidth: 1,
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
    fontSize: 14,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 2,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  bankListWrap: {
    gap: 8,
  },
  bankOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  bankIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  bankOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  bankOptionSub: {
    fontSize: 11,
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  bankEmptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  bankEmptySub: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  validationWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  validationWarningText: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
  },
  validationSuccessBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  validationSuccessText: {
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
  },
});
