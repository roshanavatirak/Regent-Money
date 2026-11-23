// src/components/PersonPickerSheet.tsx
//
// "Who is this?" Search your people and shops by any name or UPI ID they've been seen with,
// pick one, or add someone new. Used on the transaction screen (link a payment to a person)
// and on a person's page (pick who to merge with).

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, TextInput, StyleSheet, Platform } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../store';
import { usePeerStore } from '../store/peerStore';
import { normalizeName, searchContacts, suggestContacts } from '../services/counterpartyResolver';
import { activeContactIds } from '../services/counterpartyService';
import type { Contact } from '../types/peer';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
const MAX_SHOWN = 40;

const AVATAR_TONES: [string, string][] = [
  ['#FFE2B3', '#8A5A00'],
  ['#DCEBFF', '#1450A3'],
  ['#ECE6FF', '#4B2DB8'],
  ['#E3F2E8', '#0B3D2C'],
  ['#FCE4EE', '#A61E4D'],
  ['#FFE8D9', '#B23F00'],
];
export const avatarTone = (name: string): [string, string] => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
};

/** "ROHIT C" → "Rohit C"; leaves mixed-case names alone. */
export const niceName = (s?: string | null) => {
  const t = (s || '').trim();
  if (!t) return '';
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};

export const Avatar: React.FC<{ name: string; size?: number; kind?: Contact['kind'] }> = ({ name, size = 40, kind }) => {
  const [bg, fg] = avatarTone(name);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      {kind === 'merchant' ? (
        <Feather name="shopping-bag" size={size * 0.42} color={fg} />
      ) : (
        <Text style={{ color: fg, fontWeight: '800', fontSize: size * 0.4 }}>{(name.trim()[0] || '?').toUpperCase()}</Text>
      )}
    </View>
  );
};

export interface PersonPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (contact: Contact) => void;
  /** Adds someone new from what was typed. Hidden when not given. */
  onCreate?: (name: string, kind: 'person' | 'merchant') => void;
  /** Shown as "Not Rohit" when the row is already linked. */
  onUnlink?: () => void;
  title?: string;
  /** The name the bank printed, for suggestions and as the default new name. */
  printedName?: string;
  /** "rohit.c@okaxis" / "Account ••4821", shown under the title. */
  printedDetail?: string;
  currentId?: string | null;
  excludeIds?: string[];
  defaultKind?: 'person' | 'merchant';
}

