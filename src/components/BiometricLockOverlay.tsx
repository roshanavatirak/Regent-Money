// src/components/BiometricLockOverlay.tsx
//
// Full-screen lock shown when the app auto-locks. Minimal by design:
// brand, one title, a short hint, the fingerprint scanner and an error line.
//
// Motion:
//   idle    – two soft ripples breathe out of the scanner and a light sweep
//             passes over the fingerprint
//   scanning – ring arc spins while the OS prompt is open
//   fail    – gentle horizontal shake + short error line
//   success – ring fills, fingerprint turns into a check mark, then the whole
//             screen zooms through and fades to reveal the dashboard.
//             setLocked(false) runs only once that exit has finished.
//
// Reduce motion: loops are switched off and the exit is a plain short fade.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Image, Platform } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Font from 'expo-font';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSecurityStore, useTheme } from '../store';
import { biometricService } from '../services/biometricService';
import { BrandWordmark } from './BrandWordmark';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Brand palette shared with HomeDashboard / ProfileScreen
const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
const INK = '#0B1F17';

/** Mint-canvas palette (Profile screen style), switching to lime-on-dark in dark mode. */
const lockPalette = (isDark: boolean, bgDark: string, borderDark: string) => ({
  bg: isDark ? bgDark : '#F3F6F4',
  line: isDark ? borderDark : '#E1E9E4',
  tile: isDark ? 'rgba(184, 243, 107, 0.14)' : '#E3F2E8',
  tileBorder: isDark ? 'rgba(184, 243, 107, 0.2)' : '#E1E9E4',
  deco: isDark ? 'rgba(184, 243, 107, 0.12)' : 'rgba(11, 61, 44, 0.10)',
  accent: isDark ? LIME : FOREST, // ring, ripples, sweep, fingerprint, success fill
  onAccent: isDark ? FOREST : LIME, // check mark + button label
  title: isDark ? '#FFFFFF' : INK,
  hint: isDark ? 'rgba(250, 251, 252, 0.7)' : '#5E7A6C',
  error: isDark ? '#FFA8A8' : '#C92A2A',
});

const SCANNER = 76; // fingerprint button
const RING = 96; // progress ring around it
const STROKE = 2.5;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Status = 'idle' | 'scanning' | 'success' | 'error';

/** Turn expo-local-authentication error codes into short, human copy. */
const friendlyError = (raw?: string): { text: string; shake: boolean } => {
  const code = (raw || '').toLowerCase();
  if (code.includes('cancel')) return { text: 'Unlock cancelled. Tap to try again.', shake: false };
  if (code.includes('lockout')) return { text: 'Too many attempts. Try again in a moment.', shake: true };
  if (code.includes('not_enrolled') || code.includes('passcode_not_set'))
    return { text: 'Set up a fingerprint in your phone settings.', shake: false };
  if (code.includes('not_available')) return { text: 'Fingerprint unlock is unavailable right now.', shake: false };
  if (code.includes('timeout')) return { text: 'Timed out. Tap to try again.', shake: false };
  return { text: "Didn't match. Try again.", shake: true };
};

