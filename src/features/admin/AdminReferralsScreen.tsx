// src/features/admin/AdminReferralsScreen.tsx
//
// Admin: where new users came from (friend invites, campaigns, ads, organic),
// who invites the most, invites held for review, and campaign links.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Share } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { attributionService, AttributionOverview } from '../../services/attributionService';
import { showGlobalConfirm } from '../../store';
import { useAdminTheme, ff, AdminHeader, Segmented, SectionLabel, Pill, FOREST, LIME, MIST, HeroRings } from './adminTheme';

type Range = '7' | '30' | '0';

const SOURCE_LABELS: Record<string, string> = {
  invite: 'Friend invites',
  campaign: 'Campaigns',
  paid_ads: 'Google ads',
  organic: 'Organic',
  external: 'Other links',
  unknown: 'Unknown',
};

export const AdminReferralsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { p, font } = useAdminTheme();

  const [range, setRange] = useState<Range>('30');
  const [data, setData] = useState<AttributionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErrorText('');
    try {
      setData(await attributionService.getOverview(Number(range)));
    } catch (e: any) {
      setErrorText(e?.message || 'Couldn’t load tracking. Try again.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  };

  const resolve = (userId: string, label: string, count: number, approve: boolean) => {
    showGlobalConfirm({
      title: approve ? `Count ${count} held invites?` : `Reject ${count} held invites?`,
      message: approve
        ? `They’ll be added to ${label}’s joined total.`
        : `They won’t count for ${label}. This is recorded in the audit log.`,
      confirmText: approve ? 'Count them' : 'Reject them',
      cancelText: 'Cancel',
      isDestructive: !approve,
      icon: approve ? 'check' : 'x',
      onConfirm: async () => {
        setBusyId(userId);
        try {
          await attributionService.resolveReview(userId, approve);
          await load();
        } catch (e: any) {
          setErrorText(e?.message || 'Couldn’t save your decision. Try again.');
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  const createCampaign = async () => {
    if (creating) return;
    setFormError('');
    if (name.trim().length < 3) return setFormError('Give the campaign a name.');
    if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(code.trim().toLowerCase())) {
      return setFormError('Link code: 3 to 40 letters, numbers or hyphens.');
    }
    setCreating(true);
    try {
      await attributionService.createCampaign({ name: name.trim(), code: code.trim().toLowerCase(), channel: channel.trim() || undefined });
      setName('');
      setCode('');
      setChannel('');
      await load();
    } catch (e: any) {
      setFormError(e?.message || 'Couldn’t create the campaign link. Try again.');
    } finally {
      setCreating(false);
    }
  };

  const toggleCampaign = async (id: string, isActive: boolean) => {
    setBusyId(id);
    try {
      await attributionService.setCampaignActive(id, isActive);
      await load();
    } catch (e: any) {
      setErrorText(e?.message || 'Couldn’t update the campaign. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const totalUsers = (data?.sources || []).reduce((sum, row) => sum + row.users, 0);
  const funnel = data?.funnel;

  const input = [s.input, { borderColor: p.line, backgroundColor: p.soft, color: p.text }, ff(font.body, '500')];

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: p.bg }}>
      <AdminHeader
        title="Referrals"
        onRefresh={load}
        refreshing={loading}
        leading={
          <TouchableOpacity
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            activeOpacity={0.7}
            style={[s.iconBtn, { borderColor: p.line, backgroundColor: p.card }]}
          >
            <Feather name="arrow-left" size={18} color={p.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
      >
        <Segmented<Range>
          value={range}
          onChange={setRange}
          options={[
            { id: '7', label: '7 days' },
            { id: '30', label: '30 days' },
            { id: '0', label: 'All time' },
          ]}
        />

        {errorText ? (
          <View style={[s.banner, { backgroundColor: p.tint.coral.bg }]}>
            <Text style={[s.bannerText, { color: p.tint.coral.fg }, ff(font.bodySemi, '600')]}>{errorText}</Text>
          </View>
        ) : null}

        {data && !data.integrityConfigured ? (
          <View style={[s.banner, { backgroundColor: p.tint.amber.bg }]}>
            <Feather name="alert-triangle" size={16} color={p.tint.amber.fg} />
            <Text style={[s.bannerText, { color: p.tint.amber.fg }, ff(font.bodySemi, '600')]}>
              Google Play Integrity isn’t set up on the server. Invite and campaign installs are held as unverified and
              aren’t counted until it is.
            </Text>
          </View>
        ) : null}

        {/* Invite funnel */}
        <View style={s.hero}>
          <HeroRings big={200} small={120} />
          <Text style={[s.heroLabel, ff(font.bodySemi, '600')]}>Friend invites</Text>
          <View style={s.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={[s.heroValue, ff(font.display, '800')]}>{funnel?.opens ?? 0}</Text>
              <Text style={[s.heroSub, ff(font.body, '500')]}>Link opens</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.heroValue, { color: LIME }, ff(font.display, '800')]}>{funnel?.joined ?? 0}</Text>
              <Text style={[s.heroSub, ff(font.body, '500')]}>Joined</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.heroValue, ff(font.display, '800')]}>{funnel?.review ?? 0}</Text>
              <Text style={[s.heroSub, ff(font.body, '500')]}>In review</Text>
            </View>
          </View>
          <Text style={[s.heroFoot, ff(font.body, '500')]}>
            {funnel?.rejected ?? 0} rejected · {funnel?.unverified ?? 0} waiting for Google’s check
          </Text>
        </View>

        {/* Sources */}
        <SectionLabel>Where new users came from</SectionLabel>
        <View style={[s.card, { backgroundColor: p.card, borderColor: p.line }]}>
          {(data?.sources || []).length === 0 ? (
            <Text style={[s.empty, { color: p.sub }, ff(font.body, '500')]}>
              {loading ? 'Loading…' : 'No installs recorded in this period.'}
            </Text>
          ) : (
            data!.sources.map((row, i) => {
              const share = totalUsers ? row.users / totalUsers : 0;
              return (
                <View key={row.sourceType} style={[s.sourceRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.divider }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rowTitle, { color: p.text }, ff(font.bodySemi, '600')]}>
                      {SOURCE_LABELS[row.sourceType] || row.sourceType}
                    </Text>
                    <View style={[s.track, { backgroundColor: p.soft }]}>
                      <View style={[s.fill, { backgroundColor: p.segActive, width: `${Math.max(2, Math.round(share * 100))}%` }]} />
                    </View>
                  </View>
                  <Text style={[s.count, { color: p.text }, ff(font.displayBold, '700')]}>{row.users}</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Leaderboard */}
        <SectionLabel>Top inviters</SectionLabel>
        <View style={[s.card, { backgroundColor: p.card, borderColor: p.line }]}>
          {(data?.inviters || []).length === 0 ? (
            <Text style={[s.empty, { color: p.sub }, ff(font.body, '500')]}>
              {loading ? 'Loading…' : 'No invites have been counted yet.'}
            </Text>
          ) : (
            data!.inviters.map((row, i) => {
              const label = row.name || row.email || 'This user';
              return (
                <View key={row.userId} style={[s.inviter, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.divider }]}>
                  <View style={s.inviterTop}>
                    <View style={[s.rank, { backgroundColor: i === 0 ? LIME : p.soft }]}>
                      <Text style={[{ fontSize: 12, color: i === 0 ? FOREST : p.text }, ff(font.bodyBold, '700')]}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.rowTitle, { color: p.text }, ff(font.bodySemi, '600')]} numberOfLines={1}>
                        {label}
                      </Text>
                      <Text style={[s.rowSub, { color: p.sub }, ff(font.body, '500')]} numberOfLines={1}>
                        {row.rejected > 0 ? `${row.rejected} rejected · ` : ''}code {row.code}
                      </Text>
                    </View>
                    <Text style={[s.count, { color: p.text }, ff(font.displayBold, '700')]}>{row.joined}</Text>
                  </View>

                  {row.review > 0 ? (
                    <View style={s.reviewRow}>
                      <Pill tint={p.tint.amber} label={`${row.review} held for review`} font={font} small />
                      <View style={{ flex: 1 }} />
                      {busyId === row.userId ? (
                        <ActivityIndicator size="small" color={p.segActive} />
                      ) : (
                        <>
                          <TouchableOpacity
                            onPress={() => resolve(row.userId, label, row.review, false)}
                            accessibilityRole="button"
                            style={[s.smallBtn, { borderColor: p.dangerLine }]}
                          >
                            <Text style={[{ fontSize: 12.5, color: p.danger }, ff(font.bodyBold, '700')]}>Reject</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => resolve(row.userId, label, row.review, true)}
                            accessibilityRole="button"
                            style={[s.smallBtn, { borderColor: p.line, backgroundColor: p.soft }]}
                          >
                            <Text style={[{ fontSize: 12.5, color: p.text }, ff(font.bodyBold, '700')]}>Count</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        {/* Campaigns */}
        <SectionLabel>Campaign links</SectionLabel>
        <View style={[s.card, { backgroundColor: p.card, borderColor: p.line, padding: 16, gap: 10 }]}>
          <Text style={[s.rowSub, { color: p.sub }, ff(font.body, '500')]}>
            Use one link per ad, post or partner to see which brings installs.
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Diwali Instagram reel"
            placeholderTextColor={p.muted}
            accessibilityLabel="Campaign name"
            maxLength={80}
            style={input}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="diwali-insta"
              placeholderTextColor={p.muted}
              accessibilityLabel="Link code"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={40}
              style={[input, { flex: 1 }]}
            />
            <TextInput
              value={channel}
              onChangeText={setChannel}
              placeholder="instagram"
              placeholderTextColor={p.muted}
              accessibilityLabel="Channel"
              autoCapitalize="none"
              maxLength={40}
              style={[input, { flex: 1 }]}
            />
          </View>
          {formError ? <Text style={[{ fontSize: 12.5, color: p.danger }, ff(font.bodySemi, '600')]}>{formError}</Text> : null}
          <TouchableOpacity
            onPress={createCampaign}
            accessibilityRole="button"
            activeOpacity={0.85}
            style={[s.createBtn, { backgroundColor: p.segActive }]}
          >
            {creating ? (
              <ActivityIndicator size="small" color={p.segActiveText} />
            ) : (
              <Text style={[{ fontSize: 14, color: p.segActiveText }, ff(font.bodyBold, '700')]}>Create link</Text>
            )}
          </TouchableOpacity>
        </View>

        {(data?.campaigns || []).length > 0 ? (
          <View style={[s.card, { backgroundColor: p.card, borderColor: p.line, marginTop: 10 }]}>
            {data!.campaigns.map((c, i) => (
              <View key={c.id} style={[s.inviter, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.divider }]}>
                <View style={s.inviterTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.rowTitle, { color: p.text }, ff(font.bodySemi, '600')]} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={[s.rowSub, { color: p.sub }, ff(font.body, '500')]} numberOfLines={1}>
                      {c.opens} opens · {c.joined} joined · {c.code}
                    </Text>
                  </View>
                  {c.isActive ? null : <Pill tint={p.tint.coral} label="Off" font={font} small />}
                </View>
                <View style={s.reviewRow}>
                  <View style={{ flex: 1 }} />
                  {busyId === c.id ? (
                    <ActivityIndicator size="small" color={p.segActive} />
                  ) : (
                    <>
                      <TouchableOpacity
                        onPress={() => toggleCampaign(c.id, !c.isActive)}
                        accessibilityRole="button"
                        style={[s.smallBtn, { borderColor: p.line }]}
                      >
                        <Text style={[{ fontSize: 12.5, color: p.text }, ff(font.bodyBold, '700')]}>
                          {c.isActive ? 'Turn off' : 'Turn on'}
                        </Text>
                      </TouchableOpacity>
                      {c.link ? (
                        <TouchableOpacity
                          onPress={() => Share.share({ message: c.link as string }).catch(() => {})}
                          accessibilityRole="button"
                          style={[s.smallBtn, { borderColor: p.line, backgroundColor: p.soft }]}
                        >
                          <Text style={[{ fontSize: 12.5, color: p.text }, ff(font.bodyBold, '700')]}>Share link</Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  )}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={[s.note, { color: p.sub }, ff(font.body, '500')]}>
          Totals count accepted installs from accounts that still exist. No IP addresses or device IDs are stored. Link
          opens older than 90 days that led to no install are deleted.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const s = StyleSheet.create({
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 16, padding: 14, marginTop: 12 },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18 },

  hero: { marginTop: 14, borderRadius: 24, backgroundColor: FOREST, padding: 20, overflow: 'hidden' },
  heroLabel: { color: MIST, fontSize: 12.5 },
  heroRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  heroValue: { color: '#FFFFFF', fontSize: 28, letterSpacing: -0.5 },
  heroSub: { color: MIST, fontSize: 12.5, marginTop: 2 },
  heroFoot: { color: MIST, fontSize: 12, marginTop: 14 },

  card: { borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  empty: { fontSize: 13.5, padding: 16 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  track: { height: 6, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  rowTitle: { fontSize: 14.5 },
  rowSub: { fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  count: { fontSize: 19, minWidth: 34, textAlign: 'right' },

  inviter: { paddingHorizontal: 16, paddingVertical: 12 },
  inviterTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  smallBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  input: { height: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, fontSize: 14 },
  createBtn: { height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 12.5, lineHeight: 18, marginTop: 16, paddingHorizontal: 4 },
});
