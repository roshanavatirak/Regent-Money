import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../store';

interface QuickActionsRowProps {
  onOpenCalendar: () => void;
}

/**
 * Paytm-Style Quick Actions Horizontal Row.
 * Sleek, compact circular action items. Prepared for more features to be added in the same row.
 */
export const QuickActionsRow: React.FC<QuickActionsRowProps> = ({ onOpenCalendar }) => {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? colors.card : '#FFFFFF',
          borderColor: isDark ? colors.border : '#F1F5F9',
        },
      ]}
    >
      <View style={styles.row}>
        {/* 1. Financial Calendar Option */}
        <TouchableOpacity
          style={styles.actionItem}
          onPress={onOpenCalendar}
          activeOpacity={0.7}
        >
          <View style={styles.circleBadge}>
            <Ionicons name="calendar" size={17} color="#FFFFFF" />
            <View style={styles.proPill}>
              <Text style={styles.proText}>AI</Text>
            </View>
          </View>
          <Text style={[styles.actionLabel, { color: colors.text }]}>Calendar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  circleBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00BAF2', // Signature Paytm electric blue
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
    shadowColor: '#00BAF2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
    position: 'relative',
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  proPill: {
    position: 'absolute',
    bottom: -2,
    backgroundColor: '#002E6E',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 0.5,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  proText: {
    fontSize: 6.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});