export const BiometricLockOverlay = () => {
  const isLocked = useSecurityStore((state) => state.isLocked);
  const setLocked = useSecurityStore((state) => state.setLocked);
  const { colors, isDark } = useTheme();
  const pal = lockPalette(isDark, colors.background, colors.border);
  const reduceMotion = useReducedMotion();

  const [status, setStatus] = useState<Status>('idle');
  const [authError, setAuthError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  // ── Shared values ───────────────────────────────────────────
  const backdrop = useSharedValue(1); // opaque straight away so nothing leaks through
  const content = useSharedValue(0); // 0 → 1 entry, 1 → 0 exit
  const zoom = useSharedValue(1);
  const lift = useSharedValue(0); // entry slide-up
  const ripple = useSharedValue(0);
  const rippleGain = useSharedValue(0);
  const sweep = useSharedValue(0);
  const spin = useSharedValue(0);
  const progress = useSharedValue(0); // ring fill 0..1
  const check = useSharedValue(0); // fingerprint → check morph
  const shake = useSharedValue(0);
  const press = useSharedValue(1);

  const startIdleLoops = useCallback(() => {
    if (reduceMotion) return;
    rippleGain.value = withTiming(1, { duration: 300 });
    ripple.value = 0;
    ripple.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1, false);
    sweep.value = 0;
    sweep.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.cubic) }),
        withDelay(900, withTiming(0, { duration: 0 }))
      ),
      -1,
      false
    );
  }, [reduceMotion]);

  const stopLoops = useCallback(() => {
    cancelAnimation(ripple);
    cancelAnimation(sweep);
    cancelAnimation(spin);
    rippleGain.value = withTiming(0, { duration: 200 });
    sweep.value = 0;
  }, []);

  // Reset everything each time the lock appears
  useEffect(() => {
    if (!isLocked) return;
    busyRef.current = false;
    setStatus('idle');
    setAuthError(null);
    backdrop.value = 1;
    zoom.value = 1;
    progress.value = 0;
    check.value = 0;
    shake.value = 0;
    content.value = reduceMotion ? 1 : 0;
    lift.value = reduceMotion ? 0 : 14;
    if (!reduceMotion) {
      content.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) });
      lift.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
    }
    startIdleLoops();
  }, [isLocked]);

  // ── Unlock flow ─────────────────────────────────────────────
  const finishUnlock = useCallback(() => {
    setLocked(false);
  }, [setLocked]);

  const playSuccess = useCallback(() => {
    stopLoops();
    const fill = reduceMotion ? 0 : 420;
    progress.value = withTiming(1, { duration: fill, easing: Easing.out(Easing.cubic) });
    check.value = withDelay(reduceMotion ? 0 : 160, withSpring(1, { damping: 14, stiffness: 180 }));

    // Hold the check for a beat, then zoom through to the dashboard.
    const hold = reduceMotion ? 120 : 620;
    if (reduceMotion) {
      backdrop.value = withDelay(hold, withTiming(0, { duration: 200 }, (done) => {
        if (done) runOnJS(finishUnlock)();
      }));
      content.value = withDelay(hold, withTiming(0, { duration: 160 }));
      return;
    }
    zoom.value = withDelay(hold, withTiming(1.14, { duration: 420, easing: Easing.in(Easing.cubic) }));
    content.value = withDelay(hold, withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }));
    backdrop.value = withDelay(
      hold + 90,
      withTiming(0, { duration: 380, easing: Easing.inOut(Easing.quad) }, (done) => {
        if (done) runOnJS(finishUnlock)();
      })
    );
  }, [reduceMotion, finishUnlock, stopLoops]);

  const playFailure = useCallback(
    (withShake: boolean) => {
      cancelAnimation(spin);
      progress.value = withTiming(0, { duration: 220 });
      if (withShake && !reduceMotion) {
        shake.value = withSequence(
          withTiming(-10, { duration: 55 }),
          withTiming(9, { duration: 70 }),
          withTiming(-6, { duration: 70 }),
          withTiming(4, { duration: 70 }),
          withTiming(0, { duration: 60 })
        );
      }
      startIdleLoops();
    },
    [reduceMotion, startIdleLoops]
  );

  const handleUnlock = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setStatus('scanning');
    setAuthError(null);

    // Spinning partial arc while the system prompt is up
    rippleGain.value = withTiming(0, { duration: 200 });
    progress.value = withTiming(0.28, { duration: 260 });
    if (!reduceMotion) {
      spin.value = 0;
      spin.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1, false);
    }

    let unlocked = false;
    try {
      const result = await biometricService.authenticate('Unlock Regent Money');
      if (result.success) {
        unlocked = true;
        setStatus('success');
        playSuccess();
      } else {
        const { text, shake: doShake } = friendlyError(result.error);
        setAuthError(text);
        setStatus('error');
        playFailure(doShake);
      }
    } catch (err: any) {
      const { text, shake: doShake } = friendlyError(err?.message);
      setAuthError(text);
      setStatus('error');
      playFailure(doShake);
    } finally {
      // Stay busy after success so nothing re-prompts during the exit.
      if (!unlocked) busyRef.current = false;
    }
  }, [reduceMotion, playSuccess, playFailure]);

  // Prompt automatically shortly after the lock screen appears
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isLocked) {
      timer = setTimeout(() => {
        handleUnlock();
      }, 350);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isLocked]);

  // ── Animated styles ─────────────────────────────────────────
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: content.value,
    transform: [{ translateY: lift.value }, { scale: zoom.value }],
  }));

  const rippleA = useAnimatedStyle(() => ({
    opacity: rippleGain.value * interpolate(ripple.value, [0, 0.15, 1], [0, 0.55, 0]),
    transform: [{ scale: interpolate(ripple.value, [0, 1], [0.85, 1.55]) }],
  }));
  const rippleB = useAnimatedStyle(() => {
    const t = (ripple.value + 0.5) % 1;
    return {
      opacity: rippleGain.value * interpolate(t, [0, 0.15, 1], [0, 0.45, 0]),
      transform: [{ scale: interpolate(t, [0, 1], [0.85, 1.55]) }],
    };
  });

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sweep.value, [0, 0.1, 0.9, 1], [0, 1, 1, 0]),
    transform: [{ translateY: interpolate(sweep.value, [0, 1], [-SCANNER * 0.42, SCANNER * 0.42]) }],
  }));

  const ringSpinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-90 + spin.value * 360}deg` }],
  }));

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
  }));

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }, { scale: press.value }],
  }));

  const fingerprintStyle = useAnimatedStyle(() => ({
    opacity: 1 - check.value,
    transform: [{ scale: interpolate(check.value, [0, 1], [1, 0.6]) }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: check.value,
    transform: [{ scale: interpolate(check.value, [0, 1], [0.4, 1]) }],
  }));
  const scannerFillStyle = useAnimatedStyle(() => ({ opacity: check.value }));

  if (!isLocked) return null;

  const busy = status === 'scanning' || status === 'success';
  const hint =
    status === 'scanning' ? 'Waiting for your fingerprint…' : status === 'success' ? 'Unlocked' : 'Touch the sensor to unlock';

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => {
        // Swallow the Android back button so it can't bypass the lock
      }}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, { backgroundColor: pal.bg }, backdropStyle]}
        pointerEvents="none"
      >
        {/* Faint brand rings, same motif as the dashboard and profile cards */}
        <View style={[styles.deco, { width: 300, height: 300, borderRadius: 150, right: -120, top: -130, borderColor: pal.deco }]} />
        <View style={[styles.deco, { width: 170, height: 170, borderRadius: 85, right: -50, top: -70, borderColor: pal.deco }]} />
        <View style={[styles.deco, { width: 240, height: 240, borderRadius: 120, left: -130, bottom: -100, borderColor: pal.deco }]} />
      </Animated.View>

      <Animated.View style={[styles.container, contentStyle]}>
        {/* Brand */}
        <View style={styles.top}>
          <View style={[styles.logo, { backgroundColor: pal.tile, borderColor: pal.tileBorder }]}>
            <Image source={require('../../assets/icon.png')} style={styles.logoImage} />
          </View>
          <BrandWordmark size={17} />
        </View>

        {/* Scanner */}
        <View style={styles.center}>
          <Animated.View style={[styles.scannerWrap, shakeStyle]}>
            <Animated.View style={[styles.ripple, { borderColor: pal.accent }, rippleA]} pointerEvents="none" />
            <Animated.View style={[styles.ripple, { borderColor: pal.accent }, rippleB]} pointerEvents="none" />

            {/* Track + animated arc */}
            <Svg width={RING} height={RING} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Circle cx={RING / 2} cy={RING / 2} r={RADIUS} stroke={pal.line} strokeWidth={STROKE} fill="none" />
            </Svg>
            <Animated.View style={[StyleSheet.absoluteFill, ringSpinStyle]} pointerEvents="none">
              <Svg width={RING} height={RING}>
                <AnimatedCircle
                  cx={RING / 2}
                  cy={RING / 2}
                  r={RADIUS}
                  stroke={status === 'error' ? pal.error : pal.accent}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                  fill="none"
                  animatedProps={ringProps}
                />
              </Svg>
            </Animated.View>

            <Pressable
              onPress={handleUnlock}
              disabled={busy}
              onPressIn={() => {
                press.value = withSpring(0.94, { damping: 18, stiffness: 300 });
              }}
              onPressOut={() => {
                press.value = withSpring(1, { damping: 14, stiffness: 220 });
              }}
              accessibilityRole="button"
              accessibilityLabel="Unlock with fingerprint"
              accessibilityState={{ disabled: busy }}
              style={[
                styles.scanner,
                { backgroundColor: pal.tile, borderColor: pal.tileBorder },
              ]}
            >
              {/* Accent fill that floods in on success */}
              <Animated.View
                style={[StyleSheet.absoluteFill, { backgroundColor: pal.accent, borderRadius: SCANNER / 2 }, scannerFillStyle]}
              />
              <Animated.View style={[styles.sweep, sweepStyle]} pointerEvents="none">
                <View style={[styles.sweepLine, { backgroundColor: pal.accent }]} />
              </Animated.View>
              <Animated.View style={[styles.iconLayer, fingerprintStyle]}>
                <Ionicons name="finger-print" size={38} color={pal.accent} />
              </Animated.View>
              <Animated.View style={[styles.iconLayer, checkStyle]}>
                <Feather name="check" size={32} color={pal.onAccent} />
              </Animated.View>
            </Pressable>
          </Animated.View>

          <Text
            style={[
              styles.title,
              { color: pal.title, fontFamily: display, fontWeight: display ? undefined : '800' },
            ]}
          >
            Welcome back
          </Text>
          <Text style={[styles.hint, { color: pal.hint }]}>{hint}</Text>

          <View style={styles.errorSlot}>
            {authError && status === 'error' ? (
              <Text style={[styles.error, { color: pal.error }]} accessibilityLiveRegion="polite">
                {authError}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Action */}
        <Pressable
          onPress={handleUnlock}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: pal.accent, opacity: busy ? 0.55 : pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: pal.onAccent }]}>{status === 'error' ? 'Try again' : 'Unlock'}</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 88 : 72,
    paddingBottom: 40,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backdrop: { overflow: 'hidden' },
  deco: { position: 'absolute', borderWidth: 1 },
  top: { alignItems: 'center', gap: 10 },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  logoImage: { width: '100%', height: '100%' },
  center: { alignItems: 'center', width: '100%' },
  scannerWrap: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  ripple: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 1,
  },
  scanner: {
    width: SCANNER,
    height: SCANNER,
    borderRadius: SCANNER / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  sweep: { position: 'absolute', left: 0, right: 0, height: 2, alignItems: 'center' },
  sweepLine: { width: '64%', height: 2, borderRadius: 1, opacity: 0.55 },
  title: { fontSize: 19, letterSpacing: -0.3, textAlign: 'center' },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 4, textAlign: 'center' },
  errorSlot: { minHeight: 30, justifyContent: 'center', marginTop: 6 },
  error: { fontSize: 13, fontWeight: '600', textAlign: 'center', maxWidth: 300 },
  button: {
    alignSelf: 'center',
    paddingHorizontal: 40,
    minWidth: 180,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
});
