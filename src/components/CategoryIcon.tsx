// src/components/CategoryIcon.tsx
//
// One icon component for every category in the app.
//
//   <CategoryIcon category={tx.category} />                   // solid tile (pickers, hero spots)
//   <CategoryIcon category="food" variant="soft" size={40} />  // soft tile (lists, rows)
//   <CategoryIcon category="food" selected />                  // with selection ring + check

import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { getCategory } from '../constants/categories';
import { useTheme } from '../store';

interface CategoryIconProps {
  category?: string;
  size?: number;
  variant?: 'solid' | 'soft';
  selected?: boolean;
  /** Background behind the icon; used for the check badge's border */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  category,
  size = 52,
  variant = 'solid',
  selected = false,
  backgroundColor,
  style,
}) => {
  const { colors, isDark } = useTheme();
  const cat = getCategory(category);
  const s = cat.style;

  const solid = variant === 'solid';
  const radius = Math.round(size * 0.32);
  const glyphSize = Math.round(size * 0.44);
  const coin = Math.round(size * 0.62);

  const bg = solid ? s.color : isDark ? s.softBgDark : s.softBgLight;
  const fg = solid ? s.glyph : isDark ? s.softFgDark : s.softFgLight;
  const ringColor = isDark ? '#B8F36B' : '#0B3D2C';
  const behind = backgroundColor || colors.background;

  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Signature coin highlight, the same motif as the dashboard hero */}
        {solid && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: -coin * 0.35,
              bottom: -coin * 0.35,
              width: coin,
              height: coin,
              borderRadius: coin / 2,
              backgroundColor:
                cat.family === 'money' ? 'rgba(184, 243, 107, 0.14)' : 'rgba(255, 255, 255, 0.14)',
            }}
          />
        )}

        {cat.isCustom ? (
          <Text style={{ color: fg, fontSize: Math.round(size * 0.38), fontWeight: '800' }}>
            {cat.label.charAt(0).toUpperCase()}
          </Text>
        ) : (
          <MaterialCommunityIcons name={cat.icon} size={glyphSize} color={fg} />
        )}
      </View>

      {selected && (
        <>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -5,
              left: -5,
              right: -5,
              bottom: -5,
              borderRadius: radius + 5,
              borderWidth: 2,
              borderColor: ringColor,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -9,
              right: -9,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: '#B8F36B',
              borderWidth: 2,
              borderColor: behind,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="check" size={12} color="#0B3D2C" />
          </View>
        </>
      )}
    </View>
  );
};