/**
 * The Regent Money agent, the same green coin from the intro and onboarding,
 * as a reusable component you can steer from any screen.
 *
 *   const agent = useAgentControls();
 *   <MoneyAgent size={1.3} controls={agent} dropIn />
 *   agent.cover.value = withSpring(1);   // hands over eyes
 *   sayHi(agent);                         // wave hello
 *   nudgeNo(agent);                       // little "no" shake
 *
 * Every channel is a Reanimated shared value, so it all runs on the UI thread.
 */

import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const C = {
  green: '#2dba4e',
  greenDeep: '#1f8f3a',
  ink: '#1c252e',
  white: '#ffffff',
};

export const AGENT_W = 60;
export const AGENT_H = 72;

type SV = SharedValue<number>;

export type AgentControls = {
  /** pupils, -1 (left) … 1 (right) */
  lookX: SV;
  /** pupils, -1 (up) … 1 (down) */
  lookY: SV;
  /** 0 … 1, both hands over the eyes */
  cover: SV;
  /** 0 … 1, one hand slides down to peek */
  peek: SV;
  /** -1 sad … 0 calm … 1 happy */
  mood: SV;
  /** drive with nudgeNo() */
  shake: SV;
  /** 0 … 1, right arm up and waving */
  wave: SV;
  /** 0 … 1, mouth open */
  talk: SV;
};

export function useAgentControls(): AgentControls {
  return {
    lookX: useSharedValue(0),
    lookY: useSharedValue(0),
    cover: useSharedValue(0),
    peek: useSharedValue(0),
    mood: useSharedValue(0),
    shake: useSharedValue(0),
    wave: useSharedValue(0),
    talk: useSharedValue(0),
  };
}

/** Wave hello with an open mouth. */
export function sayHi(a: AgentControls, delay = 0) {
  a.wave.value = withDelay(
    delay,
    withSequence(withSpring(1, { damping: 12, stiffness: 180 }), withDelay(1100, withTiming(0, { duration: 380 }))),
  );
  a.talk.value = withDelay(
    delay + 150,
    withSequence(withTiming(1, { duration: 120 }), withDelay(650, withTiming(0, { duration: 160 }))),
  );
}

/** A quick head shake and a sad face, then settle on `settleMood`. */
export function nudgeNo(a: AgentControls, settleMood = 0) {
  const step = (to: number, duration: number) => withTiming(to, { duration });
  a.shake.value = withSequence(step(-1, 50), step(1, 90), step(-1, 90), step(1, 90), step(0, 60));
  a.mood.value = withSequence(step(-1, 160), withDelay(1400, step(settleMood, 400)));
}

/* ------------------------------------------------------------------ */

const clamp01 = (v: number) => {
  'worklet';
  return Math.min(1, Math.max(0, v));
};
const mix = (a: number, b: number, t: number) => {
  'worklet';
  return a + (b - a) * t;
};

// shoulders and eyes in the 60 × 72 box
const SHOULDER_L = { x: 9, y: 42 };
const SHOULDER_R = { x: 51, y: 42 };
const HAND_W = 12;
const HAND_H = 10;

type Props = {
  size?: number;
  controls?: AgentControls;
  /** drop in from above when mounted */
  dropIn?: boolean;
  dropDelay?: number;
  style?: StyleProp<ViewStyle>;
};

