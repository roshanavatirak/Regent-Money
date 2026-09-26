import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Font from 'expo-font';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AppNavigator from './src/navigation';

// Configure font-display: swap on Web to prevent Chrome slow-network intervention warnings
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const styleId = 'expo-vector-icons-font-display';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @font-face { font-family: 'Feather'; font-display: swap; }
      @font-face { font-family: 'Ionicons'; font-display: swap; }
      @font-face { font-family: 'MaterialCommunityIcons'; font-display: swap; }
      @font-face { font-family: 'material-community'; font-display: swap; }
    `;
    document.head.appendChild(style);
  }
}

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
