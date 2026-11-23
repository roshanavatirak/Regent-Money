// Auth screens: Welcome, Auth landing, Login and Signup (Regent Money)
// Mint canvas, forest and lime: the same palette as the dashboard, profile and lock screen.

import React, { ComponentProps, ReactNode, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  BackHandler,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { KeyboardScreen } from '../components/KeyboardScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { authService, LastGoogleUser } from '../services/authService';
import { getGoogleWebClientId } from '../config/auth';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeOut,
  SlideInDown,
  ZoomIn,
  interpolateColor,
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
import Svg, { Circle, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { showGlobalAlert, useTermsModalStore, usePrivacyModalStore } from '../store';
import { StatusBar } from 'expo-status-bar';
import * as IntentLauncher from 'expo-intent-launcher';
import { CloudflareTurnstile } from '../components/CloudflareTurnstile';
import { BrandWordmark } from '../components/BrandWordmark';
import { notificationService } from '../services/notificationService';
import { requestPhoneHint } from '../services/phoneHint';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* ------------------------------------------------------------------ */
/* Tokens                                                             */
/* ------------------------------------------------------------------ */

const C = {
  bg: '#F3F6F4',
  white: '#ffffff',
  green: '#0B3D2C', // forest: focus, links, ticks
  greenDeep: '#0B3D2C',
  forest: '#0B3D2C',
  lime: '#B8F36B',
  brandGreen: '#16A34A',
  mist: '#E3F2E8',
  mistInk: '#B5CEC1',
  ink: '#0B1F17',
  body: '#5E7A6C',
  muted: '#7B9488',
  line: '#E1E9E4',
  lineSoft: '#EEF3F0',
  disabled: '#C3CFC8',
  danger: '#C92A2A',
  dangerInk: '#B42318',
  dangerBg: '#FDF1F1',
  dangerLine: '#F4CCCC',
  amber: '#d9930d',
  amberInk: '#7A4F00',
};

const SOFT = { damping: 16, stiffness: 190 };
const PERCH = { x: 508, y: 37.5 }; // top of the "n" in Regent, wordmark units

type IconName = ComponentProps<typeof Feather>['name'];

const openTerms = () => useTermsModalStore.getState().openTermsModal(true);
const openPrivacy = () => usePrivacyModalStore.getState().openPrivacyModal();

/* ------------------------------------------------------------------ */
/* Building blocks                                                    */
/* ------------------------------------------------------------------ */

/** Faint forest rings in two corners, the same motif as the dashboard and lock screen. */
function Backdrop() {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <View style={[styles.ring, { width: 360, height: 360, borderRadius: 180, right: -160, top: -170 }]} />
      <View style={[styles.ring, { width: 200, height: 200, borderRadius: 100, right: -60, top: -80 }]} />
      <View style={[styles.ring, { width: 300, height: 300, borderRadius: 150, left: -170, bottom: -130 }]} />
    </View>
  );
}

type PressScaleProps = {
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  accessibilityLabel?: string;
};

/** Pressable that gives a little under the finger. */
function PressScale({ onPress, disabled, style, children, accessibilityLabel }: PressScaleProps) {
  const pressed = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: 1 - pressed.value * 0.035 }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: 90 });
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, SOFT);
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Animated.View style={[style, anim]}>{children}</Animated.View>
    </Pressable>
  );
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** After this long on one tap, the server is probably starting up: say so instead of a bare spinner. */
const SLOW_BUTTON_MS = 4000;

function Button({ label, onPress, variant = 'primary', loading, disabled, leading, style }: ButtonProps) {
  const primary = variant === 'primary';
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), SLOW_BUTTON_MS);
    return () => clearTimeout(t);
  }, [loading]);
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={label}
      style={[styles.btn, primary ? styles.btnPrimary : styles.btnSecondary, disabled && styles.btnDisabled, style]}
    >
      {loading ? (
        slow ? (
          <View style={styles.btnConnecting}>
            <ActivityIndicator size="small" color={primary ? C.lime : C.forest} />
            <Text style={[styles.btnText, !primary && styles.btnTextSecondary]}>Connecting…</Text>
          </View>
        ) : (
          <ActivityIndicator color={primary ? C.lime : C.forest} />
        )
      ) : (
        <>
          {leading}
          <Text style={[styles.btnText, !primary && styles.btnTextSecondary]}>{label}</Text>
        </>
      )}
    </PressScale>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  icon: IconName;
  inputRef?: React.Ref<TextInput>;
  right?: ReactNode;
  footer?: ReactNode;
  invalid?: boolean;
};

/** Label, field with a green focus ring, optional accessory and helper. */
function Field({ label, icon, inputRef, right, footer, invalid = false, onFocus, onBlur, style, ...input }: FieldProps) {
  const focus = useSharedValue(0);
  const [focused, setFocused] = useState(false);
  const box = useAnimatedStyle(
    () => ({
      borderColor: interpolateColor(focus.value, [0, 1], [invalid ? C.dangerLine : C.line, C.green]),
      shadowOpacity: focus.value * 0.16,
    }),
    [invalid],
  );
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Animated.View style={[styles.inputBox, box]}>
        <Feather name={icon} size={18} color={focused ? C.green : C.muted} />
        <TextInput
          ref={inputRef}
          style={[styles.input, style]}
          placeholderTextColor={C.muted}
          selectionColor={C.green}
          onFocus={e => {
            setFocused(true);
            focus.value = withTiming(1, { duration: 180 });
            onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            focus.value = withTiming(0, { duration: 180 });
            onBlur?.(e);
          }}
          {...input}
        />
        {right}
      </Animated.View>
      {footer}
    </View>
  );
}

function EyeToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={10}
      style={styles.eye}
      accessibilityRole="button"
      accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
    >
      <Feather name={hidden ? 'eye-off' : 'eye'} size={18} color={C.muted} />
    </Pressable>
  );
}

function Checkbox({
  checked,
  onToggle,
  label,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  children: ReactNode;
}) {
  const v = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    v.value = withSpring(checked ? 1 : 0, SOFT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked]);
  const box = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(v.value, [0, 1], [C.white, C.green]),
    borderColor: interpolateColor(v.value, [0, 1], [C.disabled, C.green]),
  }));
  const tick = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.4 + v.value * 0.6 }] }));
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={6}
      style={styles.checkRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.checkbox, box]}>
        <Animated.View style={tick}>
          <Feather name="check" size={13} color={C.white} />
        </Animated.View>
      </Animated.View>
      {children}
    </Pressable>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      exiting={FadeOut.duration(160)}
      style={styles.banner}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Feather name="alert-circle" size={16} color={C.danger} />
      <Text style={styles.bannerText}>{message}</Text>
    </Animated.View>
  );
}



/** Bottom sheet with a dimmed backdrop; tapping outside closes it. */
function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          entering={SlideInDown.springify().damping(20)}
          style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}
        >
          <View style={styles.grabber} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.sheetClose} accessibilityLabel="Close">
              <Feather name="x" size={18} color={C.body} />
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Opens the phone's email app on its inbox (not a compose screen, not the browser). */
async function openEmailApp() {
  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
        category: 'android.intent.category.APP_EMAIL',
        flags: 0x10000000, // FLAG_ACTIVITY_NEW_TASK: start it as its own app
      });
      return;
    } catch {
      // No default email app set; try Gmail directly.
    }
    try {
      IntentLauncher.openApplication('com.google.android.gm');
      return;
    } catch {
      // Gmail not installed either.
    }
    await Linking.openURL('https://mail.google.com').catch(() => {});
    return;
  }
  await Linking.openURL('message:').catch(() => {});
}

