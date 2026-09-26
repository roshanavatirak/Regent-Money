import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  Image,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useAuthStore, useSidebarStore, useAppUpdateStore, showGlobalConfirm } from '../store';
import { getAppCurrentVersion } from '../services/updateService';
import { authService } from '../services/authService';

export const AppSidebarDrawer: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const DRAWER_WIDTH = SCREEN_WIDTH * 0.65;

  const user = useAuthStore((state) => state.user);
  const isOpen = useSidebarStore((state) => state.isOpen);
  const closeSidebar = useSidebarStore((state) => state.closeSidebar);

  const updateInfo = useAppUpdateStore((state) => state.updateInfo);
  const openUpdateModal = useAppUpdateStore((state) => state.openUpdateModal);

  const currentVersion = getAppCurrentVersion();

  // Slide animation for drawer
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOpen) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOpen, DRAWER_WIDTH]);

  if (!isOpen) return null;

  const handleUpdatePress = () => {
    closeSidebar();
    openUpdateModal();
  };

  const handleLogout = () => {
    showGlobalConfirm({
      title: 'Log Out',
      message: 'Are you sure you want to log out of your Regent Money account?',
      confirmText: 'Log Out',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'log-out',
      onConfirm: async () => {
        closeSidebar();
        await authService.logOut();
      },
    });
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      onRequestClose={closeSidebar}
    >
      <View style={styles.overlay}>
        {/* Backdrop (tap to dismiss) */}
        <TouchableWithoutFeedback onPress={closeSidebar}>
          <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
        </TouchableWithoutFeedback>

        {/* Sliding Sidebar Panel (65% width) */}
        <Animated.View
          style={[
            styles.drawerContainer,
            {
              width: DRAWER_WIDTH,
              backgroundColor: colors.card,
              borderRightColor: colors.border,
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          {/* Header Branding - Seamless logo without green border */}
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View style={styles.logoBadge}>
                <Image
                  source={require('../../assets/insideicon.png')}
                  style={styles.logoImage}
                  resizeMode="cover"
                />
              </View>
              <View style={styles.brandTextCol}>
                <View style={styles.brandTitleRow}>
                  <Text style={[styles.brandRegent, { color: colors.text }]}>REGENT</Text>
                  <Text style={[styles.brandMoney, { color: colors.accent }]}>MONEY</Text>
                </View>
                <Text style={[styles.brandSubtitle, { color: colors.textTertiary }]}>PRIVATE WEALTH</Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={closeSidebar}
              style={[styles.closeBtn, { borderColor: colors.border }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* User Account Card - Clean display, no logged-in badge */}
          <View style={[styles.userCard, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc', borderColor: colors.border }]}>
            <View style={[styles.avatarCircle, { backgroundColor: colors.accent }]}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>
                  {(user?.name || user?.email || 'R').charAt(0).toUpperCase()}
                </Text>
              )}
            </View>
            <View style={styles.userMeta}>
              <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                {user?.name || 'Regent Member'}
              </Text>
              <Text style={[styles.userEmail, { color: colors.textSecondary }]} numberOfLines={1}>
                {user?.email || 'user@regentmoney.com'}
              </Text>
            </View>
          </View>

          {/* Spacer pushing the footer down */}
          <View style={{ flex: 1 }} />

          {/* Sticky Bottom Footer */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            {/* Show Update Option ONLY if update is available */}
            {updateInfo?.isUpdateAvailable && (
              <TouchableOpacity
                style={[styles.updateBannerBtn, { backgroundColor: colors.accent }]}
                onPress={handleUpdatePress}
                activeOpacity={0.85}
              >
                <View style={styles.updateIconCircle}>
                  <Ionicons name="download-outline" size={13} color="#ffffff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.updateBannerTitle}>Update Available</Text>
                  <Text style={styles.updateBannerSub}>v{updateInfo.latestVersion} ready to install</Text>
                </View>
                <Ionicons name="arrow-forward" size={13} color="#ffffff" />
              </TouchableOpacity>
            )}

            {/* Sticky Log Out Button */}
            <TouchableOpacity
              style={[
                styles.logoutBtn,
                {
                  borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#fee2e2',
                  backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#fff5f5',
                },
              ]}
              onPress={handleLogout}
              activeOpacity={0.75}
            >
              <Feather name="log-out" size={14} color="#ef4444" style={{ marginRight: 8 }} />
              <Text style={styles.logoutText}>Log Out</Text>
            </TouchableOpacity>

            {/* Current Version below Log Out */}
            <View style={styles.versionRow}>
              <Text style={[styles.versionLabel, { color: colors.textTertiary }]}>
                Version {currentVersion}
              </Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  drawerContainer: {
    height: '100%',
    borderRightWidth: 1,
    paddingHorizontal: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 4, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 9,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  logoImage: {
    width: 36,
    height: 36,
    borderRadius: 9,
  },
  brandTextCol: {
    justifyContent: 'center',
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brandRegent: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  brandMoney: {
    fontSize: 12,
    fontWeight: '900',
    marginLeft: 3,
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 7.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 0.5,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
    gap: 8,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  userMeta: {
    marginTop: 2,
  },
  userName: {
    fontSize: 13,
    fontWeight: '700',
  },
  userEmail: {
    fontSize: 10,
    marginTop: 2,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 8,
  },
  updateBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 9,
    borderRadius: 10,
    gap: 7,
  },
  updateIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateBannerTitle: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '800',
  },
  updateBannerSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 8.5,
    fontWeight: '500',
  },
  versionRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  versionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9.5,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 2,
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 11.5,
    fontWeight: '700',
  },
});
