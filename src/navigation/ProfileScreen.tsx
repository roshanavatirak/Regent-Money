import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Constants from 'expo-constants';
import * as Font from 'expo-font';
import { useTheme, useAuthStore } from '../store';
import { authService } from '../services/authService';
import { pickImageFromDevice, LUXURY_PRESET_AVATARS } from '../services/imageService';
import { occupationLabel } from '../constants/occupations';
import { useMoneyCycle } from '../hooks/useMoneyCycle';
import { ordinal } from '../utils/cycleLabels';


export interface ProfileScreenProps {
  AppTopBarComponent?: React.ComponentType;
}

const FOREST = '#0B3D2C';
const FOREST_RAISED = '#124B37';
const LIME = '#B8F36B';
const MIST = '#B5CEC1';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Accepts DD/MM/YYYY, DD-MM-YYYY or an ISO date string. */
const parseDob = (dob?: string | null): Date | null => {
  if (!dob) return null;
  const m = dob.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(dob);
  return isNaN(d.getTime()) ? null : d;
};

const ageFrom = (d: Date | null) => {
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday =
    now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
};

const titleCase = (s?: string | null) =>
  (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const providerLabel = (p?: string | null) => {
  if (!p || p === 'local' || p === 'email') return 'email';
  return titleCase(p);
};
/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ AppTopBarComponent }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((state) => state.user);
  const { colors, isDark } = useTheme();

  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [avatarError, setAvatarError] = useState('');

  useEffect(() => {
    authService.fetchProfile();
  }, []);

  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const styles = useMemo(() => getStyles(colors, isDark, display), [colors, isDark, display]);

  const dobDate = parseDob(user?.dob);
  const age = ageFrom(dobDate);
  const income = user?.currentIncome ? Number(user.currentIncome) : null;
  const sources = user?.incomeSourcesCount || (income ? 1 : 0);
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : null;
  const appVersion = Constants.expoConfig?.version;

  // A glance, not a form: what you do and your age, shown once inside the card.
  const identity = [user?.occupation ? occupationLabel(user.occupation) : null, age !== null ? `${age} yrs` : null].filter(
    (t): t is string => !!t
  );

  /* ---------------- Pay facts ---------------- */

  const { cycle } = useMoneyCycle();
  const payLabel =
    cycle.mode === 'salary'
      ? (cycle.payday ?? 1) >= 31
        ? 'Month end'
        : `${ordinal(cycle.payday ?? 1)}`
      : cycle.mode === 'weekly'
        ? 'Weekly'
        : cycle.mode === 'fortnightly'
          ? 'Every 2 wks'
          : cycle.mode === 'rolling'
            ? 'Not fixed'
            : 'Not set';
  const paid = cycle.mode === 'salary' || cycle.mode === 'weekly' || cycle.mode === 'fortnightly';

  // What's still missing, for the "Finish your profile" nudge (nothing shows once it's complete).
  const missing = [
    !income ? 'monthly income' : null,
    !user?.occupation ? 'occupation' : null,
    cycle.mode === 'calendar' && income && user?.occupation ? 'salary day' : null,
    !dobDate ? 'date of birth' : null,
    !user?.gender ? 'gender' : null,
  ].filter((t): t is string => !!t);
  const nextPayLabel = !paid
    ? '–'
    : cycle.lateDays > 0
      ? `${cycle.lateDays}d late`
      : cycle.daysLeft === 0
        ? 'Due'
        : cycle.daysLeft === 1
          ? 'Tomorrow'
          : `In ${cycle.daysLeft} days`;

  /* ---------------- Avatar actions ---------------- */

  const closeAvatarSheet = () => {
    setAvatarModalVisible(false);
    setAvatarError('');
    setCustomAvatarUrl('');
  };

  const handlePickFromGallery = async () => {
    setAvatarUploading(true);
    setAvatarError('');
    try {
      const fileData = await pickImageFromDevice();
      if (fileData) {
        await authService.uploadAvatar(fileData);
        closeAvatarSheet();
      }
    } catch (err: any) {
      setAvatarError(`Upload failed. ${err?.message || 'Try a different photo.'}`);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSelectPresetAvatar = async (url: string) => {
    setAvatarUploading(true);
    setAvatarError('');
    try {
      await authService.updateProfile({ avatarUrl: url });
      closeAvatarSheet();
    } catch (err: any) {
      setAvatarError('Could not update your photo. Try again.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSaveCustomUrl = async () => {
    const url = customAvatarUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      setAvatarError('Use a link that starts with https://');
      return;
    }
    setAvatarUploading(true);
    setAvatarError('');
    try {
      await authService.updateProfile({ avatarUrl: url });
      closeAvatarSheet();
    } catch {
      setAvatarError('Could not use that link. Check it and try again.');
    } finally {
      setAvatarUploading(false);
    }
  };


  return (
    <View style={styles.container}>
      {AppTopBarComponent ? <AppTopBarComponent /> : null}

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.hero}>
          <View>
            <Pressable
              onPress={() => setAvatarModalVisible(true)}
              style={styles.avatarRing}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>{user?.name?.charAt(0).toUpperCase() || 'U'}</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              onPress={() => setAvatarModalVisible(true)}
              style={styles.cameraBadge}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
            >
              <Feather name="camera" size={14} color={isDark ? FOREST : LIME} />
            </Pressable>
          </View>

          <Text style={styles.name} numberOfLines={1}>
            {user?.name || 'Your name'}
          </Text>
          <Text style={styles.email} numberOfLines={1}>
            {user?.email || user?.phone || 'Not signed in'}
          </Text>

          <View style={styles.metaRow}>
            {memberSince ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaText}>Member since {memberSince}</Text>
              </View>
            ) : null}
            <View style={styles.metaChip}>
              <Text style={styles.metaText}>Signed in with {providerLabel(user?.authProvider)}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Money profile */}
        <Animated.View entering={FadeInDown.delay(90).duration(400)}>
          <View style={styles.moneyCard}>
            <View style={[styles.ring, { width: 200, height: 200, borderRadius: 100, right: -70, top: -90 }]} />
            <View
              style={[
                styles.ring,
                { width: 120, height: 120, borderRadius: 60, right: -30, top: -50, borderColor: 'rgba(184, 243, 107, 0.24)' },
              ]}
            />
            <View style={styles.moneyTop}>
              <Text style={styles.moneyLabel}>Your money profile</Text>
              {/* The one way into Edit profile from this screen. */}
              <TouchableOpacity
                onPress={() => navigation.navigate('EditProfile')}
                style={styles.editPill}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
              >
                <Feather name="edit-2" size={13} color={FOREST} />
                <Text style={styles.editPillText}>Edit</Text>
              </TouchableOpacity>
            </View>
            {income ? (
              <View style={styles.incomeRow}>
                <Text style={styles.moneyValue}>₹{income.toLocaleString('en-IN')}</Text>
                <Text style={styles.perMonth}>a month</Text>
              </View>
            ) : (
              <Text style={[styles.moneyValue, { fontSize: 22, color: LIME }]}>Income not added</Text>
            )}
            {identity.length > 0 ? (
              <View style={styles.identityRow}>
                {identity.map((t) => (
                  <View key={t} style={styles.identityChip}>
                    <Text style={styles.identityText} numberOfLines={1}>
                      {t}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.statGrid}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Sources</Text>
                <Text style={styles.statValue}>{sources || '–'}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Paid</Text>
                <Text style={styles.statValue} numberOfLines={1}>
                  {payLabel}
                </Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Next pay</Text>
                <Text style={styles.statValue} numberOfLines={1}>
                  {nextPayLabel}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Only when something is missing: what to add, one tap to Edit profile. */}
        {missing.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(160).duration(400)}>
            <TouchableOpacity
              onPress={() => navigation.navigate('EditProfile', missing.includes('salary day') ? { focus: 'salaryDay' } : undefined)}
              activeOpacity={0.8}
              style={styles.nudge}
              accessibilityRole="button"
            >
              <View style={styles.nudgeIcon}>
                <Feather name="plus" size={16} color={isDark ? LIME : FOREST} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nudgeTitle}>Finish your profile</Text>
                <Text style={styles.nudgeText} numberOfLines={2}>
                  Add your {missing.join(', ')} for budgets that fit you.
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={isDark ? '#5E7A6C' : '#9DB2A7'} />
            </TouchableOpacity>
          </Animated.View>
        ) : null}

        {/* Settings, privacy, help and log out are in the sidebar. */}
        <Text style={styles.studio}>RAO DEV STUDIOS</Text>
      </ScrollView>

      {/* Change photo sheet */}
      <Modal
        visible={avatarModalVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={closeAvatarSheet}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeAvatarSheet} accessibilityLabel="Close" />
          <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
              <View style={styles.grabber} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Change profile photo</Text>
                <TouchableOpacity onPress={closeAvatarSheet} style={styles.closeBtn} accessibilityLabel="Close">
                  <Feather name="x" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.galleryBtn}
                onPress={handlePickFromGallery}
                disabled={avatarUploading}
                activeOpacity={0.85}
              >
                {avatarUploading ? (
                  <ActivityIndicator size="small" color={isDark ? FOREST : LIME} />
                ) : (
                  <Feather name="image" size={18} color={isDark ? FOREST : LIME} />
                )}
                <Text style={styles.galleryText}>{avatarUploading ? 'Uploading…' : 'Choose from gallery'}</Text>
              </TouchableOpacity>

              <Text style={styles.sheetLabel}>Or pick an avatar</Text>
              <View style={styles.presetGrid}>
                {LUXURY_PRESET_AVATARS.map((preset) => {
                  const active = user?.avatarUrl === preset.url;
                  return (
                    <TouchableOpacity
                      key={preset.id}
                      style={styles.presetItem}
                      onPress={() => handleSelectPresetAvatar(preset.url)}
                      disabled={avatarUploading}
                      activeOpacity={0.8}
                      accessibilityLabel={`Use ${preset.name} avatar`}
                    >
                      <View style={[styles.presetRing, active && { borderColor: isDark ? LIME : FOREST }]}>
                        <Image source={{ uri: preset.url }} style={styles.presetImg} />
                      </View>
                      <Text style={styles.presetName} numberOfLines={1}>{preset.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sheetLabel}>Or use a link</Text>
              <View style={styles.urlRow}>
                <TextInput
                  style={styles.urlInput}
                  placeholder="https://"
                  placeholderTextColor={colors.textSecondary}
                  value={customAvatarUrl}
                  onChangeText={(t) => {
                    setCustomAvatarUrl(t);
                    if (avatarError) setAvatarError('');
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  accessibilityLabel="Photo link"
                />
                <TouchableOpacity
                  style={[styles.urlBtn, (!customAvatarUrl.trim() || avatarUploading) && { opacity: 0.5 }]}
                  onPress={handleSaveCustomUrl}
                  disabled={!customAvatarUrl.trim() || avatarUploading}
                >
                  <Text style={styles.urlBtnText}>Use</Text>
                </TouchableOpacity>
              </View>

              {avatarError ? <Text style={styles.errorText}>{avatarError}</Text> : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const getStyles = (colors: any, isDark: boolean, display?: string) => {
  const bg = isDark ? colors.background : '#F3F6F4';
  const line = isDark ? colors.border : '#E1E9E4';
  const displayFont = { fontFamily: display, fontWeight: display ? undefined : ('800' as const) };

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: bg },

    // Identity
    hero: { alignItems: 'center', paddingTop: 28, paddingHorizontal: 20 },
    avatarRing: {
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 2,
      borderColor: isDark ? LIME : FOREST,
      padding: 3,
    },
    avatarImg: { width: '100%', height: '100%', borderRadius: 45 },
    avatarFallback: {
      flex: 1,
      borderRadius: 45,
      backgroundColor: isDark ? 'rgba(184, 243, 107, 0.14)' : '#E3F2E8',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: { fontSize: 34, color: isDark ? LIME : FOREST, ...displayFont },
    cameraBadge: {
      position: 'absolute',
      right: -2,
      bottom: 0,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: isDark ? LIME : FOREST,
      borderWidth: 3,
      borderColor: bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    name: { fontSize: 26, letterSpacing: -0.6, color: colors.text, marginTop: 14, ...displayFont },
    email: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 12 },
    metaChip: {
      borderWidth: 1,
      borderColor: line,
      backgroundColor: colors.card,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    metaText: { fontSize: 12, color: colors.textSecondary },

    // Money card
    moneyCard: {
      marginHorizontal: 16,
      marginTop: 24,
      backgroundColor: FOREST,
      borderRadius: 26,
      padding: 20,
      overflow: 'hidden',
    },
    ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(184, 243, 107, 0.18)' },
    moneyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    moneyLabel: { fontSize: 13, color: MIST, fontWeight: '600' },
    moneyEdit: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    moneyValue: { fontSize: 36, letterSpacing: -1, color: '#FFFFFF', marginTop: 2, ...displayFont },
    statGrid: { flexDirection: 'row', gap: 8, marginTop: 16 },
    stat: { flex: 1, backgroundColor: FOREST_RAISED, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
    statLabel: { fontSize: 11, color: MIST },
    statValue: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginTop: 2 },
editPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: LIME, borderRadius: 999, height: 34, paddingHorizontal: 14 },    editPillText: { fontSize: 13, fontWeight: '700', color: FOREST },    incomeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },    perMonth: { fontSize: 14, color: MIST, fontWeight: '600' },    identityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },    identityChip: { borderWidth: 1, borderColor: 'rgba(181, 206, 193, 0.4)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '70%' },    identityText: { fontSize: 12.5, color: '#E4EFE9', fontWeight: '600' },    nudge: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: line, borderStyle: 'dashed', borderRadius: 20, padding: 14 },    nudgeIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(184, 243, 107, 0.14)' : '#E3F2E8' },    nudgeTitle: { fontSize: 14.5, fontWeight: '700', color: colors.text },    nudgeText: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },

    // Sections
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 22,
      paddingTop: 26,
      paddingBottom: 8,
    },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
    sectionTitleSolo: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 8 },
    sectionLink: { fontSize: 13, fontWeight: '600', color: isDark ? LIME : '#0B6B3A' },
    group: {
      marginHorizontal: 16,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: line,
      borderRadius: 20,
      overflow: 'hidden',
    },

    // Rows
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, minHeight: 56 },
    rowIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    rowBody: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingRight: 14,
      alignSelf: 'stretch',
    },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line },
    rowTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
    rowSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    rowValue: { fontSize: 14, color: colors.textSecondary, maxWidth: 160 },
    version: { textAlign: 'center', fontSize: 12, color: colors.textSecondary, marginTop: 14 },
    // Quiet sign-off: light weight, wide tracking, soft colour.
    studio: { textAlign: 'center', fontSize: 10.5, fontWeight: '300', letterSpacing: 4, color: colors.textSecondary, opacity: 0.7, marginTop: 18 },

    // Photo sheet
    backdrop: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 10,
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    grabber: {
      width: 40,
      height: 5,
      borderRadius: 3,
      alignSelf: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.18)' : '#D5DED9',
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
    sheetTitle: { fontSize: 22, letterSpacing: -0.4, color: colors.text, ...displayFont },
    closeBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    galleryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 54,
      borderRadius: 27,
      backgroundColor: isDark ? LIME : FOREST,
      marginTop: 18,
    },
    galleryText: { fontSize: 15, fontWeight: '700', color: isDark ? FOREST : LIME },
    sheetLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 22, marginBottom: 12 },
    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 },
    presetItem: { width: '25%', alignItems: 'center', gap: 6 },
    presetRing: { width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: 'transparent', padding: 2 },
    presetImg: { width: '100%', height: '100%', borderRadius: 28 },
    presetName: { fontSize: 12, color: colors.text, maxWidth: 72 },
    urlRow: { flexDirection: 'row', gap: 8 },
    urlInput: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: line,
      backgroundColor: bg,
      paddingHorizontal: 14,
      fontSize: 14,
      color: colors.text,
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
    },
    urlBtn: {
      height: 48,
      paddingHorizontal: 20,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    urlBtnText: { fontSize: 14, fontWeight: '700', color: colors.text },
    errorText: { color: isDark ? '#FFA8A8' : '#C92A2A', fontSize: 13, marginTop: 10 },
  });
};