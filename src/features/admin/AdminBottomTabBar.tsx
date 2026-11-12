import React, { useState, useEffect } from 'react';
import { View, Pressable, Platform, Keyboard, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Font from 'expo-font';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '../../store';
const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

interface AdminTabConfig {
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
}

const ADMIN_TAB_CONFIG: { [key: string]: AdminTabConfig } = {
  AdminDashboard: { label: 'Dashboard', activeIcon: 'grid', inactiveIcon: 'grid-outline' },
  AdminUsers: { label: 'Users', activeIcon: 'people', inactiveIcon: 'people-outline' },
  AdminBroadcast: { label: 'Broadcast', activeIcon: 'megaphone', inactiveIcon: 'megaphone-outline' },
  AdminLogs: { label: 'Logs', activeIcon: 'shield-checkmark', inactiveIcon: 'shield-checkmark-outline' },
  AdminSettings: { label: 'Settings', activeIcon: 'settings', inactiveIcon: 'settings-outline' },
};

// Indicator geometry (Material 3 style: a soft capsule behind the active icon only).
const IND_W = 56;
const IND_H = 30;
const SLIDE = { damping: 26, stiffness: 320, mass: 0.7, overshootClamping: true };
const FADE = { duration: 200, easing: Easing.out(Easing.cubic) };

type TabPalette = { active: string; idle: string; label: string; labelIdle: string };

const AdminTabButton = ({
  route,
  isFocused,
  onPress,
  onLongPress,
  palette,
  isSmall,
}: {
  route: any;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  palette: TabPalette;
  isSmall: boolean;
}) => {
  const config = ADMIN_TAB_CONFIG[route.name] || {
    label: route.name,
    activeIcon: 'apps' as const,
    inactiveIcon: 'apps-outline' as const,
  };

  const progress = useSharedValue(isFocused ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    progress.value = withTiming(isFocused ? 1 : 0, FADE);
  }, [isFocused, progress]);

  // Filled icon fades in over the outline one — no size jump, no layout shift.
  const filledStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const outlineStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const iconWrapStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [palette.labelIdle, palette.label]),
  }));

  const semi = Font.isLoaded('Figtree_600SemiBold') ? 'Figtree_600SemiBold' : undefined;
  const bold = Font.isLoaded('Figtree_700Bold') ? 'Figtree_700Bold' : undefined;
  const size = isSmall ? 21 : 22;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        press.value = withTiming(0.88, { duration: 90 });
      }}
      onPressOut={() => {
        press.value = withSpring(1, { damping: 15, stiffness: 400 });
      }}
      style={[
        { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
        Platform.OS === 'web' && ({ cursor: 'pointer', outlineStyle: 'none' } as any),
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={config.label}
    >
      <Animated.View style={[{ width: IND_W, height: IND_H, alignItems: 'center', justifyContent: 'center' }, iconWrapStyle]}>
        <Animated.View style={[{ position: 'absolute' }, outlineStyle]}>
          <Ionicons name={config.inactiveIcon} size={size} color={palette.idle} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute' }, filledStyle]}>
          <Ionicons name={config.activeIcon} size={size} color={palette.active} />
        </Animated.View>
      </Animated.View>
      <Animated.Text
        numberOfLines={1}
        style={[
          {
            marginTop: 4,
            fontSize: isSmall ? 10.5 : 11.5,
            letterSpacing: 0.1,
            fontFamily: isFocused ? bold : semi,
            fontWeight: (isFocused ? bold : semi) ? undefined : isFocused ? '700' : '600',
          },
          labelStyle,
        ]}
      >
        {config.label}
      </Animated.Text>
    </Pressable>
  );
};

export const AdminBottomTabBar = ({ state, navigation }: MaterialTopTabBarProps) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [rowWidth, setRowWidth] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setIsKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setIsKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const isSmall = windowWidth < 380;
  const barWidth = Math.min(windowWidth - (isSmall ? 24 : 32), 480);
  const barHeight = isSmall ? 64 : 68;
  const hPad = 6;
  const bottomOffset = Platform.OS === 'web' ? 18 : Math.max(insets.bottom + (Platform.OS === 'ios' ? 4 : 8), 16);

  const palette: TabPalette = isDark
    ? { active: LIME, idle: 'rgba(250,251,252,0.55)', label: LIME, labelIdle: 'rgba(250,251,252,0.55)' }
    : { active: FOREST, idle: '#64748B', label: FOREST, labelIdle: '#64748B' };

  // One shared indicator that glides between tabs.
  const count = state.routes.length;
  const tabW = rowWidth / Math.max(count, 1);
  const targetX = state.index * tabW + (tabW - IND_W) / 2;
  const x = useSharedValue(0);
  const ready = useSharedValue(0);

  useEffect(() => {
    if (!rowWidth) return;
    if (ready.value === 0) {
      x.value = targetX; // first layout: place without animating
      ready.value = withTiming(1, { duration: 150 });
    } else {
      x.value = withSpring(targetX, SLIDE);
    }
  }, [targetX, rowWidth, x, ready]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: ready.value,
    transform: [{ translateX: x.value }],
  }));

  const onRowLayout = (e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width);

  // Icon (30) + gap (4) + label (~15) stacked and centred → indicator top offset.
  const labelH = isSmall ? 14 : 15;
  const indTop = (barHeight - (IND_H + 4 + labelH)) / 2;

  return (
    <View
      style={{
        pointerEvents: isKeyboardVisible ? 'none' : Platform.OS === 'web' ? 'auto' : 'box-none',
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
          height: barHeight,
          borderRadius: barHeight / 2,
          backgroundColor: isDark ? 'rgba(22, 27, 34, 0.98)' : colors.card,
          paddingHorizontal: hPad,
          borderWidth: isDark ? 1 : 0.5,
          borderColor: isDark ? colors.border : 'rgba(11, 61, 44, 0.08)',
          shadowColor: isDark ? '#000000' : FOREST,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.4 : 0.1,
          shadowRadius: 24,
          elevation: 8,
        }}
      >
        <View onLayout={onRowLayout} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: indTop,
                width: IND_W,
                height: IND_H,
                borderRadius: IND_H / 2,
                backgroundColor: isDark ? 'rgba(184, 243, 107, 0.14)' : '#E3F2E8',
              },
              indicatorStyle,
            ]}
          />
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;

            const onPress = () => {
              if (Platform.OS === 'web' && typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
                try {
                  document.activeElement.blur();
                } catch {}
              }
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({ type: 'tabLongPress', target: route.key });
            };

            return (
              <AdminTabButton
                key={route.key}
                route={route}
                isFocused={isFocused}
                onPress={onPress}
                onLongPress={onLongPress}
                palette={palette}
                isSmall={isSmall}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
};
