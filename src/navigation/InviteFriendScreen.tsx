// src/navigation/InviteFriendScreen.tsx
//
// Invite a friend: one number (friends who joined) and one action (share your link).
// The link itself is never shown; it is only shared or copied.
// You see how many friends joined, never who. There is no reward for inviting.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Share, ActivityIndicator } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { attributionService, MyInvite } from '../services/attributionService';
import { FOREST, LIME, useFeedbackTheme, ff, k, FeedbackHeader } from '../components/FeedbackFormKit';

const MIST = '#B5CEC1';

const STEPS = [
  'Share your link with a friend',
  'They install Regent Money from it and sign in',
  'Your count goes up by one',
];

export const InviteFriendScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { p, font } = useFeedbackTheme();

  const [invite, setInvite] = useState<MyInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorText('');
    try {
      setInvite(await attributionService.getMyInvite());
    } catch (e: any) {
      setErrorText(e?.message || 'Couldn’t load your invite link. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const link = invite?.link || '';
  const joined = invite?.joined ?? 0;

  const share = () => {
    if (!link) return;
    Share.share({ message: `I track my money with Regent Money. Try it: ${link}` }).catch(() => {});
  };

  const copy = async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link).catch(() => false);
    setCopied(true);
  };

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  };

  return (
    <View style={{ flex: 1, backgroundColor: p.page }}>
      <FeedbackHeader topInset={insets.top} onBack={goBack} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
      >
        <Text style={[k.title, { color: p.ink }, ff(font.display, '800')]}>Invite a friend</Text>

        <Animated.View entering={FadeInDown.duration(360)} style={s.hero}>
          <View pointerEvents="none" style={[s.ring, { width: 200, height: 200, borderRadius: 100, right: -80, top: -90 }]} />
          <View
            pointerEvents="none"
            style={[s.ring, { width: 120, height: 120, borderRadius: 60, right: -36, top: -50, borderColor: 'rgba(184,243,107,0.24)' }]}
          />

          <Text style={[s.heroLabel, ff(font.semi, '600')]}>Friends joined</Text>
          {loading ? (
            <ActivityIndicator color={LIME} style={s.heroLoading} />
          ) : (
            <Text style={[s.heroValue, ff(font.display, '800')]} accessibilityLabel={`${joined} friends joined`}>
              {joined}
            </Text>
          )}
          <Text style={[s.heroSub, ff(font.body, '500')]}>
            {joined === 0
              ? 'Share your link. Each friend who installs from it and signs in is counted here.'
              : 'Each friend who installs from your link and signs in is counted here.'}
          </Text>

          <Pressable
            onPress={share}
            disabled={!link}
            accessibilityRole="button"
            style={({ pressed }) => [s.shareBtn, { opacity: !link ? 0.5 : pressed ? 0.85 : 1 }]}
          >
            <Feather name="share-2" size={18} color={FOREST} />
            <Text style={[s.shareText, ff(font.bold, '700')]}>Share invite link</Text>
          </Pressable>

          <Pressable
            onPress={copy}
            disabled={!link}
            accessibilityRole="button"
            style={({ pressed }) => [s.copyBtn, { opacity: !link ? 0.5 : pressed ? 0.7 : 1 }]}
          >
            <Feather name={copied ? 'check' : 'copy'} size={16} color={LIME} />
            <Text style={[s.copyText, ff(font.bold, '700')]}>{copied ? 'Link copied' : 'Copy link'}</Text>
          </Pressable>
        </Animated.View>

        {errorText ? (
          <View style={[s.notice, { backgroundColor: p.card, borderColor: p.border }]}>
            <Text style={[s.noticeText, { color: p.danger }, ff(font.semi, '600')]}>{errorText}</Text>
            <Pressable onPress={load} accessibilityRole="button" hitSlop={8}>
              <Text style={[s.noticeAction, { color: p.primary }, ff(font.bold, '700')]}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !errorText && invite && !invite.link ? (
          <View style={[s.notice, { backgroundColor: p.card, borderColor: p.border }]}>
            <Text style={[s.noticeText, { color: p.muted }, ff(font.body, '500')]}>
              Invite links aren’t switched on yet. Check back soon.
            </Text>
          </View>
        ) : null}

        <Animated.View
          entering={FadeInDown.delay(100).duration(360)}
          style={[s.card, { backgroundColor: p.card, borderColor: p.border }]}
        >
          <Text style={[s.cardLabel, { color: p.muted }, ff(font.bold, '700')]}>How it works</Text>
          {STEPS.map((step, i) => (
            <View
              key={step}
              style={[s.step, i < STEPS.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.divider }]}
            >
              <View style={[s.stepDot, { backgroundColor: i === STEPS.length - 1 ? LIME : p.soft }]}>
                <Text style={[s.stepNum, { color: i === STEPS.length - 1 ? FOREST : p.primary }, ff(font.bold, '800')]}>{i + 1}</Text>
              </View>
              <Text style={[s.stepText, { color: p.ink }, ff(font.body, '500')]}>{step}</Text>
            </View>
          ))}
        </Animated.View>

        <Pressable onPress={() => navigation.navigate('PrivacyCenter')} accessibilityRole="link" hitSlop={8} style={s.privacyLink}>
          <Text style={[s.privacyText, { color: p.primary }, ff(font.bold, '700')]}>How invite tracking works</Text>
          <Feather name="arrow-right" size={14} color={p.primary} />
        </Pressable>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  hero: { marginTop: 16, borderRadius: 24, backgroundColor: FOREST, padding: 22, overflow: 'hidden' },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(184,243,107,0.16)' },
  heroLabel: { color: MIST, fontSize: 13 },
  heroValue: { color: LIME, fontSize: 64, lineHeight: 70, letterSpacing: -2, marginTop: 2 },
  heroLoading: { alignSelf: 'flex-start', height: 70, marginTop: 2 },
  heroSub: { color: MIST, fontSize: 13.5, lineHeight: 20, marginTop: 4, maxWidth: 280 },

  shareBtn: {
    height: 54,
    borderRadius: 999,
    backgroundColor: LIME,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
  },
  shareText: { color: FOREST, fontSize: 15 },
  copyBtn: {
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(184,243,107,0.35)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  copyText: { color: LIME, fontSize: 14 },

  notice: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  noticeAction: { fontSize: 13 },

  card: { marginTop: 14, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  cardLabel: { fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 12 },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20 },

  privacyLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 4, minHeight: 44 },
  privacyText: { fontSize: 13 },
});
