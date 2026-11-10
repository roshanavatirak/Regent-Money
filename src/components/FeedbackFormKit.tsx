// src/components/FeedbackFormKit.tsx
//
// Shared pieces for the Report a problem and Suggest a feature screens:
// theme palette, an anchored dropdown field, a combined title + details card,
// a forest/lime switch and the send button.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Font from 'expo-font';
import { useTheme } from '../store';

export const FOREST = '#0B3D2C';
export const LIME = '#B8F36B';

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

export const useFeedbackTheme = () => {
  const { colors, isDark } = useTheme();
  const p = {
    isDark,
    page: isDark ? colors.background : '#F3F6F4',
    card: isDark ? colors.card : '#FFFFFF',
    border: isDark ? 'rgba(250, 251, 252, 0.10)' : '#E1E9E4',
    divider: isDark ? 'rgba(250, 251, 252, 0.08)' : '#EEF3F0',
    soft: isDark ? 'rgba(255, 255, 255, 0.06)' : '#EEF3F0',
    ink: isDark ? '#FFFFFF' : '#0B1F17',
    muted: isDark ? 'rgba(250, 251, 252, 0.66)' : '#5B6B63',
    placeholder: isDark ? 'rgba(250, 251, 252, 0.42)' : '#8A9A92',
    primary: isDark ? LIME : FOREST,
    onPrimary: isDark ? FOREST : '#FFFFFF',
    primaryIcon: isDark ? FOREST : LIME,
    disabledBg: isDark ? 'rgba(255, 255, 255, 0.08)' : '#DCE6E0',
    disabledFg: isDark ? 'rgba(250, 251, 252, 0.5)' : '#5B6B63',
    danger: isDark ? '#FF8A6B' : '#B42E17',
    menu: isDark ? '#30373E' : '#FFFFFF',
    trackOff: isDark ? 'rgba(250, 251, 252, 0.18)' : '#D5DFD9',
  };
  const font = {
    display: Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined,
    body: Font.isLoaded('Figtree_500Medium') ? 'Figtree_500Medium' : undefined,
    semi: Font.isLoaded('Figtree_600SemiBold') ? 'Figtree_600SemiBold' : undefined,
    bold: Font.isLoaded('Figtree_700Bold') ? 'Figtree_700Bold' : undefined,
  };
  return { p, font };
};

/** Uses the loaded font family, or falls back to a system weight. */
export const ff = (family: string | undefined, weight: '500' | '600' | '700' | '800') =>
  family ? { fontFamily: family } : { fontWeight: weight };

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

