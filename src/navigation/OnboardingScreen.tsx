/**
 * Regent Money onboarding
 * Picks up where the launch intro ends: same light canvas, same green,
 * and the same money agent, who now hops from scene to scene as you swipe.
 *
 * Uses packages already in the project: react-native-reanimated,
 * react-native-svg, react-native-safe-area-context, @expo/vector-icons.
 * Logo: src/components/RegentWordmark.tsx (shared with the intro).
 *
 * What moves (all on the UI thread)
 *   - The agent drops in, then hops between scenes as the pages scroll.
 *   - Each scene builds itself when it arrives and rebuilds when you return.
 *   - Scenes, headlines and body text travel at different speeds (parallax).
 *   - The round button fills its progress ring, then stretches into "Get started".
 */

import React, { ComponentProps, useEffect, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  SharedValue,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { mmkvStorage } from '../db/mmkv';
import { RegentWordmark } from '../components/RegentWordmark';

/* ------------------------------------------------------------------ */
/* Tokens                                                             */
/* ------------------------------------------------------------------ */

const C = {
  bg: '#fafbfc',
  white: '#ffffff',
  green: '#2dba4e',
  greenDeep: '#1f8f3a',
  sage: '#8fdca2',
  mint: '#bfeccb',
  mist: '#e7f7eb',
  ink: '#1c252e',
  body: '#5b6672',
  muted: '#8a94a0',
  line: '#e6ebef',
  dot: '#d3dbe1',
};

const D = 340; // every scene is drawn on a 340 × 340 stage, then scaled to fit
const CW = 60; // agent box (same proportions as in the intro)
const CH = 72;
const HEADER_H = 56;
const FOOTER_H = 112;
const SCENE_TOP = 4;
const TEXT_H = 196; // room kept below the scene for the headline and body
const BTN = 64;
const RING_R = 37;
const RING_C = 2 * Math.PI * RING_R;

type SlideCopy = { id: string; title: string; body: string };

const SLIDES: SlideCopy[] = [
  {
    id: 'track',
    title: 'Every rupee,\ntracked for you',
    body: 'Regent Money reads your bank SMS and sorts each spend on its own. No typing, no spreadsheets.',
  },
  {
    id: 'private',
    title: 'Your money data\nstays on your phone',
    body: 'Bank messages are read and stored on this device. Personal chats are never opened, and your data is never sold.',
  },
  {
    id: 'goals',
    title: 'Set a goal.\nWatch it grow.',
    body: "Plan for a trip, a bike or a home. See how much to save each month and when you'll get there.",
  },
];
const LAST = SLIDES.length - 1;

/** Where the agent stands in each scene (stage units, feet position) */
const POSE_X = [170, 272, 104];
const POSE_Y = [232, 318, 268];
const POSE_S = [1.45, 1.15, 1.25];

const SPARKLE = 'M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z';

type SV = SharedValue<number>;
type IconName = ComponentProps<typeof Feather>['name'];
type SceneProps = { enter: SV; float: SV; spin: SV };

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/* ------------------------------------------------------------------ */
/* Motion helpers (worklets)                                          */
/* ------------------------------------------------------------------ */

const clamp01 = (v: number) => {
  'worklet';
  return Math.min(1, Math.max(0, v));
};
/** progress of v inside the window [a, b], as 0..1 */
const seg = (v: number, a: number, b: number) => {
  'worklet';
  return clamp01((v - a) / (b - a));
};
const mix = (a: number, b: number, t: number) => {
  'worklet';
  return a + (b - a) * t;
};
const outCubic = (t: number) => {
  'worklet';
  return 1 - Math.pow(1 - t, 3);
};
const outBack = (t: number) => {
  'worklet';
  const s = 1.7;
  return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
};
/** 0 while resting on a page, 1 at the top of the hop between two pages */
const hopOf = (p: number) => {
  'worklet';
  const q = Math.min(LAST, Math.max(0, p));
  return Math.sin((q - Math.floor(q)) * Math.PI);
};

/**
 * 0 → 1 build-up for a scene. Starts when the page is more than half in view,
 * resets once it is fully off screen so it plays again on the way back.
 */
function useEnter(index: number, scrollX: SV, W: number, reduce: boolean) {
  const enter = useSharedValue(0);
  const played = useSharedValue(0);
  useAnimatedReaction(
    () => Math.abs(scrollX.value / W - index),
    d => {
      if (d < 0.5 && played.value === 0) {
        played.value = 1;
        enter.value = reduce ? 1 : withTiming(1, { duration: 1500, easing: Easing.linear });
      } else if (d > 0.98 && played.value === 1) {
        played.value = 0;
        enter.value = 0;
      }
    },
    [W, reduce],
  );
  return enter;
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                      */
/* ------------------------------------------------------------------ */

function Glow({ id, size, strength }: { id: string; size: number; strength: number }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={C.green} stopOpacity={strength} />
          <Stop offset="0.55" stopColor={C.green} stopOpacity={strength * 0.35} />
          <Stop offset="1" stopColor={C.green} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}

type ChipData = { icon: IconName; label: string; amount: string; credit: boolean; x: number; y: number };

function Chip({ chip, at, dir, enter, float }: { chip: ChipData; at: number; dir: number; enter: SV; float: SV }) {
  const style = useAnimatedStyle(() => {
    const t = seg(enter.value, at, at + 0.35);
    const e = outBack(t);
    return {
      opacity: clamp01(t * 2.5),
      transform: [{ translateY: mix(26, 0, e) + (float.value - 0.5) * 8 * dir }, { scale: mix(0.86, 1, e) }],
    };
  });
  return (
    <Animated.View style={[styles.chip, { left: chip.x, top: chip.y }, style]}>
      <View style={styles.chipIcon}>
        <Feather name={chip.icon} size={14} color={C.green} />
      </View>
      <Text style={styles.chipLabel}>{chip.label}</Text>
      <Text style={[styles.chipAmount, chip.credit && { color: C.green }]}>{chip.amount}</Text>
    </Animated.View>
  );
}

function Badge(props: {
  icon: IconName;
  size: number;
  x: number;
  y: number;
  at: number;
  dir: number;
  tint: string;
  enter: SV;
  float: SV;
}) {
  const { icon, size, x, y, at, dir, tint, enter, float } = props;
  const style = useAnimatedStyle(() => {
    const t = seg(enter.value, at, at + 0.3);
    return {
      opacity: clamp01(t * 3),
      transform: [{ translateY: (float.value - 0.5) * 8 * dir }, { scale: mix(0.3, 1, outBack(t)) }],
    };
  });
  return (
    <Animated.View style={[styles.badge, { left: x, top: y, width: size, height: size, borderRadius: size / 2 }, style]}>
      <Feather name={icon} size={Math.round(size * 0.4)} color={tint} />
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 1: spending sorted automatically                             */
/* ------------------------------------------------------------------ */

const DONUT = { cx: 170, cy: 176, r: 104, w: 18 };
const DONUT_C = 2 * Math.PI * DONUT.r;
const DONUT_GAP = 26;
const SEGMENTS = [
  { frac: 0.4, color: C.green },
  { frac: 0.33, color: C.greenDeep },
  { frac: 0.27, color: C.mint },
].map((s, i, all) => ({ ...s, start: all.slice(0, i).reduce((sum, x) => sum + x.frac, 0) }));

const TRACK_CHIPS: ChipData[] = [
  { icon: 'coffee', label: 'Coffee', amount: '−₹180', credit: false, x: 2, y: 24 },
  { icon: 'briefcase', label: 'Salary', amount: '+₹52,000', credit: true, x: 166, y: 74 },
  { icon: 'home', label: 'Rent', amount: '−₹15,000', credit: false, x: 14, y: 264 },
];

function DonutSegment({ i, start, frac, color, enter }: { i: number; start: number; frac: number; color: string; enter: SV }) {
  const len = frac * DONUT_C - DONUT_GAP;
  const animatedProps = useAnimatedProps(() => {
    const t = outCubic(seg(enter.value, 0.04 + i * 0.1, 0.42 + i * 0.1));
    return { strokeDashoffset: (1 - t) * (len + 1), strokeOpacity: t > 0.01 ? 1 : 0 };
  });
  const angle = ((start * DONUT_C + DONUT_GAP / 2) / DONUT_C) * 360 - 90;
  return (
    <AnimatedCircle
      cx={DONUT.cx}
      cy={DONUT.cy}
      r={DONUT.r}
      fill="none"
      stroke={color}
      strokeWidth={DONUT.w}
      strokeLinecap="round"
      strokeDasharray={`${len} ${DONUT_C}`}
      transform={`rotate(${angle} ${DONUT.cx} ${DONUT.cy})`}
      animatedProps={animatedProps}
    />
  );
}

function SceneTrack({ enter, float }: SceneProps) {
  const plate = useAnimatedStyle(() => {
    const t = seg(enter.value, 0, 0.3);
    return { opacity: clamp01(t * 3), transform: [{ scale: mix(0.7, 1, outBack(t)) }] };
  });
  return (
    <>
      <Animated.View style={[styles.plate, plate]} />
      <Svg width={D} height={D} style={StyleSheet.absoluteFill}>
        <Circle cx={DONUT.cx} cy={DONUT.cy} r={DONUT.r} fill="none" stroke={C.mist} strokeWidth={DONUT.w} />
        {SEGMENTS.map((s, i) => (
          <DonutSegment key={s.color} i={i} start={s.start} frac={s.frac} color={s.color} enter={enter} />
        ))}
      </Svg>
      <View style={[styles.groundShadow, { left: POSE_X[0] - 32, top: POSE_Y[0] - 5, width: 64 }]} />
      {TRACK_CHIPS.map((chip, i) => (
        <Chip key={chip.label} chip={chip} at={0.28 + i * 0.1} dir={i % 2 ? -1 : 1} enter={enter} float={float} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 2: data stays on the phone                                   */
/* ------------------------------------------------------------------ */

const SHIELD = 'M39 4 L72 16 V44 C72 66 57 80 39 87 C21 80 6 66 6 44 V16 Z';
const CHECK = 'M24 46 L35 57 L55 35';
const CHECK_LEN = 46;

function SmsRow({ i, enter }: { i: number; enter: SV }) {
  const style = useAnimatedStyle(() => {
    const t = outCubic(seg(enter.value, 0.42 + i * 0.08, 0.68 + i * 0.08));
    return { opacity: t, transform: [{ translateX: mix(-14, 0, t) }] };
  });
  return (
    <Animated.View style={[styles.smsRow, { top: 140 + i * 24 }, style]}>
      <View style={styles.smsDot} />
      <View>
        <View style={[styles.smsBar, { width: [72, 58, 66][i] }]} />
        <View style={[styles.smsBarSmall, { width: [40, 50, 34][i] }]} />
      </View>
    </Animated.View>
  );
}

function ScenePrivacy({ enter, float, spin }: SceneProps) {
  const ring = useAnimatedStyle(() => ({
    opacity: seg(enter.value, 0.1, 0.5),
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));
  const phone = useAnimatedStyle(() => {
    const t = outCubic(seg(enter.value, 0, 0.4));
    return { opacity: clamp01(t * 2), transform: [{ translateY: mix(40, 0, t) }] };
  });
  const shield = useAnimatedStyle(() => {
    const t = seg(enter.value, 0.22, 0.55);
    return { opacity: clamp01(t * 3), transform: [{ scale: mix(0.4, 1, outBack(t)) }] };
  });
  const check = useAnimatedProps(() => ({
    strokeDashoffset: (1 - outCubic(seg(enter.value, 0.5, 0.72))) * CHECK_LEN,
  }));
  const pill = useAnimatedStyle(() => {
    const t = outCubic(seg(enter.value, 0.72, 0.95));
    return { opacity: t, transform: [{ translateY: mix(8, 0, t) }] };
  });
  return (
    <>
      <Animated.View style={[styles.ring, ring]}>
        <Svg width={308} height={308}>
          <Circle
            cx={154}
            cy={154}
            r={152}
            fill="none"
            stroke={C.green}
            strokeOpacity={0.35}
            strokeWidth={1.6}
            strokeDasharray="3 9"
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
      <View style={[styles.groundShadow, { left: POSE_X[1] - 30, top: POSE_Y[1] - 5, width: 60 }]} />
      <Animated.View style={[styles.phone, phone]}>
        <View style={styles.notch} />
        <View style={styles.shieldGlow} />
        <Animated.View style={[styles.shield, shield]}>
          <Svg width={78} height={90} viewBox="0 0 78 90">
            <Path d={SHIELD} fill={C.green} />
            <AnimatedPath
              d={CHECK}
              fill="none"
              stroke={C.white}
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${CHECK_LEN} ${CHECK_LEN}`}
              animatedProps={check}
            />
          </Svg>
        </Animated.View>
        {[0, 1, 2].map(i => (
          <SmsRow key={i} i={i} enter={enter} />
        ))}
        <Animated.View style={[styles.devicePill, pill]}>
          <Feather name="check" size={11} color={C.green} />
          <Text style={styles.devicePillText}>On this device</Text>
        </Animated.View>
      </Animated.View>
      <Badge icon="lock" size={54} x={0} y={86} at={0.55} dir={1} tint={C.green} enter={enter} float={float} />
      <Badge icon="eye-off" size={46} x={245} y={26} at={0.65} dir={-1} tint={C.body} enter={enter} float={float} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 3: goals that grow                                           */
/* ------------------------------------------------------------------ */

const BASE = 316; // ground line
const COIN_TOP = BASE - 24;
const BARS = [
  { x: 196, h: 54, color: C.mint },
  { x: 228, h: 84, color: C.sage },
  { x: 260, h: 120, color: C.green },
  { x: 292, h: 164, color: C.greenDeep },
];
const TREND = 'M182 268 C222 258 262 222 304 146';
const TREND_LEN = 200;
const TREND_HEAD = 'M286 146 L305 143 L304 162';
const HEAD_LEN = 40;
const GOAL_BAR_W = 182;

function Coin({ i, enter }: { i: number; enter: SV }) {
  const style = useAnimatedStyle(() => {
    const t = seg(enter.value, i * 0.06, 0.2 + i * 0.06);
    return { opacity: clamp01(t * 4), transform: [{ translateY: mix(-70, 0, outBack(t)) }] };
  });
  return (
    <Animated.View style={[styles.coin, { top: COIN_TOP - i * 15 }, style]}>
      <View style={styles.coinFace}>{i === 2 && <Text style={styles.coinMark}>₹</Text>}</View>
    </Animated.View>
  );
}

function Bar({ i, x, h, color, enter }: { i: number; x: number; h: number; color: string; enter: SV }) {
  const style = useAnimatedStyle(() => {
    const t = seg(enter.value, 0.25 + i * 0.07, 0.6 + i * 0.07);
    // scale from the bottom edge: move pivot down, scale, move back
    return {
      transform: [{ translateY: h / 2 }, { scaleY: Math.max(0.001, outBack(t)) }, { translateY: -h / 2 }],
    };
  });
  return <Animated.View style={[styles.bar, { left: x, top: BASE - h, height: h, backgroundColor: color }, style]} />;
}

function SceneGoals({ enter, float }: SceneProps) {
  const card = useAnimatedStyle(() => {
    const t = outCubic(seg(enter.value, 0.05, 0.4));
    return { opacity: t, transform: [{ translateY: mix(-18, 0, t) + (float.value - 0.5) * 6 }] };
  });
  const fill = useAnimatedStyle(() => {
    const t = outCubic(seg(enter.value, 0.35, 0.85));
    return { transform: [{ translateX: -GOAL_BAR_W + GOAL_BAR_W * 0.68 * t }] };
  });
  const trendHalo = useAnimatedProps(() => ({
    strokeDashoffset: (1 - outCubic(seg(enter.value, 0.45, 0.8))) * TREND_LEN,
  }));
  const trend = useAnimatedProps(() => ({
    strokeDashoffset: (1 - outCubic(seg(enter.value, 0.45, 0.8))) * TREND_LEN,
  }));
  const head = useAnimatedProps(() => ({
    strokeDashoffset: (1 - outCubic(seg(enter.value, 0.78, 0.9))) * HEAD_LEN,
  }));
  const sparkle = useAnimatedStyle(() => {
    const t = seg(enter.value, 0.85, 1);
    return { opacity: clamp01(t * 3), transform: [{ rotate: `${float.value * 40}deg` }, { scale: outBack(t) }] };
  });
  return (
    <>
      <View style={[styles.groundShadow, { left: POSE_X[2] - 56, top: BASE - 6, width: 112, height: 12, borderRadius: 6 }]} />
      {[0, 1, 2].map(i => (
        <Coin key={i} i={i} enter={enter} />
      ))}
      {BARS.map((b, i) => (
        <Bar key={b.x} i={i} x={b.x} h={b.h} color={b.color} enter={enter} />
      ))}
      <Svg width={D} height={D} style={StyleSheet.absoluteFill}>
        <AnimatedPath
          d={TREND}
          fill="none"
          stroke={C.bg}
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={`${TREND_LEN} ${TREND_LEN}`}
          animatedProps={trendHalo}
        />
        <AnimatedPath
          d={TREND}
          fill="none"
          stroke={C.ink}
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeDasharray={`${TREND_LEN} ${TREND_LEN}`}
          animatedProps={trend}
        />
        <AnimatedPath
          d={TREND_HEAD}
          fill="none"
          stroke={C.ink}
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${HEAD_LEN} ${HEAD_LEN}`}
          animatedProps={head}
        />
      </Svg>
      <Animated.View style={[styles.goalCard, card]}>
        <View style={styles.goalIcon}>
          <Feather name="sun" size={18} color={C.green} />
        </View>
        <Text style={styles.goalTitle}>Goa trip</Text>
        <Text style={styles.goalAmount}>₹34,000 of ₹50,000</Text>
        <View style={styles.goalTrack}>
          <Animated.View style={[styles.goalFill, fill]} />
        </View>
        <Text style={styles.goalNote}>On track for March</Text>
      </Animated.View>
      <Animated.View style={[styles.sparkle, sparkle]}>
        <Svg width={22} height={22} viewBox="0 0 24 24">
          <Path d={SPARKLE} fill={C.green} />
        </Svg>
      </Animated.View>
    </>
  );
}

const SCENES = [SceneTrack, ScenePrivacy, SceneGoals];

/* ------------------------------------------------------------------ */
/* The money agent (same character as the intro)                      */
/* ------------------------------------------------------------------ */

function Agent({ scrollX, W, reduce }: { scrollX: SV; W: number; reduce: boolean }) {
  const blink = useSharedValue(1);
  const breath = useSharedValue(0.5);
  const sway = useSharedValue(0.5);
  const drop = useSharedValue(reduce ? 1 : 0);
  const land = useSharedValue(0);
  const landed = useSharedValue(0);

  useEffect(() => {
    if (reduce) {
      drop.value = 1;
      return;
    }
    const close = () => withTiming(0.1, { duration: 70 });
    const open = () => withTiming(1, { duration: 120 });
    drop.value = withDelay(150, withTiming(1, { duration: 520, easing: Easing.in(Easing.quad) }));
    land.value = withDelay(
      670,
      withSequence(withTiming(1, { duration: 90 }), withSpring(0, { damping: 7, stiffness: 220 })),
    );
    blink.value = withDelay(
      1400,
      withRepeat(
        withSequence(
          close(), open(),
          withDelay(3200, close()), open(),
          withDelay(180, close()), open(),
          withDelay(2600, withTiming(1, { duration: 1 })),
        ),
        -1,
      ),
    );
    breath.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true);
    sway.value = withRepeat(withTiming(1, { duration: 2300, easing: Easing.inOut(Easing.sin) }), -1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  // a little squash every time it lands on a page
  useAnimatedReaction(
    () => scrollX.value / W,
    p => {
      const n = Math.round(p);
      if (Math.abs(p - n) < 0.015 && n !== landed.value) {
        landed.value = n;
        if (!reduce) {
          land.value = withSequence(withTiming(1, { duration: 90 }), withSpring(0, { damping: 7, stiffness: 220 }));
        }
      }
    },
    [W, reduce],
  );

  const position = useAnimatedStyle(() => {
    const p = Math.min(LAST, Math.max(0, scrollX.value / W));
    const hop = reduce ? 0 : hopOf(p);
    const x = interpolate(p, [0, 1, 2], POSE_X);
    const y = interpolate(p, [0, 1, 2], POSE_Y);
    const s = interpolate(p, [0, 1, 2], POSE_S);
    const fall = (1 - drop.value) * -320;
    return {
      opacity: drop.value > 0 ? 1 : 0,
      transform: [
        { translateX: x - CW / 2 },
        { translateY: y - CH - hop * 64 + fall },
        { translateY: CH / 2 },
        { scale: s },
        { translateY: -CH / 2 },
        { rotate: `${hop * 10}deg` },
      ],
    };
  });

  const body = useAnimatedStyle(() => {
    const hop = reduce ? 0 : hopOf(scrollX.value / W);
    const v = land.value + (breath.value - 0.5) * 0.08 - hop * 0.3; // > 0 squash, < 0 stretch
    return {
      transform: [{ translateY: CH / 2 }, { scaleX: 1 + 0.2 * v }, { scaleY: 1 - 0.24 * v }, { translateY: -CH / 2 }],
    };
  });

  const armL = useAnimatedStyle(() => {
    const hop = reduce ? 0 : hopOf(scrollX.value / W);
    return { transform: [{ translateY: -9 }, { rotate: `${25 + hop * 135}deg` }, { translateY: 9 }] };
  });
  const armR = useAnimatedStyle(() => {
    const hop = reduce ? 0 : hopOf(scrollX.value / W);
    return { transform: [{ translateY: -9 }, { rotate: `${-25 - hop * 135}deg` }, { translateY: 9 }] };
  });
  const sprout = useAnimatedStyle(() => {
    const hop = reduce ? 0 : hopOf(scrollX.value / W);
    return {
      transform: [{ translateY: 8 }, { rotate: `${(sway.value - 0.5) * 12 - hop * 22}deg` }, { translateY: -8 }],
    };
  });
  const eye = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.value }] }));
  const pupil = useAnimatedStyle(() => {
    const p = scrollX.value / W;
    const hop = reduce ? 0 : hopOf(p);
    const look = Math.max(-2.6, Math.min(2.6, (p - landed.value) * 9));
    return { transform: [{ translateX: look }, { translateY: -hop * 1.8 }] };
  });
  const mouth = useAnimatedStyle(() => ({
    opacity: clamp01((hopOf(scrollX.value / W) - 0.2) * 3),
  }));
  const smile = useAnimatedStyle(() => ({
    opacity: 1 - clamp01((hopOf(scrollX.value / W) - 0.2) * 3),
  }));

  return (
    <Animated.View style={[styles.agent, position]}>
      <Animated.View style={[StyleSheet.absoluteFill, body]}>
        <Animated.View style={[styles.arm, { left: 6 }, armL]} />
        <Animated.View style={[styles.arm, { left: 48 }, armR]} />
        <View style={[styles.foot, { left: 16 }]} />
        <View style={[styles.foot, { left: 31 }]} />
        <Animated.View style={[styles.sprout, sprout]}>
          <View style={styles.stem} />
          <View style={styles.sproutLeaf} />
        </Animated.View>
        <View style={styles.agentBody}>
          <View style={styles.rim} />
          <View style={styles.gloss} />
          {[11, 26].map(left => (
            <Animated.View key={left} style={[styles.eye, { left }, eye]}>
              <Animated.View style={[styles.pupil, pupil]}>
                <View style={styles.glint} />
              </Animated.View>
            </Animated.View>
          ))}
          <View style={[styles.cheek, { left: 6 }]} />
          <View style={[styles.cheek, { left: 35 }]} />
          <Animated.View style={[styles.smile, smile]} />
          <Animated.View style={[styles.mouthOpen, mouth]} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* One page                                                           */
/* ------------------------------------------------------------------ */

type PageProps = {
  slide: SlideCopy;
  index: number;
  W: number;
  height: number;
  S: number;
  scrollX: SV;
  float: SV;
  spin: SV;
  mount: SV;
  reduce: boolean;
};

function Page({ slide, index, W, height, S, scrollX, float, spin, mount, reduce }: PageProps) {
  const enter = useEnter(index, scrollX, W, reduce);
  const Scene = SCENES[index];

  const scene = useAnimatedStyle(() => {
    const o = scrollX.value - index * W;
    const d = Math.min(1, Math.abs(o) / W);
    return { opacity: 1 - d * 0.5, transform: [{ translateX: o * 0.2 }, { scale: 1 - d * 0.08 }] };
  });
  const title = useAnimatedStyle(() => {
    const o = scrollX.value - index * W;
    return {
      opacity: clamp01(1 - (Math.abs(o) / W) * 2.2) * mount.value,
      transform: [{ translateX: o * 0.35 }, { translateY: (1 - mount.value) * 18 }],
    };
  });
  const body = useAnimatedStyle(() => {
    const o = scrollX.value - index * W;
    return {
      opacity: clamp01(1 - (Math.abs(o) / W) * 2.6) * mount.value,
      transform: [{ translateX: o * 0.55 }, { translateY: (1 - mount.value) * 26 }],
    };
  });

  return (
    <View style={{ width: W, height }}>
      <Animated.View style={[{ width: S, height: S, marginTop: SCENE_TOP, alignSelf: 'center' }, scene]}>
        <View style={[styles.stage, { left: (S - D) / 2, top: (S - D) / 2, transform: [{ scale: S / D }] }]}>
          <Scene enter={enter} float={float} spin={spin} />
        </View>
      </Animated.View>
      <View style={styles.copy}>
        <Animated.Text style={[styles.title, title]}>{slide.title}</Animated.Text>
        <Animated.Text style={[styles.body, body]}>{slide.body}</Animated.Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Footer controls                                                    */
/* ------------------------------------------------------------------ */

function Dot({ i, scrollX, W, onPress }: { i: number; scrollX: SV; W: number; onPress: () => void }) {
  const style = useAnimatedStyle(() => {
    const p = scrollX.value / W;
    return {
      width: interpolate(p, [i - 1, i, i + 1], [8, 26, 8], Extrapolation.CLAMP),
      backgroundColor: interpolateColor(p, [i - 1, i, i + 1], [C.dot, C.green, C.dot]),
    };
  });
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`Go to page ${i + 1} of ${SLIDES.length}`}
    >
      <Animated.View style={[styles.dot, style]} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                             */
/* ------------------------------------------------------------------ */

interface OnboardingScreenProps {
  navigation: any;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const reduce = useReducedMotion();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const float = useSharedValue(0.5);
  const spin = useSharedValue(0);
  const mount = useSharedValue(reduce ? 1 : 0);
  const press = useSharedValue(1);
  const [index, setIndex] = useState(0);
  const [areaH, setAreaH] = useState(H - insets.top - insets.bottom - HEADER_H - FOOTER_H);

  const S = Math.max(180, Math.min(W - 32, 360, areaH - TEXT_H));
  const stageLeft = (W - S) / 2;
  const fullBtn = W - 56;
  const isLast = index === LAST;

  useEffect(() => {
    if (reduce) {
      mount.value = 1;
      return;
    }
    mount.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    float.value = withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }), -1, true);
    spin.value = withRepeat(withTiming(1, { duration: 30000, easing: Easing.linear }), -1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: e => {
      scrollX.value = e.contentOffset.x;
    },
  });

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / W));
  };

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * W, animated: true });
    setIndex(i);
  };

  const finish = () => {
    try {
      mmkvStorage.setBoolean('has_seen_onboarding_v1', true);
    } catch {
      // storage failure should never block the user
    }
    navigation.replace('Welcome');
  };

  const onLayoutArea = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(h - areaH) > 1) setAreaH(h);
  };

  /* chrome animations */
  const header = useAnimatedStyle(() => ({
    opacity: mount.value,
    transform: [{ translateY: (1 - mount.value) * -10 }],
  }));
  const skip = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value / W, [LAST - 1, LAST - 0.4], [1, 0], Extrapolation.CLAMP),
  }));
  const footer = useAnimatedStyle(() => ({
    opacity: mount.value,
    transform: [{ translateY: (1 - mount.value) * 24 }],
  }));
  const dots = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value / W, [LAST - 1, LAST - 0.6], [1, 0], Extrapolation.CLAMP),
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value / W, [LAST - 1, LAST - 0.55], [1, 0], Extrapolation.CLAMP),
  }));
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_C * (1 - clamp01((scrollX.value / W + 1) / SLIDES.length)),
  }));
  const button = useAnimatedStyle(() => ({
    width: interpolate(scrollX.value / W, [LAST - 1, LAST], [BTN, fullBtn], Extrapolation.CLAMP),
    transform: [{ scale: press.value }],
  }));
  const label = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value / W, [LAST - 0.45, LAST], [0, 1], Extrapolation.CLAMP),
  }));
  const backdrop = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(scrollX.value / W, [0, LAST], [-28, 28], Extrapolation.CLAMP) }],
  }));

  const glow = W * 1.3;
  const sceneCenterY = insets.top + HEADER_H + SCENE_TOP + S / 2;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      {/* soft light behind the scenes */}
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', left: W / 2 - glow / 2, top: sceneCenterY - glow / 2 }, backdrop]}
      >
        <Glow id="obGlow" size={glow} strength={0.13} />
      </Animated.View>
      <View pointerEvents="none" style={{ position: 'absolute', left: -W * 0.6, bottom: -W * 0.7 }}>
        <Glow id="obGlowLow" size={W * 1.4} strength={0.07} />
      </View>

      <Animated.View style={[styles.header, header]}>
        <RegentWordmark height={30} />
        <Animated.View style={skip} pointerEvents={isLast ? 'none' : 'auto'}>
          <Pressable
            onPress={finish}
            hitSlop={12}
            style={styles.skip}
            accessibilityRole="button"
            accessibilityLabel="Skip introduction"
          >
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>

      <View style={styles.area} onLayout={onLayoutArea}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          overScrollMode="never"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onMomentumScrollEnd={onMomentumEnd}
        >
          {SLIDES.map((slide, i) => (
            <Page
              key={slide.id}
              slide={slide}
              index={i}
              W={W}
              height={areaH}
              S={S}
              scrollX={scrollX}
              float={float}
              spin={spin}
              mount={mount}
              reduce={reduce}
            />
          ))}
        </Animated.ScrollView>

        {/* the agent lives above the pages so it can hop between them */}
        <View pointerEvents="none" style={[styles.overlay, { left: stageLeft, width: S, height: S }]}>
          <View style={[styles.stage, { left: (S - D) / 2, top: (S - D) / 2, transform: [{ scale: S / D }] }]}>
            <Agent scrollX={scrollX} W={W} reduce={reduce} />
          </View>
        </View>
      </View>

      <Animated.View style={[styles.footer, footer]}>
        <Animated.View style={[styles.dots, dots]} pointerEvents={isLast ? 'none' : 'auto'}>
          {SLIDES.map((s, i) => (
            <Dot key={s.id} i={i} scrollX={scrollX} W={W} onPress={() => goTo(i)} />
          ))}
        </Animated.View>

        <Animated.View pointerEvents="none" style={[styles.ringWrap, ring]}>
          <Svg width={80} height={80}>
            <Circle cx={40} cy={40} r={RING_R} fill="none" stroke={C.line} strokeWidth={3} />
            <AnimatedCircle
              cx={40}
              cy={40}
              r={RING_R}
              fill="none"
              stroke={C.green}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={`${RING_C} ${RING_C}`}
              transform="rotate(-90 40 40)"
              animatedProps={ringProps}
            />
          </Svg>
        </Animated.View>

        <Animated.View style={[styles.button, button]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={isLast ? finish : () => goTo(index + 1)}
            onPressIn={() => {
              press.value = withSpring(0.94, { damping: 15, stiffness: 400 });
            }}
            onPressOut={() => {
              press.value = withSpring(1, { damping: 12, stiffness: 300 });
            }}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Get started' : 'Next page'}
          >
            <Animated.Text style={[styles.buttonLabel, label]} numberOfLines={1}>
              Get started
            </Animated.Text>
            <View style={styles.buttonIcon}>
              <Feather name="arrow-right" size={22} color={C.white} />
            </View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Styles                                                             */
/* ------------------------------------------------------------------ */

const shadow = (opacity: number, radius: number, y: number, elevation: number) => ({
  shadowColor: C.ink,
  shadowOpacity: opacity,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: y },
  elevation,
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, overflow: 'hidden' },

  header: {
    height: HEADER_H,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
  },
  skipText: { fontSize: 14, fontWeight: '600', color: C.body },

  area: { flex: 1 },
  overlay: { position: 'absolute', top: SCENE_TOP },
  stage: { position: 'absolute', width: D, height: D },

  copy: { paddingHorizontal: 28, marginTop: 18 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: C.ink, letterSpacing: -0.6 },
  body: { marginTop: 12, fontSize: 15, lineHeight: 23, color: C.body, maxWidth: 340 },

  footer: { height: FOOTER_H, marginHorizontal: 28, justifyContent: 'center' },
  dots: { position: 'absolute', left: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4 },
  ringWrap: { position: 'absolute', right: -8, top: (FOOTER_H - 80) / 2, width: 80, height: 80 },
  button: {
    position: 'absolute',
    right: 0,
    top: (FOOTER_H - BTN) / 2,
    height: BTN,
    borderRadius: BTN / 2,
    backgroundColor: C.green,
    overflow: 'hidden',
    shadowColor: C.green,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  buttonLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: BTN,
    fontSize: 17,
    fontWeight: '700',
    color: C.white,
  },
  buttonIcon: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: BTN,
    height: BTN,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* scene parts (stage units) */
  groundShadow: { position: 'absolute', height: 10, borderRadius: 5, backgroundColor: 'rgba(28,37,46,0.08)' },
  plate: {
    position: 'absolute',
    left: DONUT.cx - 84,
    top: DONUT.cy - 84,
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: C.white,
    ...shadow(0.06, 18, 8, 3),
  },
  chip: {
    position: 'absolute',
    width: 172,
    height: 46,
    borderRadius: 23,
    paddingLeft: 8,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    ...shadow(0.09, 16, 8, 5),
  },
  chipIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: { flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '600', color: C.ink },
  chipAmount: { fontSize: 13, fontWeight: '700', color: C.ink },
  badge: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.white,
    ...shadow(0.1, 14, 6, 5),
  },

  ring: { position: 'absolute', left: 16, top: 11, width: 308, height: 308 },
  phone: {
    position: 'absolute',
    left: 100,
    top: 34,
    width: 140,
    height: 262,
    borderRadius: 30,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    ...shadow(0.1, 22, 12, 6),
  },
  notch: { position: 'absolute', top: 11, left: 50, width: 40, height: 6, borderRadius: 3, backgroundColor: C.line },
  shieldGlow: {
    position: 'absolute',
    left: 15,
    top: 20,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: C.mist,
  },
  shield: { position: 'absolute', left: 31, top: 30, width: 78, height: 90 },
  smsRow: { position: 'absolute', left: 18, flexDirection: 'row', alignItems: 'center' },
  smsDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green, marginRight: 8 },
  smsBar: { height: 7, borderRadius: 3.5, backgroundColor: C.line },
  smsBarSmall: { height: 5, borderRadius: 2.5, backgroundColor: '#eff2f5', marginTop: 4 },
  devicePill: {
    position: 'absolute',
    left: 16,
    top: 222,
    width: 108,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.mist,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  devicePillText: { fontSize: 11, fontWeight: '700', color: C.greenDeep },

  coin: {
    position: 'absolute',
    left: POSE_X[2] - 46,
    width: 92,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.greenDeep,
  },
  coinFace: {
    height: 18,
    borderRadius: 9,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinMark: { fontSize: 11, fontWeight: '800', color: C.white },
  bar: {
    position: 'absolute',
    width: 24,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  goalCard: {
    position: 'absolute',
    left: 18,
    top: 18,
    width: 210,
    height: 116,
    borderRadius: 22,
    backgroundColor: C.white,
    ...shadow(0.09, 18, 8, 5),
  },
  goalIcon: {
    position: 'absolute',
    left: 14,
    top: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalTitle: { position: 'absolute', left: 62, top: 14, fontSize: 15, fontWeight: '700', color: C.ink },
  goalAmount: { position: 'absolute', left: 62, top: 35, fontSize: 12, color: C.muted },
  goalTrack: {
    position: 'absolute',
    left: 14,
    top: 66,
    width: GOAL_BAR_W,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.mist,
    overflow: 'hidden',
  },
  goalFill: { width: GOAL_BAR_W, height: 8, borderRadius: 4, backgroundColor: C.green },
  goalNote: { position: 'absolute', left: 14, top: 84, fontSize: 12, fontWeight: '600', color: C.greenDeep },
  sparkle: { position: 'absolute', left: 307, top: 112, width: 22, height: 22 },

  /* agent (60 × 72 box, feet at the bottom) */
  agent: { position: 'absolute', left: 0, top: 0, width: CW, height: CH },
  arm: { position: 'absolute', top: 42, width: 6, height: 18, borderRadius: 3, backgroundColor: C.greenDeep },
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
  agentBody: {
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
  cheek: {
    position: 'absolute',
    top: 29,
    width: 7,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
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
  mouthOpen: { position: 'absolute', left: 20, top: 27.5, width: 8, height: 8, borderRadius: 4, backgroundColor: C.ink },
});