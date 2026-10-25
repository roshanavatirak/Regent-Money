// src/components/TermsAndConditionsModal.tsx
//
// First run (readOnly = false): full screen. Read to the end, tick the box, accept.
// Later (readOnly = true): bottom sheet showing when you accepted.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme, useAuthStore, usePrivacyModalStore } from '../store';
import { authService } from '../services/authService';
import { TERMS } from '../constants/legalContent';
import { LegalDocumentView } from './LegalDocumentView';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

interface TermsAndConditionsModalProps {
  visible: boolean;
  readOnly?: boolean;
  onDismiss?: () => void;
  onAccepted?: () => void;
}

export const TermsAndConditionsModal: React.FC<TermsAndConditionsModalProps> = ({ visible, readOnly = false, onDismiss, onAccepted }) => {
  const { colors, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');

  const ink = colors.text;
  const muted = colors.textSecondary;
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;

  const accept = async () => {
    if (!agreed || loading) return;
    setLoading(true);
    setErrorText('');
    try {
      await authService.acceptTerms();
      onAccepted?.();
      onDismiss?.();
    } catch (e) {
      console.warn('[TermsModal] Failed to accept terms:', e);
      setErrorText('Couldn’t save your agreement. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const acceptedOn = user?.termsAcceptedAt ? format(new Date(Number(user.termsAcceptedAt)), 'd MMM yyyy') : null;

  if (readOnly) {
    return (
      <LegalDocumentView
        visible={visible}
        doc={TERMS}
        variant="sheet"
        icon="file-text"
        onClose={onDismiss}
        footer={() => (
          <View>
            <View style={s.acceptedRow}>
              <Feather name="check-circle" size={15} color={isDark ? LIME : '#16A34A'} />
              <Text style={[s.acceptedText, { color: muted }]}>
                {acceptedOn ? `You accepted these terms on ${acceptedOn}` : 'You’ve accepted these terms'}
              </Text>
            </View>
            <Pressable onPress={onDismiss} style={({ pressed }) => [s.btn, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.98 }] }]} accessibilityRole="button">
              <Text style={[s.btnText, { color: accentFg }]}>Done</Text>
            </Pressable>
          </View>
        )}
      />
    );
  }

  return (
    <LegalDocumentView
      visible={visible}
      doc={TERMS}
      variant="fullscreen"
      icon="file-text"
      title="Before you start"
      subtitle={`${TERMS.title}, version ${TERMS.version}`}
      showProgress
      footer={({ reachedEnd, scrollToEnd }) => (
        <View>
          <Pressable
            onPress={() => reachedEnd && setAgreed((v) => !v)}
            disabled={!reachedEnd}
            style={[s.agreeRow, !reachedEnd && { opacity: 0.45 }]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed, disabled: !reachedEnd }}
          >
            <View style={[s.box, agreed ? { backgroundColor: accent, borderColor: accent } : { borderColor: isDark ? 'rgba(255,255,255,0.3)' : '#C9D4CE' }]}>
              {agreed && (
                <Animated.View entering={ZoomIn.duration(160)}>
                  <Feather name="check" size={14} color={accentFg} />
                </Animated.View>
              )}
            </View>
            <Text style={[s.agreeText, { color: ink }]}>
              I agree to the Terms of service and{' '}
              <Text
                style={{ color: isDark ? LIME : '#0B6B3A', fontWeight: '700' }}
                onPress={() => usePrivacyModalStore.getState().openPrivacyModal()}
                accessibilityRole="link"
              >
                Privacy policy
              </Text>
            </Text>
          </Pressable>

          {errorText ? (
            <Animated.Text entering={FadeIn.duration(200)} style={[s.error, { color: isDark ? '#FFA8A8' : '#C92A2A' }]}>
              {errorText}
            </Animated.Text>
          ) : null}

          {reachedEnd ? (
            <Pressable
              onPress={accept}
              disabled={!agreed || loading}
              style={({ pressed }) => [s.btn, { backgroundColor: accent, opacity: agreed ? 1 : 0.5 }, pressed && agreed && { transform: [{ scale: 0.98 }] }]}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color={accentFg} />
              ) : (
                <View style={s.btnRow}>
                  <Text style={[s.btnText, { color: accentFg }]}>Accept and continue</Text>
                  <Feather name="arrow-right" size={17} color={accentFg} />
                </View>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={scrollToEnd}
              style={[s.btn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E9EFEB' }]}
              accessibilityRole="button"
              accessibilityHint="Scrolls to the end of the terms"
            >
              <View style={s.btnRow}>
                <Text style={[s.btnText, { color: ink }]}>Read to the end to continue</Text>
                <Feather name="arrow-down" size={16} color={ink} />
              </View>
            </Pressable>
          )}
        </View>
      )}
    />
  );
};

const s = StyleSheet.create({
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  agreeText: { flex: 1, fontSize: 14, lineHeight: 20 },
  error: { fontSize: 13, fontWeight: '600', marginTop: 10 },
  acceptedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  acceptedText: { fontSize: 13 },
  btn: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { fontSize: 16, fontWeight: '700' },
});