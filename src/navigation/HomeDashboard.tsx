import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  RefreshControl,
  Platform,
  useWindowDimensions,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StyleProp,
  ViewStyle,
  NativeModules,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
  FadeInDown,
} from 'react-native-reanimated';
import Svg, { Path, Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from '@expo-google-fonts/figtree';
import { useTheme } from '../store';
import { isExcludedFromBudget } from '../services/budgetService';
import { CategoryIcon } from '../components/CategoryIcon';
import { getCategory } from '../constants/categories';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface DashboardCategory {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface DashboardTx {
  id: string;
  merchant?: string;
  amount: number | string;
  type?: string;
  category?: string;
  timestamp: number | string;
  [key: string]: any;
}

export interface HomeDashboardProps {
  userName?: string;
  unreadCount: number;
  netWorth: number;
  netWorthHistory: number[];
  previousNetWorth?: number | null;
  previousMonthLabel?: string;
  income: number;
  spent: number;
  transactions: DashboardTx[];
  categories: DashboardCategory[];
  hasBanks: boolean;
  smsTrackingOn: boolean;
  refreshing: boolean;
  bottomInset: number;
  onRefresh: () => void;
  onOpenMenu: () => void;
  onOpenNotifications: () => void;
  onOpenNetWorth: () => void;
  onAddBank: () => void;
  onAddExpense: () => void;
  onOpenCalendar: () => void;
  onOpenBudgets: () => void;
  onOpenGoals: () => void;
  onOpenRegent: () => void;
  onSetupTracking: () => void;
  onOpenTransaction?: (tx: DashboardTx) => void;
}

/* ------------------------------------------------------------------ */
/* Brand tokens                                                        */
/* ------------------------------------------------------------------ */

const FOREST = '#0B3D2C';
const FOREST_RAISED = '#124B37';
const LIME = '#B8F36B';
const MIST = '#B5CEC1';
const CORAL = '#FF8A6B';
const AMBER = '#FFB020';
const GREEN = '#16A34A';

const BANNER_THEMES = {
  amber: { bg: '#FFB020', fg: '#2B1700', ctaBg: '#2B1700', ctaFg: '#FFFFFF', ring: '#FFD27A', ring2: '#FFC24D' },
  lilac: { bg: '#C9B8FF', fg: '#1C0F4A', ctaBg: '#1C0F4A', ctaFg: '#FFFFFF', ring: '#DCD0FF', ring2: '#B9A5FF' },
  lime: { bg: '#B8F36B', fg: '#0B3D2C', ctaBg: '#0B3D2C', ctaFg: '#FFFFFF', ring: '#D3F8A3', ring2: '#A4E752' },
  coral: { bg: '#FF8A6B', fg: '#3A0D00', ctaBg: '#3A0D00', ctaFg: '#FFFFFF', ring: '#FFB29E', ring2: '#FF7552' },
} as const;

type BannerTheme = keyof typeof BANNER_THEMES;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const toNumber = (v: number | string | undefined) => {
  const n = typeof v === 'string' ? parseFloat(v) : v ?? 0;
  return isNaN(n as number) ? 0 : Math.abs(n as number);
};

const formatINR = (value: number, decimals = 0) =>
  `₹${Math.abs(value).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;

const hexToRgba = (hex: string, alpha: number) => {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const greetingForNow = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const CATEGORY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  food: 'coffee',
  dining: 'coffee',
  restaurant: 'coffee',
  groceries: 'shopping-cart',
  grocery: 'shopping-cart',
  shopping: 'shopping-bag',
  rent: 'home',
  housing: 'home',
  travel: 'navigation',
  transport: 'navigation',
  fuel: 'droplet',
  bills: 'zap',
  utilities: 'zap',
  recharge: 'smartphone',
  entertainment: 'film',
  medical: 'heart',
  health: 'heart',
  education: 'book-open',
  investments: 'trending-up',
  self_transfer: 'repeat',
  miscellaneous: 'grid',
  misc: 'grid',
  other: 'grid',
  others: 'grid',
};

const iconForCategory = (key?: string): keyof typeof Feather.glyphMap =>
  CATEGORY_ICONS[(key || '').toLowerCase().trim()] || 'tag';

const relativeDay = (ts: number) => {
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** Smooth count-up for headline numbers. */
const useCountUp = (target: number, duration = 800) => {
  const [value, setValue] = useState(target);
  const currentRef = useRef(target);
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      currentRef.current = target;
      setValue(target);
      return;
    }
    const from = currentRef.current;
    if (from === target) return;
    const start = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    let raf = 0;
    const tick = (nowTime?: number) => {
      const now = nowTime || (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (target - from) * eased;
      currentRef.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
};

/* ------------------------------------------------------------------ */
/* Small animated building blocks                                      */
/* ------------------------------------------------------------------ */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PressableScale: React.FC<{
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  accessibilityLabel?: string;
  disabled?: boolean;
}> = ({ onPress, style, children, accessibilityLabel, disabled }) => {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled || !onPress}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 15, stiffness: 320 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 320 });
      }}
      accessibilityRole={Platform.OS === 'web' ? undefined : (onPress ? 'button' : undefined)}
      accessibilityLabel={accessibilityLabel}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
};

const GrowBar: React.FC<{ height: number; color: string; delay: number }> = ({ height, color, delay }) => {
  const h = useSharedValue(0);

  useEffect(() => {
    h.value = withDelay(delay, withTiming(height, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [height, delay]);

  const animated = useAnimatedStyle(() => ({ height: h.value }));

  return (
    <Animated.View
      style={[
        {
          width: '100%',
          backgroundColor: color,
          borderTopLeftRadius: 5,
          borderTopRightRadius: 5,
          borderBottomLeftRadius: 2,
          borderBottomRightRadius: 2,
        },
        animated,
      ]}
    />
  );
};

const RevealBar: React.FC<{ segments: DashboardCategory[]; total: number; trackColor: string }> = ({
  segments,
  total,
  trackColor,
}) => {
  const [fullWidth, setFullWidth] = useState(0);
  const w = useSharedValue(0);

  useEffect(() => {
    if (fullWidth > 0) {
      w.value = 0;
      w.value = withDelay(200, withTiming(fullWidth, { duration: 700, easing: Easing.out(Easing.cubic) }));
    }
  }, [fullWidth, total]);

  const animated = useAnimatedStyle(() => ({ width: w.value }));

  return (
    <View
      style={{ height: 14, borderRadius: 7, backgroundColor: trackColor, overflow: 'hidden' }}
      onLayout={(e) => setFullWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View style={[{ height: 14, overflow: 'hidden' }, animated]}>
        <View style={{ flexDirection: 'row', width: fullWidth, height: 14, gap: 2 }}>
          {segments.map((s) => (
            <View
              key={s.key}
              style={{ width: total > 0 ? (s.value / total) * fullWidth : 0, backgroundColor: s.color }}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
};

/** Smooth sparkline path through points. */
const buildSparkPath = (values: number[], width: number, height: number, pad = 8) => {
  if (values.length < 2 || width <= 0) return { d: '', lastX: 0, lastY: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * (width - pad * 2) + pad,
    y: height - pad - ((v - min) / range) * (height - pad * 2),
  }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const midX = (prev.x + cur.x) / 2;
    d += ` C ${midX} ${prev.y}, ${midX} ${cur.y}, ${cur.x} ${cur.y}`;
  }
  const last = pts[pts.length - 1];
  return { d, lastX: last.x, lastY: last.y };
};

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

type ChartMode = 'week' | 'month';

interface DayPoint {
  date: Date;
  total: number;
  topMerchant?: string;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = (props) => {
  const {
    userName,
    unreadCount,
    netWorth,
    netWorthHistory,
    previousNetWorth,
    previousMonthLabel,
    income,
    spent,
    transactions,
    categories,
    hasBanks,
    smsTrackingOn,
    refreshing,
    bottomInset,
  } = props;

  const { colors, isDark } = useTheme();
  const { width: screenWidth } = useWindowDimensions();

  const [fontsLoaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });

  const font = useMemo(
    () => ({
      display: fontsLoaded ? 'BricolageGrotesque_800ExtraBold' : undefined,
      displayBold: fontsLoaded ? 'BricolageGrotesque_700Bold' : undefined,
      body: fontsLoaded ? 'Figtree_500Medium' : undefined,
      bodySemi: fontsLoaded ? 'Figtree_600SemiBold' : undefined,
      bodyBold: fontsLoaded ? 'Figtree_700Bold' : undefined,
    }),
    [fontsLoaded]
  );

  const styles = useMemo(() => getStyles(colors, isDark, font), [colors, isDark, font]);

  const scrollRef = useRef<ScrollView>(null);
  const breakdownY = useRef(0);

  const [hidden, setHidden] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>('month');
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [heroWidth, setHeroWidth] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'android') {
      NativeModules?.NativeStorage?.notifyAppReady?.();
    }
  }, []);

  /* ---------------- Headline numbers ---------------- */

  const animatedNetWorth = useCountUp(netWorth);
  const animatedIncome = useCountUp(income, 800);
  const animatedSpent = useCountUp(spent, 800);

  const abs = Math.abs(animatedNetWorth);
  const netWorthWhole = Math.floor(abs).toLocaleString('en-IN');
  const netWorthPaise = (abs % 1).toFixed(2).slice(1);

  const delta = useMemo(() => {
    if (!previousNetWorth || previousNetWorth <= 0) return null;
    const pct = ((netWorth - previousNetWorth) / previousNetWorth) * 100;
    return { pct, up: pct >= 0 };
  }, [netWorth, previousNetWorth]);

  const spark = useMemo(
    () => buildSparkPath(netWorthHistory, heroWidth, 64),
    [netWorthHistory, heroWidth]
  );

  /* ---------------- Daily spending series ---------------- */

  const series: DayPoint[] = useMemo(() => {
    const now = new Date();
    const days: DayPoint[] = [];
    if (chartMode === 'month') {
      for (let d = 1; d <= now.getDate(); d++) {
        days.push({ date: new Date(now.getFullYear(), now.getMonth(), d), total: 0 });
      }
    } else {
      for (let i = 6; i >= 0; i--) {
        days.push({ date: new Date(now.getFullYear(), now.getMonth(), now.getDate() - i), total: 0 });
      }
    }

    const index = new Map<string, { point: DayPoint; merchants: Record<string, number> }>();
    days.forEach((p) => index.set(p.date.toDateString(), { point: p, merchants: {} }));

    transactions.forEach((tx) => {
      if (tx.type === 'credit' || isExcludedFromBudget(tx as any)) return;
      const key = new Date(Number(tx.timestamp)).toDateString();
      const slot = index.get(key);
      if (!slot) return;
      const amt = toNumber(tx.amount);
      slot.point.total += amt;
      const m = tx.merchant || 'Other';
      slot.merchants[m] = (slot.merchants[m] || 0) + amt;
    });

    index.forEach(({ point, merchants }) => {
      const top = Object.entries(merchants).sort((a, b) => b[1] - a[1])[0];
      point.topMerchant = top?.[0];
    });

    return days;
  }, [transactions, chartMode]);

  const seriesMax = useMemo(() => Math.max(...series.map((p) => p.total), 0), [series]);
  const seriesTotal = useMemo(() => series.reduce((s, p) => s + p.total, 0), [series]);
  const seriesAvg = series.length > 0 ? seriesTotal / series.length : 0;
  const peakIndex = useMemo(() => {
    if (seriesMax <= 0) return -1;
    return series.findIndex((p) => p.total === seriesMax);
  }, [series, seriesMax]);

  useEffect(() => {
    setSelectedBar(null);
  }, [chartMode]);

  const activeBar = selectedBar ?? (peakIndex >= 0 ? peakIndex : series.length - 1);
  const activePoint = series[activeBar];

  const CHART_HEIGHT = 128;
  const barHeight = (v: number) => {
    if (seriesMax <= 0) return 3;
    if (v <= 0) return 3;
    return Math.max(6, (v / seriesMax) * (CHART_HEIGHT - 8));
  };

  const tooltipWidth = 150;
  const tooltipLeft = useMemo(() => {
    if (!chartWidth || series.length === 0) return 0;
    const center = ((activeBar + 0.5) / series.length) * chartWidth;
    return Math.min(Math.max(center - tooltipWidth / 2, 0), chartWidth - tooltipWidth);
  }, [chartWidth, activeBar, series.length]);

  /* ---------------- Categories ---------------- */

  const categoryTotal = useMemo(() => categories.reduce((s, c) => s + c.value, 0), [categories]);
  const tileCategories = categories.slice(0, 4);
  const extraCategories = categories.slice(4);

  /* ---------------- Recent ---------------- */

  const recent = useMemo(() => {
    const topKeys = new Set(categories.filter((c) => c.key !== 'others').map((c) => c.key));
    return transactions
      .filter((tx) => {
        if (!categoryFilter) return true;
        const key = (tx.category || 'other').toLowerCase().trim();
        if (categoryFilter === 'others') return !topKeys.has(key) && tx.type !== 'credit';
        return key === categoryFilter;
      })
      .slice(0, 5);
  }, [transactions, categoryFilter, categories]);

  const filterLabel = categoryFilter ? categories.find((c) => c.key === categoryFilter)?.label : null;

  /* ---------------- Banners ---------------- */

  const banners = useMemo(() => {
    const list: {
      key: string;
      theme: BannerTheme;
      title: string;
      cta: string;
      onPress: () => void;
      decorated?: boolean;
    }[] = [];

    if (!hasBanks) {
      list.push({
        key: 'bank',
        theme: 'amber',
        title: 'Link your first bank account to see your real balance',
        cta: 'Add bank',
        onPress: props.onAddBank,
        decorated: true,
      });
    }

    if (income > 0 && spent > income) {
      list.push({
        key: 'ratio',
        theme: hasBanks ? 'amber' : 'coral',
        title: `You spent ₹${(spent / income).toFixed(2)} for every ₹1 you earned`,
        cta: 'See where it went',
        onPress: () => scrollRef.current?.scrollTo({ y: Math.max(breakdownY.current - 12, 0), animated: true }),
        decorated: hasBanks,
      });
    } else if (income > 0) {
      const keptPct = Math.round(((income - spent) / income) * 100);
      list.push({
        key: 'kept',
        theme: 'lime',
        title: `You kept ${keptPct}% of what you earned this month`,
        cta: 'See breakdown',
        onPress: () => scrollRef.current?.scrollTo({ y: Math.max(breakdownY.current - 12, 0), animated: true }),
        decorated: true,
      });
    }

    if (Platform.OS === 'android' && !smsTrackingOn) {
      list.push({
        key: 'sms',
        theme: 'lilac',
        title: 'Track every rupee without typing',
        cta: 'Turn on auto-tracking',
        onPress: props.onSetupTracking,
      });
    }

    list.push({
      key: 'regent',
      theme: list.length % 2 === 0 ? 'lime' : 'lilac',
      title: 'Ask Regent where your money went this month',
      cta: 'Ask Regent',
      onPress: props.onOpenRegent,
    });

    return list;
  }, [hasBanks, income, spent, smsTrackingOn, props.onAddBank, props.onSetupTracking, props.onOpenRegent]);

  const [carouselWidth, setCarouselWidth] = useState(0);
  const bannerWidth = (carouselWidth || screenWidth) - 32 - 36;
  const bannerStep = bannerWidth + 12;
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerScrollRef = useRef<ScrollView>(null);
  const userDragging = useRef(false);

  useEffect(() => {
    if (banners.length < 2) return;
    const timer = setInterval(() => {
      if (userDragging.current) return;
      setBannerIndex((prev) => {
        const next = (prev + 1) % banners.length;
        bannerScrollRef.current?.scrollTo({ x: next * bannerStep, animated: true });
        return next;
      });
    }, 4500);
    return () => clearInterval(timer);
  }, [banners.length, bannerStep]);

  const onBannerScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / bannerStep);
    setBannerIndex(Math.min(Math.max(idx, 0), banners.length - 1));
    userDragging.current = false;
  };

  /* ---------------- Render ---------------- */

  const money = (v: number, decimals = 0) => (hidden ? '₹ •••••' : formatINR(v, decimals));
  const firstName = (userName || '').trim().split(' ')[0];

  const tileBg = (color: string) => hexToRgba(color, isDark ? 0.16 : 0.12);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={{ paddingBottom: bottomInset + 110 }}
      showsVerticalScrollIndicator={false}
      onLayout={() => {
        if (Platform.OS === 'android') {
          NativeModules?.NativeStorage?.notifyAppReady?.();
        }
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={props.onRefresh} tintColor={GREEN} colors={[GREEN]} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerLeft}
          onPress={props.onOpenMenu}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <View style={styles.logo}>
            <Image source={require('../../assets/insideicon.png')} style={styles.logoImage} resizeMode="cover" />
          </View>
          <View>
            <Text style={styles.greeting}>{greetingForNow()}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {firstName || 'Welcome back'}
            </Text>
          </View>
        </Pressable>
        <Pressable
          style={styles.bellBtn}
          onPress={props.onOpenNotifications}
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        >
          <Feather name="bell" size={20} color={colors.text} />
          {unreadCount > 0 && <View style={styles.bellDot} />}
        </Pressable>
      </View>

      {/* Hero net worth card */}
      <Animated.View entering={FadeInDown.duration(450)}>
        <PressableScale onPress={props.onOpenNetWorth} style={styles.hero} accessibilityLabel="Open net worth details">
          <View onLayout={(e: LayoutChangeEvent) => setHeroWidth(e.nativeEvent.layout.width)}>
            <View style={[styles.heroRing, { width: 240, height: 240, borderRadius: 120, right: -90, top: -110 }]} />
            <View style={[styles.heroRing, { width: 150, height: 150, borderRadius: 75, right: -45, top: -65, borderColor: 'rgba(184, 243, 107, 0.22)' }]} />

            <View style={styles.heroTopRow}>
              <Text style={styles.heroLabel}>Net worth</Text>
              <Pressable
                onPress={(e) => {
                  e?.stopPropagation?.();
                  setHidden((h) => !h);
                }}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={hidden ? 'Show balances' : 'Hide balances'}
              >
                <Feather name={hidden ? 'eye-off' : 'eye'} size={18} color={MIST} />
              </Pressable>
            </View>

            <View style={styles.heroAmountRow}>
              {hidden ? (
                <Text style={styles.heroAmount}>₹ •••••</Text>
              ) : (
                <>
                  <Text style={styles.heroAmount}>₹{netWorthWhole}</Text>
                  <Text style={styles.heroPaise}>{netWorthPaise}</Text>
                </>
              )}
            </View>

            {delta && (
              <View style={[styles.deltaPill, !delta.up && { backgroundColor: CORAL }]}>
                <Feather
                  name={delta.up ? 'arrow-up-right' : 'arrow-down-right'}
                  size={13}
                  color={delta.up ? FOREST : '#3A0D00'}
                />
                <Text style={[styles.deltaText, !delta.up && { color: '#3A0D00' }]}>
                  {Math.abs(delta.pct).toFixed(1)}% since {previousMonthLabel || 'last month'}
                </Text>
              </View>
            )}

            {spark.d ? (
              <Svg width="100%" height={64} style={{ marginTop: 10 }}>
                <Path d={spark.d} stroke={LIME} strokeWidth={2.5} fill="none" strokeLinecap="round" />
                <Circle cx={spark.lastX} cy={spark.lastY} r={10} stroke={LIME} strokeOpacity={0.35} strokeWidth={2} fill="none" />
                <Circle cx={spark.lastX} cy={spark.lastY} r={5} fill={LIME} />
              </Svg>
            ) : (
              <View style={{ height: 18 }} />
            )}

            <View style={styles.flowRow}>
              <View style={styles.flowTile}>
                <View style={styles.flowLabelRow}>
                  <View style={[styles.flowIcon, { backgroundColor: LIME }]}>
                    <Feather name="arrow-down-left" size={12} color={FOREST} />
                  </View>
                  <Text style={styles.flowLabel}>Money in</Text>
                </View>
                <Text style={styles.flowValue}>{money(animatedIncome)}</Text>
              </View>
              <View style={styles.flowTile}>
                <View style={styles.flowLabelRow}>
                  <View style={[styles.flowIcon, { backgroundColor: CORAL }]}>
                    <Feather name="arrow-up-right" size={12} color="#3A0D00" />
                  </View>
                  <Text style={styles.flowLabel}>Money out</Text>
                </View>
                <Text style={styles.flowValue}>{money(animatedSpent)}</Text>
              </View>
            </View>
          </View>
        </PressableScale>
      </Animated.View>

      {/* Banner carousel */}
      <Animated.View
        entering={FadeInDown.delay(90).duration(450)}
        onLayout={(e: LayoutChangeEvent) => setCarouselWidth(e.nativeEvent.layout.width)}
      >
        <ScrollView
          ref={bannerScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={bannerStep}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingTop: 20 }}
          onScrollBeginDrag={() => {
            userDragging.current = true;
          }}
          onMomentumScrollEnd={onBannerScrollEnd}
        >
          {banners.map((b) => {
            const t = BANNER_THEMES[b.theme];
            return (
              <PressableScale
                key={b.key}
                onPress={b.onPress}
                style={[styles.banner, { width: bannerWidth, backgroundColor: t.bg }]}
                accessibilityLabel={b.title}
              >
                {b.decorated && (
                  <>
                    <View style={[styles.coin, { right: -18, bottom: -22, backgroundColor: t.ring, borderColor: t.fg }]} />
                    <View style={[styles.coin, { right: 30, bottom: -42, backgroundColor: t.ring2, borderColor: t.fg }]} />
                    <Text style={[styles.coinSymbol, { color: t.fg }]}>₹</Text>
                  </>
                )}
                <Text style={[styles.bannerTitle, { color: t.fg }]} numberOfLines={3}>
                  {b.title}
                </Text>
                <View style={[styles.bannerCta, { backgroundColor: t.ctaBg }]}>
                  <Text style={[styles.bannerCtaText, { color: t.ctaFg }]}>{b.cta}</Text>
                  <Feather name="chevron-right" size={13} color={t.ctaFg} />
                </View>
              </PressableScale>
            );
          })}
        </ScrollView>
        {banners.length > 1 && (
          <View style={styles.dots}>
            {banners.map((b, i) => (
              <View
                key={b.key}
                style={[styles.dot, i === bannerIndex && styles.dotActive]}
              />
            ))}
          </View>
        )}
      </Animated.View>

      {/* Quick actions */}
      <Animated.View entering={FadeInDown.delay(160).duration(450)} style={styles.quickRow}>
        {[
          { label: 'Add expense', icon: 'plus' as const, onPress: props.onAddExpense, bg: FOREST, fg: LIME },
          { label: 'Calendar', icon: 'calendar' as const, onPress: props.onOpenCalendar, bg: isDark ? 'rgba(59, 130, 246, 0.18)' : '#DCEBFF', fg: isDark ? '#93C5FD' : '#1450A3' },
          { label: 'Budgets', icon: 'pie-chart' as const, onPress: props.onOpenBudgets, bg: isDark ? 'rgba(255, 138, 107, 0.18)' : '#FFE3D6', fg: isDark ? '#FFB29E' : '#A63A12' },
          { label: 'Goals', icon: 'target' as const, onPress: props.onOpenGoals, bg: isDark ? 'rgba(139, 124, 246, 0.2)' : '#ECE6FF', fg: isDark ? '#C4B8FF' : '#4B2DB8' },
        ].map((a) => (
          <PressableScale key={a.label} onPress={a.onPress} style={styles.quickItem} accessibilityLabel={a.label}>
            <View style={[styles.quickTile, { backgroundColor: a.bg }]}>
              <Feather name={a.icon} size={22} color={a.fg} />
            </View>
            <Text style={styles.quickLabel} numberOfLines={1}>
              {a.label}
            </Text>
          </PressableScale>
        ))}
      </Animated.View>

      {/* Daily spending histogram */}
      <Animated.View entering={FadeInDown.delay(230).duration(450)} style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.cardTitle}>{chartMode === 'month' ? 'Daily spending' : 'This week'}</Text>
            <Text style={styles.cardSubtitle}>
              {hidden
                ? 'Amounts hidden'
                : `${chartMode === 'month' ? new Date().toLocaleDateString('en-IN', { month: 'long' }) : 'Last 7 days'}, ${formatINR(seriesAvg)} a day on average`}
            </Text>
          </View>
          <View style={styles.segment}>
            {(['week', 'month'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setChartMode(m)}
                style={[styles.segmentBtn, chartMode === m && styles.segmentBtnActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: chartMode === m }}
              >
                <Text style={[styles.segmentText, chartMode === m && styles.segmentTextActive]}>
                  {m === 'week' ? 'Week' : 'Month'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View
          style={{ height: CHART_HEIGHT + 34, marginTop: 14 }}
          onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
        >
          {activePoint && seriesMax > 0 && !hidden && (
            <View style={[styles.tooltip, { left: tooltipLeft, width: tooltipWidth }]}>
              <Text style={styles.tooltipText} numberOfLines={1}>
                {activePoint.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}: {formatINR(activePoint.total)}
              </Text>
              {activePoint.topMerchant ? (
                <Text style={styles.tooltipSub} numberOfLines={1}>
                  Mostly {activePoint.topMerchant}
                </Text>
              ) : null}
            </View>
          )}

          {seriesMax > 0 && (
            <View
              style={[styles.avgLine, { bottom: barHeight(seriesAvg) }]}
              pointerEvents="none"
            >
              <Text style={styles.avgLabel}>avg</Text>
            </View>
          )}

          <View style={[styles.barsRow, { height: CHART_HEIGHT, gap: series.length > 14 ? 3 : 8 }]}>
            {series.map((p, i) => {
              const isToday = i === series.length - 1;
              const isActive = i === activeBar;
              const isPeak = i === peakIndex;
              const color = isActive
                ? isPeak
                  ? AMBER
                  : GREEN
                : isToday
                  ? GREEN
                  : isPeak
                    ? hexToRgba(AMBER, 0.55)
                    : isDark
                      ? 'rgba(45, 186, 78, 0.28)'
                      : '#CFE9D9';
              return (
                <Pressable
                  key={p.date.toDateString()}
                  style={styles.barHit}
                  onPress={() => setSelectedBar(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`${p.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}, ${formatINR(p.total)}`}
                >
                  <GrowBar height={barHeight(p.total)} color={color} delay={i * 18} />
                </Pressable>
              );
            })}
          </View>

          <View style={styles.axisRow}>
            {chartMode === 'month' ? (
              <>
                <Text style={styles.axisText}>1</Text>
                {series.length > 10 && <Text style={styles.axisText}>{Math.ceil(series.length / 2)}</Text>}
                <Text style={[styles.axisText, styles.axisToday]}>Today</Text>
              </>
            ) : (
              series.map((p, i) => (
                <Text
                  key={p.date.toDateString()}
                  style={[styles.axisText, { flex: 1, textAlign: 'center' }, i === series.length - 1 && styles.axisToday]}
                >
                  {p.date.toLocaleDateString('en-IN', { weekday: 'narrow' })}
                </Text>
              ))
            )}
          </View>
        </View>

        {seriesMax === 0 && (
          <Text style={styles.emptyText}>No spending recorded in this period yet.</Text>
        )}
      </Animated.View>

      {/* Where it went */}
      {categories.length > 0 && (
        <Animated.View
          entering={FadeInDown.delay(300).duration(450)}
          style={styles.card}
          onLayout={(e) => {
            breakdownY.current = e.nativeEvent.layout.y;
          }}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Where it went</Text>
            <Pressable onPress={props.onOpenBudgets} hitSlop={10} accessibilityRole="button">
              <Text style={styles.linkText}>Budgets</Text>
            </Pressable>
          </View>

          <View style={{ marginTop: 14 }}>
            <RevealBar
              segments={categories}
              total={categoryTotal}
              trackColor={isDark ? 'rgba(255,255,255,0.06)' : '#EEF3F0'}
            />
          </View>

          <View style={styles.tileGrid}>
            {tileCategories.map((c) => {
              const pct = categoryTotal > 0 ? Math.round((c.value / categoryTotal) * 100) : 0;
              const selected = categoryFilter === c.key;
              return (
                <PressableScale
                  key={c.key}
                  onPress={() => setCategoryFilter(selected ? null : c.key)}
                  style={[
                    styles.tile,
                    { backgroundColor: tileBg(c.color) },
                    selected && { borderColor: c.color, borderWidth: 2 },
                  ]}
                  accessibilityLabel={`${c.label}, ${formatINR(c.value)}, ${pct} percent. Show transactions`}
                >
                  <CategoryIcon category={c.key} size={36} style={{ marginBottom: 10 }} />
                  <Text style={styles.tileLabel} numberOfLines={1}>
                    {c.label}
                  </Text>
                  <View style={styles.tileValueRow}>
                    <Text style={styles.tileValue} numberOfLines={1}>
                      {money(c.value)}
                    </Text>
                    <Text style={styles.tilePct}>{pct}%</Text>
                  </View>
                </PressableScale>
              );
            })}
          </View>

          {extraCategories.length > 0 && (
            <Text style={styles.extraText}>
              Plus {extraCategories.map((c) => `${c.label} ${hidden ? '' : formatINR(c.value)}`.trim()).join(', ')}
            </Text>
          )}
        </Animated.View>
      )}

      {/* Recent */}
      <Animated.View entering={FadeInDown.delay(370).duration(450)} style={[styles.card, { paddingBottom: 6 }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>{filterLabel ? `Recent in ${filterLabel}` : 'Recent'}</Text>
          {filterLabel ? (
            <Pressable onPress={() => setCategoryFilter(null)} hitSlop={10} accessibilityRole="button">
              <Text style={styles.linkText}>Show all</Text>
            </Pressable>
          ) : null}
        </View>

        {recent.length === 0 ? (
          <Text style={[styles.emptyText, { marginBottom: 14 }]}>No transactions yet.</Text>
        ) : (
          recent.map((tx, i) => {
            const isCredit = tx.type === 'credit';
            const catKey = isCredit ? 'money_received' : (tx.category || 'miscellaneous');
            const cat = getCategory(catKey);
            const label = isCredit ? 'Money received' : cat.label;
            const row = (
              <View style={[styles.txRow, i < recent.length - 1 && styles.txDivider]}>
                <CategoryIcon
                  category={catKey}
                  variant="soft"
                  size={42}
                  style={{ marginRight: 12 }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.txName} numberOfLines={1}>
                    {tx.merchant || 'Unknown merchant'}
                  </Text>
                  <Text style={styles.txMeta} numberOfLines={1}>
                    {label}, {relativeDay(Number(tx.timestamp))}
                  </Text>
                </View>
                <Text style={[styles.txAmount, isCredit && { color: isDark ? '#4ADE80' : '#0B7A3E' }]}>
                  {hidden ? '•••' : `${isCredit ? '+' : '−'}${formatINR(toNumber(tx.amount))}`}
                </Text>
              </View>
            );
            return props.onOpenTransaction ? (
              <Pressable key={tx.id} onPress={() => props.onOpenTransaction?.(tx)} accessibilityRole="button">
                {row}
              </Pressable>
            ) : (
              <View key={tx.id}>{row}</View>
            );
          })
        )}
      </Animated.View>
    </ScrollView>
  );
};

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const getStyles = (
  colors: any,
  isDark: boolean,
  font: { display?: string; displayBold?: string; body?: string; bodySemi?: string; bodyBold?: string }
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : '#F3F6F4',
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 12,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      marginRight: 12,
    },
    logo: {
      width: 42,
      height: 42,
      borderRadius: 13,
      overflow: 'hidden',
      backgroundColor: FOREST,
    },
    logoImage: {
      width: '100%',
      height: '100%',
    },
    greeting: {
      fontSize: 13,
      color: colors.textSecondary,
      fontFamily: font.body,
    },
    name: {
      fontSize: 19,
      color: colors.text,
      fontFamily: font.displayBold,
      fontWeight: font.displayBold ? undefined : '700',
      letterSpacing: -0.3,
    },
    bellBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bellDot: {
      position: 'absolute',
      top: 10,
      right: 11,
      width: 9,
      height: 9,
      borderRadius: 5,
      backgroundColor: '#FF5A36',
      borderWidth: 2,
      borderColor: colors.card,
    },

    // Hero
    hero: {
      marginHorizontal: 16,
      marginTop: 4,
      backgroundColor: FOREST,
      borderRadius: 28,
      padding: 22,
      paddingBottom: 18,
      overflow: 'hidden',
    },
    heroRing: {
      position: 'absolute',
      borderWidth: 1,
      borderColor: 'rgba(184, 243, 107, 0.16)',
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    heroLabel: {
      fontSize: 14,
      color: MIST,
      fontFamily: font.bodySemi,
      fontWeight: font.bodySemi ? undefined : '500',
    },
    heroAmountRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginTop: 6,
    },
    heroAmount: {
      fontSize: 44,
      color: '#FFFFFF',
      fontFamily: font.display,
      fontWeight: font.display ? undefined : '800',
      letterSpacing: -1.5,
      fontVariant: ['tabular-nums'],
    },
    heroPaise: {
      fontSize: 24,
      color: MIST,
      fontFamily: font.displayBold,
      fontWeight: font.displayBold ? undefined : '700',
      marginLeft: 2,
    },
    deltaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      marginTop: 12,
      backgroundColor: LIME,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    deltaText: {
      fontSize: 12,
      color: FOREST,
      fontFamily: font.bodyBold,
      fontWeight: font.bodyBold ? undefined : '700',
    },
    flowRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 10,
    },
    flowTile: {
      flex: 1,
      backgroundColor: FOREST_RAISED,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    flowLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    flowIcon: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flowLabel: {
      fontSize: 12,
      color: MIST,
      fontFamily: font.body,
    },
    flowValue: {
      fontSize: 20,
      color: '#FFFFFF',
      marginTop: 6,
      fontFamily: font.displayBold,
      fontWeight: font.displayBold ? undefined : '700',
      fontVariant: ['tabular-nums'],
    },

    // Banners
    banner: {
      height: 150,
      borderRadius: 24,
      padding: 18,
      overflow: 'hidden',
    },
    coin: {
      position: 'absolute',
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 3,
    },
    coinSymbol: {
      position: 'absolute',
      right: 14,
      bottom: 26,
      fontSize: 30,
      fontFamily: font.display,
      fontWeight: font.display ? undefined : '800',
    },
    bannerTitle: {
      fontSize: 20,
      lineHeight: 24,
      maxWidth: '72%',
      letterSpacing: -0.3,
      fontFamily: font.display,
      fontWeight: font.display ? undefined : '800',
    },
    bannerCta: {
      position: 'absolute',
      left: 18,
      bottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    bannerCtaText: {
      fontSize: 12,
      fontFamily: font.bodyBold,
      fontWeight: font.bodyBold ? undefined : '700',
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      paddingTop: 12,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : '#B9C7C0',
    },
    dotActive: {
      width: 18,
      backgroundColor: isDark ? LIME : FOREST,
    },

    // Quick actions
    quickRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 18,
    },
    quickItem: {
      alignItems: 'center',
      gap: 8,
      width: 76,
    },
    quickTile: {
      width: 60,
      height: 60,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickLabel: {
      fontSize: 12,
      color: colors.text,
      fontFamily: font.bodySemi,
      fontWeight: font.bodySemi ? undefined : '600',
    },

    // Cards
    card: {
      marginHorizontal: 16,
      marginTop: 18,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: isDark ? colors.border : '#E1E9E4',
      borderRadius: 24,
      padding: 18,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    cardTitle: {
      fontSize: 18,
      color: colors.text,
      fontFamily: font.displayBold,
      fontWeight: font.displayBold ? undefined : '700',
    },
    cardSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
      fontFamily: font.body,
    },
    linkText: {
      fontSize: 13,
      color: isDark ? LIME : '#0B6B3A',
      fontFamily: font.bodySemi,
      fontWeight: font.bodySemi ? undefined : '600',
    },
    emptyText: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 8,
      fontFamily: font.body,
    },

    // Segmented control
    segment: {
      flexDirection: 'row',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF3F0',
      borderRadius: 999,
      padding: 3,
    },
    segmentBtn: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    segmentBtnActive: {
      backgroundColor: isDark ? LIME : FOREST,
    },
    segmentText: {
      fontSize: 12,
      color: colors.textSecondary,
      fontFamily: font.bodySemi,
      fontWeight: font.bodySemi ? undefined : '600',
    },
    segmentTextActive: {
      color: isDark ? FOREST : '#FFFFFF',
      fontFamily: font.bodyBold,
      fontWeight: font.bodyBold ? undefined : '700',
    },

    // Chart
    tooltip: {
      position: 'absolute',
      top: 0,
      backgroundColor: isDark ? '#EAF2EE' : '#0B1F17',
      borderRadius: 10,
      paddingHorizontal: 9,
      paddingVertical: 5,
      zIndex: 5,
    },
    tooltipText: {
      fontSize: 11,
      color: isDark ? '#0B1F17' : '#FFFFFF',
      fontFamily: font.bodyBold,
      fontWeight: font.bodyBold ? undefined : '700',
    },
    tooltipSub: {
      fontSize: 10,
      color: isDark ? '#3A4A42' : '#B5CEC1',
      marginTop: 1,
      fontFamily: font.body,
    },
    avgLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      marginBottom: 22,
      borderTopWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: isDark ? 'rgba(255,255,255,0.28)' : '#9DB2A7',
      zIndex: 2,
    },
    avgLabel: {
      position: 'absolute',
      right: 0,
      top: -16,
      fontSize: 10,
      color: colors.textSecondary,
      backgroundColor: colors.card,
      paddingLeft: 4,
      fontFamily: font.body,
    },
    barsRow: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 22,
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    barHit: {
      flex: 1,
      height: '100%',
      justifyContent: 'flex-end',
    },
    axisRow: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    axisText: {
      fontSize: 11,
      color: colors.textSecondary,
      fontFamily: font.body,
    },
    axisToday: {
      color: isDark ? LIME : '#0B6B3A',
      fontFamily: font.bodyBold,
      fontWeight: font.bodyBold ? undefined : '700',
    },

    // Category tiles
    tileGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      rowGap: 10,
      marginTop: 14,
    },
    tile: {
      width: '48.5%',
      borderRadius: 18,
      padding: 14,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    tileIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 10,
      fontFamily: font.bodySemi,
      fontWeight: font.bodySemi ? undefined : '600',
    },
    tileValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    tileValue: {
      fontSize: 18,
      color: colors.text,
      flexShrink: 1,
      fontFamily: font.displayBold,
      fontWeight: font.displayBold ? undefined : '700',
    },
    tilePct: {
      fontSize: 12,
      color: colors.textSecondary,
      marginLeft: 6,
      fontFamily: font.bodyBold,
      fontWeight: font.bodyBold ? undefined : '700',
    },
    extraText: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 10,
      fontFamily: font.body,
    },

    // Recent
    txRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
    },
    txDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    txAvatar: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txInitial: {
      fontSize: 16,
      fontFamily: font.bodyBold,
      fontWeight: font.bodyBold ? undefined : '700',
    },
    txName: {
      fontSize: 15,
      color: colors.text,
      fontFamily: font.bodySemi,
      fontWeight: font.bodySemi ? undefined : '600',
    },
    txMeta: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      fontFamily: font.body,
    },
    txAmount: {
      fontSize: 16,
      color: colors.text,
      fontFamily: font.displayBold,
      fontWeight: font.displayBold ? undefined : '700',
      fontVariant: ['tabular-nums'],
    },
  });