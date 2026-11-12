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
} from 'react-native-reanimated';
import Svg, { Path, Circle, Rect, G, Text as SvgText } from 'react-native-svg';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
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
import { useTheme, useSyncStatusStore } from '../store';
import { useIsFocused } from '@react-navigation/native';
import { isExcludedFromBudget } from '../services/budgetService';
import { CategoryIcon } from '../components/CategoryIcon';
import { ActivityFilterChips, ActivityRow } from '../components/ActivityFeed';
import { SpendingPetalCard } from '../components/SpendingPetalCard';
import { ActivityBank, ActivityFilter, ActivityItem, filterActivity } from '../hooks/useActivityFeed';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface DashboardCategory {
  key: string;
  label: string;
  value: number;
  /** Spend in this category over the same elapsed days last month. */
  previousValue?: number;
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
  /** Credits + debits, newest first, for the Recent card. */
  activity: ActivityItem[];
  /** Linked accounts shown as bank-wise filter chips (logo + masked number). */
  banks: ActivityBank[];
  categories: DashboardCategory[];
  /** Total spend over the same elapsed days last month. */
  previousSpentSamePeriod?: number;
  hasBanks: boolean;
  /** True once the cash wallet exists; until then a banner offers to set it up. */
  hasCash?: boolean;
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
  onOpenCash?: () => void;
  onOpenRegent: () => void;
  onSetupTracking: () => void;
  onOpenTransaction?: (tx: DashboardTx) => void;
  onSeeAllTransactions?: () => void;
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
type BannerArtKind = 'bank' | 'overspend' | 'kept' | 'sms' | 'regent' | 'cash';

const BANNER_PALETTE: BannerTheme[] = ['lime', 'lilac', 'amber', 'coral'];

/**
 * Give every banner a colour so that no two neighbours match — including the
 * last→first wrap, since the carousel auto-loops. Each banner's preferred
 * colour is kept when possible; otherwise an unused colour is picked.
 */
function assignBannerThemes(preferred: BannerTheme[]): BannerTheme[] {
  const out: BannerTheme[] = [];
  preferred.forEach((pref, i) => {
    const prev = out[i - 1];
    const wrapsToFirst = i > 0 && i === preferred.length - 1;
    const ok = (t: BannerTheme) => t !== prev && !(wrapsToFirst && t === out[0]);
    const unused = (t: BannerTheme) => !out.includes(t);
    const pick =
      (ok(pref) && unused(pref) && pref) ||
      BANNER_PALETTE.find((t) => ok(t) && unused(t)) ||
      (ok(pref) && pref) ||
      BANNER_PALETTE.find(ok) ||
      pref;
    out.push(pick);
  });
  return out;
}

/** Four-point sparkle centred on (cx, cy). */
const sparkle = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} Z`;

/** Illustration drawn in the banner's own colours, bottom-right corner. */
function BannerArt({ kind, theme }: { kind: BannerArtKind; theme: (typeof BANNER_THEMES)[BannerTheme] }) {
  const { fg, ring, ring2 } = theme;
  const W = '#FFFFFF';
  return (
    <View pointerEvents="none" style={bannerArtStyles.wrap}>
      <View style={[bannerArtStyles.blob, { backgroundColor: ring }]} />
      <View style={[bannerArtStyles.blobSmall, { backgroundColor: ring2 }]} />
      <Svg width={104} height={104} viewBox="0 0 100 100">
        {kind === 'bank' && (
          <G>
            <Path d="M18 42 L52 20 L86 42 Z" fill={fg} />
            <Rect x={20} y={42} width={64} height={6} rx={2} fill={fg} />
            {[26, 41, 56, 71].map((x) => (
              <Rect key={x} x={x} y={51} width={7} height={24} rx={2} fill={W} stroke={fg} strokeWidth={2.5} />
            ))}
            <Rect x={16} y={76} width={72} height={8} rx={3} fill={fg} />
            <Circle cx={52} cy={33} r={4} fill={ring2} />
            <Circle cx={84} cy={22} r={12} fill={ring2} stroke={fg} strokeWidth={2.5} />
            <SvgText x={84} y={27.5} fontSize={15} fontWeight="800" fill={fg} textAnchor="middle">₹</SvgText>
          </G>
        )}
        {kind === 'overspend' && (
          <G>
            <Rect x={14} y={42} width={62} height={44} rx={10} fill={fg} />
            <Rect x={52} y={54} width={28} height={20} rx={6} fill={ring2} stroke={fg} strokeWidth={2.5} />
            <Circle cx={63} cy={64} r={3.5} fill={fg} />
            <Path d="M24 42 L34 30 L58 42" fill="none" stroke={fg} strokeWidth={3} strokeLinejoin="round" />
            <Circle cx={66} cy={24} r={10} fill={W} stroke={fg} strokeWidth={2.5} />
            <SvgText x={66} y={28.5} fontSize={12} fontWeight="800" fill={fg} textAnchor="middle">₹</SvgText>
            <Circle cx={86} cy={12} r={7} fill={W} stroke={fg} strokeWidth={2.5} />
            <Path d="M50 20 l-6 -4 M54 12 l-2 -7 M80 34 l7 3" stroke={fg} strokeWidth={2.5} strokeLinecap="round" />
          </G>
        )}
        {kind === 'kept' && (
          <G>
            <Rect x={16} y={62} width={14} height={22} rx={4} fill={fg} />
            <Rect x={36} y={50} width={14} height={34} rx={4} fill={fg} />
            <Rect x={56} y={38} width={14} height={46} rx={4} fill={W} stroke={fg} strokeWidth={2.5} />
            <Path d="M14 50 L36 34 L50 40 L80 14" fill="none" stroke={fg} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M68 13 L81 13 L81 26" fill="none" stroke={fg} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
            <Path d={sparkle(86, 46, 8)} fill={W} stroke={fg} strokeWidth={2} />
            <Path d={sparkle(22, 26, 5)} fill={fg} />
          </G>
        )}
        {kind === 'sms' && (
          <G>
            <Rect x={24} y={10} width={42} height={78} rx={10} fill={fg} />
            <Rect x={28.5} y={18} width={33} height={60} rx={5} fill={W} />
            <Rect x={33} y={25} width={22} height={9} rx={4.5} fill={ring} />
            <Rect x={33} y={38} width={16} height={9} rx={4.5} fill={ring} />
            <Rect x={40} y={52} width={50} height={24} rx={12} fill={ring2} stroke={fg} strokeWidth={2.5} />
            <Circle cx={53} cy={64} r={7} fill={fg} />
            <Path d="M49.5 64 l2.5 2.5 l4.5 -5" fill="none" stroke={W} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <SvgText x={74} y={69} fontSize={13} fontWeight="800" fill={fg} textAnchor="middle">₹</SvgText>
            <Path d={sparkle(84, 32, 8)} fill={W} stroke={fg} strokeWidth={2} />
          </G>
        )}
        {kind === 'cash' && (
          <G>
            <Rect x={12} y={40} width={62} height={36} rx={7} fill={fg} transform="rotate(-10 43 58)" />
            <Rect x={26} y={30} width={62} height={36} rx={7} fill={W} stroke={fg} strokeWidth={2.5} />
            <Circle cx={57} cy={48} r={10} fill={ring2} stroke={fg} strokeWidth={2.5} />
            <SvgText x={57} y={53} fontSize={13} fontWeight="800" fill={fg} textAnchor="middle">₹</SvgText>
            <Circle cx={34} cy={48} r={2.5} fill={fg} />
            <Circle cx={80} cy={48} r={2.5} fill={fg} />
            <Path d={sparkle(86, 18, 7)} fill={fg} />
          </G>
        )}
        {kind === 'regent' && (
          <G>
            <Rect x={10} y={30} width={62} height={44} rx={16} fill={fg} />
            <Path d="M24 70 L20 86 L40 72 Z" fill={fg} />
            {[28, 41, 54].map((x) => (
              <Circle key={x} cx={x} cy={52} r={4.5} fill={W} />
            ))}
            <Path d={sparkle(80, 24, 14)} fill={ring2} stroke={fg} strokeWidth={2.5} strokeLinejoin="round" />
            <Path d={sparkle(90, 50, 6)} fill={W} stroke={fg} strokeWidth={2} />
            <Path d={sparkle(62, 12, 4)} fill={fg} />
          </G>
        )}
      </Svg>
    </View>
  );
}

const bannerArtStyles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 4,
    bottom: 6,
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blob: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    right: -26,
    bottom: -34,
    opacity: 0.85,
  },
  blobSmall: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    left: -4,
    top: -2,
    opacity: 0.7,
  },
});

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

type CarouselBanner = {
  key: string;
  title: string;
  cta: string;
  art: BannerArtKind;
  theme: BannerTheme;
  onPress?: () => void;
};

/**
 * Auto-advancing banner strip. Keeps its own index and timer, so a slide only redraws
 * this strip (not the whole Home screen), and it pauses while Home is off screen.
 */
const BannerCarousel = React.memo(function BannerCarousel({
  banners,
  styles,
  screenWidth,
}: {
  banners: CarouselBanner[];
  styles: any;
  screenWidth: number;
}) {
  const isFocused = useIsFocused();
  const [carouselWidth, setCarouselWidth] = useState(0);
  const bannerWidth = (carouselWidth || screenWidth) - 32 - 36;
  const bannerStep = bannerWidth + 12;
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerScrollRef = useRef<ScrollView>(null);
  const userDragging = useRef(false);

  useEffect(() => {
    if (!isFocused || banners.length < 2) return;
    const timer = setInterval(() => {
      if (userDragging.current) return;
      setBannerIndex((prev) => {
        const next = (prev + 1) % banners.length;
        bannerScrollRef.current?.scrollTo({ x: next * bannerStep, animated: true });
        return next;
      });
    }, 4500);
    return () => clearInterval(timer);
  }, [isFocused, banners.length, bannerStep]);

  // Keep the index valid if the number of banners changes
  useEffect(() => {
    if (bannerIndex >= banners.length) setBannerIndex(0);
  }, [banners.length]);

  const onBannerScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / bannerStep);
    setBannerIndex(Math.min(Math.max(idx, 0), banners.length - 1));
    userDragging.current = false;
  };

  return (
    <View onLayout={(e: LayoutChangeEvent) => setCarouselWidth(e.nativeEvent.layout.width)}>
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
              <BannerArt kind={b.art} theme={t} />
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
            <View key={b.key} style={[styles.dot, i === bannerIndex && styles.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
});

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
    activity = [],
    banks = [],
    categories,
    hasBanks,
    smsTrackingOn,
    refreshing,
    bottomInset,
  } = props;

  const { colors, isDark } = useTheme();
  const syncStatus = useSyncStatusStore((s) => s.status);
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
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');

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


  /* ---------------- Recent ---------------- */

  const RECENT_LIMIT = 6;
  const bankById = useMemo(() => new Map(banks.map((b) => [b.id, b])), [banks]);
  // A bank chip already names the account, so rows skip the per-row bank badge.
  const isBankFilter = typeof activityFilter !== 'string';
  const recent = useMemo(() => {
    const topKeys = new Set(categories.filter((c) => c.key !== 'others').map((c) => c.key));
    return filterActivity(activity, activityFilter)
      .filter((tx) => {
        if (!categoryFilter) return true;
        if (tx.type === 'credit') return false;
        const key = (tx.category || 'other').toLowerCase().trim();
        if (categoryFilter === 'others') return !topKeys.has(key);
        return key === categoryFilter;
      })
      .slice(0, RECENT_LIMIT);
  }, [activity, activityFilter, categoryFilter, categories]);

  const filterLabel = categoryFilter ? categories.find((c) => c.key === categoryFilter)?.label : null;

  /* ---------------- Banners ---------------- */

  const banners = useMemo(() => {
    const list: {
      key: string;
      prefer: BannerTheme;
      art: BannerArtKind;
      title: string;
      cta: string;
      onPress: () => void;
    }[] = [];

    if (!hasBanks) {
      list.push({
        key: 'bank',
        prefer: 'amber',
        art: 'bank',
        title: 'Link your first bank account to see your real balance',
        cta: 'Add bank',
        onPress: props.onAddBank,
      });
    }

    if (income > 0 && spent > income) {
      list.push({
        key: 'ratio',
        prefer: 'coral',
        art: 'overspend',
        title: `You spent ₹${(spent / income).toFixed(2)} for every ₹1 you earned`,
        cta: 'See where it went',
        onPress: () => scrollRef.current?.scrollTo({ y: Math.max(breakdownY.current - 12, 0), animated: true }),
      });
    } else if (income > 0) {
      const keptPct = Math.round(((income - spent) / income) * 100);
      list.push({
        key: 'kept',
        prefer: 'lime',
        art: 'kept',
        title: `You kept ${keptPct}% of what you earned this month`,
        cta: 'See breakdown',
        onPress: () => scrollRef.current?.scrollTo({ y: Math.max(breakdownY.current - 12, 0), animated: true }),
      });
    }

    if (!props.hasCash && props.onOpenCash) {
      list.push({
        key: 'cash',
        prefer: 'lime',
        art: 'cash',
        title: 'Got cash? Add it to your net worth',
        cta: 'Add cash',
        onPress: props.onOpenCash,
      });
    }

    if (Platform.OS === 'android' && !smsTrackingOn) {
      list.push({
        key: 'sms',
        prefer: 'lilac',
        art: 'sms',
        title: 'Track every rupee without typing',
        cta: 'Turn on auto-tracking',
        onPress: props.onSetupTracking,
      });
    }

    list.push({
      key: 'regent',
      prefer: 'lime',
      art: 'regent',
      title: 'Ask Regent where your money went this month',
      cta: 'Ask Regent',
      onPress: props.onOpenRegent,
    });

    const themes = assignBannerThemes(list.map((b) => b.prefer));
    return list.map((b, i) => ({ ...b, theme: themes[i] }));
  }, [hasBanks, income, spent, smsTrackingOn, props.onAddBank, props.onSetupTracking, props.onOpenRegent, props.hasCash, props.onOpenCash]);


  /* ---------------- Render ---------------- */

  const money = (v: number, decimals = 0) => (hidden ? '₹ •••••' : formatINR(v, decimals));
  const firstName = (userName || '').trim().split(' ')[0];


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
      <Animated.View>
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

      {/* Banner carousel: its own component, so its timer doesn't redraw the whole dashboard */}
      <Animated.View>
        <BannerCarousel banners={banners} styles={styles} screenWidth={screenWidth} />
      </Animated.View>

      {/* Quick actions */}
      <Animated.View style={styles.quickRow}>
        {[
          { label: 'Add expense', icon: 'plus' as const, onPress: props.onAddExpense, bg: FOREST, fg: LIME },
          { label: 'Cash', icon: 'credit-card' as const, onPress: props.onOpenCash ?? props.onOpenGoals, bg: isDark ? 'rgba(184, 243, 107, 0.16)' : '#E3F2E8', fg: isDark ? LIME : FOREST },
          { label: 'Calendar', icon: 'calendar' as const, onPress: props.onOpenCalendar, bg: isDark ? 'rgba(59, 130, 246, 0.18)' : '#DCEBFF', fg: isDark ? '#93C5FD' : '#1450A3' },
          { label: 'Budgets', icon: 'pie-chart' as const, onPress: props.onOpenBudgets, bg: isDark ? 'rgba(255, 138, 107, 0.18)' : '#FFE3D6', fg: isDark ? '#FFB29E' : '#A63A12' },

        ].map((a) => (
          <PressableScale key={a.label} onPress={a.onPress} style={styles.quickItem} accessibilityLabel={a.label}>
            <View style={[styles.quickTile, { backgroundColor: a.bg }]}>
              {a.label === 'Cash' ? (
                <MaterialCommunityIcons name="cash" size={26} color={a.fg} />
              ) : (
                <Feather name={a.icon} size={22} color={a.fg} />
              )}
            </View>
            <Text style={styles.quickLabel} numberOfLines={1}>
              {a.label}
            </Text>
          </PressableScale>
        ))}
      </Animated.View>

      {/* Daily spending histogram */}
      <Animated.View style={styles.card}>
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
          style={[styles.card, styles.petalCard]}
          onLayout={(e) => {
            breakdownY.current = e.nativeEvent.layout.y;
          }}
        >
          <SpendingPetalCard
            categories={categories}
            selectedKey={categoryFilter}
            onSelect={setCategoryFilter}
            onOpenBudgets={props.onOpenBudgets}
            hidden={hidden}
            monthLabel={new Date().toLocaleDateString('en-IN', { month: 'long' })}
            previousMonthShort={new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleDateString('en-IN', { month: 'short' })}
            previousTotal={props.previousSpentSamePeriod}
            font={font}
          />
        </Animated.View>
      )}

      {/* Recent */}
      <Animated.View style={[styles.card, { paddingBottom: 6 }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>{filterLabel ? `Recent in ${filterLabel}` : 'Recent'}</Text>
          {filterLabel ? (
            <Pressable onPress={() => setCategoryFilter(null)} hitSlop={10} accessibilityRole="button">
              <Text style={styles.linkText}>Show all</Text>
            </Pressable>
          ) : props.onSeeAllTransactions && activity.length > 0 ? (
            <Pressable onPress={props.onSeeAllTransactions} hitSlop={10} accessibilityRole="button">
              <Text style={styles.linkText}>See all</Text>
            </Pressable>
          ) : null}
        </View>

        {activity.length > 0 && (
          <View style={{ marginHorizontal: -18 }}>
            <ActivityFilterChips
              value={activityFilter}
              onChange={setActivityFilter}
              banks={banks}
              font={font}
              inset={18}
              style={{ paddingTop: 12, paddingBottom: 4 }}
            />
          </View>
        )}

        {recent.length === 0 ? (
          <Text style={[styles.emptyText, { marginBottom: 14 }]}>
            {syncStatus === 'error' && activity.length === 0 ? 'Unable to connect to server. Pull down to retry.' : activity.length === 0 ? 'No transactions yet.' : 'No transactions match this filter.'}
          </Text>
        ) : (
          recent.map((tx, i) => (
            <ActivityRow
              key={tx.id}
              tx={tx}
              bank={!isBankFilter && tx.bankProfileId ? bankById.get(tx.bankProfileId) : undefined}
              hidden={hidden}
              divider={i < recent.length - 1}
              font={font}
              onPress={props.onOpenTransaction}
            />
          ))
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

    // Where it went (petal chart on the forest card)
    petalCard: {
      backgroundColor: FOREST,
      borderWidth: 0,
      borderRadius: 28,
      overflow: 'hidden',
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
    bannerTitle: {
      fontSize: 20,
      lineHeight: 24,
      maxWidth: '66%',
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