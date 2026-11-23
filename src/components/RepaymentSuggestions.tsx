// src/components/RepaymentSuggestions.tsx
//
// "Looks like repayments": payments recognised as being with someone you have an open loan
// with. One tap files it as a repayment, or says it isn't one (never offered again).

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../store';
import { usePeerStore } from '../store/peerStore';
import { formatPaise } from '../types/peer';
import { Avatar } from './PersonPickerSheet';
import { useRepaymentSuggestions, type AppRepaymentSuggestion } from '../services/repaymentService';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

const prettyDate = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const RepaymentSuggestions: React.FC<{
  /** Only this person's (their page); all people when left out. */
  contactId?: string;
  onOpenPayment?: (s: AppRepaymentSuggestion) => void;
}> = ({ contactId, onOpenPayment }) => {
  const { colors, isDark } = useTheme();
  const contacts = usePeerStore((s) => s.contacts);
  const { suggestions, accept, dismiss } = useRepaymentSuggestions(contactId);
  const [error, setError] = useState('');

  if (suggestions.length === 0) return null;

  const ink = colors.text;
  const muted = colors.textSecondary;
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;

  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      layout={LinearTransition.duration(200)}
      style={[s.card, { backgroundColor: colors.card, borderColor: line }]}
    >
      <View style={s.header}>
        <Feather name="repeat" size={15} color={accent} />
        <Text style={[s.title, { color: ink }]}>{suggestions.length === 1 ? 'Looks like a repayment' : 'Looks like repayments'}</Text>
      </View>

      {suggestions.map((sg, i) => {
        const person = contacts.find((c) => c.id === sg.contactId);
        const name = person?.displayName || 'them';
        const received = sg.kind === 'REPAY_RECEIVED';
        return (
          <Animated.View
            key={sg.row.id}
            exiting={FadeOut.duration(160)}
            style={[s.item, i > 0 && { borderTopColor: line, borderTopWidth: StyleSheet.hairlineWidth }]}
          >
            <Pressable
              onPress={onOpenPayment ? () => onOpenPayment(sg) : undefined}
              style={s.itemTop}
              accessibilityRole={onOpenPayment ? 'button' : undefined}
              accessibilityLabel={`${received ? `${name} paid you` : `You paid ${name}`} ${formatPaise(sg.amount)}`}
            >
              <Avatar name={name} kind={person?.kind} size={38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.line1, { color: ink }]} numberOfLines={2}>
                  {received ? `${name} paid you ` : `You paid ${name} `}
                  <Text style={{ fontWeight: '800' }}>{formatPaise(sg.amount)}</Text>
                </Text>
                <Text style={[s.line2, { color: muted }]} numberOfLines={1}>
                  {prettyDate(sg.date)} · {received ? `${name} owed ${formatPaise(sg.outstanding)}` : `you owed ${formatPaise(sg.outstanding)}`}
                </Text>
              </View>
            </Pressable>
            <View style={s.actions}>
              <Pressable
                onPress={() => dismiss(sg.row.id)}
                style={({ pressed }) => [s.ghost, { borderColor: line }, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
              >
                <Text style={[s.ghostText, { color: ink }]}>Not a repayment</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  try {
                    setError('');
                    accept(sg);
                  } catch (e: any) {
                    setError(e?.message || 'Could not save that. Try again.');
                  }
                }}
                style={({ pressed }) => [s.primary, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.98 }] }]}
                accessibilityRole="button"
              >
                <Text style={[s.primaryText, { color: accentFg }]}>{received ? 'Yes, paid back' : 'Yes, I repaid'}</Text>
              </Pressable>
            </View>
          </Animated.View>
        );
      })}

      {error ? <Text style={[s.error, { color: isDark ? '#FFA8A8' : '#C92A2A' }]}>{error}</Text> : null}
    </Animated.View>
  );
};

