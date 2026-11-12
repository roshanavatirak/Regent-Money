import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, TextStyle, ViewStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { useTheme } from '../../store';

// Brand tokens shared with the user-facing HomeDashboard.
export const FOREST = '#0B3D2C';
export const FOREST_RAISED = '#124B37';
export const LIME = '#B8F36B';
export const MIST = '#B5CEC1';
export const CORAL = '#FF8A6B';
export const LILAC = '#C9B8FF';
export const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

export type AdminFont = {
  display?: string;
  displayBold?: string;
  body?: string;
  bodySemi?: string;
  bodyBold?: string;
};

export type Tint = { bg: string; fg: string };

export const getAdminPalette = (colors: any, isDark: boolean) => ({
  bg: isDark ? colors.background : '#F3F6F4',
  card: colors.card,
  line: isDark ? colors.border : '#E1E9E4',
  divider: isDark ? colors.divider : '#EEF3F0',
  text: colors.text,
  sub: colors.textSecondary,
  muted: colors.textTertiary,
  soft: isDark ? 'rgba(255,255,255,0.06)' : '#EEF3F0',
  segBg: isDark ? 'rgba(255,255,255,0.06)' : '#E6EDE9',
  segActive: isDark ? LIME : FOREST,
  segActiveText: isDark ? FOREST : '#FFFFFF',
  link: isDark ? LIME : '#0B6B3A',
  success: isDark ? '#4ADE80' : '#16A34A',
  danger: isDark ? '#FF9B85' : '#B42318',
  dangerLine: isDark ? 'rgba(255,138,107,0.35)' : '#F5C2B0',
  tint: {
    green: { bg: isDark ? 'rgba(184,243,107,0.16)' : '#E3F2E8', fg: isDark ? LIME : FOREST },
    blue: { bg: isDark ? 'rgba(59,130,246,0.18)' : '#DCEBFF', fg: isDark ? '#93C5FD' : '#1450A3' },
    amber: { bg: isDark ? 'rgba(255,176,32,0.18)' : '#FFF1D6', fg: isDark ? '#FFD27A' : '#7A4F00' },
    coral: { bg: isDark ? 'rgba(255,138,107,0.18)' : '#FFE3D6', fg: isDark ? '#FFB29E' : '#9A2F0B' },
    lilac: { bg: isDark ? 'rgba(201,184,255,0.18)' : '#EDE6FF', fg: isDark ? '#DCD0FF' : '#4B2BB5' },
  },
});

export type AdminPalette = ReturnType<typeof getAdminPalette>;

/** Theme + brand fonts for admin screens. Loads fonts itself so admins never depend on HomeDashboard. */
export const useAdminTheme = () => {
  const { colors, isDark } = useTheme();
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });
  const font: AdminFont = useMemo(
    () => ({
      display: fontsLoaded ? 'BricolageGrotesque_800ExtraBold' : undefined,
      displayBold: fontsLoaded ? 'BricolageGrotesque_700Bold' : undefined,
      body: fontsLoaded ? 'Figtree_500Medium' : undefined,
      bodySemi: fontsLoaded ? 'Figtree_600SemiBold' : undefined,
      bodyBold: fontsLoaded ? 'Figtree_700Bold' : undefined,
    }),
    [fontsLoaded],
  );
  const p = useMemo(() => getAdminPalette(colors, isDark), [colors, isDark]);
  return { colors, isDark, p, font };
};

/** Font style with a system-weight fallback while custom fonts load. */
export const ff = (family: string | undefined, fallback: TextStyle['fontWeight']): TextStyle => ({
  fontFamily: family,
  fontWeight: family ? undefined : fallback,
});

export const IconTile: React.FC<{
  tint: Tint;
  size?: number;
  radius?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}> = ({ tint, size = 40, radius = 14, children, style }) => (
  <View
    style={[
      { width: size, height: size, borderRadius: radius, backgroundColor: tint.bg, alignItems: 'center', justifyContent: 'center' },
      style,
    ]}
  >
    {children}
  </View>
);

