// Voice entry hints that live by the bottom tab bar: a small mic badge on the Regent tab, a
// one-time "hold to add by voice" tip, and a nudge after a transaction was typed by hand.
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { canShow, useVoiceDiscovery } from './voiceDiscovery';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
const MIST = '#B5CEC1';
/** Wait after Home appears before the tip, so it doesn't land on top of the first paint. */
const TIP_DELAY_MS = 1500;
/** The nudge goes by itself after this long. */
const NUDGE_MS = 6000;

/** Two small sound arcs beside the Regent sprout, shown while another tab is selected: "it listens". */
export const RegentVoiceBadge: React.FC<{ color: string }> = ({ color }) => (
  <View pointerEvents="none" style={styles.arcs}>
    <Svg width={10} height={14} viewBox="0 0 10 14" fill="none">
      <Path d="M2 4.5a3.5 3.5 0 0 1 0 5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M5.5 2a7.5 7.5 0 0 1 0 10" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  </View>
);

/**
 * Sits above the tab bar. `x` is the centre of the Regent tab within this overlay's width,
 * so the tip's pointer lands on it.
 */
export const VoiceTabOverlay: React.FC<{ x: number; width: number; bottom: number; onHome: boolean; onTry: () => void }> = ({
  x,
  width,
  bottom,
  onHome,
  onTry,
}) => {
  const pendingNudge = useVoiceDiscovery((s) => s.pendingNudge);
  const [tip, setTip] = useState(false);
  const [fade] = useState(() => new Animated.Value(0));

  // The one-time tip: only on Home, once per session, a few times ever, never after voice is used.
  useEffect(() => {
    const s = useVoiceDiscovery.getState();
    if (!onHome || s.tabHintThisSession || !canShow(s, 'tabHint')) return;
    const t = setTimeout(() => {
      const now = useVoiceDiscovery.getState();
      if (now.tabHintThisSession || !canShow(now, 'tabHint') || now.pendingNudge) return;
      now.setTabHintThisSession();
      now.noteShown('tabHint');
      setTip(true);
    }, TIP_DELAY_MS);
    return () => clearTimeout(t);
  }, [onHome]);

  // A typed transaction was just saved: show the nudge, then let it go by itself.
  useEffect(() => {
    if (!pendingNudge) return;
    useVoiceDiscovery.getState().noteShown('nudge');
    const t = setTimeout(() => useVoiceDiscovery.getState().clearNudge(), NUDGE_MS);
    return () => clearTimeout(t);
  }, [pendingNudge]);

  const visible = !!pendingNudge || tip;
  useEffect(() => {
    Animated.timing(fade, { toValue: visible ? 1 : 0, duration: visible ? 260 : 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [visible, fade]);

  if (!visible || width <= 0) return null;

  const cardW = Math.min(320, width - 32);
  const left = Math.max(16, Math.min(width - 16 - cardW, x - cardW / 2));
  const arrowLeft = Math.max(18, Math.min(cardW - 32, x - left - 7));
  const motion = { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] };
  const tryIt = () => {
    setTip(false);
    useVoiceDiscovery.getState().clearNudge();
    onTry();
  };

  if (pendingNudge) {
    return (
      <Animated.View style={[styles.card, { left, width: cardW, bottom }, motion]} accessibilityLiveRegion="polite">
        <View style={styles.row}>
          <Feather name="check" size={16} color={LIME} />
          <Text style={styles.saved} numberOfLines={1}>{`Saved ${pendingNudge.label}`}</Text>
        </View>
        <View style={styles.rule} />
        <View style={styles.row}>
          <Text style={styles.body}>
            Faster next time: <Text style={styles.strong}>hold Regent</Text> and just say it.
          </Text>
          <Pressable onPress={tryIt} style={styles.cta} accessibilityRole="button" accessibilityLabel="Try voice entry">
            <Feather name="mic" size={13} color={FOREST} />
            <Text style={styles.ctaText}>Try</Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.card, { left, width: cardW, bottom }, motion]} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <View style={styles.micDisc}>
          <Feather name="mic" size={17} color={FOREST} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Hold to add by voice</Text>
          <Text style={styles.sub}>{'Say "₹250 lunch at Swiggy"'}</Text>
        </View>
      </View>
      <View style={[styles.row, { justifyContent: 'flex-end', marginTop: 10 }]}>
        <Pressable onPress={() => setTip(false)} style={styles.ghost} accessibilityRole="button">
          <Text style={styles.ghostText}>Got it</Text>
        </Pressable>
        <Pressable onPress={tryIt} style={styles.cta} accessibilityRole="button">
          <Text style={styles.ctaText}>Try it now</Text>
        </Pressable>
      </View>
      <View style={[styles.arrow, { left: arrowLeft }]} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  arcs: { position: 'absolute', right: -9, top: 6 },
  card: {
    position: 'absolute',
    backgroundColor: FOREST,
    borderRadius: 20,
    padding: 14,
    elevation: 14,
    shadowColor: '#06140E',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 12 },
  saved: { flex: 1, color: '#FFFFFF', fontSize: 13.5, fontWeight: '700' },
  body: { flex: 1, color: '#DCE8E2', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  strong: { color: '#FFFFFF', fontWeight: '800' },
  micDisc: { width: 36, height: 36, borderRadius: 18, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  sub: { color: MIST, fontSize: 12.5, fontWeight: '600', marginTop: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: LIME },
  ctaText: { color: FOREST, fontSize: 13, fontWeight: '800' },
  ghost: { height: 38, paddingHorizontal: 14, borderRadius: 19, justifyContent: 'center' },
  ghostText: { color: MIST, fontSize: 13, fontWeight: '700' },
  arrow: { position: 'absolute', bottom: -7, width: 14, height: 14, borderRadius: 3, backgroundColor: FOREST, transform: [{ rotate: '45deg' }] },
});
