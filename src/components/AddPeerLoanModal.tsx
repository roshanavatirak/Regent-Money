// src/components/AddPeerLoanModal.tsx
//
// Modal to record a new loan given or money borrowed.
// Discovers or creates a contact, records amount in integer paise,
// and appends the entry into the peer ledger.

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../store';
import { usePeerStore } from '../store/peerStore';
import { toPaise, DateString } from '../types/peer';

interface AddPeerLoanModalProps {
  visible: boolean;
  onClose: () => void;
  defaultContactId?: string;
  defaultKind?: 'LEND' | 'BORROW';
}

export const AddPeerLoanModal: React.FC<AddPeerLoanModalProps> = ({
  visible,
  onClose,
  defaultContactId,
  defaultKind = 'LEND',
}) => {
  const { colors, isDark } = useTheme();
  const contacts = usePeerStore((s) => s.contacts);
  const findOrCreateContact = usePeerStore((s) => s.findOrCreateContact);
  const addPeerEntry = usePeerStore((s) => s.addPeerEntry);

  const initialContact = contacts.find((c) => c.id === defaultContactId);

  const [kind, setKind] = useState<'LEND' | 'BORROW'>(defaultKind);
  const [contactName, setContactName] = useState(initialContact?.displayName || '');
  const [amountStr, setAmountStr] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const todayStr: DateString = new Date().toISOString().split('T')[0];

  const handleSubmit = () => {
    const num = parseFloat(amountStr);
    const cleanName = contactName.trim();
    if (isNaN(num) || num <= 0 || !cleanName) return;

    setSubmitting(true);
    try {
      const contact = findOrCreateContact(cleanName);
      const paise = toPaise(num);

      addPeerEntry({
        contactId: contact.id,
        kind,
        amount: paise,
        date: todayStr,
        dueDate: dueDate.trim() || undefined,
        source: { type: 'manual', method: 'cash' },
        note: note.trim() || undefined,
      });

      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const ink = colors.text;
  const muted = colors.textSecondary;
  const surface = colors.card;
  const line = colors.border;
  const accent = isDark ? '#B8F36B' : '#0B3D2C';
  const accentFg = isDark ? '#0B3D2C' : '#FFFFFF';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: surface, borderColor: line }]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: ink }]}>New Peer Entry</Text>
              <Text style={[styles.subtitle, { color: muted }]}>Record money given or taken</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Feather name="x" size={20} color={muted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Type Selector (Lend vs Borrow) */}
            <View style={styles.directionRow}>
              <Pressable
                onPress={() => setKind('LEND')}
                style={[
                  styles.directionTab,
                  kind === 'LEND' && {
                    backgroundColor: isDark ? 'rgba(8,145,178,0.2)' : '#E0F7FA',
                    borderColor: '#0891B2',
                  },
                ]}
              >
                <Feather
                  name="arrow-up-right"
                  size={16}
                  color={kind === 'LEND' ? '#0891B2' : muted}
                />
                <Text
                  style={[
                    styles.directionText,
                    { color: kind === 'LEND' ? '#0891B2' : muted },
                  ]}
                >
                  I Lent (Given)
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setKind('BORROW')}
                style={[
                  styles.directionTab,
                  kind === 'BORROW' && {
                    backgroundColor: isDark ? 'rgba(217,119,6,0.2)' : '#FFFBEB',
                    borderColor: '#D97706',
                  },
                ]}
              >
                <Feather
                  name="arrow-down-left"
                  size={16}
                  color={kind === 'BORROW' ? '#D97706' : muted}
                />
                <Text
                  style={[
                    styles.directionText,
                    { color: kind === 'BORROW' ? '#D97706' : muted },
                  ]}
                >
                  I Borrowed (Taken)
                </Text>
              </Pressable>
            </View>

            {/* Contact Name */}
            <Text style={[styles.inputLabel, { color: muted }]}>Friend / Contact Name</Text>
            <View style={[styles.inputBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAF9', borderColor: line }]}>
              <Feather name="user" size={16} color={muted} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.textInput, { color: ink }]}
                placeholder="e.g. Rahul Sharma"
                placeholderTextColor={muted}
                value={contactName}
                onChangeText={setContactName}
              />
            </View>

            {/* Quick Contact Chips if available */}
            {contacts.length > 0 && !contactName && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                {contacts.slice(0, 6).map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setContactName(c.displayName)}
                    style={[styles.quickChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2F0' }]}
                  >
                    <Text style={[styles.quickChipText, { color: ink }]}>{c.displayName}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {/* Amount */}
            <Text style={[styles.inputLabel, { color: muted }]}>Amount (₹)</Text>
            <View style={[styles.amountBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAF9', borderColor: line }]}>
              <Text style={[styles.currencyPrefix, { color: ink }]}>₹</Text>
              <TextInput
                style={[styles.amountInput, { color: ink }]}
                placeholder="0"
                placeholderTextColor={muted}
                keyboardType="numeric"
                value={amountStr}
                onChangeText={setAmountStr}
              />
            </View>

            {/* Due Date (Optional) */}
            <Text style={[styles.inputLabel, { color: muted }]}>Expected Return Date (YYYY-MM-DD, Optional)</Text>
            <View style={[styles.inputBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAF9', borderColor: line }]}>
              <Feather name="calendar" size={16} color={muted} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.textInput, { color: ink }]}
                placeholder="e.g. 2026-11-15"
                placeholderTextColor={muted}
                value={dueDate}
                onChangeText={setDueDate}
              />
            </View>

            {/* Note */}
            <Text style={[styles.inputLabel, { color: muted }]}>Note / Purpose (Optional)</Text>
            <View style={[styles.inputBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAF9', borderColor: line, marginBottom: 20 }]}>
              <Feather name="file-text" size={16} color={muted} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.textInput, { color: ink }]}
                placeholder="e.g. Dinner share, rent loan"
                placeholderTextColor={muted}
                value={note}
                onChangeText={setNote}
              />
            </View>

            {/* Submit Button */}
            <Pressable
              onPress={handleSubmit}
              disabled={submitting || !amountStr || parseFloat(amountStr) <= 0 || !contactName.trim()}
              style={({ pressed }) => [
                styles.submitBtn,
                { backgroundColor: accent },
                (!amountStr || parseFloat(amountStr) <= 0 || !contactName.trim()) && { opacity: 0.5 },
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              <Text style={[styles.submitText, { color: accentFg }]}>
                {kind === 'LEND' ? 'Record Lent Money' : 'Record Borrowed Money'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 36,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  directionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  directionText: { fontSize: 13, fontWeight: '700' },
  inputLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
  },
  textInput: { flex: 1, fontSize: 14 },
  chipRow: { flexDirection: 'row', marginTop: 8, marginBottom: 4 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
  },
  quickChipText: { fontSize: 12, fontWeight: '600' },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  currencyPrefix: { fontSize: 24, fontWeight: '800', marginRight: 8 },
  amountInput: { flex: 1, fontSize: 24, fontWeight: '800' },
  submitBtn: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitText: { fontSize: 15, fontWeight: '700' },
});
