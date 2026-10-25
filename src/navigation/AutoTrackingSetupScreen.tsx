// src/navigation/AutoTrackingSetupScreen.tsx
//
// First-run SMS setup. Shows what auto-tracking does (a bank SMS becoming a
// transaction), says what is and isn't read, then asks for permission.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, StatusBar } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { useTheme, useAuthStore } from '../store';
import { mmkvStorage } from '../db/mmkv';
import { smsPermissionService } from '../services/smsPermissionService';
import { smsCatchupService } from '../services/smsCatchupService';
import { CategoryIcon } from '../components/CategoryIcon';

export const TRACKING_SETUP_KEY = 'has_setup_tracking_v1';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

type Phase = 'intro' | 'scanning' | 'done' | 'sim_mismatch';

interface AutoTrackingSetupScreenProps {
  navigation: any;
}

/** Counts up to the target for the result screen. */
const useCountUp = (target: number, run: boolean) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    const start = Date.now();
    const duration = Math.min(1200, 400 + target * 20);
    let raf = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setN(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return n;
};

export const AutoTrackingSetupScreen: React.FC<AutoTrackingSetupScreenProps> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const [phase, setPhase] = useState<Phase>('intro');
  const [found, setFound] = useState(0);
  const shown = useCountUp(found, phase === 'done');

  // Pulse for the scanning state
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (phase === 'scanning') {
      pulse.value = 0;
      pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1);
    }
  }, [phase]);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.6 }],
  }));

  const finish = () => {
    mmkvStorage.setBoolean(TRACKING_SETUP_KEY, true);
    smsPermissionService.setPrompted(true);
    navigation.replace('Main');
  };

  const allow = async () => {
    if (Platform.OS !== 'android') {
      finish();
      return;
    }
    try {
      const granted = await smsPermissionService.requestSmsPermissions();
      if (!granted) {
        finish();
        return;
      }

      // Check if SIM card physically matches the user's account mobile number
      if (user?.phone) {
        const simCheck = await smsPermissionService.checkDeviceSimMatchesUser(user.phone);
        if (!simCheck.matches) {
          // Different SIM detected on this device (e.g. Papa's phone)
          setPhase('sim_mismatch');
          return;
        }
      }

      setPhase('scanning');
      const result = await smsCatchupService.reconcile(false, 720); // last 30 days
      setFound(result?.syncedCount ?? 0);
      setPhase('done');
    } catch (e) {
      console.warn('[AutoTrackingSetup] Scan error:', e);
      finish();
    }
  };

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const soft = isDark ? 'rgba(184,243,107,0.12)' : '#E3F2E8';

  const PrimaryButton = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable onPress={onPress} style={({ pressed }) => [s.primary, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.98 }] }]} accessibilityRole="button">
      <Text style={[s.primaryText, { color: accentFg }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[s.container, { backgroundColor: pageBg, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={pageBg} />

      {phase === 'intro' && (
        <>
          <View style={s.body}>
            {/* What it does: a bank SMS becomes a transaction */}
            <Animated.View entering={FadeInDown.duration(450)} style={[s.demo, { backgroundColor: surface, borderColor: line }]}>
              <View style={s.senderRow}>
                <Feather name="message-square" size={13} color={muted} />
                <Text style={[s.sender, { color: muted }]}>Bank alert</Text>
              </View>
              <View style={[s.bubble, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F2' }]}>
                <Text style={[s.bubbleText, { color: isDark ? '#C9D9D0' : '#3A4A42' }]}>
                  Rs 450.00 debited from a/c XX5039 to Swiggy on 12-Oct. UPI Ref 4021…
                </Text>
              </View>
              <Animated.View entering={FadeIn.delay(450).duration(300)} style={s.arrow}>
                <Feather name="arrow-down" size={18} color={isDark ? LIME : '#16A34A'} />
              </Animated.View>
              <Animated.View entering={FadeInUp.delay(650).duration(420)} style={[s.txRow, { backgroundColor: pageBg }]}>
                <CategoryIcon category="food" size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.txName, { color: ink }]}>Swiggy</Text>
                  <Text style={[s.txSub, { color: muted }]}>Food, account •• 5039</Text>
                </View>
                <Text style={[s.txAmt, { color: ink }]}>−₹450</Text>
              </Animated.View>
            </Animated.View>

            <Animated.Text
              entering={FadeInDown.delay(150).duration(450)}
              style={[s.title, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}
              accessibilityRole="header"
            >
              Track spending automatically
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(220).duration(450)} style={[s.sub, { color: muted }]}>
              Regent reads your bank’s SMS alerts and adds each payment for you. No typing.
            </Animated.Text>

            <Animated.View entering={FadeInDown.delay(300).duration(450)} style={s.points}>
              <View style={s.point}>
                <View style={[s.pointIcon, { backgroundColor: soft }]}>
                  <Feather name="shield" size={16} color={accent} />
                </View>
                <Text style={[s.pointText, { color: ink }]}>Only bank alerts. Never personal chats or OTPs.</Text>
              </View>
              <View style={s.point}>
                <View style={[s.pointIcon, { backgroundColor: soft }]}>
                  <Feather name="rotate-ccw" size={16} color={accent} />
                </View>
                <Text style={[s.pointText, { color: ink }]}>Adds your last 30 days, then keeps up on its own.</Text>
              </View>
            </Animated.View>
          </View>

          <Animated.View entering={FadeInDown.delay(380).duration(450)}>
            <PrimaryButton label="Allow SMS access" onPress={allow} />
            <Pressable onPress={finish} style={s.secondary} accessibilityRole="button">
              <Text style={[s.secondaryText, { color: muted }]}>Not now</Text>
            </Pressable>
          </Animated.View>
        </>
      )}

      {phase === 'scanning' && (
        <Animated.View entering={FadeIn.duration(300)} style={s.center}>
          <View style={s.hero}>
            <Animated.View style={[s.pulse, { borderColor: accent }, pulseStyle]} />
            <View style={[s.heroCore, { backgroundColor: soft }]}>
              <Feather name="message-square" size={32} color={accent} />
            </View>
          </View>
          <Text style={[s.stateTitle, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
            Finding your transactions
          </Text>
          <Text style={[s.stateSub, { color: muted }]}>Looking through bank alerts from the last 30 days.</Text>
        </Animated.View>
      )}

      {phase === 'done' && (
        <>
          <View style={s.center}>
            <Animated.View entering={ZoomIn.springify().damping(12)} style={s.hero}>
              <View style={[s.ring, { borderColor: isDark ? 'rgba(184,243,107,0.2)' : 'rgba(11,61,44,0.14)' }]} />
              <View style={[s.heroCore, { backgroundColor: FOREST }]}>
                <Feather name="check" size={38} color={LIME} />
              </View>
            </Animated.View>
            {found > 0 ? (
              <>
                <Text style={[s.bigNumber, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>{shown}</Text>
                <Text style={[s.stateTitle, { color: ink, marginTop: 6, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                  transaction{found === 1 ? '' : 's'} added
                </Text>
                <Text style={[s.stateSub, { color: muted }]}>From the last 30 days. New payments will appear as they happen.</Text>
              </>
            ) : (
              <>
                <Text style={[s.stateTitle, { color: ink, marginTop: 26, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                  You’re all set
                </Text>
                <Text style={[s.stateSub, { color: muted }]}>
                  No bank alerts from the last 30 days on this phone. New payments will appear as they happen.
                </Text>
              </>
            )}
          </View>
          <Animated.View entering={FadeInDown.delay(300).duration(400)}>
            <PrimaryButton label="Go to dashboard" onPress={finish} />
          </Animated.View>
        </>
      )}

      {phase === 'sim_mismatch' && (
        <>
          <View style={s.center}>
            <Animated.View entering={ZoomIn.springify().damping(12)} style={s.hero}>
              <View style={[s.ring, { borderColor: isDark ? 'rgba(239,68,68,0.25)' : 'rgba(220,38,38,0.18)' }]} />
              <View style={[s.heroCore, { backgroundColor: isDark ? 'rgba(239,68,68,0.18)' : '#FEE2E2' }]}>
                <Feather name="shield" size={36} color={isDark ? '#F87171' : '#DC2626'} />
              </View>
            </Animated.View>
            <Text style={[s.stateTitle, { color: ink, marginTop: 24, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
              Different SIM detected
            </Text>
            <Text style={[s.stateSub, { color: muted }]}>
              This phone’s active SIM card doesn’t match your registered Regent Money number.
            </Text>
            <View style={[s.point, { marginTop: 22, paddingHorizontal: 12 }]}>
              <View style={[s.pointIcon, { backgroundColor: soft }]}>
                <Feather name="lock" size={16} color={accent} />
              </View>
              <Text style={[s.pointText, { color: ink, fontSize: 13, lineHeight: 18 }]}>
                SMS tracking is automatically paused on this device so this phone’s personal messages stay private.
              </Text>
            </View>
          </View>
          <Animated.View entering={FadeInDown.delay(300).duration(400)}>
            <PrimaryButton label="Continue to dashboard" onPress={finish} />
          </Animated.View>
        </>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24 },
  body: { flex: 1, justifyContent: 'center' },

  demo: { borderWidth: 1, borderRadius: 28, padding: 18 },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sender: { fontSize: 12, fontWeight: '600' },
  bubble: { borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 12 },
  bubbleText: { fontSize: 13, lineHeight: 19 },
  arrow: { alignItems: 'center', paddingVertical: 10 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 12 },
  txName: { fontSize: 15, fontWeight: '700' },
  txSub: { fontSize: 12, marginTop: 2 },
  txAmt: { fontSize: 15, fontWeight: '700' },

  title: { fontSize: 30, letterSpacing: -0.8, lineHeight: 34, marginTop: 32 },
  sub: { fontSize: 15, lineHeight: 22, marginTop: 10 },
  points: { marginTop: 22, gap: 14 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pointText: { flex: 1, fontSize: 14, lineHeight: 20 },

  primary: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontWeight: '700' },
  secondary: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryText: { fontSize: 15, fontWeight: '600' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  hero: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 1 },
  pulse: { position: 'absolute', width: 88, height: 88, borderRadius: 44, borderWidth: 2 },
  heroCore: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  bigNumber: { fontSize: 64, letterSpacing: -2.4, lineHeight: 70, marginTop: 22, fontVariant: ['tabular-nums'] },
  stateTitle: { fontSize: 24, letterSpacing: -0.4, marginTop: 24, textAlign: 'center' },
  stateSub: { fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center', maxWidth: 300 },
});