/** Last sign-up step: the account exists and the verification email is on its way. */
function VerifyEmailStep({ email, onGoToLogin }: { email: string; onGoToLogin: () => void }) {
  const display = useDisplayFont();
  // The signup email was just sent; the server won't send another for 60 seconds.
  const [cooldown, setCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || resending || !email) return;
    setResending(true);
    setResendStatus(null);
    try {
      const res = await authService.resendVerificationEmail(email);
      setResendStatus(res.message || 'Link resent!');
      setCooldown(typeof res.retryAfterSeconds === 'number' ? res.retryAfterSeconds : 60);
    } catch (err: any) {
      setResendStatus(err.message || 'Failed to resend');
    } finally {
      setResending(false);
    }
  };

  const resendLabel =
    cooldown > 0
      ? cooldown > 3600
        ? 'Resend tomorrow'
        : cooldown > 90
          ? `Resend in ${Math.ceil(cooldown / 60)} min`
          : `Resend in 0:${cooldown < 10 ? '0' : ''}${cooldown}`
      : 'Resend link';

  return (
    <View style={styles.vsWrap}>
      <Animated.View entering={ZoomIn.duration(300)} style={styles.vsArt}>
        <Feather name="mail" size={48} color={C.forest} />
        <View style={styles.vsTick}>
          <Feather name="check" size={16} color={C.forest} />
        </View>
      </Animated.View>
      <Text style={[styles.vsTitle, display]} accessibilityRole="header">
        Check your inbox
      </Text>
      <Text style={styles.vsSub}>We sent a verification link to</Text>
      <View style={styles.vsEmailPill}>
        <Text style={styles.vsEmail} numberOfLines={1}>
          {email}
        </Text>
      </View>
      <Text style={styles.vsHint}>
        Tap the link in the email within 15 minutes to activate your account. Can’t find it? Check Spam or
        Promotions.
      </Text>
      {resendStatus ? (
        <Animated.Text entering={FadeIn.duration(180)} style={styles.vsNotice} accessibilityLiveRegion="polite">
          {resendStatus}
        </Animated.Text>
      ) : null}

      <View style={styles.formSpacer} />
      <Button
        label="Open email app"
        onPress={openEmailApp}
        leading={<Feather name="external-link" size={16} color={C.lime} style={{ marginRight: 8 }} />}
      />
      <Pressable
        onPress={handleResend}
        disabled={cooldown > 0 || resending}
        hitSlop={8}
        style={styles.vsResendRow}
        accessibilityRole="button"
        accessibilityLabel={resendLabel}
      >
        {resending ? (
          <ActivityIndicator size="small" color={C.green} />
        ) : (
          <Text style={styles.vsResendText}>
            Didn’t get it?{' '}
            <Text style={[styles.vsResendLink, cooldown > 0 && styles.vsResendWait]}>{resendLabel}</Text>
          </Text>
        )}
      </Pressable>
      <Pressable onPress={onGoToLogin} hitSlop={8} style={styles.vsLogin} accessibilityRole="button">
        <Text style={styles.vsLoginText}>Go to Log in</Text>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Google sign-in (one-tap card for the last used account)            */
/* ------------------------------------------------------------------ */

interface GoogleAuthButtonProps {
  loading: boolean;
  setLoading: (val: boolean) => void;
  /** Sign up: never show the "Last used" card, and always open Google's account list. */
  alwaysPickAccount?: boolean;
}

const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({ loading, setLoading, alwaysPickAccount = false }) => {
  const [lastGoogleUser, setLastGoogleUser] = useState<LastGoogleUser | null>(() =>
    authService.getLastGoogleUser(),
  );

  useEffect(() => {
    setLastGoogleUser(authService.getLastGoogleUser());
  }, []);

  const signIn = async (forceSwitch: boolean) => {
    const webClientId = getGoogleWebClientId();
    if (Platform.OS === 'web' || !webClientId) {
      showGlobalAlert(
        'Mobile Feature',
        'Google Sign-In is only supported on the mobile app. Please sign in using your Email & Password.',
      );
      return;
    }
    setLoading(true);
    try {
      await authService.signInWithGoogleNative(forceSwitch);
      setLastGoogleUser(authService.getLastGoogleUser());
    } catch (e: any) {
      if (
        e.message?.includes('developer error') ||
        e.code === 'DEVELOPER_ERROR' ||
        e.message?.includes('DEVELOPER_ERROR')
      ) {
        showGlobalAlert(
          'Configuration Notice',
          'Google Web Client ID is mismatching, or your SHA-1 fingerprint is not configured in the Google Cloud Console for Android Package Name (com.regentmoney). Please check settings.',
        );
      } else if (e.code === 'SIGN_IN_CANCELLED' || e.message?.includes('cancelled')) {
        console.log('[Auth] Google Sign-In cancelled.');
      } else {
        showGlobalAlert('Google Sign-In Failed', e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (lastGoogleUser?.email && !alwaysPickAccount) {
    const displayName = lastGoogleUser.name || lastGoogleUser.email.split('@')[0];
    const firstName = displayName.split(' ')[0];
    const initial = (lastGoogleUser.name || lastGoogleUser.email).charAt(0).toUpperCase();

    return (
      <View>
        <PressScale
          onPress={() => signIn(false)}
          disabled={loading}
          style={styles.lastUser}
          accessibilityLabel={`Continue with Google as ${firstName}`}
        >
          {lastGoogleUser.photo ? (
            <Image source={{ uri: lastGoogleUser.photo }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
          <View style={styles.lastUserMeta}>
            <View style={styles.lastUserRow}>
              <Text style={styles.lastUserName} numberOfLines={1}>
                Continue as {firstName}
              </Text>
              <View style={styles.lastUsedPill}>
                <Text style={styles.lastUsedText} numberOfLines={1}>
                  Last used
                </Text>
              </View>
            </View>
            <Text style={styles.lastUserEmail} numberOfLines={1}>
              {lastGoogleUser.email}
            </Text>
          </View>
          <View style={styles.googleBadge}>
            {loading ? (
              <ActivityIndicator size="small" color={C.green} />
            ) : (
              <Ionicons name="logo-google" size={16} color={C.ink} />
            )}
          </View>
        </PressScale>

        <Pressable
          onPress={() => signIn(true)}
          disabled={loading}
          hitSlop={6}
          style={styles.switchAccount}
          accessibilityRole="button"
        >
          <Feather name="repeat" size={13} color={C.greenDeep} />
          <Text style={styles.switchAccountText}>Use another Google account</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Button
      variant="secondary"
      label="Continue with Google"
      leading={<Ionicons name="logo-google" size={18} color={C.ink} style={styles.btnIcon} />}
      onPress={() => signIn(alwaysPickAccount)}
      loading={loading}
    />
  );
};

/* ------------------------------------------------------------------ */
/* 1. Welcome and 1B. Auth landing                                    */
/* ------------------------------------------------------------------ */

/** Display font (Bricolage) once it is loaded, bold system font until then. */
function useDisplayFont() {
  const [loaded] = useFonts({ BricolageGrotesque_800ExtraBold });
  return loaded
    ? ({ fontFamily: 'BricolageGrotesque_800ExtraBold' } as const)
    : ({ fontWeight: '800' } as const);
}

/** 1845000 -> "18,45,000" (Indian grouping, no Intl needed on Hermes). */
function formatINR(n: number) {
  const s = String(Math.round(n));
  if (s.length <= 3) return s;
  const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${head},${s.slice(-3)}`;
}

/** Counts from 0 up to target with an ease-out curve. */
function useCountUp(target: number, delay: number, duration: number, enabled: boolean) {
  const [value, setValue] = useState(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = Date.now() + delay;
    const tick = () => {
      const t = Math.min(1, Math.max(0, (Date.now() - start) / duration));
      setValue(Math.round(target * (1 - Math.pow(1 - t, 4))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return value;
}

/** A soft band of light that sweeps across a card every few seconds. */
function Sheen({ width, delay, tint }: { width: number; delay: number; tint: string }) {
  const reduceMotion = useReducedMotion();
  const x = useSharedValue(-140);
  useEffect(() => {
    if (reduceMotion) return;
    x.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(width + 140, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
          withDelay(4800, withTiming(-140, { duration: 0 })),
        ),
        -1,
        false,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, width]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { skewX: '-18deg' }] }));
  if (reduceMotion) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.sheen, style]}>
      <LinearGradient
        colors={['transparent', tint, 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

/** Gentle up-and-down drift, started once the entry animation is done. */
function useFloat(distance: number, duration: number, delay: number) {
  const reduceMotion = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    y.value = withDelay(
      delay,
      withRepeat(withTiming(-distance, { duration, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);
  return useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
}

const SORTED = [
  { icon: 'arrow-down-left' as IconName, name: 'Salary credited', amount: '+₹45,000', tag: 'Income' },
  { icon: 'home' as IconName, name: 'House rent', amount: '₹14,000', tag: 'Rent' },
];

const STACK_H = 392;
const CHART_H = 120;
const GOAL_C = 2 * Math.PI * 14; // goal ring circumference

/**
 * Welcome hero: a forest "saved this month" card whose number counts up while a lime
 * growth line draws in, a small goal chip filling its ring, and a white "sorted for you"
 * card rising over it with rows that slide in and get tagged. Then the stack drifts.
 */
function WelcomeHero({ width }: { width: number }) {
  const reduceMotion = useReducedMotion();
  const display = useDisplayFont();
  const amount = useCountUp(18450, 500, 1800, !reduceMotion);

  const line = useSharedValue(reduceMotion ? 0 : 1);
  const area = useSharedValue(reduceMotion ? 1 : 0);
  const pulse = useSharedValue(0);
  const goal = useSharedValue(reduceMotion ? 1 : 0);
  const float = useFloat(4, 2500, 2600);

  useEffect(() => {
    if (reduceMotion) return;
    line.value = withDelay(500, withTiming(0, { duration: 1800, easing: Easing.bezier(0.65, 0, 0.35, 1) }));
    area.value = withDelay(1600, withTiming(1, { duration: 1200 }));
    goal.value = withDelay(1500, withTiming(1, { duration: 1200, easing: Easing.bezier(0.65, 0, 0.35, 1) }));
    pulse.value = withDelay(2400, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  // Chart path, scaled so the end dot sits on the card's inner right edge.
  const endX = width - 24;
  const sx = endX / 318;
  const P = (x: number, y: number) => `${(x * sx).toFixed(1)} ${y}`;
  const curve = `M${P(0, 100)} C ${P(40, 96)}, ${P(58, 74)}, ${P(90, 78)} S ${P(140, 100)}, ${P(170, 74)} S ${P(225, 40)}, ${P(255, 50)} S ${P(300, 28)}, ${P(318, 16)}`;
  const fill = `${curve} L ${P(318, CHART_H)} L ${P(0, CHART_H)} Z`;
  const DASH = Math.ceil(width * 1.6);

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: DASH * line.value }));
  const areaProps = useAnimatedProps(() => ({ opacity: area.value }));
  const endProps = useAnimatedProps(() => ({ opacity: area.value }));
  const pulseProps = useAnimatedProps(() => ({ r: 5 + pulse.value * 9, opacity: 0.5 * (1 - pulse.value) * area.value }));
  const goalProps = useAnimatedProps(() => ({ strokeDashoffset: GOAL_C - GOAL_C * 0.65 * goal.value }));

  return (
    <Animated.View style={[{ width, height: STACK_H }, float]}>
      {/* Balance card */}
      <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(100).duration(800)} style={styles.balanceCard}>
        <Sheen width={width} delay={2600} tint="rgba(255,255,255,0.09)" />
        <Text style={styles.balanceLabel}>Saved this month</Text>
        <Text style={[styles.balanceValue, display]}>₹{formatINR(amount)}</Text>
        <Text style={styles.balanceDelta}>+₹6,200 vs last month</Text>

        <Svg width={width} height={CHART_H} style={styles.chart} pointerEvents="none">
          <AnimatedPath d={fill} fill="rgba(184,243,107,0.07)" animatedProps={areaProps} />
          <AnimatedPath
            d={curve}
            fill="none"
            stroke={C.lime}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={`${DASH} ${DASH}`}
            animatedProps={lineProps}
          />
          <AnimatedCircle cx={endX} cy={16} fill={C.lime} animatedProps={pulseProps} />
          <AnimatedCircle cx={endX} cy={16} r={5} fill={C.lime} stroke={C.forest} strokeWidth={2.5} animatedProps={endProps} />
        </Svg>

        {/* Goal chip */}
        <Animated.View
          entering={reduceMotion ? undefined : ZoomIn.delay(1300).springify().damping(14)}
          style={styles.goalChip}
        >
          <View style={styles.goalRing}>
            <Svg width={32} height={32} style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle cx={16} cy={16} r={14} fill="none" stroke={C.mist} strokeWidth={3.5} />
              <AnimatedCircle
                cx={16}
                cy={16}
                r={14}
                fill="none"
                stroke={C.forest}
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeDasharray={`${GOAL_C} ${GOAL_C}`}
                animatedProps={goalProps}
              />
            </Svg>
            <View style={[StyleSheet.absoluteFill, styles.centerBox]}>
              <Ionicons name="bicycle-outline" size={14} color={C.forest} />
            </View>
          </View>
          <View>
            <Text style={styles.goalName}>First bike</Text>
            <Text style={styles.goalMeta}>65% saved</Text>
          </View>
        </Animated.View>
      </Animated.View>

      {/* Sorted card */}
      <Animated.View
        entering={reduceMotion ? undefined : FadeInDown.delay(1000).duration(800)}
        style={styles.sortedCard}
      >
        <Sheen width={width} delay={2900} tint="rgba(11,61,44,0.035)" />
        <View style={styles.sortedHead}>
          <Text style={[styles.sortedTitle, display]}>Sorted for you today</Text>
          <Text style={styles.sortedAuto}>Auto</Text>
        </View>
        {SORTED.map((row, i) => (
          <Animated.View
            key={row.name}
            entering={reduceMotion ? undefined : FadeInLeft.delay(1500 + i * 250).duration(600)}
            style={[styles.sortedRow, i > 0 && styles.sortedRowLine]}
          >
            <View style={styles.sortedIcon}>
              <Feather name={row.icon} size={16} color={C.forest} />
            </View>
            <View style={styles.sortedMeta}>
              <Text style={styles.sortedName} numberOfLines={1}>
                {row.name}
              </Text>
              <Text style={styles.sortedAmount}>{row.amount}</Text>
            </View>
            <Animated.View
              entering={reduceMotion ? undefined : ZoomIn.delay(1900 + i * 250).springify().damping(13)}
              style={styles.sortedTag}
            >
              <Feather name="check" size={11} color={C.lime} />
              <Text style={styles.sortedTagText}>{row.tag}</Text>
            </Animated.View>
          </Animated.View>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Welcome back hero: a forest ring (like the profile avatar) holding a rupee coin.
 * The coin flips now and then; everything around it stays quiet: the hero fades up once,
 * the badge fades in after it, and a single halo breathes in opacity only.
 */
function WelcomeBackHero() {
  const reduceMotion = useReducedMotion();
  const display = useDisplayFont();
  const glow = useSharedValue(0);
  const flip = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    flip.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withDelay(1900, withTiming(360, { duration: 700, easing: Easing.inOut(Easing.cubic) })),
          withTiming(0, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
    glow.value = withDelay(
      700,
      withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const halo = useAnimatedStyle(() => ({ opacity: reduceMotion ? 0.3 : 0.18 + glow.value * 0.32 }));
  const coin = useAnimatedStyle(() => ({ transform: [{ perspective: 400 }, { rotateY: `${flip.value}deg` }] }));

  return (
    <View style={styles.backHero}>
      <Animated.View
        entering={reduceMotion ? undefined : FadeInDown.delay(80).duration(520).easing(Easing.out(Easing.cubic))}
        style={styles.backRingWrap}
      >
        <Animated.View style={[styles.backPulse, { transform: [{ scale: 1.25 }] }, halo]} />
        <View style={styles.backRing}>
          <View style={styles.backRingInner}>
            <Animated.View style={[styles.backCoin, coin]}>
              <Text style={[styles.backCoinText, display]}>₹</Text>
            </Animated.View>
          </View>
        </View>
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.delay(420).duration(400)}
          style={styles.backBadge}
        >
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path d="M12 2.5l2.1 6.1 6.4 2.1-6.4 2.1L12 19l-2.1-6.2-6.4-2.1 6.4-2.1z" fill={C.forest} />
            <Path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" fill={C.forest} />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function LegalNotice() {
  return (
    <Text style={styles.notice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
      By continuing you accept our{' '}
      <Text style={styles.noticeLink} onPress={openTerms}>
        Terms
      </Text>{' '}
      and{' '}
      <Text style={styles.noticeLink} onPress={openPrivacy}>
        Privacy
      </Text>
    </Text>
  );
}

/** "Terms of Service · Privacy Policy" links at the foot of the Log in screen. */
function LegalLinks() {
  return (
    <View style={styles.legalLinks}>
      <Pressable onPress={openTerms} hitSlop={10} accessibilityRole="link">
        <Text style={styles.legalLinkText}>Terms of Service</Text>
      </Pressable>
      <Text style={styles.legalDot}>·</Text>
      <Pressable onPress={openPrivacy} hitSlop={10} accessibilityRole="link">
        <Text style={styles.legalLinkText}>Privacy Policy</Text>
      </Pressable>
    </View>
  );
}

function Landing({ navigation, returning }: { navigation: any; returning: boolean }) {
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const [loading, setLoading] = useState(false);
  const display = useDisplayFont();

  // Once onboarding is over, ask for notifications with the system dialog, right here in
  // the app. If refused, it is asked again 7 days later. A short delay lets the page draw first.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const timer = setTimeout(() => {
      notificationService.requestPermissionIfDue().catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, []);

  const heroW = Math.min(W - 48, 380);
  // Shrink the card stack on short screens so the buttons always fit.
  const scale = Math.max(0.72, Math.min(1, (H - insets.top - insets.bottom - 420) / STACK_H));

  const primary = returning ? { label: 'Log in', to: 'Login' } : { label: 'Get started', to: 'Signup' };
  const swap = returning
    ? { prompt: 'New here?', label: 'Create account', to: 'Signup' }
    : { prompt: 'Have an account?', label: 'Log in', to: 'Login' };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <StatusBar style="dark" />
      <Backdrop />

      <Animated.View entering={FadeIn.duration(600)} style={styles.landingLogo}>
        <BrandWordmark size={18} />
      </Animated.View>

      <View style={styles.landingVisual}>
        {returning ? (
          <View style={styles.centerBox}>
            <WelcomeBackHero />
            <Animated.Text entering={FadeInDown.delay(220).duration(600)} style={[styles.backTitle, display]}>
              Welcome back
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(280).duration(600)} style={styles.backSub}>
              Good to see you again
            </Animated.Text>
          </View>
        ) : (
          <View style={{ width: heroW, height: STACK_H * scale }}>
            <View style={{ width: heroW, height: STACK_H, transform: [{ scale }], transformOrigin: 'top' as any }}>
              <WelcomeHero width={heroW} />
            </View>
          </View>
        )}
      </View>

      <View style={styles.landingActions}>
        {!returning && (
          <>
            <Animated.Text entering={FadeInDown.delay(300).duration(600)} style={[styles.headline, display]}>
              Your money, sorted.
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(380).duration(600)} style={styles.subline}>
              Track, budget and save in one place.
            </Animated.Text>
          </>
        )}

        <Animated.View entering={FadeInDown.delay(460).duration(600)}>
          <Button label={primary.label} onPress={() => navigation.navigate(primary.to)} disabled={loading} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(520).duration(600)} style={styles.buttonGap}>
          <GoogleAuthButton loading={loading} setLoading={setLoading} />
        </Animated.View>

        <Animated.View entering={FadeIn.delay(600).duration(600)} style={styles.swapRow}>
          <Text style={styles.switchLabel}>{swap.prompt} </Text>
          <Pressable onPress={() => navigation.navigate(swap.to)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>{swap.label}</Text>
          </Pressable>
        </Animated.View>

        {/* Returning users have already accepted the Terms (asked once after signing in), so the
            Welcome back screen doesn't repeat it. */}
        {!returning && (
          <Animated.View entering={FadeIn.delay(660).duration(600)} style={styles.legalWrap}>
            <LegalNotice />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

export const WelcomeScreen = ({ navigation }: { navigation: any }) => (
  <Landing navigation={navigation} returning={false} />
);

/** For returning or logged-out users: Log in comes first. */
export const AuthLandingScreen = ({ navigation }: { navigation: any }) => (
  <Landing navigation={navigation} returning />
);

const landingStyles = {
  /* landing */
  landingLogo: { alignItems: 'center', paddingTop: 24 },
  landingVisual: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 0, paddingHorizontal: 24 },
  headline: { fontSize: 30, lineHeight: 34, color: C.ink, letterSpacing: -0.8 },
  subline: { marginTop: 8, marginBottom: 24, fontSize: 15, lineHeight: 22, color: C.body },
  swapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  buttonGap: { marginTop: 12 },
  landingActions: { paddingHorizontal: 24, paddingBottom: 8 },
  legalWrap: { marginTop: 8 },

  /* welcome hero */
  balanceCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 264,
    padding: 24,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: C.forest,
    shadowColor: C.forest,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 10,
  },
  balanceLabel: { fontSize: 13, lineHeight: 16, fontWeight: '500', color: C.mistInk, letterSpacing: 0.2 },
  balanceValue: {
    marginTop: 8,
    fontSize: 40,
    lineHeight: 46,
    color: C.white,
    letterSpacing: -1.3,
    fontVariant: ['tabular-nums'] as any,
  },
  balanceDelta: { marginTop: 4, fontSize: 13, lineHeight: 16, fontWeight: '500', color: C.lime },
  chart: { position: 'absolute', left: 0, top: 112 },
  sheen: { position: 'absolute', top: -40, bottom: -40, left: 0, width: 110 },
  goalChip: {
    position: 'absolute',
    top: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: 16,
    backgroundColor: C.white,
  },
  goalRing: { width: 32, height: 32 },
  goalName: { fontSize: 12, lineHeight: 15, fontWeight: '600', color: C.ink },
  goalMeta: { fontSize: 11, lineHeight: 14, color: C.body, fontVariant: ['tabular-nums'] as any },

  sortedCard: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 214,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 4,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    shadowColor: C.forest,
    shadowOpacity: 0.16,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  sortedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 22, marginBottom: 2 },
  sortedTitle: { fontSize: 15, color: C.ink, letterSpacing: -0.2 },
  sortedAuto: { fontSize: 12, color: C.body },
  sortedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 60 },
  sortedRowLine: { borderTopWidth: 1, borderTopColor: C.lineSoft },
  sortedIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: C.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortedMeta: { flex: 1, minWidth: 0 },
  sortedName: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: C.ink },
  sortedAmount: { fontSize: 12.5, lineHeight: 16, color: C.body, fontVariant: ['tabular-nums'] as any },
  sortedTag: {
    width: 78,
    height: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 9,
    backgroundColor: C.forest,
  },
  sortedTagText: { fontSize: 11.5, fontWeight: '600', color: C.lime },

  /* welcome back hero */
  backHero: { alignItems: 'center', justifyContent: 'center' },
  backRingWrap: { width: 190, height: 190, alignItems: 'center', justifyContent: 'center' },
  backPulse: { position: 'absolute', width: 190, height: 190, borderRadius: 95, borderWidth: 1, borderColor: C.forest },
  backRing: { width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: C.forest, padding: 5 },
  backRingInner: { flex: 1, borderRadius: 70, backgroundColor: C.mist, alignItems: 'center', justifyContent: 'center' },
  backCoin: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: C.forest,
    borderWidth: 4,
    borderColor: '#2E5A3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backCoinText: { fontSize: 38, lineHeight: 46, color: C.lime },
  backBadge: {
    position: 'absolute',
    right: 14,
    top: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: C.bg,
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backTitle: { marginTop: 28, fontSize: 28, lineHeight: 34, color: C.ink, letterSpacing: -0.6, textAlign: 'center' },
  backSub: { marginTop: 6, fontSize: 15, lineHeight: 22, color: C.body, textAlign: 'center' },
} as const;

/* ------------------------------------------------------------------ */
/* Shared form header                                                 */
/* ------------------------------------------------------------------ */

/**
 * Centred wordmark, the animated icon tile, then the title. The same on Log in and Sign up,
 * so both line up. No back arrow: phones have their own back (button or gesture).
 */
function FormHeader({ title, icon }: { title: string; icon: ReactNode }) {
  const display = useDisplayFont();
  return (
    <>
      <Animated.View entering={FadeIn.duration(400)} style={styles.formTop}>
        <BrandWordmark size={15} />
      </Animated.View>
      {/* A plain fade, no spring zoom: the tile just appears. */}
      <Animated.View entering={FadeIn.delay(60).duration(400)} style={styles.iconTile}>
        {icon}
      </Animated.View>
      <Animated.Text entering={FadeInDown.delay(120).duration(550)} style={[styles.formTitle, display]}>
        {title}
      </Animated.Text>
    </>
  );
}

/** Lock that sits still and gives one small tilt when it opens or closes (while you type the password). */
function LockIcon({ open }: { open: boolean }) {
  const reduceMotion = useReducedMotion();
  const swing = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false; // no tilt when the screen opens
      return;
    }
    if (reduceMotion) return;
    swing.value = withSequence(
      withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 220, easing: Easing.inOut(Easing.quad) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${swing.value * -8}deg` }] }));
  return (
    <Animated.View style={style}>
      <Feather name={open ? 'unlock' : 'lock'} size={26} color={C.forest} />
    </Animated.View>
  );
}

function OrDivider() {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>or</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

/**
 * Cloudflare check + rate-limit state shared by Log in and Sign up.
 * Turnstile tokens are single use, so `refresh()` remounts the widget for a new one
 * after every attempt. `rateLimit(s)` starts a live countdown after a 429.
 */
function useHumanCheck() {
  const [token, setToken] = useState('');
  const [widgetKey, setWidgetKey] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldown(left);
      if (left <= 0) setCooldownUntil(null);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  return {
    token,
    setToken,
    widgetKey,
    cooldown,
    refresh: () => {
      setToken('');
      setWidgetKey(k => k + 1);
    },
    rateLimit: (seconds: number) => setCooldownUntil(Date.now() + Math.max(1, seconds) * 1000),
  };
}

const formatRemainingTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s < 10 ? '0' : ''}${s}s`;
  return `${s}s`;
};

/* ------------------------------------------------------------------ */
/* 2. Login                                                           */
/* ------------------------------------------------------------------ */

/** On web, browsers paint autofilled inputs light blue. Keep them white. */
function useWebAutofillFix() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById('rm-autofill-fix')) return;
    const el = document.createElement('style');
    el.id = 'rm-autofill-fix';
    el.textContent = `
      input:-webkit-autofill,
      input:-webkit-autofill:hover,
      input:-webkit-autofill:focus {
        -webkit-box-shadow: 0 0 0 1000px ${C.white} inset !important;
        -webkit-text-fill-color: ${C.ink} !important;
        caret-color: ${C.green};
        transition: background-color 9999s ease-out 0s;
      }
      input:focus { outline: none; }
    `;
    document.head.appendChild(el);
  }, []);
}

type RowProps = TextInputProps & {
  icon: IconName;
  inputRef?: React.Ref<TextInput>;
  prefix?: string;
  right?: ReactNode;
  onActive?: (active: boolean) => void;
};

/** One row inside the grouped card: icon, optional prefix, input, optional accessory. */
function GroupRow({ icon, inputRef, prefix, right, onActive, onFocus, onBlur, style, ...input }: RowProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.gRow}>
      <Feather name={icon} size={18} color={focused ? C.green : C.muted} />
      {prefix ? <Text style={styles.gPrefix}>{prefix}</Text> : null}
      <TextInput
        ref={inputRef}
        style={[styles.gInput, style]}
        placeholderTextColor={C.muted}
        selectionColor={C.green}
        accessibilityLabel={typeof input.placeholder === 'string' ? input.placeholder : undefined}
        onFocus={e => {
          setFocused(true);
          onActive?.(true);
          onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          onActive?.(false);
          onBlur?.(e);
        }}
        {...input}
      />
      {right}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Log in with an unconfirmed email                                   */
/* ------------------------------------------------------------------ */

/**
 * Shown above the log in form when the password was right but the email isn't confirmed yet
 * (the server only says so after checking the password). One tap emails a fresh link.
 */
function UnverifiedCard({
  email,
  linkExpired,
  sending,
  onSend,
}: {
  email: string;
  linkExpired: boolean;
  sending: boolean;
  onSend: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      style={styles.uvCard}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.uvTop}>
        <View style={styles.uvIcon}>
          <Feather name="mail" size={19} color={C.amberInk} />
        </View>
        <View style={styles.uvTextWrap}>
          <Text style={styles.uvTitle}>Confirm your email first</Text>
          <Text style={styles.uvBody}>
            Your password is right, but{email ? ' ' : ''}
            {email ? <Text style={styles.uvEmail}>{email}</Text> : 'your email'} isn’t confirmed yet.
            {linkExpired ? ' Your last link has expired.' : ' Check your inbox for our link.'}
          </Text>
        </View>
      </View>
      <Button
        label={linkExpired ? 'Send a new link' : 'Send another link'}
        onPress={onSend}
        loading={sending}
        style={styles.uvBtn}
      />
      <Text style={styles.uvNote}>New links work for 15 minutes</Text>
    </Animated.View>
  );
}

type LinkSheetMode = 'sent' | 'limit';

/**
 * Bottom sheet after "Send a new link": check your inbox (with resend countdown and
 * "I've confirmed, log me in"), or the daily limit message.
 */
function VerifyLinkSheet({
  visible,
  mode,
  email,
  notice,
  cooldown,
  resending,
  retrying,
  onResend,
  onRetryLogin,
  onClose,
}: {
  visible: boolean;
  mode: LinkSheetMode;
  email: string;
  notice?: string;
  cooldown: number;
  resending: boolean;
  retrying: boolean;
  onResend: () => void;
  onRetryLogin: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const display = useDisplayFont();
  const limit = mode === 'limit';
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.sheetWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          entering={SlideInDown.springify().damping(20)}
          style={[styles.sheet, styles.lsSheet, { paddingBottom: 24 + insets.bottom }]}
        >
          <View style={styles.grabber} />
          <View style={[styles.lsOrb, { backgroundColor: limit ? 'rgba(242,184,75,0.14)' : 'rgba(184,243,107,0.18)' }]}>
            <View style={[styles.lsOrb2, { backgroundColor: limit ? 'rgba(242,184,75,0.26)' : 'rgba(184,243,107,0.38)' }]}>
              <View style={[styles.lsOrb3, { backgroundColor: limit ? '#FFE3A6' : C.lime }]}>
                <Feather name={limit ? 'clock' : 'mail'} size={24} color={limit ? C.amberInk : C.forest} />
              </View>
            </View>
          </View>

          <Text style={[styles.lsTitle, display]} accessibilityRole="header">
            {limit ? 'That’s 5 links today' : 'Check your inbox'}
          </Text>
          {limit ? (
            <Text style={styles.lsBody}>
              {notice || 'To protect your inbox, we send up to 5 a day. Use the newest email we sent, or try again tomorrow.'}
            </Text>
          ) : (
            <>
              <Text style={styles.lsBody}>
                Tap the link in the next <Text style={styles.lsStrong}>15 minutes</Text>, then come back here.
              </Text>
              {!!email && (
                <View style={styles.lsPill}>
                  <Text style={styles.lsPillText} numberOfLines={1}>
                    {email}
                  </Text>
                </View>
              )}
            </>
          )}

          {!!notice && !limit && (
            <Animated.Text entering={FadeIn.duration(180)} style={styles.lsNotice} accessibilityLiveRegion="polite">
              {notice}
            </Animated.Text>
          )}

          <View style={styles.lsActions}>
            <Button
              label="Open email app"
              onPress={openEmailApp}
              leading={<Feather name="external-link" size={16} color={C.lime} style={{ marginRight: 8 }} />}
            />
            {limit ? (
              <Button variant="secondary" label="New link available tomorrow" disabled style={styles.lsSecond} />
            ) : (
              <Button
                variant="secondary"
                label="I’ve confirmed, log me in"
                onPress={onRetryLogin}
                loading={retrying}
                style={styles.lsSecond}
              />
            )}
          </View>

          {!limit && (
            <Pressable
              onPress={onResend}
              disabled={cooldown > 0 || resending}
              hitSlop={8}
              style={styles.vsResendRow}
              accessibilityRole="button"
            >
              {resending ? (
                <ActivityIndicator size="small" color={C.green} />
              ) : (
                <Text style={styles.vsResendText}>
                  Didn’t get it?{' '}
                  <Text style={[styles.vsResendLink, cooldown > 0 && styles.vsResendWait]}>
                    {cooldown > 0 ? `Resend in 0:${cooldown < 10 ? '0' : ''}${cooldown}` : 'Resend link'}
                  </Text>
                </Text>
              )}
            </Pressable>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

export const LoginScreen = ({ navigation }: { navigation: any }) => {
  useWebAutofillFix();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);
  const [emailOrMobile, setEmailOrMobile] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);
  const [rememberMe, setRememberMe] = useState(true);
  const [active, setActive] = useState(false);
  const [pwFocus, setPwFocus] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorTick, setErrorTick] = useState(0);
  const human = useHumanCheck();
  const turnstileToken = human.token;
  const setTurnstileToken = human.setToken;

  // Lockout state and live countdown
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutRemainingSec, setLockoutRemainingSec] = useState<number>(0);
  const [lockoutTier, setLockoutTier] = useState<number>(1);

  // Forgot / reset password sheet
  const [showForgotModal, setShowForgotModal] = useState<boolean>(false);
  const [resetEmail, setResetEmail] = useState<string>('');
  const [resetSending, setResetSending] = useState<boolean>(false);
  const [resetMsg, setResetMsg] = useState<{ text: string; error: boolean } | null>(null);

  // Right password, email not confirmed: card + "Send a new link" sheet
  const [unverified, setUnverified] = useState<{ email: string; linkExpired: boolean } | null>(null);
  const [linkSheet, setLinkSheet] = useState<{ mode: LinkSheetMode; notice?: string } | null>(null);
  const [sendingLink, setSendingLink] = useState(false);
  const [retryingLogin, setRetryingLogin] = useState(false);
  const [linkCooldown, setLinkCooldown] = useState(0);

  const locked = lockoutRemainingSec > 0;

  useEffect(() => {
    if (linkCooldown <= 0) return;
    const t = setInterval(() => setLinkCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [linkCooldown]);

  const fail = (message: string) => {
    setError(message);
    setErrorTick(t => t + 1);
  };

  useEffect(() => {
    if (!lockoutUntil) return;
    const tick = () => {
      const diff = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setLockoutRemainingSec(diff);
      if (diff <= 0) {
        setLockoutUntil(null);
        setError('');
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const openForgot = () => {
    if (emailOrMobile.includes('@')) setResetEmail(emailOrMobile);
    setResetMsg(null);
    setShowForgotModal(true);
  };

  const handleLogin = async (opts?: { fromSheet?: boolean }) => {
    const fromSheet = !!opts?.fromSheet;
    if (locked) {
      fail(`Your account is locked. Try again in ${formatRemainingTime(lockoutRemainingSec)} or reset your password.`);
      return;
    }
    if (!emailOrMobile.trim() || !password) {
      fail('Enter your email or mobile number and password.');
      return;
    }
    if (human.cooldown > 0) {
      fail(`Too many attempts. Try again in ${formatRemainingTime(human.cooldown)}.`);
      return;
    }
    if (!turnstileToken) {
      if (fromSheet) {
        setLinkSheet(s => (s ? { ...s, notice: 'Finishing a quick security check. Try again in a moment.' } : s));
        return;
      }
      fail('Complete the security check to continue.');
      return;
    }
    setError('');
    if (fromSheet) setRetryingLogin(true);
    else setLoading(true);
    try {
      await authService.logIn(emailOrMobile, password, rememberMe, turnstileToken);
      setUnverified(null);
      setLinkSheet(null);
    } catch (e: any) {
      human.refresh();
      if (e.code === 'EMAIL_NOT_VERIFIED') {
        setUnverified({
          email: e.email || (emailOrMobile.includes('@') ? emailOrMobile.trim().toLowerCase() : ''),
          linkExpired: e.linkExpired !== false,
        });
        setError('');
        if (fromSheet) {
          setLinkSheet(s => (s ? { ...s, notice: 'Not confirmed yet. Tap the link in your email first.' } : s));
        }
        return;
      }
      if (fromSheet) setLinkSheet(null);
      if (e.rateLimited) {
        // the live countdown banner replaces the error text
        human.rateLimit(e.retryAfterSeconds || 60);
        setError('');
        return;
      }
      if (e.locked || e.status === 423) {
        setLockoutUntil(e.lockedUntil || Date.now() + (e.remainingSeconds || 1800) * 1000);
        setLockoutTier(e.tier || 1);
        setLockoutRemainingSec(e.remainingSeconds || 1800);
        fail(e.message || 'Account locked due to 3 failed attempts.');
      } else {
        fail(e.message);
      }
    } finally {
      setLoading(false);
      setRetryingLogin(false);
    }
  };

  /** Emails a fresh verification link to the unconfirmed account, then shows the right sheet. */
  const sendNewLink = async () => {
    const email = unverified?.email;
    if (!email) {
      fail('Log in with your email address to get a new link.');
      return;
    }
    setSendingLink(true);
    try {
      const res = await authService.resendVerificationEmail(email);
      const wait = typeof res.retryAfterSeconds === 'number' ? res.retryAfterSeconds : 60;
      if (res.sent) {
        setLinkCooldown(wait);
        setLinkSheet({ mode: 'sent' });
        setUnverified(u => (u ? { ...u, linkExpired: false } : u));
      } else if (wait > 3600) {
        setLinkSheet({ mode: 'limit', notice: res.message });
      } else if (wait > 0) {
        // A link went out moments ago: that one is still good.
        setLinkCooldown(wait);
        setLinkSheet({ mode: 'sent', notice: res.message });
      } else {
        // Already confirmed in the meantime: just log in.
        setUnverified(null);
        handleLogin();
      }
    } catch (err: any) {
      fail(err?.message || 'Couldn’t send a new link. Try again.');
    } finally {
      setSendingLink(false);
    }
  };

  const handleSendResetLink = async () => {
    const targetEmail = resetEmail.trim() || (emailOrMobile.includes('@') ? emailOrMobile.trim() : '');
    if (!targetEmail || !targetEmail.includes('@')) {
      setResetMsg({ text: 'Enter the email address you signed up with.', error: true });
      return;
    }
    setResetSending(true);
    setResetMsg(null);
    try {
      const res = await authService.requestPasswordReset(targetEmail);
      setResetMsg({ text: res.message || 'Reset link sent. Check your inbox to unlock right away.', error: false });
    } catch (err: any) {
      setResetMsg({ text: err.message || 'Couldn’t send the reset link. Try again.', error: true });
    } finally {
      setResetSending(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <Backdrop />
      <KeyboardScreen
        contentContainerStyle={[styles.form, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        <FormHeader title="Let’s get you in" icon={<LockIcon open={pwFocus || password.length > 0} />} />
        <View style={styles.formGap} />

        {locked ? (
          <Animated.View entering={FadeInDown.duration(300)} style={[styles.banner, styles.lockout]}>
            <View style={styles.lockoutHead}>
              <Feather name="lock" size={16} color={C.danger} />
              <Text style={styles.lockoutTitle}>
                {lockoutTier === 2 ? 'Account locked for 24 hours' : 'Account locked for 30 minutes'}
              </Text>
            </View>
            <View style={styles.lockoutTimer}>
              <Feather name="clock" size={14} color={C.ink} />
              <Text style={styles.lockoutTimerText}>Try again in {formatRemainingTime(lockoutRemainingSec)}</Text>
            </View>
            <Text style={styles.lockoutBody}>
              There were 3 failed attempts. Reset your password by email to unlock right away.
            </Text>
            <PressScale onPress={openForgot} style={styles.lockoutBtn} accessibilityLabel="Reset password to unlock">
              <Text style={styles.lockoutBtnText}>Reset password to unlock</Text>
            </PressScale>
          </Animated.View>
        ) : human.cooldown > 0 ? (
          <ErrorBanner message={`Too many attempts. Try again in ${formatRemainingTime(human.cooldown)}.`} />
        ) : error ? (
          <ErrorBanner key={errorTick} message={error} />
        ) : unverified ? (
          <UnverifiedCard
            email={unverified.email}
            linkExpired={unverified.linkExpired}
            sending={sendingLink}
            onSend={sendNewLink}
          />
        ) : null}

        <Animated.View
          entering={FadeInDown.delay(160).duration(550)}
          style={[styles.group, active && styles.groupActive]}
        >
          <GroupRow
            icon="user"
            placeholder="Email or mobile number"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="username"
            returnKeyType="next"
            value={emailOrMobile}
            onChangeText={v => {
              setEmailOrMobile(v);
              setUnverified(null);
            }}
            onSubmitEditing={() => passwordRef.current?.focus()}
            onActive={setActive}
          />
          <View style={styles.gDivider} />
          <GroupRow
            icon="lock"
            inputRef={passwordRef}
            placeholder="Password"
            secureTextEntry={secureText}
            autoCapitalize="none"
            textContentType="password"
            autoComplete="password"
            returnKeyType="go"
            value={password}
            onChangeText={v => {
              setPassword(v);
              setUnverified(null);
            }}
            onSubmitEditing={() => handleLogin()}
            onActive={setActive}
            right={<EyeToggle hidden={secureText} onToggle={() => setSecureText(s => !s)} />}
            onFocus={() => setPwFocus(true)}
            onBlur={() => setPwFocus(false)}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(550)}>
          <View style={styles.liOptions}>
            <Checkbox checked={rememberMe} onToggle={() => setRememberMe(r => !r)} label="Stay logged in for 30 days">
              <Text style={styles.checkLabel}>Stay logged in</Text>
            </Checkbox>
            <Pressable onPress={openForgot} hitSlop={8} accessibilityRole="button">
              <Text style={styles.liForgot}>Forgot password?</Text>
            </Pressable>
          </View>

          <CloudflareTurnstile
            key={human.widgetKey}
            theme="light"
            onVerify={token => {
              setTurnstileToken(token);
              setError('');
            }}
            onExpire={() => setTurnstileToken('')}
            onError={() => setTurnstileToken('')}
          />

          <Button
            label={
              locked
                ? `Locked for ${formatRemainingTime(lockoutRemainingSec)}`
                : human.cooldown > 0
                  ? `Try again in ${formatRemainingTime(human.cooldown)}`
                  : 'Log in'
            }
            onPress={() => handleLogin()}
            loading={loading}
            disabled={locked || human.cooldown > 0}
            style={styles.suSubmit}
          />
          <OrDivider />
          <GoogleAuthButton loading={googleLoading} setLoading={setGoogleLoading} />
        </Animated.View>

        <View style={styles.formSpacer} />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>New here? </Text>
          <Pressable onPress={() => navigation.navigate('Signup')} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>Create account</Text>
          </Pressable>
        </View>
        <LegalLinks />
      </KeyboardScreen>

      <VerifyLinkSheet
        visible={!!linkSheet}
        mode={linkSheet?.mode || 'sent'}
        email={unverified?.email || ''}
        notice={linkSheet?.notice}
        cooldown={linkCooldown}
        resending={sendingLink}
        retrying={retryingLogin}
        onResend={sendNewLink}
        onRetryLogin={() => handleLogin({ fromSheet: true })}
        onClose={() => setLinkSheet(null)}
      />

      <Sheet visible={showForgotModal} title="Reset your password" onClose={() => setShowForgotModal(false)}>
        <Text style={styles.sheetBody}>
          Enter the email you signed up with. We’ll send a reset link, and opening it also clears any lockout on your
          account.
        </Text>
        {resetMsg && (
          <Animated.View
            entering={FadeInDown.duration(240)}
            style={[styles.banner, !resetMsg.error && styles.bannerOk]}
            accessibilityRole="alert"
          >
            <Feather
              name={resetMsg.error ? 'alert-circle' : 'check-circle'}
              size={16}
              color={resetMsg.error ? C.danger : C.green}
            />
            <Text style={[styles.bannerText, !resetMsg.error && styles.bannerTextOk]}>{resetMsg.text}</Text>
          </Animated.View>
        )}
        <View style={styles.group}>
          <GroupRow
            icon="mail"
            placeholder="Email address"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="send"
            value={resetEmail}
            onChangeText={setResetEmail}
            onSubmitEditing={handleSendResetLink}
          />
        </View>
        <Button label="Send reset link" onPress={handleSendResetLink} loading={resetSending} style={styles.suSubmit} />
      </Sheet>
    </View>
  );
};


/* ------------------------------------------------------------------ */
/* 3. Signup                                                          */
/* ------------------------------------------------------------------ */


type StepFieldProps = TextInputProps & {
  label: string;
  inputRef?: React.Ref<TextInput>;
  prefix?: string;
  right?: ReactNode;
};

/** Outlined field with its label sitting in the top border; forest outline while focused. */
function StepField({ label, inputRef, prefix, right, onFocus, onBlur, style, ...input }: StepFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.sfBox, focused && styles.sfBoxFocused]}>
      <Text style={[styles.sfLabel, focused && styles.sfLabelFocused]}>{label}</Text>
      {prefix ? (
        <View style={styles.sfPrefix}>
          <Text style={styles.sfPrefixText}>{prefix}</Text>
        </View>
      ) : null}
      <TextInput
        ref={inputRef}
        style={[styles.sfInput, style]}
        placeholderTextColor={C.muted}
        selectionColor={C.green}
        accessibilityLabel={label}
        onFocus={e => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={e => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...input}
      />
      {right}
    </View>
  );
}

const SIGNUP_STEPS = 5; // name, email, mobile, password, terms
const VERIFY_STEP = SIGNUP_STEPS; // shown after the account is created
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign up, one question per screen: name (or Google), email, mobile, password + confirm,
 * then privacy and terms, where "I agree" creates the account. The last screen says the
 * verification email was sent.
 */
export const SignupScreen = ({ navigation }: { navigation: any }) => {
  useWebAutofillFix();
  const insets = useSafeAreaInsets();
  const display = useDisplayFont();
  const confirmRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const phoneHintAsked = useRef(false);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorTick, setErrorTick] = useState(0);
  const human = useHumanCheck();
  const turnstileToken = human.token;
  const setTurnstileToken = human.setToken;
  const [registeredEmail, setRegisteredEmail] = useState('');

  const trimmedName = name.trim();
  const firstName = trimmedName.split(/\s+/)[0] || '';
  const initials =
    trimmedName
      .split(/\s+/)
      .slice(0, 2)
      .map(p => p.charAt(0).toUpperCase())
      .join('') || '?';

  const fail = (message: string) => {
    setError(message);
    setErrorTick(t => t + 1);
  };

  const goTo = (next: number) => {
    setDir(next > step ? 1 : -1);
    setError('');
    setStep(next);
  };

  /** Error for one input step, or null when it is fine. */
  const validate = (s: number): string | null => {
    switch (s) {
      case 0:
        return trimmedName ? null : 'Enter your full name.';
      case 1:
        return EMAIL_RE.test(email.trim()) ? null : 'Enter a valid email address.';
      case 2:
        return phone.length === 10 ? null : 'Enter your 10-digit mobile number.';
      case 3:
        if (password.length < 6) return 'Use at least 6 characters for your password.';
        if (confirm !== password) return 'Passwords don’t match.';
        return null;
      default:
        return null;
    }
  };

  const handleNext = () => {
    const msg = validate(step);
    if (msg) {
      fail(msg);
      return;
    }
    goTo(step + 1);
  };

  const handleProceedToLogin = () => navigation.replace('Login');

  const handleBack = () => {
    if (step === VERIFY_STEP) handleProceedToLogin();
    else if (step > 0) goTo(step - 1);
    else if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Login');
  };

  // Mobile step: first offer Google's "Choose a phone number" sheet (Android, once per sign-up).
  // A picked number fills the field; otherwise, or on iOS, the keyboard opens as usual.
  useEffect(() => {
    if (step !== 2) return;
    if (phone || phoneHintAsked.current) {
      phoneRef.current?.focus();
      return;
    }
    phoneHintAsked.current = true;
    let stillHere = true;
    requestPhoneHint().then(picked => {
      if (picked) setPhone(picked);
      else if (stillHere) phoneRef.current?.focus();
    });
    return () => {
      stillHere = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Android back steps back through the form instead of leaving it.
  useEffect(() => {
    if (step === 0) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /** "I agree": the active consent, which also creates the account. */
  const handleSignup = async () => {
    for (let s = 0; s < SIGNUP_STEPS - 1; s++) {
      const msg = validate(s);
      if (msg) {
        goTo(s);
        fail(msg);
        return;
      }
    }
    if (human.cooldown > 0) {
      fail(`Too many attempts. Try again in ${formatRemainingTime(human.cooldown)}.`);
      return;
    }
    if (!turnstileToken) {
      fail('Complete the security check to continue.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const result = await authService.signUp(trimmedName, email.trim(), phone, password, turnstileToken);
      if (!result.sessionConfirmed) {
        setRegisteredEmail(email.trim());
        goTo(VERIFY_STEP);
      }
    } catch (e: any) {
      human.refresh();
      if (e.rateLimited) {
        // the live countdown banner replaces the error text
        human.rateLimit(e.retryAfterSeconds || 60);
        setError('');
        return;
      }
      const message: string = e.message || 'Something went wrong. Please try again.';
      // Send the person back to the screen that holds the problem field.
      if (/email/i.test(message)) goTo(1);
      else if (/phone|mobile/i.test(message)) goTo(2);
      else if (/password/i.test(message)) goTo(3);
      fail(message);
    } finally {
      setLoading(false);
    }
  };

  const heading = [
    { title: 'What should we call you?', sub: 'Your name shows on your profile and greetings.' },
    {
      title: firstName ? `Hi ${firstName}, what’s your email?` : 'What’s your email?',
      sub: 'We’ll send receipts and security alerts here.',
    },
    { title: 'Add your mobile number', sub: 'It helps us match bank SMS to your account.' },
    { title: 'Create a strong password', sub: 'Use 6 or more characters. Mixing letters and numbers makes it stronger.' },
    { title: 'Privacy and Terms', sub: 'To create your account, review how Regent Money handles your data.' },
  ][Math.min(step, SIGNUP_STEPS - 1)];

  const passwordsMatch = confirm.length > 0 && confirm === password;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <Backdrop />
      <KeyboardScreen
        contentContainerStyle={[styles.form, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        <Animated.View entering={FadeIn.duration(400)} style={styles.formTop}>
          <BrandWordmark size={15} />
        </Animated.View>

        <Animated.View
          key={step}
          entering={(dir > 0 ? FadeInRight : FadeInLeft).duration(320)}
          style={styles.suStep}
        >
          {step === VERIFY_STEP ? (
            <VerifyEmailStep email={registeredEmail} onGoToLogin={handleProceedToLogin} />
          ) : (
            <>
              <Text style={[styles.suStepTitle, display]} accessibilityRole="header">
                {heading.title}
              </Text>
              <Text style={styles.suStepSub}>{heading.sub}</Text>

              {step === SIGNUP_STEPS - 1 && human.cooldown > 0 ? (
                <ErrorBanner message={`Too many attempts. Try again in ${formatRemainingTime(human.cooldown)}.`} />
              ) : error ? (
                <ErrorBanner key={errorTick} message={error} />
              ) : null}

              {step === 0 && (
                <>
                  <StepField
                    label="Full name"
                    autoCapitalize="words"
                    textContentType="name"
                    autoComplete="name"
                    returnKeyType="next"
                    value={name}
                    onChangeText={setName}
                    onSubmitEditing={handleNext}
                  />
                  <View style={styles.suGoogle}>
                    <OrDivider />
                    <GoogleAuthButton loading={googleLoading} setLoading={setGoogleLoading} alwaysPickAccount />
                  </View>
                </>
              )}

              {step === 1 && (
                <>
                  <StepField
                    label="Email address"
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                    returnKeyType="next"
                    value={email}
                    onChangeText={setEmail}
                    onSubmitEditing={handleNext}
                  />
                  <View style={styles.suHelp}>
                    <Feather name="info" size={14} color={C.body} />
                    <Text style={styles.suHelpText}>You’ll verify it with a link we email you.</Text>
                  </View>
                </>
              )}

              {step === 2 && (
                <>
                  <StepField
                    label="Mobile number"
                    inputRef={phoneRef}
                    prefix="+91"
                    keyboardType="number-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    maxLength={10}
                    returnKeyType="next"
                    value={phone}
                    onChangeText={t => setPhone(t.replace(/\D/g, ''))}
                    onSubmitEditing={handleNext}
                  />
                  <View style={styles.suHelp}>
                    <Feather name="lock" size={14} color={C.body} />
                    <Text style={styles.suHelpText}>We never share your number.</Text>
                  </View>
                </>
              )}

              {step === 3 && (
                <>
                  <StepField
                    label="Password"
                    autoFocus
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    autoComplete="password-new"
                    returnKeyType="next"
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={() => confirmRef.current?.focus()}
                  />
                  <View style={styles.sfGap} />
                  <StepField
                    label="Confirm password"
                    inputRef={confirmRef}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    autoComplete="password-new"
                    returnKeyType="done"
                    value={confirm}
                    onChangeText={setConfirm}
                    onSubmitEditing={handleNext}
                  />
                  {confirm.length > 0 ? (
                    <View style={styles.suHelp}>
                      <Feather
                        name={passwordsMatch ? 'check' : 'x'}
                        size={15}
                        color={passwordsMatch ? C.forest : C.muted}
                      />
                      <Text style={[styles.suHelpText, passwordsMatch && styles.suMatchText]}>
                        {passwordsMatch ? 'Passwords match' : 'Passwords don’t match yet'}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.suShow}>
                    <Checkbox
                      checked={showPassword}
                      onToggle={() => setShowPassword(s => !s)}
                      label="Show password"
                    >
                      <Text style={styles.suShowText}>Show password</Text>
                    </Checkbox>
                  </View>
                </>
              )}

              {step === 4 && (
                <>
                  <View style={styles.suUser}>
                    <View style={styles.suUserAvatar}>
                      <Text style={styles.suUserInitials}>{initials}</Text>
                    </View>
                    <View style={styles.suUserMeta}>
                      <Text style={styles.suUserName} numberOfLines={1}>
                        {trimmedName}
                      </Text>
                      <Text style={styles.suUserEmail} numberOfLines={1}>
                        {email.trim()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.suTermHead}>Data we read</Text>
                  <Text style={styles.suTermBody}>
                    Bank SMS and email receipts you choose to connect, to track your spending automatically.
                  </Text>
                  <Text style={styles.suTermHead}>How we use it</Text>
                  <Text style={styles.suTermBody}>Only to build your insights. We never sell your data.</Text>
                  <Text style={styles.suTermHead}>You’re in control</Text>
                  <Text style={styles.suTermBody}>
                    Export or delete your data any time from Settings. Read the full{' '}
                    <Text style={styles.noticeLink} onPress={openTerms}>
                      Terms of Use
                    </Text>{' '}
                    and{' '}
                    <Text style={styles.noticeLink} onPress={openPrivacy}>
                      Privacy Policy
                    </Text>
                    .
                  </Text>
                  <View style={styles.suTurnstile}>
                    <CloudflareTurnstile
                      key={human.widgetKey}
                      theme="light"
                      onVerify={token => {
                        setTurnstileToken(token);
                        setError('');
                      }}
                      onExpire={() => setTurnstileToken('')}
                      onError={() => setTurnstileToken('')}
                    />
                  </View>
                </>
              )}

              <View style={styles.formSpacer} />
              <View style={styles.suFoot}>
                {step === 0 ? (
                  <Pressable onPress={() => navigation.navigate('Login')} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.suGhost}>Sign in instead</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={handleBack} hitSlop={8} accessibilityRole="button" disabled={loading}>
                    <Text style={styles.suGhost}>Back</Text>
                  </Pressable>
                )}
                {step === SIGNUP_STEPS - 1 ? (
                  <Button
                    label={human.cooldown > 0 ? `Try again in ${formatRemainingTime(human.cooldown)}` : 'I agree'}
                    onPress={handleSignup}
                    loading={loading}
                    disabled={human.cooldown > 0}
                    style={styles.suNext}
                  />
                ) : (
                  <Button label="Next" onPress={handleNext} style={styles.suNext} />
                )}
              </View>
            </>
          )}
        </Animated.View>
      </KeyboardScreen>
    </View>
  );
};


/* Spread into StyleSheet.create: { ...loginStyles, ... } (see STEP 3). */
const loginStyles = {
  liOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  liForgot: { fontSize: 14, fontWeight: '600', color: C.greenDeep },
} as const;

/* Spread into StyleSheet.create: { ...signupStyles, ... } (see STEP 3). */
const signupStyles = {
  suHead: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 20, marginBottom: 26 },
  suHeadText: { flex: 1, paddingRight: 8, paddingBottom: 4 },
  suTitle: { fontSize: 32, lineHeight: 38, fontWeight: '800', color: C.ink, letterSpacing: -0.9 },
  suSub: { marginTop: 6, fontSize: 15, lineHeight: 21, color: C.body },

  group: {
    backgroundColor: C.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 18,
    shadowColor: '#0f3d2a',
    shadowOpacity: 0.07,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  groupActive: { borderColor: C.forest, shadowColor: C.forest, shadowOpacity: 0.12 },
  gRow: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 14 },
  gDivider: { height: 1, backgroundColor: C.lineSoft, marginLeft: 32 },
  gPrefix: { fontSize: 16, fontWeight: '600', color: C.ink, marginRight: -4 },
  gInput: { flex: 1, height: '100%', fontSize: 16, color: C.ink },

  suTerms: { marginTop: 18 },
  suSubmit: { marginTop: 24 },
} as const;

/* ------------------------------------------------------------------ */
/* Styles                                                             */
/* ------------------------------------------------------------------ */

const shadow = (color: string, opacity: number, radius: number, y: number, elevation: number) => ({
  shadowColor: color,
  shadowOpacity: opacity,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: y },
  elevation,
});

const styles = StyleSheet.create({
  ...landingStyles,
  ...signupStyles,
  ...loginStyles,
  screen: {
    flex: 1,
    backgroundColor: C.bg,
    overflow: 'hidden',
    height: '100%',
    maxHeight: '100%',
  },
  center: { textAlign: 'center' },
  centerBox: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(11,61,44,0.08)' },

  /* form header */
  // Same height the back arrow had, so the title below doesn't move.
  formTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  iconTile: {
    marginTop: 28,
    width: 60,
    height: 60,
    borderRadius: 19,
    backgroundColor: C.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formTitle: { marginTop: 18, fontSize: 30, lineHeight: 36, color: C.ink, letterSpacing: -0.7 },
  formGap: { height: 20 },
  formSpacer: { flexGrow: 1, minHeight: 24 },

  /* buttons */
  btn: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  btnPrimary: { backgroundColor: C.forest, ...shadow(C.forest, 0.28, 14, 8, 6) },
  btnSecondary: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, ...shadow(C.ink, 0.05, 10, 4, 2) },
  btnDisabled: { backgroundColor: C.disabled, shadowOpacity: 0, elevation: 0 },
  btnText: { fontSize: 16, fontWeight: '700', color: C.lime },
  btnConnecting: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btnTextSecondary: { color: C.ink },
  btnIcon: { marginRight: 10 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.line },
  dividerText: { marginHorizontal: 12, fontSize: 13, color: C.muted },

  notice: {
    marginTop: 12,
    fontSize: 10.5,
    letterSpacing: -0.12,
    lineHeight: 15,
    color: C.muted,
    textAlign: 'center',
    paddingHorizontal: 0,
    ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : {}),
  },
  noticeLink: { color: C.greenDeep, fontWeight: '600', textDecorationLine: 'underline' },
  // A quiet footer: well below "Create account", smaller and lighter, so the two don't compete.
  legalLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 28 },
  legalLinkText: { fontSize: 11.5, fontWeight: '400', color: C.body, textDecorationLine: 'underline', textDecorationColor: C.line },
  legalDot: { fontSize: 11.5, color: C.line },
  trust: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  trustText: { fontSize: 12, fontWeight: '600', color: C.greenDeep },

  /* google last-used card */
  lastUser: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 22,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 14,
    ...shadow(C.ink, 0.06, 12, 4, 3),
  },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarFallback: { backgroundColor: C.forest, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: C.lime, fontSize: 17, fontWeight: '800' },
  lastUserMeta: { flex: 1, marginLeft: 12 },
  lastUserRow: { flexDirection: 'row', alignItems: 'center' },
  lastUserName: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: C.ink },
  lastUsedPill: { marginLeft: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: C.mist },
  lastUsedText: { fontSize: 11, fontWeight: '700', color: C.greenDeep },
  lastUserEmail: { marginTop: 2, fontSize: 12, color: C.muted },
  googleBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchAccount: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  switchAccountText: { fontSize: 13, fontWeight: '600', color: C.greenDeep },

  /* forms */
  form: { paddingHorizontal: 24, flexGrow: 1 },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 18, marginBottom: 22 },
  headText: { flex: 1, paddingRight: 8, paddingBottom: 6 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: C.ink, letterSpacing: -0.6 },
  subtitle: { marginTop: 8, fontSize: 15, lineHeight: 22, color: C.body },

  field: { marginBottom: 16 },
  label: { marginBottom: 8, fontSize: 13, fontWeight: '600', color: C.body },
  inputBox: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: C.white,
    shadowColor: C.green,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  input: { flex: 1, height: '100%', fontSize: 16, color: C.ink },
  eye: { padding: 4 },
  matchBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },

  meter: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  meterBars: { flex: 1, flexDirection: 'row', gap: 6 },
  meterBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.line },
  meterText: { width: 132, fontSize: 12, fontWeight: '600', textAlign: 'right' },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  checkRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkLabel: { fontSize: 14, color: C.body },
  link: { fontSize: 14, fontWeight: '700', color: C.greenDeep },
  terms: { marginTop: 4 },
  termsText: { flex: 1, fontSize: 13, lineHeight: 19, color: C.body },

  submit: { marginTop: 22 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  switchLabel: { fontSize: 14, color: C.body },

  /* banners */
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    marginBottom: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.dangerLine,
    backgroundColor: C.dangerBg,
  },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600', color: C.dangerInk },
  bannerOk: { borderColor: C.line, backgroundColor: C.mist },
  bannerTextOk: { color: C.greenDeep },
  lockout: { flexDirection: 'column', alignItems: 'flex-start', gap: 8 },
  lockoutHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockoutTitle: { fontSize: 15, fontWeight: '800', color: C.dangerInk },
  lockoutTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: C.white,
  },
  lockoutTimerText: { fontSize: 13, fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'] as any },
  lockoutBody: { fontSize: 13, lineHeight: 19, color: C.body },
  lockoutBtn: { marginTop: 2, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: C.green },
  lockoutBtnText: { fontSize: 13, fontWeight: '700', color: C.lime },

  /* sheets */
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(7,17,13,0.55)' },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  sheetClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetBody: { fontSize: 14, lineHeight: 21, color: C.body, marginBottom: 16 },
  verifyArt: { alignSelf: 'center', width: 76, height: 76, marginTop: 8, marginBottom: 18 },
  verifyCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: C.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyTick: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 3,
    borderColor: C.bg,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyEmail: { marginTop: -10, marginBottom: 14, fontSize: 16, fontWeight: '700', color: C.ink, textAlign: 'center' },

  /* step-by-step sign up */
  suStep: { flexGrow: 1 },
  suStepTitle: { marginTop: 36, fontSize: 30, lineHeight: 36, color: C.ink, letterSpacing: -0.7 },
  suStepSub: { marginTop: 10, marginBottom: 26, fontSize: 15, lineHeight: 21, color: C.body },
  sfBox: {
    marginTop: 10,
    height: 60,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.mistInk,
    backgroundColor: C.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  sfBoxFocused: { borderWidth: 2, borderColor: C.forest, paddingHorizontal: 15.5 },
  sfLabel: {
    position: 'absolute',
    top: -10,
    left: 12,
    paddingHorizontal: 6,
    backgroundColor: C.bg,
    fontSize: 12.5,
    fontWeight: '600',
    color: C.body,
  },
  sfLabelFocused: { color: C.forest },
  sfInput: { flex: 1, height: '100%', fontSize: 17, color: C.ink },
  sfPrefix: { paddingRight: 12, borderRightWidth: 1, borderRightColor: C.line, justifyContent: 'center' },
  sfPrefixText: { fontSize: 17, fontWeight: '600', color: C.ink },
  sfGap: { height: 22 },
  suHelp: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginHorizontal: 2 },
  suHelpText: { fontSize: 13, color: C.body },
  suMatchText: { color: C.forest, fontWeight: '600' },
  suShow: { marginTop: 18 },
  suShowText: { fontSize: 15, color: C.ink },
  suGoogle: { marginTop: 18 },
  suFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 },
  suGhost: { fontSize: 15, fontWeight: '700', color: C.greenDeep, paddingVertical: 12, paddingHorizontal: 4 },
  suNext: { paddingHorizontal: 36, minWidth: 128 },
  suUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 18,
    borderRadius: 999,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 6,
  },
  suUserAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suUserInitials: { color: C.lime, fontSize: 14, fontWeight: '800' },
  suUserMeta: { flexShrink: 1 },
  suUserName: { fontSize: 14, fontWeight: '700', color: C.ink },
  suUserEmail: { fontSize: 12.5, color: C.body },
  suTermHead: { marginTop: 14, fontSize: 15, fontWeight: '700', color: C.ink },
  suTermBody: { marginTop: 4, fontSize: 14, lineHeight: 20, color: C.body },
  suTurnstile: { marginTop: 18 },

  /* verification email sent (last sign-up step) */
  vsWrap: { flexGrow: 1 },
  vsArt: {
    alignSelf: 'center',
    marginTop: 56,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow(C.ink, 0.08, 18, 10, 4),
  },
  vsTick: {
    position: 'absolute',
    right: 2,
    top: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: C.bg,
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsTitle: { marginTop: 30, fontSize: 30, lineHeight: 36, color: C.ink, letterSpacing: -0.7, textAlign: 'center' },
  vsSub: { marginTop: 10, fontSize: 15, lineHeight: 21, color: C.body, textAlign: 'center' },
  vsEmailPill: {
    alignSelf: 'center',
    maxWidth: '100%',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
  },
  vsEmail: { fontSize: 15, fontWeight: '700', color: C.ink },
  vsHint: { marginTop: 18, paddingHorizontal: 8, fontSize: 14, lineHeight: 20, color: C.body, textAlign: 'center' },
  vsNotice: { marginTop: 12, fontSize: 13, fontWeight: '600', color: C.greenDeep, textAlign: 'center' },
  vsResendRow: { marginTop: 16, minHeight: 24, alignItems: 'center', justifyContent: 'center' },
  vsResendText: { fontSize: 14, color: C.body },
  vsResendLink: { fontWeight: '700', color: C.greenDeep },
  vsResendWait: { color: C.muted },
  vsLogin: { marginTop: 6, paddingVertical: 10, alignItems: 'center' },
  vsLoginText: { fontSize: 14, fontWeight: '700', color: C.greenDeep },

  /* log in: email not confirmed */
  uvCard: {
    marginBottom: 18,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#F2D49A',
    backgroundColor: C.white,
    ...shadow('#7A4F00', 0.12, 18, 10, 3),
  },
  uvTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  uvIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: '#FFF1D4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uvTextWrap: { flex: 1 },
  uvTitle: { fontSize: 16, fontWeight: '800', color: C.ink },
  uvBody: { marginTop: 4, fontSize: 13.5, lineHeight: 19, color: C.body },
  uvEmail: { fontWeight: '700', color: C.ink },
  uvBtn: { marginTop: 16, height: 50 },
  uvNote: { marginTop: 10, fontSize: 12.5, color: C.muted, textAlign: 'center' },

  lsSheet: { alignItems: 'center' },
  lsOrb: { marginTop: 6, width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  lsOrb2: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  lsOrb3: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  lsTitle: { marginTop: 18, fontSize: 26, lineHeight: 30, color: C.ink, textAlign: 'center', letterSpacing: -0.4 },
  lsBody: { marginTop: 8, fontSize: 14.5, lineHeight: 21, color: C.body, textAlign: 'center', paddingHorizontal: 4 },
  lsStrong: { fontWeight: '700', color: C.ink },
  lsPill: {
    marginTop: 14,
    maxWidth: '100%',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
  },
  lsPillText: { fontSize: 14, fontWeight: '600', color: C.ink },
  lsNotice: { marginTop: 12, fontSize: 13, fontWeight: '600', color: C.amberInk, textAlign: 'center' },
  lsActions: { alignSelf: 'stretch', marginTop: 22 },
  lsSecond: { marginTop: 10 },
});