export const FeedbackHeader: React.FC<{
  topInset: number;
  onBack: () => void;
  historyLabel?: string;
  onHistory?: () => void;
}> = ({ topInset, onBack, historyLabel, onHistory }) => {
  const { p, font } = useFeedbackTheme();
  return (
    <View style={[k.header, { paddingTop: Math.max(topInset, 12) + 8 }]}>
      <Pressable
        onPress={onBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={({ pressed }) => [
          k.backBtn,
          { backgroundColor: p.card, borderColor: p.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Feather name="arrow-left" size={18} color={p.isDark ? LIME : FOREST} />
      </Pressable>
      {historyLabel && onHistory ? (
        <Pressable
          onPress={onHistory}
          accessibilityRole="button"
          style={({ pressed }) => [k.historyPill, { backgroundColor: p.soft, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[k.historyPillText, { color: p.isDark ? LIME : FOREST }, ff(font.bold, '700')]}>
            {historyLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Dropdown                                                            */
/* ------------------------------------------------------------------ */

export type DropdownOption<T extends string> = {
  value: T;
  label: string;
  /** Optional element drawn before the label (a dot, an icon). */
  leading?: React.ReactNode;
};

const MENU_ROW = 46;
const MENU_PAD = 6;

export function DropdownField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose',
  allowClear = true,
  menuMinWidth = 230,
}: {
  label: string;
  value: T | '';
  options: DropdownOption<T>[];
  onChange: (value: T | '') => void;
  placeholder?: string;
  /** Tapping the selected option again clears it. */
  allowClear?: boolean;
  menuMinWidth?: number;
}) {
  const { p, font } = useFeedbackTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const anchor = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [frame, setFrame] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const selected = options.find((o) => o.value === value);

  const show = () => {
    anchor.current?.measureInWindow((x, y, w, h) => {
      setFrame({ x, y, w, h });
      setOpen(true);
    });
  };

  const menuW = Math.min(Math.max(frame.w, menuMinWidth), screenW - 32);
  const menuH = options.length * (MENU_ROW + 2) + MENU_PAD * 2;
  // Keep the menu on screen: align to the field's right edge when it would overflow.
  const left = Math.min(frame.x, screenW - 16 - menuW);
  const below = frame.y + frame.h + 6;
  const top = below + menuH > screenH - 24 ? Math.max(24, frame.y - 6 - menuH) : below;

  return (
    <>
      <Pressable
        ref={anchor}
        onPress={show}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected ? selected.label : placeholder}`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [
          k.dropdown,
          {
            backgroundColor: p.card,
            borderColor: open ? p.primary : p.border,
            borderWidth: open ? 1.5 : 1,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[k.fieldLabel, { color: p.muted }, ff(font.semi, '600')]}>{label}</Text>
          <View style={k.dropdownValueRow}>
            {selected?.leading}
            <Text
              style={[k.dropdownValue, { color: selected ? p.ink : p.placeholder }, ff(font.bold, '700')]}
              numberOfLines={1}
            >
              {selected ? selected.label : placeholder}
            </Text>
          </View>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={open ? p.primary : p.muted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
        <View
          style={[
            k.menu,
            { top, left, width: menuW, backgroundColor: p.menu, borderColor: p.isDark ? p.border : 'transparent' },
          ]}
          accessibilityRole="menu"
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <Pressable
                key={o.value}
                onPress={() => {
                  onChange(on && allowClear ? '' : o.value);
                  setOpen(false);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [
                  k.menuRow,
                  { backgroundColor: on ? p.soft : pressed ? p.divider : 'transparent' },
                ]}
              >
                {o.leading}
                <Text
                  style={[
                    k.menuText,
                    { color: on ? (p.isDark ? LIME : FOREST) : p.ink },
                    on ? ff(font.bold, '700') : ff(font.semi, '600'),
                  ]}
                  numberOfLines={1}
                >
                  {o.label}
                </Text>
                {on ? <Feather name="check" size={17} color={p.isDark ? LIME : FOREST} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </>
  );
}

/** Small coloured dot for dropdown values. */
export const Dot: React.FC<{ color: string }> = ({ color }) => (
  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
);

/** 1–3 ascending bars, used for impact levels. */
export const LevelBars: React.FC<{ level: 1 | 2 | 3 }> = ({ level }) => {
  const { p } = useFeedbackTheme();
  const on = p.isDark ? LIME : FOREST;
  return (
    <View style={k.bars}>
      {[6, 10, 14].map((h, i) => (
        <View key={h} style={[k.bar, { height: h, backgroundColor: i < level ? on : p.trackOff }]} />
      ))}
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Title + details card                                                */
/* ------------------------------------------------------------------ */

export const TextCard: React.FC<{
  titleLabel: string;
  titleValue: string;
  onTitleChange: (t: string) => void;
  titlePlaceholder: string;
  detailsLabel: string;
  detailsValue: string;
  onDetailsChange: (t: string) => void;
  detailsPlaceholder: string;
}> = (props) => {
  const { p, font } = useFeedbackTheme();
  const [focused, setFocused] = useState<'title' | 'details' | null>(null);
  const web = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null;

  return (
    <View style={[k.textCard, { backgroundColor: p.card, borderColor: focused ? p.primary : p.border, borderWidth: focused ? 1.5 : 1 }]}>
      <Text style={[k.fieldLabel, k.cardLabel, { color: p.muted }, ff(font.semi, '600')]}>{props.titleLabel}</Text>
      <TextInput
        value={props.titleValue}
        onChangeText={props.onTitleChange}
        onFocus={() => setFocused('title')}
        onBlur={() => setFocused(null)}
        placeholder={props.titlePlaceholder}
        placeholderTextColor={p.placeholder}
        maxLength={80}
        returnKeyType="next"
        style={[k.titleInput, { color: p.ink }, ff(font.bold, '700'), web]}
        accessibilityLabel={props.titleLabel}
      />
      <View style={[k.cardDivider, { backgroundColor: p.divider }]} />
      <Text style={[k.fieldLabel, k.cardLabel, { color: p.muted }, ff(font.semi, '600')]}>{props.detailsLabel}</Text>
      <TextInput
        value={props.detailsValue}
        onChangeText={props.onDetailsChange}
        onFocus={() => setFocused('details')}
        onBlur={() => setFocused(null)}
        placeholder={props.detailsPlaceholder}
        placeholderTextColor={p.placeholder}
        multiline
        maxLength={1000}
        textAlignVertical="top"
        style={[k.detailsInput, { color: p.ink }, ff(font.body, '500'), web]}
        accessibilityLabel={props.detailsLabel}
      />
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Switch                                                              */
/* ------------------------------------------------------------------ */

export const FormSwitch: React.FC<{ value: boolean; onValueChange: (v: boolean) => void; label: string }> = ({
  value,
  onValueChange,
  label,
}) => {
  const { p } = useFeedbackTheme();
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: true }).start();
  }, [value, anim]);

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      hitSlop={8}
      style={[k.switchTrack, { backgroundColor: value ? p.primary : p.trackOff }]}
    >
      <Animated.View
        style={[
          k.switchKnob,
          {
            backgroundColor: value ? (p.isDark ? FOREST : LIME) : '#FFFFFF',
            transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }],
          },
        ]}
      />
    </Pressable>
  );
};

/* ------------------------------------------------------------------ */
/* Send button                                                         */
/* ------------------------------------------------------------------ */

export const SendButton: React.FC<{
  label: string;
  ready: boolean;
  sending: boolean;
  onPress: () => void;
  bottomInset: number;
}> = ({ label, ready, sending, onPress, bottomInset }) => {
  const { p, font } = useFeedbackTheme();
  const fg = ready ? p.onPrimary : p.disabledFg;
  return (
    <View style={[k.footer, { backgroundColor: p.page, paddingBottom: Math.max(bottomInset, 12) + 10 }]}>
      <Pressable
        onPress={onPress}
        disabled={!ready || sending}
        accessibilityRole="button"
        accessibilityState={{ disabled: !ready || sending }}
        style={({ pressed }) => [
          k.cta,
          { backgroundColor: ready ? p.primary : p.disabledBg },
          pressed && ready && { transform: [{ scale: 0.98 }] },
        ]}
      >
        {sending ? (
          <ActivityIndicator color={p.onPrimary} />
        ) : (
          <>
            <Feather name="send" size={17} color={ready ? p.primaryIcon : fg} />
            <Text style={[k.ctaText, { color: fg }, ff(font.bold, '700')]}>{label}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

export const k = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  historyPill: { height: 36, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  historyPillText: { fontSize: 13 },

  title: { fontSize: 30, lineHeight: 34, letterSpacing: -0.6 },

  fieldLabel: { fontSize: 11.5 },

  dropdown: {
    flex: 1,
    height: 60,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dropdownValueRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
  dropdownValue: { fontSize: 15, flexShrink: 1 },

  menu: {
    position: 'absolute',
    borderRadius: 20,
    borderWidth: 1,
    padding: MENU_PAD,
    gap: 2,
    shadowColor: '#0B1F17',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  menuRow: {
    height: MENU_ROW,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuText: { flex: 1, fontSize: 14.5 },

  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14 },
  bar: { width: 4, borderRadius: 1 },

  textCard: { borderRadius: 20, overflow: 'hidden' },
  cardLabel: { paddingHorizontal: 16, paddingTop: 12 },
  titleInput: { fontSize: 15, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14 },
  cardDivider: { height: 1, marginHorizontal: 16 },
  detailsInput: {
    fontSize: 14.5,
    lineHeight: 21,
    minHeight: 104,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
  },

  switchTrack: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  switchKnob: { width: 22, height: 22, borderRadius: 11 },

  footer: { paddingHorizontal: 20, paddingTop: 12 },
  cta: { height: 54, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { fontSize: 15.5 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  errorText: { fontSize: 13, flex: 1 },

  historyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, paddingTop: 18, paddingBottom: 10 },
  historyTitle: { fontSize: 16 },
  historyCount: { fontSize: 12.5 },
  historyCard: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 16 },

  doneWrap: { flex: 1, paddingHorizontal: 24 },
  doneBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  doneCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontSize: 26, letterSpacing: -0.5, marginTop: 22, textAlign: 'center' },
  doneText: { fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center', maxWidth: 300 },
  doneCta: { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  secondary: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
