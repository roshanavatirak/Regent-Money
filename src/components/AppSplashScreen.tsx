import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Animated, Image, Platform } from 'react-native';
import RegentIntro from './RegentIntro';
import { mmkvStorage } from '../db/mmkv';

export interface AppSplashScreenProps {
  onFinish: () => void;
}

export const AppSplashScreen: React.FC<AppSplashScreenProps> = ({ onFinish }) => {
  // On Android, the native Kotlin IntroActivity handles the 5s intro. Never render static splash image.
  if (Platform.OS === 'android') {
    return null;
  }

  const [playFullIntro, setPlayFullIntro] = useState<boolean | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {

    try {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const lastIntroDate = mmkvStorage.getString('regent_last_full_intro_date');

      if (lastIntroDate === today) {
        // Already played today -> Quick 1.5s branded static splash
        setPlayFullIntro(false);
      } else {
        // First cold start of the day -> Full 5s story animation
        setPlayFullIntro(true);
      }
    } catch {
      setPlayFullIntro(true);
    }
  }, [onFinish]);

  const handleFullIntroFinish = () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      mmkvStorage.setString('regent_last_full_intro_date', today);
    } catch {
      // non-blocking
    }
    onFinish();
  };

  useEffect(() => {
    if (playFullIntro === false) {
      // Hold static logo for 1.2s then fade out smoothly over 300ms (total ~1.5s)
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          onFinish();
        });
      }, 1200);

      return () => clearTimeout(timer);
    }
  }, [playFullIntro, fadeAnim, onFinish]);

  if (playFullIntro === true) {
    return <RegentIntro onFinish={handleFullIntroFinish} />;
  }

  // Quick Branded Splash (same frame as the end of the intro)
  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Image
        source={require('../../assets/splash-branded.png')}
        style={styles.image}
        resizeMode="contain"
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#fafbfc',
    zIndex: 999999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

export default AppSplashScreen;
