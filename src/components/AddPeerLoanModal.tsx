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
import { format } from 'date-fns';
import { useTheme } from '../store';
import { usePeerStore } from '../store/peerStore';
import { toPaise, DateString } from '../types/peer';
import { DateTimePickerSheet } from './DateTimePickerSheet';

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
  const [errorText, setErrorText] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [entryCalendarOpen, setEntryCalendarOpen] = useState(false);

  const todayStr: DateString = new Date().toISOString().split('T')[0];
  const [entryDate, setEntryDate] = useState<DateString>(todayStr);

  const isDateOrderInvalid = Boolean(dueDate && entryDate && dueDate < entryDate);

  const handleSubmit = () => {
    const num = parseFloat(amountStr);
    const cleanName = contactName.trim();
    if (isNaN(num) || num <= 0 || !cleanName) return;

    if (dueDate && entryDate && dueDate < entryDate) {
      setErrorText(`Return date must be on or after the ${kind === 'LEND' ? 'date lent' : 'date borrowed'}.`);
      return;
    }

    setSubmitting(true);
    setErrorText('');
    try {
      const contact = findOrCreateContact(cleanName);
      const paise = toPaise(num);

      addPeerEntry({
        contactId: contact.id,
        kind,
        amount: paise,
        date: entryDate || todayStr,
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

            {/* Entry / Loan Date */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 4 }}>
              <Text style={[styles.inputLabel, { color: muted, marginTop: 0, marginBottom: 0 }]}>
                {kind === 'LEND' ? 'Date Lent' : 'Date Borrowed'}
              </Text>
              <Pressable
                onPress={() => setEntryCalendarOpen(true)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2, paddingHorizontal: 4 }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Change date"
              >
                <Feather name="calendar" size={13} color={isDark ? '#B8F36B' : '#0B3D2C'} style={{ marginRight: 5 }} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#B8F36B' : '#0B3D2C' }}>
                  {entryDate === todayStr ? 'Today' : format(new Date(entryDate + 'T00:00:00'), 'dd MMM yyyy')}
                </Text>
              </Pressable>
            </View>

            {/* Expected Return Date (Global Calendar) */}
            <Text style={[styles.inputLabel, { color: muted }]}>Expected Return Date (Optional)</Text>
            <Pressable
              onPress={() => setCalendarOpen(true)}
              style={[
                styles.inputBox,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAF9',
                  borderColor: isDateOrderInvalid ? '#EF4444' : line,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Select expected return date"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Feather
                  name="calendar"
                  size={16}
                  color={isDateOrderInvalid ? '#EF4444' : dueDate ? (isDark ? '#B8F36B' : '#0B3D2C') : muted}
                  style={{ marginRight: 10 }}
                />
                <Text
                  style={{
                    color: isDateOrderInvalid ? '#EF4444' : dueDate ? ink : muted,
                    fontSize: 14,
                    fontWeight: dueDate ? '600' : '400',
                  }}
                >
                  {dueDate ? format(new Date(dueDate + 'T00:00:00'), 'dd MMM yyyy') : 'e.g. 2026-11-15'}
                </Text>
              </View>
              {dueDate ? (
                <Pressable
                  hitSlop={12}
                  onPress={(e) => {
                    e.stopPropagation();
                    setDueDate('');
                    setErrorText('');
                  }}
                  style={{ padding: 4 }}
                  accessibilityLabel="Clear date"
                >
                  <Feather name="x-circle" size={16} color={muted} />
                </Pressable>
              ) : null}
            </Pressable>
            {isDateOrderInvalid ? (
              <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 4, fontWeight: '600' }}>
                Return date must be on or after {kind === 'LEND' ? 'date lent' : 'date borrowed'}.
              </Text>
            ) : null}

            {/* Note */}
            <Text style={[styles.inputLabel, { color: muted }]}>Note / Purpose (Optional)</Text>
            <View style={[styles.inputBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAF9', borderColor: line, marginBottom: 16 }]}>
              <Feather name="file-text" size={16} color={muted} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.textInput, { color: ink }]}
                placeholder="e.g. Dinner share, rent loan"
                placeholderTextColor={muted}
                value={note}
                onChangeText={setNote}
              />
            </View>

            {errorText ? (
              <Text style={{ color: '#EF4444', fontSize: 12, marginBottom: 12, textAlign: 'center', fontWeight: '600' }}>
                {errorText}
              </Text>
            ) : null}

            {/* Submit Button */}
            <Pressable
              onPress={handleSubmit}
              disabled={submitting || !amountStr || parseFloat(amountStr) <= 0 || !contactName.trim() || isDateOrderInvalid}
              style={({ pressed }) => [
                styles.submitBtn,
                { backgroundColor: accent },
                (!amountStr || parseFloat(amountStr) <= 0 || !contactName.trim() || isDateOrderInvalid) && { opacity: 0.5 },
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              <Text style={[styles.submitText, { color: accentFg }]}>
                {kind === 'LEND' ? 'Record Lent Money' : 'Record Borrowed Money'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Global Calendar Pickers */}
        <DateTimePickerSheet
          visible={calendarOpen}
          mode="date"
          title="Expected Return Date"
          value={dueDate ? new Date(dueDate + 'T00:00:00') : new Date(entryDate + 'T00:00:00')}
          minimumDate={new Date(entryDate + 'T00:00:00')}
          onClose={() => setCalendarOpen(false)}
          onConfirm={(selectedDate) => {
            setDueDate(format(selectedDate, 'yyyy-MM-dd'));
            setErrorText('');
            setCalendarOpen(false);
          }}
        />

        <DateTimePickerSheet
          visible={entryCalendarOpen}
          mode="date"
          title={kind === 'LEND' ? 'When did you lend this?' : 'When did you borrow this?'}
          value={entryDate ? new Date(entryDate + 'T00:00:00') : new Date()}
          maximumDate={new Date()}
          onClose={() => setEntryCalendarOpen(false)}
          onConfirm={(selectedDate) => {
            const formatted = format(selectedDate, 'yyyy-MM-dd');
            setEntryDate(formatted);
            if (dueDate && dueDate < formatted) {
              setDueDate(formatted);
            }
            setErrorText('');
            setEntryCalendarOpen(false);
          }}
        />
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
