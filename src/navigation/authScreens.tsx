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
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInDown,
  ZoomIn,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
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

function Divider() {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>or</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

function LegalNotice() {
  return (
    <Text style={styles.notice} numberOfLines={1} adjustsFontSizeToFit>
      By continuing, you agree to our{' '}
      <Text style={styles.noticeLink} onPress={openTerms}>
        Terms
      </Text>{' '}
      and{' '}
      <Text style={styles.noticeLink} onPress={openPrivacy}>
        Privacy Policy
      </Text>
      .
    </Text>
  );
}

function TrustRow() {
  return (
    <View style={styles.trust}>
      {/* <Feather name="smartphone" size={13} color={C.greenDeep} /> */}
      <Text style={styles.trustText}>End-to-End Encrypted</Text>
    </View>
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
  const size = width / 300; // same proportion as the intro
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

function Landing({ navigation, returning }: { navigation: any; returning: boolean }) {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const [loading, setLoading] = useState(false);

  const primary = returning ? { label: 'Log in', to: 'Login' } : { label: 'Create account', to: 'Signup' };
  const secondary = returning ? { label: 'Create account', to: 'Signup' } : { label: 'Log in', to: 'Login' };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 20) }]}>
      <StatusBar style="dark" />
      <Backdrop />

      <View style={styles.heroArea}>
        <Hero width={Math.min(W * 0.68, 280)} />
        <Animated.Text entering={FadeInDown.delay(480).duration(650)} style={styles.tagline}>
          {returning ? 'Good to see you again.' : 'Your money, sorted by an agent\nthat works for you.'}
        </Animated.Text>
      </View>

      <View style={styles.actions}>
        <Animated.View entering={FadeInDown.delay(620).duration(600)}>
          <Button label={primary.label} onPress={() => navigation.navigate(primary.to)} disabled={loading} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(700).duration(600)}>
          <Button
            variant="secondary"
            label={secondary.label}
            onPress={() => navigation.navigate(secondary.to)}
            disabled={loading}
            style={styles.stack}
          />
        </Animated.View>
        <Animated.View entering={FadeIn.delay(800).duration(600)}>
          <Divider />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(860).duration(600)}>
          <GoogleAuthButton loading={loading} setLoading={setLoading} />
          <LegalNotice />
        </Animated.View>
        <Animated.View entering={FadeIn.delay(1000).duration(700)}>
          <TrustRow />
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