const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, marginTop: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '700' },
  item: { paddingVertical: 10 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line1: { fontSize: 14.5, fontWeight: '600' },
  line2: { fontSize: 12.5, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  ghost: { flex: 1, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontSize: 13.5, fontWeight: '700' },
  primary: { flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 13.5, fontWeight: '700' },
  error: { fontSize: 13, fontWeight: '600', paddingBottom: 8 },
  prompt: { borderWidth: 1, borderRadius: 22, padding: 16 },
  promptTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  promptIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  promptTitle: { fontSize: 15, fontWeight: '700' },
  promptSub: { fontSize: 13, marginTop: 2 },
  counter: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  counterText: { fontSize: 12.5, fontWeight: '700' },
});

/**
 * One repayment question at a time, for a person's page: "Paid you back? ₹2,800 received ·
 * 18 Nov", No / Yes, and "1 of 3" when more are waiting. Answering shows the next one.
 */
export const RepaymentPrompt: React.FC<{
  /** One person's (their page). Left out: everyone's, and each question names whose it is. */
  contactId?: string;
  onOpenPayment?: (s: AppRepaymentSuggestion) => void;
}> = ({ contactId, onOpenPayment }) => {
  const { colors, isDark } = useTheme();
  const contacts = usePeerStore((st) => st.contacts);
  const { suggestions, accept, dismiss } = useRepaymentSuggestions(contactId);
  const [error, setError] = useState('');
  const sg = suggestions[0];
  if (!sg) return null;
  const person = contactId ? undefined : contacts.find((c) => c.id === sg.contactId);
  const first = person ? person.displayName.trim().split(/\s+/)[0] : '';

  const ink = colors.text;
  const muted = colors.textSecondary;
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const received = sg.kind === 'REPAY_RECEIVED';
  const question = person
    ? received
      ? `${first} paid you back?`
      : `Did you repay ${first}?`
    : received
      ? 'Paid you back?'
      : 'Did you repay?';

  return (
    <Animated.View
      key={sg.row.id}
      entering={FadeIn.duration(220)}
      style={[s.prompt, { marginTop: 16, backgroundColor: colors.card, borderColor: line }]}
    >
      <Pressable
        onPress={onOpenPayment ? () => onOpenPayment(sg) : undefined}
        style={s.promptTop}
        accessibilityRole={onOpenPayment ? 'button' : undefined}
        accessibilityLabel={`${question} ${formatPaise(sg.amount)} on ${prettyDate(sg.date)}`}
      >
        {person ? (
          <Avatar name={person.displayName} kind={person.kind} size={42} />
        ) : (
          <View style={[s.promptIcon, { backgroundColor: isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8' }]}>
            <Feather name={received ? 'arrow-down' : 'arrow-up'} size={19} color={accent} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.promptTitle, { color: ink }]} numberOfLines={1}>{question}</Text>
          <Text style={[s.promptSub, { color: muted }]} numberOfLines={1}>
            {formatPaise(sg.amount)} {received ? 'received' : 'sent'} · {prettyDate(sg.date)}
          </Text>
        </View>
        {suggestions.length > 1 ? (
          <View style={[s.counter, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F6F4' }]}>
            <Text style={[s.counterText, { color: muted }]}>1 of {suggestions.length}</Text>
          </View>
        ) : null}
      </Pressable>
      <View style={s.actions}>
        <Pressable
          onPress={() => dismiss(sg.row.id)}
          style={({ pressed }) => [s.ghost, { borderColor: line, height: 44, borderRadius: 22 }, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="No, not a repayment"
        >
          <Text style={[s.ghostText, { color: ink, fontSize: 14.5 }]}>No</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            try {
              setError('');
              accept(sg);
            } catch (e: any) {
              setError(e?.message || 'Could not save that. Try again.');
            }
          }}
          style={({ pressed }) => [s.primary, { backgroundColor: accent, height: 44, borderRadius: 22 }, pressed && { transform: [{ scale: 0.98 }] }]}
          accessibilityRole="button"
          accessibilityLabel="Yes, it's a repayment"
        >
          <Text style={[s.primaryText, { color: accentFg, fontSize: 14.5 }]}>Yes</Text>
        </Pressable>
      </View>
      {error ? <Text style={[s.error, { color: isDark ? '#FFA8A8' : '#C92A2A', paddingTop: 8, paddingBottom: 0 }]}>{error}</Text> : null}
    </Animated.View>
  );
};
