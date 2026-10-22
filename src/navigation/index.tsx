// Application Navigation & Screen Hierarchy (Clean Bundle)
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Platform,
  Keyboard,
  RefreshControl,
  Modal,
  Image,
  Alert,
  Pressable,
  useWindowDimensions,
  StyleProp,
  ViewStyle,
  AppState,
  AppStateStatus,
  PanResponder,
  Animated as RNAnimated,
} from 'react-native';
import { NavigationContainer, useFocusEffect, createNavigationContainerRef, useNavigation } from '@react-navigation/native';
import { createMaterialTopTabNavigator, MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';

import { navigationRef } from './navigationRef';
export { navigationRef };
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Font from 'expo-font';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  FadeIn,
  Easing,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { KeyboardAvoidingView, useKeyboardHandler } from 'react-native-keyboard-controller';
import { CartesianChart, Area, Line } from 'victory-native';
import { Canvas, LinearGradient, vec, Group, Path, Skia } from '@shopify/react-native-skia';

import { mmkvStorage } from '../db/mmkv';
import { useSyncDb } from '../services/useSyncDb';
import { CategoryIcon } from '../components/CategoryIcon';
import { getCategoryColor } from '../constants/categories';
import { GoalsScreen } from './GoalsScreen';
import { RegentChatScreen } from './RegentChatScreen';
import { UpdateModal } from './UpdateModal';
import { AppSplashScreen } from '../components/AppSplashScreen';
import { NotificationPermissionModal } from '../components/NotificationPermissionModal';
import { SmsPermissionModal } from '../components/SmsPermissionModal';
import { TermsAndConditionsModal } from '../components/TermsAndConditionsModal';
import { PrivacyPolicyModal } from '../components/PrivacyPolicyModal';
import { smsPermissionService } from '../services/smsPermissionService';
import { updateService, UpdateInfo } from '../services/updateService';
import { getExecutiveGreeting, getSessionGreeting } from '../constants/aiGreetings';
import { isExcludedFromBudget } from '../services/budgetService';
import {
  EXECUTIVE_PROMPT_SETS,
  getWeeklySetIndex,
  getRandomCardIndex,
} from '../constants/executivePrompts';
import { QuickActionsRow } from '../components/QuickActionsRow';
import { FinancialCalendarScreen } from '../screens/FinancialCalendarScreen';
import { ReviewTransactionsModal } from './ReviewTransactionsModal';
import { AdminDashboardScreen } from '../features/admin/AdminDashboardScreen';
import { AdminTabNavigator } from '../features/admin/AdminTabNavigator';

import {
  useTransactionStore,
  useBudgetStore,
  useGoalsStore,
  useAIStore,
  useAuthStore,
  useBankStore,
  useThemeStore,
  useTheme,
  useNotificationStore,
  useAnalyticsStore,
  useConfirmStore,
  showGlobalConfirm,
  showGlobalAlert,
  rehydrateAllStores,
  useSecurityStore,
  AutoLockTimeout,
  useSidebarStore,
  useAppUpdateStore,
  useTermsModalStore,
  usePrivacyModalStore,
} from '../store';
import { biometricService } from '../services/biometricService';
import { BiometricLockOverlay } from '../components/BiometricLockOverlay';
import { AppSidebarDrawer } from '../components/AppSidebarDrawer';
import { BrandWordmark } from '../components/BrandWordmark';
import { StatusBar } from 'expo-status-bar';
import { authService } from '../services/authService';
import { notificationService } from '../services/notificationService';
import { getBackendUrl } from '../config/api';
const BACKEND_URL = getBackendUrl();
import { WelcomeScreen, LoginScreen, SignupScreen, AuthLandingScreen } from './authScreens';
import { OnboardingScreen } from './OnboardingScreen';
import { AutoTrackingSetupScreen, TRACKING_SETUP_KEY } from './AutoTrackingSetupScreen';
import { syncService } from '../services/syncService';
import { BankDetailsModal } from './BankDetailsModal';
import { BanksScreen } from './BanksScreen';
import { AddBankModal } from './AddBankModal';
import { ProfileScreen } from './ProfileScreen';
import { EditProfileScreen } from './EditProfileScreen';
import { EditBankScreen } from './EditBankScreen';
import { ManualTransactionScreen } from './ManualTransactionScreen';
import { TransactionDetailScreen } from './TransactionDetailScreen';
import { SettingsScreen } from './SettingsScreen';
import { PrivacyCenterScreen } from './PrivacyCenterScreen';
import { SuggestFeatureScreen } from './SuggestFeatureScreen';
import { ReportBugScreen } from './ReportBugScreen';
import { BudgetScreen } from './BudgetScreen';
import { CreateBudgetScreen } from './CreateBudgetScreen';
import { HomeDashboard, DashboardCategory } from './HomeDashboard';
import { smsCatchupService } from '../services/smsCatchupService';
import * as Clipboard from 'expo-clipboard';
import { FormattedChatMessage } from '../components/FormattedChatMessage';
import {
  askChatbot,
  ChatMessage
} from '../services/aiService';
import { sanitizeTransactions } from '../services/sanitizer';

// Route React Native Web alerts to Regent Money's luxury GlobalConfirmModal
if (Platform.OS === 'web') {
  Alert.alert = (title: string, message?: string, buttons?: any[]) => {
    if (!buttons || buttons.length <= 1) {
      showGlobalAlert(title, message || '', buttons?.[0]?.onPress);
    } else {
      const cancelBtn = buttons.find((b: any) => b.style === 'cancel') || buttons[0];
      const confirmBtn = buttons.find((b: any) => b !== cancelBtn) || buttons[1];
      showGlobalConfirm({
        title,
        message: message || '',
        cancelText: cancelBtn?.text || 'Cancel',
        confirmText: confirmBtn?.text || 'OK',
        isDestructive: confirmBtn?.style === 'destructive',
        icon: confirmBtn?.style === 'destructive' ? 'trash-2' : 'alert-triangle',
        onConfirm: confirmBtn?.onPress || (() => { }),
        onCancel: cancelBtn?.onPress,
      });
    }
  };
}

// ----------------------------------------------------
// Bouncing Dots Component (Reanimated Typing Indicator)
// ----------------------------------------------------
const BouncingDot = ({ delay }: { delay: number }) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-10, { duration: 300 }),
          withTiming(0, { duration: 300 })
        ),
        -1,
        true
      )
    );
  }, [delay, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.typingDot, animatedStyle]} />
  );
};

const TypingIndicator = () => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.typingContainer}>
      <BouncingDot delay={0} />
      <BouncingDot delay={150} />
      <BouncingDot delay={300} />
    </View>
  );
};

// ----------------------------------------------------
// 1. Dashboard Screen Component
// ----------------------------------------------------