export const LoginScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);
  const [emailOrMobile, setEmailOrMobile] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);
  const [rememberMe, setRememberMe] = useState(true);
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
      fail(`Account is temporarily locked. Try again in ${formatRemainingTime(lockoutRemainingSec)} or reset your password.`);
      return;
    }
    if (!emailOrMobile.trim() || !password) {
      fail('Please enter both Email/Mobile and Password');
      return;
    }
    if (Platform.OS === 'web' && !turnstileToken) {
      fail('Please complete the Cloudflare security verification');
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
      setResetMsg({ text: 'Please enter a valid registered email address.', error: true });
      return;
    }
    setResetSending(true);
    setResetMsg(null);
    try {
      const res = await authService.requestPasswordReset(targetEmail);
      setResetMsg({ text: res.message || 'Reset link sent! Check your inbox to unlock immediately.', error: false });
    } catch (err: any) {
      setResetMsg({ text: err.message || 'Failed to send reset link.', error: true });
    } finally {
      setResetSending(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <Backdrop />
      <KeyboardScreen
        contentContainerStyle={[styles.form, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        <FormHeader
          title="Welcome back"
          subtitle="Log in to see where your money went."
          agent={face.agent}
          onBack={() => navigation.goBack()}
        />

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

        <Animated.View entering={FadeInDown.delay(160).duration(550)}>
          <Field
            label="Email or mobile number"
            icon="mail"
            placeholder="name@domain.com or 9876543210"
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
            {...face.bind('text', emailOrMobile.length)}
          />
          <Field
            label="Password"
            icon="lock"
            inputRef={passwordRef}
            placeholder="Your password"
            secureTextEntry={secureText}
            autoCapitalize="none"
            textContentType="password"
            autoComplete="password"
            returnKeyType="go"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleLogin}
            right={<EyeToggle hidden={secureText} onToggle={() => setSecureText(s => !s)} />}
            {...face.bind('secret')}
          />

          <View style={styles.rowBetween}>
            <Checkbox checked={rememberMe} onToggle={() => setRememberMe(r => !r)} label="Stay logged in for 30 days">
              <Text style={styles.checkLabel}>Stay logged in</Text>
            </Checkbox>
            <Pressable onPress={openForgot} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>Forgot password?</Text>
            </Pressable>
          </View>

          <CloudflareTurnstile
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
            style={styles.submit}
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>New to Regent Money? </Text>
            <Pressable onPress={() => navigation.navigate('Signup')} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>Create account</Text>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardScreen>

      <Sheet visible={showForgotModal} title="Reset your password" onClose={() => setShowForgotModal(false)}>
        <Text style={styles.sheetBody}>
          Enter the email you signed up with. We'll send a reset link, and opening it also clears any lockout on your
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
        <Field
          label="Email address"
          icon="mail"
          placeholder="name@domain.com"
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
        <Button label="Send reset link" onPress={handleSendResetLink} loading={resetSending} style={styles.submit} />
      </Sheet>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* 3. Signup                                                          */
/* ------------------------------------------------------------------ */

function passwordStrength(pw: string) {
  if (!pw) return { score: 0, label: 'At least 6 characters', color: C.muted };
  if (pw.length < 6) return { score: 1, label: 'Too short', color: C.danger };
  const passed = [
    pw.length >= 10,
    /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    /\d/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ].filter(Boolean).length;
  const score = Math.max(1, passed);
  return [
    { score: 1, label: 'Weak', color: C.danger },
    { score: 2, label: 'Fair', color: C.amber },
    { score: 3, label: 'Good', color: C.green },
    { score: 4, label: 'Strong', color: C.greenDeep },
  ][score - 1];
}

function StrengthMeter({ password }: { password: string }) {
  const s = passwordStrength(password);
  return (
    <View style={styles.meter}>
      <View style={styles.meterBars}>
        {[1, 2, 3, 4].map(i => (
          <View key={i} style={[styles.meterBar, i <= s.score && { backgroundColor: s.color }]} />
        ))}
      </View>
      <Text style={[styles.meterText, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

export const SignupScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [secureText, setSecureText] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorTick, setErrorTick] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  // Consent must be an active choice, so the box starts unticked.
  const [agreeTerms, setAgreeTerms] = useState(false);

  const face = useFormAgent(!secureText);
  const matches = confirmPassword.length > 0 && confirmPassword === password;

  const fail = (message: string) => {
    setError(message);
    setErrorTick(t => t + 1);
  };

  useEffect(() => {
    face.agent.mood.value = withTiming(loading ? 1 : matches ? 0.8 : 0, { duration: 300 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, matches]);
  useEffect(() => {
    if (errorTick) nudgeNo(face.agent, matches ? 0.8 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorTick]);

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !phone.trim() || !password || !confirmPassword) {
      fail('Please fill in all input fields');
      return;
    }
    if (!email.includes('@')) {
      fail('Please enter a valid email address');
      return;
    }
    if (phone.trim().length < 10) {
      fail('Please enter a valid mobile number');
      return;
    }
    if (password.length < 6) {
      fail('Password must be at least 6 characters long');
      return;
    }
    if (password !== confirmPassword) {
      fail('Passwords do not match');
      return;
    }
    if (!agreeTerms) {
      fail('Please agree to the Terms of Service & Privacy Policy');
      return;
    }
    if (Platform.OS === 'web' && !turnstileToken) {
      fail('Please complete the Cloudflare security verification');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const result = await authService.signUp(name.trim(), email.trim(), phone.trim(), password, turnstileToken);
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
        contentContainerStyle={[styles.form, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        <FormHeader
          title="Create your account"
          subtitle="Start tracking your money in under a minute."
          agent={face.agent}
          onBack={() => navigation.goBack()}
        />

        {error ? <ErrorBanner key={errorTick} message={error} /> : null}

        <Animated.View entering={FadeInDown.delay(160).duration(550)}>
          <Field
            label="Full name"
            icon="user"
            placeholder="e.g. Aarav Sharma"
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
            {...face.bind('text', name.length)}
          />
          <Field
            label="Email address"
            icon="mail"
            inputRef={emailRef}
            placeholder="name@domain.com"
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
            {...face.bind('text', email.length)}
          />
          <Field
            label="Mobile number"
            icon="phone"
            inputRef={phoneRef}
            placeholder="9876543210"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            returnKeyType="next"
            value={phone}
            onChangeText={t => {
              setPhone(t);
              face.typed(t.length);
            }}
            onSubmitEditing={() => passwordRef.current?.focus()}
            {...face.bind('text', phone.length)}
          />
          <Field
            label="Password"
            icon="lock"
            inputRef={passwordRef}
            placeholder="Create a password"
            secureTextEntry={secureText}
            autoCapitalize="none"
            textContentType="newPassword"
            autoComplete="password-new"
            returnKeyType="next"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => confirmRef.current?.focus()}
            right={<EyeToggle hidden={secureText} onToggle={() => setSecureText(s => !s)} />}
            footer={<StrengthMeter password={password} />}
            {...face.bind('secret')}
          />
          <Field
            label="Confirm password"
            icon="shield"
            inputRef={confirmRef}
            placeholder="Type it again"
            secureTextEntry={secureText}
            autoCapitalize="none"
            textContentType="newPassword"
            autoComplete="password-new"
            returnKeyType="done"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            invalid={confirmPassword.length > 0 && !password.startsWith(confirmPassword)}
            right={
              matches ? (
                <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.matchBadge}>
                  <Feather name="check" size={13} color={C.white} />
                </Animated.View>
              ) : null
            }
            {...face.bind('secret')}
          />

          <CloudflareTurnstile
            onVerify={token => {
              setTurnstileToken(token);
              setError('');
            }}
            onExpire={() => setTurnstileToken('')}
          />

          <View style={styles.terms}>
            <Checkbox
              checked={agreeTerms}
              onToggle={() => setAgreeTerms(prev => !prev)}
              label="I agree to the Terms of Service and Privacy Policy"
            >
              <Text style={styles.termsText}>
                I agree to the{' '}
                <Text style={styles.noticeLink} onPress={openTerms}>
                  Terms of Service
                </Text>{' '}
                and{' '}
                <Text style={styles.noticeLink} onPress={openPrivacy}>
                  Privacy Policy
                </Text>
              </Text>
            </Checkbox>
          </View>

          <Button label="Create account" onPress={handleSignup} loading={loading} style={styles.submit} />

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
  screen: {
    flex: 1,
    backgroundColor: C.bg,
    overflow: 'hidden',
    height: '100%',
    maxHeight: '100%',
  },
  center: { textAlign: 'center' },

  /* landing */
  heroArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    minHeight: 0,
  },
  tagline: { marginTop: 16, fontSize: 16, lineHeight: 23, color: C.body, textAlign: 'center' },
  actions: { paddingHorizontal: 24, paddingBottom: 6 },
  stack: { marginTop: 12 },

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

  notice: { marginTop: 12, fontSize: 11, lineHeight: 16, color: C.muted, textAlign: 'center', paddingHorizontal: 0 },
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