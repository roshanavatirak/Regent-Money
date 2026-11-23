// The mic in the Add transaction header. The first few times the screen opens, a short hint grows
// out of it, stays a moment and shrinks back in, so people learn they can say a transaction.
import React, { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { canShow, useVoiceDiscovery } from './voiceDiscovery';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
const MIST = '#B5CEC1';
/** How long the hint stays open. */
const HOLD_MS = 2500;
const HINT_W = 224;

export const VoiceMicButton: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  // Decided once when the screen opens: hints stop after a few showings or once voice is used.
  const [shouldHint] = useState(() => canShow(useVoiceDiscovery.getState(), 'addHint'));
  const [hinting, setHinting] = useState(shouldHint);
  const [grow] = useState(() => new Animated.Value(0));
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!shouldHint) return;
    useVoiceDiscovery.getState().noteShown('addHint');
    const ring = Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true });
    const anim = Animated.sequence([
      Animated.delay(450),
      Animated.parallel([
        Animated.loop(Animated.sequence([ring, Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true })]), { iterations: 2 }),
        Animated.spring(grow, { toValue: 1, friction: 7, tension: 90, useNativeDriver: true }),
      ]),
      Animated.delay(HOLD_MS),
      Animated.timing(grow, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    anim.start(({ finished }) => finished && setHinting(false));
    return () => anim.stop();
  }, [shouldHint, grow, pulse]);

  const open = () => {
    grow.stopAnimation();
    setHinting(false);
    onPress();
  };

  return (
    <View style={{ width: 44, height: 44 }}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) }] },
        ]}
      />
      <Pressable onPress={open} style={styles.btn} accessibilityRole="button" accessibilityLabel="Add by voice" accessibilityHint="Say a transaction instead of typing it" hitSlop={6}>
        <Feather name="mic" size={18} color={LIME} />
      </Pressable>
      {hinting ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.hint,
            {
              opacity: grow,
              // Grows from the mic and goes back into it.
              transformOrigin: `${HINT_W - 22}px -10px`,
              transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
            },
          ]}
        >
          <View style={styles.arrow} />
          <Text style={styles.title}>Tap to say it instead</Text>
          <Text style={styles.sub}>{'"₹250 lunch at Swiggy, paid by UPI"'}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  btn: { width: 44, height: 44, borderRadius: 22, backgroundColor: FOREST, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: FOREST },
  hint: {
    position: 'absolute',
    top: 54,
    right: 0,
    width: HINT_W,
    backgroundColor: FOREST,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 20,
    elevation: 12,
    shadowColor: '#06140E',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  arrow: { position: 'absolute', right: 15, top: -6, width: 14, height: 14, borderRadius: 3, backgroundColor: FOREST, transform: [{ rotate: '45deg' }] },
  title: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  sub: { color: MIST, fontSize: 12, fontWeight: '600', marginTop: 2 },
});
