// src/navigation/VoiceEntryScreen.tsx
//
// Voice entry: hold the Regent tab, say what you spent or received, check it, add it.
//
// Two ways of hearing, and the screen picks by itself:
//
//   on the phone  Android's own speech recogniser. Free and instant, shows the words as you
//                 speak. The phone's rules read the sentence; the AI is asked only when they
//                 are not sure, and then only the text is sent.
//   in the cloud  The sentence is recorded and sent to the speech services (Sarvam, then
//                 Groq, then Gemini). Used when the phone has no recogniser, when it fails,
//                 and when the person asks to speak again after a result they didn't like.
//
// Nothing depends on the phone's recogniser: every failure there moves to the cloud path.
//
//   listening  -> the mic is on; stops by itself when you pause, or tap Done
//   thinking   -> the sentence is being turned into a transaction
//   review     -> the usual transaction layout, everything editable (VoiceReview)
//   problem    -> nothing heard, no internet, daily limit... with a way forward each time
//
// A recording is sent once, never stored, and deleted from the phone straight after.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, BackHandler, Linking, AppState } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Font from 'expo-font';
import * as Haptics from 'expo-haptics';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { useTheme, useBankStore } from '../store';
import { VoiceReview } from '../features/voice/VoiceReview';
import {
  VoiceDraft,
  VoiceLanguage,
  VoiceOutcome,
  VoiceProblem,
  MAX_RECORDING_MS,
  sendVoiceRecording,
  understandSpokenText,
  deleteRecording,
  resolveDraftAccount,
} from '../services/voiceEntryService';
import { isLocalVoiceAvailable, startLocalVoice } from '../services/voiceRecognizer';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

/** Small, clear speech recording: mono, 16 kHz AAC. About 4 KB per second. */
const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,
};

/** How loud above the room's background counts as speech, and how quiet counts as a pause (dB). */
const SPEECH_ABOVE_FLOOR_DB = 12;
const PAUSE_ABOVE_FLOOR_DB = 6;
/** Stop this long after the person stops talking. */
const PAUSE_TO_STOP_MS = 1800;
/** Give up if nobody has spoken by now. */
const NO_SPEECH_TIMEOUT_MS = 7000;
/** Anything shorter than this is a slip of the finger. */
const MIN_RECORDING_MS = 700;
/** The phone's recogniser must open the mic within this, or the cloud path takes over. */
const LOCAL_READY_TIMEOUT_MS = 3000;
/** After Done, the phone's recogniser must answer within this. */
const LOCAL_RESULT_TIMEOUT_MS = 4000;

const SWITCHED_NOTICE = 'Switched to backup listening. Please say it once more.';

type Phase = 'starting' | 'listening' | 'thinking' | 'review' | 'problem';
type ProblemKind = VoiceProblem | 'mic_denied' | 'mic_blocked' | 'mic_failed';
type Engine = 'local' | 'cloud';

interface ProblemCopy {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
  primary: string;
}

const PROBLEMS: Record<ProblemKind, ProblemCopy> = {
  no_speech: {
    icon: 'mic-off',
    title: "I didn't catch that",
    body: 'Hold the phone a little closer and say the amount and where it went. For example: "Chai 20 rupaye cash".',
    primary: 'Try again',
  },
  not_a_transaction: {
    icon: 'help-circle',
    title: "That didn't sound like a transaction",
    body: 'Say the amount and what it was for. For example: "Petrol 500 rupaye Kotak se" or "Salary 45,000 received".',
    primary: 'Try again',
  },
  offline: {
    icon: 'wifi-off',
    title: 'No internet',
    body: 'Regent needs a connection to understand that one. You can still add it by typing, and it will sync later.',
    primary: 'Try again',
  },
  limit: {
    icon: 'clock',
    title: "Today's voice limit is used up",
    body: 'It resets at midnight. You can still add transactions by typing.',
    primary: 'Type it instead',
  },
  unavailable: {
    icon: 'cloud-off',
    title: "Regent couldn't hear that right now",
    body: 'The speech service is busy. Try again in a moment, or add it by typing.',
    primary: 'Try again',
  },
  signed_out: {
    icon: 'lock',
    title: 'Sign in again',
    body: 'Your session has ended. Sign in and try voice entry again.',
    primary: 'Close',
  },
  mic_denied: {
    icon: 'mic-off',
    title: 'Regent needs the microphone',
    body: 'Allow the microphone so you can add transactions by speaking. Recordings are used once and never kept.',
    primary: 'Allow microphone',
  },
  mic_blocked: {
    icon: 'mic-off',
    title: 'The microphone is turned off for Regent',
    body: 'Turn it on in Settings, under Permissions, then come back here.',
    primary: 'Open Settings',
  },
  mic_failed: {
    icon: 'alert-circle',
    title: "The microphone didn't start",
    body: 'Another app may be using it. Close any call or recorder and try again.',
    primary: 'Try again',
  },
};

