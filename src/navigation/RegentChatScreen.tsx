// src/navigation/RegentChatScreen.tsx
//
// Regent AI tab: follows the app's light/dark theme, uses the tree mark as
// the agent's face, and keeps suggestions as compact right-aligned bubbles
// so the screen has room to breathe.

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TextInput,
  Pressable,
  Keyboard,
  Platform,
  Image,
  PanResponder,
  Animated as RNAnimated,
  useWindowDimensions,
} from 'react-native';
import { KeyboardAvoidingView, useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  FadeIn,
  FadeInDown,
  FadeInRight,
  runOnJS,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as Font from 'expo-font';

import {
  useAIStore,
  useAuthStore,
  useBankStore,
  useGoalsStore,
  useTransactionStore,
  useBudgetStore,
  useSidebarStore,
  useTheme,
  showGlobalConfirm,
} from '../store';
import { useSyncDb } from '../services/useSyncDb';
import { askChatbot, ChatMessage } from '../services/aiService';
import { sanitizeTransactions } from '../services/sanitizer';
import { FormattedChatMessage } from '../components/FormattedChatMessage';
import { mmkvStorage } from '../db/mmkv';
import { EXECUTIVE_PROMPT_SETS, getWeeklySetIndex } from '../constants/executivePrompts';
import { getSessionGreeting } from '../constants/aiGreetings';

const TREE = require('../../assets/tree-transparent.png');

/* ------------------------------------------------------------------ */
/* Palettes                                                            */
/* ------------------------------------------------------------------ */

type Palette = ReturnType<typeof makePalette>;

const makePalette = (dark: boolean) =>
  dark
    ? {
        dark: true,
        bg: '#07110D',
        surface: '#0F1E18',
        line: '#1E3329',
        lineStrong: '#2B4A3B',
        text: '#EAF2EE',
        body: '#DCE7E1',
        muted: '#93AA9E',
        faint: '#7F978B',
        ringRgb: '184, 243, 107',
        glow: 0.1,
        dot: '#B8F36B',
        userBg: '#B8F36B',
        userFg: '#07110D',
        sugBg: 'transparent',
        sugBorder: '#2B4A3B',
        arrow: '#B8F36B',
        sendBg: '#B8F36B',
        sendFg: '#07110D',
        idleBg: '#1E3329',
        idleFg: '#5E7A6C',
        link: '#B8F36B',
      }
    : {
        dark: false,
        bg: '#F3F6F4',
        surface: '#FFFFFF',
        line: '#DCE5E0',
        lineStrong: '#9DB2A7',
        text: '#0B1F17',
        body: '#26332D',
        muted: '#4F6159',
        faint: '#5F7268',
        ringRgb: '11, 61, 44',
        glow: 0.06,
        dot: '#16A34A',
        userBg: '#0B3D2C',
        userFg: '#FFFFFF',
        sugBg: '#FFFFFF',
        sugBorder: '#C9D4CE',
        arrow: '#0B6B3A',
        sendBg: '#0B3D2C',
        sendFg: '#B8F36B',
        idleBg: '#E9EFEB',
        idleFg: '#9DB2A7',
        link: '#0B6B3A',
      };

const SET_KEY = 'regent_active_prompt_set_idx';
const THINKING_STEPS = ['Reading your transactions', 'Checking budgets and goals', 'Writing your answer'];

const sentenceCase = (s: string) => {
  const t = (s || '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t;
};

const formatMessageTime = (timestamp?: number) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minStr = minutes < 10 ? '0' + minutes : String(minutes);
  return `${hours}:${minStr} ${ampm}`;
};

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/** The tree mark on a transparent background: Regent's face everywhere. */
const TreeCoin: React.FC<{ size: number; ring?: string }> = ({ size }) => (
  <Image
    source={TREE}
    style={{ width: size, height: size, flexShrink: 0 }}
    resizeMode="contain"
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
  />
);

const BreathingRing: React.FC<{ size: number; delay: number; fill?: boolean; strength: number; rgb: string }> = ({
  size,
  delay,
  fill,
  strength,
  rgb,
}) => {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.45 * t.value,
    transform: [{ scale: 0.93 + 0.07 * t.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: fill ? 0 : 1,
          borderColor: `rgba(${rgb}, ${strength})`,
          backgroundColor: fill ? `rgba(${rgb}, ${strength})` : 'transparent',
        },
        style,
      ]}
    />
  );
};

