import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { syncService } from '../services/syncService';

interface AppSplashScreenProps {
  onFinish: () => void;
}

export const AppSplashScreen: React.FC<AppSplashScreenProps> = ({ onFinish }) => {
  const insets = useSafeAreaInsets();
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const logoScale = useRef(new Animated.Value(0.65)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Preload & sync all financial records in the background during the 4-second splash
    try {
      syncService.sync().catch((err) => {
        console.warn('[SplashScreen] Background sync error during splash preload:', err);
      });
    } catch (e) {
      // Continue without blocking splash
    }

    const useNative = Platform.OS !== 'web';

    // Sequence of animations: Luxury / Elite financial opening starts immediately
    Animated.parallel([
      // 1. Logo spring scale up and fade in from frame 0
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 42,
        useNativeDriver: useNative,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: useNative,
      }),
      // 2. Brand name subtitle glide in
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 550,
        delay: 220,
        useNativeDriver: useNative,
      }),
      // 3. Footer "RAO Dev Studios" fade in
      Animated.timing(footerOpacity, {
        toValue: 1,
        duration: 650,
        delay: 400,
        useNativeDriver: useNative,
      }),
    ]).start();

    // Subtle luxury breathing pulse on the emblem during loading (starts right after entrance)
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.05,
          duration: 900,
          useNativeDriver: useNative,
        }),
        Animated.timing(pulseScale, {
          toValue: 1.0,
          duration: 900,
          useNativeDriver: useNative,
        }),
      ])
    );

    const pulseTimer = setTimeout(() => {
      pulseLoop.start();
    }, 600);

    // Keep all elements proudly displayed for the full 4 seconds, then smoothly fade out
    const dismissTimer = setTimeout(() => {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 450,
        useNativeDriver: useNative,
      }).start(() => {
        onFinishRef.current();
      });
    }, 4000);

    return () => {
      clearTimeout(pulseTimer);
      clearTimeout(dismissTimer);
      pulseLoop.stop();
    };
  }, []);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: containerOpacity,
          pointerEvents: 'none' as any,
        },
      ]}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0B0E14" translucent />

      {/* Center Brand Identity */}
      <View style={styles.centerBox}>
        <Animated.View
          style={[
            styles.logoContainer,
            {
              transform: [{ scale: Animated.multiply(logoScale, pulseScale) }],
              opacity: logoOpacity,
            },
          ]}
        >
          <Image
            source={require('../../assets/insideicon.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>

        <Animated.View style={[styles.brandTextBox, { opacity: contentOpacity }]}>
          <Text style={styles.brandTitle}>REGENT MONEY</Text>
          <Text style={styles.brandTagline}>Smart Wealth & Cashflow Manager</Text>
        </Animated.View>
      </View>

      {/* LinkedIn-style Footer Attribution */}
      <Animated.View
        style={[
          styles.footerBox,
          {
            opacity: footerOpacity,
            paddingBottom: Math.max(insets.bottom + 20, 36),
          },
        ]}
      >
        <Text style={styles.fromText}>from</Text>
        <Text style={styles.studioText}>RAO Dev Studios</Text>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0B0E14',
    zIndex: 999999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  logoContainer: {
    width: 90,
    height: 90,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2dba4e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
    overflow: 'hidden',
  },
  logoImage: {
    width: 76,
    height: 76,
  },
  brandTextBox: {
    alignItems: 'center',
    marginTop: 20,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  brandTagline: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E9F',
    letterSpacing: 1,
    marginTop: 6,
  },
  footerBox: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fromText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6E7681',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  studioText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E6EDF3',
    letterSpacing: 1.2,
    marginTop: 2,
  },
});
