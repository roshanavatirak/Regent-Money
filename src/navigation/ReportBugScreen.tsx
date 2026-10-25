// src/navigation/ReportBugScreen.tsx
//
// Report a problem: where it happened, what happened, and exactly which
// device details are sent (you can turn them off).

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Switch, ActivityIndicator, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Font from 'expo-font';
import { format } from 'date-fns';
import { useTheme } from '../store';
import { getAppCurrentVersion } from '../services/updateService';
import { feedbackService, SentFeedback } from '../services/feedbackService';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

const AREAS = ['Home', 'Bank sync', 'Balance', 'Budgets', 'Goals', 'Regent chat', 'Crash or slow', 'Something else'];

export const ReportBugScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark, theme } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const heading = { fontFamily: display, fontWeight: display ? undefined : ('800' as const) };

  const draft = useRef(feedbackService.getDraft('bug')).current;
  const [area, setArea] = useState(draft.area || '');
  const [title, setTitle] = useState(draft.title || '');
  const [details, setDetails] = useState(draft.description || '');
  const [includeDevice, setIncludeDevice] = useState(true);
  const [focused, setFocused] = useState<'title' | 'details' | null>(null);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [sent, setSent] = useState<SentFeedback | null>(null);
  const [history, setHistory] = useState<SentFeedback[]>(() => feedbackService.history('bug'));

  useEffect(() => {
    const t = setTimeout(() => feedbackService.saveDraft('bug', { title, description: details, area }), 400);
    return () => clearTimeout(t);
  }, [title, details, area]);

  const version = getAppCurrentVersion();
  const phone = `${Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web'}${Platform.Version ? ` ${Platform.Version}` : ''}`;
  const themeLabel = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'Device';

  const ready = title.trim().length >= 3 && details.trim().length >= 10;

  const send = async () => {
    if (!ready || sending) return;
    setSending(true);
    setErrorText('');
    try {
      const item = await feedbackService.submit({
        kind: 'bug',
        title,
        description: details,
        area: area || undefined,
        includeDevice,
        device: { theme: themeLabel.toLowerCase() },
      });
      setSent(item);
      setHistory(feedbackService.history('bug'));
    } catch (e: any) {
      setErrorText(e?.message || 'Couldn’t send it. Try again.');
    } finally {
      setSending(false);
    }
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
  const red = isDark ? '#FFA8A8' : '#C92A2A';

  /* ---------------- Sent ---------------- */

  if (sent) {
    return (
      <View style={[s.doneWrap, { backgroundColor: pageBg, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
        <View style={s.doneBody}>
          <Animated.View entering={ZoomIn.springify().damping(12)} style={[s.doneCircle, { backgroundColor: FOREST }]}>
            <Feather name="check" size={40} color={LIME} />
          </Animated.View>
          <Animated.Text entering={FadeIn.delay(150)} style={[s.doneTitle, { color: ink }, heading]}>Report sent</Animated.Text>
          <Animated.Text entering={FadeIn.delay(220)} style={[s.doneText, { color: muted }]}>
            Thanks for telling us about “{sent.title}”. You’ll find it under Your reports.
          </Animated.Text>
        </View>
        <Pressable onPress={() => navigation.goBack()} style={[s.cta, { backgroundColor: accent }]}>
          <Text style={[s.ctaText, { color: accentFg }]}>Done</Text>
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
          <Text style={[s.headerTitle, { color: ink }]}>Report a problem</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <Animated.View entering={FadeInDown.duration(380)}>
            <View style={[s.heroIcon, { backgroundColor: isDark ? 'rgba(224,49,49,0.2)' : '#FFE3E3' }]}>
              <Feather name="alert-circle" size={22} color={red} />
            </View>
            <Text style={[s.title, { color: ink }, heading]}>What went wrong?</Text>
            <Text style={[s.sub, { color: muted }]}>Tell us what happened and we’ll look into it.</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(380)}>
            <Text style={[s.label, { color: muted }]}>Where</Text>
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

            <Text style={[s.label, { color: muted }]}>What happened</Text>
            <View style={[s.field, { backgroundColor: surface, borderColor: focused === 'title' ? accent : field, borderWidth: focused === 'title' ? 2 : 1 }]}>
              <TextInput
                value={title}
                onChangeText={(t) => {
                  setTitle(t);
                  if (errorText) setErrorText('');
                }}
                onFocus={() => setFocused('title')}
                onBlur={() => setFocused(null)}
                placeholder="In a few words, like ‘Payment didn’t show up’"
                placeholderTextColor={muted}
                maxLength={80}
                style={[s.titleInput, { color: ink }]}
                accessibilityLabel="What happened, in a few words"
              />
            </View>
            <View style={[s.area, { backgroundColor: surface, borderColor: focused === 'details' ? accent : field, borderWidth: focused === 'details' ? 2 : 1 }]}>
              <TextInput
                value={details}
                onChangeText={(t) => {
                  setDetails(t);
                  if (errorText) setErrorText('');
                }}
                onFocus={() => setFocused('details')}
                onBlur={() => setFocused(null)}
                placeholder="What did you do, what happened, and what did you expect?"
                placeholderTextColor={muted}
                multiline
                maxLength={1000}
                textAlignVertical="top"
                style={[s.areaInput, { color: ink }]}
                accessibilityLabel="Details"
              />
            </View>
            <Text style={[s.hint, { color: muted }]}>{title || details ? 'Draft saved' : ' '}</Text>
          </Animated.View>

          {/* Device details: shown exactly as they'll be sent */}
          <Animated.View entering={FadeInDown.delay(140).duration(380)}>
            <Text style={[s.label, { color: muted }]}>Device details</Text>
            <View style={[s.deviceCard, { backgroundColor: surface, borderColor: line }]}>
              <View style={[s.deviceToggle, { borderBottomColor: line }]}>
                <Text style={[s.deviceToggleText, { color: ink }]}>Send these with my report</Text>
                <Switch
                  value={includeDevice}
                  onValueChange={setIncludeDevice}
                  trackColor={{ false: isDark ? '#3A3A3C' : '#D1D5DB', true: '#16A34A' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={isDark ? '#3A3A3C' : '#D1D5DB'}
                />
              </View>
              {[
                ['App version', version],
                ['Phone', phone],
                ['Theme', themeLabel],
              ].map(([k, v], i) => (
                <View key={k} style={[s.deviceRow, i < 2 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }, !includeDevice && { opacity: 0.4 }]}>
                  <Text style={[s.deviceKey, { color: muted }]}>{k}</Text>
                  <Text style={[s.deviceVal, { color: ink }]}>{v}</Text>
                </View>
              ))}
            </View>
            <Text style={[s.deviceNote, { color: muted }]}>Helps us reproduce the problem. Nothing else from your phone is sent.</Text>
          </Animated.View>

          {errorText ? (
            <Animated.View entering={FadeIn.duration(200)} style={s.errorRow}>
              <Feather name="alert-circle" size={14} color={red} />
              <Text style={[s.errorText, { color: red }]}>{errorText}</Text>
            </Animated.View>
          ) : null}

          {history.length > 0 && (
            <Animated.View entering={FadeInDown.delay(200).duration(380)}>
              <View style={s.historyHead}>
                <Text style={[s.historyTitle, { color: ink }]}>Your reports</Text>
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
              <Text style={[s.ctaText, { color: accentFg }]}>{ready ? 'Send report' : 'Say what happened first'}</Text>
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

  heroIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  title: { fontSize: 28, letterSpacing: -0.6, marginTop: 14 },
  sub: { fontSize: 15, lineHeight: 22, marginTop: 6 },

  label: { fontSize: 13, fontWeight: '700', paddingHorizontal: 4, paddingTop: 20, paddingBottom: 10 },
  chips: { gap: 8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' },
  field: { height: 52, borderRadius: 16, paddingHorizontal: 14, justifyContent: 'center' },
  titleInput: { fontSize: 15, fontWeight: '600', paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  area: { minHeight: 110, borderRadius: 16, padding: 14, marginTop: 10 },
  areaInput: { fontSize: 15, lineHeight: 22, minHeight: 80, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  hint: { fontSize: 12, textAlign: 'right', marginTop: 6, paddingHorizontal: 4 },

  deviceCard: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16 },
  deviceToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  deviceToggleText: { flex: 1, fontSize: 14, fontWeight: '600' },
  deviceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11 },
  deviceKey: { fontSize: 13 },
  deviceVal: { fontSize: 13, fontWeight: '600' },
  deviceNote: { fontSize: 12, lineHeight: 17, marginTop: 8, paddingHorizontal: 4 },

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
  ctaText: { fontSize: 16, fontWeight: '700' },

  doneWrap: { flex: 1, paddingHorizontal: 24 },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doneCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 26, letterSpacing: -0.5, marginTop: 22, textAlign: 'center' },
  doneText: { fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center', maxWidth: 300 },
});