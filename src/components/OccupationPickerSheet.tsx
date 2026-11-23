// src/components/OccupationPickerSheet.tsx
//
// Bottom sheet listing occupations in three groups (Job / Own work / Not working), with
// "Other" for anything not listed. Picks one and closes.

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, TextInput, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../store';
import { OCCUPATIONS, isListedOccupation, type Occupation } from '../constants/occupations';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
const GROUPS: Occupation['group'][] = ['Job', 'Own work', 'Not working'];

export const OccupationPickerSheet: React.FC<{
  visible: boolean;
  value: string;
  onClose: () => void;
  onPick: (value: string) => void;
}> = ({ visible, value, onClose, onPick }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');

  useEffect(() => {
    if (!visible) return;
    const custom = !!value && !isListedOccupation(value);
    setOtherOpen(custom);
    setOtherText(custom ? value : '');
  }, [visible, value]);

  const ink = colors.text;
  const muted = colors.textSecondary;
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;

  const Row = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.row, { borderBottomColor: line }, pressed && { opacity: 0.7 }]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
    >
      <Text style={[s.rowText, { color: ink }, on && { fontWeight: '700' }]}>{label}</Text>
      {on ? <Feather name="check" size={18} color={accent} /> : null}
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[s.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <View style={[s.grabber, { backgroundColor: line }]} />
        <View style={s.header}>
          <Text style={[s.title, { color: ink }]}>Occupation</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Feather name="x" size={20} color={muted} />
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          {GROUPS.map((group) => (
            <View key={group}>
              <Text style={[s.group, { color: muted }]}>{group}</Text>
              {OCCUPATIONS.filter((o) => o.group === group).map((o) => (
                <Row
                  key={o.value}
                  label={o.label}
                  on={!otherOpen && value.toLowerCase() === o.value.toLowerCase()}
                  onPress={() => {
                    onPick(o.value);
                    onClose();
                  }}
                />
              ))}
            </View>
          ))}

          <Text style={[s.group, { color: muted }]}>Something else</Text>
          <Row label="Other" on={otherOpen} onPress={() => setOtherOpen(true)} />
          {otherOpen ? (
            <View style={s.otherRow}>
              <View style={[s.field, { borderColor: line }]}>
                <TextInput
                  value={otherText}
                  onChangeText={(t) => setOtherText(t.slice(0, 60))}
                  placeholder="Type your occupation"
                  placeholderTextColor={muted}
                  autoFocus
                  autoCapitalize="words"
                  style={[s.input, { color: ink }]}
                  accessibilityLabel="Your occupation"
                />
              </View>
              <Pressable
                disabled={!otherText.trim()}
                onPress={() => {
                  onPick(otherText.trim());
                  onClose();
                }}
                style={[s.useBtn, { backgroundColor: accent, opacity: otherText.trim() ? 1 : 0.5 }]}
                accessibilityRole="button"
              >
                <Text style={{ color: isDark ? FOREST : LIME, fontWeight: '700' }}>Use</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  title: { fontSize: 17, fontWeight: '700' },
  group: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { fontSize: 15, fontWeight: '500', flex: 1, paddingRight: 12 },
  otherRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 10 },
  field: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, justifyContent: 'center' },
  input: { fontSize: 15, fontWeight: '600', paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  useBtn: { height: 48, paddingHorizontal: 18, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