const Orb: React.FC<{ P: Palette }> = ({ P }) => {
  const float = useSharedValue(0);
  useEffect(() => {
    float.value = withRepeat(withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []);
  const coreStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -2 + 4 * float.value }] }));

  return (
    <View style={{ width: 136, height: 136, alignItems: 'center', justifyContent: 'center' }}>
      <BreathingRing size={136} delay={0} strength={0.14} rgb={P.ringRgb} />
      <BreathingRing size={106} delay={400} strength={0.24} rgb={P.ringRgb} />
      <BreathingRing size={84} delay={800} fill strength={P.glow} rgb={P.ringRgb} />
      <Animated.View style={coreStyle}>
        <TreeCoin size={98} />
      </Animated.View>
    </View>
  );
};

const ThinkingDot: React.FC<{ delay: number; color: string }> = ({ delay, color }) => {
  const t = useSharedValue(0.3);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 450 }), -1, true));
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.8 + 0.2 * t.value }] }));
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }, style]} />;
};

const ThinkingIndicator: React.FC<{ P: Palette }> = ({ P }) => {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, THINKING_STEPS.length - 1)), 1600);
    return () => clearInterval(id);
  }, []);
  return (
    <Animated.View entering={FadeIn.duration(250)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <TreeCoin size={28} ring={P.line} />
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <ThinkingDot delay={0} color={P.dot} />
        <ThinkingDot delay={150} color={P.dot} />
        <ThinkingDot delay={300} color={P.dot} />
      </View>
      <Animated.Text key={step} entering={FadeIn.duration(300)} style={{ color: P.muted, fontSize: 13 }}>
        {THINKING_STEPS[step]}
      </Animated.Text>
    </Animated.View>
  );
};

/** Right-aligned "ready to send" bubble, styled like an outlined user message. */
const SuggestionBubble: React.FC<{ P: Palette; label: string; onPress: () => void; delay: number }> = ({
  P,
  label,
  onPress,
  delay,
}) => {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View entering={FadeInRight.delay(delay).duration(380)} style={{ alignSelf: 'flex-end', maxWidth: 280 }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => (s.value = withSpring(0.96, { damping: 15, stiffness: 320 }))}
        onPressOut={() => (s.value = withSpring(1, { damping: 15, stiffness: 320 }))}
        accessibilityRole="button"
        accessibilityLabel={`Ask: ${label}`}
      >
        <Animated.View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 8,
              borderWidth: 1,
              borderColor: P.sugBorder,
              backgroundColor: P.sugBg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderBottomLeftRadius: 20,
              borderBottomRightRadius: 6,
              paddingHorizontal: 14,
              paddingVertical: 11,
            },
            a,
          ]}
        >
          <Feather name="arrow-up-right" size={14} color={P.arrow} style={{ marginTop: 2 }} />
          <Text style={{ color: P.text, fontSize: 14, lineHeight: 19, flexShrink: 1 }}>{label}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
};

