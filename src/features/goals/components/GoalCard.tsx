import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useBankStore, useGoalsStore } from '../../../store';
import type { Goal } from '../services/goalPacingService';
import { getGoalPacing } from '../services/goalPacingService';
import {
  getGoalCardCopy,
  formatIndianCompactRupees,
  formatIndianFullRupees,
} from '../services/goalNudgeTemplates';
import { getCoverImageUri } from '../services/goalIllustrationMap';
import { getBankAllocationSummary } from '../services/goalBankAllocationService';

interface GoalCardProps {
  goal: Goal;
  onPress: () => void;
  onLogSavings?: (goal: Goal) => void;
  onSecondaryAction?: (goal: Goal, action: string) => void;
  onEditImage?: (goal: Goal) => void;
}

export const GoalCard: React.FC<GoalCardProps> = ({
  goal,
  onPress,
  onLogSavings,
  onSecondaryAction,
  onEditImage,
}) => {
  const { colors, isDark } = useTheme();
  const [frameWidth, setFrameWidth] = useState<number>(0);

  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const allGoals = useGoalsStore((state) => state.goals);

  const linkedBank = goal.linkedBankId
    ? bankProfiles.find((b) => b.id === goal.linkedBankId)
    : undefined;
  const bankSummary = linkedBank ? getBankAllocationSummary(linkedBank, allGoals) : undefined;

  const pacing = getGoalPacing(goal);
  const coverUri = getCoverImageUri(goal);
  const hasReminder = Boolean(goal.reminder && !goal.reminder.paused);
  const copy = getGoalCardCopy(pacing, hasReminder);

  // Status dot color mapping aligned with global theme tokens
  const getDotColor = () => {
    switch (copy.statusDot) {
      case 'green':
        return colors.accent;
      case 'amber':
      case 'gold':
        return colors.warning;
      case 'grey':
      default:
        return colors.textTertiary;
    }
  };

  const dotColor = getDotColor();

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={onPress}
      style={[
        styles.cardContainer,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      {/* 1. TOP COVER ART WITH GAMIFIED PROGRESSIVE REVEAL */}
      <View
        style={styles.artFrame}
        onLayout={(e) => setFrameWidth(e.nativeEvent.layout.width)}
      >
        {/* Layer A: Base Grayed/Blurred Image (0% or unreached progress) with subtle reduced blur */}
        <Image
          source={{ uri: coverUri }}
          blurRadius={Platform.OS === 'web' ? undefined : 2.5}
          style={[
            styles.coverImage,
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

        {/* Layer B: Revealed Vivid Full-Color Clear Portion (Progressively unlocks from 1% to 100%) */}
        {frameWidth > 0 && pacing.pctSaved > 0 ? (
          <View
            style={[
              styles.revealedFrame,
              { width: `${Math.min(100, Math.max(0, pacing.pctSaved))}%` },
            ]}
          >
            <Image
              source={{ uri: coverUri }}
              style={{ width: frameWidth, height: '100%' }}
              resizeMode="cover"
            />
            {/* Soft horizontal feather fade at transition edge (no harsh line) */}
            {pacing.pctSaved < 100 ? (
              <LinearGradient
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                colors={[
                  'transparent',
                  isDark ? 'rgba(43, 49, 55, 0.35)' : 'rgba(226, 232, 240, 0.3)',
                  isDark ? 'rgba(43, 49, 55, 0.8)' : 'rgba(226, 232, 240, 0.7)',
                ]}
                style={styles.featherEdge}
              />
            ) : null}
          </View>
        ) : null}

        {/* Layer C: Downward Fadeout Gradient Scrim (Blends directly into colors.card) */}
        <LinearGradient
          colors={[
            'transparent',
            'transparent',
            isDark ? 'rgba(43, 49, 55, 0.35)' : 'rgba(255, 255, 255, 0.35)',
            isDark ? 'rgba(43, 49, 55, 0.85)' : 'rgba(255, 255, 255, 0.85)',
            colors.card,
          ]}
          locations={[0.0, 0.28, 0.58, 0.82, 1.0]}
          style={styles.gradientScrim}
        />

        {/* Linked Bank Badge on top-left of art frame */}
        {linkedBank ? (
          <View
            style={[
              styles.bankTag,
              {
                backgroundColor: bankSummary?.isOverallocated
                  ? (isDark ? 'rgba(255, 82, 82, 0.85)' : 'rgba(220, 38, 38, 0.9)')
                  : (isDark ? 'rgba(36, 41, 46, 0.8)' : 'rgba(15, 23, 42, 0.7)'),
                borderColor: bankSummary?.isOverallocated
                  ? colors.danger
                  : (isDark ? 'rgba(250, 251, 252, 0.2)' : 'rgba(255, 255, 255, 0.3)'),
              },
            ]}
          >
            <Ionicons
              name={bankSummary?.isOverallocated ? 'alert-circle' : 'business'}
              size={10}
              color={bankSummary?.isOverallocated ? '#FFFFFF' : colors.accent}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.bankTagText} numberOfLines={1}>
              {linkedBank.bankName || 'Bank'} {linkedBank.accountNumberSuffix ? `••${linkedBank.accountNumberSuffix}` : ''}
              {bankSummary?.isOverallocated ? ` (-${formatIndianCompactRupees(bankSummary.deficitAmount)})` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      {/* 2. BODY CONTENT (Solid card background for 100% predictable contrast) */}
      <View style={styles.contentBody}>
        {/* Goal Name (16sp, Semibold) */}
        <Text style={[styles.goalTitle, { color: colors.text }]} numberOfLines={1}>
          {goal.name}
        </Text>

        {/* Amount Line: "₹35,000 of ₹2.5L" left, "14%" right */}
        <View style={styles.amountRow}>
          <Text style={[styles.savedAmountText, { color: colors.text }]}>
            {formatIndianFullRupees(pacing.saved)}{' '}
            <Text style={[styles.targetAmountText, { color: colors.textSecondary }]}>
              of {formatIndianCompactRupees(pacing.effectiveTarget)}
            </Text>
          </Text>
          <Text style={[styles.percentText, { color: colors.text }]}>
            {pacing.pctSaved}%
          </Text>
        </View>

        {/* Progress Bar (6dp, rounded, accent green) */}
        <View
          style={[
            styles.progressTrack,
            { backgroundColor: isDark ? 'rgba(250, 251, 252, 0.08)' : colors.border },
          ]}
        >
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(100, Math.max(0, pacing.pctSaved))}%`,
                backgroundColor: copy.statusDot === 'gold' ? colors.warning : colors.accent,
              },
            ]}
          />
        </View>

        {/* Status Line: Dot + One Sentence */}
        <View style={styles.statusLine}>
          <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
          <Text style={[styles.statusText, { color: colors.textSecondary }]} numberOfLines={1}>
            {copy.statusText}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
  },
  artFrame: {
    height: 96,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  revealedFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  featherEdge: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 24,
  },
  gradientScrim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  editImageBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  contentBody: {
    paddingHorizontal: 12,
    paddingTop: 3,
    paddingBottom: 12,
    marginTop: -24,
  },
  goalTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  savedAmountText: {
    fontSize: 12.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  targetAmountText: {
    fontSize: 11.5,
    fontWeight: '400',
  },
  percentText: {
    fontSize: 11.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 3.5,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 5,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '400',
    flex: 1,
  },
  buttonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  secondaryBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 11,
    fontWeight: '500',
  },
  bankTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: '75%',
  },
  bankTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
});
