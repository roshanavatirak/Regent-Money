// Admin page: one suggestion or bug report — status steps, message, screenshots,
// device details, and the team reply the sender sees in the app.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { format } from 'date-fns';
import { adminFeedbackService, AdminFeedbackItem, FeedbackUpdate } from '../../../services/adminFeedbackService';
import { KeyboardScreen } from '../../../components/KeyboardScreen';
import { useAdminTheme, ff, FOREST, LIME, MIST, HeroRings, IconTile, Pill } from '../adminTheme';
import { FeedbackUpdateSheet } from './FeedbackUpdateSheet';
import {
  STATUS_INFO,
  PRIORITY_LABEL,
  DONE_STATUSES,
  QUICK_REPLIES,
  priorityDot,
  kindMeta,
  initials,
  displayName,
  platformLabel,
} from './feedbackMeta';

const STEPS = ['open', 'investigating', 'in_progress', 'done'] as const;

export const AdminFeedbackDetailScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const id: string = route.params?.id;
  const { p, font, isDark } = useAdminTheme();
  const accent = isDark ? LIME : FOREST;

  const [item, setItem] = useState<AdminFeedbackItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState<'quiet' | 'notify' | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminFeedbackService.get(id);
      setLoadError(null);
      setItem(data);
      setReply(data.adminNotes || '');
    } catch (err: any) {
      setLoadError(err?.message || 'Couldn’t load this item.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    // Deferred so the first fetch's state updates don't run inside the effect body.
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  const saveUpdate = async (changes: FeedbackUpdate) => {
    const updated = await adminFeedbackService.update(id, changes);
    setItem(updated);
    setNotice({
      type: 'success',
      text: changes.notify ? 'Saved and sent to the user.' : 'Saved.',
    });
  };

  const sendReply = async (notify: boolean) => {
    const text = reply.trim();
    if (!text) {
      setNotice({ type: 'error', text: 'Write a reply first.' });
      return;
    }
    setSending(notify ? 'notify' : 'quiet');
    setNotice(null);
    try {
      const updated = await adminFeedbackService.update(id, { adminNotes: text, notify });
      setItem(updated);
      setReply(updated.adminNotes || '');
      setNotice({
        type: 'success',
        text: notify && updated.userId ? 'Reply sent. They’ll get a push.' : 'Reply saved. They’ll see it in the app.',
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Couldn’t save the reply.' });
    } finally {
      setSending(null);
    }
  };

  const topBar = (
    <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={[styles.roundBtn, { backgroundColor: p.card, borderColor: p.line }]}
      >
        <Feather name="chevron-left" size={22} color={p.text} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={[{ fontSize: 12, color: p.sub }, ff(font.bodySemi, '600')]}>
          {item ? kindMeta(item.kind, p).label : 'Feedback'}
        </Text>
        <Text numberOfLines={1} style={[{ fontSize: 13, color: p.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>
          {id ? `${id.slice(0, 6)}…${id.slice(-5)}` : ''}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => {
          Clipboard.setStringAsync(id).catch(() => {});
          setNotice({ type: 'success', text: 'ID copied.' });
        }}
        accessibilityRole="button"
        accessibilityLabel="Copy ID"
        style={[styles.roundBtn, { backgroundColor: p.card, borderColor: p.line }]}
      >
        <Feather name="copy" size={17} color={p.text} />
      </TouchableOpacity>
    </View>
  );

  if (loading || !item) {
    return (
      <View style={[styles.container, { backgroundColor: p.bg }]}>
        {topBar}
        <View style={styles.center}>
          {loading ? (
            <ActivityIndicator color={accent} />
          ) : (
            <>
              <Text style={[{ fontSize: 15, color: p.text, textAlign: 'center' }, ff(font.bodySemi, '600')]}>{loadError}</Text>
              <TouchableOpacity onPress={() => { setLoading(true); load(); }} style={[styles.pillBtn, { borderColor: p.line, marginTop: 14 }]}>
                <Text style={[{ fontSize: 14, color: p.text }, ff(font.bodyBold, '700')]}>Try again</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  const k = kindMeta(item.kind, p);
  const name = displayName(item.user?.name, item.user?.email);
  const firstName = name.split(' ')[0];
  const done = DONE_STATUSES.includes(item.status);
  const stepIndex = done ? 3 : STEPS.indexOf(item.status as any);
  const stepLabel = (s: (typeof STEPS)[number]) => (s === 'done' ? (done ? STATUS_INFO[item.status].label : 'Fixed') : STATUS_INFO[s].label);
  const replyDirty = reply.trim() !== (item.adminNotes || '').trim();
  const device = [
    { icon: 'smartphone' as const, label: 'Phone', value: platformLabel(item.platform, item.osVersion) },
    { icon: 'package' as const, label: 'App version', value: item.appVersion },
    { icon: 'moon' as const, label: 'Theme', value: item.theme ? item.theme[0].toUpperCase() + item.theme.slice(1) : null },
    { icon: 'clock' as const, label: 'Sent', value: format(new Date(item.createdAt), 'd MMM, h:mm a') },
  ];

  return (
    <View style={[styles.container, { backgroundColor: p.bg }]}>
      {topBar}
      <KeyboardScreen
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={accent} />}
        >
          {/* Title block */}
          <View style={{ paddingHorizontal: 4, gap: 10, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Pill tint={k.tint} label={item.area || k.short} font={font} />
              <Pill tint={{ bg: p.soft, fg: p.text }} dot={priorityDot(item.priority, isDark)} label={`${PRIORITY_LABEL[item.priority]} priority`} font={font} />
              {item.kind === 'feature' && item.impact ? <Pill tint={p.tint.lilac} label={item.impact} font={font} /> : null}
            </View>
            <Text style={[{ fontSize: 26, lineHeight: 31, color: p.text, letterSpacing: -0.5 }, ff(font.display, '800')]}>
              {item.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {item.user?.avatarUrl && !avatarFailed ? (
                <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} onError={() => setAvatarFailed(true)} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: FOREST, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={[{ fontSize: 13, color: LIME }, ff(font.bodyBold, '700')]}>{initials(item.user?.name, item.user?.email)}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[{ fontSize: 14, color: p.text }, ff(font.bodyBold, '700')]} numberOfLines={1}>{name}</Text>
                <Text style={[{ fontSize: 12, color: p.sub }, ff(font.body, '500')]} numberOfLines={1}>
                  {[item.user?.email && item.user?.name ? item.user.email : null, item.user ? `${item.user.reportCount} sent in total` : null]
                    .filter(Boolean)
                    .join(' · ') || 'No account linked'}
                </Text>
              </View>
            </View>
          </View>

          {/* Status */}
          <View style={styles.hero}>
            <HeroRings big={180} small={110} />
            <View style={styles.rowBetween}>
              <View>
                <Text style={[{ fontSize: 13, color: MIST }, ff(font.bodySemi, '600')]}>Status</Text>
                <Text style={[{ fontSize: 18, color: '#FFFFFF', marginTop: 2 }, ff(font.displayBold, '700')]}>
                  {STATUS_INFO[item.status].label}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setSheetKey((n) => n + 1);
                  setSheetOpen(true);
                }}
                accessibilityRole="button"
                style={styles.limeBtn}
              >
                <Text style={[{ fontSize: 13, color: FOREST }, ff(font.bodyBold, '700')]}>Change</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.steps}>
              {STEPS.map((s, i) => {
                const passed = i < stepIndex;
                const current = i === stepIndex;
                const muted = item.status === 'closed' && s === 'done';
                return (
                  <React.Fragment key={s}>
                    {i > 0 ? (
                      <View style={[styles.stepLine, { backgroundColor: i <= stepIndex ? LIME : 'rgba(181,206,193,0.3)' }]} />
                    ) : null}
                    <View style={styles.step}>
                      <View
                        style={[
                          styles.stepDot,
                          passed
                            ? { backgroundColor: LIME }
                            : current
                              ? { backgroundColor: muted ? MIST : '#FFFFFF', borderWidth: 5, borderColor: muted ? 'rgba(181,206,193,0.5)' : LIME }
                              : { borderWidth: 2, borderColor: 'rgba(181,206,193,0.4)' },
                        ]}
                      >
                        {passed ? <Feather name="check" size={12} color={FOREST} /> : null}
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[{ fontSize: 11, color: current ? '#FFFFFF' : MIST }, ff(current ? font.bodyBold : font.bodySemi, current ? '700' : '600')]}
                      >
                        {stepLabel(s)}
                      </Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          </View>

          {/* Message */}
          <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}>
            <Text style={[styles.h2, { color: p.text }, ff(font.displayBold, '700')]}>
              {item.kind === 'bug' ? 'What happened' : 'The idea'}
            </Text>
            <Text selectable style={[{ fontSize: 15, lineHeight: 22, color: p.text, marginTop: 8 }, ff(font.body, '500')]}>
              {item.description}
            </Text>
            {item.mediaUrls.length > 0 ? (
              <View style={styles.shots}>
                {item.mediaUrls.map((url, i) => (
                  <TouchableOpacity
                    key={url}
                    onPress={() => setViewer(url)}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Open screenshot ${i + 1}`}
                    style={[styles.shot, { borderColor: p.line, backgroundColor: p.soft }]}
                  >
                    <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {item.mediaPurged ? (
              <Note icon="trash-2" text="Screenshots were deleted 30 days after this was closed." color={p.sub} font={font} />
            ) : item.mediaUrls.length > 0 ? (
              <Note icon="clock" text="Screenshots are deleted 30 days after it’s fixed or closed." color={p.sub} font={font} />
            ) : null}
          </View>

          {/* Device */}
          <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}>
            <Text style={[styles.h2, { color: p.text }, ff(font.displayBold, '700')]}>Device</Text>
            <View style={styles.deviceGrid}>
              {device.map((d) => (
                <View key={d.label} style={styles.deviceItem}>
                  <IconTile tint={{ bg: p.soft, fg: accent }} size={36} radius={12}>
                    <Feather name={d.icon} size={16} color={accent} />
                  </IconTile>
                  <View style={{ flex: 1 }}>
                    <Text style={[{ fontSize: 12, color: p.sub }, ff(font.body, '500')]}>{d.label}</Text>
                    <Text numberOfLines={1} style={[{ fontSize: 14, color: p.text }, ff(font.bodySemi, '600')]}>
                      {d.value || 'Not sent'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Reply */}
          <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.h2, { color: p.text }, ff(font.displayBold, '700')]}>
                {item.userId ? `Reply to ${firstName}` : 'Team note'}
              </Text>
              <Text style={[{ fontSize: 12, color: p.sub }, ff(font.body, '500')]}>
                {item.kind === 'bug' ? 'Shown in their reports' : 'Shown in their ideas'}
              </Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
              {QUICK_REPLIES[item.kind].map((q) => (
                <TouchableOpacity
                  key={q}
                  onPress={() => setReply(q)}
                  style={[styles.quick, { backgroundColor: p.bg, borderColor: p.line }]}
                  accessibilityRole="button"
                >
                  <Text numberOfLines={1} style={[{ fontSize: 12, color: p.text, maxWidth: 220 }, ff(font.bodySemi, '600')]}>{q}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              value={reply}
              onChangeText={setReply}
              multiline
              maxLength={2000}
              placeholder={`Write a reply ${firstName} will see in the app…`}
              placeholderTextColor={p.muted}
              accessibilityLabel="Reply"
              textAlignVertical="top"
              style={[styles.replyInput, { backgroundColor: p.bg, borderColor: p.line, color: p.text }, ff(font.body, '500')]}
            />
            {notice ? (
              <View style={[styles.notice, { backgroundColor: notice.type === 'success' ? p.tint.green.bg : p.tint.coral.bg }]}>
                <Feather
                  name={notice.type === 'success' ? 'check-circle' : 'alert-circle'}
                  size={15}
                  color={notice.type === 'success' ? p.tint.green.fg : p.tint.coral.fg}
                />
                <Text style={[{ flex: 1, fontSize: 13, color: notice.type === 'success' ? p.tint.green.fg : p.tint.coral.fg }, ff(font.bodySemi, '600')]}>
                  {notice.text}
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => sendReply(false)}
                disabled={!!sending || !replyDirty}
                accessibilityRole="button"
                style={[styles.btn, { flex: 1, borderWidth: 1, borderColor: accent, opacity: !replyDirty ? 0.45 : 1 }]}
              >
                {sending === 'quiet' ? (
                  <ActivityIndicator color={accent} />
                ) : (
                  <Text style={[{ fontSize: 15, color: accent }, ff(font.bodyBold, '700')]}>Save, no push</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => sendReply(true)}
                disabled={!!sending || !replyDirty || !item.userId}
                accessibilityRole="button"
                style={[styles.btn, { flex: 1.4, backgroundColor: accent, opacity: !replyDirty || !item.userId ? 0.45 : 1 }]}
              >
                {sending === 'notify' ? (
                  <ActivityIndicator color={isDark ? FOREST : LIME} />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="send" size={16} color={isDark ? FOREST : LIME} />
                    <Text style={[{ fontSize: 15, color: isDark ? FOREST : LIME }, ff(font.bodyBold, '700')]}>Send reply</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
      </KeyboardScreen>

      <FeedbackUpdateSheet key={sheetKey} visible={sheetOpen} item={item} onClose={() => setSheetOpen(false)} onSave={saveUpdate} />

      {/* Screenshot viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)} accessibilityLabel="Close screenshot">
          {viewer ? <Image source={{ uri: viewer }} style={{ width: '100%', height: '85%' }} resizeMode="contain" /> : null}
          <View style={[styles.viewerClose, { top: Math.max(insets.top, 16) + 8 }]}>
            <Feather name="x" size={22} color="#FFFFFF" />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const Note: React.FC<{ icon: 'clock' | 'trash-2'; text: string; color: string; font: any }> = ({ icon, text, color, font }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
    <Feather name={icon} size={13} color={color} />
    <Text style={[{ flex: 1, fontSize: 12, color }, ff(font.body, '500')]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 8 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pillBtn: { height: 44, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  hero: { backgroundColor: FOREST, borderRadius: 22, paddingVertical: 16, paddingHorizontal: 18, marginTop: 16, overflow: 'hidden' },
  limeBtn: { height: 36, paddingHorizontal: 16, borderRadius: 999, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  steps: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 16 },
  step: { alignItems: 'center', gap: 6, minWidth: 54, maxWidth: 84 },
  stepDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, height: 2, marginTop: 10 },
  card: { borderRadius: 22, borderWidth: 1, padding: 16, marginTop: 12 },
  h2: { fontSize: 17 },
  shots: { flexDirection: 'row', gap: 8, marginTop: 14 },
  shot: { flex: 1, maxWidth: '33%', aspectRatio: 0.62, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  deviceGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, marginTop: 12 },
  deviceItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 8 },
  quick: { height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
  replyInput: { marginTop: 10, minHeight: 96, borderRadius: 16, borderWidth: 1, padding: 12, fontSize: 14, lineHeight: 20 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, marginTop: 10 },
  btn: { height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerClose: {
    position: 'absolute',
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
