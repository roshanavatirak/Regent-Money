import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  Platform,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useAuthStore } from '../store';

interface TabItemConfig {
  name: string;
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  size?: number;
}

const TABS: TabItemConfig[] = [
  {
    name: 'Home',
    label: 'Home',
    activeIcon: 'home',
    inactiveIcon: 'home-outline',
    size: 20,
  },
  {
    name: 'Budgets',
    label: 'Budgets',
    activeIcon: 'pie-chart',
    inactiveIcon: 'pie-chart-outline',
    size: 19,
  },
  {
    name: 'Goals',
    label: 'Goals',
    activeIcon: 'trophy',
    inactiveIcon: 'trophy-outline',
    size: 19,
  },
  {
    name: 'Banks',
    label: 'Banks',
    activeIcon: 'wallet',
    inactiveIcon: 'wallet-outline',
    size: 20,
  },
  {
    name: 'AI Chat',
    label: 'AI Chat',
    activeIcon: 'sparkles',
    inactiveIcon: 'sparkles-outline',
    size: 20,
  },
  {
    name: 'Settings',
    label: 'Profile',
    activeIcon: 'person',
    inactiveIcon: 'person-outline',
    size: 20,
  },
];

interface StandaloneBottomTabBarProps {
  activeTab?: string;
}

export const StandaloneBottomTabBar: React.FC<StandaloneBottomTabBarProps> = ({
  activeTab = 'Budgets',
}) => {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const user = useAuthStore((state) => state.user);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

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
  const isMedium = windowWidth >= 380 && windowWidth < 600;

  const barMarginHorizontal = isSmall ? 10 : 16;
  const maxBarWidth = 560;
  const barWidth = Math.min(windowWidth - barMarginHorizontal * 2, maxBarWidth);

  const bottomOffset =
    Platform.OS === 'web'
      ? 18
      : Math.max(insets.bottom + (Platform.OS === 'ios' ? 4 : 8), 16);

  const handleTabPress = (tabName: string) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      try {
        document.activeElement.blur();
      } catch {}
    }

    if (navigation.canGoBack && activeTab === tabName) {
      // If tapping current tab while on a child screen like CreateBudget, return to tab dashboard
      navigation.navigate('Main', { screen: tabName });
    } else {
      navigation.navigate('Main', { screen: tabName });
    }
  };

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
          backgroundColor: isDark ? 'rgba(22, 27, 34, 0.97)' : colors.card,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: isSmall ? 6 : 10,
          paddingVertical: 4,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: isDark ? '#000000' : colors.shadowColor,
          shadowOffset: { width: 0, height: isDark ? 6 : 3 },
          shadowOpacity: isDark ? 0.45 : 0.08,
          shadowRadius: isDark ? 16 : 10,
          elevation: isDark ? 10 : 3,
        }}
      >
        {TABS.map((tab) => {
          const isFocused = activeTab === tab.name;
          return (
            <StandaloneTabButton
              key={tab.name}
              config={tab}
              isFocused={isFocused}
              onPress={() => handleTabPress(tab.name)}
              isSmall={isSmall}
              isMedium={isMedium}
              isDark={isDark}
              colors={colors}
              user={user}
            />
          );
        })}
      </View>
    </View>
  );
};

const StandaloneTabButton = ({
  config,
  isFocused,
  onPress,
  isSmall,
  isMedium,
  isDark,
  colors,
  user,
}: {
  config: TabItemConfig;
  isFocused: boolean;
  onPress: () => void;
  isSmall: boolean;
  isMedium: boolean;
  isDark: boolean;
  colors: any;
  user: any;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const scale = useSharedValue(1);

  const iconSize = isSmall ? 18 : (config.size || 20);

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
    ? (isDark ? '#2dba4e' : '#16a34a')
    : isHovered
      ? (isDark ? '#fafbfc' : '#0f172a')
      : (isDark ? 'rgba(250, 251, 252, 0.65)' : '#64748b');

  const textColor = isFocused
    ? (isDark ? '#2dba4e' : '#16a34a')
    : isHovered
      ? (isDark ? '#e4e4e7' : '#1e293b')
      : (isDark ? 'rgba(250, 251, 252, 0.65)' : '#475569');

  return (
    <Pressable
      onPress={onPress}
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
          paddingHorizontal: 2,
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
            paddingHorizontal: isSmall ? 2 : (isMedium ? 6 : 10),
            paddingVertical: 4,
            maxWidth: '96%',
            minWidth: isSmall ? 36 : 46,
          },
          animatedStyle,
        ]}
      >
        {config.name === 'Settings' && !!user?.avatarUrl ? (
          <View
            style={{
              width: iconSize + 4,
              height: iconSize + 4,
              borderRadius: (iconSize + 4) / 2,
              borderWidth: 1.5,
              borderColor: isFocused
                ? (isDark ? '#2dba4e' : '#16a34a')
                : (isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.22)'),
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isDark ? '#161b22' : '#f1f5f9',
            }}
          >
            <Image
              source={{ uri: user.avatarUrl }}
              style={{
                width: iconSize + 4,
                height: iconSize + 4,
                borderRadius: (iconSize + 4) / 2,
              }}
              resizeMode="cover"
            />
          </View>
        ) : (
          <Ionicons
            name={isFocused ? config.activeIcon : config.inactiveIcon}
            size={iconSize}
            color={iconColor}
          />
        )}
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            color: textColor,
            fontSize: isSmall ? 8.5 : 9.5,
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