export function MoneyAgent({ size = 1, controls, dropIn = false, dropDelay = 0, style }: Props) {
  const own = useAgentControls();
  const a = controls ?? own;
  const reduce = useReducedMotion();

  const blink = useSharedValue(1);
  const breath = useSharedValue(0.5);
  const sway = useSharedValue(0.5);
  const wig = useSharedValue(0.5);
  const drop = useSharedValue(dropIn && !reduce ? 0 : 1);
  const land = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      drop.value = 1;
      return;
    }
    if (dropIn) {
      drop.value = withDelay(dropDelay, withTiming(1, { duration: 480, easing: Easing.in(Easing.quad) }));
      land.value = withDelay(
        dropDelay + 480,
        withSequence(withTiming(1, { duration: 90 }), withSpring(0, { damping: 7, stiffness: 220 })),
      );
    }
    const close = () => withTiming(0.1, { duration: 70 });
    const open = () => withTiming(1, { duration: 120 });
    blink.value = withDelay(
      dropDelay + 1200,
      withRepeat(
        withSequence(
          close(), open(),
          withDelay(3400, close()), open(),
          withDelay(160, close()), open(),
          withDelay(2600, withTiming(1, { duration: 1 })),
        ),
        -1,
      ),
    );
    breath.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true);
    sway.value = withRepeat(withTiming(1, { duration: 2300, easing: Easing.inOut(Easing.sin) }), -1, true);
    wig.value = withRepeat(withTiming(1, { duration: 240, easing: Easing.inOut(Easing.sin) }), -1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  /* arm angles: rest → cover (pointing at the eyes) → wave (right arm only) */
  const angleL = () => {
    'worklet';
    return mix(25, -94, a.cover.value);
  };
  const angleR = () => {
    'worklet';
    const base = mix(-25, 94, a.cover.value * (1 - a.peek.value * 0.35));
    return mix(base, -150 + (wig.value - 0.5) * 44, a.wave.value);
  };
  /** where the end of an arm is, so the hand can follow it */
  const handAt = (sx: number, sy: number, deg: number, len: number) => {
    'worklet';
    const r = (deg * Math.PI) / 180;
    return { x: sx - len * Math.sin(r), y: sy + len * Math.cos(r) };
  };

  const frame = useAnimatedStyle(() => ({
    opacity: drop.value > 0 ? 1 : 0,
    transform: [{ translateX: a.shake.value * 6 }, { translateY: (1 - drop.value) * -260 }],
  }));
  const body = useAnimatedStyle(() => {
    const v = land.value + (breath.value - 0.5) * 0.08 - a.wave.value * 0.04; // > 0 squash
    return {
      transform: [
        { translateY: AGENT_H / 2 },
        { rotate: `${a.shake.value * 4}deg` },
        { scaleX: 1 + 0.2 * v },
        { scaleY: 1 - 0.24 * v },
        { translateY: -AGENT_H / 2 },
      ],
    };
  });
  const armL = useAnimatedStyle(() => ({
    transform: [{ translateY: -9 }, { rotate: `${angleL()}deg` }, { translateY: 9 }],
  }));
  const armR = useAnimatedStyle(() => ({
    transform: [{ translateY: -9 }, { rotate: `${angleR()}deg` }, { translateY: 9 }],
  }));
  const handL = useAnimatedStyle(() => {
    const p = handAt(SHOULDER_L.x, SHOULDER_L.y, angleL(), mix(17, 13.5, a.cover.value));
    const s = mix(0.8, 1.15, a.cover.value);
    return {
      transform: [{ translateX: p.x - HAND_W / 2 }, { translateY: p.y - HAND_H / 2 }, { scale: s }],
    };
  });
  const handR = useAnimatedStyle(() => {
    const cover = a.cover.value * (1 - a.peek.value * 0.35);
    const p = handAt(SHOULDER_R.x, SHOULDER_R.y, angleR(), mix(17, 13.5, cover));
    const s = mix(0.8, 1.15, cover);
    return {
      transform: [
        { translateX: p.x - HAND_W / 2 + a.peek.value * 3 },
        { translateY: p.y - HAND_H / 2 + a.peek.value * 7 },
        { scale: s },
      ],
    };
  });
  const sprout = useAnimatedStyle(() => {
    const droop = Math.max(0, -a.mood.value) * 26;
    return {
      transform: [{ translateY: 8 }, { rotate: `${(sway.value - 0.5) * 12 + droop}deg` }, { translateY: -8 }],
    };
  });
  const eye = useAnimatedStyle(() => ({
    transform: [{ scaleY: blink.value * (1 - Math.max(0, a.mood.value) * 0.25) }],
  }));
  const pupil = useAnimatedStyle(() => ({
    transform: [{ translateX: a.lookX.value * 2.6 }, { translateY: a.lookY.value * 2.2 }],
  }));
  const smile = useAnimatedStyle(() => ({
    opacity: (1 - a.talk.value) * (1 - clamp01(-a.mood.value * 1.4)),
    transform: [{ scaleX: 1 + Math.max(0, a.mood.value) * 0.25 }],
  }));
  const frown = useAnimatedStyle(() => ({
    opacity: (1 - a.talk.value) * clamp01(-a.mood.value * 1.4),
  }));
  const mouthOpen = useAnimatedStyle(() => ({
    opacity: a.talk.value,
    transform: [{ scale: 0.6 + a.talk.value * 0.4 }],
  }));
  const cheeks = useAnimatedStyle(() => ({
    opacity: 0.55 + Math.max(0, a.mood.value) * 0.45,
  }));

  return (
    <View style={[{ width: AGENT_W * size, height: AGENT_H * size }, style]} pointerEvents="none">
      <View
        style={[
          styles.box,
          {
            left: (AGENT_W * size - AGENT_W) / 2,
            top: (AGENT_H * size - AGENT_H) / 2,
            transform: [{ scale: size }],
          },
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, frame]}>
          <Animated.View style={[StyleSheet.absoluteFill, body]}>
            <Animated.View style={[styles.arm, { left: SHOULDER_L.x - 3 }, armL]} />
            <Animated.View style={[styles.arm, { left: SHOULDER_R.x - 3 }, armR]} />
            <View style={[styles.foot, { left: 16 }]} />
            <View style={[styles.foot, { left: 31 }]} />
            <Animated.View style={[styles.sprout, sprout]}>
              <View style={styles.stem} />
              <View style={styles.sproutLeaf} />
            </Animated.View>

            <View style={styles.body}>
              <View style={styles.rim} />
              <View style={styles.gloss} />
              {[11, 26].map(left => (
                <Animated.View key={left} style={[styles.eye, { left }, eye]}>
                  <Animated.View style={[styles.pupil, pupil]}>
                    <View style={styles.glint} />
                  </Animated.View>
                </Animated.View>
              ))}
              <Animated.View style={[styles.cheek, { left: 6 }, cheeks]} />
              <Animated.View style={[styles.cheek, { left: 35 }, cheeks]} />
              <Animated.View style={[styles.smile, smile]} />
              <Animated.View style={[styles.frown, frown]} />
              <Animated.View style={[styles.mouthOpen, mouthOpen]} />
            </View>

            {/* hands sit in front of the body so they can cover the eyes */}
            <Animated.View style={[styles.hand, handL]} />
            <Animated.View style={[styles.hand, handR]} />
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', width: AGENT_W, height: AGENT_H },
  arm: { position: 'absolute', top: 42, width: 6, height: 18, borderRadius: 3, backgroundColor: C.greenDeep },
  hand: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: HAND_W,
    height: HAND_H,
    borderRadius: HAND_H / 2,
    backgroundColor: C.greenDeep,
  },
  foot: { position: 'absolute', top: 66, width: 13, height: 6, borderRadius: 3, backgroundColor: C.greenDeep },
  sprout: { position: 'absolute', left: 18, top: 6, width: 24, height: 16 },
  stem: {
    position: 'absolute',
    left: 10.5,
    top: 6,
    width: 3,
    height: 10,
    borderRadius: 1.5,
    backgroundColor: C.greenDeep,
  },
  sproutLeaf: {
    position: 'absolute',
    left: 12,
    top: 1,
    width: 12,
    height: 7,
    backgroundColor: C.greenDeep,
    borderTopLeftRadius: 7,
    borderBottomRightRadius: 7,
    borderTopRightRadius: 1,
    borderBottomLeftRadius: 1,
    transform: [{ rotate: '-25deg' }],
  },
  body: {
    position: 'absolute',
    left: 6,
    top: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.green,
    overflow: 'hidden',
  },
  rim: {
    position: 'absolute',
    left: 5,
    top: 5,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  gloss: {
    position: 'absolute',
    left: 9,
    top: 6,
    width: 12,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
    transform: [{ rotate: '-30deg' }],
  },
  eye: {
    position: 'absolute',
    top: 15,
    width: 11,
    height: 12,
    borderRadius: 6,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pupil: { width: 5.5, height: 6.5, borderRadius: 3, backgroundColor: C.ink },
  glint: { position: 'absolute', left: 1, top: 1, width: 2, height: 2, borderRadius: 1, backgroundColor: C.white },
  cheek: { position: 'absolute', top: 29, width: 7, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.45)' },
  smile: {
    position: 'absolute',
    left: 18.5,
    top: 28,
    width: 11,
    height: 6,
    borderColor: C.ink,
    borderWidth: 2.4,
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  frown: {
    position: 'absolute',
    left: 18.5,
    top: 30,
    width: 11,
    height: 6,
    borderColor: C.ink,
    borderWidth: 2.4,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  mouthOpen: { position: 'absolute', left: 20, top: 27.5, width: 8, height: 8, borderRadius: 4, backgroundColor: C.ink },
});