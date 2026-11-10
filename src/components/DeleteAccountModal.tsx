import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { useTheme, useAuthStore, showGlobalAlert } from '../store';
import { authService } from '../services/authService';

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
}

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

const DELETION_REASONS = [
  { code: 'SWITCHING_ALTERNATIVE', label: 'Switching apps' },
  { code: 'PRIVACY_SECURITY', label: 'Privacy' },
  { code: 'BANK_SYNC_ISSUES', label: 'Bank sync issues' },
  { code: 'COMPLEX_UI', label: 'Too complicated' },
  { code: 'GOALS_ACHIEVED', label: 'Goals reached' },
  { code: 'TOO_MANY_NOTIFS', label: 'Too many alerts' },
  { code: 'BUGS_CRASHES', label: 'Bugs' },
  { code: 'OTHER', label: 'Other' },
];

type FeatherName = keyof typeof Feather.glyphMap;

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const user = useAuthStore((state) => state.user);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customFeedback, setCustomFeedback] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const font = {
    display: Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined,
    body: Font.isLoaded('Figtree_500Medium') ? 'Figtree_500Medium' : undefined,
    semi: Font.isLoaded('Figtree_600SemiBold') ? 'Figtree_600SemiBold' : undefined,
    bold: Font.isLoaded('Figtree_700Bold') ? 'Figtree_700Bold' : undefined,
  };
  const ff = (family: string | undefined, weight: '500' | '600' | '700' | '800') =>
    family ? { fontFamily: family } : { fontWeight: weight };

  const p = {
    ink: colors.text,
    muted: colors.textSecondary,
    faint: colors.textTertiary,
    surface: colors.card,
    soft: isDark ? 'rgba(255,255,255,0.06)' : '#EEF3F0',
    well: isDark ? 'rgba(255,255,255,0.04)' : '#F3F6F4',
    tile: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
    input: isDark ? colors.inputBackground : '#F3F6F4',
    grabber: isDark ? 'rgba(255,255,255,0.18)' : '#D5DFD9',
    primary: isDark ? LIME : FOREST,
    onPrimary: isDark ? FOREST : '#FFFFFF',
    iconBtn: isDark ? LIME : FOREST,
    danger: isDark ? '#E5482C' : '#C8361D',
    dangerText: isDark ? '#FF8A6B' : '#C8361D',
  };

  const timeline: { key: string; label: string; icon: FeatherName; bg: string; fg: string }[] = [
    {
      key: 'Today',
      label: 'Account paused',
      icon: 'lock',
      bg: isDark ? 'rgba(255,194,77,0.16)' : '#FFF1D6',
      fg: isDark ? '#FFC24D' : '#9A5B00',
    },
    {
      key: 'Within 7 days',
      label: 'Log in to restore',
      icon: 'rotate-ccw',
      bg: isDark ? 'rgba(184,243,107,0.16)' : '#E3F2E8',
      fg: isDark ? LIME : FOREST,
    },
    {
      key: 'After 7 days',
      label: 'Data erased for good',
      icon: 'trash-2',
      bg: isDark ? 'rgba(255,138,107,0.18)' : '#FFE3D6',
      fg: isDark ? '#FFB29E' : '#A63A12',
    },
  ];

  const isCooldownActive = useMemo(() => {
    if (!user?.deletionCooldownUntil) return false;
    return Date.now() < user.deletionCooldownUntil;
  }, [user?.deletionCooldownUntil]);

  const cooldownDateStr = useMemo(() => {
    if (!user?.deletionCooldownUntil) return '';
    return new Date(user.deletionCooldownUntil).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, [user?.deletionCooldownUntil]);

  const isEmailUser = user?.authProvider === 'email';

  const resetState = () => {
    setStep(1);
    setSelectedReason(null);
    setCustomFeedback('');
    setPassword('');
    setShowPassword(false);
    setErrorMsg(null);
    setLoading(false);
  };

  const handleClose = () => {
    if (loading) return;
    resetState();
    onClose();
  };

  const goTo = (next: 1 | 2 | 3) => {
    setErrorMsg(null);
    setStep(next);
  };

  const handleNextFromStep2 = () => {
    if (!selectedReason) {
      setErrorMsg('Pick a reason to continue.');
      return;
    }
    if (selectedReason === 'OTHER' && customFeedback.trim().length < 5) {
      setErrorMsg('Add at least 5 characters.');
      return;
    }
    goTo(3);
  };

  const handleConfirmDeletion = async () => {
    if (!selectedReason) return;

    if (isEmailUser && !password.trim()) {
      setErrorMsg('Enter your password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      await authService.requestAccountDeletion(
        selectedReason,
        selectedReason === 'OTHER' ? customFeedback.trim() : undefined,
        password ? password.trim() : undefined,
      );

      resetState();
      onClose();

      await authService.logOut();

      showGlobalAlert(
        'Account scheduled for deletion',
        'Log back in within 7 days to restore it.',
      );
    } catch (err: any) {
      setErrorMsg(err?.message || "Couldn't delete your account. Try again.");
      setLoading(false);
    }
  };

  if (!visible) return null;

  /* ---------------- Shared pieces ---------------- */

  const IconButton = ({
    icon,
    onPress,
    label,
  }: {
    icon: FeatherName;
    onPress: () => void;
    label: string;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: p.soft, opacity: pressed ? 0.7 : 1 }]}
    >
      <Feather name={icon} size={17} color={p.iconBtn} />
    </Pressable>
  );

  const Dots = () => (
    <View style={styles.dots}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: i <= step ? p.primary : p.grabber },
            i === step && styles.dotActive,
          ]}
        />
      ))}
    </View>
  );

  const Button = ({
    label,
    onPress,
    variant,
    icon,
    disabled,
    busy,
  }: {
    label: string;
    onPress: () => void;
    variant: 'primary' | 'danger' | 'dangerText' | 'plain';
    icon?: FeatherName;
    disabled?: boolean;
    busy?: boolean;
  }) => {
    const bg = variant === 'primary' ? p.primary : variant === 'danger' ? p.danger : 'transparent';
    const fg =
      variant === 'primary'
        ? p.onPrimary
        : variant === 'danger'
          ? '#FFFFFF'
          : variant === 'dangerText'
            ? p.dangerText
            : p.muted;
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled || busy}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={fg} />
        ) : (
          <>
            {icon ? <Feather name={icon} size={16} color={fg} style={{ marginRight: 6 }} /> : null}
            <Text style={[styles.btnText, { color: fg }, ff(font.bold, '700')]}>{label}</Text>
          </>
        )}
      </Pressable>
    );
  };

  const Title = ({ children, center }: { children: string; center?: boolean }) => (
    <Text
      style={[
        styles.title,
        { color: p.ink, textAlign: center ? 'center' : 'left' },
        ff(font.display, '800'),
      ]}
    >
      {children}
    </Text>
  );

  const Subtitle = ({ children, center }: { children: React.ReactNode; center?: boolean }) => (
    <Text
      style={[
        styles.subtitle,
        { color: p.muted, textAlign: center ? 'center' : 'left' },
        ff(font.body, '500'),
      ]}
    >
      {children}
    </Text>
  );

  const ErrorLine = () =>
    errorMsg ? (
      <Text style={[styles.errorText, { color: p.dangerText }, ff(font.semi, '600')]}>{errorMsg}</Text>
    ) : null;

  /* ---------------- Screens ---------------- */

  const renderCooldown = () => (
    <View>
      <View
        style={[
          styles.heroIcon,
          { backgroundColor: isDark ? 'rgba(255,194,77,0.16)' : '#FFF1D6' },
        ]}
      >
        <Feather name="clock" size={26} color={isDark ? '#FFC24D' : '#9A5B00'} />
      </View>
      <Title center>Not available yet</Title>
      <Subtitle center>
        You restored this account recently. You can delete it from{' '}
        <Text style={[{ color: p.ink }, ff(font.bold, '700')]}>{cooldownDateStr}</Text>.
      </Subtitle>
      <Button label="Got it" variant="primary" onPress={handleClose} />
    </View>
  );

  const renderOverview = () => (
    <View>
      <View style={styles.topRow}>
        <Dots />
        <IconButton icon="x" onPress={handleClose} label="Close" />
      </View>
      <Title>Delete your account?</Title>
      <Subtitle>You get 7 days to change your mind.</Subtitle>

      <View style={[styles.timeline, { backgroundColor: p.well }]}>
        {timeline.map((t) => (
          <View key={t.key} style={[styles.timelineRow, { backgroundColor: p.tile }]}>
            <View style={[styles.timelineIcon, { backgroundColor: t.bg }]}>
              <Feather name={t.icon} size={17} color={t.fg} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.timelineKey, { color: p.muted }, ff(font.semi, '600')]}>{t.key}</Text>
              <Text style={[styles.timelineValue, { color: p.ink }, ff(font.bold, '700')]}>{t.label}</Text>
            </View>
          </View>
        ))}
      </View>

      <Button label="Keep my account" variant="primary" onPress={handleClose} />
      <View style={{ height: 6 }} />
      <Button label="Continue to delete" variant="dangerText" onPress={() => goTo(2)} />
    </View>
  );

  const renderReason = () => (
    <View>
      <View style={styles.topRow}>
        <IconButton icon="arrow-left" onPress={() => goTo(1)} label="Back" />
        <Dots />
        <IconButton icon="x" onPress={handleClose} label="Close" />
      </View>
      <Title>What's the reason?</Title>
      <Subtitle>Pick one. It helps us improve.</Subtitle>

      <View style={styles.chips}>
        {DELETION_REASONS.map((r) => {
          const on = selectedReason === r.code;
          return (
            <Pressable
              key={r.code}
              onPress={() => {
                setSelectedReason(r.code);
                setErrorMsg(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: on ? p.primary : p.soft, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              {on ? <Feather name="check" size={14} color={p.onPrimary} style={{ marginRight: 5 }} /> : null}
              <Text style={[styles.chipText, { color: on ? p.onPrimary : p.ink }, ff(font.semi, '600')]}>
                {r.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selectedReason === 'OTHER' ? (
        <View style={{ marginBottom: 14 }}>
          <TextInput
            style={[styles.feedback, { backgroundColor: p.input, color: p.ink }, ff(font.body, '500')]}
            multiline
            placeholder="Tell us more"
            placeholderTextColor={p.faint}
            value={customFeedback}
            onChangeText={(t) => {
              setCustomFeedback(t);
              setErrorMsg(null);
            }}
            maxLength={300}
            autoFocus
          />
          <Text style={[styles.counter, { color: p.faint }, ff(font.semi, '600')]}>
            {customFeedback.length}/300
          </Text>
        </View>
      ) : null}

      <ErrorLine />
      <Button label="Continue" variant="primary" disabled={!selectedReason} onPress={handleNextFromStep2} />
    </View>
  );

  const renderConfirm = () => (
    <View>
      <View style={styles.topRow}>
        <IconButton icon="arrow-left" onPress={() => goTo(2)} label="Back" />
        <Dots />
        <IconButton icon="x" onPress={handleClose} label="Close" />
      </View>
      <Title>Confirm it's you</Title>
      <Subtitle>You'll be signed out right away.</Subtitle>

      {isEmailUser ? (
        <View style={{ marginBottom: 18 }}>
          <Text style={[styles.label, { color: p.ink }, ff(font.bold, '700')]}>Password</Text>
          <View
            style={[
              styles.passwordWrap,
              {
                backgroundColor: p.input,
                borderColor: errorMsg ? p.dangerText : passwordFocused ? p.primary : 'transparent',
              },
            ]}
          >
            <TextInput
              style={[styles.passwordInput, { color: p.ink }, ff(font.semi, '600')]}
              secureTextEntry={!showPassword}
              placeholder="Your password"
              placeholderTextColor={p.faint}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setErrorMsg(null);
              }}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              returnKeyType="done"
              onSubmitEditing={handleConfirmDeletion}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={p.muted} />
            </Pressable>
          </View>
          <ErrorLine />
        </View>
      ) : (
        <View style={{ marginBottom: 18 }}>
          <View style={[styles.googleRow, { backgroundColor: p.well }]}>
            <View style={[styles.googleLogo, { borderColor: isDark ? 'transparent' : '#E1E9E4' }]}>
              <Ionicons name="logo-google" size={18} color="#EA4335" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.timelineValue, { color: p.ink }, ff(font.bold, '700')]}>Google account</Text>
              <Text
                style={[styles.timelineKey, { color: p.muted, marginTop: 1 }, ff(font.semi, '600')]}
                numberOfLines={1}
              >
                {user?.email || 'Signed in with Google'}
              </Text>
            </View>
          </View>
          <ErrorLine />
        </View>
      )}

      <Button
        label="Delete account"
        icon="trash-2"
        variant="danger"
        busy={loading}
        onPress={handleConfirmDeletion}
      />
      <View style={{ height: 6 }} />
      <Button label="Cancel" variant="plain" disabled={loading} onPress={handleClose} />
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: p.surface, paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: p.grabber }]} />
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {isCooldownActive
              ? renderCooldown()
              : step === 1
                ? renderOverview()
                : step === 2
                  ? renderReason()
                  : renderConfirm()}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '92%',
  },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 16 },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 18 },

  title: { fontSize: 25, lineHeight: 30, letterSpacing: -0.4, marginBottom: 6 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 20 },

  timeline: { borderRadius: 22, padding: 6, gap: 4, marginBottom: 20 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingVertical: 11, paddingHorizontal: 12, gap: 12 },
  timelineIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  timelineKey: { fontSize: 12 },
  timelineValue: { fontSize: 14.5, marginTop: 1 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 999 },
  chipText: { fontSize: 13.5 },

  feedback: { borderRadius: 16, padding: 14, minHeight: 84, fontSize: 14, textAlignVertical: 'top' },
  counter: { fontSize: 11.5, textAlign: 'right', marginTop: 6 },

  label: { fontSize: 13, marginBottom: 8 },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
  },
  passwordInput: { flex: 1, fontSize: 15, height: '100%' },

  googleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 12 },
  googleLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorText: { fontSize: 12.5, marginTop: 8, marginLeft: 4, marginBottom: 4 },

  heroIcon: {
    width: 62,
    height: 62,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 16,
  },

  btn: { height: 52, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15 },
});