/** Swipeable prompt cards: swipe left for the next idea, right for the previous one, tap to ask. */
const SwipeDeck: React.FC<{
  P: Palette;
  cards: any[];
  topic: string;
  onAsk: (query: string) => void;
  onNextTopic: () => void;
}> = ({ P, cards, topic, onAsk, onNextTopic }) => {
  const [index, setIndex] = useState(0);
  const pan = useRef(new RNAnimated.Value(0)).current;
  const isDraggingRef = useRef(false);
  const count = cards.length;

  useEffect(() => {
    setIndex(0);
    pan.setValue(0);
  }, [cards]);

  const fling = (dir: 1 | -1) => {
    RNAnimated.timing(pan, {
      toValue: dir === 1 ? -420 : 420,
      duration: 170,
      useNativeDriver: false,
    }).start(() => {
      setIndex((i) => (i + dir + count) % count);
      pan.setValue(dir === 1 ? 420 : -420);
      RNAnimated.spring(pan, {
        toValue: 0,
        friction: 7,
        tension: 65,
        useNativeDriver: false,
      }).start(() => {
        isDraggingRef.current = false;
      });
    });
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => {
          isDraggingRef.current = false;
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > 6) {
            isDraggingRef.current = true;
          }
          pan.setValue(g.dx);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx < -36 || g.vx < -0.2) fling(1);
          else if (g.dx > 36 || g.vx > 0.2) fling(-1);
          else {
            RNAnimated.spring(pan, { toValue: 0, friction: 6, useNativeDriver: false }).start(() => {
              isDraggingRef.current = false;
            });
          }
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          RNAnimated.spring(pan, { toValue: 0, friction: 6, useNativeDriver: false }).start(() => {
            isDraggingRef.current = false;
          });
        },
      }),
    [count]
  );

  if (count === 0) return null;
  const card = cards[index];

  const rotate = pan.interpolate({ inputRange: [-220, 0, 220], outputRange: ['-7deg', '0deg', '7deg'], extrapolate: 'clamp' });
  const nextScale = pan.interpolate({ inputRange: [-220, 0, 220], outputRange: [1, 0.95, 1], extrapolate: 'clamp' });
  const nextLift = pan.interpolate({ inputRange: [-220, 0, 220], outputRange: [0, 9, 0], extrapolate: 'clamp' });

  const cardBase = {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    height: 156,
    borderRadius: 24,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.line,
  };

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View style={{ height: 176 }}>
        {count > 2 && (
          <View style={[cardBase, { top: 18, opacity: 0.45, transform: [{ scaleX: 0.9 }] }]} />
        )}
        {count > 1 && (
          <RNAnimated.View
            style={[cardBase, { opacity: 0.8, transform: [{ translateY: nextLift }, { scale: nextScale }] }]}
          />
        )}
        <RNAnimated.View
          {...responder.panHandlers}
          style={[
            cardBase,
            { borderColor: P.lineStrong, transform: [{ translateX: pan }, { rotate }] },
          ]}
        >
          <Pressable
            onPress={() => {
              if (isDraggingRef.current) return;
              onAsk(card.query);
            }}
            style={{ flex: 1, padding: 18, justifyContent: 'space-between' }}
            accessibilityRole="button"
            accessibilityLabel={`Ask: ${card.query}`}
            accessibilityHint="Swipe left or right for other ideas"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 11,
                  backgroundColor: P.dark ? 'rgba(184, 243, 107, 0.14)' : '#E3F2E8',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name={card.icon as any} size={16} color={P.arrow} />
              </View>
              <Text style={{ color: P.muted, fontSize: 12, fontWeight: '600' }}>{topic}</Text>
            </View>
            <View>
              <Text style={{ color: P.text, fontSize: 17, fontWeight: '700' }} numberOfLines={1}>
                {sentenceCase(card.title)}
              </Text>
              <Text style={{ color: P.muted, fontSize: 13, lineHeight: 18, marginTop: 3 }} numberOfLines={2}>
                {card.query}
              </Text>
            </View>
            <View style={{ position: 'absolute', right: 16, top: 16 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: P.sendBg,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="arrow-up-right" size={16} color={P.sendFg} />
              </View>
            </View>
          </Pressable>
        </RNAnimated.View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {cards.slice(0, Math.min(count, 11)).map((_, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  setIndex(i);
                  pan.setValue(0);
                }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Go to card ${i + 1}`}
                style={{
                  width: i === index ? 16 : 5,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: i === index ? P.dot : P.line,
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable
              onPress={() => fling(-1)}
              hitSlop={8}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: P.line,
                backgroundColor: P.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              accessibilityRole="button"
              accessibilityLabel="Previous idea"
            >
              <Feather name="chevron-left" size={15} color={P.muted} />
            </Pressable>
            <Pressable
              onPress={() => fling(1)}
              hitSlop={8}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: P.line,
                backgroundColor: P.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              accessibilityRole="button"
              accessibilityLabel="Next idea"
            >
              <Feather name="chevron-right" size={15} color={P.muted} />
            </Pressable>
          </View>
        </View>
        <Pressable
          onPress={onNextTopic}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: P.line, backgroundColor: P.surface }}
          accessibilityRole="button"
          accessibilityLabel="Show a different topic"
        >
          <Feather name="shuffle" size={13} color={P.text} />
          <Text style={{ color: P.text, fontSize: 12, fontWeight: '600' }}>New topic</Text>
        </Pressable>
      </View>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export const RegentChatScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { width: windowWidth } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const { sync } = useSyncDb();

  const P = useMemo(() => makePalette(isDark), [isDark]);
  const styles = useMemo(() => makeStyles(P), [P]);

  const chatHistory = useAIStore((s) => s.chatHistory);
  const addChatMessage = useAIStore((s) => s.addChatMessage);
  const setChatHistory = useAIStore((s) => s.setChatHistory);
  const updateChatMessage = useAIStore((s) => s.updateChatMessage);
  const clearChatHistory = useAIStore((s) => s.clearChatHistory);
  const isThinking = useAIStore((s) => s.isThinking);
  const setThinking = useAIStore((s) => s.setThinking);

  const user = useAuthStore((s) => s.user);
  const bankProfiles = useBankStore((s) => s.bankProfiles);
  const goals = useGoalsStore((s) => s.goals);
  const transactions = useTransactionStore((s) => s.transactions);
  const budgets = useBudgetStore((s) => s.budgets);

  const [input, setInput] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const inputRef = useRef<TextInput>(null);
  const [greeting, setGreeting] = useState(() => getSessionGreeting(user?.name));
  const [setIndex, setSetIndex] = useState<number>(() => {
    const saved = mmkvStorage.getNumber(SET_KEY);
    const n = EXECUTIVE_PROMPT_SETS.length;
    return saved !== undefined && !isNaN(saved) ? ((saved % n) + n) % n : getWeeklySetIndex();
  });

  const listRef = useRef<FlatList>(null);
  const initialCountRef = useRef(chatHistory.length);

  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  useEffect(() => {
    if (user?.name) setGreeting(getSessionGreeting(user.name));
  }, [user?.name]);

  useFocusEffect(
    useCallback(() => {
      sync();
    }, [sync])
  );

  useKeyboardHandler(
    {
      onStart: (e) => {
        'worklet';
        runOnJS(setKeyboardOpen)(e.height > 0);
      },
    },
    []
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const a = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  const isSmall = windowWidth < 380;
  const navBarHeight = isSmall ? 58 : 64;
  const tabOffset = Platform.OS === 'web' ? 18 : Math.max(insets.bottom + (Platform.OS === 'ios' ? 4 : 8), 16);
  const bottomPad = keyboardOpen && Platform.OS !== 'web' ? 10 : tabOffset + navBarHeight + 12;

  /* ---------------- Suggestions ---------------- */

  const activeSet = EXECUTIVE_PROMPT_SETS[setIndex] || EXECUTIVE_PROMPT_SETS[0];
  const cards = activeSet.cards || [];
  const topicLabel = activeSet.badge || activeSet.category || 'Ideas';

  const nextTopic = () => {
    const next = (setIndex + 1) % EXECUTIVE_PROMPT_SETS.length;
    setSetIndex(next);
    mmkvStorage.setNumber(SET_KEY, next);
  };

  const askedQueries = useMemo(
    () => new Set(chatHistory.filter((m) => m.role === 'user').map((m) => (typeof m.content === 'string' ? m.content : String(m.content || '')).trim())),
    [chatHistory]
  );

  const followUps = useMemo(
    () => cards.filter((c: any) => !askedQueries.has(c.query.trim())).slice(0, 2),
    [cards, askedQueries]
  );

  /* ---------------- Sending ---------------- */

  const totalBalance = useMemo(
    () => bankProfiles.reduce((sum, b) => sum + (Number(b.currentBalance) || 0), 0),
    [bankProfiles]
  );

  const startEdit = useCallback((index: number, content: string) => {
    setEditingIndex(index);
    setInput(content);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingIndex(null);
    setInput('');
    Keyboard.dismiss();
  }, []);

  const saveInPlace = useCallback(() => {
    if (editingIndex === null || !input.trim()) return;
    updateChatMessage(editingIndex, input.trim());
    setEditingIndex(null);
    setInput('');
    Keyboard.dismiss();
  }, [editingIndex, input, updateChatMessage]);

  const send = async (text?: string) => {
    const query = (text ?? input).trim();
    if (!query || isThinking) return;

    const isEditing = editingIndex !== null && editingIndex >= 0 && editingIndex < chatHistory.length;
    const targetEditIdx = isEditing ? editingIndex : null;
    const targetMsg = targetEditIdx !== null ? chatHistory[targetEditIdx] : null;

    if (targetMsg && targetMsg.role === 'assistant') {
      saveInPlace();
      return;
    }

    setInput('');
    setEditingIndex(null);
    Keyboard.dismiss();

    let queryHistory: ChatMessage[];

    if (targetEditIdx !== null) {
      const base = chatHistory.slice(0, targetEditIdx);
      const editedUserMsg: ChatMessage = {
        role: 'user',
        content: query,
        timestamp: Date.now(),
        isEdited: true,
      };
      setChatHistory([...base, editedUserMsg]);
      queryHistory = base;
    } else {
      const userMsg: ChatMessage = {
        role: 'user',
        content: query,
        timestamp: Date.now(),
      };
      queryHistory = chatHistory;
      addChatMessage(userMsg);
    }

    setThinking(true);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const context = {
        user: {
          name: user?.name,
          email: user?.email,
          gender: user?.gender,
          dob: user?.dob,
          occupation: user?.occupation,
          currentIncome: user?.currentIncome ? Number(user.currentIncome) : undefined,
          incomeSourcesCount: user?.incomeSourcesCount,
        },
        totalBalance,
        accounts: bankProfiles.map((b) => ({
          bankName: b.bankName,
          accountType: 'Bank Account',
          balance: Number(b.currentBalance) || 0,
          accountNumberEnding: b.accountNumberSuffix || undefined,
        })),
        savingsGoals: goals.map((g) => ({
          name: g.name,
          target: Number(g.targetAmount) || 0,
          current: Number(g.currentAmount) || 0,
          targetDate: g.targetDate ? new Date(g.targetDate).toLocaleDateString('en-IN') : undefined,
        })),
        budgets: budgets.map((b) => ({
          category: b.category,
          limit: Number(b.limitAmount) || 0,
          spent: Number(b.spentAmount) || 0,
        })),
        recentTransactions: sanitizeTransactions(
          transactions.slice(0, 15).map((t) => ({
            amount: Number(t.amount) || 0,
            category: t.category,
            merchant: t.merchant,
            timestamp: t.timestamp,
            type: (t.type === 'credit' ? 'credit' : 'debit') as 'credit' | 'debit',
          }))
        ),
      };

      const response = await askChatbot(query, queryHistory, context);
      addChatMessage({ role: 'assistant', content: response, timestamp: Date.now() });
    } catch (e) {
      console.error(e);
      addChatMessage({
        role: 'assistant',
        content: "I couldn't reach the server just now. Check your connection and ask again.",
        timestamp: Date.now(),
      });
    } finally {
      setThinking(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 120);
    }
  };

  const newChat = () => {
    if (chatHistory.length === 0) return;
    showGlobalConfirm({
      title: 'Start a new chat?',
      message: 'This clears the current conversation with Regent.',
      confirmText: 'New chat',
      cancelText: 'Cancel',
      icon: 'edit-3',
      onConfirm: () => {
        clearChatHistory();
        setEditingIndex(null);
        setInput('');
        initialCountRef.current = 0;
      },
    });
  };

  const copy = async (text: string, index: number) => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        await Clipboard.setStringAsync(text);
      }
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((p) => (p === index ? null : p)), 1800);
    } catch {}
  };

  const canSend = input.trim().length > 0 && !isThinking;
  const sendScale = useSharedValue(0.9);
  useEffect(() => {
    sendScale.value = withSpring(canSend ? 1 : 0.9, { damping: 14, stiffness: 260 });
  }, [canSend]);
  const sendStyle = useAnimatedStyle(() => ({ transform: [{ scale: sendScale.value }] }));

  const mdColors = useMemo(
    () => ({
      ...colors,
      isDark: P.dark,
      text: P.body,
      textSecondary: P.muted,
      textTertiary: P.faint,
      card: P.surface,
      background: P.bg,
      border: P.line,
      accent: P.link,
      inputBackground: P.surface,
    }),
    [colors, P]
  );

  const lastIsAssistant = chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'assistant';

  /* ---------------- Render ---------------- */

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {isFocused && <StatusBar style={P.dark ? 'light' : 'dark'} />}

      {/* Header */}
      <View style={[styles.header, chatHistory.length > 0 && styles.headerDivider]}>
        <Pressable
          style={styles.headerLeft}
          onPress={() => useSidebarStore.getState().openSidebar()}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <TreeCoin size={34} ring={P.line} />
          <View>
            <Text style={[styles.brandName, { fontFamily: display, fontWeight: display ? undefined : '800' }]}>
              Regent
            </Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Knows your accounts</Text>
            </View>
          </View>
        </Pressable>
        <Pressable
          onPress={newChat}
          style={[styles.iconBtn, chatHistory.length === 0 && { opacity: 0.4 }]}
          disabled={chatHistory.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Start a new chat"
        >
          <Feather name="edit-3" size={18} color={P.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {chatHistory.length === 0 ? (
          /* ---------------- Start state ---------------- */
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
          >
            <Animated.View entering={FadeIn.duration(500)} style={styles.hero}>
              <Orb P={P} />
              <Text style={[styles.greeting, { fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                {greeting}
              </Text>
              <Text style={styles.subGreeting}>Ask anything about your money.</Text>
            </Animated.View>

            {/* Free space */}
            <View style={{ flex: 1, minHeight: 24 }} />

            <Animated.View entering={FadeInDown.delay(200).duration(450)} style={{ paddingBottom: 8 }}>
              <SwipeDeck P={P} cards={cards} topic={topicLabel} onAsk={(q) => send(q)} onNextTopic={nextTopic} />
            </Animated.View>
          </ScrollView>
        ) : (
          /* ---------------- Conversation ---------------- */
          <FlatList
            ref={listRef}
            data={chatHistory}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.chatList}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={Keyboard.dismiss}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => {
              const isUser = item.role === 'user';
              const entering = index >= initialCountRef.current ? FadeInDown.duration(380) : undefined;
              const textContent = typeof item.content === 'string'
                ? item.content
                : typeof item.content === 'object' && item.content != null
                  ? ((item.content as any).answer || (item.content as any).message || (item.content as any).text || JSON.stringify(item.content))
                  : String(item.content || '');
              const timeStr = formatMessageTime(item.timestamp);
              const isBeingEdited = editingIndex === index;

              if (isUser) {
                return (
                  <Animated.View entering={entering} style={styles.userBubbleWrap}>
                    <Pressable
                      onLongPress={() => startEdit(index, textContent)}
                      delayLongPress={280}
                      style={[
                        styles.userBubble,
                        isBeingEdited && styles.userBubbleEditing,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Your message: ${textContent}`}
                      accessibilityHint="Long press to edit"
                    >
                      <Text style={styles.userText}>{textContent}</Text>
                    </Pressable>
                    <View style={styles.userMetaRow}>
                      {timeStr ? (
                        <Text style={styles.userTimeText}>
                          {timeStr}
                          {item.isEdited ? ' • edited' : ''}
                        </Text>
                      ) : null}
                      <Pressable
                        onPress={() => startEdit(index, textContent)}
                        style={styles.iconActionBtn}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Edit message"
                      >
                        <Feather name="edit-2" size={13} color={isBeingEdited ? P.link : P.muted} />
                      </Pressable>
                      <Pressable
                        onPress={() => copy(textContent, index)}
                        style={styles.iconActionBtn}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Copy message"
                      >
                        <Feather
                          name={copiedIndex === index ? 'check' : 'copy'}
                          size={13}
                          color={copiedIndex === index ? P.link : P.muted}
                        />
                      </Pressable>
                    </View>
                  </Animated.View>
                );
              }

              return (
                <Animated.View entering={entering} style={styles.assistantRow}>
                  <TreeCoin size={28} ring={P.line} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={isBeingEdited ? styles.assistantBubbleEditing : undefined}>
                      <FormattedChatMessage content={textContent} isUser={false} colors={mdColors} isDark={P.dark} />
                    </View>
                    <View style={styles.assistantMetaRow}>
                      {timeStr ? (
                        <Text style={styles.assistantTimeText}>
                          {timeStr}
                          {item.isEdited ? ' • edited' : ''}
                        </Text>
                      ) : null}
                      <Pressable
                        onPress={() => startEdit(index, textContent)}
                        style={styles.iconActionBtn}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Edit answer"
                      >
                        <Feather name="edit-2" size={13} color={isBeingEdited ? P.link : P.muted} />
                      </Pressable>
                      <Pressable
                        onPress={() => copy(textContent, index)}
                        style={styles.iconActionBtn}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Copy answer"
                      >
                        <Feather
                          name={copiedIndex === index ? 'check' : 'copy'}
                          size={13}
                          color={copiedIndex === index ? P.link : P.muted}
                        />
                      </Pressable>
                    </View>
                  </View>
                </Animated.View>
              );
            }}
            ListFooterComponent={
              <View style={{ gap: 8 }}>
                {isThinking && <ThinkingIndicator P={P} />}
                {!isThinking &&
                  lastIsAssistant &&
                  followUps.map((c: any, i: number) => (
                    <SuggestionBubble
                      key={c.query}
                      P={P}
                      label={sentenceCase(c.title)}
                      onPress={() => send(c.query)}
                      delay={250 + i * 90}
                    />
                  ))}
              </View>
            }
          />
        )}

        {/* Composer */}
        <View style={[styles.composerWrap, { paddingBottom: bottomPad }]}>
          {editingIndex !== null && (
            <Animated.View entering={FadeInDown.duration(200)} style={styles.editingBanner}>
              <View style={styles.editingBannerLeft}>
                <View style={styles.editingIconBadge}>
                  <Feather name="edit-2" size={12} color={P.sendFg} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.editingBannerTitle} numberOfLines={1}>
                    {chatHistory[editingIndex]?.role === 'assistant'
                      ? "Editing Regent's response"
                      : 'Editing message'}
                  </Text>
                  <Text style={styles.editingBannerSub} numberOfLines={1}>
                    {chatHistory[editingIndex]?.role === 'assistant'
                      ? 'Tap Save to update text in place'
                      : 'Tap Save to update, or Send to re-ask'}
                  </Text>
                </View>
              </View>
              <View style={styles.editingBannerRight}>
                <Pressable
                  onPress={saveInPlace}
                  disabled={!input.trim()}
                  style={[styles.saveInPlaceBtn, !input.trim() && { opacity: 0.5 }]}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Save message"
                >
                  <Feather name="check" size={12} color={P.sendFg} />
                  <Text style={styles.saveInPlaceText}>Save</Text>
                </Pressable>
                <Pressable
                  onPress={cancelEdit}
                  style={styles.cancelEditBtn}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing"
                >
                  <Feather name="x" size={14} color={P.muted} />
                </Pressable>
              </View>
            </Animated.View>
          )}

          <View
            style={[
              styles.composer,
              input.length > 0 && { borderColor: P.lineStrong },
              editingIndex !== null && { borderColor: P.dot, borderWidth: 1.5 },
            ]}
          >
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              placeholder={editingIndex !== null ? 'Edit message...' : 'Ask Regent anything'}
              placeholderTextColor={P.faint}
              style={styles.input}
              editable={!isThinking}
              returnKeyType="send"
              onSubmitEditing={() => send()}
              selectionColor={P.dot}
              accessibilityLabel="Ask Regent"
            />
            <Animated.View style={sendStyle}>
              <Pressable
                onPress={() => send()}
                disabled={!canSend}
                style={[styles.sendBtn, canSend && styles.sendBtnActive]}
                accessibilityRole="button"
                accessibilityLabel={editingIndex !== null ? 'Save and re-ask' : 'Send'}
              >
                <Feather name="arrow-up" size={19} color={canSend ? P.sendFg : P.idleFg} />
              </Pressable>
            </Animated.View>
          </View>
          <Text style={styles.disclaimer}>Regent can make mistakes. Check important numbers.</Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const makeStyles = (P: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: P.bg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 12,
    },
    headerDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: P.line },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    brandName: { color: P.text, fontSize: 20, letterSpacing: -0.4 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: P.dot },
    statusText: { color: P.muted, fontSize: 12 },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: P.line,
      backgroundColor: P.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },

    hero: { alignItems: 'center', paddingTop: 28 },
    greeting: {
      color: P.text,
      fontSize: 24,
      lineHeight: 28,
      letterSpacing: -0.7,
      textAlign: 'center',
      paddingHorizontal: 48,
      marginTop: 14,
    },
    subGreeting: { color: P.muted, fontSize: 14, marginTop: 8 },

    tryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 8,
      paddingHorizontal: 20,
      paddingBottom: 10,
    },
    tryLabel: { color: P.muted, fontSize: 12, fontWeight: '600' },
    shuffleBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: P.line,
      backgroundColor: P.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    suggestions: { gap: 8, paddingLeft: 72, paddingRight: 16, paddingBottom: 8 },

    chatList: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12, gap: 20 },
    userBubbleWrap: {
      alignSelf: 'flex-end',
      maxWidth: '82%',
      alignItems: 'flex-end',
    },
    userBubble: {
      backgroundColor: P.userBg,
      borderRadius: 22,
      borderBottomRightRadius: 6,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    userBubbleEditing: {
      borderWidth: 1.5,
      borderColor: P.dot,
    },
    userText: { color: P.userFg, fontSize: 15, lineHeight: 21, fontWeight: '500' },
    userMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 4,
      marginRight: 4,
    },
    userTimeText: { color: P.faint, fontSize: 11, fontWeight: '500' },
    iconActionBtn: {
      padding: 3,
      alignItems: 'center',
      justifyContent: 'center',
    },

    assistantRow: { flexDirection: 'row', gap: 10, maxWidth: '92%' },
    assistantBubbleEditing: {
      borderWidth: 1.5,
      borderColor: P.dot,
      borderRadius: 16,
      padding: 8,
    },
    assistantMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 4,
    },
    assistantTimeText: { color: P.faint, fontSize: 11, fontWeight: '500' },

    editingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      backgroundColor: P.surface,
      borderWidth: 1,
      borderColor: P.lineStrong,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 8,
    },
    editingBannerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      minWidth: 0,
    },
    editingIconBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: P.sendBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editingBannerTitle: {
      color: P.text,
      fontSize: 13,
      fontWeight: '700',
    },
    editingBannerSub: {
      color: P.faint,
      fontSize: 11,
    },
    editingBannerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    saveInPlaceBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: P.sendBg,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    saveInPlaceText: {
      color: P.sendFg,
      fontSize: 12,
      fontWeight: '700',
    },
    cancelEditBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: P.line,
      backgroundColor: P.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },

    composerWrap: { paddingHorizontal: 16, paddingTop: 8, backgroundColor: P.bg },
    composer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: P.surface,
      borderWidth: 1,
      borderColor: P.line,
      borderRadius: 28,
      paddingLeft: 18,
      paddingRight: 6,
      paddingVertical: 6,
    },
    input: {
      flex: 1,
      color: P.text,
      fontSize: 15,
      minHeight: 44,
      paddingVertical: 0,
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: P.idleBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnActive: { backgroundColor: P.sendBg },
    disclaimer: { color: P.faint, fontSize: 11, textAlign: 'center', marginTop: 8 },
  });