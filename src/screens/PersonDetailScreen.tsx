// src/screens/PersonDetailScreen.tsx
//
// Regent Money — Person Detail & Ledger Timeline Screen (Phase P2)
// Shows full audit history of all loans, repayments, and allocations for a specific contact.

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { useTheme, showGlobalConfirm } from '../store';
import { usePeerStore } from '../store/peerStore';
import { computeContactSummary } from '../services/peerLedgerSelectors';
import { formatPaise, PeerEntry } from '../types/peer';
import { RecordPeerPaymentModal } from '../components/RecordPeerPaymentModal';
import { AddPeerLoanModal } from '../components/AddPeerLoanModal';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

interface PersonDetailScreenProps {
  route?: any;
  navigation?: any;
}

export const PersonDetailScreen: React.FC<PersonDetailScreenProps> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const contactId = route.params?.contactId;

  const display =
    typeof Font?.isLoaded === 'function' && Font.isLoaded('BricolageGrotesque_800ExtraBold')
      ? 'BricolageGrotesque_800ExtraBold'
      : undefined;

  const contacts = usePeerStore((s) => s.contacts);
  const entries = usePeerStore((s) => s.entries);
  const storedAllocations = usePeerStore((s) => s.storedAllocations);
  const deleteContact = usePeerStore((s) => s.deleteContact);
  const softDeletePeerEntry = usePeerStore((s) => s.softDeletePeerEntry);

  const contact = contacts.find((c) => c.id === contactId);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Compute ledger summary for this contact
  const summary = useMemo(() => {
    if (!contact) return null;
    return computeContactSummary(contact, entries, storedAllocations, todayStr);
  }, [contact, entries, storedAllocations, todayStr]);

  // Entries for this contact (chronological desc)
  const contactEntries = useMemo(() => {
    if (!contactId) return [];
    return entries
      .filter((e) => e.contactId === contactId && !e.deletedAt)
      .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : b.createdAt - a.createdAt));
  }, [entries, contactId]);

  if (!contact || !summary) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.topNav}>
          <Pressable onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.emptyCenter}>
          <Text style={{ color: colors.text }}>Contact not found.</Text>
        </View>
      </View>
    );
  }

  const owesYou = summary.netPosition > 0;
  const youOwe = summary.netPosition < 0;
  const isSettled = summary.netPosition === 0;

  const handleRemind = () => {
    const pendingText = formatPaise(summary.totalLentPending);
    const text = encodeURIComponent(
      `Hi ${contact.displayName}, checking in on the ${pendingText} pending on Regent Money. Please let me know when you'll be able to clear this. Thanks!`
    );
    const phone = contact.phoneE164?.replace(/\D/g, '');
    const url = phone ? `whatsapp://send?phone=${phone}&text=${text}` : `whatsapp://send?text=${text}`;

    Linking.openURL(url).catch(() => {
      const smsUrl = phone ? `sms:${phone}?body=${text}` : `sms:?body=${text}`;
      Linking.openURL(smsUrl).catch(() => {});
    });
  };

  const handleDeleteEntry = (entry: PeerEntry) => {
    showGlobalConfirm({
      title: 'Remove entry?',
      message: `Remove this ${formatPaise(entry.amount)} entry from ${contact.displayName}'s ledger? Allocations will recalculate automatically.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: () => {
        softDeletePeerEntry(entry.id);
      },
    });
  };

  const handleDeleteContact = () => {
    showGlobalConfirm({
      title: `Delete ${contact.displayName}?`,
      message: 'This will remove the contact and all their peer ledger history. Real bank transactions will not be deleted.',
      confirmText: 'Delete Contact',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: () => {
        deleteContact(contact.id);
        navigation.goBack();
      },
    });
  };

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = colors.border;
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;

  return (
    <View style={[styles.container, { backgroundColor: pageBg, paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={pageBg} />

      {/* Top Header */}
      <View style={styles.topNav}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={[styles.iconBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E8EDE9' }]}
        >
          <Feather name="arrow-left" size={20} color={ink} />
        </Pressable>
        <View style={styles.navTitles}>
          <Text style={[styles.screenTitle, { color: ink, fontFamily: display }]}>
            {contact.displayName}
          </Text>
          <Text style={[styles.screenSub, { color: muted }]}>
            {contact.phoneE164 || contact.upiIds[0] || 'Peer Contact'}
          </Text>
        </View>
        <Pressable onPress={handleDeleteContact} hitSlop={12} style={styles.iconBtn}>
          <Feather name="trash-2" size={18} color={muted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Net Status Hero Card */}
        <View
          style={[
            styles.statusHero,
            {
              backgroundColor: isDark ? '#061D15' : FOREST,
            },
          ]}
        >
          <Text style={styles.statusHeroLabel}>OUTSTANDING POSITION</Text>
          <Text
            style={[
              styles.statusHeroAmount,
              { fontFamily: display },
              owesYou && { color: LIME },
              youOwe && { color: '#FB923C' },
              isSettled && { color: '#E2E8F0' },
            ]}
          >
            {owesYou
              ? `Owes you ${formatPaise(summary.netPosition)}`
              : youOwe
              ? `You owe ${formatPaise(Math.abs(summary.netPosition))}`
              : '✓ All Settled'}
          </Text>

          {/* Mutual Breakdown */}
          <View style={styles.summarySplitRow}>
            <View style={styles.summarySplitCol}>
              <Text style={styles.summaryColLabel}>Lent to {contact.displayName}</Text>
              <Text style={[styles.summaryColVal, { color: '#38BDF8' }]}>
                {formatPaise(summary.totalLentPending)} pending
              </Text>
            </View>
            <View style={styles.summarySplitCol}>
              <Text style={styles.summaryColLabel}>Borrowed from {contact.displayName}</Text>
              <Text style={[styles.summaryColVal, { color: '#FBBF24' }]}>
                {formatPaise(summary.totalBorrowedPending)} pending
              </Text>
            </View>
          </View>

          {/* Unallocated surplus badge */}
          {summary.unallocatedCredit > 0 && (
            <View style={styles.surplusPill}>
              <Feather name="info" size={12} color="#0891B2" style={{ marginRight: 6 }} />
              <Text style={styles.surplusPillText}>
                {formatPaise(summary.unallocatedCredit)} excess credit available
              </Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <Pressable
            onPress={() => setShowPaymentModal(true)}
            style={[styles.primaryAction, { backgroundColor: accent }]}
          >
            <Feather name="check-circle" size={16} color={accentFg} style={{ marginRight: 6 }} />
            <Text style={[styles.primaryActionText, { color: accentFg }]}>Record Payment</Text>
          </Pressable>

          <Pressable
            onPress={() => setShowAddModal(true)}
            style={[styles.secondaryAction, { backgroundColor: surface, borderColor: line }]}
          >
            <Feather name="plus" size={16} color={ink} style={{ marginRight: 6 }} />
            <Text style={[styles.secondaryActionText, { color: ink }]}>New Loan</Text>
          </Pressable>

          {owesYou && (
            <Pressable
              onPress={handleRemind}
              style={[styles.iconAction, { backgroundColor: surface, borderColor: line }]}
            >
              <Feather name="message-circle" size={18} color="#25D366" />
            </Pressable>
          )}
        </View>

        {/* Timeline Section */}
        <Text style={[styles.sectionTitle, { color: ink }]}>Ledger History</Text>

        {contactEntries.length === 0 ? (
          <View style={[styles.emptyTimeline, { backgroundColor: surface, borderColor: line }]}>
            <Text style={[styles.emptyTimelineText, { color: muted }]}>
              No transactions recorded for this contact yet.
            </Text>
          </View>
        ) : (
          <View style={styles.timelineList}>
            {contactEntries.map((entry) => {
              const isLend = entry.kind === 'LEND';
              const isBorrow = entry.kind === 'BORROW';
              const isRepayRec = entry.kind === 'REPAY_RECEIVED';
              const isRepayPaid = entry.kind === 'REPAY_PAID';

              const kindLabel = isLend
                ? 'Lent to friend'
                : isBorrow
                ? 'Borrowed from friend'
                : isRepayRec
                ? 'Repayment received'
                : isRepayPaid
                ? 'Repayment paid'
                : entry.kind;

              const kindColor = isLend || isRepayRec ? '#0891B2' : '#EA580C';
              const sign = isLend || isRepayPaid ? '−' : '+';

              return (
                <View
                  key={entry.id}
                  style={[styles.timelineCard, { backgroundColor: surface, borderColor: line }]}
                >
                  <View style={styles.entryTopRow}>
                    <View style={styles.entryKindPill}>
                      <View style={[styles.entryDot, { backgroundColor: kindColor }]} />
                      <Text style={[styles.entryKindText, { color: kindColor }]}>{kindLabel}</Text>
                    </View>
                    <Text style={[styles.entryAmount, { color: ink }]}>
                      {sign}
                      {formatPaise(entry.amount)}
                    </Text>
                  </View>

                  <View style={styles.entryBottomRow}>
                    <Text style={[styles.entryDate, { color: muted }]}>
                      {entry.date}
                      {entry.source.type === 'manual'
                        ? ` • ${entry.source.method.toUpperCase()}`
                        : ' • Bank UPI'}
                      {entry.note ? ` • "${entry.note}"` : ''}
                    </Text>
                    <Pressable
                      onPress={() => handleDeleteEntry(entry)}
                      hitSlop={8}
                      style={styles.deleteBtn}
                    >
                      <Feather name="trash-2" size={14} color={muted} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <RecordPeerPaymentModal
          visible={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          contact={contact}
          defaultDirection={owesYou ? 'received' : 'paid'}
          pendingAmountPaise={Math.abs(summary.netPosition)}
        />
      )}

      {/* Add Loan Modal */}
      {showAddModal && (
        <AddPeerLoanModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          defaultContactId={contact.id}
          defaultKind={owesYou ? 'LEND' : 'BORROW'}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitles: { flex: 1, marginHorizontal: 12 },
  screenTitle: { fontSize: 20, fontWeight: '800' },
  screenSub: { fontSize: 12, marginTop: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 6 },
  emptyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* Hero Status */
  statusHero: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  statusHeroLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 6,
  },
  statusHeroAmount: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  summarySplitRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  summarySplitCol: { flex: 1 },
  summaryColLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    marginBottom: 2,
  },
  summaryColVal: { fontSize: 13, fontWeight: '700' },
  surplusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8,145,178,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  surplusPillText: { color: '#38BDF8', fontSize: 11, fontWeight: '600' },

  /* Actions */
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  primaryAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 23,
  },
  primaryActionText: { fontSize: 14, fontWeight: '700' },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    paddingHorizontal: 16,
    borderRadius: 23,
    borderWidth: 1,
  },
  secondaryActionText: { fontSize: 14, fontWeight: '600' },
  iconAction: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Timeline */
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  emptyTimeline: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyTimelineText: { fontSize: 13 },
  timelineList: { gap: 10 },
  timelineCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  entryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  entryKindPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  entryDot: { width: 6, height: 6, borderRadius: 3 },
  entryKindText: { fontSize: 13, fontWeight: '700' },
  entryAmount: { fontSize: 16, fontWeight: '800' },
  entryBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryDate: { fontSize: 12 },
  deleteBtn: { padding: 4 },
});
