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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, Goal } from '../store';
import {
  getGoalPacing,
  generateProjectionCurve,
  getStrategyRecommendation,
  goalService,
} from '../services/goalService';

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

  // Deposit input state
  const [depositAmount, setDepositAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [showDepositBox, setShowDepositBox] = useState(false);

  // Live levers for simulator
  const [extraMonthly, setExtraMonthly] = useState(0);
  const [extraRate, setExtraRate] = useState(0);
  const [extraMonths, setExtraMonths] = useState(0);

  if (!goal) return null;

  const pacing = getGoalPacing(goal);
  const goalColor = goal.color || '#2dba4e';
  const progressPercent = pacing.progressPercent;

  // Compounding numbers
  const baseMonthly = goal.monthlyContribution || Math.max(1000, Math.round((goal.targetAmount - goal.currentAmount) / Math.max(1, pacing.monthsLeft)));
  const effectiveMonthly = Math.max(0, baseMonthly + extraMonthly);
  const effectiveRate = Math.max(1, (goal.expectedReturnRate || 10) + extraRate);
  const effectiveDuration = Math.max(1, pacing.monthsLeft + extraMonths);

  // Strategy recommendation
  const strategy = getStrategyRecommendation(effectiveDuration);

  // Projection curve points
  const projection = useMemo(() => {
    return generateProjectionCurve(
      goal.currentAmount,
      effectiveMonthly,
      effectiveRate,
      effectiveDuration,
    );
  }, [goal.currentAmount, effectiveMonthly, effectiveRate, effectiveDuration]);

  const finalProjected = projection[projection.length - 1] || { balance: goal.currentAmount, invested: goal.currentAmount, gains: 0 };

  const handleDeposit = async (amt?: number) => {
    const value = amt !== undefined ? amt : parseFloat(depositAmount);
    if (!value || value <= 0) return;

    setIsDepositing(true);
    try {
      await goalService.contribute(goal.id, value);
      setDepositAmount('');
      setShowDepositBox(false);
      if (onUpdated) onUpdated();
    } catch (e: any) {
      alert('Deposit failed: ' + (e?.message || e));
    } finally {
      setIsDepositing(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = Platform.OS === 'web' 
      ? window.confirm(`Are you sure you want to delete goal "${goal.name}"?`)
      : true;

    if (confirmed) {
      try {
        await goalService.deleteGoal(goal.id);
        onClose();
        if (onUpdated) onUpdated();
      } catch (e: any) {
        alert('Failed to delete: ' + (e?.message || e));
      }
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: bgModal, borderColor }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <View style={[styles.goalIconWrap, { backgroundColor: `${goalColor}20` }]}>
                <Ionicons name={(goal.icon as any) || 'trophy'} size={24} color={goalColor} />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={[styles.goalTitle, { color: textColor }]} numberOfLines={1}>
                  {goal.name}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                  <Text style={[styles.statusBadge, { backgroundColor: `${pacing.statusColor}20`, color: pacing.statusColor }]}>
                    {pacing.statusText}
                  </Text>
                  {goal.priority && (
                    <Text style={[styles.priorityBadge, { backgroundColor: cardBg, color: subTextColor, borderColor }]}>
                      {goal.priority.toUpperCase()} PRIORITY
                    </Text>
                  )}
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity onPress={handleDelete} style={[styles.actionIconBtn, { backgroundColor: cardBg }]}>
                <Ionicons name="trash-outline" size={18} color="#f43f5e" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={[styles.actionIconBtn, { backgroundColor: cardBg }]}>
                <Ionicons name="close" size={20} color={textColor} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Progress Big Ring & Summary */}
            <View style={[styles.heroSummaryCard, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.heroRow}>
                <View>
                  <Text style={[styles.metricLabel, { color: subTextColor }]}>Saved Toward Goal</Text>
                  <Text style={[styles.metricBig, { color: goalColor }]}>
                    ₹{goal.currentAmount.toLocaleString('en-IN')}
                  </Text>
                  <Text style={[styles.metricSub, { color: subTextColor }]}>
                    Target: ₹{goal.targetAmount.toLocaleString('en-IN')} • {pacing.daysLeft} days left
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

            {/* Quick Action: Add Funds / Deposit */}
            {!showDepositBox ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShowDepositBox(true)}
                style={[styles.depositPromptBtn, { backgroundColor: `${goalColor}15`, borderColor: `${goalColor}40` }]}
              >
                <Ionicons name="add-circle" size={20} color={goalColor} />
                <Text style={[styles.depositPromptText, { color: goalColor }]}>
                  + Add Savings to this Goal
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.depositBox, { backgroundColor: cardBg, borderColor }]}>
                <Text style={[styles.boxTitle, { color: textColor }]}>Deposit Funds to Goal</Text>
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
                  />
                  <TouchableOpacity
                    onPress={() => handleDeposit()}
                    disabled={isDepositing || !depositAmount}
                    style={[styles.saveDepositBtn, { backgroundColor: goalColor, opacity: isDepositing ? 0.6 : 1 }]}
                  >
                    <Text style={styles.saveDepositBtnText}>Deposit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Smart Compounding Simulator & What-If Levers */}
            <View style={[styles.sectionCard, { backgroundColor: cardBg, borderColor, marginTop: 16 }]}>
              <View style={styles.rowBetween}>
                <Text style={[styles.boxTitle, { color: textColor }]}>Compounding Intelligence</Text>
                <Text style={[styles.strategyBadge, { backgroundColor: `${goalColor}20`, color: goalColor }]}>
                  {strategy.title}
                </Text>
              </View>
              <Text style={[styles.sectionDesc, { color: subTextColor }]}>
                Projected value at your horizon based on monthly contributions & returns.
              </Text>

              {/* Compounding Metric Split */}
              <View style={styles.compoundingMetrics}>
                <View style={styles.compCol}>
                  <Text style={[styles.compLabel, { color: subTextColor }]}>Total Projected</Text>
                  <Text style={[styles.compVal, { color: goalColor }]}>
                    ₹{finalProjected.balance.toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={styles.compCol}>
                  <Text style={[styles.compLabel, { color: subTextColor }]}>Principal Invested</Text>
                  <Text style={[styles.compVal, { color: textColor }]}>
                    ₹{finalProjected.invested.toLocaleString('en-IN')}
                  </Text>
                </View>
                <View style={styles.compCol}>
                  <Text style={[styles.compLabel, { color: subTextColor }]}>Interest Gains</Text>
                  <Text style={[styles.compVal, { color: '#2dba4e' }]}>
                    +₹{finalProjected.gains.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              {/* Interactive Levers */}
              <Text style={[styles.leversTitle, { color: textColor }]}>Interactive Levers (What-If Simulation)</Text>
              
              {/* Lever 1: Monthly contribution */}
              <View style={styles.leverRow}>
                <Text style={[styles.leverLabel, { color: subTextColor }]}>
                  Monthly: ₹{effectiveMonthly.toLocaleString('en-IN')}
                </Text>
                <View style={styles.leverControls}>
                  <TouchableOpacity onPress={() => setExtraMonthly((m) => Math.max(-baseMonthly, m - 1000))} style={[styles.leverBtn, { borderColor }]}>
                    <Text style={[styles.leverBtnText, { color: textColor }]}>-1K</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setExtraMonthly((m) => m + 2000)} style={[styles.leverBtn, { borderColor }]}>
                    <Text style={[styles.leverBtnText, { color: goalColor }]}>+2K</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setExtraMonthly((m) => m + 5000)} style={[styles.leverBtn, { borderColor }]}>
                    <Text style={[styles.leverBtnText, { color: goalColor }]}>+5K</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Lever 2: Return Rate */}
              <View style={styles.leverRow}>
                <Text style={[styles.leverLabel, { color: subTextColor }]}>
                  Expected Return: {effectiveRate}% CAGR
                </Text>
                <View style={styles.leverControls}>
                  <TouchableOpacity onPress={() => setExtraRate((r) => Math.max(-5, r - 1))} style={[styles.leverBtn, { borderColor }]}>
                    <Text style={[styles.leverBtnText, { color: textColor }]}>-1%</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setExtraRate((r) => r + 1)} style={[styles.leverBtn, { borderColor }]}>
                    <Text style={[styles.leverBtnText, { color: goalColor }]}>+1%</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Lever 3: Duration */}
              <View style={styles.leverRow}>
                <Text style={[styles.leverLabel, { color: subTextColor }]}>
                  Timeline: {effectiveDuration} Months ({(effectiveDuration / 12).toFixed(1)}y)
                </Text>
                <View style={styles.leverControls}>
                  <TouchableOpacity onPress={() => setExtraMonths((m) => Math.max(-pacing.monthsLeft + 1, m - 6))} style={[styles.leverBtn, { borderColor }]}>
                    <Text style={[styles.leverBtnText, { color: textColor }]}>-6m</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setExtraMonths((m) => m + 6)} style={[styles.leverBtn, { borderColor }]}>
                    <Text style={[styles.leverBtnText, { color: goalColor }]}>+6m</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Behavioral Actionable Nudge */}
            <View style={[styles.nudgeCard, { backgroundColor: `${goalColor}10`, borderColor: `${goalColor}30` }]}>
              <Ionicons name="bulb-outline" size={22} color={goalColor} style={{ marginTop: 2 }} />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={[styles.nudgeTitle, { color: textColor }]}>Actionable Nudge</Text>
                <Text style={[styles.nudgeText, { color: subTextColor }]}>
                  Adding just ₹1,500/month extra would shave off 2.5 months from your deadline and earn you an additional ₹8,400 in interest!
                </Text>
              </View>
            </View>
          </ScrollView>

          {/* Close button */}
          <View style={[styles.footer, { borderTopColor: borderColor }]}>
            <TouchableOpacity onPress={onClose} style={[styles.doneBtn, { backgroundColor: goalColor }]}>
              <Text style={styles.doneBtnText}>Close Roadmap</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
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
  strategyBadge: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    textTransform: 'uppercase',
  },
  sectionDesc: {
    fontSize: 12,
    marginTop: 3,
    marginBottom: 12,
  },
  compoundingMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
  },
  compCol: {
    flex: 1,
  },
  compLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  compVal: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  leversTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  leverRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  leverLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  leverControls: {
    flexDirection: 'row',
    gap: 6,
  },
  leverBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  leverBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  nudgeCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 14,
    marginBottom: 20,
  },
  nudgeTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  nudgeText: {
    fontSize: 12,
    lineHeight: 16,
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
});
