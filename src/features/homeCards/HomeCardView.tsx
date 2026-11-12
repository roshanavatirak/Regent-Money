import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { HomeCardArt } from './HomeCardArt';
import type { ArtKey } from './schema';
import type { CardTheme } from './themes';

/**
 * One carousel card's face (150 tall, radius 24). The Home carousel wraps it in its own
 * pressable; the admin editor shows it as a preview.
 */
export function HomeCardFace({
  title,
  cta,
  art,
  theme,
  style,
}: {
  title: string;
  cta: string;
  art: ArtKey;
  theme: CardTheme;
  style?: StyleProp<ViewStyle>;
}) {
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const bold = Font.isLoaded('Figtree_700Bold') ? 'Figtree_700Bold' : undefined;
  return (
    <View style={[styles.card, { backgroundColor: theme.bg }, style]}>
      <HomeCardArt kind={art} theme={theme} />
      <Text
        style={[styles.title, { color: theme.fg, fontFamily: display, fontWeight: display ? undefined : '800' }]}
        numberOfLines={3}
      >
        {title}
      </Text>
      <View style={[styles.cta, { backgroundColor: theme.ctaBg }]}>
        <Text
          style={[styles.ctaText, { color: theme.ctaFg, fontFamily: bold, fontWeight: bold ? undefined : '700' }]}
          numberOfLines={1}
        >
          {cta}
        </Text>
        <Feather name="chevron-right" size={13} color={theme.ctaFg} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { height: 150, borderRadius: 24, padding: 18, overflow: 'hidden' },
  title: { fontSize: 20, lineHeight: 24, maxWidth: '66%', letterSpacing: -0.3 },
  cta: {
    position: 'absolute',
    left: 18,
    bottom: 16,
    maxWidth: '62%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  ctaText: { fontSize: 12, flexShrink: 1 },
});
