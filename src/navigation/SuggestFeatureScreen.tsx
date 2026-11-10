// src/navigation/SuggestFeatureScreen.tsx
//
// Suggest a feature: an idea + details card, area and impact dropdowns,
// a draft that saves as you type, and the ideas you've already sent.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { feedbackService, SentFeedback } from '../services/feedbackService';
import {
  FOREST,
  LIME,
  useFeedbackTheme,
  ff,
  k,
  FeedbackHeader,
  DropdownField,
  DropdownOption,
  LevelBars,
  TextCard,
  SendButton,
} from '../components/FeedbackFormKit';

const AREAS = ['Regent chat', 'Bank sync', 'Budgets', 'Goals', 'Insights', 'Design', 'Something else'];
const IMPACT = ['A little', 'A lot', 'Can’t live without'];

export const SuggestFeatureScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { p, font } = useFeedbackTheme();
  const scrollRef = useRef<ScrollView>(null);
  const historyY = useRef(0);

  const draft = useRef(feedbackService.getDraft('feature')).current;
  const [title, setTitle] = useState(draft.title || '');
  const [description, setDescription] = useState(draft.description || '');
  const [area, setArea] = useState(draft.area || '');
  const [impact, setImpact] = useState(draft.impact || '');
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [sent, setSent] = useState<SentFeedback | null>(null);
  const [history, setHistory] = useState<SentFeedback[]>(() => feedbackService.history('feature'));

  // Keep a draft while typing, so leaving the screen doesn't lose it
  useEffect(() => {
    const t = setTimeout(() => feedbackService.saveDraft('feature', { title, description, area, impact }), 400);
    return () => clearTimeout(t);
  }, [title, description, area, impact]);

  const ready = title.trim().length >= 3 && description.trim().length >= 10;

  const areaOptions: DropdownOption<string>[] = AREAS.map((a) => ({ value: a, label: a }));
  const impactOptions: DropdownOption<string>[] = IMPACT.map((label, i) => ({
    value: label,
    label,
    leading: <LevelBars level={(i + 1) as 1 | 2 | 3} />,
  }));

  const send = async () => {
    if (!ready || sending) return;
    setSending(true);
    setErrorText('');
    try {
      const item = await feedbackService.submit({
        kind: 'feature',
        title,
        description,
        area: area || undefined,
        impact: impact || undefined,
      });
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

  /* ---------------- Sent ---------------- */

  if (sent) {
    return (
      <View
        style={[
          k.doneWrap,
          { backgroundColor: p.page, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 10 },
        ]}
      >
        <View style={k.doneBody}>
          <Animated.View entering={ZoomIn.springify().damping(12)} style={[k.doneCircle, { backgroundColor: FOREST }]}>
            <Feather name="check" size={40} color={LIME} />
          </Animated.View>
          <Animated.Text entering={FadeIn.delay(150)} style={[k.doneTitle, { color: p.ink }, ff(font.display, '800')]}>
            Idea sent. Thank you.
          </Animated.Text>
          <Animated.Text entering={FadeIn.delay(220)} style={[k.doneText, { color: p.muted }, ff(font.body, '500')]}>
            “{sent.title}” is with the team.
          </Animated.Text>
        </View>
        <Pressable onPress={() => navigation.goBack()} style={[k.doneCta, { backgroundColor: p.primary }]}>
          <Text style={[k.ctaText, { color: p.onPrimary }, ff(font.bold, '700')]}>Done</Text>
        </Pressable>
        <Pressable onPress={startAnother} style={k.secondary}>
          <Text style={[k.ctaText, { color: p.muted }, ff(font.semi, '600')]}>Suggest another</Text>
        </Pressable>
      </View>
    );
  }

  /* ---------------- Form ---------------- */

  return (
    <View style={{ flex: 1, backgroundColor: p.page }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <FeedbackHeader
          topInset={insets.top}
          onBack={() => navigation.goBack()}
          historyLabel={history.length > 0 ? `My ideas · ${history.length}` : undefined}
          onHistory={() => scrollRef.current?.scrollTo({ y: historyY.current, animated: true })}
        />

        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.content}
        >
          <View style={s.hero}>
            <View style={[s.heroIcon, { backgroundColor: p.isDark ? 'rgba(184,243,107,0.16)' : FOREST }]}>
              <Feather name="zap" size={22} color={LIME} />
            </View>
            <Text style={[k.title, { color: p.ink }, ff(font.display, '800')]}>What should Regent do next?</Text>
          </View>

          <View>
            <TextCard
              titleLabel="Idea"
              titleValue={title}
              onTitleChange={(t) => {
                setTitle(t);
                if (errorText) setErrorText('');
              }}
              titlePlaceholder="Split bills with friends"
              detailsLabel="How would you use it?"
              detailsValue={description}
              onDetailsChange={(t) => {
                setDescription(t);
                if (errorText) setErrorText('');
              }}
              detailsPlaceholder="A real example helps"
            />
          </View>

          <View style={s.row}>
            <DropdownField label="Area" value={area} options={areaOptions} onChange={setArea} />
            <DropdownField label="Impact" value={impact} options={impactOptions} onChange={setImpact} />
          </View>

          {errorText ? (
            <Animated.View entering={FadeIn.duration(200)} style={k.errorRow}>
              <Feather name="alert-circle" size={14} color={p.danger} />
              <Text style={[k.errorText, { color: p.danger }, ff(font.semi, '600')]}>{errorText}</Text>
            </Animated.View>
          ) : null}

          {history.length > 0 && (
            <View onLayout={(e) => (historyY.current = e.nativeEvent.layout.y)}>
              <View style={k.historyHead}>
                <Text style={[k.historyTitle, { color: p.ink }, ff(font.bold, '700')]}>My ideas</Text>
                <Text style={[k.historyCount, { color: p.muted }, ff(font.semi, '600')]}>{history.length}</Text>
              </View>
              <View style={[k.historyCard, { backgroundColor: p.card, borderColor: p.border }]}>
                {history.slice(0, 5).map((h, i) => {
                  const last = i === Math.min(history.length, 5) - 1;
                  return (
                    <View key={h.id} style={[s.historyRow, !last && { borderBottomWidth: 1, borderBottomColor: p.divider }]}>
                      <View style={[s.historyIcon, { backgroundColor: p.isDark ? 'rgba(184,243,107,0.16)' : '#E3F2E8' }]}>
                        <Feather name="check" size={16} color={p.isDark ? LIME : FOREST} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.historyName, { color: p.ink }, ff(font.bold, '700')]} numberOfLines={1}>
                          {h.title}
                        </Text>
                        <Text style={[s.historyMeta, { color: p.muted }, ff(font.body, '500')]}>
                          {[h.area, format(new Date(h.sentAt), 'd MMM')].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>

        <SendButton label="Send idea" ready={ready} sending={sending} onPress={send} bottomInset={insets.bottom} />
      </KeyboardAvoidingView>
    </View>
  );
};

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24, gap: 14 },
  hero: { gap: 14, marginBottom: 6 },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10 },

  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  historyIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  historyName: { fontSize: 14.5 },
  historyMeta: { fontSize: 12.5, marginTop: 2 },
});
