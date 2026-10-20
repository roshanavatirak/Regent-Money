// Auth screens: Welcome, Auth landing, Login and Signup (Regent Money)
// Same light canvas, green and money agent as the launch intro and onboarding.

import React, { ComponentProps, ReactNode, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
  FadeOut,
  SlideInDown,
  ZoomIn,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { showGlobalAlert, useTermsModalStore, usePrivacyModalStore } from '../store';
import { StatusBar } from 'expo-status-bar';
import { CloudflareTurnstile } from '../components/CloudflareTurnstile';
import { RegentWordmark, WM_H, WM_W } from '../components/RegentWordmark';
import { AGENT_H, AGENT_W, MoneyAgent, nudgeNo, sayHi, useAgentControls } from '../components/MoneyAgent';

/* ------------------------------------------------------------------ */
/* Tokens                                                             */
/* ------------------------------------------------------------------ */

const C = {
  bg: '#fafbfc',
  white: '#ffffff',
  green: '#2dba4e',
  greenDeep: '#1f8f3a',
  mist: '#e7f7eb',
  ink: '#1c252e',
  body: '#5b6672',
  muted: '#8a94a0',
  line: '#e3e8ed',
  disabled: '#c9d1d8',
  danger: '#d93838',
  dangerInk: '#b42318',
  dangerBg: '#fdf1f1',
  dangerLine: '#f4cccc',
  amber: '#d9930d',
};

const SOFT = { damping: 16, stiffness: 190 };
const PERCH = { x: 508, y: 37.5 }; // top of the "n" in Regent, wordmark units

type IconName = ComponentProps<typeof Feather>['name'];

const openTerms = () => useTermsModalStore.getState().openTermsModal(true);
const openPrivacy = () => usePrivacyModalStore.getState().openPrivacyModal();

/* ------------------------------------------------------------------ */
/* Building blocks                                                    */
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

/** Soft green light in two corners, same as the intro and onboarding. */
function Backdrop() {
  const { width: W } = useWindowDimensions();
  const size = W * 1.5;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <View style={{ position: 'absolute', left: -size * 0.42, top: -size * 0.5 }}>
        <Glow id="authGlowTop" size={size} strength={0.11} />
      </View>
      <View style={{ position: 'absolute', right: -size * 0.45, bottom: -size * 0.5 }}>
        <Glow id="authGlowLow" size={size} strength={0.08} />
      </View>
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

function Button({ label, onPress, variant = 'primary', loading, disabled, leading, style }: ButtonProps) {
  const primary = variant === 'primary';
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={label}
      style={[styles.btn, primary ? styles.btnPrimary : styles.btnSecondary, disabled && styles.btnDisabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? C.white : C.green} />
      ) : (
        <>
          {leading}
          <Text style={[styles.btnText, !primary && styles.btnTextSecondary]}>{label}</Text>
        </>
      )}
    </PressScale>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <PressScale onPress={onPress} style={styles.back} accessibilityLabel="Go back">
      <Feather name="arrow-left" size={20} color={C.ink} />
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

interface EmailVerificationModalProps {
  visible: boolean;
  email: string;
  onClose: () => void;
  onProceedToLogin: () => void;
}

/**
 * Clean, lightweight, professional verification popup shown immediately after signup.
 */
function EmailVerificationModal({ visible, email, onClose, onProceedToLogin }: EmailVerificationModalProps) {
  const { width: W } = useWindowDimensions();
  const [cooldown, setCooldown] = useState(0);
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
      setCooldown(30);
    } catch (err: any) {
      setResendStatus(err.message || 'Failed to resend');
    } finally {
      setResending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.verifyModalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close modal" />
        <Animated.View
          entering={ZoomIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={[styles.verifyModalCard, { width: Math.min(W - 48, 340) }]}
        >
          {/* Close button */}
          <Pressable onPress={onClose} style={styles.verifyModalCloseBtn} hitSlop={10} accessibilityLabel="Close">
            <Feather name="x" size={16} color={C.muted} />
          </Pressable>

          {/* Clean circle with mail icon */}
          <View style={styles.verifyIconClean}>
            <Feather name="mail" size={24} color={C.green} />
          </View>

          {/* Title & message */}
          <Text style={styles.verifyModalTitle}>Check your email</Text>
          <Text style={styles.verifyModalBody}>
            We've sent a verification link to{'\n'}
            <Text style={styles.verifyEmailHighlight}>{email}</Text>
          </Text>

          {resendStatus && (
            <Animated.Text entering={FadeIn.duration(180)} style={styles.verifyResendNotice}>
              {resendStatus}
            </Animated.Text>
          )}

          {/* Single clean primary button */}
          <Button label="Back to Log In" onPress={onProceedToLogin} style={styles.verifyPrimaryBtn} />

          {/* Subtle Resend option */}
          <Pressable
            onPress={handleResend}
            disabled={cooldown > 0 || resending}
            hitSlop={8}
            style={styles.verifyResendRow}
          >
            {resending ? (
              <ActivityIndicator size="small" color={C.green} />
            ) : (
              <Text style={styles.verifyResendText}>
                Didn't receive it?{' '}
                <Text style={[styles.verifyResendHighlight, cooldown > 0 && { color: C.muted }]}>
                  {cooldown > 0 ? `Resend (${cooldown}s)` : 'Resend link'}
                </Text>
              </Text>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* The agent reacts to the form                                       */
/* ------------------------------------------------------------------ */

type FocusKind = 'text' | 'secret';

/**
 * Looks at what you type, covers its eyes for passwords,
 * and peeks when you choose to show the password.
 */
function useFormAgent(reveal: boolean) {
  const agent = useAgentControls();
  const [focus, setFocus] = useState<FocusKind | null>(null);

  useEffect(() => {
    agent.lookY.value = withTiming(focus ? 1 : 0, { duration: 220 });
    agent.cover.value = withSpring(focus === 'secret' ? 1 : 0, SOFT);
    agent.peek.value = withSpring(focus === 'secret' && reveal ? 1 : 0, SOFT);
    if (focus !== 'text') agent.lookX.value = withTiming(0, { duration: 220 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, reveal]);

  const typed = (length: number) => {
    agent.lookX.value = withTiming(Math.max(-1, Math.min(1, -0.9 + length / 14)), { duration: 120 });
  };
  const bind = (kind: FocusKind, length?: number) => ({
    onFocus: () => {
      setFocus(kind);
      if (length != null) typed(length);
    },
    onBlur: () => setFocus(f => (f === kind ? null : f)),
  });
  return { agent, typed, bind };
}

/* ------------------------------------------------------------------ */
/* Google sign-in (one-tap card for the last used account)            */
/* ------------------------------------------------------------------ */

interface GoogleAuthButtonProps {
  loading: boolean;
  setLoading: (val: boolean) => void;
}

const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({ loading, setLoading }) => {
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
          'Google Web Client ID is mismatching, or your SHA-1 fingerprint is not configured in the Google Cloud Console for Android Package Name (com.anonymous.regentmoney). Please check settings.',
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

  if (lastGoogleUser?.email) {
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
      onPress={() => signIn(false)}
      loading={loading}
    />
  );
};

/* ------------------------------------------------------------------ */
/* 1. Welcome and 1B. Auth landing                                    */
/* ------------------------------------------------------------------ */

/** The intro's last frame: the logo with the agent standing on the "n", waving. */
function Hero({ width }: { width: number }) {
  const agent = useAgentControls();
  const S = width / WM_W;
  const logoH = WM_H * S;
  const size = (width / 240) * 0.8; // same proportion as the intro
  const aw = AGENT_W * size;
  const ah = AGENT_H * size;
  const top = ah + 4;

  useEffect(() => {
    sayHi(agent, 1250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ width, height: top + logoH }}>
      <Animated.View entering={FadeInDown.delay(120).duration(700)} style={{ position: 'absolute', left: 0, top }}>
        <RegentWordmark height={logoH} />
      </Animated.View>
      <MoneyAgent
        size={size}
        controls={agent}
        dropIn
        dropDelay={620}
        style={{ position: 'absolute', left: PERCH.x * S - aw / 2, top: top + PERCH.y * S - ah }}
      />
    </View>
  );
}

/** Three faint rings behind the cards, like ripples from a coin dropped in water. */
function Rings({ size }: { size: number }) {
  const r = size / 2;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: size, height: size }}>
      <Svg width={size} height={size}>
        {[0.99, 0.76, 0.53].map((f, i) => (
          <Circle
            key={f}
            cx={r}
            cy={r}
            r={r * f}
            stroke={C.green}
            strokeOpacity={0.08 + i * 0.04}
            strokeWidth={1}
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

const SORTED = [
  { icon: 'arrow-down-left' as IconName, name: 'Salary credited', amount: '+₹45,000', tag: 'Income' },
  { icon: 'home' as IconName, name: 'House rent', amount: '₹14,000', tag: 'Rent' },
];

const CARD_TOP = 48; // how much of the goal card peeks out above the front card

/**
 * The one memorable moment on this screen: a small stack of cards showing
 * the agent at work. Rows arrive one by one and each gets its category,
 * then the stack floats gently. Floating stops when Reduce Motion is on.
 */
function AgentPreview({ width }: { width: number }) {
  const reduceMotion = useReducedMotion();
  const float = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    float.value = withRepeat(withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }), -1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const front = useAnimatedStyle(() => ({
    transform: [{ translateY: -5 + float.value * 10 }, { rotate: '-1.5deg' }],
  }));
  const back = useAnimatedStyle(() => ({
    transform: [{ translateY: 4 - float.value * 8 }, { rotate: '5deg' }],
  }));

  return (
    <View style={[styles.previewWrap, { width, height: CARD_TOP + 160 }]}>
      <Rings size={width * 1.45} />

      {/* Goal card, tucked behind */}
      <Animated.View entering={FadeIn.delay(900).duration(700)} style={[styles.goalCard, { width: width * 0.88 }]}>
        <Animated.View style={[styles.goalInner, back]}>
          <View style={styles.goalHead}>
            <Text style={styles.goalTitle}>First bike</Text>
            <Text style={styles.goalMeta}>65%</Text>
          </View>
          <View style={styles.goalTrack}>
            <View style={[styles.goalFill, { width: '65%' }]} />
          </View>
        </Animated.View>
      </Animated.View>

      {/* Front card: what the agent sorted today */}
      <Animated.View entering={FadeInDown.delay(700).duration(700)} style={[styles.feedCard, { width, top: CARD_TOP }]}>
        <Animated.View style={[styles.feedInner, front]}>
          <View style={styles.feedHead}>
            <Text style={styles.feedTitle}>Sorted for you today</Text>
          </View>

          {SORTED.map((row, i) => (
            <Animated.View
              key={row.name}
              entering={FadeInDown.delay(1100 + i * 260).duration(420)}
              style={[styles.feedRow, i > 0 && styles.feedRowLine]}
            >
              <View style={styles.feedIcon}>
                <Feather name={row.icon} size={14} color={C.greenDeep} />
              </View>
              <View style={styles.feedMeta}>
                <Text style={styles.feedName} numberOfLines={1}>
                  {row.name}
                </Text>
                <Text style={styles.feedAmount}>{row.amount}</Text>
              </View>
              <Animated.View entering={ZoomIn.delay(1300 + i * 260).springify().damping(13)} style={styles.tag}>
                <Text style={styles.tagText}>{row.tag}</Text>
              </Animated.View>
            </Animated.View>
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/**
 * Replace your existing LegalNotice with this shorter one-line version.
 * (Delete the old function so there's only one.)
 */
function LegalNotice() {
  return (
    <Text style={styles.notice} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
      By continuing, you agree to our{' '}
      <Text style={styles.noticeLink} onPress={openTerms}>
        Terms of Use
      </Text>{' '}
      and{' '}
      <Text style={styles.noticeLink} onPress={openPrivacy}>
        Privacy Policy
      </Text>
    </Text>
  );
}

function Landing({ navigation, returning }: { navigation: any; returning: boolean }) {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const [loading, setLoading] = useState(false);

  const primary = returning ? { label: 'Log in', to: 'Login' } : { label: 'Create account', to: 'Signup' };
  const swap = returning
    ? { prompt: 'New here?', label: 'Create account', to: 'Signup' }
    : { prompt: 'Already have an account?', label: 'Log in', to: 'Login' };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }]}>
      <StatusBar style="dark" />
      <Backdrop />

      <View style={styles.landingLogo}>
        <Hero width={Math.min(W * 0.4, 168)} />
      </View>

      <View style={styles.landingVisual}>
        <AgentPreview width={Math.min(W - 120, 272)} />
      </View>

      <View style={styles.landingActions}>
        <Animated.Text entering={FadeInDown.delay(500).duration(600)} style={styles.headline}>
          {returning ? 'Welcome back' : 'Your money, sorted'}
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(580).duration(600)} style={styles.subline}>
          {returning ? 'Pick up where you left off.' : 'Tracked, budgeted and saved for you.'}
        </Animated.Text>

        <Animated.View entering={FadeInDown.delay(660).duration(600)}>
          <Button label={primary.label} onPress={() => navigation.navigate(primary.to)} disabled={loading} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(740).duration(600)} style={styles.buttonGap}>
          <GoogleAuthButton loading={loading} setLoading={setLoading} />
        </Animated.View>

        <Animated.View entering={FadeIn.delay(860).duration(600)} style={styles.swapRow}>
          <Text style={styles.switchLabel}>{swap.prompt} </Text>
          <Pressable onPress={() => navigation.navigate(swap.to)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>{swap.label}</Text>
          </Pressable>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(940).duration(600)} style={styles.legalWrap}>
          <LegalNotice />
        </Animated.View>
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

/* Spread into StyleSheet.create: { ...landingStyles, ... } (see STEP 3). */

const landingStyles = {
  /* landing */
  landingLogo: { alignItems: 'center', paddingTop: 28 },
  landingVisual: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 0 },
  headline: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  subline: {
    marginTop: 8,
    marginBottom: 32,
    fontSize: 15,
    lineHeight: 22,
    color: C.body,
    textAlign: 'center',
  },
  swapRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 26 },
  buttonGap: { marginTop: 14 },
  landingActions: { paddingHorizontal: 28, paddingBottom: 12 },
  legalWrap: { marginTop: 10 },

  /* agent preview */
  previewWrap: { alignItems: 'center', justifyContent: 'center' },
  goalCard: { position: 'absolute', top: 0 },
  goalInner: {
    backgroundColor: C.mist,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#c9ecd3',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
  },
  goalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  goalTitle: { fontSize: 13, fontWeight: '800', color: C.greenDeep },
  goalMeta: { fontSize: 11, fontWeight: '600', color: C.greenDeep, fontVariant: ['tabular-nums'] as any },
  goalTrack: { height: 6, borderRadius: 3, backgroundColor: C.white, overflow: 'hidden' },
  goalFill: { height: '100%', borderRadius: 3, backgroundColor: C.green },

  feedCard: { position: 'absolute' },
  feedInner: {
    backgroundColor: C.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    shadowColor: '#0f3d2a',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
  feedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  feedTitle: { fontSize: 14, fontWeight: '800', color: C.ink, letterSpacing: -0.2 },
  lockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: C.mist,
  },
  lockText: { fontSize: 10.5, fontWeight: '700', color: C.greenDeep },
  feedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  feedRowLine: { borderTopWidth: 1, borderTopColor: '#eef2f5' },
  feedIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: C.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedMeta: { flex: 1, marginLeft: 12, marginRight: 8 },
  feedName: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  feedAmount: { marginTop: 1, fontSize: 12, color: C.muted, fontVariant: ['tabular-nums'] as any },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: C.green,
  },
  tagText: { fontSize: 11, fontWeight: '800', color: C.white },
} as const;

/* ------------------------------------------------------------------ */
/* Shared form header                                                 */
/* ------------------------------------------------------------------ */

function FormHeader({
  title,
  subtitle,
  agent,
  onBack,
}: {
  title: string;
  subtitle: string;
  agent: ReturnType<typeof useAgentControls>;
  onBack: () => void;
}) {
  return (
    <>
      <Animated.View entering={FadeIn.duration(400)}>
        <BackButton onPress={onBack} />
      </Animated.View>
      <View style={styles.headRow}>
        <Animated.View entering={FadeInDown.delay(80).duration(550)} style={styles.headText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </Animated.View>
        <MoneyAgent size={1.3} controls={agent} dropIn dropDelay={220} />
      </View>
    </>
  );
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

export const LoginScreen = ({ navigation }: { navigation: any }) => {
  useWebAutofillFix();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);
  const [emailOrMobile, setEmailOrMobile] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);
  const [rememberMe, setRememberMe] = useState(true);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorTick, setErrorTick] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState('');

  // Lockout state and live countdown
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutRemainingSec, setLockoutRemainingSec] = useState<number>(0);
  const [lockoutTier, setLockoutTier] = useState<number>(1);

  // Forgot / reset password sheet
  const [showForgotModal, setShowForgotModal] = useState<boolean>(false);
  const [resetEmail, setResetEmail] = useState<string>('');
  const [resetSending, setResetSending] = useState<boolean>(false);
  const [resetMsg, setResetMsg] = useState<{ text: string; error: boolean } | null>(null);

  const face = useFormAgent(!secureText);
  const locked = lockoutRemainingSec > 0;

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

  // the agent's mood follows the form
  useEffect(() => {
    face.agent.mood.value = withTiming(locked ? -1 : loading ? 1 : 0, { duration: 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked, loading]);
  useEffect(() => {
    if (errorTick) nudgeNo(face.agent, locked ? -1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorTick]);

  const openForgot = () => {
    if (emailOrMobile.includes('@')) setResetEmail(emailOrMobile);
    setResetMsg(null);
    setShowForgotModal(true);
  };

  const handleLogin = async () => {
    if (locked) {
      fail(`Your account is locked. Try again in ${formatRemainingTime(lockoutRemainingSec)} or reset your password.`);
      return;
    }
    if (!emailOrMobile.trim() || !password) {
      fail('Enter your email or mobile number and password.');
      return;
    }
    if (Platform.OS === 'web' && !turnstileToken) {
      fail('Complete the security check to continue.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authService.logIn(emailOrMobile, password, rememberMe, turnstileToken);
    } catch (e: any) {
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
        <Animated.View entering={FadeIn.duration(400)}>
          <BackButton onPress={() => navigation.goBack()} />
        </Animated.View>

        <View style={styles.suHead}>
          <Animated.View entering={FadeInDown.delay(80).duration(550)} style={styles.suHeadText}>
            <Text style={styles.suTitle}>Welcome back</Text>
            <Text style={styles.suSub}>Log in to your account.</Text>
          </Animated.View>
          <MoneyAgent size={1.05} controls={face.agent} dropIn dropDelay={220} />
        </View>

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
        ) : error ? (
          <ErrorBanner key={errorTick} message={error} />
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
            onChangeText={t => {
              setEmailOrMobile(t);
              face.typed(t.length);
            }}
            onSubmitEditing={() => passwordRef.current?.focus()}
            onActive={setActive}
            {...face.bind('text', emailOrMobile.length)}
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
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
            onActive={setActive}
            right={<EyeToggle hidden={secureText} onToggle={() => setSecureText(s => !s)} />}
            {...face.bind('secret')}
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
            theme="light"
            onVerify={token => {
              setTurnstileToken(token);
              setError('');
            }}
            onExpire={() => setTurnstileToken('')}
          />

          <Button
            label={locked ? `Locked for ${formatRemainingTime(lockoutRemainingSec)}` : 'Log in'}
            onPress={handleLogin}
            loading={loading}
            disabled={locked}
            style={styles.suSubmit}
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>New here? </Text>
            <Pressable onPress={() => navigation.navigate('Signup')} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>Create account</Text>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardScreen>

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


export const SignupScreen = ({ navigation }: { navigation: any }) => {
  useWebAutofillFix();
  const insets = useSafeAreaInsets();
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  const [secureText, setSecureText] = useState(true);
  const [active, setActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorTick, setErrorTick] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  // Consent must be an active choice, so the box starts unticked.
  const [agreeTerms, setAgreeTerms] = useState(false);

  const face = useFormAgent(!secureText);
  const ready = name.trim() && email.includes('@') && phone.length === 10 && password.length >= 6;

  const fail = (message: string) => {
    setError(message);
    setErrorTick(t => t + 1);
  };

  // the agent brightens up once everything is filled in
  useEffect(() => {
    face.agent.mood.value = withTiming(loading ? 1 : ready ? 0.8 : 0, { duration: 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, ready]);
  useEffect(() => {
    if (errorTick) nudgeNo(face.agent, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorTick]);

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !phone || !password) {
      fail('Fill in all four fields to continue.');
      return;
    }
    if (!email.includes('@')) {
      fail('Enter a valid email address.');
      return;
    }
    if (phone.length !== 10) {
      fail('Enter your 10-digit mobile number.');
      return;
    }
    if (password.length < 6) {
      fail('Use at least 6 characters for your password.');
      return;
    }
    if (!agreeTerms) {
      fail('Agree to the Terms of Use and Privacy Policy to continue.');
      return;
    }
    if (Platform.OS === 'web' && !turnstileToken) {
      fail('Complete the security check to continue.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const result = await authService.signUp(name.trim(), email.trim(), phone, password, turnstileToken);
      if (!result.sessionConfirmed) {
        setRegisteredEmail(email.trim());
        setShowVerifyModal(true);
      }
    } catch (e: any) {
      fail(e.message);
    } finally {
      setLoading(false);
    }
  };

  const closeVerify = () => {
    setShowVerifyModal(false);
    navigation.navigate('Login');
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
        <Animated.View entering={FadeIn.duration(400)}>
          <BackButton onPress={() => navigation.goBack()} />
        </Animated.View>

        <View style={styles.suHead}>
          <Animated.View entering={FadeInDown.delay(80).duration(550)} style={styles.suHeadText}>
            <Text style={styles.suTitle}>Create account</Text>
            <Text style={styles.suSub}>Takes less than a minute.</Text>
          </Animated.View>
          <MoneyAgent size={1.05} controls={face.agent} dropIn dropDelay={220} />
        </View>

        {error ? <ErrorBanner key={errorTick} message={error} /> : null}

        <Animated.View
          entering={FadeInDown.delay(160).duration(550)}
          style={[styles.group, active && styles.groupActive]}
        >
          <GroupRow
            icon="user"
            placeholder="Full name"
            autoCapitalize="words"
            textContentType="name"
            autoComplete="name"
            returnKeyType="next"
            value={name}
            onChangeText={t => {
              setName(t);
              face.typed(t.length);
            }}
            onSubmitEditing={() => emailRef.current?.focus()}
            onActive={setActive}
            {...face.bind('text', name.length)}
          />
          <View style={styles.gDivider} />
          <GroupRow
            icon="mail"
            inputRef={emailRef}
            placeholder="Email address"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            returnKeyType="next"
            value={email}
            onChangeText={t => {
              setEmail(t);
              face.typed(t.length);
            }}
            onSubmitEditing={() => phoneRef.current?.focus()}
            onActive={setActive}
            {...face.bind('text', email.length)}
          />
          <View style={styles.gDivider} />
          <GroupRow
            icon="smartphone"
            inputRef={phoneRef}
            prefix="+91"
            placeholder="Mobile number"
            keyboardType="number-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={10}
            returnKeyType="next"
            value={phone}
            onChangeText={t => {
              const digits = t.replace(/\D/g, '');
              setPhone(digits);
              face.typed(digits.length);
            }}
            onSubmitEditing={() => passwordRef.current?.focus()}
            onActive={setActive}
            {...face.bind('text', phone.length)}
          />
          <View style={styles.gDivider} />
          <GroupRow
            icon="lock"
            inputRef={passwordRef}
            placeholder="Password"
            secureTextEntry={secureText}
            autoCapitalize="none"
            textContentType="newPassword"
            autoComplete="password-new"
            returnKeyType="done"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleSignup}
            onActive={setActive}
            right={<EyeToggle hidden={secureText} onToggle={() => setSecureText(s => !s)} />}
            {...face.bind('secret')}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(550)}>
          <View style={styles.suTerms}>
            <Checkbox
              checked={agreeTerms}
              onToggle={() => setAgreeTerms(prev => !prev)}
              label="I agree to the Terms of Use and Privacy Policy"
            >
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text style={styles.noticeLink} onPress={openTerms}>
                  Terms of Use
                </Text>{' '}
                and{' '}
                <Text style={styles.noticeLink} onPress={openPrivacy}>
                  Privacy Policy
                </Text>
              </Text>
            </Checkbox>
          </View>

          <CloudflareTurnstile
            theme="light"
            onVerify={token => {
              setTurnstileToken(token);
              setError('');
            }}
            onExpire={() => setTurnstileToken('')}
          />

          <Button label="Create account" onPress={handleSignup} loading={loading} style={styles.suSubmit} />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Already have an account? </Text>
            <Pressable onPress={() => navigation.navigate('Login')} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>Log in</Text>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardScreen>

      <EmailVerificationModal
        visible={showVerifyModal}
        email={registeredEmail}
        onClose={closeVerify}
        onProceedToLogin={closeVerify}
      />
    </View>
  );
};


/* Spread into StyleSheet.create: { ...loginStyles, ... } (see STEP 3). */
const loginStyles = {
  liOptions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
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
  groupActive: { borderColor: C.green, shadowColor: C.green, shadowOpacity: 0.14 },
  gRow: { height: 60, flexDirection: 'row', alignItems: 'center', gap: 14 },
  gDivider: { height: 1, backgroundColor: '#eef2f5', marginLeft: 32 },
  gPrefix: { fontSize: 16, fontWeight: '600', color: C.ink, marginRight: -4 },
  gInput: { flex: 1, height: '100%', fontSize: 16, color: C.ink },

  suTerms: { marginTop: 20 },
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

  /* buttons */
  btn: {
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  btnPrimary: { backgroundColor: C.green, ...shadow(C.green, 0.3, 14, 8, 6) },
  btnSecondary: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, ...shadow(C.ink, 0.05, 10, 4, 2) },
  btnDisabled: { backgroundColor: C.disabled, shadowOpacity: 0, elevation: 0 },
  btnText: { fontSize: 16, fontWeight: '700', color: C.white },
  btnTextSecondary: { color: C.ink },
  btnIcon: { marginRight: 10 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
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
  avatarFallback: { backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: C.white, fontSize: 17, fontWeight: '800' },
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
  bannerOk: { borderColor: '#c9ecd3', backgroundColor: C.mist },
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
  lockoutTimerText: { fontSize: 13, fontWeight: '700', color: C.ink, fontVariant: ['tabular-nums'] },
  lockoutBody: { fontSize: 13, lineHeight: 19, color: C.body },
  lockoutBtn: { marginTop: 2, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: C.green },
  lockoutBtnText: { fontSize: 13, fontWeight: '700', color: C.white },

  /* sheets */
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(28,37,46,0.45)' },
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

  /* Clean, Lightweight Email Verification Popup */
  verifyModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  verifyModalCard: {
    backgroundColor: C.white,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 22,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.line,
    ...shadow('rgba(15, 23, 42, 0.12)', 0.18, 20, 8, 8),
  },
  verifyModalCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyIconClean: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.mist,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  verifyModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  verifyModalBody: {
    fontSize: 14,
    lineHeight: 21,
    color: C.body,
    textAlign: 'center',
    marginTop: 8,
  },
  verifyEmailHighlight: {
    fontWeight: '700',
    color: C.ink,
  },
  verifyResendNotice: {
    fontSize: 12,
    fontWeight: '600',
    color: C.greenDeep,
    marginTop: 10,
    textAlign: 'center',
  },
  verifyPrimaryBtn: {
    width: '100%',
    marginTop: 22,
  },
  verifyResendRow: {
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyResendText: {
    fontSize: 13,
    color: C.muted,
  },
  verifyResendHighlight: {
    fontWeight: '700',
    color: C.green,
  },
});