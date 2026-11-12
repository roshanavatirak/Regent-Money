// Admin page: daily email limits for the two Brevo senders (sign-in mail and broadcast mail)
// plus a test-send to check that delivery works.

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
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store';
import { adminService, EmailSystemOverview } from '../../services/adminService';
import { useAdminTheme, ff, FOREST, LIME, CORAL } from './adminTheme';

type Feedback = { type: 'success' | 'error'; message: string } | null;

export const AdminEmailConfigScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { p, font, isDark } = useAdminTheme();
  const accent = isDark ? LIME : FOREST;
  const user = useAuthStore((s) => s.user);

  const [data, setData] = useState<EmailSystemOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [testEmail, setTestEmail] = useState(user?.email || '');
  const [sending, setSending] = useState<'primary' | 'broadcast' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [savingFallback, setSavingFallback] = useState(false);
  const [fallbackError, setFallbackError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setData(await adminService.getEmailSystemOverview());
    } catch (err: any) {
      setLoadError(err?.message || "Couldn't load email limits.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    load();
  };

  const sendTest = async (type: 'primary' | 'broadcast') => {
    const to = testEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setFeedback({ type: 'error', message: 'Enter a valid email address.' });
      return;
    }
    setFeedback(null);
    setSending(type);
    try {
      const res = await adminService.sendTestEmail(type, to);
      setFeedback({
        type: res.success ? 'success' : 'error',
        message: res.success ? `Test email sent to ${to}` : res.message || "Test email didn't send.",
      });
      load();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || "Test email didn't send." });
    } finally {
      setSending(null);
    }
  };

  const fallback = data?.fallback;
  const toggleFallback = async (enabled: boolean) => {
    if (!data) return;
    const previous = data;
    setFallbackError(null);
    setSavingFallback(true);
    setData({ ...data, fallback: { ...(data.fallback || { available: true, signInReserve: 50 }), enabled } });
    try {
      await adminService.setEmailFallback(enabled);
      load();
    } catch (err: any) {
      setData(previous);
      setFallbackError(err?.message || "Couldn't save. Try again.");
    } finally {
      setSavingFallback(false);
    }
  };

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: p.bg }]}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <TouchableOpacity
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          activeOpacity={0.7}
          style={[styles.iconBtn, { borderColor: p.line, backgroundColor: p.card }]}
        >
          <Feather name="arrow-left" size={18} color={p.text} />
        </TouchableOpacity>
        <Text style={[styles.title, ff(font.displayBold, '700'), { color: p.text }]}>Email</Text>
        <TouchableOpacity
          onPress={refresh}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          activeOpacity={0.7}
          style={[styles.iconBtn, { borderColor: p.line, backgroundColor: p.card }]}
        >
          {refreshing ? <ActivityIndicator size="small" color={accent} /> : <Feather name="refresh-cw" size={16} color={p.text} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={p.text} colors={[FOREST]} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loadError && (
          <View style={[styles.notice, { backgroundColor: p.tint.coral.bg }]}>
            <Feather name="alert-circle" size={16} color={p.danger} />
            <Text style={[styles.noticeText, ff(font.bodySemi, '600'), { color: p.danger }]}>{loadError}</Text>
          </View>
        )}

        <Text style={[styles.section, ff(font.bodyBold, '700'), { color: p.muted }]}>Today's limits</Text>

        <QuotaCard
          icon="shield"
          title="Sign-in emails"
          caption="Verification and password reset"
          sender={data?.primary.senderEmail}
          configured={data?.primary.isConfigured}
          remaining={data?.primary.remainingToday}
          limit={data?.primary.dailyLimit}
          stats={
            data
              ? [
                  { label: 'Verifications', value: data.primary.verificationsToday },
                  { label: 'Resets', value: data.primary.passwordResetsToday },
                  ...(data.primary.sentViaFallbackToday
                    ? [{ label: 'Via backup', value: data.primary.sentViaFallbackToday }]
                    : []),
                ]
              : []
          }
          loading={loading}
          p={p}
          font={font}
          accent={accent}
        />

        <QuotaCard
          icon="send"
          title="Broadcast emails"
          caption="Announcements and updates"
          sender={data?.broadcast.senderEmail}
          configured={data?.broadcast.isConfigured}
          remaining={data?.broadcast.remainingToday}
          limit={data?.broadcast.dailyLimit}
          stats={
            data
              ? [
                  { label: 'Sent', value: data.broadcast.sentToday },
                  ...(data.primary.lentToBroadcastsToday
                    ? [{ label: 'Via backup', value: data.primary.lentToBroadcastsToday }]
                    : []),
                ]
              : []
          }
          loading={loading}
          p={p}
          font={font}
          accent={accent}
        />

        <Text style={[styles.footnote, ff(font.body, '500'), { color: p.muted }]}>
          Limits reset at 00:00 UTC (5:30 AM IST). Broadcasts pause at the limit and continue the next day.
        </Text>

        {/* Backup sending */}
        <Text style={[styles.section, ff(font.bodyBold, '700'), { color: p.muted }]}>Backup sending</Text>
        <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.cardTitle, ff(font.bodyBold, '700'), { color: p.text }]}>Share limits when one runs out</Text>
              <Text style={[styles.switchSub, ff(font.body, '500'), { color: p.sub }]}>
                {fallback && !fallback.available
                  ? 'Needs both senders set up.'
                  : `Sign-in emails can use the broadcast sender. Broadcasts can use the sign-in sender but always leave ${fallback?.signInReserve ?? 50} for sign-ins.`}
              </Text>
            </View>
            {savingFallback ? (
              <ActivityIndicator size="small" color={accent} style={styles.switchSpinner} />
            ) : (
              <Switch
                value={!!fallback?.enabled}
                onValueChange={toggleFallback}
                disabled={!data || !fallback || !fallback.available}
                trackColor={{ false: p.line, true: isDark ? LIME : FOREST }}
                thumbColor={Platform.OS === 'android' ? (fallback?.enabled ? (isDark ? FOREST : '#FFFFFF') : '#FFFFFF') : undefined}
                ios_backgroundColor={p.line}
                accessibilityLabel="Share limits when one runs out"
              />
            )}
          </View>
          {fallbackError && (
            <Text style={[styles.switchError, ff(font.bodySemi, '600'), { color: p.danger }]}>{fallbackError}</Text>
          )}
        </View>

        {/* Test send */}
        <Text style={[styles.section, ff(font.bodyBold, '700'), { color: p.muted }]}>Send a test</Text>
        <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}>
          <Text style={[styles.label, ff(font.bodySemi, '600'), { color: p.sub }]}>Send to</Text>
          <View style={[styles.inputRow, { backgroundColor: p.soft }]}>
            <Feather name="mail" size={15} color={p.muted} />
            <TextInput
              value={testEmail}
              onChangeText={(v) => {
                setTestEmail(v);
                setFeedback(null);
              }}
              placeholder="name@example.com"
              placeholderTextColor={p.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={[styles.input, ff(font.bodySemi, '600'), { color: p.text }]}
            />
          </View>

          {feedback && (
            <View style={[styles.notice, { backgroundColor: feedback.type === 'success' ? p.tint.green.bg : p.tint.coral.bg, marginTop: 12, marginBottom: 0 }]}>
              <Feather
                name={feedback.type === 'success' ? 'check-circle' : 'alert-circle'}
                size={15}
                color={feedback.type === 'success' ? p.tint.green.fg : p.danger}
              />
              <Text
                style={[styles.noticeText, ff(font.bodySemi, '600'), { color: feedback.type === 'success' ? p.tint.green.fg : p.danger }]}
              >
                {feedback.message}
              </Text>
            </View>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity
              onPress={() => sendTest('primary')}
              disabled={!!sending}
              activeOpacity={0.85}
              style={[styles.btn, { backgroundColor: FOREST }]}
            >
              {sending === 'primary' ? (
                <ActivityIndicator size="small" color={LIME} />
              ) : (
                <Text style={[styles.btnText, ff(font.bodyBold, '700'), { color: LIME }]}>Test sign-in</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => sendTest('broadcast')}
              disabled={!!sending}
              activeOpacity={0.85}
              style={[styles.btn, styles.btnGhost, { borderColor: p.line, backgroundColor: p.card }]}
            >
              {sending === 'broadcast' ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <Text style={[styles.btnText, ff(font.bodyBold, '700'), { color: p.text }]}>Test broadcast</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const QuotaCard: React.FC<{
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  caption: string;
  sender?: string;
  configured?: boolean;
  remaining?: number;
  limit?: number;
  stats: { label: string; value: number }[];
  loading: boolean;
  p: any;
  font: any;
  accent: string;
}> = ({ icon, title, caption, sender, configured, remaining, limit, stats, loading, p, font, accent }) => {
  const hasData = typeof remaining === 'number' && typeof limit === 'number';
  const pct = hasData ? Math.min(100, Math.round((remaining! / Math.max(1, limit!)) * 100)) : 0;
  const low = hasData && remaining! < Math.max(20, limit! * 0.1);
  return (
    <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line, marginBottom: 12 }]}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, { backgroundColor: p.soft }]}>
          <Feather name={icon} size={16} color={p.text} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.cardTitle, ff(font.bodyBold, '700'), { color: p.text }]}>{title}</Text>
          <Text style={[styles.cardCaption, ff(font.body, '500'), { color: p.muted }]} numberOfLines={1}>
            {caption}
          </Text>
        </View>
        {configured === false && (
          <View style={[styles.badge, { backgroundColor: p.tint.coral.bg }]}>
            <Text style={[styles.badgeText, ff(font.bodyBold, '700'), { color: p.danger }]}>Not set up</Text>
          </View>
        )}
      </View>

      <View style={styles.quotaRow}>
        <View>
          <Text style={[styles.big, ff(font.displayBold, '700'), { color: p.text }]}>
            {loading && !hasData ? '—' : hasData ? remaining!.toLocaleString() : '—'}
          </Text>
          <Text style={[styles.bigLabel, ff(font.body, '500'), { color: p.sub }]}>
            {hasData ? `of ${limit!.toLocaleString()} left today` : 'left today'}
          </Text>
        </View>
        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.label} style={styles.stat}>
              <Text style={[styles.statVal, ff(font.bodyBold, '700'), { color: p.text }]}>{s.value.toLocaleString()}</Text>
              <Text style={[styles.statLabel, ff(font.body, '500'), { color: p.muted }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.track, { backgroundColor: p.soft }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: low ? CORAL : accent }]} />
      </View>

      {!!sender && (
        <View style={[styles.senderRow, { borderTopColor: p.line }]}>
          <Text style={[styles.senderLabel, ff(font.body, '500'), { color: p.muted }]}>From</Text>
          <Text style={[styles.senderValue, ff(font.bodySemi, '600'), { color: p.sub }]} numberOfLines={1}>
            {sender}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  title: { flex: 1, fontSize: 22, letterSpacing: -0.3 },
  iconBtn: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16 },

  section: { fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', marginTop: 18, marginBottom: 10, marginLeft: 2 },
  footnote: { fontSize: 12, lineHeight: 17, marginTop: 2, marginHorizontal: 2 },

  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15 },
  cardCaption: { fontSize: 12, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11 },

  quotaRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 16 },
  big: { fontSize: 30, lineHeight: 34, fontVariant: ['tabular-nums'] },
  bigLabel: { fontSize: 12, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 18 },
  stat: { alignItems: 'flex-end' },
  statVal: { fontSize: 15, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, marginTop: 1 },
  track: { height: 6, borderRadius: 99, overflow: 'hidden', marginTop: 12 },
  fill: { height: '100%', borderRadius: 99 },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  senderLabel: { fontSize: 12 },
  senderValue: { flex: 1, fontSize: 12.5, textAlign: 'right' },

  label: { fontSize: 12.5, marginBottom: 7 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  switchSub: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  switchSpinner: { width: 51, height: 31 },
  switchError: { fontSize: 12, marginTop: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  input: { flex: 1, fontSize: 14, paddingVertical: 0 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 4 },
  noticeText: { flex: 1, fontSize: 12.5 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { borderWidth: 1 },
  btnText: { fontSize: 13.5 },
});
