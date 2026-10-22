// src/components/BrandWordmark.tsx
//
// The "Regent Money" wordmark, the same everywhere.
//
//   <BrandWordmark />                  // follows the app theme
//   <BrandWordmark size={18} onDark /> // on a dark green surface (sidebar header, cards)
//
// Light theme: "Regent" in ink, "Money" in brand green.
// Dark theme or dark surfaces: "Regent" in white, "Money" in lime.

import React from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { useTheme } from '../store';

const INK = '#0B1F17';
const GREEN = '#16A34A';
const WHITE = '#FFFFFF';
const LIME = '#B8F36B';

interface BrandWordmarkProps {
  size?: number;
  /** Force the white + lime version, for dark green surfaces in either theme */
  onDark?: boolean;
  style?: StyleProp<TextStyle>;
}

export const BrandWordmark: React.FC<BrandWordmarkProps> = ({ size = 19, onDark, style }) => {
  const { isDark } = useTheme();
  const [fontsLoaded] = useFonts({ BricolageGrotesque_800ExtraBold });

  const dark = onDark || isDark;
  const font = fontsLoaded
    ? { fontFamily: 'BricolageGrotesque_800ExtraBold' }
    : { fontWeight: '800' as const };

  return (
    <Text
      style={[{ fontSize: size, letterSpacing: -0.3, color: dark ? WHITE : INK }, font, style]}
      numberOfLines={1}
      accessibilityRole="header"
      accessibilityLabel="Regent Money"
    >
      Regent <Text style={{ color: dark ? LIME : GREEN }}>Money</Text>
    </Text>
  );
};