const clock = (ms: number) => `0:${String(Math.min(59, Math.floor(ms / 1000))).padStart(2, '0')}`;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const VoiceEntryScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const rec = useAudioRecorderState(recorder, 100);

  const [phase, setPhase] = useState<Phase>('starting');
  const [problem, setProblem] = useState<{ kind: ProblemKind; message?: string } | null>(null);
  const [lang, setLang] = useState<VoiceLanguage>('hi');
  const [result, setResult] = useState<{ transcript: string; drafts: VoiceDraft[] } | null>(null);
  /** Words so far, from the phone's recogniser. */
  const [liveText, setLiveText] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Things the listening loop reads without re-rendering
  const phaseRef = useRef<Phase>('starting');
  const langRef = useRef<VoiceLanguage>('hi');
  const engine = useRef<Engine>('cloud');
  /** After the phone's recogniser fails or its result is rejected, the next try uses the cloud. */
  const preferCloud = useRef(false);
  const localHandle = useRef<{ stop: () => void; cancel: () => void } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startedAt = useRef(0);
  const floorDb = useRef<number | null>(null);
  const peakDb = useRef<number | null>(null);
  const spoke = useRef(false);
  const quietSince = useRef<number | null>(null);
  const run = useRef(0);
  const alive = useRef(true);

  const level = useSharedValue(0);

  const go = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const fail = useCallback(
    (kind: ProblemKind, message?: string) => {
      setProblem({ kind, message });
      go('problem');
    },
    [go],
  );

  const buzz = (style: Haptics.ImpactFeedbackStyle) => {
    Haptics.impactAsync(style).catch(() => {});
  };

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const dropLocal = () => {
    clearTimers();
    localHandle.current?.cancel();
    localHandle.current = null;
  };

  const close = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  }, [navigation]);

  const isCurrent = (myRun: number) => alive.current && myRun === run.current;

  /** Shows the drafts, or says what went wrong. */
  const settle = useCallback(
    (outcome: VoiceOutcome) => {
      if (outcome.ok) {
        setResult({ transcript: outcome.transcript, drafts: outcome.drafts });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        go('review');
      } else {
        fail(outcome.problem, outcome.message);
      }
    },
    [go, fail],
  );

  /* ---------------- Cloud path: record, then send ---------------- */

  const startCloud = useCallback(
    async (myRun: number) => {
      engine.current = 'cloud';
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (!isCurrent(myRun)) return;

        floorDb.current = null;
        peakDb.current = null;
        spoke.current = false;
        quietSince.current = null;
        startedAt.current = Date.now();
        setElapsedMs(0);
        // The recorder also stops itself at the limit, in case this screen is not looking
        recorder.record({ forDuration: MAX_RECORDING_MS / 1000 });
        buzz(Haptics.ImpactFeedbackStyle.Medium);
        go('listening');
      } catch {
        if (isCurrent(myRun)) fail('mic_failed');
      }
    },
    [recorder, go, fail],
  );

  /**
   * Stops the recorder. 'send' sends what was said, 'discard' throws it away, and 'silent' is
   * the no-speech timeout: nothing is sent when the level meter shows nobody spoke.
   */
  const finishCloud = useCallback(
    async (mode: 'send' | 'discard' | 'silent' = 'send') => {
      if (phaseRef.current !== 'listening' || engine.current !== 'cloud') return;
      const myRun = run.current;
      const length = Date.now() - startedAt.current;
      go('thinking');
      buzz(Haptics.ImpactFeedbackStyle.Light);

      let uri: string | null = null;
      try {
        await recorder.stop();
        uri = recorder.uri;
      } catch {
        uri = recorder.uri;
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});

      if (mode === 'discard' || !isCurrent(myRun)) {
        deleteRecording(uri);
        return;
      }
      if (!uri) {
        fail('mic_failed');
        return;
      }
      // Nothing was said: don't spend a request on silence
      if (length < MIN_RECORDING_MS || mode === 'silent') {
        deleteRecording(uri);
        fail('no_speech');
        return;
      }

      const outcome = await sendVoiceRecording(uri, langRef.current);
      if (isCurrent(myRun)) settle(outcome);
    },
    [recorder, go, fail, settle],
  );

  /* ---------------- Phone path: Android's recogniser ---------------- */

  /** The phone's recogniser let us down: carry on with the cloud path, same screen. */
  const switchToCloud = useCallback(
    async (myRun: number) => {
      dropLocal();
      preferCloud.current = true;
      if (!isCurrent(myRun)) return;
      setLiveText('');
      setNotice(SWITCHED_NOTICE);
      go('starting');
      // Let Android release the microphone before the recorder asks for it
      await wait(250);
      if (isCurrent(myRun)) await startCloud(myRun);
    },
    [go, startCloud],
  );

  /** Done was tapped: ask the phone's recogniser for its answer, and don't wait for ever. */
  const finishLocal = useCallback(() => {
    const handle = localHandle.current;
    if (!handle || phaseRef.current !== 'listening') return;
    const myRun = run.current;
    go('thinking');
    buzz(Haptics.ImpactFeedbackStyle.Light);
    handle.stop();
    timers.current.push(
      setTimeout(() => {
        if (isCurrent(myRun) && localHandle.current === handle) switchToCloud(myRun);
      }, LOCAL_RESULT_TIMEOUT_MS),
    );
  }, [go, switchToCloud]);

  /** Resolves true when the phone's recogniser took the session (even if it later hands over). */
  const startLocal = useCallback(
    async (myRun: number): Promise<boolean> => {
      let ready = false;
      const handle = await startLocalVoice(langRef.current === 'en' ? 'en-IN' : 'hi-IN', {
        onReady: () => {
          ready = true;
        },
        onPartial: (text) => {
          if (isCurrent(myRun)) setLiveText(text);
        },
        onLevel: (value) => {
          level.set(withTiming(value, { duration: 110 }));
        },
        onFinal: async (text) => {
          clearTimers();
          localHandle.current = null;
          if (!isCurrent(myRun)) return;
          setLiveText(text);
          go('thinking');
          buzz(Haptics.ImpactFeedbackStyle.Light);
          const outcome = await understandSpokenText(text);
          if (isCurrent(myRun)) settle(outcome);
        },
        onError: (reason) => {
          clearTimers();
          localHandle.current = null;
          if (!isCurrent(myRun)) return;
          // Whatever happens next, the following attempt uses the other engine
          preferCloud.current = true;
          if (reason === 'no_speech') fail('no_speech');
          else switchToCloud(myRun);
        },
      });
      if (!handle) return false;
      if (!isCurrent(myRun)) {
        handle.cancel();
        return true;
      }

      engine.current = 'local';
      localHandle.current = handle;
      startedAt.current = Date.now();
      setElapsedMs(0);
      buzz(Haptics.ImpactFeedbackStyle.Medium);
      go('listening');

      timers.current.push(
        // The recogniser accepted the request but never opened the mic
        setTimeout(() => {
          if (!ready && isCurrent(myRun) && localHandle.current === handle) switchToCloud(myRun);
        }, LOCAL_READY_TIMEOUT_MS),
        // Same time limit as a recording
        setTimeout(() => {
          if (isCurrent(myRun) && localHandle.current === handle) finishLocal();
        }, MAX_RECORDING_MS),
      );
      return true;
    },
    [go, fail, settle, switchToCloud, finishLocal, level],
  );

  /* ---------------- Start, stop, leave ---------------- */

  const start = useCallback(
    async (options: { useCloud?: boolean } = {}) => {
      const myRun = ++run.current;
      dropLocal();
      if (options.useCloud) preferCloud.current = true;
      setProblem(null);
      setResult(null);
      setLiveText('');
      setNotice(null);
      level.set(0);
      go('starting');
      try {
        let perm = await getRecordingPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
        if (!isCurrent(myRun)) return;
        if (!perm.granted) {
          fail(perm.canAskAgain ? 'mic_denied' : 'mic_blocked');
          return;
        }
        if (!preferCloud.current && (await isLocalVoiceAvailable())) {
          if (!isCurrent(myRun)) return;
          if (await startLocal(myRun)) return;
        }
        if (isCurrent(myRun)) await startCloud(myRun);
      } catch {
        if (isCurrent(myRun)) fail('mic_failed');
      }
    },
    [go, fail, startLocal, startCloud, level],
  );

  const done = useCallback(() => {
    if (engine.current === 'local') finishLocal();
    else finishCloud();
  }, [finishLocal, finishCloud]);

  // Start listening as soon as the screen opens
  useEffect(() => {
    alive.current = true;
    const kickoff = setTimeout(start, 0);
    return () => {
      clearTimeout(kickoff);
      alive.current = false;
      run.current++;
      dropLocal();
      if (phaseRef.current === 'listening' && engine.current === 'cloud') {
        recorder
          .stop()
          .then(() => deleteRecording(recorder.uri))
          .catch(() => {});
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The clock under the mic
  useEffect(() => {
    if (phase !== 'listening') return;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt.current), 250);
    return () => clearInterval(id);
  }, [phase]);

  // Cloud path only: watch the level, stop on a pause after speech, on silence, or at the limit
  useEffect(() => {
    if (phase !== 'listening' || engine.current !== 'cloud') return;
    const now = Date.now();
    const elapsed = now - startedAt.current;
    const db = typeof rec.metering === 'number' && isFinite(rec.metering) ? rec.metering : null;

    if (db !== null) {
      // The quietest level seen so far is the room's background noise
      floorDb.current = floorDb.current === null ? db : Math.min(floorDb.current, db);
      peakDb.current = peakDb.current === null ? db : Math.max(peakDb.current, db);
      const above = db - floorDb.current;
      level.set(withTiming(Math.max(0, Math.min(1, above / 30)), { duration: 110 }));

      if (elapsed > 300 && above >= SPEECH_ABOVE_FLOOR_DB) {
        spoke.current = true;
        quietSince.current = null;
      } else if (spoke.current && above < PAUSE_ABOVE_FLOOR_DB) {
        if (quietSince.current === null) quietSince.current = now;
        else if (now - quietSince.current >= PAUSE_TO_STOP_MS) {
          finishCloud();
          return;
        }
      } else if (above >= PAUSE_ABOVE_FLOOR_DB) {
        quietSince.current = null;
      }
      if (!spoke.current && elapsed >= NO_SPEECH_TIMEOUT_MS) {
        // Only trust the meter when it is clearly working (the level moved at all);
        // otherwise send the recording and let the server decide.
        finishCloud(peakDb.current - floorDb.current >= 3 ? 'silent' : 'send');
        return;
      }
    }
    if (elapsed >= MAX_RECORDING_MS - 150 || (elapsed > 1000 && !rec.isRecording)) finishCloud();
  }, [rec.metering, rec.durationMillis, rec.isRecording, phase, finishCloud, level]);

  // A phone call or switching apps ends the listening: use what we have rather than lose it
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && phaseRef.current === 'listening') done();
      // Back from Settings after turning the microphone on
      if (state === 'active' && phaseRef.current === 'problem' && problem?.kind === 'mic_blocked') start();
    });
    return () => sub.remove();
  }, [done, start, problem?.kind]);

  const leave = useCallback(() => {
    run.current++;
    dropLocal();
    if (phaseRef.current === 'listening' && engine.current === 'cloud') {
      recorder
        .stop()
        .then(() => deleteRecording(recorder.uri))
        .catch(() => {});
    }
    close();
  }, [recorder, close]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, [leave]);

  const typeInstead = useCallback(() => {
    const profiles = useBankStore.getState().bankProfiles;
    const bank = profiles.find((b) => b.id === resolveDraftAccount(null).id);
    if (bank) navigation.replace('ManualTransaction', { bank, initialType: 'debit' });
    else close();
  }, [navigation, close]);

  const onPrimary = () => {
    const kind = problem?.kind;
    if (kind === 'mic_blocked') Linking.openSettings().catch(() => {});
    else if (kind === 'limit') typeInstead();
    else if (kind === 'signed_out') close();
    else start();
  };

  /* ---------------- Animations ---------------- */

  const breathe = useSharedValue(0);
  useEffect(() => {
    breathe.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0, { duration: 900 })), -1);
  }, [breathe]);
  const ringOuter = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + level.value * 0.55 + breathe.value * 0.04 }],
    opacity: 0.16 + level.value * 0.2,
  }));
  const ringInner = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + level.value * 0.28 + breathe.value * 0.03 }],
    opacity: 0.3 + level.value * 0.25,
  }));

  /* ---------------- Render ---------------- */

  if (phase === 'review' && result) {
    return (
      <VoiceReview
        drafts={result.drafts}
        transcript={result.transcript}
        onClose={close}
        // They didn't like what was heard: the second try uses the cloud services
        onSpeakAgain={() => start({ useCloud: true })}
        onFinished={close}
      />
    );
  }

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const chip = isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF';
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const onAccent = isDark ? FOREST : LIME;
  const display =
    typeof Font?.isLoaded === 'function' && Font.isLoaded('BricolageGrotesque_800ExtraBold')
      ? 'BricolageGrotesque_800ExtraBold'
      : undefined;

  const listening = phase === 'listening';
  const copy = problem ? PROBLEMS[problem.kind] : null;
  const shownMs = listening ? Math.max(0, elapsedMs) : 0;
  const secondsLeft = Math.ceil((MAX_RECORDING_MS - shownMs) / 1000);
  const canType = problem && !['signed_out', 'limit', 'mic_denied', 'mic_blocked'].includes(problem.kind);

  return (
    <View style={{ flex: 1, backgroundColor: pageBg, paddingTop: Math.max(insets.top, 12) + 4 }}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable onPress={leave} style={[styles.roundBtn, { backgroundColor: chip }]} accessibilityRole="button" accessibilityLabel="Close voice entry">
          <Feather name="x" size={20} color={ink} />
        </Pressable>

        <View
          style={[styles.langWrap, { backgroundColor: chip, borderColor: line }]}
          accessibilityRole="radiogroup"
          accessibilityLabel="Language you will speak"
        >
          {(['hi', 'en'] as VoiceLanguage[]).map((code) => {
            const on = lang === code;
            return (
              <Pressable
                key={code}
                disabled={phase === 'thinking'}
                onPress={() => {
                  if (on) return;
                  setLang(code);
                  langRef.current = code;
                  // The phone's recogniser is told the language up front, so listen afresh
                  if (phaseRef.current === 'listening' && engine.current === 'local') start();
                }}
                style={[styles.langBtn, on && { backgroundColor: accent }]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={code === 'hi' ? 'Hindi and English' : 'English only'}
              >
                <Text style={[styles.langText, { color: on ? onAccent : muted }]}>{code === 'hi' ? 'हिंदी + English' : 'English'}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.roundBtn} />
      </View>

      {phase === 'problem' && copy ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.center}>
          <View style={[styles.problemIcon, { backgroundColor: chip, borderColor: line }]}>
            <Feather name={copy.icon} size={30} color={ink} />
          </View>
          <Text style={[styles.title, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>{copy.title}</Text>
          <Text style={[styles.body, { color: muted }]}>{problem?.kind === 'limit' && problem.message ? problem.message : copy.body}</Text>
        </Animated.View>
      ) : (
        <View style={styles.center}>
          <View style={styles.micWrap}>
            <Animated.View style={[styles.ring, styles.ringOuter, { backgroundColor: accent }, ringOuter]} />
            <Animated.View style={[styles.ring, styles.ringInner, { backgroundColor: accent }, ringInner]} />
            <View style={[styles.micCircle, { backgroundColor: accent }]}>
              {phase === 'thinking' || phase === 'starting' ? (
                <ActivityIndicator color={onAccent} size="large" />
              ) : (
                <Feather name="mic" size={40} color={onAccent} />
              )}
            </View>
          </View>

          <Text
            style={[styles.title, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}
            accessibilityLiveRegion="polite"
          >
            {phase === 'thinking' ? 'Understanding…' : phase === 'starting' ? 'Getting ready…' : 'Listening…'}
          </Text>

          {liveText ? (
            <Text style={[styles.live, { color: ink }]} numberOfLines={4} accessibilityLiveRegion="polite">
              {liveText}
            </Text>
          ) : (
            <Text style={[styles.body, { color: muted }]}>
              {phase === 'thinking'
                ? 'Turning what you said into a transaction.'
                : 'Say the amount, where it went, and how you paid.'}
            </Text>
          )}

          {notice && phase !== 'thinking' ? (
            <Animated.View entering={FadeIn.duration(200)} style={[styles.notice, { backgroundColor: chip, borderColor: line }]}>
              <Feather name="refresh-cw" size={13} color={muted} />
              <Text style={[styles.noticeText, { color: ink }]}>{notice}</Text>
            </Animated.View>
          ) : null}

          {listening && !liveText ? (
            <Animated.View entering={FadeInDown.duration(300)} style={[styles.examples, { backgroundColor: chip, borderColor: line }]}>
              <Text style={[styles.exampleLabel, { color: muted }]}>Try saying</Text>
              <Text style={[styles.exampleText, { color: ink }]}>
                {lang === 'hi' ? '"Swiggy pe 450 rupaye, HDFC se"' : '"Spent 450 at Swiggy from HDFC"'}
              </Text>
              <Text style={[styles.exampleText, { color: ink }]}>
                {lang === 'hi' ? '"Kal chai 20 rupaye cash"' : '"Got 45,000 salary in Kotak"'}
              </Text>
            </Animated.View>
          ) : null}
        </View>
      )}

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
        {listening ? (
          <Text style={[styles.timer, { color: secondsLeft <= 5 ? (isDark ? '#FFA8A8' : '#B42318') : muted }]}>
            {secondsLeft <= 5 ? `${Math.max(0, secondsLeft)} seconds left` : `${clock(shownMs)} · stops when you pause`}
          </Text>
        ) : null}

        {phase === 'problem' && copy ? (
          <>
            <Pressable
              onPress={onPrimary}
              style={({ pressed }) => [styles.cta, { backgroundColor: accent }, pressed && { transform: [{ scale: 0.98 }] }]}
              accessibilityRole="button"
            >
              <Text style={[styles.ctaText, { color: onAccent }]}>{copy.primary}</Text>
            </Pressable>
            {canType ? (
              <Pressable onPress={typeInstead} style={styles.secondary} accessibilityRole="button">
                <Text style={[styles.secondaryText, { color: ink }]}>Type it instead</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Pressable
            onPress={done}
            disabled={!listening}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: accent, opacity: listening ? 1 : 0.5 },
              pressed && listening && { transform: [{ scale: 0.98 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Done speaking"
          >
            <Text style={[styles.ctaText, { color: onAccent }]}>{listening ? 'Done' : 'Please wait'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  langWrap: { flexDirection: 'row', padding: 4, borderRadius: 24, borderWidth: 1 },
  langBtn: { height: 36, paddingHorizontal: 14, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  langText: { fontSize: 13, fontWeight: '700' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  micWrap: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  ring: { position: 'absolute', borderRadius: 999 },
  ringOuter: { width: 150, height: 150 },
  ringInner: { width: 132, height: 132 },
  micCircle: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center' },

  title: { fontSize: 28, letterSpacing: -0.6, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 320 },
  live: { fontSize: 20, lineHeight: 27, fontWeight: '600', textAlign: 'center', marginTop: 12, maxWidth: 330 },

  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, marginTop: 16 },
  noticeText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },

  examples: { marginTop: 24, borderWidth: 1, borderRadius: 22, paddingVertical: 14, paddingHorizontal: 18, alignSelf: 'stretch', gap: 4 },
  exampleLabel: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  exampleText: { fontSize: 15, fontWeight: '600', lineHeight: 21 },

  problemIcon: { width: 84, height: 84, borderRadius: 42, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },

  footer: { paddingHorizontal: 16, paddingTop: 10 },
  timer: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 12, fontVariant: ['tabular-nums'] },
  cta: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },
  secondary: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  secondaryText: { fontSize: 15, fontWeight: '600' },
});
