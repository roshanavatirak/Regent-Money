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

// Module-level guard: guarantees the splash animation ONLY plays on cold start launch
let hasAppColdStarted = false;

export const AppSplashScreen: React.FC<AppSplashScreenProps> = ({ onFinish }) => {
  const insets = useSafeAreaInsets();

  const logoScale = useRef(new Animated.Value(0.72)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // If app already launched in this session, skip splash entirely
    if (hasAppColdStarted) {
      onFinish();
      return;
    }
    hasAppColdStarted = true;

    // Preload & sync all financial records, accounts, and server data in the background during the 4-second splash
    try {
      syncService.sync().catch((err) => {
        console.warn('[SplashScreen] Background sync error during splash preload:', err);
      });
    } catch (e) {
      // Continue without blocking splash
    }

    // Sequence of animations: Luxury / Elite financial opening
    Animated.parallel([
      // 1. Logo scale up and fade in
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6.5,
        tension: 38,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 650,
        useNativeDriver: true,
      }),
      // 2. Brand name subtitle fade in
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 700,
        delay: 350,
        useNativeDriver: true,
      }),
      // 3. Footer "RAO Dev Studios" fade in
      Animated.timing(footerOpacity, {
        toValue: 1,
        duration: 800,
        delay: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle luxury breathing pulse on the emblem during loading (1.2s to 3.4s)
    const pulseTimer = setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.04,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1.0,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
        { iterations: 2 }
      ).start();
    }, 1100);

    // After 3.45s, smoothly fade out the entire splash screen so app fully opens at exactly 4 seconds
    const dismissTimer = setTimeout(() => {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 550,
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, 3450);

    return () => {
      clearTimeout(pulseTimer);
      clearTimeout(dismissTimer);
    };
  }, [onFinish]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: containerOpacity,
        },
      ]}
      pointerEvents="none"
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
