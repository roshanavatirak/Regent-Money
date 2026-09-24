import React, { useEffect } from 'react';
import * as Font from 'expo-font';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AppNavigator from './src/navigation';

export default function App() {
  useEffect(() => {
    // Proactively preload icon fonts so individual components don't trigger independent timeouts
    Font.loadAsync({
      ...Feather.font,
      ...Ionicons.font,
      ...MaterialCommunityIcons.font,
    }).catch((err) => {
      console.warn('[Font] Notice preloading vector icons:', err?.message || err);
    });
  }, []);

  return <AppNavigator />;
}
