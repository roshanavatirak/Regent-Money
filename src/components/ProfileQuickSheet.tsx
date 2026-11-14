import React, { useState } from 'react';
import { Modal, View, Text, Pressable, Image, StyleSheet, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, SlideInDown, Easing } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, useAuthStore } from '../store';
import { authService } from '../services/authService';

const FOREST = '#0B3D2C';
const FOREST_RAISED = '#124B37';
const LIME = '#B8F36B';
const MIST = '#B5CEC1';

interface ProfileQuickSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenProfile: () => void;
}

/**
 * Opened by long-pressing the Profile tab: a forest profile card on top,
 * Log out below it. Log out acts immediately, with no confirmation step.
 * Floats above the bottom edge so it never collides with the tab bar.
 */
export const ProfileQuickSheet: React.FC<ProfileQuickSheetProps> = ({ visible, onClose, onOpenProfile }) => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const [loggingOut, setLoggingOut] = useState(false);

  const sheetBg = isDark ? '#0F1E18' : '#FFFFFF';
  const border = isDark ? '#1E3329' : '#E1E9E4';
  const rowBg = isDark ? '#152821' : '#F6F8F7';
  const red = isDark ? '#F87171' : '#C0362C';
  const redTint = isDark ? 'rgba(248, 113, 113, 0.14)' : '#FCE8E6';

  const initial = (user?.name || user?.email || 'R').charAt(0).toUpperCase();

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      onClose();
      await authService.logOut();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, styles.backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <View style={[styles.anchor, { paddingBottom: Math.max(insets.bottom, 12) + 10 }]} pointerEvents="box-none">
        <Animated.View
          entering={SlideInDown.duration(280).easing(Easing.out(Easing.cubic))}
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: sheetBg, borderColor: border }]}
        >
          <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(234, 242, 238, 0.18)' : '#D5DFDA' }]} />

          <Pressable
            onPress={() => {
              onClose();
              onOpenProfile();
            }}
            style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="View profile"
          >
            <View pointerEvents="none" style={[styles.ring, styles.ringLarge]} />
            <View pointerEvents="none" style={[styles.ring, styles.ringSmall]} />

            <View style={styles.avatarRing}>
              <View style={styles.avatar}>
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={styles.avatarImg} />
                ) : (
                  <Text style={styles.avatarInitial}>{initial}</Text>
                )}
              </View>
            </View>

            <View style={styles.heroText}>
              <Text style={styles.name} numberOfLines={1}>
                {user?.name || 'Your profile'}
              </Text>
              {!!user?.email && (
                <Text style={styles.email} numberOfLines={1}>
                  {user.email}
                </Text>
              )}
            </View>

            <View style={styles.chevron}>
              <Feather name="arrow-up-right" size={16} color={LIME} />
            </View>
          </Pressable>

          <Pressable
            onPress={handleLogout}
            disabled={loggingOut}
            style={({ pressed }) => [styles.logoutRow, { backgroundColor: rowBg }, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <View style={[styles.iconTile, { backgroundColor: redTint }]}>
              {loggingOut ? (
                <ActivityIndicator size="small" color={red} />
              ) : (
                <Feather name="log-out" size={17} color={red} />
              )}
            </View>
            <Text style={[styles.logoutText, { color: red }]}>Log out</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(7, 17, 13, 0.5)' },
  anchor: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  sheet: {
    borderRadius: 30,
    borderWidth: 1,
    padding: 10,
    paddingTop: 10,
    shadowColor: '#07110D',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 22,
    backgroundColor: FOREST,
    overflow: 'hidden',
  },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(184, 243, 107, 0.16)' },
  ringLarge: { width: 180, height: 180, borderRadius: 90, right: -70, top: -96 },
  ringSmall: { width: 96, height: 96, borderRadius: 48, right: -24, top: -52, borderColor: 'rgba(184, 243, 107, 0.26)' },

  avatarRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: LIME,
    padding: 2,
  },
  avatar: {
    flex: 1,
    borderRadius: 25,
    overflow: 'hidden',
    backgroundColor: FOREST_RAISED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarInitial: { color: LIME, fontSize: 21, fontWeight: '800' },

  heroText: { flex: 1, minWidth: 0 },
  name: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  email: { color: MIST, fontSize: 13, marginTop: 3 },

  chevron: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(184, 243, 107, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 58,
    marginTop: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  iconTile: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  logoutText: { fontSize: 15.5, fontWeight: '700' },

  pressed: { opacity: 0.88, transform: [{ scale: 0.985 }] },
});

export default ProfileQuickSheet;
