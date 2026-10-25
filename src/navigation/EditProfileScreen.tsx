// src/navigation/EditProfileScreen.tsx
//
// Edit profile: about you, then work and income. One save button that
// stays off until something changes.

import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet, Platform, Image } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Font from 'expo-font';
import { format } from 'date-fns';
import { useTheme, useAuthStore } from '../store';
import { authService } from '../services/authService';
import { DateTimePickerSheet } from '../components/DateTimePickerSheet';
import { calculateAge, parseDDMMYYYY, formatToDDMMYYYY } from '../components/DobDatePickerModal';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

// Stored values stay the same as before; only the labels are tidier
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const OCCUPATIONS = [
  { value: 'Salaried', label: 'Salaried' },
  { value: 'Business Owner', label: 'Business owner' },
  { value: 'Freelancer', label: 'Freelancer' },
  { value: 'Student', label: 'Student' },
  { value: 'Professional', label: 'Professional' },
];
const SOURCES = [1, 2, 3, 4];

export const EditProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const initial = useMemo(
    () => ({
      name: user?.name || '',
      dob: user?.dob || '',
      gender: user?.gender || '',
      occupation: user?.occupation || '',
      income: user?.currentIncome ? String(Math.round(Number(user.currentIncome))) : '',
      sources: user?.incomeSourcesCount || 1,
    }),
    [user]
  );

  const [name, setName] = useState(initial.name);
  const [dob, setDob] = useState(initial.dob);
  const [gender, setGender] = useState(initial.gender);
  const [occupation, setOccupation] = useState(initial.occupation);
  const [income, setIncome] = useState(initial.income);
  const [sources, setSources] = useState(initial.sources);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorText, setErrorText] = useState('');

  // You must be 18 or older
  const maxDob = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear() - 18, t.getMonth(), t.getDate());
  }, []);
  const minDob = useMemo(() => new Date(new Date().getFullYear() - 100, 0, 1), []);

  const dobDate = parseDDMMYYYY(dob);
  const age = dob ? calculateAge(dob).age : null;
  const pickerValue = dobDate && dobDate <= maxDob && dobDate >= minDob ? dobDate : maxDob;

  const dirty =
    name.trim() !== initial.name ||
    dob !== initial.dob ||
    gender !== initial.gender ||
    occupation !== initial.occupation ||
    income !== initial.income ||
    sources !== initial.sources;

  const save = async () => {
    if (!dirty || saving) return;
    if (!name.trim()) return setErrorText('Add your name.');
    if (dob) {
      const check = calculateAge(dob);
      if (check.age === null) return setErrorText('Pick your date of birth from the calendar.');
      if (!check.isAdult) return setErrorText('You need to be 18 or older to use Regent Money.');
    }

    setErrorText('');
    setSaving(true);
    try {
      await authService.updateProfile({
        name: name.trim(),
        dob: dob || undefined,
        gender: gender || undefined,
        occupation: occupation || undefined,
        currentIncome: income ? Number(income) : 0,
        incomeSourcesCount: sources,
      });
      setSaved(true);
      setTimeout(() => navigation.goBack(), 700);
    } catch (err: any) {
      setErrorText(err?.message || 'Could not save your profile. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const field = isDark ? colors.border : '#DCE5E0';
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const accentInk = isDark ? FOREST : '#FFFFFF';

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
          <Text style={[s.headerTitle, { color: ink }]}>Edit profile</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          {/* Identity */}
          <Animated.View entering={FadeIn.duration(350)} style={s.identity}>
            <View style={[s.avatarRing, { borderColor: accent }]}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={s.avatarImg} />
              ) : (
                <View style={[s.avatarFallback, { backgroundColor: isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8' }]}>
                  <Text style={[s.avatarInitial, { color: accent, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                    {(name || 'U').trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[s.identityName, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]} numberOfLines={1}>
              {name.trim() || 'Your name'}
            </Text>
          </Animated.View>

          {/* About you */}
          <Animated.View entering={FadeInDown.delay(80).duration(380)}>
            <Text style={[s.section, { color: ink }]}>About you</Text>

            <Text style={[s.label, { color: muted }]}>Full name</Text>
            <View style={[s.fieldBox, { backgroundColor: surface, borderColor: field }]}>
              <TextInput
                value={name}
                onChangeText={(t) => {
                  setName(t);
                  if (errorText) setErrorText('');
                }}
                placeholder="Your full name"
                placeholderTextColor={muted}
                autoCapitalize="words"
                style={[s.fieldInput, { color: ink }]}
                accessibilityLabel="Full name"
              />
            </View>

            <Text style={[s.label, { color: muted }]}>Date of birth</Text>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={({ pressed }) => [s.dobRow, { backgroundColor: surface, borderColor: field }, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel={dobDate ? `Date of birth ${format(dobDate, 'd MMMM yyyy')}. Change` : 'Add date of birth'}
            >
              <Feather name="calendar" size={17} color={muted} />
              <Text style={[s.dobText, { color: dobDate ? ink : muted }]}>
                {dobDate ? format(dobDate, 'd MMMM yyyy') : 'Add your date of birth'}
              </Text>
              {age !== null && age >= 0 ? (
                <View style={[s.agePill, { backgroundColor: isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8' }]}>
                  <Text style={[s.ageText, { color: accent }]}>{age} years</Text>
                </View>
              ) : (
                <Feather name="chevron-right" size={16} color={muted} />
              )}
            </Pressable>

            <Text style={[s.label, { color: muted }]}>Gender</Text>
            <View style={s.chips}>
              {GENDERS.map((g) => (
                <Chip key={g} label={g} on={gender === g} onPress={() => setGender(g)} />
              ))}
            </View>
          </Animated.View>

          {/* Work and income */}
          <Animated.View entering={FadeInDown.delay(160).duration(380)}>
            <Text style={[s.section, { color: ink, marginTop: 10 }]}>Work and income</Text>

            <Text style={[s.label, { color: muted }]}>Occupation</Text>
            <View style={s.chips}>
              {OCCUPATIONS.map((o) => (
                <Chip key={o.value} label={o.label} on={occupation === o.value} onPress={() => setOccupation(o.value)} />
              ))}
            </View>

            <Text style={[s.label, { color: muted }]}>Monthly income</Text>
            <View style={[s.incomeBox, { backgroundColor: surface, borderColor: field }]}>
              <Text style={[s.rupee, { color: muted, fontFamily: display }]}>₹</Text>
              <TextInput
                value={income ? Number(income).toLocaleString('en-IN') : ''}
                onChangeText={(t) => setIncome(t.replace(/\D/g, '').slice(0, 9))}
                placeholder="0"
                placeholderTextColor={muted}
                keyboardType="number-pad"
                style={[s.incomeInput, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}
                accessibilityLabel="Monthly income in rupees"
              />
              <Text style={[s.perMonth, { color: muted }]}>a month</Text>
            </View>

            <Text style={[s.label, { color: muted }]}>Income sources</Text>
            <View style={[s.segment, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E9EFEB' }]}>
              {SOURCES.map((n) => {
                const on = sources === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => setSources(n)}
                    style={[s.segBtn, on && { backgroundColor: isDark ? '#1E3329' : '#FFFFFF' }, on && !isDark && s.segShadow]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${n}${n === 4 ? ' or more' : ''} income source${n > 1 ? 's' : ''}`}
                  >
                    <Text style={[s.segText, { color: on ? ink : muted }, on && { fontWeight: '700' }]}>
                      {n}
                      {n === 4 ? '+' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>

          {errorText ? (
            <Animated.View entering={FadeIn.duration(200)} style={s.errorRow}>
              <Feather name="alert-circle" size={14} color={isDark ? '#FFA8A8' : '#C92A2A'} />
              <Text style={[s.errorText, { color: isDark ? '#FFA8A8' : '#C92A2A' }]}>{errorText}</Text>
            </Animated.View>
          ) : null}
        </ScrollView>

        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8, borderTopColor: line }]}>
          <Pressable
            onPress={save}
            disabled={!dirty || saving}
            style={({ pressed }) => [s.cta, { backgroundColor: accent, opacity: dirty ? 1 : 0.5 }, pressed && dirty && { transform: [{ scale: 0.98 }] }]}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color={isDark ? FOREST : LIME} />
            ) : (
              <Text style={[s.ctaText, { color: isDark ? FOREST : LIME }]}>{dirty ? 'Save changes' : 'No changes yet'}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {saved && (
        <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, s.savedWrap, { backgroundColor: pageBg }]}>
          <Animated.View entering={ZoomIn.springify().damping(12)} style={[s.savedCircle, { backgroundColor: FOREST }]}>
            <Feather name="check" size={40} color={LIME} />
          </Animated.View>
          <Text style={[s.savedText, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>Profile saved</Text>
        </Animated.View>
      )}

      <DateTimePickerSheet
        visible={pickerOpen}
        mode="date"
        title="Date of birth"
        confirmLabel="Use this date"
        value={pickerValue}
        maximumDate={maxDob}
        minimumDate={minDob}
        onClose={() => setPickerOpen(false)}
        onConfirm={(d) => {
          setDob(formatToDDMMYYYY(d));
          setErrorText('');
          setPickerOpen(false);
        }}
      />
    </View>
  );
};

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  identity: { alignItems: 'center', paddingTop: 10 },
  avatarRing: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, padding: 3 },
  avatarImg: { width: '100%', height: '100%', borderRadius: 35 },
  avatarFallback: { flex: 1, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 26 },
  identityName: { fontSize: 22, letterSpacing: -0.4, marginTop: 10, maxWidth: '90%' },

  section: { fontSize: 15, fontWeight: '700', paddingHorizontal: 4, paddingTop: 16 },
  label: { fontSize: 13, fontWeight: '700', paddingHorizontal: 4, paddingTop: 16, paddingBottom: 10 },

  fieldBox: { height: 50, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center' },
  fieldInput: { fontSize: 15, fontWeight: '600', paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },

  dobRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 54, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14 },
  dobText: { flex: 1, fontSize: 15, fontWeight: '600' },
  agePill: { height: 26, paddingHorizontal: 10, borderRadius: 13, justifyContent: 'center' },
  ageText: { fontSize: 12, fontWeight: '700' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' },

  incomeBox: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 64, borderRadius: 18, borderWidth: 1, paddingHorizontal: 16 },
  rupee: { fontSize: 22, fontWeight: '700' },
  incomeInput: { flex: 1, fontSize: 30, letterSpacing: -0.6, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  perMonth: { fontSize: 13 },

  segment: { flexDirection: 'row', gap: 4, borderRadius: 14, padding: 4 },
  segBtn: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segShadow: { shadowColor: '#0B1F17', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 1 },
  segText: { fontSize: 14, fontWeight: '600' },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 4 },
  errorText: { fontSize: 13, fontWeight: '600', flex: 1 },

  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },

  savedWrap: { alignItems: 'center', justifyContent: 'center' },
  savedCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  savedText: { fontSize: 24, marginTop: 18 },
});