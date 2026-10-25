// src/components/RecordPeerPaymentModal.tsx
//
// Modal to record a settlement or partial repayment for a contact.
// Supports quick "Full Amount" pill, custom amount input, date, note,
// and payment mode (Cash, UPI Manual, or Other).

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
import { Contact, Paise, toPaise, formatPaise, DateString } from '../types/peer';

interface RecordPeerPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  contact: Contact;
  defaultDirection?: 'received' | 'paid'; // 'received' = friend paid me back, 'paid' = I paid friend back
  pendingAmountPaise?: Paise;
}

export const RecordPeerPaymentModal: React.FC<RecordPeerPaymentModalProps> = ({
  visible,
  onClose,
  contact,
  defaultDirection = 'received',
  pendingAmountPaise = 0,
}) => {
  const { colors, isDark } = useTheme();
  const addPeerEntry = usePeerStore((s) => s.addPeerEntry);

  const [direction, setDirection] = useState<'received' | 'paid'>(defaultDirection);
  const [amountStr, setAmountStr] = useState(
    pendingAmountPaise > 0 ? (pendingAmountPaise / 100).toString() : ''
  );
  const [method, setMethod] = useState<'cash' | 'upi_manual' | 'other'>('cash');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const todayStr: DateString = new Date().toISOString().split('T')[0];

  const handleFullAmount = () => {
    if (pendingAmountPaise > 0) {
      setAmountStr((pendingAmountPaise / 100).toString());
    }
  };

  const handleSubmit = () => {
    const num = parseFloat(amountStr);
    if (isNaN(num) || num <= 0) return;

    setSubmitting(true);
    try {
      const paise = toPaise(num);
      const kind = direction === 'received' ? 'REPAY_RECEIVED' : 'REPAY_PAID';

      addPeerEntry({
        contactId: contact.id,
        kind,
        amount: paise,
        date: todayStr,
        source: { type: 'manual', method },
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
              <Text style={[styles.title, { color: ink }]}>Record Payment</Text>
              <Text style={[styles.subtitle, { color: muted }]}>With {contact.displayName}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Feather name="x" size={20} color={muted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Direction Selector */}
            <View style={styles.directionRow}>
              <Pressable
                onPress={() => setDirection('received')}
                style={[
                  styles.directionTab,
                  direction === 'received' && {
                    backgroundColor: isDark ? 'rgba(8,145,178,0.2)' : '#E0F7FA',
                    borderColor: '#0891B2',
                  },
                ]}
              >
                <Feather
                  name="arrow-down-left"
                  size={16}
                  color={direction === 'received' ? '#0891B2' : muted}
                />
                <Text
                  style={[
                    styles.directionText,
                    { color: direction === 'received' ? '#0891B2' : muted },
                  ]}
                >
                  Money Received
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setDirection('paid')}
                style={[
                  styles.directionTab,
                  direction === 'paid' && {
                    backgroundColor: isDark ? 'rgba(234,88,12,0.2)' : '#FFF7ED',
                    borderColor: '#EA580C',
                  },
                ]}
              >
                <Feather
                  name="arrow-up-right"
                  size={16}
                  color={direction === 'paid' ? '#EA580C' : muted}
                />
                <Text
                  style={[
                    styles.directionText,
                    { color: direction === 'paid' ? '#EA580C' : muted },
                  ]}
                >
                  Money Paid
                </Text>
              </Pressable>
            </View>

            {/* Quick Full Amount pill */}
            {pendingAmountPaise > 0 && (
              <View style={styles.quickPillRow}>
                <Pressable
                  onPress={handleFullAmount}
                  style={[styles.quickPill, { backgroundColor: isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8' }]}
                >
                  <Text style={[styles.quickPillText, { color: isDark ? '#B8F36B' : '#0B3D2C' }]}>
                    Full Pending: {formatPaise(pendingAmountPaise)}
                  </Text>
                </Pressable>
              </View>
            )}

            {/* Amount Input */}
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

            {/* Payment Method */}
            <Text style={[styles.inputLabel, { color: muted }]}>Payment Method</Text>
            <View style={styles.methodRow}>
              {[
                { key: 'cash', label: 'Cash', icon: 'dollar-sign' },
                { key: 'upi_manual', label: 'UPI / Bank', icon: 'smartphone' },
                { key: 'other', label: 'Other', icon: 'more-horizontal' },
              ].map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => setMethod(m.key as any)}
                  style={[
                    styles.methodChip,
                    { borderColor: method === m.key ? (isDark ? '#B8F36B' : '#0B3D2C') : line },
                    method === m.key && {
                      backgroundColor: isDark ? 'rgba(184,243,107,0.12)' : '#E8F5E9',
                    },
                  ]}
                >
                  <Feather
                    name={m.icon as any}
                    size={14}
                    color={method === m.key ? (isDark ? '#B8F36B' : '#0B3D2C') : muted}
                  />
                  <Text
                    style={[
                      styles.methodText,
                      { color: method === m.key ? ink : muted, fontWeight: method === m.key ? '700' : '500' },
                    ]}
                  >
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Note */}
            <Text style={[styles.inputLabel, { color: muted }]}>Note (Optional)</Text>
            <TextInput
              style={[
                styles.noteInput,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAF9', borderColor: line, color: ink },
              ]}
              placeholder="e.g. Settle lunch bill"
              placeholderTextColor={muted}
              value={note}
              onChangeText={setNote}
            />

            {/* Submit Button */}
            <Pressable
              onPress={handleSubmit}
              disabled={submitting || !amountStr || parseFloat(amountStr) <= 0}
              style={({ pressed }) => [
                styles.submitBtn,
                { backgroundColor: accent },
                (!amountStr || parseFloat(amountStr) <= 0) && { opacity: 0.5 },
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              <Text style={[styles.submitText, { color: accentFg }]}>
                Record {direction === 'received' ? 'Repayment Received' : 'Payment Made'}
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
    maxHeight: '85%',
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
  quickPillRow: { marginBottom: 12 },
  quickPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  quickPillText: { fontSize: 12, fontWeight: '700' },
  inputLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10 },
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
  methodRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  methodChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
  },
  methodText: { fontSize: 12 },
  noteInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 14,
    marginBottom: 20,
  },
  submitBtn: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { fontSize: 15, fontWeight: '700' },
});
