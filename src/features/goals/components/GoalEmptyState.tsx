import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useTheme } from '../../../store';
import { PRESET_MAP, GoalCoverPreset } from '../services/goalIllustrationMap';

interface GoalEmptyStateProps {
  onSelectStarter: (starter: GoalCoverPreset) => void;
  onCreateCustom: () => void;
}

export const GoalEmptyState: React.FC<GoalEmptyStateProps> = ({
  onSelectStarter,
  onCreateCustom,
}) => {
  const { colors, isDark } = useTheme();

  const starterKeys = ['bike', 'travel_beach', 'emergency', 'gadget', 'home', 'wedding'];
  const starters = starterKeys.map((k) => PRESET_MAP[k]).filter(Boolean);

  return (
    <View style={styles.container}>
      <Text style={[styles.headline, { color: colors.text }]}>What are you saving for?</Text>
      <Text style={[styles.subheadline, { color: colors.textSecondary }]}>
        Pick a starter to begin, or create your own custom goal.
      </Text>

      {/* Grid of 6 Popular Starters */}
      <View style={styles.grid}>
        {starters.map((starter) => (
          <TouchableOpacity
            key={starter.key}
            activeOpacity={0.88}
            onPress={() => onSelectStarter(starter)}
            style={[
              styles.starterCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.imageFrame}>
              <Image source={{ uri: starter.imageUri }} style={styles.starterImage} resizeMode="cover" />
            </View>
            <Text style={[styles.starterLabel, { color: colors.text }]} numberOfLines={1}>
              {starter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Or Custom Goal Button */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onCreateCustom}
        style={[
          styles.customBtn,
          {
            borderColor: colors.border,
            backgroundColor: colors.buttonSecondaryBackground,
          },
        ]}
      >
        <Text style={[styles.customBtnText, { color: colors.textSecondary }]}>
          + Create custom goal
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  headline: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  subheadline: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    width: '100%',
    marginBottom: 24,
  },
  starterCard: {
    width: '47%',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    paddingBottom: 10,
  },
  imageFrame: {
    height: 90,
    width: '100%',
    overflow: 'hidden',
    marginBottom: 8,
  },
  starterImage: {
    width: '100%',
    height: '100%',
  },
  starterLabel: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 10,
  },
  customBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  customBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
