// src/components/ReportDetailSheet.tsx
//
// Bottom sheet for one sent bug report: what its status means, where it is in the
// fix pipeline, what was sent, and the team's note. While the report is still
// 'open' the sender can edit it here; after that it is locked.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Image,
  Keyboard,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { feedbackService, FeedbackPriority, FeedbackStatus, SentFeedback } from '../services/feedbackService';
import { useFeedbackTheme, ff, LIME, FOREST, DropdownField, DropdownOption, Dot, TextCard } from './FeedbackFormKit';

/* ------------------------------------------------------------------ */
/* Shared report constants                                             */
/* ------------------------------------------------------------------ */

export const BUG_AREAS = ['Home', 'Bank sync', 'Balance', 'Budgets', 'Goals', 'Regent chat', 'Crash or slow', 'Something else'];

export const PRIORITIES: { key: FeedbackPriority; label: string; light: string; dark: string }[] = [
  { key: 'low', label: 'Low', light: '#8A9A92', dark: '#A9B0B6' },
  { key: 'medium', label: 'Medium', light: '#1450A3', dark: '#93C5FD' },
  { key: 'high', label: 'High', light: '#D98A00', dark: '#FFC24D' },
  { key: 'critical', label: 'Critical', light: '#C8361D', dark: '#FF8A6B' },
];

type FeatherName = keyof typeof Feather.glyphMap;

export type StatusInfo = {
  /** Short badge text in the list. */
  label: string;
  /** Headline in the detail sheet. */
  title: string;
  /** One line on what is happening. */
  body: string;
  icon: FeatherName;
  bg: string;
  fg: string;
  /** Position in the Received → Review → Fixing → Solved tracker; -1 = not on it (closed). */
  step: number;
};

export const getStatusInfo = (status: FeedbackStatus | undefined, isDark: boolean): StatusInfo => {
  switch (status) {
    case 'investigating':
      return {
        label: 'Investigating',
        title: 'Under review',
        body: 'The team is checking logs and your device info to reproduce it.',
        icon: 'search',
        bg: isDark ? 'rgba(56, 189, 248, 0.16)' : '#E0F2FE',
        fg: isDark ? '#7DD3FC' : '#0369A1',
        step: 1,
      };
    case 'in_progress':
      return {
        label: 'In progress',
        title: 'Being fixed',
        body: 'The cause is found and a fix is being written.',
        icon: 'tool',
        bg: isDark ? 'rgba(59, 130, 246, 0.18)' : '#DCEBFF',
        fg: isDark ? '#93C5FD' : '#1450A3',
        step: 2,
      };
    case 'fixed':
    case 'resolved':
      return {
        label: 'Fixed',
        title: 'Solved',
        body: 'The fix is tested and live in an app update.',
        icon: 'check-circle',
        bg: isDark ? 'rgba(184, 243, 107, 0.16)' : '#E3F2E8',
        fg: isDark ? LIME : FOREST,
        step: 3,
      };
    case 'closed':
      return {
        label: 'Closed',
        title: 'Archived',
        body: 'This report is finalised and no more work is planned.',
        icon: 'archive',
        bg: isDark ? 'rgba(255, 255, 255, 0.08)' : '#EEF3F0',
        fg: isDark ? '#A9B0B6' : '#5B6B63',
        step: -1,
      };
    case 'open':
    default:
      return {
        label: 'Open',
        title: 'Received',
        body: 'Logged and waiting for the team to review.',
        icon: 'inbox',
        bg: isDark ? 'rgba(255, 194, 77, 0.16)' : '#FFF1D6',
        fg: isDark ? '#FFC24D' : '#9A5B00',
        step: 0,
      };
  }
};

const TRACKER = ['Received', 'Review', 'Fixing', 'Solved'];

/* ------------------------------------------------------------------ */
/* Keyboard height (the sheet is a Modal, so it pads itself)           */
/* ------------------------------------------------------------------ */

const useKeyboardHeight = () => {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, (e) => setHeight(e.endCoordinates.height));
    const b = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return height;
};

/* ------------------------------------------------------------------ */
/* Sheet                                                               */
/* ------------------------------------------------------------------ */