export const PersonPickerSheet: React.FC<PersonPickerSheetProps> = ({
  visible,
  onClose,
  onPick,
  onCreate,
  onUnlink,
  title = 'Who is this?',
  printedName,
  printedDetail,
  currentId,
  excludeIds,
  defaultKind = 'person',
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const contacts = usePeerStore((s) => s.contacts);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const ink = colors.text;
  const muted = colors.textSecondary;
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const fieldBg = isDark ? 'rgba(255,255,255,0.06)' : '#F3F6F4';

  // Who has at least one transaction, worked out once each time the sheet opens
  const activeIds = useMemo(() => (visible ? activeContactIds() : new Set<string>()), [visible, contacts]);

  // Typed: search everyone. Nothing typed: the current person, then only people with a name
  // close to this payment's AND at least one transaction (a different first name never shows).
  const results = useMemo(() => {
    const pool = excludeIds?.length ? contacts.filter((c) => !excludeIds.includes(c.id)) : contacts;
    if (query.trim()) return searchContacts(pool, query).slice(0, MAX_SHOWN);
    const suggested = suggestContacts(pool, printedName || '', activeIds);
    const current = currentId ? pool.find((c) => c.id === currentId) : undefined;
    return (current ? [current, ...suggested.filter((c) => c.id !== current.id)] : suggested).slice(0, MAX_SHOWN);
  }, [contacts, excludeIds, query, printedName, activeIds, currentId]);

  const current = currentId ? contacts.find((c) => c.id === currentId) : undefined;
  // Only when it differs from the picked person's name
  const previousName =
    current && normalizeName(printedName) && normalizeName(printedName) !== normalizeName(current.displayName)
      ? niceName(printedName)
      : '';
  const newName = query.trim() || niceName(printedName);
  const exactExists = !!newName && contacts.some((c) => normalizeName(c.displayName) === normalizeName(newName));

  const pick = (c: Contact) => {
    onPick(c);
    onClose();
  };

  const create = () => {
    if (!onCreate || !newName) return;
    onCreate(newName, defaultKind);
    onClose();
  };

  /** Done on the keyboard: the person with exactly that name, or a new one. */
  const submit = () => {
    const typed = normalizeName(query);
    if (!typed) return;
    const exact = contacts.find((c) => normalizeName(c.displayName) === typed && !excludeIds?.includes(c.id));
    if (exact) pick(exact);
    else create();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <View style={[s.grabber, { backgroundColor: line }]} />
          <View style={s.header}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[s.title, { color: ink }]}>{title}</Text>
              {printedDetail ? (
                <Text style={[s.sub, { color: muted }]} numberOfLines={1}>
                  {printedDetail}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Feather name="x" size={20} color={muted} />
            </Pressable>
          </View>

          <View style={[s.search, { backgroundColor: fieldBg }]}>
            <Feather name="search" size={16} color={muted} />
            <TextInput
              value={query}
              onChangeText={(t) => setQuery(t.slice(0, 60))}
              placeholder={onCreate ? 'Search or type a new name' : 'Search name or UPI ID'}
              placeholderTextColor={muted}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={submit}
              style={[s.input, { color: ink }]}
              accessibilityLabel="Search people and shops"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
                <Feather name="x-circle" size={16} color={muted} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}>
            {/* The name it had before a person was picked (as the bank printed it): tap to go back to it */}
            {current && onUnlink && !query && previousName ? (
              <Pressable
                onPress={() => {
                  onUnlink();
                  onClose();
                }}
                style={({ pressed }) => [s.row, { borderBottomColor: line }, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={`Previous name, ${previousName}. Use it again`}
              >
                <View style={[s.iconTile, { backgroundColor: fieldBg }]}>
                  <Feather name="rotate-ccw" size={17} color={muted} />
                </View>
                <View style={[s.rowBody, s.titleLine]}>
                  <Text style={[s.rowTitle, { color: ink, flexShrink: 1 }]} numberOfLines={1}>
                    {previousName}
                  </Text>
                  <View style={[s.tag, { backgroundColor: fieldBg }]}>
                    <Text style={[s.tagText, { color: muted }]}>Previous</Text>
                  </View>
                </View>
              </Pressable>
            ) : null}

            {results.map((c) => {
              const on = c.id === currentId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => pick(c)}
                  style={({ pressed }) => [s.row, { borderBottomColor: line }, pressed && { opacity: 0.7 }]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={c.displayName}
                >
                  <Avatar name={c.displayName} kind={c.kind} />
                  <View style={s.rowBody}>
                    <Text style={[s.rowTitle, { color: ink }, on && { fontWeight: '800' }]} numberOfLines={1}>
                      {c.displayName}
                    </Text>
                  </View>
                  {on ? <Feather name="check" size={18} color={accent} /> : null}
                </Pressable>
              );
            })}

            {results.length === 0 ? (
              <Text style={[s.empty, { color: muted }]}>
                {query.trim() ? `No one called "${query.trim()}" yet.` : 'No one similar yet. Type a name to search.'}
              </Text>
            ) : null}

            {onCreate && newName && !exactExists ? (
              <Pressable
                onPress={create}
                style={({ pressed }) => [s.createRow, { borderColor: line }, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={`Add ${newName}`}
              >
                <View style={[s.iconTile, { backgroundColor: accent }]}>
                  <Feather name="plus" size={18} color={isDark ? FOREST : LIME} />
                </View>
                <View style={s.rowBody}>
                  <Text style={[s.rowTitle, { color: ink }]} numberOfLines={1}>
                    Add "{newName}"
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 8 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  title: { fontSize: 17, fontWeight: '700' },
  sub: { fontSize: 12.5, marginTop: 3 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 4, height: 46, borderRadius: 14, paddingHorizontal: 12 },
  input: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderBottomWidth: StyleSheet.hairlineWidth },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  tagText: { fontSize: 11.5, fontWeight: '700' },
  iconTile: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 14, paddingVertical: 16, textAlign: 'center' },
  createRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, borderWidth: 1, borderRadius: 18, padding: 10 },
});
