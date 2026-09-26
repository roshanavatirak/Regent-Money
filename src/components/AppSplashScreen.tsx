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

interface AppSplashScreenProps {
  onFinish: () => void;
}

// Module-level guard: guarantees the splash animation ONLY plays on cold start launch
let hasAppColdStarted = false;

export const AppSplashScreen: React.FC<AppSplashScreenProps> = ({ onFinish }) => {
  const insets = useSafeAreaInsets();

  const logoScale = useRef(new Animated.Value(0.75)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // If app already launched in this session, skip splash entirely
    if (hasAppColdStarted) {
      onFinish();
      return;
    }
    hasAppColdStarted = true;

    // Sequence of animations: LinkedIn / Luxury style opening
    Animated.parallel([
      // 1. Logo scale up and fade in
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      // 2. Brand name subtitle fade in
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 500,
        delay: 200,
        useNativeDriver: true,
      }),
      // 3. Footer "RAO Dev Studios" fade in
      Animated.timing(footerOpacity, {
        toValue: 1,
        duration: 600,
        delay: 350,
        useNativeDriver: true,
      }),
    ]).start();

    // After 1.9s, smoothly fade out the entire splash screen
    const dismissTimer = setTimeout(() => {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }, 1900);

    return () => {
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
              transform: [{ scale: logoScale }],
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