// ----------------------------------------------------
// Web-Safe Chart Fallbacks (Skia is not bundled on Web)
// ----------------------------------------------------
const WebNetWorthChart = ({ data, color = '#2dba4e' }: { data: any[]; color?: string }) => {
  if (!data || data.length === 0) return null;
  const values = data.map((d) => d.netWorth || 0);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 10, paddingTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120 }}>
        {data.map((item, idx) => {
          const heightPct = Math.max(15, Math.round(((item.netWorth - minVal) / range) * 80 + 15));
          return (
            <View key={idx} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', paddingHorizontal: 3 }}>
              <View
                style={{
                  width: '70%',
                  maxWidth: 24,
                  height: `${heightPct}%`,
                  backgroundColor: color,
                  borderRadius: 6,
                  opacity: idx === data.length - 1 ? 1 : 0.65,
                }}
              />
              <Text style={{ color: 'rgba(250, 251, 252, 0.5)', fontSize: 10, marginTop: 6 }} numberOfLines={1}>
                {item.monthLabel}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const WebProjectionChart = ({ data }: { data: any[] }) => {
  if (!data || data.length === 0) return null;
  const sampled = data.length > 8
    ? data.filter((_, i) => i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0)
    : data;
  const maxVal = Math.max(...data.map(d => Math.max(d.value || 0, d.invested || 0))) || 1;

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120 }}>
        {sampled.map((item, idx) => {
          const valuePct = Math.max(12, Math.round(((item.value || 0) / maxVal) * 100));
          const investedPct = Math.max(10, Math.round(((item.invested || 0) / maxVal) * 100));
          return (
            <View key={idx} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', paddingHorizontal: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: '85%', gap: 3 }}>
                <View
                  style={{
                    width: 8,
                    height: `${investedPct}%`,
                    backgroundColor: 'rgba(250, 251, 252, 0.4)',
                    borderRadius: 3
                  }}
                />
                <View
                  style={{
                    width: 8,
                    height: `${valuePct}%`,
                    backgroundColor: '#2dba4e',
                    borderRadius: 3
                  }}
                />
              </View>
              <Text style={{ color: 'rgba(250, 251, 252, 0.5)', fontSize: 9, marginTop: 4 }}>
                Y{item.year}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export const SPENDING_CHART_COLORS: Record<string, string> = {
  food: '#f59e0b',          // Warm Amber Orange
  dining: '#f59e0b',
  restaurant: '#f59e0b',
  groceries: '#10b981',     // Vibrant Emerald Green
  supermarket: '#10b981',
  shopping: '#ec4899',      // Magenta / Vivid Pink
  clothing: '#ec4899',
  entertainment: '#a855f7', // Electric Purple
  movies: '#a855f7',
  travel: '#0284c7',        // Sky Blue
  flight: '#0284c7',
  transport: '#06b6d4',     // Cyan
  cab: '#06b6d4',
  fuel: '#f43f5e',          // Coral / Rose
  bills: '#eab308',         // Gold / Yellow
  utilities: '#eab308',     // Gold / Yellow
  electricity: '#eab308',
  recharge: '#06b6d4',      // Cyan
  medical: '#ef4444',       // Crimson Red
  health: '#ef4444',
  education: '#14b8a6',     // Teal
  investments: '#16a34a',   // Bright Green
  self_transfer: '#6366f1', // Royal Indigo
  services: '#8b5cf6',      // Violet
  personal: '#d946ef',      // Fuchsia
  miscellaneous: '#64748b', // Slate Gray
  other: '#94a3b8',         // Neutral Slate
};

export const PALETTE_FALLBACK = [
  '#f59e0b', // Amber
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#a855f7', // Purple
  '#eab308', // Gold
  '#14b8a6', // Teal
  '#0284c7', // Sky Blue
  '#64748b', // Slate Gray
];

export const getSpendingCategoryColor = (categoryKey: string, _isDark?: boolean, index = 0): string => {
  return getCategoryColor(categoryKey);
};

interface SpendingDonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
}

const SpendingDonutChart: React.FC<SpendingDonutChartProps> = ({
  data,
  size = 156,
  strokeWidth = 14,
}) => {
  const { colors, isDark } = useTheme();

  const total = useMemo(() => {
    return data.reduce((sum, item) => sum + (item.value || 0), 0);
  }, [data]);

  // Leave room for outer percentage badges around the ring
  const ringPadding = 48;
  const radius = (size - ringPadding) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const rect = useMemo(() => ({
    x: cx - radius,
    y: cy - radius,
    width: 2 * radius,
    height: 2 * radius,
  }), [cx, cy, radius]);

  // Generate Skia Arc Paths for Native
  const slicePaths = useMemo(() => {
    if (Platform.OS === 'web' || !Skia?.Path || total <= 0) return null;
    try {
      let currentAngle = -90; // Start at 12 o'clock
      const isSingleSlice = data.length === 1;
      const gap = isSingleSlice ? 0 : 3; // 3-degree clean separation between slices

      return data.map((item) => {
        const path = Skia.Path.Make();
        const sweepAngle = (item.value / total) * 360;

        if (isSingleSlice || sweepAngle >= 359.5) {
          path.addCircle(cx, cy, radius);
        } else {
          const effectiveSweep = Math.max(1, sweepAngle - gap);
          path.addArc(rect, currentAngle + gap / 2, effectiveSweep);
        }
        currentAngle += sweepAngle;
        return { path, color: item.color };
      });
    } catch (err) {
      console.warn('Error generating Skia donut paths:', err);
      return null;
    }
  }, [data, total, rect, cx, cy, radius]);

  const bgTrackPath = useMemo(() => {
    if (Platform.OS === 'web' || !Skia?.Path) return null;
    try {
      const p = Skia.Path.Make();
      p.addCircle(cx, cy, radius);
      return p;
    } catch {
      return null;
    }
  }, [cx, cy, radius]);

  // Calculate percentage badges positioned right outside each ring section
  const percentageLabels = useMemo(() => {
    if (total <= 0 || data.length === 0) return [];

    let currentAngle = -90;
    const rawBadges: Array<{
      pctText: string;
      color: string;
      angle: number;
      label: string;
    }> = [];

    // Provide percentage badges for all slices around the circle
    data.forEach((item) => {
      const sweepAngle = (item.value / total) * 360;
      const pct = (item.value / total) * 100;
      const midAngleDeg = currentAngle + sweepAngle / 2;

      if (item.value > 0) {
        // Exact percentage formatting: show 2 decimals if < 0.1% (e.g. 0.09%), 1 decimal otherwise (e.g. 12.6%)
        const pctText =
          pct <= 0
            ? '0%'
            : pct < 0.01
              ? '<0.01%'
              : pct < 0.1
                ? `${pct.toFixed(2)}%`
                : pct % 1 === 0
                  ? `${pct}%`
                  : `${pct.toFixed(1)}%`;

        rawBadges.push({
          pctText,
          color: item.color,
          angle: midAngleDeg,
          label: item.label,
        });
      }

      currentAngle += sweepAngle;
    });

    if (rawBadges.length === 0) return [];

    // Multi-pass angular relaxation to guarantee adjacent badges never overlap
    const minGapDeg = 38;
    const adjustedAngles = rawBadges.map((b) => b.angle);

    for (let pass = 0; pass < 30; pass++) {
      for (let i = 0; i < adjustedAngles.length; i++) {
        for (let j = i + 1; j < adjustedAngles.length; j++) {
          let diff = adjustedAngles[j] - adjustedAngles[i];
          while (diff > 180) diff -= 360;
          while (diff < -180) diff += 360;

          if (Math.abs(diff) < minGapDeg) {
            const overlap = minGapDeg - Math.abs(diff);
            const push = overlap / 2;
            if (diff >= 0) {
              adjustedAngles[i] -= push;
              adjustedAngles[j] += push;
            } else {
              adjustedAngles[i] += push;
              adjustedAngles[j] -= push;
            }
          }
        }
      }
    }

    const labelRadius = radius + strokeWidth / 2 + 7;
    return rawBadges.map((badge, idx) => {
      const rad = (adjustedAngles[idx] * Math.PI) / 180;
      return {
        pctText: badge.pctText,
        color: badge.color,
        x: cx + labelRadius * Math.cos(rad),
        y: cy + labelRadius * Math.sin(rad),
        label: badge.label,
      };
    });
  }, [data, total, radius, strokeWidth, cx, cy]);

  // Web or Fallback conic gradient
  const webGradient = useMemo(() => {
    if (total <= 0) return colors.border;
    let currentDeg = 0;
    const stops: string[] = [];
    data.forEach((d) => {
      const sweep = (d.value / total) * 360;
      const start = currentDeg;
      const end = currentDeg + sweep;
      stops.push(`${d.color} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`);
      currentDeg = end;
    });
    return stops.length > 0 ? `conic-gradient(${stops.join(', ')})` : colors.accent;
  }, [data, total, colors.border, colors.accent]);

  if (total <= 0) {
    return null;
  }

  // Native rendering with Skia
  if (Platform.OS !== 'web' && slicePaths) {
    return (
      <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
        <Canvas style={{ width: size, height: size }}>
          {bgTrackPath && (
            <Path
              path={bgTrackPath}
              style="stroke"
              strokeWidth={strokeWidth}
              color={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}
            />
          )}
          {slicePaths.map((slice, i) => (
            <Path
              key={i}
              path={slice.path}
              style="stroke"
              strokeWidth={strokeWidth}
              color={slice.color}
            />
          ))}
        </Canvas>

        {/* Center Spent Amount Label */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { justifyContent: 'center', alignItems: 'center' },
          ]}
          pointerEvents="none"
        >
          <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Spent
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 1 }}>
            ₹{total >= 100000 ? `${(total / 1000).toFixed(1)}k` : total.toLocaleString('en-IN')}
          </Text>
        </View>

        {/* Outer Percentage Badges */}
        {percentageLabels.map((lbl, i) => (
          <View
            key={`pct-${i}`}
            style={{
              position: 'absolute',
              left: lbl.x,
              top: lbl.y,
              transform: [{ translateX: -17 }, { translateY: -9 }],
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : '#ffffff',
              borderColor: lbl.color,
              borderWidth: 1.5,
              borderRadius: 8,
              paddingHorizontal: 4,
              paddingVertical: 1,
              minWidth: 32,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: isDark ? lbl.color : '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: isDark ? 0.35 : 0.12,
              shadowRadius: 3,
              elevation: 4,
              zIndex: 10,
            }}
            pointerEvents="none"
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 8.5,
                fontWeight: '800',
                color: lbl.color,
                letterSpacing: -0.2,
              }}
            >
              {lbl.pctText}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  // Web & Resilient Fallback rendering (CSS conic-gradient donut)
  const ringDiameter = radius * 2 + strokeWidth;
  const innerCutout = radius * 2 - strokeWidth;
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
      <View
        style={{
          width: ringDiameter,
          height: ringDiameter,
          borderRadius: ringDiameter / 2,
          // @ts-ignore
          backgroundImage: webGradient,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: innerCutout,
            height: innerCutout,
            borderRadius: innerCutout / 2,
            backgroundColor: colors.card,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Spent
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 1 }}>
            ₹{total >= 100000 ? `${(total / 1000).toFixed(1)}k` : total.toLocaleString('en-IN')}
          </Text>
        </View>
      </View>

      {/* Outer Percentage Badges */}
      {percentageLabels.map((lbl, i) => (
        <View
          key={`pct-web-${i}`}
          style={{
            position: 'absolute',
            left: lbl.x,
            top: lbl.y,
            transform: [{ translateX: -17 }, { translateY: -9 }],
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : '#ffffff',
            borderColor: lbl.color,
            borderWidth: 1.5,
            borderRadius: 8,
            paddingHorizontal: 4,
            paddingVertical: 1,
            minWidth: 32,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: isDark ? lbl.color : '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isDark ? 0.35 : 0.12,
            shadowRadius: 3,
            elevation: 4,
            zIndex: 10,
          }}
          pointerEvents="none"
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 8.5,
              fontWeight: '800',
              color: lbl.color,
              letterSpacing: -0.2,
            }}
          >
            {lbl.pctText}
          </Text>
        </View>
      ))}
    </View>
  );
};

interface NetWorthDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  snapshots: any[];
  liveNetWorth: number;
  loading?: boolean;
}

const NetWorthDetailsModal = ({ visible, onClose, snapshots, liveNetWorth, loading = false }: NetWorthDetailsModalProps) => {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors);
  const navStyles = getNavStyles(colors);

  const [range, setRange] = useState<'3M' | '6M' | '1Y'>('6M');

  // Compute filtered snapshots and table list items
  const { chartData, listItems, changeAmount, changePercent, isPositive } = useMemo(() => {
    let monthsToKeep = 6;
    if (range === '3M') monthsToKeep = 3;
    if (range === '6M') monthsToKeep = 6;
    if (range === '1Y') monthsToKeep = 12;

    // Filter snapshots based on range
    let filtered = [...snapshots];
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    filtered = filtered.slice(0, monthsToKeep);
    filtered.sort((a, b) => a.timestamp - b.timestamp);

    // Compute month-end last days
    const tableData = filtered.map((s) => {
      const dateObj = new Date(s.timestamp);
      const y = dateObj.getFullYear();
      const m = dateObj.getMonth();
      const lastDay = new Date(y, m + 1, 0); // last day of that month
      return {
        timestamp: s.timestamp,
        netWorth: s.netWorth,
        monthLabel: dateObj.toLocaleDateString('en-IN', { month: 'short' }),
        lastDayLabel: `${lastDay.getDate()} ${lastDay.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`,
        displayMonth: dateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
        isLive: false,
      };
    });

    const currentLiveItem = {
      timestamp: Date.now(),
      netWorth: liveNetWorth,
      monthLabel: new Date().toLocaleDateString('en-IN', { month: 'short' }),
      lastDayLabel: 'Today (Live)',
      displayMonth: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      isLive: true,
    };

    // Newest first for list
    const listItems = [currentLiveItem, ...[...tableData].reverse()];

    // Chronological order for chart
    const chartData = [
      ...tableData,
      {
        timestamp: Date.now(),
        netWorth: liveNetWorth,
        monthLabel: new Date().toLocaleDateString('en-IN', { month: 'short' }),
        isLive: true,
      }
    ];

    // Compute trend metrics
    const startVal = tableData.length > 0 ? tableData[0].netWorth : liveNetWorth;
    const changeAmt = liveNetWorth - startVal;
    const changePct = startVal > 0 ? (changeAmt / startVal) * 100 : 0;

    return {
      chartData,
      listItems,
      changeAmount: changeAmt,
      changePercent: changePct,
      isPositive: changeAmt >= 0,
    };
  }, [snapshots, liveNetWorth, range]);

  const trendColor = isPositive ? '#2dba4e' : '#cf222e';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlayFull}>
        <View style={[styles.modalCardFull, { height: '90%' }]}>
          {/* Header */}
          <View style={navStyles.modalHeader}>
            <View>
              <Text style={navStyles.modalTitle}>Net Worth Analytics</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                Live wealth tracker & trends
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={navStyles.closeBtn}
              activeOpacity={0.7}
            >
              <Feather name="x" size={20} color="#8E8E9F" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
            {/* Live Summary block */}
            <View style={{ marginVertical: 10, alignItems: 'flex-start' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Current Net Worth
              </Text>
              <Text style={{ color: colors.text, fontSize: 32, fontWeight: '900', marginTop: 4 }}>
                ₹{liveNetWorth.toLocaleString('en-IN')}
              </Text>

              {/* Trend Badge */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isPositive ? 'rgba(45, 186, 78, 0.12)' : 'rgba(207, 34, 46, 0.12)',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
                marginTop: 6
              }}>
                <Feather
                  name={isPositive ? "arrow-up-right" : "arrow-down-left"}
                  size={14}
                  color={trendColor}
                  style={{ marginRight: 4 }}
                />
                <Text style={{ color: trendColor, fontSize: 12, fontWeight: '800' }}>
                  {isPositive ? '+' : ''}₹{Math.abs(changeAmount).toLocaleString('en-IN')} ({isPositive ? '+' : ''}{changePercent.toFixed(1)}%)
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginLeft: 6 }}>
                  last {range === '3M' ? '3 months' : range === '6M' ? '6 months' : '1 year'}
                </Text>
              </View>
            </View>

            {/* Timeframe selector */}
            <View style={{
              flexDirection: 'row',
              backgroundColor: colors.isDark ? '#1a1a24' : '#edf0f2',
              borderRadius: 12,
              padding: 4,
              marginVertical: 16
            }}>
              {(['3M', '6M', '1Y'] as const).map((r) => {
                const active = range === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      alignItems: 'center',
                      backgroundColor: active ? (colors.isDark ? '#2b2b3b' : '#ffffff') : 'transparent',
                      borderRadius: 8,
                      borderWidth: active ? 1 : 0,
                      borderColor: active ? colors.border : 'transparent',
                      shadowColor: active ? '#000000' : 'transparent',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 2,
                      elevation: active ? 2 : 0,
                    }}
                    onPress={() => setRange(r)}
                    activeOpacity={0.8}
                  >
                    <Text style={{
                      color: active ? trendColor : colors.textSecondary,
                      fontWeight: '800',
                      fontSize: 13
                    }}>
                      {r === '3M' ? '3 Months' : r === '6M' ? '6 Months' : '1 Year'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* GPU Stock Chart */}
            <View style={{
              backgroundColor: colors.isDark ? '#12121a' : '#ffffff',
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              padding: 12,
              height: 220,
              marginBottom: 20,
              shadowColor: colors.shadowColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.05,
              shadowRadius: 8,
              elevation: 2,
            }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' }}>
                Wealth Performance Curve
              </Text>

              {chartData.length > 1 ? (
                <View style={{ flex: 1 }}>
                  {Platform.OS !== 'web' ? (
                    <CartesianChart
                      data={chartData}
                      xKey="monthLabel"
                      yKeys={["netWorth"]}
                    >
                      {({ points, chartBounds }) => (
                        <>
                          <Area
                            points={points.netWorth}
                            y0={chartBounds.bottom}
                            animate={{ type: "timing", duration: 300 }}
                          >
                            <LinearGradient
                              start={vec(0, chartBounds.top)}
                              end={vec(0, chartBounds.bottom)}
                              colors={[trendColor, "rgba(45, 186, 78, 0)"]}
                            />
                          </Area>
                          <Line
                            points={points.netWorth}
                            color={trendColor}
                            strokeWidth={2.5}
                            animate={{ type: "timing", duration: 300 }}
                          />
                        </>
                      )}
                    </CartesianChart>
                  ) : (
                    <WebNetWorthChart data={chartData} color={trendColor} />
                  )}
                </View>
              ) : loading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={trendColor} />
                </View>
              ) : (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
                  <Feather name="bar-chart-2" size={24} color={colors.textTertiary} style={{ marginBottom: 6 }} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                    No historical trend data found
                  </Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 4, textAlign: 'center', lineHeight: 16 }}>
                    Historical snapshots will record automatically as your bank balances change.
                  </Text>
                </View>
              )}
            </View>

            {/* Month-wise list header */}
            <Text style={{
              color: colors.text,
              fontSize: 14,
              fontWeight: '800',
              marginBottom: 10,
              letterSpacing: 0.5,
            }}>
              Month-end History
            </Text>

            {/* Monthly record rows */}
            {listItems.map((item, idx) => {
              return (
                <View
                  key={idx}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.inputBackground,
                    borderWidth: 1,
                    borderColor: item.isLive ? colors.accent : colors.border,
                    borderRadius: 14,
                    paddingHorizontal: 16,
                    height: 64,
                    marginVertical: 4,
                    shadowColor: colors.shadowColor,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.03,
                    shadowRadius: 4,
                    elevation: 1,
                  }}
                >
                  <View style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: item.isLive ? colors.accentMuted : (colors.isDark ? '#1e1e2c' : '#f0f4f8'),
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}>
                    {item.isLive ? (
                      <Ionicons name="pulse" size={18} color={colors.accent} />
                    ) : (
                      <Feather name="calendar" size={16} color={colors.textSecondary} />
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                        {item.displayMonth}
                      </Text>
                      {item.isLive && (
                        <View style={{
                          backgroundColor: 'rgba(45, 186, 78, 0.12)',
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                          marginLeft: 8
                        }}>
                          <Text style={{ color: '#2dba4e', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 }}>
                            LIVE
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 2 }}>
                      {item.lastDayLabel}
                    </Text>
                  </View>

                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>
                    ₹{item.netWorth.toLocaleString('en-IN')}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
}

type NotifKind = 'insight' | 'tip' | 'alert' | 'budget' | 'review';
type NotifFilter = 'all' | 'insights' | 'alerts' | 'review';

// Strips leading emoji from backend titles; the icon tile carries the meaning instead
const LEADING_EMOJI = /^(?:[\u2190-\u2BFF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]|[\uFE0F\u200D]|\s)+/;

const cleanTitle = (title?: string) => {
  const t = (title || '').replace(LEADING_EMOJI, '').trim();
  if (!t) return 'Update from Regent';
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const getNotifKind = (n: any): NotifKind => {
  if (n.payload?.action === 'category_correction') return 'review';
  if (n.type === 'anomaly') return 'alert';
  if (n.type === 'budget_alert') return 'budget';
  const text = `${n.type || ''} ${n.title || ''}`.toLowerCase();
  if (text.includes('tip') || text.includes('hack') || text.includes('rule')) return 'tip';
  return 'insight';
};

const NOTIF_KIND_STYLE: Record<
  NotifKind,
  { icon: keyof typeof Ionicons.glyphMap; light: [string, string]; dark: [string, string] }
> = {
  insight: { icon: 'sparkles-outline', light: ['#E3F7EE', '#0B6B44'], dark: ['rgba(52, 211, 153, 0.16)', '#6EE7B7'] },
  tip: { icon: 'bulb-outline', light: ['#ECE6FF', '#4B2DB8'], dark: ['rgba(139, 124, 246, 0.2)', '#C4B8FF'] },
  alert: { icon: 'warning-outline', light: ['#FFE3D6', '#A63A12'], dark: ['rgba(255, 138, 107, 0.18)', '#FFB29E'] },
  budget: { icon: 'pie-chart-outline', light: ['#FFF1D6', '#8A5A00'], dark: ['rgba(255, 176, 32, 0.18)', '#FFD27A'] },
  review: { icon: 'pricetag-outline', light: ['#DCEBFF', '#1450A3'], dark: ['rgba(59, 130, 246, 0.18)', '#93C5FD'] },
};

const matchesNotifFilter = (kind: NotifKind, filter: NotifFilter) => {
  if (filter === 'all') return true;
  if (filter === 'insights') return kind === 'insight' || kind === 'tip';
  if (filter === 'alerts') return kind === 'alert' || kind === 'budget';
  return kind === 'review';
};

const dayGroupLabel = (ts: number) => {
  const d = new Date(ts);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((startOfToday.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  return 'Earlier';
};

const formatNotifTime = (timestamp: number | string) => {
  if (!timestamp) return '';
  const d = new Date(Number(timestamp));
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const NotificationsModal = ({ visible, onClose }: NotificationsModalProps) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const notifications = useNotificationStore((state) => state.notifications);
  const isLoading = useNotificationStore((state) => state.isLoading);
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  const [filter, setFilter] = useState<NotifFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  // Remember which items were unread when the sheet opened, so they stay
  // highlighted while the user reads, even after they're marked read.
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      setNewIds(new Set(notifications.filter((n: any) => !n.readStatus).map((n: any) => n.id)));
      setFilter('all');
      setExpandedId(null);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && unreadCount > 0) {
      notificationService.markAllAsRead();
    }
  }, [visible, unreadCount]);

  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const ink = colors.text;
  const muted = colors.textSecondary;
  const sheetBg = isDark ? colors.background : '#F3F6F4';
  const cardBg = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const FOREST = '#0B3D2C';
  const LIME = '#B8F36B';

  const items = useMemo(
    () =>
      notifications.map((n: any) => ({
        raw: n,
        id: n.id,
        kind: getNotifKind(n),
        title: cleanTitle(n.title),
        body: (n.body || '').trim(),
        ts: Number(n.createdAt) || 0,
        isNew: newIds.has(n.id),
      })),
    [notifications, newIds]
  );

  const reviewCount = items.filter(
    (i) => i.kind === 'review' && !i.raw.readStatus && !resolvedIds.has(i.id)
  ).length;

  // Hero card: the newest unread insight or tip (only on the "All" tab)
  const featured = useMemo(() => {
    if (filter !== 'all') return null;
    return items.find((i) => i.isNew && (i.kind === 'insight' || i.kind === 'tip')) || null;
  }, [items, filter]);

  const sections = useMemo(() => {
    const order = ['Today', 'Yesterday', 'This week', 'Earlier'];
    const map: Record<string, typeof items> = {};
    items
      .filter((i) => matchesNotifFilter(i.kind, filter) && i.id !== featured?.id)
      .forEach((i) => {
        const label = dayGroupLabel(i.ts);
        (map[label] = map[label] || []).push(i);
      });
    return order.filter((k) => map[k]?.length).map((k) => ({ title: k, data: map[k] }));
  }, [items, filter, featured]);

  const handleAction = async (notification: any, actionName: 'approve' | 'keep_old') => {
    const payload = notification.payload;
    if (!payload) return;
    setBusyId(notification.id);
    try {
      const accessToken = authService.getAccessToken();
      if (!accessToken) return;

      if (payload.action === 'category_correction') {
        const categoryToUse = actionName === 'approve' ? payload.suggestedCategory : payload.oldCategory;
        const response = await fetch(`${BACKEND_URL}/sync/transaction/${payload.transactionId}/category`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ category: categoryToUse }),
        });
        if (!response.ok) throw new Error('Could not update the category. Try again.');
        await syncService.sync();
      }

      await notificationService.markAsRead(notification.id);
      setResolvedIds((prev) => new Set(prev).add(notification.id));
    } catch (e: any) {
      Alert.alert('Not updated', e.message || 'Could not complete this action. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const openRegent = () => {
    onClose();
    if (navigationRef?.isReady?.()) {
      (navigationRef.navigate as any)('Main', { screen: 'Regent' });
    }
  };

  const FILTERS: { key: NotifFilter; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'insights', label: 'Insights' },
    { key: 'alerts', label: 'Alerts' },
    { key: 'review', label: 'To review', count: reviewCount },
  ];

  const renderRow = (item: (typeof items)[number], isLast: boolean) => {
    const style = NOTIF_KIND_STYLE[item.kind];
    const [tileBg, tileFg] = isDark ? style.dark : style.light;
    const expanded = expandedId === item.id;
    const showActions =
      item.kind === 'review' && !item.raw.readStatus && !resolvedIds.has(item.id) && item.raw.payload;
    const resolved = resolvedIds.has(item.id);

    return (
      <Pressable
        key={item.id}
        onPress={() => setExpandedId(expanded ? null : item.id)}
        style={{
          flexDirection: 'row',
          gap: 12,
          padding: 14,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: line,
        }}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.body}`}
        accessibilityState={{ expanded }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            backgroundColor: tileBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={style.icon} size={19} color={tileFg} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontSize: 15,
                fontWeight: item.isNew ? '700' : '600',
                color: item.isNew ? ink : isDark ? 'rgba(234, 242, 238, 0.85)' : '#3A4A42',
              }}
            >
              {item.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 12, color: muted }}>{formatNotifTime(item.ts)}</Text>
              {item.isNew && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' }} />}
            </View>
          </View>

          {!!item.body && (
            <Text
              numberOfLines={expanded ? undefined : 2}
              style={{ fontSize: 13, lineHeight: 19, color: muted, marginTop: 3 }}
            >
              {item.body}
            </Text>
          )}

          {showActions && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {busyId === item.id ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <>
                  <TouchableOpacity
                    onPress={() => handleAction(item.raw, 'approve')}
                    activeOpacity={0.8}
                    style={{
                      backgroundColor: isDark ? LIME : FOREST,
                      borderRadius: 999,
                      height: 36,
                      paddingHorizontal: 14,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: isDark ? FOREST : '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                      Yes, {item.raw.payload.suggestedCategory}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleAction(item.raw, 'keep_old')}
                    activeOpacity={0.8}
                    style={{
                      borderWidth: 1,
                      borderColor: line,
                      backgroundColor: cardBg,
                      borderRadius: 999,
                      height: 36,
                      paddingHorizontal: 14,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: ink, fontSize: 12, fontWeight: '600' }}>
                      Keep {item.raw.payload.oldCategory}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {resolved && item.kind === 'review' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
              <Feather name="check" size={13} color={colors.accent} />
              <Text style={{ fontSize: 12, color: colors.accent, fontWeight: '600' }}>Category updated</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close notifications" />

        <View
          style={{
            height: '90%',
            width: '100%',
            maxWidth: 640,
            alignSelf: 'center',
            backgroundColor: sheetBg,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            overflow: 'hidden',
          }}
        >
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#C9D4CE', alignSelf: 'center', marginTop: 10 }} />

          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 26, color: ink, fontFamily: display, fontWeight: display ? undefined : '800', letterSpacing: -0.6 }}>
                Notifications
              </Text>
              {newIds.size > 0 && (
                <View style={{ backgroundColor: LIME, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                  <Text style={{ color: FOREST, fontSize: 12, fontWeight: '700' }}>{newIds.size} new</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityLabel="Close"
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: line,
                backgroundColor: cardBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="x" size={18} color={ink} />
            </TouchableOpacity>
          </View>

          {/* Filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, gap: 8 }}
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <TouchableOpacity
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  activeOpacity={0.8}
                  accessibilityState={{ selected: active }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    height: 36,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    backgroundColor: active ? (isDark ? LIME : FOREST) : cardBg,
                    borderWidth: active ? 0 : 1,
                    borderColor: line,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: active ? '700' : '600', color: active ? (isDark ? FOREST : '#FFFFFF') : ink }}>
                    {f.label}
                  </Text>
                  {!!f.count && (
                    <View style={{ backgroundColor: '#FF5A36', borderRadius: 999, minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>{f.count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {isLoading && notifications.length === 0 ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
            >
              {/* Featured card */}
              {featured && (
                <Animated.View
                  entering={FadeIn.duration(350)}
                  style={{
                    marginHorizontal: 16,
                    marginTop: 18,
                    backgroundColor: FOREST,
                    borderRadius: 26,
                    padding: 18,
                    overflow: 'hidden',
                  }}
                >
                  <View style={{ position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: 'rgba(184, 243, 107, 0.2)', right: -60, top: -70 }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="sparkles" size={14} color={FOREST} />
                      </View>
                      <Text style={{ color: LIME, fontSize: 12, fontWeight: '700' }}>Latest from Regent</Text>
                    </View>
                    <Text style={{ color: '#B5CEC1', fontSize: 12 }}>{formatNotifTime(featured.ts)}</Text>
                  </View>
                  <Text style={{ color: '#FFFFFF', fontSize: 22, marginTop: 12, letterSpacing: -0.4, fontFamily: display, fontWeight: display ? undefined : '800' }}>
                    {featured.title}
                  </Text>
                  {!!featured.body && (
                    <Text style={{ color: '#D9E7DF', fontSize: 14, lineHeight: 20, marginTop: 6 }}>{featured.body}</Text>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                    <TouchableOpacity
                      onPress={openRegent}
                      activeOpacity={0.85}
                      style={{ backgroundColor: LIME, borderRadius: 999, height: 40, paddingHorizontal: 16, justifyContent: 'center' }}
                    >
                      <Text style={{ color: FOREST, fontSize: 13, fontWeight: '700' }}>Ask Regent about this</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              )}

              {/* Grouped list */}
              {sections.map((section, sIndex) => (
                <Animated.View key={section.title} entering={FadeIn.delay(80 + sIndex * 60).duration(300)}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: muted, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 8 }}>
                    {section.title}
                  </Text>
                  <View style={{ marginHorizontal: 16, backgroundColor: cardBg, borderWidth: 1, borderColor: line, borderRadius: 22, overflow: 'hidden' }}>
                    {section.data.map((item, i) => renderRow(item, i === section.data.length - 1))}
                  </View>
                </Animated.View>
              ))}

              {/* Empty state */}
              {!featured && sections.length === 0 && (
                <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 64 }}>
                  <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: isDark ? 'rgba(184, 243, 107, 0.12)' : '#E3F7EE', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="notifications-outline" size={28} color={isDark ? LIME : '#0B6B44'} />
                  </View>
                  <Text style={{ color: ink, fontSize: 17, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
                    {filter === 'all' ? "You're all caught up" : 'Nothing here yet'}
                  </Text>
                  <Text style={{ color: muted, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' }}>
                    {filter === 'review'
                      ? 'When Regent is unsure about a category, it will ask you here.'
                      : 'Spending alerts and money tips from Regent will show up here.'}
                  </Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ----------------------------------------------------
const ProfileModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { colors } = useTheme();
  const navStyles = getNavStyles(colors);
  const user = useAuthStore((state) => state.user);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={navStyles.modalOverlay}>
        <View style={navStyles.modalCard}>
          <View style={navStyles.modalHeader}>
            <Text style={navStyles.modalTitle}>User Profile</Text>
            <TouchableOpacity onPress={onClose} style={navStyles.closeBtn}>
              <Feather name="x" size={20} color="#8E8E9F" />
            </TouchableOpacity>
          </View>

          <View style={navStyles.profileInfoRow}>
            <View style={navStyles.largeAvatar}>
              <Text style={navStyles.largeAvatarText}>
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={navStyles.profileName}>{user?.name || 'Guest User'}</Text>
              <Text style={navStyles.profileEmail}>{user?.email || user?.phone || 'Offline session'}</Text>
              <View style={{ flexDirection: 'row', marginTop: 8 }}>
                <View style={navStyles.providerBadge}>
                  <Text style={navStyles.providerBadgeText}>
                    Provider: {user?.authProvider ? (user.authProvider === 'local' || user.authProvider === 'email' ? 'Email/Password' : user.authProvider.charAt(0).toUpperCase() + user.authProvider.slice(1)) : 'Supabase'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={navStyles.metaInfoBlock}>
            <Text style={navStyles.metaLabel}>Session Type: <Text style={navStyles.metaValue}>NestJS Cloud Sync</Text></Text>
            {user?.createdAt && (
              <Text style={navStyles.metaLabel}>Member Since: <Text style={navStyles.metaValue}>{new Date(user.createdAt).toLocaleDateString('en-IN')}</Text></Text>
            )}
          </View>

          <TouchableOpacity
            style={navStyles.logoutBtn}
            onPress={() => {
              onClose();
              showGlobalConfirm({
                title: 'Log Out Session',
                message: 'Are you sure you want to log out of your Regent Money account?',
                confirmText: 'Yes, Log Out',
                cancelText: 'Cancel',
                isDestructive: true,
                icon: 'log-out',
                onConfirm: async () => {
                  await authService.logOut();
                },
              });
            }}
          >
            <Feather name="log-out" size={16} color="#fafbfc" style={{ marginRight: 8 }} />
            <Text style={navStyles.logoutBtnText}>Log Out Session</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ----------------------------------------------------
// Unified Premium TopBar (Header shown across every screen)
// ----------------------------------------------------
interface AppTopBarProps {
  onOpenAddBank?: () => void;
}

const AppTopBar = ({ onOpenAddBank }: AppTopBarProps) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { sync } = useSyncDb();

  const user = useAuthStore((state) => state.user);
  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [internalAddBankVisible, setInternalAddBankVisible] = useState(false);

  // Pulse animation for the saving badge and alert dot
  const pulseOpacity = useSharedValue(0.4);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100 }),
        withTiming(0.35, { duration: 1100 })
      ),
      -1,
      true
    );
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1100 }),
        withTiming(0.9, { duration: 1100 })
      ),
      -1,
      true
    );
  }, []);

  const animatedPulseDot = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  const handleAlertPress = () => {
    if (onOpenAddBank) {
      onOpenAddBank();
    } else {
      setInternalAddBankVisible(true);
    }
  };

  return (
    <View style={[styles.topBarContainer, { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 8 : 4) }]}>
      <View style={styles.topBarContent}>
        {/* Left Brand Identity - Tap to open Sidebar Drawer */}
        <TouchableOpacity
          style={styles.topBarLeft}
          onPress={() => useSidebarStore.getState().openSidebar()}
          activeOpacity={0.7}
        >
          <View style={styles.topBarLogoBadge}>
            <Image
              source={require('../../assets/insideicon.png')}
              style={styles.topBarLogoImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.topBarBrandCol}>
            <BrandWordmark size={19} />
          </View>
        </TouchableOpacity>

        {/* Right Actions */}
        <View style={styles.topBarRight}>
          {bankProfiles.length === 0 && (
            <TouchableOpacity
              style={styles.topBarAlertBtn}
              onPress={handleAlertPress}
              activeOpacity={0.7}
            >
              <Feather name="alert-circle" size={16} color="#FF5252" />
              <Animated.View style={[styles.badgePulseDot, animatedPulseDot]} />
            </TouchableOpacity>
          )}

          {/* Notifications Bell */}
          <TouchableOpacity
            style={styles.topBarIconBtn}
            onPress={() => setNotificationsVisible(true)}
            activeOpacity={0.7}
          >
            <Feather name="bell" size={17} color={colors.text} />
            {unreadCount > 0 && (
              <View style={styles.topBarBadge}>
                <Text style={styles.topBarBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Global Modals accessible from every page */}
      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
      />

      <NotificationsModal
        visible={notificationsVisible}
        onClose={() => setNotificationsVisible(false)}
      />

      <AddBankModal
        visible={internalAddBankVisible}
        onClose={() => setInternalAddBankVisible(false)}
        onSuccess={async () => {
          setInternalAddBankVisible(false);
          await sync();
        }}
      />
    </View>
  );
};

const TransactionRowItem = React.memo(({ tx, styles }: { tx: any; styles: any }) => {
  const isCredit = tx.type === 'credit';
  const amountVal = Math.abs(parseFloat(tx.amount || 0));
  const formattedAmount = `${isCredit ? '+' : '-'}₹${amountVal.toLocaleString('en-IN')}`;
  const catKey = isCredit ? 'money_received' : (tx.category || 'miscellaneous');

  return (
    <View style={styles.txItem}>
      <View style={styles.txLeft}>
        <CategoryIcon
          category={catKey}
          variant="soft"
          size={36}
          style={{ marginRight: 10 }}
        />
        <View style={styles.txMeta}>
          <Text style={styles.merchantName} numberOfLines={1} ellipsizeMode="tail">
            {tx.merchant || 'Unknown Merchant'}
          </Text>
          <Text style={styles.txDate} numberOfLines={1}>
            {new Date(tx.timestamp).toLocaleDateString('en-IN')}
          </Text>
        </View>
      </View>
      <View style={styles.txRight}>
        <Text
          style={[styles.txAmount, isCredit && { color: '#2dba4e' }]}
          numberOfLines={1}
        >
          {formattedAmount}
        </Text>
        {tx.isAnomaly && (
          <View style={styles.anomalyBadge}>
            <Text style={styles.anomalyText} numberOfLines={1}>Anomaly</Text>
          </View>
        )}
      </View>
    </View>
  );
});

const DashboardScreen = () => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { sync } = useSyncDb();

  const user = useAuthStore((state) => state.user);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const transactions = useTransactionStore((state) => state.transactions);
  const snapshots = useAnalyticsStore((state) => state.snapshots);
  const incomeCurrentMonth = useAnalyticsStore((state) => state.incomeCurrentMonth);

  const [refreshing, setRefreshing] = useState(false);
  const [addBankModalVisible, setAddBankModalVisible] = useState(false);
  const [netWorthModalVisible, setNetWorthModalVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [isSmsPermissionActive, setIsSmsPermissionActive] = useState(true);

  useEffect(() => {
    if (Platform.OS === 'android') {
      smsPermissionService.isPermissionGranted().then(setIsSmsPermissionActive);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      sync();
      syncService.fetchAnalytics();
    }, [sync])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncService.sync(true);
      await sync();
    } catch (e: any) {
      console.log('[Dashboard] Pull-to-refresh sync failed:', e.message);
    } finally {
      setRefreshing(false);
    }
  }, [sync]);

  const monthStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }, []);

  const liveNetWorth = useMemo(() => {
    if (bankProfiles.length > 0) {
      return bankProfiles.reduce((sum, bank) => sum + (Number(bank.currentBalance) || 0), 0);
    }
    if (snapshots.length > 0) {
      return snapshots[snapshots.length - 1].netWorth;
    }
    return 0;
  }, [bankProfiles, snapshots]);

  // Month-end snapshot from before this month, for the "since last month" pill
  const previousSnapshot = useMemo(() => {
    const past = snapshots.filter((s: any) => s.timestamp < monthStart);
    return past.length > 0 ? past[past.length - 1] : null;
  }, [snapshots, monthStart]);

  const netWorthHistory = useMemo(
    () => [...snapshots.map((s: any) => Number(s.netWorth) || 0), liveNetWorth],
    [snapshots, liveNetWorth]
  );

  const currentMonthExpenses = useMemo(() => {
    return transactions
      .filter((tx) => tx.timestamp >= monthStart && tx.type !== 'credit' && !isExcludedFromBudget(tx))
      .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount) || 0), 0);
  }, [transactions, monthStart]);

  // Top 4 categories this month, the rest grouped as "Others"
  const categories: DashboardCategory[] = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach((tx) => {
      if (tx.timestamp < monthStart || tx.type === 'credit' || isExcludedFromBudget(tx)) return;
      const key = (tx.category || 'other').toLowerCase().trim();
      map[key] = (map[key] || 0) + Math.abs(parseFloat(tx.amount) || 0);
    });

    const entries = Object.entries(map)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);

    const toLabel = (key: string) =>
      key === 'miscellaneous'
        ? 'Misc'
        : key.replace(/_/g, ' ').replace(/w/g, (c) => c.toUpperCase());

    const top = entries.slice(0, 4).map(([key, value], index) => ({
      key,
      label: toLabel(key),
      value,
      color: getSpendingCategoryColor(key, isDark, index),
    }));

    const rest = entries.slice(4);
    if (rest.length > 0) {
      top.push({
        key: 'others',
        label: 'Others',
        value: rest.reduce((s, [, v]) => s + v, 0),
        color: getSpendingCategoryColor('other', isDark, 4),
      });
    }
    return top;
  }, [transactions, monthStart, isDark]);

  const handleAddExpense = () => {
    if (bankProfiles.length > 0) {
      navigation.navigate('ManualTransaction', { bank: bankProfiles[0], initialType: 'debit' });
    } else {
      setAddBankModalVisible(true);
    }
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <HomeDashboard
        userName={user?.name}
        unreadCount={unreadCount}
        netWorth={liveNetWorth}
        netWorthHistory={netWorthHistory}
        previousNetWorth={previousSnapshot ? Number(previousSnapshot.netWorth) : null}
        previousMonthLabel={
          previousSnapshot
            ? new Date(previousSnapshot.timestamp).toLocaleDateString('en-IN', { month: 'long' })
            : undefined
        }
        income={incomeCurrentMonth}
        spent={currentMonthExpenses}
        transactions={transactions}
        categories={categories}
        hasBanks={bankProfiles.length > 0}
        smsTrackingOn={isSmsPermissionActive}
        refreshing={refreshing}
        bottomInset={insets.bottom}
        onRefresh={onRefresh}
        onOpenMenu={() => useSidebarStore.getState().openSidebar()}
        onOpenNotifications={() => setNotificationsVisible(true)}
        onOpenNetWorth={() => setNetWorthModalVisible(true)}
        onAddBank={() => setAddBankModalVisible(true)}
        onAddExpense={handleAddExpense}
        onOpenCalendar={() => navigation.navigate('FinancialCalendar', { userCreatedAt: user?.createdAt })}
        onOpenBudgets={() => navigation.navigate('Budgets')}
        onOpenGoals={() => navigation.navigate('Goals')}
        onOpenRegent={() => navigation.navigate('Regent')}
        onSetupTracking={() => navigation.navigate('AutoTrackingSetup')}
        onOpenTransaction={(tx) => navigation.navigate('TransactionDetail', { transaction: tx })}
      />

      <NotificationsModal
        visible={notificationsVisible}
        onClose={() => setNotificationsVisible(false)}
      />

      <AddBankModal
        visible={addBankModalVisible}
        onClose={() => setAddBankModalVisible(false)}
        onSuccess={async () => {
          setAddBankModalVisible(false);
          await sync();
        }}
      />

      <NetWorthDetailsModal
        visible={netWorthModalVisible}
        onClose={() => setNetWorthModalVisible(false)}
        snapshots={snapshots}
        liveNetWorth={liveNetWorth}
        loading={false}
      />
    </View>
  );
};

// ----------------------------------------------------
// 2. Regent AIbot Screen Component
// ----------------------------------------------------
const ChatScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { sync } = useSyncDb();
  const { width: windowWidth } = useWindowDimensions();

  const isSmall = windowWidth < 380;
  const navBarHeight = isSmall ? 58 : 64;
  const bottomOffset = Platform.OS === 'web'
    ? 18
    : Math.max(insets.bottom + (Platform.OS === 'ios' ? 4 : 8), 16);
  const navBarClearance = bottomOffset + navBarHeight;

  const chatHistory = useAIStore((state) => state.chatHistory);
  const addChatMessage = useAIStore((state) => state.addChatMessage);
  const clearChatHistory = useAIStore((state) => state.clearChatHistory);
  const isThinking = useAIStore((state) => state.isThinking);
  const setThinking = useAIStore((state) => state.setThinking);

  const user = useAuthStore((state) => state.user);
  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const goals = useGoalsStore((state) => state.goals);
  const transactions = useTransactionStore((state) => state.transactions);
  const budgets = useBudgetStore((state) => state.budgets);

  const [chatInput, setChatInput] = useState('');
  const [executiveGreeting, setExecutiveGreeting] = useState(() => getSessionGreeting(user?.name));

  useEffect(() => {
    if (user?.name) {
      setExecutiveGreeting(getSessionGreeting(user.name));
    }
  }, [user?.name]);

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const flatListRef = React.useRef<FlatList>(null);
  const inputRef = React.useRef<TextInput>(null);

  const handleCopyMessage = async (text: string, index: number) => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        await Clipboard.setStringAsync(text);
      }
      setCopiedIndex(index);
      setTimeout(() => {
        setCopiedIndex((prev) => (prev === index ? null : prev));
      }, 2000);
    } catch (err) {
      console.warn('Failed to copy message:', err);
    }
  };

  useKeyboardHandler(
    {
      onStart: (e) => {
        'worklet';
        runOnJS(setIsKeyboardVisible)(e.height > 0);
      },
      onEnd: (e) => {
        'worklet';
        runOnJS(setIsKeyboardVisible)(e.height > 0);
      },
    },
    []
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
      const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }
  }, []);

  useEffect(() => {
    if (isKeyboardVisible) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 80);
    }
  }, [isKeyboardVisible]);

  // Responsive bottom clearance:
  // - When keyboard is open: StandaloneBottomTabBar is hidden, and KeyboardAvoidingView handles the lift.
  //   Input bar only needs clean resting clearance (8px).
  // - When keyboard is closed: Input bar rests cleanly above the floating bottom tab bar (navBarClearance + 8).
  const dynamicBottomPadding = useMemo(() => {
    if (Platform.OS === 'web') {
      return navBarClearance + 8;
    }
    return isKeyboardVisible ? 8 : (navBarClearance + 8);
  }, [isKeyboardVisible, navBarClearance]);

  // Sync DB on screen focus
  useFocusEffect(
    useCallback(() => {
      sync();
    }, [sync])
  );

  const handleSendQuery = async (queryText?: string) => {
    const textToSend = (queryText || chatInput).trim();
    if (!textToSend || isThinking) return;

    setChatInput('');
    Keyboard.dismiss();

    addChatMessage({ role: 'user', content: textToSend });
    setThinking(true);

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // 1. User Profile Context
      const userProfileContext = {
        name: user?.name,
        email: user?.email,
        gender: user?.gender,
        dob: user?.dob,
        occupation: user?.occupation,
        currentIncome: user?.currentIncome ? Number(user.currentIncome) : undefined,
        incomeSourcesCount: user?.incomeSourcesCount,
      };

      // 2. Total Balance & Connected Accounts
      const totalBalance = bankProfiles.reduce((sum, b) => sum + (Number(b.currentBalance) || 0), 0);
      const accountsContext = bankProfiles.map((b) => ({
        bankName: b.bankName,
        accountType: 'Bank Account',
        balance: Number(b.currentBalance) || 0,
        accountNumberEnding: b.accountNumberSuffix || undefined,
      }));

      // 3. Savings Goals Context
      const goalsContext = goals.map((g) => ({
        name: g.name,
        target: Number(g.targetAmount) || 0,
        current: Number(g.currentAmount) || 0,
        targetDate: g.targetDate ? new Date(g.targetDate).toLocaleDateString('en-IN') : undefined,
      }));

      // 4. Budgets
      const budgetContext = budgets.map((b) => ({
        category: b.category,
        limit: Number(b.limitAmount) || 0,
        spent: Number(b.spentAmount) || 0,
      }));

      // 5. Recent Transactions
      const rawRecentTxs = transactions.slice(0, 15).map((t) => ({
        amount: Number(t.amount) || 0,
        category: t.category,
        merchant: t.merchant,
        timestamp: t.timestamp,
        type: (t.type === 'credit' ? 'credit' : 'debit') as 'credit' | 'debit',
      }));
      const recentTxs = sanitizeTransactions(rawRecentTxs);

      const context = {
        user: userProfileContext,
        totalBalance,
        accounts: accountsContext,
        savingsGoals: goalsContext,
        budgets: budgetContext,
        recentTransactions: recentTxs,
      };

      const response = await askChatbot(textToSend, chatHistory, context);
      addChatMessage({ role: 'assistant', content: response });
    } catch (e: any) {
      console.error(e);
      addChatMessage({
        role: 'assistant',
        content: 'Connection issue. Could not contact financial assistant.',
      });
    } finally {
      setThinking(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleClearChat = () => {
    showGlobalConfirm({
      title: 'Clear Chat History',
      message: 'Are you sure you want to clear your conversation with Regent AI?',
      confirmText: 'Clear Chat',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: () => {
        clearChatHistory();
      },
    });
  };

  const [activeSetIndex, setActiveSetIndex] = useState<number>(() => {
    const saved = mmkvStorage.getNumber('regent_active_prompt_set_idx');
    if (saved !== undefined && !isNaN(saved)) {
      return ((saved % EXECUTIVE_PROMPT_SETS.length) + EXECUTIVE_PROMPT_SETS.length) % EXECUTIVE_PROMPT_SETS.length;
    }
    return getWeeklySetIndex();
  });

  const activeSet = EXECUTIVE_PROMPT_SETS[activeSetIndex] || EXECUTIVE_PROMPT_SETS[0];
  const activeDeck = activeSet.cards;

  // Dynamic opening card on fresh open so every open or different user sees a new card
  const [cardIndex, setCardIndex] = useState<number>(() => getRandomCardIndex(11));
  const pan = React.useRef(new RNAnimated.ValueXY()).current;

  const cardRotate = pan.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: ['-8deg', '0deg', '8deg'],
    extrapolate: 'clamp',
  });

  const cardOpacity = pan.x.interpolate({
    inputRange: [-200, -100, 0, 100, 200],
    outputRange: [0.6, 0.9, 1, 0.9, 0.6],
    extrapolate: 'clamp',
  });

  const advanceToNextSet = useCallback(() => {
    pan.setValue({ x: 0, y: 0 });
    setActiveSetIndex((prev) => {
      const next = (prev + 1) % EXECUTIVE_PROMPT_SETS.length;
      mmkvStorage.setNumber('regent_active_prompt_set_idx', next);
      return next;
    });
    setCardIndex(0);
  }, [pan]);

  const restartCurrentSet = useCallback(() => {
    pan.setValue({ x: 0, y: 0 });
    setCardIndex(0);
  }, [pan]);

  const nextCard = useCallback(() => {
    pan.setValue({ x: 0, y: 0 });
    setCardIndex((prev) => (prev + 1) % (activeDeck.length + 1));
  }, [pan, activeDeck.length]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          return Math.abs(gesture.dx) > 10 && Math.abs(gesture.dy) < 30;
        },
        onPanResponderMove: (_, gesture) => {
          pan.setValue({ x: gesture.dx, y: 0 });
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -40) {
            RNAnimated.timing(pan, {
              toValue: { x: -350, y: 0 },
              duration: 180,
              useNativeDriver: false,
            }).start(() => nextCard());
          } else if (gesture.dx > 40) {
            RNAnimated.timing(pan, {
              toValue: { x: 350, y: 0 },
              duration: 180,
              useNativeDriver: false,
            }).start(() => nextCard());
          } else {
            RNAnimated.spring(pan, {
              toValue: { x: 0, y: 0 },
              friction: 6,
              useNativeDriver: false,
            }).start();
          }
        },
      }),
    [pan, nextCard]
  );

  const currentCard = activeDeck[cardIndex];
  const nextCard1 = cardIndex < activeDeck.length ? activeDeck[(cardIndex + 1) % activeDeck.length] : null;
  const nextCard2 = cardIndex < activeDeck.length ? activeDeck[(cardIndex + 2) % activeDeck.length] : null;

  return (
    <View style={[styles.container, { paddingTop: 0 }]}>
      <AppTopBar />

      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
      >
        {/* Minimalist Executive Header */}
        <View style={styles.chatHeaderRow}>
          <Text style={styles.headerTitle}>Regent AI</Text>

          {chatHistory.length > 0 && (
            <TouchableOpacity
              style={styles.chatResetBtn}
              onPress={handleClearChat}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="rotate-ccw" size={15} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Content Body: Empty State or Active Messages */}
        {chatHistory.length === 0 ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.welcomeScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Executive Greeting */}
            <View style={styles.welcomeHero}>
              <View style={styles.welcomeAvatar}>
                <Image
                  source={require('../../assets/tree.png')}
                  style={styles.welcomeAvatarImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.execGreetingTitle}>{executiveGreeting}</Text>
              {/* <Text style={styles.execGreetingSub}>
                Executive intelligence across your accounts, cash flow, and budgets.
              </Text> */}
            </View>

            {/* Stacked Card Deck (11 cards) or End-Of-Deck Card */}
            {cardIndex < activeDeck.length ? (
              <View style={{ width: '100%', alignItems: 'center' }}>
                <View style={styles.deckContainer}>
                  {/* 3rd Card Behind */}
                  {nextCard2 && (
                    <View
                      style={[
                        styles.deckCardBehind,
                        {
                          top: 18,
                          transform: [{ scale: 0.90 }],
                          opacity: 0.35,
                          zIndex: 1,
                        },
                      ]}
                    >
                      <View style={styles.suggestIconBox}>
                        <Feather name={nextCard2.icon as any} size={16} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestCategory} numberOfLines={1}>{nextCard2.title}</Text>
                        <Text style={styles.suggestPrompt} numberOfLines={1}>{nextCard2.query}</Text>
                      </View>
                    </View>
                  )}

                  {/* 2nd Card Behind */}
                  {nextCard1 && (
                    <View
                      style={[
                        styles.deckCardBehind,
                        {
                          top: 9,
                          transform: [{ scale: 0.95 }],
                          opacity: 0.65,
                          zIndex: 2,
                        },
                      ]}
                    >
                      <View style={styles.suggestIconBox}>
                        <Feather name={nextCard1.icon as any} size={16} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestCategory} numberOfLines={1}>{nextCard1.title}</Text>
                        <Text style={styles.suggestPrompt} numberOfLines={1}>{nextCard1.query}</Text>
                      </View>
                    </View>
                  )}

                  {/* Active Front Card (Swipeable) */}
                  <RNAnimated.View
                    style={[
                      styles.deckCardFront,
                      {
                        transform: [{ translateX: pan.x }, { rotate: cardRotate }],
                        opacity: cardOpacity,
                        zIndex: 5,
                      },
                    ]}
                    {...panResponder.panHandlers}
                  >
                    <TouchableOpacity
                      style={styles.cardInnerTouchable}
                      onPress={() => handleSendQuery(currentCard.query)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.suggestIconBox}>
                        <Feather name={currentCard.icon as any} size={16} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestCategory}>{currentCard.title}</Text>
                        <Text style={styles.suggestPrompt}>{currentCard.query}</Text>
                      </View>
                      <Feather name="arrow-up-right" size={16} color={colors.accent} style={{ marginLeft: 8 }} />
                    </TouchableOpacity>
                  </RNAnimated.View>
                </View>

                <Text style={styles.deckSwipeHint}>
                  Swipe for next card • Set {activeSetIndex + 1} of 11 ({activeSet.badge})
                </Text>
              </View>
            ) : (
              /* End of Suggestions State */
              <View style={styles.endDeckCard}>
                <View style={styles.endIconCircle}>
                  <Feather name="check" size={20} color={colors.accent} />
                </View>
                <Text style={styles.endTitle}>Set {activeSetIndex + 1} Explored ({activeSet.badge})</Text>
                <Text style={styles.endSub}>
                  You've viewed all 11 prompts in "{activeSet.category}". Tap Next Set to explore more, or replay this set.
                </Text>
                <View style={styles.endActionRow}>
                  <TouchableOpacity
                    style={styles.endBtnPrimary}
                    onPress={advanceToNextSet}
                    activeOpacity={0.8}
                  >
                    <Feather name="arrow-right" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.endBtnPrimaryText}>Next Set (Set {((activeSetIndex + 1) % 11) + 1}/11)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.endBtnSecondary}
                    onPress={restartCurrentSet}
                    activeOpacity={0.8}
                  >
                    <Feather name="rotate-ccw" size={14} color={colors.text} style={{ marginRight: 6 }} />
                    <Text style={styles.endBtnSecondaryText}>Start Over</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            data={chatHistory}
            keyExtractor={(_, index) => index.toString()}
            contentContainerStyle={styles.chatList}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={Keyboard.dismiss}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item, index }) => {
              const isUser = item.role === 'user';
              return (
                <View style={{ flexDirection: 'row', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
                  {!isUser && (
                    <View style={styles.chatAvatarBadge}>
                      <Image
                        source={require('../../assets/tree.png')}
                        style={styles.chatAvatarImg}
                        resizeMode="contain"
                      />
                    </View>
                  )}
                  <View
                    style={[
                      styles.chatBubble,
                      isUser ? styles.userBubble : styles.botBubble,
                    ]}
                  >
                    <FormattedChatMessage
                      content={item.content}
                      isUser={isUser}
                      colors={colors}
                      isDark={isDark}
                    />

                    {/* Copy message button with feedback icon */}
                    <View style={[styles.copyRow, isUser ? styles.copyRowUser : styles.copyRowBot]}>
                      <TouchableOpacity
                        onPress={() => handleCopyMessage(item.content, index)}
                        style={[
                          styles.copyBtn,
                          isUser ? styles.copyBtnUser : styles.copyBtnBot,
                          copiedIndex === index && styles.copyBtnSuccess,
                        ]}
                        activeOpacity={0.7}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons
                          name={copiedIndex === index ? 'checkmark-circle' : 'copy-outline'}
                          size={12}
                          color={
                            copiedIndex === index
                              ? '#10B981'
                              : isUser
                                ? (colors.isDark ? '#6ee7b7' : '#047857')
                                : colors.textSecondary
                          }
                        />
                        <Text
                          style={[
                            styles.copyBtnText,
                            {
                              color:
                                copiedIndex === index
                                  ? '#10B981'
                                  : isUser
                                    ? (colors.isDark ? '#6ee7b7' : '#047857')
                                    : colors.textSecondary,
                            },
                          ]}
                        >
                          {copiedIndex === index ? 'Copied' : 'Copy'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Typing Indicator */}
        {isThinking && <TypingIndicator />}

        {/* Clean Input Bar */}
        <View
          style={[
            styles.inputArea,
            { paddingBottom: dynamicBottomPadding },
          ]}
        >
          <View style={styles.inputAreaRow}>
            <TextInput
              ref={inputRef}
              style={styles.chatTextInput}
              placeholder="Ask Regent AI..."
              placeholderTextColor="#8E8E9F"
              value={chatInput}
              onChangeText={setChatInput}
              editable={!isThinking}
              returnKeyType="send"
              onSubmitEditing={() => handleSendQuery()}
              onFocus={() => {
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
              }}
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!chatInput.trim() || isThinking) && styles.sendBtnDisabled,
              ]}
              onPress={() => handleSendQuery()}
              disabled={!chatInput.trim() || isThinking}
              activeOpacity={0.8}
            >
              {isThinking ? (
                <ActivityIndicator size="small" color="#24292e" />
              ) : (
                <Feather
                  name="send"
                  size={18}
                  color={!chatInput.trim() ? colors.textSecondary : '#24292e'}
                />
              )}
            </TouchableOpacity>
          </View>

          {/* AI Disclaimer below search bar */}
          <Text style={styles.aiDisclaimerText}>
            Regent can make mistakes. Please check info.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

// ----------------------------------------------------
// 3. Goals Screen Component
// ----------------------------------------------------
const GoalsTabScreen = () => <GoalsScreen AppTopBarComponent={AppTopBar} />;

// ----------------------------------------------------
// 3b. Budgets Screen Component
// ----------------------------------------------------
const BudgetTabScreen = () => <BudgetScreen AppTopBarComponent={AppTopBar} />;

const BudgetStackScreen = ({ navigation }: any) => {
  useEffect(() => {
    navigation.replace('Main', { screen: 'Budgets' });
  }, [navigation]);
  return <BudgetScreen AppTopBarComponent={AppTopBar} />;
};

const CreateBudgetStackScreen = () => <CreateBudgetScreen AppTopBarComponent={AppTopBar} />;


// ----------------------------------------------------
// 4. Settings Screen Component
// ----------------------------------------------------
const TabProfileScreen = () => <ProfileScreen AppTopBarComponent={AppTopBar} />;



// ----------------------------------------------------
// Navigators & Navigation Container
// ----------------------------------------------------
const Tab = createMaterialTopTabNavigator();
const Stack = createNativeStackNavigator();

interface TabItemConfig {
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  size?: number;
}

const TAB_CONFIG: { [key: string]: TabItemConfig } = {
  Home: {
    label: 'Home',
    activeIcon: 'home',
    inactiveIcon: 'home-outline',
    size: 20,
  },
  Budgets: {
    label: 'Budgets',
    activeIcon: 'pie-chart',
    inactiveIcon: 'pie-chart-outline',
    size: 19,
  },
  Goals: {
    label: 'Goals',
    activeIcon: 'trophy',
    inactiveIcon: 'trophy-outline',
    size: 19,
  },
  Banks: {
    label: 'Banks',
    activeIcon: 'wallet',
    inactiveIcon: 'wallet-outline',
    size: 20,
  },
  'Regent': {
    label: 'Regent',
    activeIcon: 'sparkles',
    inactiveIcon: 'sparkles-outline',
    size: 20,
  },
  Settings: {
    label: 'Profile',
    activeIcon: 'person',
    inactiveIcon: 'person-outline',
    size: 20,
  },
};

const NAV_FOREST = '#0B3D2C';
const NAV_LIME = '#B8F36B';

const CustomTabButton = ({
  route,
  isFocused,
  onPress,
  onLongPress,
  isSmall,
  isDark,
  activeWidth,
  inactiveWidth,
}: {
  route: any;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  isSmall: boolean;
  isDark: boolean;
  activeWidth: number;
  inactiveWidth: number;
}) => {
  const user = useAuthStore((state) => state.user);

  const config = TAB_CONFIG[route.name] || {
    label: route.name,
    activeIcon: 'apps' as const,
    inactiveIcon: 'apps-outline' as const,
    size: 20,
  };

  const iconSize = isSmall ? 18 : 20;
  const activeBg = isDark ? NAV_LIME : NAV_FOREST;
  const activeFg = isDark ? NAV_FOREST : NAV_LIME;
  const inactiveFg = isDark ? 'rgba(234, 242, 238, 0.62)' : '#4F6159';
  const showAvatar = route.name === 'Settings' && !!user?.avatarUrl;

  // Fluid transition progress: 0 (inactive) -> 1 (active)
  const focusAnim = useSharedValue(isFocused ? 1 : 0);
  const scale = useSharedValue(1);

  useEffect(() => {
    focusAnim.value = withTiming(isFocused ? 1 : 0, {
      duration: 220,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    });
  }, [isFocused]);

  // Synchronized slot expansion/contraction: gained width equals lost width at every frame
  const slotStyle = useAnimatedStyle(() => {
    const w = interpolate(focusAnim.value, [0, 1], [inactiveWidth, activeWidth]);
    return {
      width: w,
      height: '100%',
    };
  });

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // Background pill blooms and fades seamlessly
  const pillBgStyle = useAnimatedStyle(() => ({
    opacity: focusAnim.value,
    transform: [{ scale: interpolate(focusAnim.value, [0, 1], [0.88, 1]) }],
  }));

  // Label smoothly unrolls and fades in without harsh clipping
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(focusAnim.value, [0.35, 1], [0, 1]),
    maxWidth: interpolate(focusAnim.value, [0, 1], [0, 76]),
    transform: [{ translateX: interpolate(focusAnim.value, [0, 1], [4, 0]) }],
  }));

  // Smooth cross-fade between active (filled) and inactive (outline) icons
  const activeIconStyle = useAnimatedStyle(() => ({
    opacity: focusAnim.value,
  }));

  const inactiveIconStyle = useAnimatedStyle(() => ({
    opacity: 1 - focusAnim.value,
  }));

  return (
    <Animated.View style={[{ height: '100%' }, slotStyle]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => {
          scale.value = withSpring(0.92, { damping: 14, stiffness: 300 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 14, stiffness: 300 });
        }}
        style={[
          {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          },
          Platform.OS === 'web' && ({ cursor: 'pointer', outlineStyle: 'none' } as any),
        ]}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={config.label}
      >
        <Animated.View
          style={[
            {
              width: '100%',
              height: isSmall ? 46 : 52,
              borderRadius: 26,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 8,
              position: 'relative',
              overflow: 'hidden',
            },
            pressStyle,
          ]}
        >
          {/* Active pill background */}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                borderRadius: 26,
                backgroundColor: activeBg,
              },
              pillBgStyle,
            ]}
          />

          {/* Icon with cross-fade */}
          <View style={{ width: iconSize + 4, height: iconSize + 4, alignItems: 'center', justifyContent: 'center' }}>
            {showAvatar ? (
              <Image
                source={{ uri: user?.avatarUrl || undefined }}
                style={{
                  width: iconSize + 4,
                  height: iconSize + 4,
                  borderRadius: (iconSize + 4) / 2,
                  borderWidth: 1.5,
                  borderColor: isFocused ? activeFg : 'transparent',
                }}
                resizeMode="cover"
              />
            ) : (
              <>
                <Animated.View style={[{ position: 'absolute' }, activeIconStyle]}>
                  <Ionicons name={config.activeIcon} size={iconSize} color={activeFg} />
                </Animated.View>
                <Animated.View style={[{ position: 'absolute' }, inactiveIconStyle]}>
                  <Ionicons name={config.inactiveIcon} size={iconSize} color={inactiveFg} />
                </Animated.View>
              </>
            )}
          </View>

          {/* Label: smoothly unrolls & fades in */}
          <Animated.View
            style={[
              {
                overflow: 'hidden',
                marginLeft: 4,
                justifyContent: 'center',
              },
              labelStyle,
            ]}
          >
            <Text
              numberOfLines={1}
              style={{
                color: activeFg,
                fontSize: isSmall ? 12 : 13,
                fontWeight: '700',
              }}
            >
              {config.label}
            </Text>
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
};

const CustomBottomTabBar = ({ state, navigation }: MaterialTopTabBarProps) => {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [measuredWidth, setMeasuredWidth] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const isSmall = windowWidth < 380;
  const barMarginHorizontal = isSmall ? 10 : 14;
  const maxBarWidth = 460;
  const availableWidth = measuredWidth > 0 ? measuredWidth : windowWidth;
  const barWidth = Math.min(availableWidth - barMarginHorizontal * 2, maxBarWidth);

  const BAR_PADDING = 6;
  const BORDER = 1;
  const innerWidth = barWidth - BAR_PADDING * 2 - BORDER * 2;
  const tabCount = state.routes.length;
  const activeWidth = Math.min(isSmall ? 98 : 110, innerWidth * 0.34);
  const inactiveWidth = (innerWidth - activeWidth) / Math.max(tabCount - 1, 1);

  const bottomOffset = Platform.OS === 'web'
    ? 18
    : Math.max(insets.bottom + (Platform.OS === 'ios' ? 4 : 8), 16);

  return (
    <View
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w > 0 && Math.abs(w - measuredWidth) > 4) {
          setMeasuredWidth(w);
        }
      }}
      style={{
        pointerEvents: isKeyboardVisible ? 'none' : (Platform.OS === 'web' ? 'auto' : 'box-none'),
        position: 'absolute',
        bottom: bottomOffset,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 1000,
        opacity: isKeyboardVisible ? 0 : 1,
        transform: [{ translateY: isKeyboardVisible ? 120 : 0 }],
      }}
    >
      <View
        style={{
          width: barWidth,
          height: isSmall ? 58 : 64,
          borderRadius: 32,
          backgroundColor: isDark ? '#0F1E18' : '#FFFFFF',
          borderWidth: BORDER,
          borderColor: isDark ? '#1E3329' : '#DCE5E0',
          flexDirection: 'row',
          alignItems: 'center',
          padding: BAR_PADDING,
          shadowColor: '#0B1F17',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.4 : 0.1,
          shadowRadius: 20,
          elevation: 8,
        }}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;

          const onPress = () => {
            if (Platform.OS === 'web' && typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
              try {
                document.activeElement.blur();
              } catch { }
            }

            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <CustomTabButton
              key={route.key}
              route={route}
              isFocused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
              isSmall={isSmall}
              isDark={isDark}
              activeWidth={activeWidth}
              inactiveWidth={inactiveWidth}
            />
          );
        })}
      </View>
    </View>
  );
};

function TabNavigator() {
  return (
    <Tab.Navigator
      tabBarPosition="bottom"
      backBehavior="history"
      tabBar={(props) => <CustomBottomTabBar {...props} />}
      screenOptions={{
        swipeEnabled: false,
        lazy: true,
        lazyPreloadDistance: 1,
        animationEnabled: false,
      }}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Budgets" component={BudgetTabScreen} />
      <Tab.Screen name="Goals" component={GoalsTabScreen} />
      <Tab.Screen name="Banks">
        {() => <BanksScreen AppTopBarComponent={AppTopBar} />}
      </Tab.Screen>
      <Tab.Screen name="Regent" component={RegentChatScreen} />
      <Tab.Screen name="Settings" component={TabProfileScreen} />
    </Tab.Navigator>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0d1117', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Feather name="alert-triangle" size={48} color="#f85149" style={{ marginBottom: 16 }} />
          <Text style={{ color: '#fafbfc', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ color: 'rgba(250, 251, 252, 0.6)', fontSize: 12, textAlign: 'center', marginBottom: 20 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#2dba4e', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 }}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ----------------------------------------------------
// Global Custom Yes/No Confirmation Dialog Component
// ----------------------------------------------------
const CONFIRM_FOREST = '#0B3D2C';
const CONFIRM_LIME = '#B8F36B';
const CONFIRM_RED = '#E03131';

// Picks a sensible icon when the caller didn't pass one
const inferConfirmIcon = (options: any): keyof typeof Feather.glyphMap => {
  const text = `${options?.confirmText || ''} ${options?.title || ''}`.toLowerCase();
  if (text.includes('log out') || text.includes('logout') || text.includes('sign out')) return 'log-out';
  if (options?.icon) return options.icon;
  if (text.includes('delete') || text.includes('remove') || text.includes('clear')) return 'trash-2';
  return options?.isDestructive ? 'alert-triangle' : 'info';
};

const GlobalConfirmModal = () => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const visible = useConfirmStore((state) => state.visible);
  const options = useConfirmStore((state) => state.options);
  const loading = useConfirmStore((state) => state.loading);
  const hideConfirm = useConfirmStore((state) => state.hideConfirm);
  const setLoading = useConfirmStore((state) => state.setLoading);

  const [mounted, setMounted] = useState(false);
  const progress = useSharedValue(0);
  const afterCloseRef = useRef<(() => void) | null>(null);
  const closingRef = useRef(false);

  const isWide = width >= 600;

  useEffect(() => {
    if (visible && options) {
      closingRef.current = false;
      setMounted(true);
      progress.value = 0;
      progress.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    } else if (!visible && mounted && !closingRef.current) {
      setMounted(false);
    }
  }, [visible, options]);

  const finishClose = () => {
    setMounted(false);
    hideConfirm();
    const after = afterCloseRef.current;
    afterCloseRef.current = null;
    after?.();
  };

  const animateClose = (after?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    afterCloseRef.current = after || null;
    progress.value = withTiming(0, { duration: 200, easing: Easing.in(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() =>
    isWide
      ? { opacity: progress.value, transform: [{ scale: 0.96 + progress.value * 0.04 }] }
      : { transform: [{ translateY: (1 - progress.value) * 420 }] }
  );

  if (!mounted || !options) return null;

  const isDestructive = !!options.isDestructive;
  const hasCancel = !!options.cancelText;
  const icon = inferConfirmIcon(options);
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const tileBg = isDestructive
    ? isDark ? 'rgba(224, 49, 49, 0.2)' : '#FFE3E3'
    : isDark ? 'rgba(184, 243, 107, 0.14)' : '#E3F2E8';
  const tileFg = isDestructive ? (isDark ? '#FFA8A8' : '#C92A2A') : isDark ? CONFIRM_LIME : CONFIRM_FOREST;

  const primaryBg = isDestructive ? CONFIRM_RED : isDark ? CONFIRM_LIME : CONFIRM_FOREST;
  const primaryFg = isDestructive ? '#FFFFFF' : isDark ? CONFIRM_FOREST : CONFIRM_LIME;

  const handleCancel = () => {
    if (loading) return;
    animateClose(options.onCancel);
  };

  const handleConfirm = async () => {
    if (loading) return;
    if (!options.onConfirm) {
      animateClose();
      return;
    }
    setLoading(true);
    try {
      await options.onConfirm();
    } catch (e: any) {
      console.warn('[Confirm] Error executing action:', e?.message || e);
    } finally {
      animateClose();
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleCancel}
    >
      <View style={{ flex: 1, justifyContent: isWide ? 'center' : 'flex-end', alignItems: 'center' }}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(7, 17, 13, 0.55)' }, backdropStyle]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleCancel}
            accessibilityLabel={options.cancelText || 'Close'}
          />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          style={[
            {
              width: isWide ? '90%' : '100%',
              maxWidth: isWide ? 420 : 640,
              backgroundColor: colors.card,
              paddingHorizontal: 24,
              paddingTop: isWide ? 24 : 10,
              paddingBottom: isWide ? 24 : Math.max(insets.bottom, 16) + 14,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderBottomLeftRadius: isWide ? 28 : 0,
              borderBottomRightRadius: isWide ? 28 : 0,
            },
            sheetStyle,
          ]}
        >
          {!isWide && (
            <View
              style={{
                width: 40,
                height: 5,
                borderRadius: 3,
                alignSelf: 'center',
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.18)' : '#D5DED9',
                marginBottom: 22,
              }}
            />
          )}

          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: 17,
              backgroundColor: tileBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name={icon} size={23} color={tileFg} />
          </View>

          {!!options.title && (
            <Text
              accessibilityRole="header"
              style={{
                fontSize: 24,
                color: colors.text,
                marginTop: 18,
                letterSpacing: -0.5,
                fontFamily: display,
                fontWeight: display ? undefined : '800',
              }}
            >
              {options.title}
            </Text>
          )}

          {!!options.message && (
            <Text style={{ fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginTop: 8 }}>
              {options.message}
            </Text>
          )}

          <View style={{ gap: 10, marginTop: 26 }}>
            <TouchableOpacity
              onPress={handleConfirm}
              activeOpacity={0.85}
              disabled={loading}
              accessibilityRole="button"
              style={{
                height: 54,
                borderRadius: 27,
                backgroundColor: primaryBg,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.85 : 1,
              }}
            >
              {loading ? (
                <ActivityIndicator size="small" color={primaryFg} />
              ) : (
                <Text style={{ color: primaryFg, fontSize: 15, fontWeight: '700' }}>
                  {options.confirmText || 'OK'}
                </Text>
              )}
            </TouchableOpacity>

            {hasCancel && (
              <TouchableOpacity
                onPress={handleCancel}
                activeOpacity={0.75}
                disabled={loading}
                accessibilityRole="button"
                style={{
                  height: 54,
                  borderRadius: 27,
                  borderWidth: 1,
                  borderColor: isDark ? colors.border : '#DCE5E0',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{options.cancelText}</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default function AppNavigator() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const { colors, isDark } = useTheme();

  const [splashFinished, setSplashFinished] = useState(false);
  const hasSeenOnboarding = mmkvStorage.getBoolean('has_seen_onboarding_v1') ?? false;
  const hasSetupTracking = mmkvStorage.getBoolean(TRACKING_SETUP_KEY) ?? false;

  const updateInfo = useAppUpdateStore((state) => state.updateInfo);
  const updateModalVisible = useAppUpdateStore((state) => state.updateModalVisible);
  const setUpdateInfo = useAppUpdateStore((state) => state.setUpdateInfo);
  const setUpdateModalVisible = useAppUpdateStore((state) => state.setUpdateModalVisible);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [smsModalVisible, setSmsModalVisible] = useState(false);

  const termsModalState = useTermsModalStore();
  const privacyModalState = usePrivacyModalStore();
  const isTermsAccepted = Boolean(user?.termsAccepted);
  const showMandatoryTerms = Boolean(user && !isTermsAccepted && splashFinished && !isLoading);
  const showTermsModal = showMandatoryTerms || termsModalState.isOpen;
  const isReadOnlyTerms = !showMandatoryTerms;

  useEffect(() => {
    if (!splashFinished || isLoading || !user || !user.termsAccepted || Platform.OS === 'web' || user.role === 'admin' || user.role === 'superadmin') return;

    const syncGrantedPermissions = async () => {
      try {
        // If notification permission was already granted previously, register push token silently
        const isNotificationGranted = await notificationService.isPermissionGranted();
        if (isNotificationGranted) {
          await notificationService.registerForPushNotifications();
        }
      } catch (e) {
        // Silent fail
      }
    };

    syncGrantedPermissions();
  }, [splashFinished, isLoading, user]);

  useEffect(() => {
    let isMounted = true;
    const checkUpdates = async () => {
      try {
        const info = await updateService.checkForUpdates();
        if (isMounted && info && info.isUpdateAvailable) {
          setUpdateInfo(info);
          setUpdateModalVisible(true);
        }
      } catch (e) {
        // Silent fail
      }
    };
    const timer = setTimeout(checkUpdates, 2000);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const initAndCheck = async () => {
      await mmkvStorage.initialize();
      await rehydrateAllStores();
      // Restore persisted theme after MMKV async fallback loads
      await useThemeStore.getState().rehydrateTheme();
      await authService.checkSession();
      // Sync notifications with backend
      notificationService.fetchNotifications().catch(() => { });
      // Auto-scan recent SMS on Android once session and stores are completely hydrated (only for consumer users)
      if (Platform.OS === 'android') {
        setTimeout(() => {
          const currentUser = useAuthStore.getState().user;
          if (currentUser?.role === 'admin' || currentUser?.role === 'superadmin') return;
          const dynamicHours = smsCatchupService.getDynamicStartupLookback();
          smsCatchupService.reconcile(false, dynamicHours).catch((err) => {
            console.warn('[AppRoot] Initial SMS catchup notice:', err);
          });
        }, 1500);
      }
    };
    initAndCheck();
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const {
        biometricsEnabled,
        autoLockTimeout,
        lastBackgroundTimestamp,
        setLastBackgroundTimestamp,
        setLocked,
        isLocked,
      } = useSecurityStore.getState();

      if (nextAppState === 'active') {
        const currentUser = useAuthStore.getState().user;
        if (currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin') {
          // Automatic catch-up scan dynamically calculated from last active time
          const dynamicHours = smsCatchupService.getDynamicStartupLookback();
          smsCatchupService.reconcile(false, dynamicHours).catch(() => { });
        }
      }

      if (!biometricsEnabled) return;

      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (!lastBackgroundTimestamp) {
          setLastBackgroundTimestamp(Date.now());
        }
      } else if (nextAppState === 'active') {
        const storedLastBg = lastBackgroundTimestamp || mmkvStorage.getNumber('security_last_bg_time');
        if (storedLastBg && !isLocked) {
          const elapsedMs = Date.now() - storedLastBg;
          const timeoutMs = autoLockTimeout * 60 * 1000;
          if (elapsedMs >= timeoutMs) {
            setLocked(true);
          }
        }
        setLastBackgroundTimestamp(null);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  if (isLoading && splashFinished) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style={colors.statusBar} />
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  const navTheme = {
    dark: isDark,
    colors: {
      primary: colors.accent,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      notification: colors.accent,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' as const },
      medium: { fontFamily: 'System', fontWeight: '500' as const },
      bold: { fontFamily: 'System', fontWeight: '700' as const },
      heavy: { fontFamily: 'System', fontWeight: '800' as const },
    },
  };

  return (
    <SafeAreaProvider>
      <StatusBar style={colors.statusBar} />
      <ErrorBoundary>
        {!isLoading && (
          <NavigationContainer ref={navigationRef} theme={navTheme}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              {user === null ? (
                <>
                  {!hasSeenOnboarding ? (
                    <>
                      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                      <Stack.Screen name="Welcome" component={WelcomeScreen} />
                      <Stack.Screen name="AuthLanding" component={AuthLandingScreen} />
                    </>
                  ) : (
                    <>
                      <Stack.Screen name="AuthLanding" component={AuthLandingScreen} />
                      <Stack.Screen name="Welcome" component={WelcomeScreen} />
                      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                    </>
                  )}
                  <Stack.Screen name="Login" component={LoginScreen} />
                  <Stack.Screen name="Signup" component={SignupScreen} />
                </>
              ) : user?.role === 'admin' || user?.role === 'superadmin' ? (
                <>
                  <Stack.Screen name="Main" component={AdminTabNavigator} />
                  <Stack.Screen name="AdminMain" component={AdminTabNavigator} />
                  <Stack.Screen
                    name="AdminDashboard"
                    component={AdminDashboardScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="EditProfile"
                    component={EditProfileScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_bottom',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="AppSettings"
                    component={SettingsScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="PrivacyCenter"
                    component={PrivacyCenterScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                </>
              ) : (
                <>
                  {!hasSetupTracking && Platform.OS === 'android' ? (
                    <>
                      <Stack.Screen name="AutoTrackingSetup" component={AutoTrackingSetupScreen} />
                      <Stack.Screen name="Main" component={TabNavigator} />
                    </>
                  ) : (
                    <>
                      <Stack.Screen name="Main" component={TabNavigator} />
                      <Stack.Screen name="AutoTrackingSetup" component={AutoTrackingSetupScreen} />
                    </>
                  )}
                  <Stack.Screen
                    name="EditProfile"
                    component={EditProfileScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_bottom',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="EditBank"
                    component={EditBankScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_bottom',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="ManualTransaction"
                    component={ManualTransactionScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_bottom',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="TransactionDetail"
                    component={TransactionDetailScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_bottom',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="AppSettings"
                    component={SettingsScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="AdminDashboard"
                    component={AdminDashboardScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="PrivacyCenter"
                    component={PrivacyCenterScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="SuggestFeature"
                    component={SuggestFeatureScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="ReportBug"
                    component={ReportBugScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="BudgetScreen"
                    component={BudgetStackScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="CreateBudget"
                    component={CreateBudgetStackScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_bottom',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="FinancialCalendar"
                    component={FinancialCalendarScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_bottom',
                      headerShown: false,
                    }}
                  />
                </>
              )}
            </Stack.Navigator>
          </NavigationContainer>
        )}
        <GlobalConfirmModal />
        <BiometricLockOverlay />
        <AppSidebarDrawer />
        <UpdateModal
          updateInfo={updateInfo}
          visible={updateModalVisible}
          onDismiss={() => setUpdateModalVisible(false)}
        />
        <TermsAndConditionsModal
          visible={showTermsModal}
          readOnly={isReadOnlyTerms}
          onDismiss={() => termsModalState.closeTermsModal()}
        />
        <PrivacyPolicyModal
          visible={privacyModalState.isOpen}
          onDismiss={() => privacyModalState.closePrivacyModal()}
        />
        <NotificationPermissionModal
          visible={notificationModalVisible}
          onDismiss={() => setNotificationModalVisible(false)}
        />
        <SmsPermissionModal
          visible={smsModalVisible}
          onDismiss={() => setSmsModalVisible(false)}
          onGranted={() => setSmsModalVisible(false)}
        />
        {!splashFinished && (
          <AppSplashScreen onFinish={() => setSplashFinished(true)} />
        )}
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

// ----------------------------------------------------
// Stylesheet Definitions
// ----------------------------------------------------
const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingHorizontal: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  topBarContainer: {
    backgroundColor: colors.isDark ? colors.card : '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.isDark ? colors.border : '#E1E9E4',
    zIndex: 10,
  },
  topBarContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    minHeight: 50,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarLogoBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B3D2C',
  },
  topBarLogoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  topBarBrandCol: {
    marginLeft: 10,
    justifyContent: 'center',
  },
  savingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.isDark ? 'rgba(45, 186, 78, 0.25)' : 'rgba(22, 163, 74, 0.25)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    marginTop: 1,
    alignSelf: 'flex-start',
  },
  savingPulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
    marginRight: 4,
  },
  savingPillText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0.8,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarAlertBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.isDark ? 'rgba(255, 82, 82, 0.12)' : 'rgba(255, 82, 82, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  topBarIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.isDark ? colors.border : '#DCE5E0',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  topBarBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF5252',
    borderRadius: 7,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarBadgeText: {
    color: '#ffffff',
    fontSize: 8.5,
    fontWeight: '800',
  },
  topBarProfileBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(45, 186, 78, 0.08)',
    borderWidth: 1.5,
    borderColor: '#2dba4e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarProfileInitial: {
    color: '#2dba4e',
    fontWeight: '800',
    fontSize: 13,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLogoBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  headerLogoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 1,
  },
  headerTitleSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 2,
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF5252',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  neonCard: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardHalf: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    width: '48%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  cardBigNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.text,
    marginTop: 8,
  },
  cardBigNumberSmall: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginTop: 6,
  },
  cardFooter: {
    fontSize: 11,
    color: colors.accent,
    marginTop: 8,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    width: '100%',
    marginTop: 8,
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalPercentage: {
    color: colors.accent,
    fontWeight: '800',
  },
  goalTargetText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  settingDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
  },
  buttonText: {
    color: colors.buttonSecondaryText,
    fontWeight: '800',
    fontSize: 14,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  settingLabel: {
    color: colors.text,
    fontSize: 14,
  },
  filterWrapper: {
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterTabText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterTabTextActive: {
    color: colors.buttonSecondaryText,
  },
  donutCardContainer: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  donutLegend: {
    flex: 1,
    marginLeft: 24,
    justifyContent: 'center',
    minWidth: 0,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    minWidth: 0,
  },
  legendIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
    flexShrink: 0,
  },
  legendTextWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  legendCategoryText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
  legendAmountText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 0,
    marginLeft: 4,
  },
  txItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 14,
  },
  txIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  txMeta: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  merchantName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  txDate: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  txRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexShrink: 0,
  },
  txAmount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  anomalyBadge: {
    backgroundColor: colors.buttonSecondaryBackground,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  anomalyText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  chatResetBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeScroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    paddingBottom: 24,
  },
  welcomeHero: {
    alignItems: 'center',
    marginBottom: 24,
  },
  welcomeAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'transparent',
    borderWidth: 1.2,
    borderColor: colors.isDark ? 'rgba(45, 186, 78, 0.35)' : 'rgba(45, 186, 78, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: colors.isDark ? 0.3 : 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  welcomeAvatarImage: {
    width: 48,
    height: 48,
    transform: [{ scale: 1.25 }],
  },
  execGreetingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.isDark ? '#e2e8f0' : '#475569',
    letterSpacing: -0.2,
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 24,
  },
  execGreetingSub: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    maxWidth: 340,
    textAlign: 'center',
  },
  deckContainer: {
    width: '100%',
    height: 122,
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
    marginTop: 6,
  },
  deckCardBehind: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 104,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deckCardFront: {
    width: '100%',
    height: 104,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: colors.isDark ? 'rgba(45, 186, 78, 0.4)' : 'rgba(22, 163, 74, 0.3)',
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: colors.isDark ? 0.35 : 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  cardInnerTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  suggestIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(45, 186, 78, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  suggestCategory: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  suggestPrompt: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  deckControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 18,
  },
  deckArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deckPaginationBadge: {
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deckPaginationText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  deckSwipeHint: {
    fontSize: 11,
    color: colors.textTertiary || '#8E8E9F',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  endDeckCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  endIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(45, 186, 78, 0.08)',
    borderWidth: 1,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  endTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  endSub: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
    maxWidth: 280,
  },
  endActionRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  endBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 10,
    borderRadius: 12,
  },
  endBtnPrimaryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  endBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    borderRadius: 12,
  },
  endBtnSecondaryText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  chatList: {
    padding: 16,
    paddingBottom: 20,
  },
  chatAvatarBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'transparent',
    borderWidth: 1.2,
    borderColor: colors.isDark ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  chatAvatarImg: {
    width: 28,
    height: 28,
    transform: [{ scale: 1.15 }],
  },
  chatBubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '86%',
  },
  copyRow: {
    flexDirection: 'row',
    marginTop: 6,
    paddingTop: 2,
  },
  copyRowUser: {
    justifyContent: 'flex-end',
  },
  copyRowBot: {
    justifyContent: 'flex-start',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  copyBtnUser: {
    backgroundColor: colors.isDark ? 'rgba(0, 0, 0, 0.25)' : 'rgba(16, 185, 129, 0.15)',
  },
  copyBtnBot: {
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
  },
  copyBtnSuccess: {
    backgroundColor: colors.isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.15)',
  },
  copyBtnText: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  userBubble: {
    backgroundColor: colors.isDark ? '#1b3b27' : '#dcfce7',
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: colors.card,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  chatText: {
    fontSize: 14,
    lineHeight: 21,
  },
  userChatText: {
    color: colors.text,
    fontWeight: '500',
  },
  botChatText: {
    color: colors.text,
  },
  inputArea: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputAreaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiDisclaimerText: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 2,
    letterSpacing: 0.1,
  },
  chatTextInput: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 44,
    maxHeight: 90,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendBtnDisabled: {
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginRight: 4,
  },
  sliderControl: {
    marginBottom: 14,
  },
  sliderLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  sliderRow: {
    flexDirection: 'row',
  },
  sliderBtn: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  sliderBtnText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  simResults: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  simResultBox: {
    alignItems: 'center',
    width: '32%',
  },
  simResultLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  simResultVal: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  keyInputSection: {
    marginTop: 12,
  },
  keyLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  settingsInput: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  saveBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  bankAlertBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.isDark ? 'rgba(255, 82, 82, 0.1)' : 'rgba(255, 82, 82, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badgePulseDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5252',
  },
  bankNotificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  bannerText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  bannerActionBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  bannerActionText: {
    color: colors.buttonSecondaryText,
    fontSize: 11,
    fontWeight: '700',
  },
  autoTrackingSoftBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(45, 186, 78, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(45, 186, 78, 0.25)',
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  autoTrackingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(45, 186, 78, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  autoTrackingBannerTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  autoTrackingBannerDesc: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  autoTrackingActionBtn: {
    backgroundColor: '#2dba4e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginLeft: 8,
  },
  autoTrackingActionText: {
    color: '#0B0E14',
    fontSize: 12,
    fontWeight: '800',
  },
  modalOverlayFull: {
    flex: 1,
    backgroundColor: 'rgba(36, 41, 46, 0.8)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { height: '100dvh' as any, width: '100vw' as any, position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0 } : {}),
  },
  modalCardFull: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    width: '100%',
    maxWidth: 640,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    height: '100%',
  },
  popularSection: {
    paddingVertical: 10,
    marginBottom: 10,
  },
  sectionSubHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 14,
    letterSpacing: 0.5,
  },
  popularGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: -4,
  },
  popularItem: {
    width: '23%',
    alignItems: 'center',
    marginVertical: 10,
  },
  popularBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  popularBadgeText: {
    color: '#fafbfc',
    fontSize: 16,
    fontWeight: '800',
  },
  popularLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 14,
  },
  bankListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 64,
    marginVertical: 5,
  },
  bankIconContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: 14,
  },
  bankLogoBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
  },
  bankLogoText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 14,
  },
  bankMeta: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    marginRight: 10,
  },
  bankNameText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  bankCodeText: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  bankChevron: {
    flexShrink: 0,
    marginLeft: 'auto',
  },
  formBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  formBackText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
  formFieldContainer: {
    marginBottom: 16,
  },
  formFieldLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 12,
  },
  formInputIcon: {
    marginRight: 10,
  },
  formInputField: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  formInputFieldDisabled: {
    flex: 1,
    color: colors.textTertiary,
    fontSize: 14,
  },
  submitBankBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    marginTop: 24,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  submitBankBtnText: {
    color: colors.buttonSecondaryText,
    fontSize: 15,
    fontWeight: '800',
  },
  bankFormHeader: {
    alignItems: 'center',
    marginVertical: 10,
  },
  bankFormTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 8,
  },
  bankFormSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.2)',
    padding: 12,
    marginBottom: 20,
    width: '100%',
  },
  errorTextInline: {
    color: '#FF5252',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  verificationContainer: {
    padding: 20,
    alignItems: 'center',
  },
  verificationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  verificationSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
    textAlign: 'center',
  },
  verifyStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  verifyStepText: {
    fontSize: 14,
    color: colors.text,
    marginLeft: 12,
    flex: 1,
  },
  verifyStepTextPending: {
    color: colors.textSecondary,
  },
  verifyStepTextSuccess: {
    color: colors.accent,
  },
  verifyStepTextFailed: {
    color: '#FF5252',
  },
  verificationFailureCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    padding: 12,
    backgroundColor: 'rgba(255, 82, 82, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.1)',
    width: '100%',
  },
  verificationFailureText: {
    color: '#FF5252',
    fontSize: 13,
    marginLeft: 8,
  },
  discoveredCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    width: '100%',
    marginTop: 16,
  },
  discoveredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  discoveredTitleBlock: {
    marginLeft: 12,
    flex: 1,
  },
  discoveredBankName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  discoveredAccountType: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  discoveredDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  discoveredDetailLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  discoveredDetailValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  discoveredSuccessText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 20,
  },
  retryButtonText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
});

const getNavStyles = (colors: any) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(36, 41, 46, 0.8)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.buttonSecondaryBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  largeAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  largeAvatarText: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 24,
  },
  profileMeta: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  profileEmail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  providerBadge: {
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  providerBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metaInfoBlock: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 24,
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginVertical: 3,
  },
  metaValue: {
    color: colors.text,
    fontWeight: '700',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.buttonSecondaryBackground,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: 14,
  },
  logoutBtnText: {
    color: colors.buttonSecondaryText,
    fontSize: 14,
    fontWeight: '700',
  },
});
