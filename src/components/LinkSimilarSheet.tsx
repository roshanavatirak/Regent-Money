// src/components/LinkSimilarSheet.tsx
//
// After the user links a payment to someone: "These look like Rohit too". Other payments whose
// printed name looks like theirs (a different spelling, a new UPI ID). Close matches start
// ticked, loose ones (just a first name) don't. Nothing links until the user taps the button.

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { useTheme } from '../store';
import { contactNames, nameSimilarity, normalizeName } from '../services/counterpartyResolver';
import { niceName, Avatar } from './PersonPickerSheet';
import type { Contact } from '../types/peer';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

export interface SimilarItem {
  id: string;
  ledger: 'transaction' | 'income';
  merchant?: string;
  source?: string;
  amount?: number | string;
  timestamp?: number | string;
  counterpartyKey?: string;
  counterpartyId?: string;
}

const inr = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const LinkSimilarSheet: React.FC<{
  visible: boolean;
  contact: Contact | null;
  items: SimilarItem[];
  /** Payments already recognised by UPI ID / account / name, for the line under the title. */
  recognisedCount?: number;
  onClose: () => void;
  onLink: (items: SimilarItem[]) => void;
}> = ({ visible, contact, items, recognisedCount = 0, onClose, onLink }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // Close matches start ticked: same letters or a shared surname-like word
  const strong = useMemo(() => {
    const names = contact ? contactNames(contact) : [];
    const set = new Set<string>();
    for (const it of items) {
      const printed = normalizeName(it.merchant ?? it.source);
      if (names.some((n) => nameSimilarity(printed, n) >= 2)) set.add(it.id);
    }
    return set;
  }, [contact, items]);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (visible) setPicked(new Set(strong));
  }, [visible, strong]);

  if (!contact) return null;

  const ink = colors.text;
  const muted = colors.textSecondary;
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const chosen = items.filter((i) => picked.has(i.id));

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[s.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        <View style={[s.grabber, { backgroundColor: line }]} />
        <View style={s.header}>
          <Avatar name={contact.displayName} kind={contact.kind} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[s.title, { color: ink }]}>Are these from {contact.displayName} too?</Text>
            <Text style={[s.sub, { color: muted }]}>
              {items.length === 1 ? 'This payment has' : 'These payments have'} a similar name. Linked ones show{' '}
              {contact.displayName}.
            </Text>
          </View>
        </View>

        <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ paddingHorizontal: 20 }}>
          {items.map((it) => {
            const on = picked.has(it.id);
            const amount = Number(it.amount) || 0;
            const ts = Number(it.timestamp) || 0;
            const isCredit = it.ledger === 'income';
            return (
              <Pressable
                key={it.id}
                onPress={() => toggle(it.id)}
                style={({ pressed }) => [s.row, { borderBottomColor: line }, pressed && { opacity: 0.7 }]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
              >
                <View style={[s.box, on ? { backgroundColor: accent, borderColor: accent } : { borderColor: isDark ? colors.border : '#CBD5CF' }]}>
                  {on ? <Feather name="check" size={14} color={isDark ? FOREST : LIME} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.rowTitle, { color: ink }]} numberOfLines={1}>
                    {niceName(it.merchant ?? it.source) || 'Payment'}
                  </Text>
                  <Text style={[s.rowSub, { color: muted }]} numberOfLines={1}>
                    {[ts ? format(new Date(ts), 'd MMM yyyy') : null, it.counterpartyKey?.replace(/^vpa:/, '').replace(/^acct:/, 'A/c ••')]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Text style={[s.amount, { color: isCredit ? (isDark ? LIME : '#0B6B3A') : ink }]}>
                  {isCredit ? '+' : '−'}
                  {inr(amount)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={s.footer}>
          <Pressable onPress={onClose} style={({ pressed }) => [s.secondary, { borderColor: line }, pressed && { opacity: 0.7 }]} accessibilityRole="button">
            <Text style={[s.secondaryText, { color: ink }]}>Skip</Text>
          </Pressable>
          <Pressable
            disabled={chosen.length === 0}
            onPress={() => {
              onLink(chosen);
              onClose();
            }}
            style={({ pressed }) => [
              s.primary,
              { backgroundColor: accent, opacity: chosen.length ? 1 : 0.5 },
              pressed && chosen.length > 0 && { transform: [{ scale: 0.98 }] },
            ]}
            accessibilityRole="button"
          >
            <Text style={[s.primaryText, { color: isDark ? FOREST : LIME }]}>
              {chosen.length ? `Yes, link ${chosen.length}` : 'Tick to link'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  title: { fontSize: 17, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, borderBottomWidth: StyleSheet.hairlineWidth },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12.5, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 14 },
  secondary: { flex: 1, height: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15, fontWeight: '700' },
  primary: { flex: 1.4, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 15, fontWeight: '700' },
});
