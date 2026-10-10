import React, { useEffect } from 'react';
import { Platform, LogBox } from 'react-native';
import * as Font from 'expo-font';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AppNavigator from './src/navigation';

// Ignore benign React Native Web deprecation warnings
LogBox.ignoreLogs([
  '"shadow*" style props are deprecated',
  'props.pointerEvents is deprecated',
  'Cannot record touch end without a touch start',
  '[expo-notifications]',
  'TouchableWithoutFeedback is deprecated',
  'ImagePicker.MediaTypeOptions',
]);

if (Platform.OS === 'web' && typeof console !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const msg = args[0] ? String(args[0]) : '';
    if (
      msg.includes('"shadow*" style props are deprecated') ||
      msg.includes('props.pointerEvents is deprecated') ||
      msg.includes('Cannot record touch end without a touch start') ||
      msg.includes('[expo-notifications]') ||
      msg.includes('TouchableWithoutFeedback is deprecated') ||
      msg.includes('ImagePicker.MediaTypeOptions')
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };
}

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

import { KeyboardProvider } from 'react-native-keyboard-controller';

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

    // Seed native bank sender allowlist so on-device SmsReceiver immediately filters OTPs & non-bank senders
    try {
      const { syncBankSenderIdsToNative } = require('./src/constants/bankSmsSenders');
      const { useBankStore } = require('./src/store');
      const customTags = (useBankStore.getState().bankProfiles || [])
        .map((b: any) => b.smsSenderId || '')
        .filter(Boolean);
      syncBankSenderIdsToNative(customTags);
    } catch (e) {
      // Non-critical startup fallback
    }
  }, []);

  return (
    <KeyboardProvider>
      <AppNavigator />
    </KeyboardProvider>
  );
}
