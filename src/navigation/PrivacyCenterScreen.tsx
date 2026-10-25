// src/navigation/PrivacyCenterScreen.tsx
//
// Privacy: what Regent reads, where it goes, and how to clear it.
// Every control on this page does something real.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, Platform } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Font from 'expo-font';
import {
  useTheme,
  useAIStore,
  showGlobalConfirm,
  usePrivacyModalStore,
  useTermsModalStore,
} from '../store';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

type Tone = 'green' | 'blue' | 'purple' | 'orange' | 'red' | 'neutral';

const TONES: Record<Tone, { light: [string, string]; dark: [string, string] }> = {
  green: { light: ['#E3F2E8', '#0B3D2C'], dark: ['rgba(184,243,107,0.14)', LIME] },
  blue: { light: ['#DCEBFF', '#1450A3'], dark: ['rgba(59,130,246,0.18)', '#93C5FD'] },
  purple: { light: ['#ECE6FF', '#4B2DB8'], dark: ['rgba(139,124,246,0.2)', '#C4B8FF'] },
  orange: { light: ['#FFE8D9', '#B23F00'], dark: ['rgba(255,138,76,0.18)', '#FFB38A'] },
  red: { light: ['#FFE3E3', '#C92A2A'], dark: ['rgba(224,49,49,0.2)', '#FFA8A8'] },
  neutral: { light: ['#F1F5F2', '#3A4A42'], dark: ['rgba(255,255,255,0.08)', '#C9D9D0'] },
};

// Plain statements about how the app works. Keep these accurate to the product.
const HOW_IT_WORKS: { icon: keyof typeof Feather.glyphMap; tone: Tone; title: string; detail: string }[] = [
  {
    icon: 'message-square',
    tone: 'green',
    title: 'Only bank messages',
    detail: 'Regent reads SMS only from the bank senders you add. Never personal chats or OTPs.',
  },
  {
    icon: 'cloud',
    tone: 'blue',
    title: 'Synced to your account',
    detail: 'Accounts and transactions back up to your Regent account, so a new phone picks up where you left off.',
  },
  {
    icon: 'zap',
    tone: 'purple',
    title: 'Regent chat sees a summary',
    detail: 'When you ask Regent, it gets your balances, budgets and recent transactions to answer.',
  },
  {
    icon: 'slash',
    tone: 'orange',
    title: 'No ads, no data selling',
    detail: 'Your spending is never sold or shared with advertisers.',
  },
];

export const PrivacyCenterScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const chatCount = useAIStore((s) => s.chatHistory.length);

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';

  const tone = (t: Tone) => (isDark ? TONES[t].dark : TONES[t].light);

  const clearChat = () => {
    showGlobalConfirm({
      title: 'Clear your Regent chat?',
      message: 'Your conversation on this phone will be deleted. Accounts and transactions stay as they are.',
      confirmText: 'Clear chat',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: () => useAIStore.getState().clearChatHistory(),
    });
  };

  const openSmsSettings = () => {
    Linking.openSettings().catch(() => {});
  };

  const Row = ({
    icon,
    t,
    title,
    detail,
    onPress,
    last,
    danger,
    trailing,
  }: {
    icon: keyof typeof Feather.glyphMap;
    t: Tone;
    title: string;
    detail: string;
    onPress?: () => void;
    last?: boolean;
    danger?: boolean;
    trailing?: string;
  }) => {
    const [bg, fg] = tone(t);
    const content = (
      <>
        <View style={[s.tile, { backgroundColor: bg }]}>
          <Feather name={icon} size={18} color={fg} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.rowTitle, { color: danger ? fg : ink }]}>{title}</Text>
          <Text style={[s.rowDetail, { color: muted }]}>{detail}</Text>
        </View>
        {trailing ? <Text style={[s.trailing, { color: muted }]}>{trailing}</Text> : null}
        {onPress ? <Feather name="chevron-right" size={16} color={muted} /> : null}
      </>
    );
    const rowStyle = [s.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }];
    return onPress ? (
      <Pressable onPress={onPress} style={({ pressed }) => [...rowStyle, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={title}>
        {content}
      </Pressable>
    ) : (
      <View style={rowStyle}>{content}</View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <View style={[s.header, { paddingTop: Math.max(insets.top, 12) + 4 }]}>
        <Pressable onPress={() => navigation.goBack()} style={[s.roundBtn, { backgroundColor: surface }]} accessibilityLabel="Back">
          <Feather name="arrow-left" size={20} color={ink} />
        </Pressable>
        <Text style={[s.headerTitle, { color: ink }]}>Privacy</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}>
        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(380)} style={s.hero}>
          <View pointerEvents="none" style={[s.ring, { width: 220, height: 220, borderRadius: 110, right: -80, top: -100 }]} />
          <View pointerEvents="none" style={[s.ring, { width: 140, height: 140, borderRadius: 70, right: -40, top: -60, borderColor: 'rgba(184,243,107,0.24)' }]} />
          <View style={s.heroIcon}>
            <Feather name="shield" size={22} color={FOREST} />
          </View>
          <Text style={[s.heroTitle, { fontFamily: display, fontWeight: display ? undefined : '800' }]}>Your money stays yours</Text>
          <Text style={s.heroSub}>Here’s what Regent reads, where it goes, and how to clear it.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(380)}>
          <Text style={[s.section, { color: muted }]}>How it works</Text>
          <View style={[s.card, { backgroundColor: surface, borderColor: line }]}>
            {HOW_IT_WORKS.map((item, i) => (
              <Row key={item.title} icon={item.icon} t={item.tone} title={item.title} detail={item.detail} last={i === HOW_IT_WORKS.length - 1} />
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(380)}>
          <Text style={[s.section, { color: muted }]}>Your controls</Text>
          <View style={[s.card, { backgroundColor: surface, borderColor: line }]}>
            <Row
              icon="trash-2"
              t="red"
              danger
              title="Clear Regent chat"
              detail={chatCount > 0 ? 'Deletes your conversation on this phone.' : 'Nothing to clear right now.'}
              trailing={chatCount > 0 ? `${chatCount} messages` : undefined}
              onPress={chatCount > 0 ? clearChat : undefined}
            />
            {Platform.OS === 'android' ? (
              <Row
                icon="smartphone"
                t="neutral"
                title="SMS access"
                detail="Turn reading bank messages on or off in phone settings."
                onPress={openSmsSettings}
                last
              />
            ) : null}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(380)}>
          <Text style={[s.section, { color: muted }]}>Legal</Text>
          <View style={[s.card, { backgroundColor: surface, borderColor: line }]}>
            <Row
              icon="shield"
              t="neutral"
              title="Privacy policy"
              detail="The full details, in plain terms."
              onPress={() => usePrivacyModalStore.getState().openPrivacyModal()}
            />
            <Row
              icon="file-text"
              t="neutral"
              title="Terms and conditions"
              detail="What you agree to when using Regent."
              onPress={() => useTermsModalStore.getState().openTermsModal(true)}
              last
            />
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  hero: { marginTop: 10, borderRadius: 26, backgroundColor: FOREST, padding: 22, overflow: 'hidden' },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(184,243,107,0.16)' },
  heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#FFFFFF', fontSize: 26, letterSpacing: -0.6, marginTop: 16 },
  heroSub: { color: '#D9E7DF', fontSize: 14, lineHeight: 20, marginTop: 6 },

  section: { fontSize: 13, fontWeight: '700', paddingHorizontal: 4, paddingTop: 22, paddingBottom: 10 },
  card: { borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  tile: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowDetail: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  trailing: { fontSize: 12, fontWeight: '600' },
});