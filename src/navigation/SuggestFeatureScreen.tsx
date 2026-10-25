// src/navigation/SuggestFeatureScreen.tsx
//
// Suggest a feature: one clear question, a short form that saves as you type,
// and a list of ideas you've already sent.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Font from 'expo-font';
import { format } from 'date-fns';
import { useTheme } from '../store';
import { feedbackService, SentFeedback } from '../services/feedbackService';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

const AREAS = ['Regent chat', 'Bank sync', 'Budgets', 'Goals', 'Insights', 'Design', 'Something else'];
const IMPACT = ['A little', 'A lot', 'Can’t live without'];

export const SuggestFeatureScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const heading = { fontFamily: display, fontWeight: display ? undefined : ('800' as const) };

  const draft = useRef(feedbackService.getDraft('feature')).current;
  const [title, setTitle] = useState(draft.title || '');
  const [description, setDescription] = useState(draft.description || '');
  const [area, setArea] = useState(draft.area || '');
  const [impact, setImpact] = useState(draft.impact || '');
  const [focused, setFocused] = useState<'title' | 'desc' | null>(null);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [sent, setSent] = useState<SentFeedback | null>(null);
  const [history, setHistory] = useState<SentFeedback[]>(() => feedbackService.history('feature'));

  // Keep a draft while typing, so leaving the screen doesn't lose it
  const hasDraft = !!(title || description);
  useEffect(() => {
    const t = setTimeout(() => feedbackService.saveDraft('feature', { title, description, area, impact }), 400);
    return () => clearTimeout(t);
  }, [title, description, area, impact]);

  const ready = title.trim().length >= 3 && description.trim().length >= 10;

  const send = async () => {
    if (!ready || sending) return;
    setSending(true);
    setErrorText('');
    try {
      const item = await feedbackService.submit({ kind: 'feature', title, description, area: area || undefined, impact: impact || undefined });
      setSent(item);
      setHistory(feedbackService.history('feature'));
    } catch (e: any) {
      setErrorText(e?.message || 'Couldn’t send it. Try again.');
    } finally {
      setSending(false);
    }
  };

  const startAnother = () => {
    setTitle('');
    setDescription('');
    setArea('');
    setImpact('');
    setSent(null);
  };

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const field = isDark ? colors.border : '#DCE5E0';
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const accentInk = isDark ? FOREST : '#FFFFFF';
  const softGreen = isDark ? 'rgba(184,243,107,0.12)' : '#E3F2E8';

  /* ---------------- Sent ---------------- */

  if (sent) {
    return (
      <View style={[s.doneWrap, { backgroundColor: pageBg, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
        <View style={s.doneBody}>
          <Animated.View entering={ZoomIn.springify().damping(12)} style={[s.doneCircle, { backgroundColor: FOREST }]}>
            <Feather name="check" size={40} color={LIME} />
          </Animated.View>
          <Animated.Text entering={FadeIn.delay(150)} style={[s.doneTitle, { color: ink }, heading]}>Idea sent. Thank you.</Animated.Text>
          <Animated.Text entering={FadeIn.delay(220)} style={[s.doneText, { color: muted }]}>
            “{sent.title}” is with the team. You’ll find it under Your ideas.
          </Animated.Text>
        </View>
        <Pressable onPress={() => navigation.goBack()} style={[s.cta, { backgroundColor: accent }]}>
          <Text style={[s.ctaText, { color: accentFg }]}>Done</Text>
        </Pressable>
        <Pressable onPress={startAnother} style={s.secondary}>
          <Text style={[s.secondaryText, { color: muted }]}>Suggest another</Text>
        </Pressable>
      </View>
    );
  }

  /* ---------------- Form ---------------- */

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={[s.header, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
          <Pressable onPress={() => navigation.goBack()} style={[s.roundBtn, { backgroundColor: surface }]} accessibilityLabel="Back">
            <Feather name="arrow-left" size={20} color={ink} />
          </Pressable>
          <Text style={[s.headerTitle, { color: ink }]}>Suggest a feature</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Animated.View entering={FadeInDown.duration(380)}>
            <View style={s.heroIcon}>
              <Feather name="zap" size={22} color={LIME} />
            </View>
            <Text style={[s.title, { color: ink }, heading]}>What should Regent do next?</Text>
            <Text style={[s.sub, { color: muted }]}>We read every idea. Tell us what would make money easier for you.</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(380)}>
            <Text style={[s.label, { color: muted }]}>Your idea</Text>
            <View style={[s.field, { backgroundColor: surface, borderColor: focused === 'title' ? accent : field, borderWidth: focused === 'title' ? 2 : 1 }]}>
              <TextInput
                value={title}
                onChangeText={(t) => {
                  setTitle(t);
                  if (errorText) setErrorText('');
                }}
                onFocus={() => setFocused('title')}
                onBlur={() => setFocused(null)}
                placeholder="In a few words, like ‘Split bills with friends’"
                placeholderTextColor={muted}
                maxLength={80}
                style={[s.titleInput, { color: ink }]}
                accessibilityLabel="Idea title"
              />
            </View>
            <View style={[s.area, { backgroundColor: surface, borderColor: focused === 'desc' ? accent : field, borderWidth: focused === 'desc' ? 2 : 1 }]}>
              <TextInput
                value={description}
                onChangeText={(t) => {
                  setDescription(t);
                  if (errorText) setErrorText('');
                }}
                onFocus={() => setFocused('desc')}
                onBlur={() => setFocused(null)}
                placeholder="What would you do with it, and when? A real example helps."
                placeholderTextColor={muted}
                multiline
                maxLength={1000}
                textAlignVertical="top"
                style={[s.areaInput, { color: ink }]}
                accessibilityLabel="Describe your idea"
              />
            </View>
            <Text style={[s.hint, { color: muted }]}>{hasDraft ? 'Draft saved' : ' '}</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(140).duration(380)}>
            <Text style={[s.label, { color: muted }]}>Area</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
              {AREAS.map((a) => {
                const on = area === a;
                return (
                  <Pressable
                    key={a}
                    onPress={() => setArea(on ? '' : a)}
                    style={[s.chip, on ? { backgroundColor: accent, borderColor: accent } : { backgroundColor: surface, borderColor: field }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[s.chipText, { color: on ? accentInk : ink }, on && { fontWeight: '700' }]}>{a}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[s.label, { color: muted }]}>How much would it help?</Text>
            <View style={[s.segment, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E9EFEB' }]}>
              {IMPACT.map((i) => {
                const on = impact === i;
                return (
                  <Pressable
                    key={i}
                    onPress={() => setImpact(on ? '' : i)}
                    style={[s.segBtn, on && { backgroundColor: isDark ? '#1E3329' : '#FFFFFF' }, on && !isDark && s.segShadow]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[s.segText, { color: on ? ink : muted }, on && { fontWeight: '700' }]} numberOfLines={1} adjustsFontSizeToFit>
                      {i}
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

          {history.length > 0 && (
            <Animated.View entering={FadeInDown.delay(200).duration(380)}>
              <View style={s.historyHead}>
                <Text style={[s.historyTitle, { color: ink }]}>Your ideas</Text>
                <Text style={[s.historyCount, { color: muted }]}>{history.length} sent</Text>
              </View>
              <View style={[s.historyCard, { backgroundColor: surface, borderColor: line }]}>
                {history.slice(0, 5).map((h, i) => (
                  <View key={h.id} style={[s.historyRow, i < Math.min(history.length, 5) - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}>
                    <View style={[s.historyIcon, { backgroundColor: softGreen }]}>
                      <Feather name="check" size={16} color={accent} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.historyName, { color: ink }]} numberOfLines={1}>{h.title}</Text>
                      <Text style={[s.historyMeta, { color: muted }]}>
                        {h.area ? `${h.area}, ` : ''}sent {format(new Date(h.sentAt), 'd MMM')}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}
        </ScrollView>

        <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8, borderTopColor: line }]}>
          <Pressable
            onPress={send}
            disabled={!ready || sending}
            style={({ pressed }) => [s.cta, { backgroundColor: accent, opacity: ready ? 1 : 0.5 }, pressed && ready && { transform: [{ scale: 0.98 }] }]}
            accessibilityRole="button"
          >
            {sending ? (
              <ActivityIndicator color={accentFg} />
            ) : (
              <View style={s.ctaRow}>
                <Feather name="send" size={17} color={accentFg} />
                <Text style={[s.ctaText, { color: accentFg }]}>{ready ? 'Send idea' : 'Add a title and a few words'}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  heroIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: FOREST, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  title: { fontSize: 28, letterSpacing: -0.6, lineHeight: 32, marginTop: 14 },
  sub: { fontSize: 15, lineHeight: 22, marginTop: 6 },

  label: { fontSize: 13, fontWeight: '700', paddingHorizontal: 4, paddingTop: 20, paddingBottom: 10 },
  field: { height: 52, borderRadius: 16, paddingHorizontal: 14, justifyContent: 'center' },
  titleInput: { fontSize: 15, fontWeight: '600', paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  area: { minHeight: 120, borderRadius: 16, padding: 14, marginTop: 10 },
  areaInput: { fontSize: 15, lineHeight: 22, minHeight: 90, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  hint: { fontSize: 12, textAlign: 'right', marginTop: 6, paddingHorizontal: 4 },

  chips: { gap: 8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' },
  segment: { flexDirection: 'row', gap: 4, borderRadius: 14, padding: 4 },
  segBtn: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segShadow: { shadowColor: '#0B1F17', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 1 },
  segText: { fontSize: 13, fontWeight: '600' },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, paddingHorizontal: 4 },
  errorText: { fontSize: 13, fontWeight: '600', flex: 1 },

  historyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, paddingTop: 26, paddingBottom: 10 },
  historyTitle: { fontSize: 15, fontWeight: '700' },
  historyCount: { fontSize: 12 },
  historyCard: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 16 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  historyIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  historyName: { fontSize: 15, fontWeight: '600' },
  historyMeta: { fontSize: 12, marginTop: 2 },

  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ctaText: { fontSize: 16, fontWeight: '700' },
  secondary: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryText: { fontSize: 15, fontWeight: '600' },

  doneWrap: { flex: 1, paddingHorizontal: 24 },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doneCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 26, letterSpacing: -0.5, marginTop: 22, textAlign: 'center' },
  doneText: { fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center', maxWidth: 300 },
});