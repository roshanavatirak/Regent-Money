/**
 * Regent Money onboarding: three pages on the mint canvas, forest and lime.
 *
 *   1 · Sorted   a bank SMS is scanned and turns into a tagged transaction (loops 3 examples)
 *   2 · Private  data chips drift into a phone and the lock clicks shut each time
 *   3 · Goals    a plane flies 68% of the way to the pin while the goal ring fills to 68%
 *
 * Behaviour is unchanged from the previous version: horizontal paging, tappable dots,
 * Skip, a round Next button with a progress ring that stretches into "Get started",
 * and finishing sets `has_seen_onboarding_v1` then replaces the route with Welcome.
 *
 * Each scene runs one 6 s clock only while its page is showing; every element is a
 * keyframe interpolation of that clock, all on the UI thread. Reduce Motion freezes
 * each scene on a representative frame.
 */

import React, { useEffect, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
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
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { mmkvStorage } from '../db/mmkv';
import { BrandWordmark } from '../components/BrandWordmark';

/* ------------------------------------------------------------------ */
/* Tokens                                                             */
/* ------------------------------------------------------------------ */

const C = {
  bg: '#F3F6F4',
  white: '#FFFFFF',
  forest: '#0B3D2C',
  lime: '#B8F36B',
  green: '#16A34A',
  mist: '#E3F2E8',
  mistInk: '#B5CEC1',
  ink: '#0B1F17',
  body: '#5E7A6C',
  muted: '#7B9488',
  line: '#E1E9E4',
  dot: '#C3CFC8',
};

const STAGE_W = 390; // scenes are drawn on a 390 × 400 stage, then scaled to fit
const STAGE_H = 400;
const HEADER_H = 56;
const FOOTER_H = 112;
const TEXT_H = 170;
const CYCLE = 6000;
const BTN = 64;
const PILL_W = 176;
const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

type SlideCopy = { id: string; title: string; body: string };

const SLIDES: SlideCopy[] = [
  { id: 'sorted', title: 'Every rupee,\nsorted for you.', body: 'We read your bank SMS and file each spend on its own.' },
  { id: 'private', title: 'Private by design.', body: 'Your money data stays on this phone. Never sold.' },
  { id: 'goals', title: 'Set a goal.\nWatch it grow.', body: 'Know what to save each month to get there.' },
];
const LAST = SLIDES.length - 1;

type SV = SharedValue<number>;
type SceneProps = { t: SV };

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Ease-out used for most keyframe segments (matches the design's cubic-bezier(.22,1,.36,1)). */
const EASE = Extrapolation.CLAMP;

/** interpolate with clamping, as a worklet-friendly helper. */
const kf = (v: number, inp: number[], out: number[]) => {
  'worklet';
  return interpolate(v, inp, out, EASE);
};

/** Smooth step on 0..1 so linear keyframes feel eased. */
const ease = (v: number) => {
  'worklet';
  const p = Math.min(1, Math.max(0, v));
  return 1 - Math.pow(1 - p, 3);
};

/* ------------------------------------------------------------------ */
/* Shared bits                                                        */
/* ------------------------------------------------------------------ */

function Glow({ id, cx, cy, r }: { id: string; cx: number; cy: number; r: number }) {
  return (
    <Svg width={r * 2} height={r * 2} style={{ position: 'absolute', left: cx - r, top: cy - r }} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={C.lime} stopOpacity={0.3} />
          <Stop offset="0.64" stopColor={C.lime} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={r * 2} height={r * 2} fill={`url(#${id})`} />
    </Svg>
  );
}

function Pill({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <View style={[styles.pill, dark ? styles.pillDark : styles.pillLight]}>
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 1 · Sorted                                                   */
/* ------------------------------------------------------------------ */

const SORTED = [
  {
    sms: 'Rs.180 debited from A/c XX4821 at BLUE TOKAI COFFEE.',
    name: 'Coffee',
    amount: '−₹180',
    credit: false,
    tag: 'Food',
    icon: 'coffee' as const,
  },
  {
    sms: 'Rs.52,000 credited to A/c XX4821. SALARY OCT.',
    name: 'Salary',
    amount: '+₹52,000',
    credit: true,
    tag: 'Income',
    icon: 'arrow-down-left' as const,
  },
  {
    sms: 'Rs.15,000 paid via UPI to RAJESH (rent).',
    name: 'House rent',
    amount: '−₹15,000',
    credit: false,
    tag: 'Bills',
    icon: 'home' as const,
  },
];

function SortedItem({ t, k }: { t: SV; k: number }) {
  const item = SORTED[k];
  // each example owns one third of the cycle; u runs 0 → 1 over the full 6 s from its start
  const local = (v: number) => {
    'worklet';
    return (v - k / 3 + 1) % 1;
  };

  const bubble = useAnimatedStyle(() => {
    const u = local(t.value);
    return {
      opacity: kf(u, [0, 0.05, 0.15, 0.19], [0, 1, 1, 0]),
      transform: [
        { translateY: kf(u, [0, 0.05, 0.15, 0.19], [-14, 0, 0, 10]) },
        { scale: kf(u, [0.15, 0.19], [1, 0.96]) },
      ],
    };
  });
  const scan = useAnimatedStyle(() => {
    const u = local(t.value);
    return {
      opacity: kf(u, [0.06, 0.07, 0.14, 0.15], [0, 1, 1, 0]),
      transform: [{ translateX: kf(u, [0.06, 0.14], [-40, 300]) }],
    };
  });
  const travel = useAnimatedStyle(() => {
    const u = local(t.value);
    return {
      opacity: kf(u, [0.15, 0.16, 0.2, 0.21], [0, 1, 1, 0]),
      transform: [{ translateY: kf(u, [0.15, 0.2], [0, 64]) }],
    };
  });
  const row = useAnimatedStyle(() => {
    const u = local(t.value);
    return {
      opacity: kf(u, [0.18, 0.23, 0.31, 0.34], [0, 1, 1, 0]),
      transform: [
        { translateY: kf(u, [0.18, 0.23, 0.31, 0.34], [-24, 0, 0, 22]) },
        { scale: kf(u, [0.18, 0.23, 0.31, 0.34], [0.92, 1, 1, 0.96]) },
      ],
    };
  });
  const tag = useAnimatedStyle(() => {
    const u = local(t.value);
    return { transform: [{ scale: kf(u, [0.22, 0.25, 0.27], [0, 1.15, 1]) }] };
  });

  return (
    <>
      <Animated.View style={[styles.sms, bubble]}>
        <View style={styles.smsHead}>
          <Feather name="message-square" size={12} color={C.muted} />
          <Text style={styles.smsFrom}>BANK SMS</Text>
        </View>
        <Text style={styles.smsText}>{item.sms}</Text>
        <Animated.View style={[styles.scan, scan]} />
      </Animated.View>

      <Animated.View style={[styles.travelDot, travel]} />

      <Animated.View style={[styles.txRow, row]}>
        <View style={styles.txIcon}>
          <Feather name={item.icon} size={19} color={C.forest} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.txName}>{item.name}</Text>
          <Text style={[styles.txAmount, { color: item.credit ? C.green : C.body }]}>{item.amount}</Text>
        </View>
        <Animated.View style={[styles.tag, tag]}>
          <Feather name="check" size={11} color={C.lime} />
          <Text style={styles.tagText}>{item.tag}</Text>
        </Animated.View>
      </Animated.View>
    </>
  );
}

function SceneSorted({ t }: SceneProps) {
  return (
    <View style={styles.stage}>
      <Glow id="obGlow1" cx={195} cy={190} r={150} />
      <Svg width={2} height={64} style={{ position: 'absolute', left: 194, top: 144 }}>
        <Path d="M1 0 V64" stroke={C.dot} strokeWidth={1.5} strokeDasharray="3 5" strokeLinecap="round" />
      </Svg>
      <View style={[styles.ghost, { left: 61, top: 304, width: 268, height: 14, opacity: 0.8 }]} />
      <View style={[styles.ghost, { left: 77, top: 318, width: 236, height: 12, opacity: 0.55 }]} />
      {SORTED.map((_, k) => (
        <SortedItem key={k} t={t} k={k} />
      ))}
      <View style={styles.pillRow}>
        <Pill>
          <View style={styles.greenDot} />
          <Text style={styles.pillText}>Auto-sorted, no typing</Text>
        </Pill>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 2 · Private                                                  */
/* ------------------------------------------------------------------ */

const DATA_CHIPS = [
  { label: 'Bank SMS', icon: 'message-square' as const, fx: -150, fy: -110, mx: -95, my: -70 },
  { label: 'Balances', icon: 'credit-card' as const, fx: 150, fy: -40, mx: 95, my: -25 },
  { label: 'Goals', icon: 'target' as const, fx: -140, fy: 120, mx: -90, my: 78 },
];

const PHONE_CX = 195;
const PHONE_CY = 170;

function DataChip({ t, k }: { t: SV; k: number }) {
  const c = DATA_CHIPS[k];
  const style = useAnimatedStyle(() => {
    const third = Math.floor(t.value * 3) % 3;
    const v = (t.value * 3) % 1; // 0 → 1 within this chip's 2 s window
    const on = third === k ? 1 : 0;
    const p = ease(kf(v, [0.18, 0.66], [0, 1]));
    return {
      opacity: on * kf(v, [0, 0.18, 0.42, 0.66], [0, 1, 1, 0]),
      transform: [
        { translateX: v < 0.42 ? kf(v, [0.18, 0.42], [c.fx, c.mx]) : c.mx * (1 - kf(v, [0.42, 0.66], [0, 1])) },
        { translateY: v < 0.42 ? kf(v, [0.18, 0.42], [c.fy, c.my]) : c.my * (1 - kf(v, [0.42, 0.66], [0, 1])) },
        { scale: v < 0.42 ? 1 - 0.1 * p : kf(v, [0.42, 0.66], [0.9, 0.3]) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.chipAnchor, style]}>
      <View style={styles.dataChip}>
        <View style={styles.dataChipIcon}>
          <Feather name={c.icon} size={11} color={C.forest} />
        </View>
        <Text style={styles.dataChipText}>{c.label}</Text>
      </View>
    </Animated.View>
  );
}

function ScenePrivate({ t }: SceneProps) {
  const orbit = useAnimatedStyle(() => ({ transform: [{ rotate: `${t.value * 54}deg` }] }));
  // every chip lands at v = 0.66 of its window: the lock clicks shut, a pulse goes out
  const shackle = useAnimatedStyle(() => {
    const v = (t.value * 3) % 1;
    return { transform: [{ translateY: kf(v, [0, 0.62, 0.68, 0.85, 0.95], [-5, -5, 0, 0, -5]) }] };
  });
  const pulse = useAnimatedStyle(() => {
    const v = (t.value * 3) % 1;
    return {
      opacity: kf(v, [0.66, 0.69, 1], [0, 0.55, 0]),
      transform: [{ scale: kf(v, [0.66, 1], [1, 1.8]) }],
    };
  });
  const screenGlow = useAnimatedStyle(() => {
    const v = (t.value * 3) % 1;
    return { opacity: kf(v, [0.6, 0.68, 0.95], [0, 1, 0]) };
  });

  return (
    <View style={styles.stage}>
      <Glow id="obGlow2" cx={PHONE_CX} cy={PHONE_CY} r={150} />
      <Animated.View style={[styles.orbit, orbit]}>
        <Svg width={320} height={320}>
          <Circle cx={160} cy={160} r={150} fill="none" stroke={C.forest} strokeOpacity={0.22} strokeWidth={1.5} strokeDasharray="2 9" strokeLinecap="round" />
        </Svg>
      </Animated.View>

      <View style={styles.phone}>
        <View style={styles.phoneNotch} />
        <Animated.View style={[styles.phoneGlow, screenGlow]} />
        <View style={styles.lockWrap}>
          <Animated.View style={[styles.lockPulse, pulse]} />
          <View style={styles.lockTile}>
            <Animated.View style={[styles.shackle, shackle]}>
              <Svg width={32} height={32} viewBox="0 0 24 24">
                <Path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke={C.lime} strokeWidth={2} strokeLinecap="round" />
              </Svg>
            </Animated.View>
            <Svg width={32} height={32} viewBox="0 0 24 24">
              <Rect x={5} y={11} width={14} height={10} rx={2.5} fill="none" stroke={C.lime} strokeWidth={2} />
              <Path d="M12 15v2" stroke={C.lime} strokeWidth={2} strokeLinecap="round" />
            </Svg>
          </View>
        </View>
        <View style={styles.phoneLines}>
          <View style={styles.phoneLine} />
          <View style={[styles.phoneLine, { width: '70%' }]} />
        </View>
      </View>

      {DATA_CHIPS.map((_, k) => (
        <DataChip key={k} t={t} k={k} />
      ))}

      <View style={styles.pillRow}>
        <Pill dark>
          <Feather name="shield" size={12} color={C.lime} />
          <Text style={[styles.pillText, { color: C.lime }]}>Encrypted, on this device</Text>
        </Pill>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 3 · Goals                                                    */
/* ------------------------------------------------------------------ */

// flight path: M48 176 C 120 40, 250 20, 342 66
const P0 = [48, 176];
const P1 = [120, 40];
const P2 = [250, 20];
const P3 = [342, 66];
const FLIGHT = 'M48 176 C 120 40, 250 20, 342 66';
const FLIGHT_LEN = 350;
const SAVED = 0.68;
const GOAL_R = 32;
const GOAL_C = 2 * Math.PI * GOAL_R;

const MONTHS = [
  { label: 'Dec', h: 22, current: false },
  { label: 'Jan', h: 34, current: false },
  { label: 'Feb', h: 44, current: false },
  { label: 'Mar', h: 52, current: true },
];

/** 0 → SAVED while the plane flies, holds, then everything fades for the next loop. */
const progressAt = (v: number) => {
  'worklet';
  return SAVED * ease(kf(v, [0.06, 0.52], [0, 1]));
};
const sceneFade = (v: number) => {
  'worklet';
  return kf(v, [0.88, 0.94], [1, 0]);
};

function MonthBar({ t, i }: { t: SV; i: number }) {
  const m = MONTHS[i];
  const style = useAnimatedStyle(() => {
    const v = t.value;
    return {
      opacity: sceneFade(v),
      transform: [{ scaleY: ease(kf(v, [0.08 + i * 0.02, 0.22 + i * 0.02], [0, 1])) }],
    };
  });
  return (
    <View style={styles.monthCol}>
      <View style={{ height: 52, justifyContent: 'flex-end' }}>
        <Animated.View
          style={[
            styles.monthBar,
            { height: m.h, backgroundColor: m.current ? C.lime : 'rgba(184,243,107,0.35)', transformOrigin: 'bottom' as any },
            style,
          ]}
        />
      </View>
      <Text style={styles.monthLabel}>{m.label}</Text>
    </View>
  );
}

function SceneGoals({ t }: SceneProps) {
  const trail = useAnimatedProps(() => ({
    strokeDashoffset: FLIGHT_LEN * (1 - progressAt(t.value)),
    opacity: sceneFade(t.value),
  }));
  const plane = useAnimatedStyle(() => {
    const v = t.value;
    const s = progressAt(v);
    const u = 1 - s;
    const x = u * u * u * P0[0] + 3 * u * u * s * P1[0] + 3 * u * s * s * P2[0] + s * s * s * P3[0];
    const y = u * u * u * P0[1] + 3 * u * u * s * P1[1] + 3 * u * s * s * P2[1] + s * s * s * P3[1];
    const dx = 3 * u * u * (P1[0] - P0[0]) + 6 * u * s * (P2[0] - P1[0]) + 3 * s * s * (P3[0] - P2[0]);
    const dy = 3 * u * u * (P1[1] - P0[1]) + 6 * u * s * (P2[1] - P1[1]) + 3 * s * s * (P3[1] - P2[1]);
    return {
      opacity: kf(v, [0.06, 0.09], [0, 1]) * sceneFade(v),
      transform: [{ translateX: x - 15 }, { translateY: y - 15 }, { rotate: `${Math.atan2(dy, dx)}rad` }],
    };
  });
  const pinPulse = useAnimatedProps(() => {
    const v = t.value;
    return { r: kf(v, [0.52, 0.7], [9, 23]), opacity: kf(v, [0.52, 0.54, 0.7], [0, 0.6, 0]) };
  });
  const ring = useAnimatedProps(() => ({
    strokeDashoffset: GOAL_C * (1 - progressAt(t.value)),
    opacity: sceneFade(t.value),
  }));
  const pct = useAnimatedStyle(() => ({ opacity: kf(t.value, [0.08, 0.2], [0, 1]) * sceneFade(t.value) }));
  const onTrack = useAnimatedStyle(() => {
    const v = t.value;
    return {
      opacity: kf(v, [0.54, 0.6], [0, 1]) * sceneFade(v),
      transform: [{ translateY: kf(v, [0.54, 0.6], [8, 0]) }, { scale: kf(v, [0.54, 0.6], [0.9, 1]) }],
    };
  });

  return (
    <View style={styles.stage}>
      <Svg width={STAGE_W} height={200} style={StyleSheet.absoluteFill}>
        <Path d={FLIGHT} fill="none" stroke={C.dot} strokeWidth={1.6} strokeDasharray="2 7" strokeLinecap="round" />
        <AnimatedPath
          d={FLIGHT}
          fill="none"
          stroke={C.forest}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={`${FLIGHT_LEN} ${FLIGHT_LEN}`}
          animatedProps={trail}
        />
        <Circle cx={P0[0]} cy={P0[1]} r={4} fill={C.forest} />
        <AnimatedCircle cx={P3[0]} cy={P3[1]} fill={C.green} animatedProps={pinPulse} />
        <Circle cx={P3[0]} cy={P3[1]} r={9} fill={C.white} stroke={C.forest} strokeWidth={2} />
        <Circle cx={P3[0]} cy={P3[1]} r={3.5} fill={C.green} />
      </Svg>
      <Animated.View style={[styles.plane, plane]}>
        <Svg width={15} height={15} viewBox="0 0 24 24">
          <Path d="M3 11.5L21 4l-5.5 16-3.2-6.6z" fill={C.lime} transform="rotate(22 12 12)" />
        </Svg>
      </Animated.View>

      <View style={styles.goalCard}>
        <View style={styles.goalRing} />
        <View style={styles.goalHead}>
          <View style={styles.goalIcon}>
            <Svg width={16} height={16} viewBox="0 0 24 24">
              <Path d="M3 11.5L21 4l-5.5 16-3.2-6.6z" fill={C.forest} />
            </Svg>
          </View>
          <View>
            <Text style={styles.goalName}>Goa trip</Text>
            <Text style={styles.goalMeta}>₹34,000 of ₹50,000</Text>
          </View>
        </View>
        <View style={styles.months}>
          {MONTHS.map((_, i) => (
            <MonthBar key={i} t={t} i={i} />
          ))}
        </View>
        <View style={styles.goalDial}>
          <Svg width={76} height={76} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={38} cy={38} r={GOAL_R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={6} />
            <AnimatedCircle
              cx={38}
              cy={38}
              r={GOAL_R}
              fill="none"
              stroke={C.lime}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={`${GOAL_C} ${GOAL_C}`}
              animatedProps={ring}
            />
          </Svg>
          <Animated.Text style={[styles.goalPct, pct]}>68%</Animated.Text>
        </View>
      </View>

      <View style={[styles.pillRow, { top: 362 }]}>
        <Animated.View style={onTrack}>
          <Pill>
            <Feather name="check" size={12} color={C.green} />
            <Text style={styles.pillText}>On track for March · ₹8,000/month</Text>
          </Pill>
        </Animated.View>
      </View>
    </View>
  );
}

const SCENES = [SceneSorted, ScenePrivate, SceneGoals];
/** Frame each scene freezes on when Reduce Motion is on. */
const STILL = [0.26, 0.75, 0.7];

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

type PageProps = {
  slide: SlideCopy;
  index: number;
  active: boolean;
  W: number;
  height: number;
  scale: number;
  scrollX: SV;
  reduce: boolean;
  titleFont: object;
};

function Page({ slide, index, active, W, height, scale, scrollX, reduce, titleFont }: PageProps) {
  const t = useSharedValue(reduce ? STILL[index] : 0);

  useEffect(() => {
    if (reduce) {
      t.value = STILL[index];
      return;
    }
    if (active) {
      t.value = 0;
      t.value = withRepeat(withTiming(1, { duration: CYCLE, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(t);
      t.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduce]);

  // parallax: scene and text slide at different speeds as you swipe
  const scene = useAnimatedStyle(() => {
    const d = scrollX.value / W - index;
    return {
      opacity: interpolate(Math.abs(d), [0, 0.8], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: d * W * 0.25 }],
    };
  });
  const text = useAnimatedStyle(() => {
    const d = scrollX.value / W - index;
    return {
      opacity: interpolate(Math.abs(d), [0, 0.6], [1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: d * W * 0.4 }],
    };
  });

  const Scene = SCENES[index];
  return (
    <View style={{ width: W, height }}>
      <Animated.View style={[{ height: STAGE_H * scale, alignItems: 'center' }, scene]}>
        <View style={{ width: STAGE_W, height: STAGE_H, transform: [{ scale }], transformOrigin: 'top' as any }}>
          <Scene t={t} />
        </View>
      </Animated.View>
      <Animated.View style={[styles.copy, text]}>
        <Text style={[styles.title, titleFont]}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </Animated.View>
    </View>
  );
}

function Dot({ i, scrollX, W, onPress }: { i: number; scrollX: SV; W: number; onPress: () => void }) {
  const style = useAnimatedStyle(() => {
    const p = scrollX.value / W;
    const d = Math.abs(p - i);
    return {
      width: interpolate(d, [0, 1], [26, 6], Extrapolation.CLAMP),
      backgroundColor: d < 0.5 ? C.forest : p > i ? C.muted : C.dot,
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
  const mount = useSharedValue(reduce ? 1 : 0);
  const press = useSharedValue(1);
  const [index, setIndex] = useState(0);
  const [areaH, setAreaH] = useState(H - insets.top - insets.bottom - HEADER_H - FOOTER_H);
  const [fontsLoaded] = useFonts({ BricolageGrotesque_800ExtraBold });
  const titleFont = fontsLoaded ? { fontFamily: 'BricolageGrotesque_800ExtraBold' } : { fontWeight: '800' as const };

  const scale = Math.max(0.55, Math.min(W / STAGE_W, (areaH - TEXT_H) / STAGE_H, 1.15));
  const isLast = index === LAST;

  useEffect(() => {
    mount.value = reduce ? 1 : withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
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

  /* chrome */
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
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value / W, [LAST - 1, LAST - 0.55], [1, 0], Extrapolation.CLAMP),
  }));
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_C * (1 - Math.min(1, Math.max(0, (scrollX.value / W + 1) / SLIDES.length))),
  }));
  const button = useAnimatedStyle(() => ({
    width: interpolate(scrollX.value / W, [LAST - 1, LAST], [50, PILL_W], Extrapolation.CLAMP),
    transform: [{ scale: press.value }],
  }));
  const label = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value / W, [LAST - 0.45, LAST], [0, 1], Extrapolation.CLAMP),
    maxWidth: interpolate(scrollX.value / W, [LAST - 0.6, LAST], [0, 120], Extrapolation.CLAMP),
  }));

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />

      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        <View style={[styles.cornerRing, { width: 360, height: 360, borderRadius: 180, right: -160, top: -170 }]} />
        <View style={[styles.cornerRing, { width: 300, height: 300, borderRadius: 150, left: -170, bottom: -130 }]} />
      </View>

      <Animated.View style={[styles.header, header]}>
        <BrandWordmark size={16} />
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
              active={i === index}
              W={W}
              height={areaH}
              scale={scale}
              scrollX={scrollX}
              reduce={reduce}
              titleFont={titleFont}
            />
          ))}
        </Animated.ScrollView>
      </View>

      <Animated.View style={[styles.footer, footer]}>
        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <Dot key={s.id} i={i} scrollX={scrollX} W={W} onPress={() => goTo(i)} />
          ))}
        </View>

        <View style={styles.cta}>
          <Animated.View pointerEvents="none" style={[styles.ringWrap, ring]}>
            <Svg width={BTN} height={BTN}>
              <Circle cx={BTN / 2} cy={BTN / 2} r={RING_R} fill="none" stroke={C.line} strokeWidth={2.5} />
              <AnimatedCircle
                cx={BTN / 2}
                cy={BTN / 2}
                r={RING_R}
                fill="none"
                stroke={C.forest}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeDasharray={`${RING_C} ${RING_C}`}
                transform={`rotate(-90 ${BTN / 2} ${BTN / 2})`}
                animatedProps={ringProps}
              />
            </Svg>
          </Animated.View>

          <Animated.View style={[styles.button, button]}>
            <Pressable
              style={styles.buttonInner}
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
              <Feather name="arrow-right" size={20} color={C.lime} />
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Styles                                                             */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, overflow: 'hidden' },
  cornerRing: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(11,61,44,0.07)' },

  header: {
    height: HEADER_H,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  skip: { paddingVertical: 8, paddingHorizontal: 4 },
  skipText: { fontSize: 14, fontWeight: '600', color: C.body },

  area: { flex: 1 },
  stage: { width: STAGE_W, height: STAGE_H },
  copy: { paddingHorizontal: 24, paddingTop: 20 },
  title: { fontSize: 30, lineHeight: 35, color: C.ink, letterSpacing: -0.8 },
  body: { marginTop: 12, fontSize: 15, lineHeight: 22, color: C.body, maxWidth: 300 },

  footer: {
    height: FOOTER_H,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  cta: { height: BTN, minWidth: BTN, alignItems: 'flex-end', justifyContent: 'center' },
  ringWrap: { position: 'absolute', right: 0, top: 0, width: BTN, height: BTN },
  button: {
    marginRight: (BTN - 50) / 2,
    height: 50,
    borderRadius: 25,
    backgroundColor: C.forest,
    overflow: 'hidden',
    shadowColor: C.forest,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  buttonInner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  buttonLabel: { fontSize: 16, fontWeight: '700', color: C.lime },

  /* shared scene bits */
  pillRow: { position: 'absolute', left: 0, right: 0, top: 352, alignItems: 'center' },
  pill: { height: 30, paddingHorizontal: 14, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillLight: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  pillDark: { backgroundColor: C.forest },
  pillText: { fontSize: 12.5, fontWeight: '600', color: C.forest },
  greenDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },

  /* scene 1 */
  sms: {
    position: 'absolute',
    left: 45,
    top: 36,
    width: 300,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 6,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    overflow: 'hidden',
  },
  smsHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  smsFrom: { fontSize: 11.5, fontWeight: '600', color: C.muted, letterSpacing: 0.3 },
  smsText: { marginTop: 6, fontFamily: MONO, fontSize: 12.5, lineHeight: 18, color: C.ink },
  scan: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 36, backgroundColor: 'rgba(184,243,107,0.45)' },
  travelDot: { position: 'absolute', left: 191, top: 140, width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  txRow: {
    position: 'absolute',
    left: 45,
    top: 222,
    width: 300,
    height: 72,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: C.forest,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  txIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: C.mist, alignItems: 'center', justifyContent: 'center' },
  txName: { fontSize: 15, fontWeight: '600', color: C.ink },
  txAmount: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: C.forest,
  },
  tagText: { fontSize: 12, fontWeight: '600', color: C.lime },
  ghost: {
    position: 'absolute',
    backgroundColor: C.white,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: C.line,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },

  /* scene 2 */
  orbit: { position: 'absolute', left: PHONE_CX - 160, top: PHONE_CY - 155 },
  phone: {
    position: 'absolute',
    left: 125,
    top: 50,
    width: 140,
    height: 250,
    borderRadius: 30,
    borderWidth: 2.5,
    borderColor: C.forest,
    backgroundColor: C.white,
    shadowColor: C.forest,
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  phoneNotch: { position: 'absolute', alignSelf: 'center', top: 9, width: 34, height: 5, borderRadius: 3, backgroundColor: C.line },
  phoneGlow: { position: 'absolute', top: 6, left: 6, right: 6, bottom: 6, borderRadius: 24, backgroundColor: 'rgba(184,243,107,0.22)' },
  lockWrap: { position: 'absolute', left: 33, top: 85, width: 68, height: 68 },
  lockPulse: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 22, borderWidth: 1.5, borderColor: C.forest },
  lockTile: { flex: 1, borderRadius: 22, backgroundColor: C.forest, alignItems: 'center', justifyContent: 'center' },
  shackle: { position: 'absolute', alignSelf: 'center', top: 18 },
  phoneLines: { position: 'absolute', left: 22, right: 22, bottom: 40, gap: 7 },
  phoneLine: { height: 6, borderRadius: 3, backgroundColor: C.mist },
  chipAnchor: { position: 'absolute', left: PHONE_CX, top: PHONE_CY, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  dataChip: {
    position: 'absolute',
    height: 32,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 16,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: C.forest,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  dataChipIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.mist, alignItems: 'center', justifyContent: 'center' },
  dataChipText: { fontSize: 12.5, fontWeight: '600', color: C.ink },

  /* scene 3 */
  plane: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalCard: {
    position: 'absolute',
    left: 30,
    top: 168,
    width: 330,
    height: 176,
    padding: 20,
    borderRadius: 26,
    backgroundColor: C.forest,
    overflow: 'hidden',
    shadowColor: C.forest,
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 10,
  },
  goalRing: { position: 'absolute', width: 220, height: 220, borderRadius: 110, borderWidth: 1, borderColor: 'rgba(184,243,107,0.14)', right: -90, top: -110 },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' },
  goalName: { fontSize: 15, fontWeight: '700', color: C.white },
  goalMeta: { fontSize: 12.5, color: C.mistInk, fontVariant: ['tabular-nums'] },
  months: { position: 'absolute', left: 20, bottom: 18, flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  monthCol: { alignItems: 'center', gap: 6 },
  monthBar: { width: 14, borderRadius: 7 },
  monthLabel: { fontSize: 10.5, color: C.mistInk },
  goalDial: { position: 'absolute', right: 20, bottom: 20, width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
  goalPct: { position: 'absolute', fontSize: 18, fontWeight: '800', color: C.white },
});