export const ReportDetailSheet: React.FC<{
  report: SentFeedback | null;
  onClose: () => void;
  onUpdated: (updated: SentFeedback) => void;
}> = ({ report, onClose, onUpdated }) => {
  const insets = useSafeAreaInsets();
  const { p, font } = useFeedbackTheme();
  const keyboard = useKeyboardHeight();

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [area, setArea] = useState('');
  const [priority, setPriority] = useState<FeedbackPriority>('medium');
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');

  // Fresh state each time a report opens
  useEffect(() => {
    if (!report) return;
    setMode('view');
    setTitle(report.title || '');
    setDetails(report.description || '');
    setArea(report.area || '');
    setPriority(report.priority || 'medium');
    setErrorText('');
    setSaving(false);
  }, [report?.id]);

  const areaOptions: DropdownOption<string>[] = useMemo(() => BUG_AREAS.map((a) => ({ value: a, label: a })), []);
  const priorityOptions: DropdownOption<FeedbackPriority>[] = PRIORITIES.map((pr) => ({
    value: pr.key,
    label: pr.label,
    leading: <Dot color={p.isDark ? pr.dark : pr.light} />,
  }));

  if (!report) return null;

  const info = getStatusInfo(report.status, p.isDark);
  const canEdit = (report.status || 'open') === 'open';
  const prio = PRIORITIES.find((x) => x.key === report.priority);
  const media = report.mediaUrls || [];

  const valid = title.trim().length >= 3 && details.trim().length >= 10;
  const changed =
    title.trim() !== (report.title || '').trim() ||
    details.trim() !== (report.description || '').trim() ||
    area !== (report.area || '') ||
    priority !== (report.priority || 'medium');

  const close = () => {
    if (saving) return;
    Keyboard.dismiss();
    onClose();
  };

  const save = async () => {
    if (!valid || !changed || saving) return;
    setSaving(true);
    setErrorText('');
    try {
      const updated = await feedbackService.update(report.id, {
        title,
        description: details,
        area: area || null,
        priority,
      });
      onUpdated(updated);
      Keyboard.dismiss();
      setMode('view');
    } catch (e: any) {
      setErrorText(e?.message || 'Couldn’t save your changes. Try again.');
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- Pieces ---------------- */

  const IconBtn = ({ icon, label, onPress }: { icon: FeatherName; label: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [st.iconBtn, { backgroundColor: p.soft, opacity: pressed ? 0.7 : 1 }]}
    >
      <Feather name={icon} size={17} color={p.isDark ? LIME : FOREST} />
    </Pressable>
  );

  const renderView = () => (
    <>
      <View style={st.topRow}>
        <View style={[st.badge, { backgroundColor: info.bg }]}>
          <Text style={[st.badgeText, { color: info.fg }, ff(font.bold, '700')]}>{info.label}</Text>
        </View>
        <Text style={[st.date, { color: p.muted }, ff(font.semi, '600')]}>
          Sent {format(new Date(report.sentAt), 'd MMM yyyy')}
        </Text>
        <View style={{ flex: 1 }} />
        <IconBtn icon="x" label="Close" onPress={close} />
      </View>

      <Text style={[st.title, { color: p.ink }, ff(font.display, '800')]}>{report.title}</Text>
      <View style={st.metaRow}>
        {report.area ? (
          <Text style={[st.meta, { color: p.muted }, ff(font.semi, '600')]}>{report.area}</Text>
        ) : null}
        {report.area && prio ? <Text style={[st.meta, { color: p.muted }]}>·</Text> : null}
        {prio ? (
          <View style={st.prio}>
            <Dot color={p.isDark ? prio.dark : prio.light} />
            <Text style={[st.meta, { color: p.muted }, ff(font.semi, '600')]}>{prio.label}</Text>
          </View>
        ) : null}
      </View>

      {/* Status */}
      <View style={[st.statusCard, { backgroundColor: p.card, borderColor: p.border }]}>
        <View style={st.statusHead}>
          <View style={[st.statusIcon, { backgroundColor: info.bg }]}>
            <Feather name={info.icon} size={18} color={info.fg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.statusTitle, { color: p.ink }, ff(font.bold, '700')]}>{info.title}</Text>
            <Text style={[st.statusBody, { color: p.muted }, ff(font.body, '500')]}>{info.body}</Text>
          </View>
        </View>

        {info.step >= 0 ? (
          <View style={st.tracker}>
            {TRACKER.map((label, i) => {
              const done = i <= info.step;
              return (
                <View key={label} style={st.trackStep}>
                  <View style={[st.trackBar, { backgroundColor: done ? (p.isDark ? LIME : FOREST) : p.divider }]} />
                  <Text
                    style={[
                      st.trackLabel,
                      { color: i === info.step ? p.ink : p.muted },
                      i === info.step ? ff(font.bold, '700') : ff(font.semi, '600'),
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      {report.adminNotes ? (
        <View style={[st.note, { backgroundColor: p.soft }]}>
          <Text style={[st.sectionLabel, { color: p.muted, marginBottom: 4 }, ff(font.semi, '600')]}>From the team</Text>
          <Text style={[st.bodyText, { color: p.ink }, ff(font.body, '500')]}>{report.adminNotes}</Text>
        </View>
      ) : null}

      {report.description ? (
        <View style={st.section}>
          <Text style={[st.sectionLabel, { color: p.muted }, ff(font.semi, '600')]}>Details</Text>
          <Text style={[st.bodyText, { color: p.ink }, ff(font.body, '500')]}>{report.description}</Text>
        </View>
      ) : null}

      {media.length > 0 ? (
        <View style={st.section}>
          <Text style={[st.sectionLabel, { color: p.muted }, ff(font.semi, '600')]}>
            Screenshots{info.step === 3 ? ' · deleted 30 days after the fix' : ''}
          </Text>
          <View style={st.shots}>
            {media.map((uri) => (
              <Image key={uri} source={{ uri }} style={[st.shot, { backgroundColor: p.soft }]} resizeMode="cover" />
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ height: 18 }} />
      {canEdit ? (
        <Pressable
          onPress={() => setMode('edit')}
          accessibilityRole="button"
          style={({ pressed }) => [st.cta, { backgroundColor: p.primary, opacity: pressed ? 0.85 : 1 }]}
        >
          <Feather name="edit-2" size={16} color={p.primaryIcon} />
          <Text style={[st.ctaText, { color: p.onPrimary }, ff(font.bold, '700')]}>Edit report</Text>
        </Pressable>
      ) : (
        <View style={st.locked}>
          <Feather name="lock" size={14} color={p.muted} />
          <Text style={[st.lockedText, { color: p.muted }, ff(font.semi, '600')]}>
            Editing closes once review starts
          </Text>
        </View>
      )}
    </>
  );

  const renderEdit = () => (
    <>
      <View style={st.topRow}>
        <IconBtn
          icon="arrow-left"
          label="Back to report"
          onPress={() => {
            Keyboard.dismiss();
            setErrorText('');
            setMode('view');
          }}
        />
        <Text style={[st.editTitle, { color: p.ink }, ff(font.display, '800')]}>Edit report</Text>
        <View style={{ flex: 1 }} />
        <IconBtn icon="x" label="Close" onPress={close} />
      </View>

      <View style={st.editRow}>
        <DropdownField label="Area" value={area} options={areaOptions} onChange={setArea} />
        <DropdownField
          label="Priority"
          value={priority}
          options={priorityOptions}
          onChange={(v) => v && setPriority(v)}
          allowClear={false}
          menuMinWidth={180}
        />
      </View>

      <TextCard
        titleLabel="Summary"
        titleValue={title}
        onTitleChange={(t) => {
          setTitle(t);
          if (errorText) setErrorText('');
        }}
        titlePlaceholder="Payment didn’t show up"
        detailsLabel="Details"
        detailsValue={details}
        onDetailsChange={(t) => {
          setDetails(t);
          if (errorText) setErrorText('');
        }}
        detailsPlaceholder="Steps, what happened, what you expected"
      />

      {errorText ? (
        <View style={st.errorRow}>
          <Feather name="alert-circle" size={14} color={p.danger} />
          <Text style={[st.errorText, { color: p.danger }, ff(font.semi, '600')]}>{errorText}</Text>
        </View>
      ) : null}

      <View style={{ height: 18 }} />
      <Pressable
        onPress={save}
        disabled={!valid || !changed || saving}
        accessibilityRole="button"
        accessibilityState={{ disabled: !valid || !changed || saving }}
        style={({ pressed }) => [
          st.cta,
          { backgroundColor: valid && changed ? p.primary : p.disabledBg, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        {saving ? (
          <ActivityIndicator color={p.onPrimary} />
        ) : (
          <Text style={[st.ctaText, { color: valid && changed ? p.onPrimary : p.disabledFg }, ff(font.bold, '700')]}>
            Save changes
          </Text>
        )}
      </Pressable>
    </>
  );

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <View style={st.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        <View
          style={[
            st.sheet,
            {
              backgroundColor: p.page,
              paddingBottom: (keyboard > 0 ? keyboard : Math.max(insets.bottom, 16)) + 10,
            },
          ]}
        >
          <View style={[st.grabber, { backgroundColor: p.isDark ? 'rgba(255,255,255,0.18)' : '#D5DFD9' }]} />
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {mode === 'view' ? renderView() : renderEdit()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, maxHeight: '92%' },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12 },
  date: { fontSize: 12.5 },

  title: { fontSize: 24, lineHeight: 29, letterSpacing: -0.4 },
  editTitle: { fontSize: 20, letterSpacing: -0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 16 },
  meta: { fontSize: 13 },
  prio: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  statusCard: { borderWidth: 1, borderRadius: 20, padding: 14 },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 15.5 },
  statusBody: { fontSize: 13, lineHeight: 18, marginTop: 2 },

  tracker: { flexDirection: 'row', gap: 6, marginTop: 14 },
  trackStep: { flex: 1, gap: 6 },
  trackBar: { height: 4, borderRadius: 2 },
  trackLabel: { fontSize: 11.5 },

  note: { borderRadius: 16, padding: 14, marginTop: 12 },
  section: { marginTop: 18 },
  sectionLabel: { fontSize: 12.5, marginBottom: 6 },
  bodyText: { fontSize: 14.5, lineHeight: 21 },
  shots: { flexDirection: 'row', gap: 10 },
  shot: { width: 76, height: 76, borderRadius: 14 },

  editRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 4 },
  errorText: { fontSize: 13, flex: 1 },

  cta: { height: 54, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { fontSize: 15.5 },
  locked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44 },
  lockedText: { fontSize: 13 },
});
