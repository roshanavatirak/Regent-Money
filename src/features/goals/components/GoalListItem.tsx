import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
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

interface GoalListItemProps {
  goal: Goal;
  onPress: () => void;
  onLogSavings?: (goal: Goal) => void;
  onEditImage?: (goal: Goal) => void;
}

export const GoalListItem: React.FC<GoalListItemProps> = ({
  goal,
  onPress,
  onLogSavings,
  onEditImage,
}) => {
  const { colors, isDark } = useTheme();

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
      activeOpacity={0.88}
      onPress={onPress}
      style={[
        styles.rowContainer,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      {/* 1. LEFT THUMBNAIL LOGO / IMAGE (With Progressive Reveal) */}
      <View style={styles.thumbWrapper}>
        {/* Base Grayed Image */}
        <Image
          source={{ uri: coverUri }}
          style={[
            styles.thumbImage,
            (Platform.OS === 'web'
              ? { filter: 'grayscale(100%) contrast(1.1) brightness(0.6)' }
              : {}) as any,
          ]}
          resizeMode="cover"
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark ? 'rgba(36, 41, 46, 0.45)' : 'rgba(226, 232, 240, 0.35)',
            },
          ]}
        />

        {/* Revealed Vivid Portion */}
        {pacing.pctSaved > 0 ? (
          <View
            style={[
              styles.thumbRevealed,
              { width: `${Math.min(100, Math.max(0, pacing.pctSaved))}%` },
            ]}
          >
            <Image
              source={{ uri: coverUri }}
              style={{ width: 48, height: 48 }}
              resizeMode="cover"
            />
          </View>
        ) : null}
      </View>

      {/* 2. MIDDLE INFO */}
      <View style={styles.infoCol}>
        <View style={styles.titleRow}>
          <Text style={[styles.goalTitle, { color: colors.text }]} numberOfLines={1}>
            {goal.name}
          </Text>
        </View>

        {/* Amount Line */}
        <Text style={[styles.amountLine, { color: colors.textSecondary }]} numberOfLines={1}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>
            {formatIndianFullRupees(pacing.saved)}
          </Text>{' '}
          of {formatIndianCompactRupees(pacing.effectiveTarget)}
        </Text>

        {/* Thin Progress Track */}
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

        {/* Status Line */}
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
          <Text style={[styles.statusText, { color: colors.textSecondary }]} numberOfLines={1}>
            {copy.statusText}
          </Text>
          {linkedBank ? (
            <Text
              style={[
                styles.bankSubTag,
                { color: bankSummary?.isOverallocated ? colors.danger : colors.textTertiary },
              ]}
              numberOfLines={1}
            >
              · {linkedBank.bankName || 'Bank'} ••{linkedBank.accountNumberSuffix}
            </Text>
          ) : null}
        </View>
      </View>

      {/* 3. RIGHT CURRENT PERCENTAGE */}
      <View style={styles.percentContainer}>
        <Text
          style={[
            styles.percentValue,
            { color: pacing.pctSaved >= 100 ? colors.accent : colors.text },
          ]}
        >
          {pacing.pctSaved}%
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  thumbWrapper: {
    width: 48,
    height: 48,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    marginRight: 10,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbRevealed: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  thumbEditBtn: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
    marginRight: 8,
  },
  titleRow: {
    marginBottom: 2,
  },
  goalTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  amountLine: {
    fontSize: 11.5,
    marginBottom: 4,
  },
  progressTrack: {
    height: 3.5,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 5,
  },
  statusText: {
    fontSize: 10.5,
    fontWeight: '400',
    flex: 1,
  },
  percentContainer: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 8,
    paddingRight: 2,
    minWidth: 42,
  },
  percentValue: {
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  bankSubTag: {
    fontSize: 10.5,
    fontWeight: '500',
    marginLeft: 4,
    maxWidth: 110,
  },
});
