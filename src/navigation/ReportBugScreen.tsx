// src/navigation/ReportBugScreen.tsx
//
// Report a problem: area and priority dropdowns, a summary + details card,
// up to 3 screenshots, optional device info, and status of past reports.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, Image } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { useTheme } from '../store';
import { getAppCurrentVersion } from '../services/updateService';
import { feedbackService, FeedbackPriority, SentFeedback } from '../services/feedbackService';
import { ReportDetailSheet, BUG_AREAS, PRIORITIES, getStatusInfo } from '../components/ReportDetailSheet';
import { pickScreenshot } from '../services/imageService';
import {
  FOREST,
  LIME,
  useFeedbackTheme,
  ff,
  k,
  FeedbackHeader,
  DropdownField,
  DropdownOption,
  Dot,
  TextCard,
  FormSwitch,
  SendButton,
} from '../components/FeedbackFormKit';

const AREAS = BUG_AREAS;

export const ReportBugScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme } = useTheme();
  const { p, font } = useFeedbackTheme();
  const scrollRef = useRef<ScrollView>(null);
  const historyY = useRef(0);

  const draft = useRef(feedbackService.getDraft('bug')).current;
  const [area, setArea] = useState(draft.area || '');
  const [title, setTitle] = useState(draft.title || '');
  const [details, setDetails] = useState(draft.description || '');
  const [priority, setPriority] = useState<FeedbackPriority>(draft.priority || 'medium');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [includeDevice, setIncludeDevice] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [sent, setSent] = useState<SentFeedback | null>(null);
  const [history, setHistory] = useState<SentFeedback[]>(() => feedbackService.history('bug'));
  const [openReport, setOpenReport] = useState<SentFeedback | null>(null);

  // Sync latest report status and admin notes from server on mount
  useEffect(() => {
    let mounted = true;
    feedbackService.fetchMyReports().then((items) => {
      if (mounted) {
        setHistory(items.filter((i) => i.kind === 'bug'));
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(
      () => feedbackService.saveDraft('bug', { title, description: details, area, priority }),
      400,
    );
    return () => clearTimeout(t);
  }, [title, details, area, priority]);

  const version = getAppCurrentVersion();
  const phone = `${Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web'}${Platform.Version ? ` ${Platform.Version}` : ''}`;
  const themeLabel = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'Device';

  const ready = title.trim().length >= 3 && details.trim().length >= 10;

  const areaOptions: DropdownOption<string>[] = AREAS.map((a) => ({ value: a, label: a }));
  const priorityOptions: DropdownOption<FeedbackPriority>[] = PRIORITIES.map((pr) => ({
    value: pr.key,
    label: pr.label,
    leading: <Dot color={p.isDark ? pr.dark : pr.light} />,
  }));

  const handleAddScreenshot = async () => {
    if (screenshots.length >= 3 || pickingPhoto) return;
    setPickingPhoto(true);
    try {
      const dataUri = await pickScreenshot();
      if (dataUri) {
        setScreenshots((prev) => (prev.length < 3 ? [...prev, dataUri] : prev));
      }
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleRemoveScreenshot = (index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  };

  const send = async () => {
    if (!ready || sending) return;
    setSending(true);
    setErrorText('');
    try {
      const item = await feedbackService.submit({
        kind: 'bug',
        title,
        description: details,
        area: area || undefined,
        priority,
        images: screenshots.length > 0 ? screenshots : undefined,
        includeDevice,
        device: { theme: themeLabel.toLowerCase() },
      });
      setSent(item);
      setScreenshots([]);
      setHistory(feedbackService.history('bug'));
    } catch (e: any) {
      setErrorText(e?.message || 'Couldn’t send it. Try again.');
    } finally {
      setSending(false);
    }
  };

  /* ---------------- Sent ---------------- */

  if (sent) {
    return (
      <View
        style={[
          k.doneWrap,
          { backgroundColor: p.page, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 10 },
        ]}
      >
        <View style={k.doneBody}>
          <Animated.View entering={ZoomIn.springify().damping(12)} style={[k.doneCircle, { backgroundColor: FOREST }]}>
            <Feather name="check" size={40} color={LIME} />
          </Animated.View>
          <Animated.Text entering={FadeIn.delay(150)} style={[k.doneTitle, { color: p.ink }, ff(font.display, '800')]}>
            Report sent
          </Animated.Text>
          <Animated.Text entering={FadeIn.delay(220)} style={[k.doneText, { color: p.muted }, ff(font.body, '500')]}>
            Track “{sent.title}” under My reports.
          </Animated.Text>
        </View>
        <Pressable onPress={() => navigation.goBack()} style={[k.doneCta, { backgroundColor: p.primary }]}>
          <Text style={[k.ctaText, { color: p.onPrimary }, ff(font.bold, '700')]}>Done</Text>
        </Pressable>
      </View>
    );
  }

  /* ---------------- Form ---------------- */

  return (
    <View style={{ flex: 1, backgroundColor: p.page }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <FeedbackHeader
          topInset={insets.top}
          onBack={() => navigation.goBack()}
          historyLabel={history.length > 0 ? `My reports · ${history.length}` : undefined}
          onHistory={() => scrollRef.current?.scrollTo({ y: historyY.current, animated: true })}
        />

        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.content}
        >
          <Text style={[k.title, { color: p.ink }, ff(font.display, '800')]}>
            What went wrong?
          </Text>

          <View style={s.row}>
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

          <View>
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
          </View>

          {/* Screenshots */}
          <View style={s.shotsRow}>
            {screenshots.length < 3 ? (
              <Pressable
                onPress={handleAddScreenshot}
                disabled={pickingPhoto}
                accessibilityRole="button"
                accessibilityLabel="Add screenshot"
                style={({ pressed }) => [
                  s.addShot,
                  { backgroundColor: p.card, borderColor: p.isDark ? p.border : '#C9D4CE', opacity: pressed ? 0.7 : 1 },
                ]}
              >
                {pickingPhoto ? (
                  <ActivityIndicator size="small" color={p.primary} />
                ) : (
                  <Feather name="camera" size={20} color={p.isDark ? LIME : FOREST} />
                )}
              </Pressable>
            ) : null}
            {screenshots.map((uri, idx) => (
              <View key={idx} style={s.thumb}>
                <Image source={{ uri }} style={s.thumbImage} resizeMode="cover" />
                <Pressable
                  onPress={() => handleRemoveScreenshot(idx)}
                  style={[s.removeBtn, { backgroundColor: p.isDark ? '#FFFFFF' : '#0B1F17' }]}
                  hitSlop={8}
                  accessibilityLabel="Remove screenshot"
                >
                  <Feather name="x" size={12} color={p.isDark ? '#0B1F17' : '#FFFFFF'} />
                </Pressable>
              </View>
            ))}
            <Text style={[s.shotsCount, { color: p.muted }, ff(font.semi, '600')]}>
              Screenshots · {screenshots.length}/3
            </Text>
          </View>

          {/* Device info */}
          <View
            style={[s.deviceRow, { backgroundColor: p.card, borderColor: p.border }]}
          >
            <View style={[s.deviceIcon, { backgroundColor: p.soft }]}>
              <Feather name="smartphone" size={17} color={p.isDark ? LIME : FOREST} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.deviceTitle, { color: p.ink }, ff(font.bold, '700')]}>Include device info</Text>
              <Text style={[s.deviceSub, { color: p.muted }, ff(font.body, '500')]} numberOfLines={1}>
                v{version} · {phone} · {themeLabel}
              </Text>
            </View>
            <FormSwitch value={includeDevice} onValueChange={setIncludeDevice} label="Include device info" />
          </View>

          {errorText ? (
            <Animated.View entering={FadeIn.duration(200)} style={k.errorRow}>
              <Feather name="alert-circle" size={14} color={p.danger} />
              <Text style={[k.errorText, { color: p.danger }, ff(font.semi, '600')]}>{errorText}</Text>
            </Animated.View>
          ) : null}

          {/* Past reports */}
          {history.length > 0 && (
            <View onLayout={(e) => (historyY.current = e.nativeEvent.layout.y)}>
              <View style={k.historyHead}>
                <Text style={[k.historyTitle, { color: p.ink }, ff(font.bold, '700')]}>My reports</Text>
                <Text style={[k.historyCount, { color: p.muted }, ff(font.semi, '600')]}>{history.length}</Text>
              </View>
              <View style={[k.historyCard, { backgroundColor: p.card, borderColor: p.border }]}>
                {history.map((h, i) => {
                  const badge = getStatusInfo(h.status, p.isDark);
                  const last = i === history.length - 1;
                  return (
                    <Pressable
                      key={h.id}
                      onPress={() => setOpenReport(h)}
                      accessibilityRole="button"
                      accessibilityLabel={`${h.title}, ${badge.label}`}
                      style={({ pressed }) => [
                        s.historyRow,
                        !last && { borderBottomWidth: 1, borderBottomColor: p.divider },
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={s.historyTop}>
                          <Text style={[s.historyName, { color: p.ink }, ff(font.bold, '700')]} numberOfLines={1}>
                            {h.title}
                          </Text>
                          <View style={[s.badge, { backgroundColor: badge.bg }]}>
                            <Text style={[s.badgeText, { color: badge.fg }, ff(font.bold, '700')]}>{badge.label}</Text>
                          </View>
                        </View>
                        <View style={s.metaLine}>
                          <Text style={[s.historyMeta, { color: p.muted }, ff(font.body, '500')]} numberOfLines={1}>
                            {[
                              h.area,
                              PRIORITIES.find((x) => x.key === h.priority)?.label,
                              format(new Date(h.sentAt), 'd MMM'),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                          {h.adminNotes ? (
                            <View style={s.replied}>
                              <Feather name="message-circle" size={12} color={p.isDark ? LIME : FOREST} />
                              <Text style={[s.repliedText, { color: p.isDark ? LIME : FOREST }, ff(font.bold, '700')]}>
                                Team replied
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <Feather name="chevron-right" size={18} color={p.muted} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>

        <SendButton label="Send report" ready={ready} sending={sending} onPress={send} bottomInset={insets.bottom} />
      </KeyboardAvoidingView>

      <ReportDetailSheet
        report={openReport}
        onClose={() => setOpenReport(null)}
        onUpdated={(updated) => {
          setOpenReport(updated);
          setHistory((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
        }}
      />
    </View>
  );
};

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24, gap: 14 },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },

  shotsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addShot: {
    width: 64,
    height: 64,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: { width: 64, height: 64 },
  thumbImage: { width: 64, height: 64, borderRadius: 16 },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shotsCount: { flex: 1, fontSize: 13, textAlign: 'right' },

  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  deviceIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deviceTitle: { fontSize: 14 },
  deviceSub: { fontSize: 12, marginTop: 1 },

  historyRow: { paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyName: { flex: 1, fontSize: 14.5 },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11 },
  historyMeta: { fontSize: 12.5, flexShrink: 1 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  replied: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  repliedText: { fontSize: 12 },
});