export const Pill: React.FC<{ tint: Tint; label: string; dot?: string; font: AdminFont; small?: boolean }> = ({
  tint,
  label,
  dot,
  font,
  small,
}) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: tint.bg,
      borderRadius: 999,
      paddingHorizontal: small ? 7 : 10,
      paddingVertical: small ? 2 : 4,
    }}
  >
    {dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} /> : null}
    <Text style={[{ color: tint.fg, fontSize: small ? 10 : 12, letterSpacing: small ? 0.4 : 0 }, ff(font.bodyBold, '700')]}>
      {label}
    </Text>
  </View>
);

export const AdminHeader: React.FC<{
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  leading?: React.ReactNode;
  eyebrow?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}> = ({ title, subtitle, badge, leading, eyebrow, onRefresh, refreshing }) => {
  const insets = useSafeAreaInsets();
  const { p, font } = useAdminTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: Math.max(insets.top, 16) + 8,
        paddingBottom: 10,
        backgroundColor: p.bg,
        gap: 12,
      }}
    >
      {leading}
      <View style={{ flex: 1 }}>
        {eyebrow ? (
          <Text style={[{ fontSize: 13, color: p.sub }, ff(font.body, '500')]}>{eyebrow}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text
            style={[{ fontSize: eyebrow ? 21 : 26, color: p.text, letterSpacing: eyebrow ? -0.3 : -0.5 }, ff(font.displayBold, '700')]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {badge}
        </View>
        {subtitle ? (
          <Text style={[{ fontSize: 13, color: p.sub, marginTop: 3 }, ff(font.body, '500')]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onRefresh ? (
        <TouchableOpacity
          onPress={onRefresh}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          activeOpacity={0.7}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: p.line,
            backgroundColor: p.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={p.segActive} />
          ) : (
            <Feather name="refresh-cw" size={17} color={p.text} />
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { p, font } = useAdminTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[{ flexDirection: 'row', backgroundColor: p.segBg, borderRadius: 999, padding: 4 }, style]}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <TouchableOpacity
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.id)}
            activeOpacity={0.8}
            style={{
              flex: 1,
              height: 36,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
              backgroundColor: on ? p.segActive : 'transparent',
            }}
          >
            <Text
              numberOfLines={1}
              style={[{ fontSize: 12.5, color: on ? p.segActiveText : p.sub }, ff(on ? font.bodyBold : font.bodySemi, on ? '700' : '600')]}
            >
              {o.label}
              {o.count !== undefined ? <Text style={{ opacity: 0.75 }}>{` ${o.count}`}</Text> : null}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export const SectionLabel: React.FC<{ children: React.ReactNode; right?: React.ReactNode; style?: StyleProp<ViewStyle> }> = ({
  children,
  right,
  style,
}) => {
  const { p, font } = useAdminTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10, marginHorizontal: 4 }, style]}>
      <Text style={[{ fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: p.muted }, ff(font.bodyBold, '700')]}>
        {children}
      </Text>
      {right}
    </View>
  );
};

/** Decorative concentric rings used on forest hero cards. */
export const HeroRings: React.FC<{ big?: number; small?: number }> = ({ big = 240, small = 150 }) => (
  <>
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: big,
        height: big,
        borderRadius: big / 2,
        right: -big * 0.375,
        top: -big * 0.46,
        borderWidth: 1,
        borderColor: 'rgba(184, 243, 107, 0.16)',
      }}
    />
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: small,
        height: small,
        borderRadius: small / 2,
        right: -small * 0.3,
        top: -small * 0.43,
        borderWidth: 1,
        borderColor: 'rgba(184, 243, 107, 0.22)',
      }}
    />
  </>
);

export const shortId = (id?: string | null, fallback = 'System') => (id ? `${id.slice(0, 8)}…` : fallback);
