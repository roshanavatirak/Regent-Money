// src/components/DashboardSkeleton.tsx
//
// Placeholder Home screen shown while an account's data is still loading (right after login,
// or on a fresh install). Same layout as the real dashboard, with soft pulsing blocks where
// numbers, banners, the chart and the activity list will appear, like Instagram or YouTube do,
// so the screen never shows ₹0 and never flashes blank.

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image, ScrollView, Easing, ActivityIndicator } from 'react-native';
import * as Font from 'expo-font';
import { useTheme, useSyncStatusStore } from '../store';

const FOREST = '#0B3D2C';

const greetingForNow = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

/** One shared pulse for every block, so they breathe together instead of flickering. */
const usePulse = () => {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value]);
  return value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
};

export const DashboardSkeleton: React.FC<{ userName?: string | null; topInset?: number; bottomInset?: number }> = ({
  userName,
  topInset = 0,
  bottomInset = 0,
}) => {
  const { colors, isDark } = useTheme();
  const opacity = usePulse();
  const connecting = useSyncStatusStore((s) => s.connecting);

  const page = isDark ? colors.background : '#F3F6F4';
  const card = isDark ? colors.card : '#FFFFFF';
  const line = isDark ? 'rgba(250,251,252,0.08)' : '#E1E9E4';
  const bone = isDark ? 'rgba(255,255,255,0.09)' : '#E3EAE6';
  const boneOnForest = 'rgba(255,255,255,0.14)';
  const tileOnForest = 'rgba(255,255,255,0.07)';

  const display = Font.isLoaded('BricolageGrotesque_700Bold') ? 'BricolageGrotesque_700Bold' : undefined;
  const body = Font.isLoaded('Figtree_500Medium') ? 'Figtree_500Medium' : undefined;
  const firstName = (userName || '').trim().split(' ')[0];

  /** A rounded placeholder block. */
  const Bone = ({ w, h, r = 8, color = bone, style }: { w: number | `${number}%`; h: number; r?: number; color?: string; style?: any }) => (
    <Animated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: color, opacity }, style]} />
  );

  return (
    <View
      style={[styles.root, { backgroundColor: page, paddingTop: topInset }]}
      accessibilityLabel="Loading your accounts"
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      <ScrollView scrollEnabled={false} contentContainerStyle={{ paddingBottom: bottomInset + 110 }} showsVerticalScrollIndicator={false}>
        {/* Header: real greeting and logo, so the screen already feels like Home */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logo}>
              <Image source={require('../../assets/insideicon.png')} style={styles.logoImage} resizeMode="cover" />
            </View>
            <View>
              <Text style={[styles.greeting, { color: colors.textSecondary, fontFamily: body }]}>{greetingForNow()}</Text>
              {firstName ? (
                <Text
                  style={[styles.name, { color: colors.text, fontFamily: display, fontWeight: display ? undefined : '700' }]}
                  numberOfLines={1}
                >
                  {firstName}
                </Text>
              ) : (
                <Bone w={110} h={18} r={6} style={{ marginTop: 5 }} />
              )}
            </View>
          </View>
          <View style={[styles.bell, { borderColor: line, backgroundColor: card }]} />
        </View>

        {/* Net worth card */}
        <View style={[styles.hero, { backgroundColor: FOREST }]}>
          <Bone w={78} h={14} r={6} color={boneOnForest} />
          <Bone w={170} h={40} r={10} color={boneOnForest} style={{ marginTop: 14 }} />
          <View style={styles.heroTiles}>
            {[0, 1].map((i) => (
              <View key={i} style={[styles.heroTile, { backgroundColor: tileOnForest }]}>
                <View style={styles.heroTileTop}>
                  <Bone w={26} h={26} r={13} color={boneOnForest} />
                  <Bone w={64} h={12} r={6} color={boneOnForest} />
                </View>
                <Bone w={84} h={22} r={7} color={boneOnForest} style={{ marginTop: 12 }} />
              </View>
            ))}
          </View>
        </View>

        {/* Banner */}
        <View style={styles.bannerRow}>
          <Bone w="100%" h={150} r={24} />
        </View>
        <View style={styles.dots}>
          <Bone w={16} h={6} r={3} />
          <Bone w={6} h={6} r={3} />
          <Bone w={6} h={6} r={3} />
        </View>

        {/* Quick actions */}
        <View style={styles.quickRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.quick}>
              <Bone w={64} h={64} r={20} />
              <Bone w={52} h={11} r={5} style={{ marginTop: 9 }} />
            </View>
          ))}
        </View>

        {/* Daily spending card */}
        <View style={[styles.card, { backgroundColor: card, borderColor: line }]}>
          <View style={styles.cardHead}>
            <View style={{ gap: 8 }}>
              <Bone w={130} h={18} r={6} />
              <Bone w={170} h={12} r={5} />
            </View>
            <Bone w={120} h={36} r={18} />
          </View>
          <View style={styles.bars}>
            {[38, 62, 24, 80, 46, 30, 70, 52, 34, 58, 42, 66].map((h, i) => (
              <Bone key={i} w={14} h={h} r={5} />
            ))}
          </View>
        </View>

        {/* Recent activity */}
        <View style={[styles.card, { backgroundColor: card, borderColor: line }]}>
          <Bone w={120} h={16} r={6} style={{ marginBottom: 6 }} />
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.row}>
              <Bone w={40} h={40} r={13} />
              <View style={{ flex: 1, gap: 7 }}>
                <Bone w="62%" h={13} r={5} />
                <Bone w="38%" h={11} r={5} />
              </View>
              <Bone w={58} h={14} r={5} />
            </View>
          ))}
        </View>
      </ScrollView>

      {connecting ? (
        <View pointerEvents="none" style={[styles.connectingWrap, { bottom: bottomInset + 28 }]}>
          <View style={[styles.connecting, { backgroundColor: FOREST }]}>
            <ActivityIndicator size="small" color="#B8F36B" />
            <Text style={[styles.connectingText, { fontFamily: body }]}>Connecting…</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 12 },
  logo: { width: 42, height: 42, borderRadius: 13, overflow: 'hidden', backgroundColor: FOREST },
  logoImage: { width: '100%', height: '100%' },
  greeting: { fontSize: 13 },
  name: { fontSize: 19, letterSpacing: -0.3 },
  bell: { width: 44, height: 44, borderRadius: 22, borderWidth: 1 },

  hero: { marginHorizontal: 16, marginTop: 4, borderRadius: 28, padding: 22, paddingBottom: 18 },
  heroTiles: { flexDirection: 'row', gap: 10, marginTop: 26 },
  heroTile: { flex: 1, borderRadius: 18, padding: 14 },
  heroTileTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  bannerRow: { paddingHorizontal: 16, paddingTop: 20 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 12 },

  quickRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 22, marginTop: 22 },
  quick: { alignItems: 'center' },

  card: { marginHorizontal: 16, marginTop: 20, borderRadius: 24, borderWidth: 1, padding: 18 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 90, marginTop: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },

  connectingWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  connecting: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  connectingText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
});
