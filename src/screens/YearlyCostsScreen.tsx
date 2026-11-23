// src/screens/YearlyCostsScreen.tsx
//
// Yearly costs: school fees, insurance premium, Diwali. The app sets aside a twelfth each
// month, reminds before they're due, and keeps the payment out of month-to-month comparisons.

import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Font from 'expo-font';
import { useTheme } from '../store';
import { useMoneyCycleStore, type YearlyCost } from '../store/moneyCycleStore';
import { monthLabel, setAsidePerMonth } from '../utils/yearlyCosts';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

const PRESETS = [
  { name: 'School fees', category: 'education' },
  { name: 'Insurance premium', category: 'insurance' },
  { name: 'Diwali', category: 'shopping' },
  { name: 'Vehicle insurance', category: 'insurance' },
  { name: 'Property tax', category: 'tax' },
];

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export const YearlyCostsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const costs = useMoneyCycleStore((s) => s.yearlyCosts);
  const saveYearlyCost = useMoneyCycleStore((s) => s.saveYearlyCost);
  const removeYearlyCost = useMoneyCycleStore((s) => s.removeYearlyCost);

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [errorText, setErrorText] = useState('');

  const perMonth = useMemo(() => setAsidePerMonth(costs), [costs]);
  const sorted = useMemo(() => [...costs].sort((a, b) => a.month - b.month), [costs]);

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const field = isDark ? colors.border : '#DCE5E0';
  const accent = isDark ? LIME : FOREST;
  const accentInk = isDark ? FOREST : '#FFFFFF';

  const add = () => {
    const value = Number(amount);
    if (!name.trim()) return setErrorText('Name it, for example School fees.');
    if (!(value > 0)) return setErrorText('Enter how much it costs for the year.');
    if (month === null) return setErrorText('Pick the month it’s usually paid.');
    const cost: YearlyCost = {
      id: 'yc_' + Date.now().toString(36),
      name: name.trim().slice(0, 40),
      amount: value,
      month,
      category,
    };
    saveYearlyCost(cost);
    setName('');
    setAmount('');
    setMonth(null);
    setCategory(null);
    setErrorText('');
  };

  const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={[s.chip, on ? { backgroundColor: accent, borderColor: accent } : { backgroundColor: surface, borderColor: field }]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
    >
      <Text style={[s.chipText, { color: on ? accentInk : ink }, on && { fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={[s.header, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
          <Pressable onPress={() => navigation.goBack()} style={[s.roundBtn, { backgroundColor: surface }]} accessibilityLabel="Back">
            <Feather name="arrow-left" size={20} color={ink} />
          </Pressable>
          <Text style={[s.headerTitle, { color: ink }]}>Yearly costs</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 16) + 24 }}>
          <Animated.View entering={FadeIn.duration(300)} style={[s.hero, { backgroundColor: FOREST }]}>
            <Text style={s.heroLabel}>Set aside each month</Text>
            <Text style={[s.heroAmount, { fontFamily: display, fontWeight: display ? undefined : '800' }]}>{inr(perMonth)}</Text>
            <Text style={s.heroSub}>
              {costs.length === 0
                ? 'Add costs you pay once a year. The month you pay them won’t look like overspending, and your safe-to-spend amount keeps a twelfth aside.'
                : 'Kept out of your safe-to-spend amount, and left out of cycle-to-cycle comparisons when paid.'}
            </Text>
          </Animated.View>

          {sorted.length > 0 ? (
            <View style={[s.list, { backgroundColor: surface, borderColor: field }]}>
              {sorted.map((c, i) => (
                <View key={c.id} style={[s.row, i < sorted.length - 1 && { borderBottomWidth: 1, borderBottomColor: field }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rowName, { color: ink }]}>{c.name}</Text>
                    <Text style={[s.rowSub, { color: muted }]}>
                      {inr(c.amount)} in {monthLabel(c.month)} · {inr(c.amount / 12)} a month
                    </Text>
                  </View>
                  <Pressable onPress={() => removeYearlyCost(c.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`}>
                    <Feather name="trash-2" size={18} color={muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <Animated.View entering={FadeInDown.delay(80).duration(320)}>
            <Text style={[s.section, { color: ink }]}>Add a yearly cost</Text>
            <View style={s.chips}>
              {PRESETS.map((p) => (
                <Chip
                  key={p.name}
                  label={p.name}
                  on={name === p.name}
                  onPress={() => {
                    setName(p.name);
                    setCategory(p.category);
                    setErrorText('');
                  }}
                />
              ))}
            </View>

            <Text style={[s.label, { color: muted }]}>Name</Text>
            <View style={[s.fieldBox, { backgroundColor: surface, borderColor: field }]}>
              <TextInput
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  if (errorText) setErrorText('');
                }}
                placeholder="School fees"
                placeholderTextColor={muted}
                style={[s.fieldInput, { color: ink }]}
                accessibilityLabel="Name of the yearly cost"
              />
            </View>

            <Text style={[s.label, { color: muted }]}>Amount for the year</Text>
            <View style={[s.fieldBox, { backgroundColor: surface, borderColor: field, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <Text style={{ color: muted, fontSize: 16, fontWeight: '700' }}>₹</Text>
              <TextInput
                value={amount ? Number(amount).toLocaleString('en-IN') : ''}
                onChangeText={(t) => {
                  setAmount(t.replace(/\D/g, '').slice(0, 9));
                  if (errorText) setErrorText('');
                }}
                placeholder="40,000"
                placeholderTextColor={muted}
                keyboardType="number-pad"
                style={[s.fieldInput, { color: ink, flex: 1 }]}
                accessibilityLabel="Amount for the year in rupees"
              />
            </View>

            <Text style={[s.label, { color: muted }]}>Usually paid in</Text>
            <View style={s.chips}>
              {Array.from({ length: 12 }, (_, m) => (
                <Chip key={m} label={monthLabel(m).slice(0, 3)} on={month === m} onPress={() => setMonth(m)} />
              ))}
            </View>

            {errorText ? (
              <View style={s.errorRow}>
                <Feather name="alert-circle" size={14} color={isDark ? '#FFA8A8' : '#C92A2A'} />
                <Text style={[s.errorText, { color: isDark ? '#FFA8A8' : '#C92A2A' }]}>{errorText}</Text>
              </View>
            ) : null}

            <Pressable onPress={add} style={({ pressed }) => [s.cta, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.98 }] }]} accessibilityRole="button">
              <Text style={[s.ctaText, { color: isDark ? FOREST : LIME }]}>
                {Number(amount) > 0 ? `Add, ${inr(Number(amount) / 12)} a month` : 'Add yearly cost'}
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  hero: { borderRadius: 24, padding: 20, marginTop: 8 },
  heroLabel: { color: '#B5CEC1', fontSize: 13, fontWeight: '600' },
  heroAmount: { color: '#FFFFFF', fontSize: 34, letterSpacing: -0.8, marginTop: 4 },
  heroSub: { color: '#D9E7DF', fontSize: 13, lineHeight: 18, marginTop: 8 },

  list: { borderRadius: 18, borderWidth: 1, marginTop: 14, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12.5, marginTop: 2 },

  section: { fontSize: 15, fontWeight: '700', paddingHorizontal: 4, paddingTop: 22, paddingBottom: 10 },
  label: { fontSize: 13, fontWeight: '700', paddingHorizontal: 4, paddingTop: 16, paddingBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' },

  fieldBox: { height: 50, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center' },
  fieldInput: { fontSize: 15, fontWeight: '600', paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingHorizontal: 4 },
  errorText: { fontSize: 13, fontWeight: '600', flex: 1 },

  cta: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  ctaText: { fontSize: 15, fontWeight: '700' },
});
