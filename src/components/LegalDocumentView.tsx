// src/components/LegalDocumentView.tsx
//
// Shared reader for the Terms of service and Privacy policy.
//   variant="sheet":      slides up over the app, can be closed
//   variant="fullscreen": first-run agreement, can't be skipped
// The text comes from src/constants/legalContent.ts.

import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, Pressable, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { useTheme } from '../store';
import { LegalDocument, LEGAL_PUBLISHER } from '../constants/legalContent';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

export interface LegalFooterContext {
  reachedEnd: boolean;
  scrollToEnd: () => void;
}

interface Props {
  visible: boolean;
  doc: LegalDocument;
  variant: 'sheet' | 'fullscreen';
  icon: keyof typeof Feather.glyphMap;
  /** Title shown at the top; defaults to the document title */
  title?: string;
  /** Line under the title; defaults to version and date */
  subtitle?: string;
  showProgress?: boolean;
  onClose?: () => void;
  footer: (ctx: LegalFooterContext) => React.ReactNode;
}

export const LegalDocumentView: React.FC<Props> = ({ visible, doc, variant, icon, title, subtitle, showProgress, onClose, footer }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const scrollRef = useRef<ScrollView>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const progress = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  if (!visible) return null;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const scrollable = Math.max(1, contentSize.height - layoutMeasurement.height);
    const p = Math.min(1, Math.max(0, contentOffset.y / scrollable));
    progress.value = withTiming(p, { duration: 80 });
    if (!reachedEnd && layoutMeasurement.height + contentOffset.y >= contentSize.height - 32) setReachedEnd(true);
  };

  // Short documents that fit on screen count as read
  const onContentSize = (_w: number, h: number) => {
    if (!reachedEnd && h > 0 && h < 500) setReachedEnd(true);
  };

  const scrollToEnd = () => {
    scrollRef.current?.scrollToEnd({ animated: true });
    setTimeout(() => {
      setReachedEnd(true);
      progress.value = withTiming(1, { duration: 200 });
    }, 450);
  };

  const ink = colors.text;
  const muted = colors.textSecondary;
  const body = isDark ? '#C9D9D0' : '#3A4A42';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const softGreen = isDark ? 'rgba(184,243,107,0.12)' : '#E3F2E8';
  const isFull = variant === 'fullscreen';

  const content = (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: line }]}>
        <View style={s.headRow}>
          <View style={[s.headIcon, { backgroundColor: isFull ? FOREST : softGreen }]}>
            <Feather name={icon} size={20} color={isFull ? LIME : accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>{title || doc.title}</Text>
            <Text style={[s.subtitle, { color: muted }]}>{subtitle || `Version ${doc.version}, effective ${doc.effective}`}</Text>
          </View>
        </View>
        {showProgress && (
          <View style={[s.track, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E9EFEB' }]} accessibilityElementsHidden>
            <Animated.View style={[s.trackFill, { backgroundColor: isDark ? LIME : '#16A34A' }, progressStyle]} />
          </View>
        )}
      </View>

      {/* Body */}
      <ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        onContentSizeChange={onContentSize}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.bodyPad}
      >
        <Animated.View entering={FadeInDown.duration(380)} style={[s.summary, { backgroundColor: softGreen }]}>
          <Text style={[s.summaryLabel, { color: accent }]}>In short</Text>
          {doc.summary.map((line) => (
            <View key={line} style={s.summaryRow}>
              <Feather name="check" size={15} color={accent} style={{ marginTop: 2 }} />
              <Text style={[s.summaryText, { color: ink }]}>{line}</Text>
            </View>
          ))}
        </Animated.View>

        {doc.sections.map((sec, i) => (
          <View key={sec.heading} style={s.section}>
            <Text style={[s.heading, { color: ink }]} accessibilityRole="header">
              <Text style={{ color: muted, fontWeight: '600' }}>{i + 1}  </Text>
              {sec.heading}
            </Text>
            {sec.paragraphs?.map((p) => (
              <Text key={p} style={[s.para, { color: body }]}>{p}</Text>
            ))}
            {sec.points?.map((pt) => (
              <View key={pt.title} style={s.point}>
                <View style={[s.pointDot, { backgroundColor: isDark ? LIME : '#16A34A' }]} />
                <Text style={[s.para, { color: body, flex: 1, marginTop: 0 }]}>
                  <Text style={{ color: ink, fontWeight: '700' }}>{pt.title}. </Text>
                  {pt.text}
                </Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={[s.publisher, { color: muted, borderTopColor: line }]}>
          {LEGAL_PUBLISHER}
          {'\n'}
          {doc.title}, version {doc.version}, effective {doc.effective}
        </Text>
      </ScrollView>

      {/* Footer */}
      <View style={[s.footer, { borderTopColor: line, paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
        {footer({ reachedEnd, scrollToEnd })}
      </View>
    </View>
  );

  if (isFull) {
    return (
      <Modal visible animationType="slide" statusBarTranslucent onRequestClose={() => {}}>
        <View style={{ flex: 1, backgroundColor: surface, paddingTop: insets.top + 8 }}>{content}</View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, { backgroundColor: surface, marginTop: insets.top + 24 }]}>
          <View style={[s.grabber, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#D5DED9' }]} />
          {content}
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  sheet: { flex: 1, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, overflow: 'hidden', width: '100%', maxWidth: 640, alignSelf: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 6 },

  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2 },
  track: { height: 4, borderRadius: 2, marginTop: 14, overflow: 'hidden' },
  trackFill: { height: 4, borderRadius: 2 },

  bodyPad: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  summary: { borderRadius: 20, padding: 16 },
  summaryLabel: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  summaryRow: { flexDirection: 'row', gap: 10, paddingVertical: 5 },
  summaryText: { flex: 1, fontSize: 14, lineHeight: 20 },

  section: { paddingTop: 22 },
  heading: { fontSize: 16, fontWeight: '700' },
  para: { fontSize: 14, lineHeight: 21, marginTop: 6 },
  point: { flexDirection: 'row', gap: 10, marginTop: 10 },
  pointDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },

  publisher: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 28, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  footer: { paddingHorizontal: 20, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth },
});