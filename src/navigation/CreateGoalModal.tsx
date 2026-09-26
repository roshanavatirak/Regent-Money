import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../store';
import {
  GOAL_CATEGORIES,
  GoalCategoryOption,
  getStrategyRecommendation,
  calculateRequiredMonthly,
  calculateRequiredMonths,
  goalService,
} from '../services/goalService';

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Category selection handler
  const handleSelectCategory = (cat: GoalCategoryOption) => {
    setSelectedCat(cat);
    setName(cat.defaultTitle);
    setTargetAmount(cat.defaultAmount.toString());
    setTargetMonths(cat.typicalMonths);
    setStep(2);
  };

  const parsedTarget = Math.max(1000, parseFloat(targetAmount) || 0);
  const parsedCurrent = Math.max(0, parseFloat(currentAmount) || 0);

  // Investment strategy recommendation based on months
  const strategy = useMemo(() => {
    return getStrategyRecommendation(targetMonths);
  }, [targetMonths]);

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

  const handleSave = async () => {
    if (!name.trim() || parsedTarget <= 0) return;
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: bgModal, borderColor }]}>
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
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: cardBg }]}>
              <Ionicons name="close" size={20} color={textColor} />
            </TouchableOpacity>
          </View>

          {/* Stepper Progress Bar */}
          <View style={styles.stepperTrack}>
            <View
              style={[
                styles.stepperFill,
                { width: `${(step / 3) * 100}%`, backgroundColor: selectedCat.color || '#2dba4e' },
              ]}
            />
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
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
                          { backgroundColor: cardBg, borderColor: isSelected ? cat.color : borderColor },
                          isSelected && { borderWidth: 1.5 },
                        ]}
                      >
                        <View style={[styles.catIconWrap, { backgroundColor: `${cat.color}20` }]}>
                          <Ionicons name={cat.icon as any} size={24} color={cat.color} />
                        </View>
                        <Text style={[styles.catName, { color: textColor }]}>{cat.name}</Text>
                        <Text style={[styles.catTypical, { color: subTextColor }]}>
                          ~₹{(cat.defaultAmount / 1000).toFixed(0)}K
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
                <Text style={[styles.inputLabel, { color: textColor, marginTop: 16 }]}>Target Amount (₹)</Text>
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

                {/* Initial Savings */}
                <Text style={[styles.inputLabel, { color: textColor, marginTop: 16 }]}>
                  Current Savings Already Saved (₹)
                </Text>
                <View style={[styles.amountInputRow, { backgroundColor: cardBg, borderColor }]}>
                  <Text style={[styles.currencyPrefix, { color: subTextColor }]}>₹</Text>
                  <TextInput
                    style={[styles.amountInput, { color: textColor }]}
                    value={currentAmount}
                    onChangeText={setCurrentAmount}
                    keyboardType="numeric"
                    placeholder="0 (starting fresh)"
                    placeholderTextColor={subTextColor}
                  />
                </View>
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
                      />
                    </View>

                    {/* Calculated Time Required */}
                    <View style={[styles.resultCard, { backgroundColor: `${selectedCat.color}12`, borderColor: `${selectedCat.color}40` }]}>
                      <Text style={[styles.resultLabel, { color: subTextColor }]}>Estimated Time to Reach Target:</Text>
                      <Text style={[styles.resultBigNum, { color: selectedCat.color }]}>
                        {solvedMonths} months (~{(solvedMonths / 12).toFixed(1)} years)
                      </Text>
                      <Text style={[styles.resultSub, { color: subTextColor }]}>
                        Target Date: {new Date(Date.now() + solvedMonths * 30 * 86400000).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                      </Text>
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
          </ScrollView>

          {/* Footer Buttons */}
          <View style={[styles.footerRow, { borderTopColor: borderColor }]}>
            {step > 1 && (
              <TouchableOpacity
                onPress={() => setStep((s) => (s - 1) as any)}
                style={[styles.backBtn, { borderColor }]}
              >
                <Text style={[styles.backBtnText, { color: textColor }]}>Back</Text>
              </TouchableOpacity>
            )}

            {step < 3 ? (
              <TouchableOpacity
                onPress={() => setStep((s) => (s + 1) as any)}
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
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  modalSub: {
    fontSize: 13,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.08)',
    width: '100%',
  },
  stepperFill: {
    height: '100%',
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: 520,
  },
  stepContainer: {
    paddingBottom: 24,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  catCard: {
    width: (width - 60) / 3,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    marginBottom: 6,
  },
  catIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  catName: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 2,
  },
  catTypical: {
    fontSize: 11,
    fontWeight: '500',
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
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 12,
  },
  backBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  nextBtn: {
    flex: 2,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
