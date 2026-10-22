import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Animated,
  PanResponder,
  Image,
  Platform,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import {
  useTheme,
  useAuthStore,
  useSidebarStore,
  useAppUpdateStore,
  useTermsModalStore,
  showGlobalConfirm,
} from '../store';
import { getAppCurrentVersion } from '../services/updateService';
import { authService } from '../services/authService';
import { navigationRef } from '../navigation/navigationRef';

const FOREST = '#0B3D2C';
const FOREST_RAISED = '#124B37';
const LIME = '#B8F36B';
const MIST = '#B5CEC1';

type MenuItem = {
  key: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
};

export const AppSidebarDrawer: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  // About two thirds of the screen, kept readable on small phones and tablets
  const drawerWidth = Math.round(Math.min(Math.max(screenWidth * 0.68, 250), 360));

  const user = useAuthStore((s) => s.user);
  const isOpen = useSidebarStore((s) => s.isOpen);
  const closeSidebar = useSidebarStore((s) => s.closeSidebar);
  const updateInfo = useAppUpdateStore((s) => s.updateInfo);
  const openUpdateModal = useAppUpdateStore((s) => s.openUpdateModal);
  const openTermsModal = useTermsModalStore((s) => s.openTermsModal);

  const currentVersion = getAppCurrentVersion();
  const isAdmin = !!user?.role && ['admin', 'superadmin'].includes(user.role);
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const [mounted, setMounted] = useState(isOpen);
  const slide = useRef(new Animated.Value(isOpen ? 0 : -drawerWidth)).current;
  const fade = useRef(new Animated.Value(isOpen ? 1 : 0)).current;
  const useNative = Platform.OS !== 'web';

  /* ---------------- Open / close animation ---------------- */

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      slide.setValue(-drawerWidth);
      Animated.parallel([
        Animated.spring(slide, {
          toValue: 0,
          damping: 26,
          stiffness: 240,
          mass: 0.8,
          overshootClamping: true,
          useNativeDriver: useNative,
        }),
        Animated.timing(fade, {
          toValue: 1,
          duration: 200,
          useNativeDriver: useNative,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(slide, {
          toValue: -drawerWidth,
          duration: 180,
          useNativeDriver: useNative,
        }),
        Animated.timing(fade, {
          toValue: 0,
          duration: 180,
          useNativeDriver: useNative,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [isOpen, drawerWidth]);

  // Clamped translateX so it strictly stays <= 0 and never pulls away from the left edge
  const translateX = useMemo(
    () =>
      slide.interpolate({
        inputRange: [-drawerWidth, 0],
        outputRange: [-drawerWidth, 0],
        extrapolate: 'clamp',
      }),
    [slide, drawerWidth]
  );

  // Drag the drawer left to close it
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => {
          const x = Math.min(0, g.dx);
          slide.setValue(x);
          fade.setValue(1 + x / drawerWidth);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx < -drawerWidth * 0.3 || g.vx < -0.5) {
            closeSidebar();
          } else {
            Animated.parallel([
              Animated.spring(slide, {
                toValue: 0,
                damping: 26,
                stiffness: 240,
                mass: 0.8,
                overshootClamping: true,
                useNativeDriver: useNative,
              }),
              Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: useNative }),
            ]).start();
          }
        },
      }),
    [drawerWidth]
  );

  /* ---------------- Navigation ---------------- */

  const go = (fn: () => void, delay = 140) => {
    closeSidebar();
    setTimeout(() => {
      if (navigationRef.isReady()) fn();
    }, delay);
  };
  const nav = (name: string, params?: any) => go(() => (navigationRef.navigate as any)(name, params));

  const handleLogout = () => {
    showGlobalConfirm({
      title: 'Log out of Regent Money?',
      message: 'Your transactions stay saved on this phone. Sign in again any time to pick up where you left off.',
      confirmText: 'Log out',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'log-out',
      onConfirm: async () => {
        closeSidebar();
        await authService.logOut();
      },
    });
  };

  const groups: { title: string; items: MenuItem[] }[] = isAdmin
    ? [
        {
          title: 'Admin',
          items: [
            { key: 'dash', label: 'Console', icon: 'grid', onPress: () => nav('AdminDashboard') },
            { key: 'users', label: 'Users', icon: 'users', onPress: () => nav('AdminUsers') },
            { key: 'logs', label: 'Audit logs', icon: 'activity', onPress: () => nav('AdminLogs') },
            { key: 'asettings', label: 'Admin settings', icon: 'sliders', onPress: () => nav('AdminSettings') },
          ],
        },
      ]
    : [
        {
          title: 'Plan',
          items: [
            { key: 'budgets', label: 'Budgets', icon: 'pie-chart', onPress: () => nav('Main', { screen: 'Budgets' }) },
            { key: 'goals', label: 'Goals', icon: 'target', onPress: () => nav('Main', { screen: 'Goals' }) },
            {
              key: 'calendar',
              label: 'Calendar',
              icon: 'calendar',
              onPress: () => nav('FinancialCalendar', { userCreatedAt: user?.createdAt }),
            },
          ],
        },
      ];

  groups.push(
    {
      title: 'Account',
      items: [
        { key: 'settings', label: 'Settings', icon: 'settings', onPress: () => nav('AppSettings') },
        { key: 'privacy', label: 'Privacy center', icon: 'shield', onPress: () => nav('PrivacyCenter') },
        { key: 'terms', label: 'Terms and conditions', icon: 'file-text', onPress: () => go(() => openTermsModal(true), 160) },
      ],
    },
    {
      title: 'Help',
      items: [
        { key: 'suggest', label: 'Suggest a feature', icon: 'zap', onPress: () => nav('SuggestFeature') },
        { key: 'bug', label: 'Report a problem', icon: 'alert-circle', onPress: () => nav('ReportBug') },
      ],
    }
  );

  if (!mounted) return null;

  const sheetBg = isDark ? colors.card : '#FFFFFF';
  const ink = colors.text;
  const iconColor = isDark ? '#C9D9D0' : '#3A4A42';
  const faint = isDark ? '#7F978B' : '#5F7268';
  const line = isDark ? colors.border : '#E9EFEB';
  const red = isDark ? '#FFA8A8' : '#C92A2A';

  let itemIndex = 0;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={closeSidebar}>
      <View style={styles.overlay}>
        {/* Tap anywhere outside to close */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSidebar} accessibilityLabel="Close menu" />
        </Animated.View>

        <Animated.View
          {...pan.panHandlers}
          accessibilityViewIsModal
          style={[
            styles.drawer,
            { width: drawerWidth, backgroundColor: sheetBg, transform: [{ translateX }] },
          ]}
        >
          {/* Brand + profile */}
          <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) + 8 }]}>
            <View style={[styles.ring, { width: 160, height: 160, borderRadius: 80, right: -70, top: -70 }]} />
            <View
              style={[styles.ring, { width: 90, height: 90, borderRadius: 45, right: -30, top: -30, borderColor: 'rgba(184, 243, 107, 0.24)' }]}
            />

            <View style={styles.brandRow}>
              <View style={styles.logoTile}>
                <Image source={require('../../assets/insideicon.png')} style={styles.logoImg} resizeMode="cover" />
              </View>
              <Text style={[styles.brand, { fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                Regent <Text style={{ color: LIME }}>Money</Text>
              </Text>
            </View>

            <Pressable
              onPress={() => nav('Main', { screen: 'Settings' })}
              style={({ pressed }) => [styles.profileCard, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="View profile"
            >
              <View style={styles.avatarRing}>
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarInitial}>{(user?.name || user?.email || 'R').charAt(0).toUpperCase()}</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {user?.name || 'Your profile'}
                </Text>
                <Text style={styles.profileSub} numberOfLines={1}>
                  View profile
                </Text>
              </View>
              <Feather name="chevron-right" size={14} color={MIST} />
            </Pressable>
          </View>

          {/* Menu */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 6, paddingTop: 4, paddingBottom: 10 }}
            showsVerticalScrollIndicator={false}
          >
            {groups.map((g) => (
              <View key={g.title} style={{ marginTop: 10 }}>
                <Text style={[styles.groupTitle, { color: faint }]}>{g.title}</Text>
                {g.items.map((item) => {
                  const delay = 40 + itemIndex++ * 20;
                  return (
                    <Reanimated.View key={item.key} entering={FadeIn.delay(Math.min(delay, 120)).duration(150)}>
                      <Pressable
                        onPress={item.onPress}
                        style={({ pressed }) => [
                          styles.item,
                          pressed && { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F2' },
                        ]}
                        accessibilityRole="button"
                      >
                        <Feather name={item.icon} size={16} color={iconColor} />
                        <Text style={[styles.itemLabel, { color: ink }]} numberOfLines={1}>
                          {item.label}
                        </Text>
                      </Pressable>
                    </Reanimated.View>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          {/* Footer */}
          <View style={[styles.footer, { borderTopColor: line, paddingBottom: Math.max(insets.bottom, 8) + 6 }]}>
            {updateInfo?.isUpdateAvailable && (
              <Pressable
                onPress={() => go(openUpdateModal, 120)}
                style={({ pressed }) => [styles.updateBtn, pressed && { opacity: 0.9 }]}
                accessibilityRole="button"
              >
                <Feather name="download" size={14} color={FOREST} />
                <Text style={styles.updateText} numberOfLines={1}>
                  Update to {updateInfo.latestVersion}
                </Text>
                <Feather name="arrow-right" size={13} color={FOREST} />
              </Pressable>
            )}

            <Pressable onPress={handleLogout} style={styles.logout} accessibilityRole="button">
              <Feather name="log-out" size={16} color={red} />
              <Text style={[styles.logoutText, { color: red }]}>Log out</Text>
            </Pressable>
            <Text style={[styles.version, { color: faint }]}>Version {currentVersion}</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, position: 'relative' },
  backdrop: { backgroundColor: 'rgba(7, 17, 13, 0.5)' },
  drawer: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    height: '100%',
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 6, height: 0 }, shadowOpacity: 0.2, shadowRadius: 20 },
      android: { elevation: 18 },
      default: {},
    }),
  },

  header: {
    backgroundColor: FOREST,
    paddingHorizontal: 14,
    paddingBottom: 12,
    overflow: 'hidden',
    borderTopLeftRadius: 0,
  },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(184, 243, 107, 0.16)' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoTile: { width: 28, height: 28, borderRadius: 8, overflow: 'hidden', backgroundColor: '#07110D' },
  logoImg: { width: '100%', height: '100%' },
  brand: { fontSize: 16, color: '#FFFFFF', letterSpacing: -0.3 },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    backgroundColor: FOREST_RAISED,
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  avatarRing: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: LIME, padding: 1.5 },
  avatarImg: { width: '100%', height: '100%', borderRadius: 14 },
  avatarFallback: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(184, 243, 107, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: LIME, fontSize: 13, fontWeight: '800' },
  profileName: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' },
  profileSub: { color: MIST, fontSize: 11, marginTop: 1 },

  groupTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 10,
    paddingBottom: 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  itemLabel: { fontSize: 13.5, fontWeight: '500', flex: 1 },

  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingTop: 8 },
  updateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    borderRadius: 11,
    backgroundColor: LIME,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  updateText: { flex: 1, color: FOREST, fontSize: 12.5, fontWeight: '700' },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 36, paddingHorizontal: 8 },
  logoutText: { fontSize: 13.5, fontWeight: '600' },
  version: { fontSize: 11, paddingHorizontal: 8, paddingTop: 2 },
});