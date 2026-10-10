import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useAuthStore, useThemeStore, useSecurityStore, showGlobalConfirm, UserProfile } from '../store';
import { authService } from '../services/authService';
import { biometricService } from '../services/biometricService';
import { notificationService } from '../services/notificationService';
import { pickImageFromDevice, LUXURY_PRESET_AVATARS } from '../services/imageService';

export interface ProfileScreenProps {
  AppTopBarComponent?: React.ComponentType;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ AppTopBarComponent }) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const user = useAuthStore((state) => state.user);
  const { colors, isDark } = useTheme();

  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');

  useEffect(() => {
    // Sync latest profile on mount
    authService.fetchProfile();
  }, []);

  const handlePickFromGallery = async () => {
    setAvatarUploading(true);
    try {
      const fileData = await pickImageFromDevice();
      if (fileData) {
        await authService.uploadAvatar(fileData);
        setAvatarModalVisible(false);
      }
    } catch (err: any) {
      alert('Upload failed: ' + (err?.message || err));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSelectPresetAvatar = async (url: string) => {
    setAvatarUploading(true);
    try {
      await authService.updateProfile({ avatarUrl: url });
      setAvatarModalVisible(false);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSaveCustomUrl = async () => {
    if (!customAvatarUrl.trim()) return;
    setAvatarUploading(true);
    try {
      await authService.updateProfile({ avatarUrl: customAvatarUrl.trim() });
      setCustomAvatarUrl('');
      setAvatarModalVisible(false);
    } finally {
      setAvatarUploading(false);
    }
  };



  const handleLogoutConfirm = () => {
    showGlobalConfirm({
      title: 'Log Out Session',
      message: 'Are you sure you want to end your session? Your offline records remain securely saved on this device.',
      confirmText: 'Log Out',
      cancelText: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        await authService.logOut();
      },
    });
  };

  const styles = getStyles(colors, isDark);

  return (
    <View style={styles.container}>
      {AppTopBarComponent ? <AppTopBarComponent /> : null}
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, { paddingTop: 12, paddingBottom: insets.bottom + 110 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Label */}
        <View style={{ marginBottom: 14 }}>
          {/* <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            <Ionicons name="sparkles" size={13} color={colors.accent} style={{ marginRight: 5 }} />
            <Text style={styles.kicker}>PRIVATE WEALTH IDENTITY</Text>
          </View> */}
          <Text style={styles.headerTitle}>My Profile</Text>
          <Text style={styles.subtitle}>Personal standing, financial profile & privacy controls</Text>
        </View>

        {/* User Hero / Membership Card */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* Avatar with Floating Edit Pencil Badge */}
            <View style={{ position: 'relative', marginRight: 14 }}>
              <TouchableOpacity
                onPress={() => setAvatarModalVisible(true)}
                activeOpacity={0.85}
                style={styles.avatarWrap}
              >
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>
                      {user?.name?.charAt(0).toUpperCase() || 'U'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Pencil Edit Badge */}
              <TouchableOpacity
                onPress={() => setAvatarModalVisible(true)}
                style={styles.pencilBadge}
                activeOpacity={0.8}
              >
                <Feather name="edit-2" size={11} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* User Meta */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.userName} numberOfLines={1}>{user?.name || 'Verified User'}</Text>
                {/* <View style={styles.proPill}>
                  <Feather name="award" size={10} color={colors.accent} style={{ marginRight: 3 }} />
                  <Text style={styles.proPillText}>PRO</Text>
                </View> */}
              </View>
              <Text style={styles.userEmail} numberOfLines={1}>
                {user?.email || user?.phone || 'Offline Account'}
              </Text>
              {/* <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
                <View style={[styles.statusDot, { backgroundColor: colors.accent }]} />
                <Text style={styles.statusText}>Active Wealth Tier</Text>
              </View> */}
            </View>
          </View>
        </View>

        {/* Financial & Personal Details Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Feather name="user-check" size={14} color={colors.accent} style={{ marginRight: 6 }} />
              <Text style={styles.cardKicker}>Personal Information</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('EditProfile')} style={styles.editActionBtn} activeOpacity={0.7}>
              <Feather name="edit-3" size={11} color={colors.accent} style={{ marginRight: 4 }} />
              <Text style={styles.editActionBtnText}>Edit Details</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.detailsGrid}>
            {/* Date of Birth */}
            <View style={styles.detailItem}>
              <View style={styles.detailIconBox}>
                <Feather name="calendar" size={13} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Date of Birth</Text>
                <Text style={styles.detailValue}>{user?.dob || 'Not set'}</Text>
              </View>
            </View>

            {/* Gender */}
            <View style={styles.detailItem}>
              <View style={styles.detailIconBox}>
                <Feather name="user" size={13} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Gender</Text>
                <Text style={styles.detailValue}>{user?.gender || 'Not specified'}</Text>
              </View>
            </View>

            {/* Occupation */}
            <View style={styles.detailItem}>
              <View style={styles.detailIconBox}>
                <Feather name="briefcase" size={13} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Occupation</Text>
                <Text style={styles.detailValue}>{user?.occupation || 'Salaried'}</Text>
              </View>
            </View>

            {/* Current Income */}
            <View style={styles.detailItem}>
              <View style={styles.detailIconBox}>
                <Feather name="trending-up" size={13} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Current Monthly Income</Text>
                <Text style={[styles.detailValue, { color: colors.accent, fontWeight: '800' }]}>
                  {user?.currentIncome
                    ? `₹${Number(user.currentIncome).toLocaleString('en-IN')} / mo`
                    : '₹75,000 / mo'}
                </Text>
              </View>
            </View>

            {/* Income Streams */}
            <View style={styles.detailItem}>
              <View style={styles.detailIconBox}>
                <Feather name="layers" size={13} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Income Sources</Text>
                <Text style={styles.detailValue}>
                  {user?.incomeSourcesCount || 1} Active Stream{(user?.incomeSourcesCount || 1) > 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          </View>
        </View>


        {/* Account Actions / Log Out */}
        <View style={[styles.card, { borderStyle: 'dashed' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Current Session</Text>
              <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                Signed in with {user?.authProvider?.toUpperCase() || 'OFFLINE AUTH'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogoutConfirm}
              activeOpacity={0.75}
            >
              <Feather name="log-out" size={13} color="#FF5252" style={{ marginRight: 6 }} />
              <Text style={styles.logoutBtnText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* ============================================================ */}
      {/* 1. Avatar Selection Modal */}
      {/* ============================================================ */}
      <Modal visible={avatarModalVisible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setAvatarModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAvatarModalVisible(false)} />
          <KeyboardAvoidingView
            behavior="padding"
            style={styles.keyboardAvoidingWrap}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeaderRow}>
                <View>
                  <Text style={styles.modalTitle}>Update Profile Photo</Text>
                  <Text style={styles.modalSubtitle}>Upload PNG / JPG or pick a luxury preset</Text>
                </View>
                <TouchableOpacity onPress={() => setAvatarModalVisible(false)} style={styles.modalCloseBtn}>
                  <Feather name="x" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {/* Action 1: Upload from Device */}
              <TouchableOpacity
                style={styles.uploadOptionBtn}
                onPress={handlePickFromGallery}
                disabled={avatarUploading}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIconBox, { backgroundColor: 'rgba(45, 186, 78, 0.12)' }]}>
                  {avatarUploading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Feather name="image" size={18} color={colors.accent} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>Choose PNG or JPG from Gallery</Text>
                  <Text style={styles.optionSubtitle}>Uploads securely to Cloudinary CDN</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.textTertiary} />
              </TouchableOpacity>

              {/* Action 2: Curated Luxury 3D Avatars */}
              <Text style={[styles.sectionTitleSmall, { marginTop: 16, marginBottom: 10 }]}>OR CHOOSE A LUXURY PRESET</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' }}>
                {LUXURY_PRESET_AVATARS.map((preset) => (
                  <TouchableOpacity
                    key={preset.id}
                    style={styles.presetAvatarBtn}
                    onPress={() => handleSelectPresetAvatar(preset.url)}
                    disabled={avatarUploading}
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: preset.url }} style={styles.presetAvatarImg} />
                    <Text style={styles.presetAvatarName}>{preset.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Action 3: Custom URL */}
              <Text style={[styles.sectionTitleSmall, { marginTop: 16, marginBottom: 8 }]}>OR PASTE PHOTO URL</Text>
              <View style={styles.urlInputRow}>
                <TextInput
                  style={styles.urlInput}
                  placeholder="https://images.unsplash.com/..."
                  placeholderTextColor={colors.textTertiary}
                  value={customAvatarUrl}
                  onChangeText={setCustomAvatarUrl}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.urlSaveBtn}
                  onPress={handleSaveCustomUrl}
                  disabled={!customAvatarUrl.trim() || avatarUploading}
                >
                  <Text style={styles.urlSaveBtnText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
};

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    contentContainer: {
      paddingHorizontal: 16,
    },
    kicker: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.5,
      color: colors.accent,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '900',
      color: colors.text,
      letterSpacing: -0.5,
      marginTop: 2,
    },
    subtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      fontWeight: '500',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: isDark ? '#000000' : colors.shadowColor,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    avatarWrap: {
      width: 60,
      height: 60,
      borderRadius: 30,
      borderWidth: 2,
      borderColor: colors.accent,
      overflow: 'hidden',
      backgroundColor: colors.background,
    },
    avatarImg: {
      width: '100%',
      height: '100%',
    },
    avatarFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : '#e6f7ec',
    },
    avatarFallbackText: {
      fontSize: 24,
      fontWeight: '900',
      color: colors.accent,
    },
    pencilBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.25,
      shadowRadius: 2,
      elevation: 3,
    },
    userName: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text,
    },
    userEmail: {
      fontSize: 11.5,
      color: colors.textSecondary,
      marginTop: 1,
    },
    proPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : '#e6f7ec',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(45, 186, 78, 0.3)' : 'rgba(22, 163, 74, 0.25)',
    },
    proPillText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: colors.accent,
      letterSpacing: 0.5,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: 5,
    },
    statusText: {
      fontSize: 10.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    cardKicker: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: colors.textSecondary,
    },
    cardSubtitle: {
      fontSize: 11.5,
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 16,
    },
    editActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(22, 163, 74, 0.08)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(45, 186, 78, 0.25)' : 'rgba(22, 163, 74, 0.18)',
    },
    editActionBtnText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.accent,
    },
    detailsGrid: {
      gap: 9,
    },
    detailItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
    },
    detailIconBox: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(22, 163, 74, 0.10)',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    detailLabel: {
      fontSize: 10,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    detailValue: {
      fontSize: 12.5,
      color: colors.text,
      fontWeight: '700',
      marginTop: 1,
    },
    themePill: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.buttonSecondaryBackground,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    themePillText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    securityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    securityTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    securityDesc: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    autoLockSection: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    autoLockLabel: {
      fontSize: 11.5,
      fontWeight: '700',
      color: colors.text,
    },
    autoLockDesc: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 1,
    },
    timeoutPill: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.buttonSecondaryBackground,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    timeoutPillText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
    },
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(239, 68, 68, 0.08)',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.25)',
    },
    logoutBtnText: {
      color: '#FF5252',
      fontSize: 12,
      fontWeight: '700',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      justifyContent: 'flex-end',
      ...(Platform.OS === 'web' ? { height: '100dvh' as any, width: '100vw' as any, position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0 } : {}),
    },
    keyboardAvoidingWrap: {
      width: '100%',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 18,
      borderTopWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 20,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    modalTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text,
    },
    modalSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    modalCloseBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.buttonSecondaryBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    uploadOptionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.buttonSecondaryBackground,
      padding: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 4,
    },
    optionIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    optionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    optionSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 1,
    },
    sectionTitleSmall: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: colors.textSecondary,
    },
    presetAvatarBtn: {
      width: '31%',
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.buttonSecondaryBackground,
      borderWidth: 1,
      borderColor: colors.border,
    },
    presetAvatarImg: {
      width: 44,
      height: 44,
      borderRadius: 22,
      marginBottom: 4,
    },
    presetAvatarName: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.text,
    },
    urlInputRow: {
      flexDirection: 'row',
      gap: 8,
    },
    urlInput: {
      flex: 1,
      backgroundColor: colors.buttonSecondaryBackground,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      fontSize: 12,
      color: colors.text,
    },
    urlSaveBtn: {
      backgroundColor: colors.accent,
      paddingHorizontal: 14,
      justifyContent: 'center',
      borderRadius: 8,
    },
    urlSaveBtnText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '700',
    },
    formFieldLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      color: colors.textSecondary,
      marginTop: 12,
      marginBottom: 6,
    },
    formInput: {
      backgroundColor: colors.buttonSecondaryBackground,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      color: colors.text,
      fontWeight: '600',
    },
    smallPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.buttonSecondaryBackground,
      borderWidth: 1,
      borderColor: colors.border,
    },
    smallPillActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    smallPillText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text,
    },
    smallPillTextActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    streamPill: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.buttonSecondaryBackground,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    streamPillActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    streamPillText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.text,
    },
    streamPillTextActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    saveProfileBtn: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 18,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 3,
    },
    saveProfileBtnText: {
      color: '#ffffff',
      fontSize: 13.5,
      fontWeight: '800',
    },
  });
