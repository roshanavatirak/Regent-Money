import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Platform,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../../store';

interface AdminTabConfig {
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
}

const ADMIN_TAB_CONFIG: { [key: string]: AdminTabConfig } = {
  AdminDashboard: {
    label: 'Dashboard',
    activeIcon: 'grid',
    inactiveIcon: 'grid-outline',
  },
  AdminUsers: {
    label: 'Users',
    activeIcon: 'people',
    inactiveIcon: 'people-outline',
  },
  AdminLogs: {
    label: 'Logs',
    activeIcon: 'shield-checkmark',
    inactiveIcon: 'shield-checkmark-outline',
  },
  AdminSettings: {
    label: 'Settings',
    activeIcon: 'settings',
    inactiveIcon: 'settings-outline',
  },
};

const AdminTabButton = ({
  route,
  isFocused,
  onPress,
  onLongPress,
  isSmall,
  isDark,
  colors,
}: {
  route: any;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  isSmall: boolean;
  isDark: boolean;
  colors: any;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const scale = useSharedValue(1);

  const config = ADMIN_TAB_CONFIG[route.name] || {
    label: route.name,
    activeIcon: 'apps' as const,
    inactiveIcon: 'apps-outline' as const,
  };

  const iconSize = isSmall ? 19 : 21;

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 14, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 14, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconColor = isFocused
    ? '#EAB308'
    : isHovered
      ? (isDark ? '#fafbfc' : '#0f172a')
      : (isDark ? 'rgba(250, 251, 252, 0.65)' : '#64748b');

  const textColor = isFocused
    ? '#EAB308'
    : isHovered
      ? (isDark ? '#e4e4e7' : '#1e293b')
      : (isDark ? 'rgba(250, 251, 252, 0.65)' : '#475569');

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
      style={[
        {
          flex: 1,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 4,
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
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: isSmall ? 4 : 12,
            paddingVertical: 4,
            minWidth: isSmall ? 48 : 56,
          },
          animatedStyle,
        ]}
      >
        <Ionicons
          name={isFocused ? config.activeIcon : config.inactiveIcon}
          size={iconSize}
          color={iconColor}
        />
        <Text
          numberOfLines={1}
          style={{
            color: textColor,
            fontSize: isSmall ? 9 : 10.5,
            fontWeight: isFocused ? '800' : '700',
            marginTop: 2,
            letterSpacing: isFocused ? 0.3 : 0.1,
          }}
        >
          {config.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

export const AdminBottomTabBar = ({ state, descriptors, navigation }: MaterialTopTabBarProps) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const isSmall = windowWidth < 380;
  const barMarginHorizontal = isSmall ? 12 : 20;
  const maxBarWidth = 480;
  const barWidth = Math.min(windowWidth - barMarginHorizontal * 2, maxBarWidth);

  const bottomOffset =
    Platform.OS === 'web'
      ? 18
      : Math.max(insets.bottom + (Platform.OS === 'ios' ? 4 : 8), 16);

  return (
    <View
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
          backgroundColor: isDark ? 'rgba(22, 27, 34, 0.98)' : colors.card,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: isSmall ? 8 : 14,
          paddingVertical: 4,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(234, 179, 8, 0.3)' : colors.border,
          shadowColor: isDark ? '#000000' : colors.shadowColor,
          shadowOffset: { width: 0, height: isDark ? 6 : 3 },
          shadowOpacity: isDark ? 0.45 : 0.08,
          shadowRadius: isDark ? 16 : 10,
          elevation: isDark ? 10 : 3,
        }}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;

          const onPress = () => {
            if (Platform.OS === 'web' && typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
              try {
                document.activeElement.blur();
              } catch {}
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
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <AdminTabButton
              key={route.key}
              route={route}
              isFocused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
              isSmall={isSmall}
              isDark={isDark}
              colors={colors}
            />
          );
        })}
      </View>
    </View>
  );
};
