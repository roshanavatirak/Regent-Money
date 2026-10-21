import React, { useState, useEffect, useMemo } from 'react';
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
import { useTheme, useAuthStore, showGlobalConfirm } from '../store';
import { authService } from '../services/authService';
import { pickImageFromDevice, LUXURY_PRESET_AVATARS } from '../services/imageService';

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
/* Row                                                                 */
/* ------------------------------------------------------------------ */

type RowProps = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  isLast?: boolean;
  danger?: boolean;
  styles: ReturnType<typeof getStyles>;
  isDark: boolean;
  colors: any;
};

const Row: React.FC<RowProps> = ({ icon, title, subtitle, value, onPress, isLast, danger, styles, isDark, colors }) => {
  const tileBg = danger
    ? isDark ? 'rgba(224, 49, 49, 0.2)' : '#FFE3E3'
    : isDark ? 'rgba(184, 243, 107, 0.14)' : '#E3F2E8';
  const tileFg = danger ? (isDark ? '#FFA8A8' : '#C92A2A') : isDark ? LIME : FOREST;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.6}
      style={styles.row}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={[styles.rowIcon, { backgroundColor: tileBg }]}>
        <Feather name={icon} size={17} color={tileFg} />
      </View>
      <View style={[styles.rowBody, !isLast && styles.rowDivider]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, danger && { color: tileFg }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {value ? <Text style={styles.rowValue} numberOfLines={1}>{value}</Text> : null}
        {onPress && !danger ? (
          <Feather name="chevron-right" size={16} color={isDark ? '#5E7A6C' : '#9DB2A7'} />
        ) : null}
      </View>
    </TouchableOpacity>
  );
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
  const dobLabel = dobDate
    ? dobDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'Add';
  const income = user?.currentIncome ? Number(user.currentIncome) : null;
  const sources = user?.incomeSourcesCount || (income ? 1 : 0);
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : null;
  const appVersion = Constants.expoConfig?.version;
  const isAdmin = !!user?.role && ['admin', 'superadmin'].includes(user.role);

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

  const handleLogoutConfirm = () => {
    showGlobalConfirm({
      title: 'Log out of Regent Money?',
      message: 'Your transactions stay saved on this phone. Sign in again any time to pick up where you left off.',
      confirmText: 'Log out',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'log-out',
      onConfirm: async () => {
        await authService.logOut();
      },
    });
  };

  const rowProps = { styles, isDark, colors };

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
              <Text style={styles.moneyLabel}>Monthly income</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('EditProfile')}
                style={styles.moneyEdit}
                activeOpacity={0.7}
                accessibilityLabel="Edit income and work details"
              >
                <Feather name="edit-2" size={15} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            {income ? (
              <Text style={styles.moneyValue}>₹{income.toLocaleString('en-IN')}</Text>
            ) : (
              <TouchableOpacity onPress={() => navigation.navigate('EditProfile')} activeOpacity={0.7}>
                <Text style={[styles.moneyValue, { fontSize: 22, color: LIME }]}>Add your income</Text>
              </TouchableOpacity>
            )}
            <View style={styles.statGrid}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Sources</Text>
                <Text style={styles.statValue}>{sources || '–'}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Work</Text>
                <Text style={styles.statValue} numberOfLines={1}>
                  {user?.occupation ? titleCase(user.occupation) : '–'}
                </Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Age</Text>
                <Text style={styles.statValue}>{age ?? '–'}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Personal details */}
        <Animated.View entering={FadeInDown.delay(160).duration(400)}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Personal details</Text>
            <TouchableOpacity onPress={() => navigation.navigate('EditProfile')} hitSlop={10}>
              <Text style={styles.sectionLink}>Edit</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.group}>
            <Row {...rowProps} icon="calendar" title="Date of birth" value={dobLabel} onPress={() => navigation.navigate('EditProfile')} />
            <Row {...rowProps} icon="user" title="Gender" value={user?.gender ? titleCase(user.gender) : 'Add'} onPress={() => navigation.navigate('EditProfile')} />
            <Row
              {...rowProps}
              icon="briefcase"
              title="Occupation"
              value={user?.occupation ? titleCase(user.occupation) : 'Add'}
              onPress={() => navigation.navigate('EditProfile')}
              isLast
            />
          </View>
        </Animated.View>

        {/* App */}
        <Animated.View entering={FadeInDown.delay(230).duration(400)}>
          <Text style={[styles.sectionTitle, styles.sectionTitleSolo]}>App</Text>
          <View style={styles.group}>
            {isAdmin && (
              <Row {...rowProps} icon="shield" title="Admin portal" subtitle="Users, moderation and deletions" onPress={() => navigation.navigate('AdminDashboard')} />
            )}
            <Row {...rowProps} icon="settings" title="Settings" subtitle="Appearance, app lock, notifications" onPress={() => navigation.navigate('AppSettings')} />
            <Row {...rowProps} icon="lock" title="Privacy center" onPress={() => navigation.navigate('PrivacyCenter')} />
            <Row {...rowProps} icon="zap" title="Suggest a feature" onPress={() => navigation.navigate('SuggestFeature')} />
            <Row {...rowProps} icon="alert-circle" title="Report a problem" onPress={() => navigation.navigate('ReportBug')} isLast />
          </View>

          <View style={[styles.group, { marginTop: 16 }]}>
            <Row {...rowProps} icon="log-out" title="Log out" onPress={handleLogoutConfirm} danger isLast />
          </View>

          {appVersion ? <Text style={styles.version}>Regent Money {appVersion}</Text> : null}
        </Animated.View>
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