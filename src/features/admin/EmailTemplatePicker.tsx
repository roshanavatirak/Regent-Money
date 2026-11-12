import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminTheme, ff, FOREST } from './adminTheme';
import { EMAIL_TEMPLATES, TEMPLATE_GROUPS, EmailTemplate, isRequiredCategory, firstButtonText } from './emailTemplates';

const APP_ICON = require('../../../assets/appicon.png');

/** Small picture of an email: logo row, card with label, headline, text lines and (if any) a button. */
export const EmailThumb: React.FC<{ label?: string | null; headline: string; hasButton: boolean; neutral?: boolean; height?: number }> = ({
  label,
  headline,
  hasButton,
  neutral,
  height = 140,
}) => (
  <View style={[thumb.wrap, { height }]}>
    <View style={thumb.logoRow}>
      <Image source={APP_ICON} style={thumb.logo} />
      <Text style={thumb.brand}>Regent Money</Text>
    </View>
    <View style={thumb.card}>
      {!!label && (
        <Text style={[thumb.label, { color: neutral ? '#5B6B63' : '#0B6B3A' }]} numberOfLines={1}>
          {label.toUpperCase()}
        </Text>
      )}
      <Text style={thumb.headline} numberOfLines={2}>
        {headline || 'Subject'}
      </Text>
      <View style={[thumb.line, { width: '100%' }]} />
      <View style={[thumb.line, { width: '84%' }]} />
      <View style={[thumb.line, { width: '58%' }]} />
      {hasButton && <View style={thumb.button} />}
    </View>
  </View>
);

export const EmailTemplatePicker: React.FC<{
  visible: boolean;
  selectedId: string | null;
  onClose: () => void;
  onPick: (t: EmailTemplate | null) => void;
}> = ({ visible, selectedId, onClose, onPick }) => {
  const insets = useSafeAreaInsets();
  const { p, font, isDark } = useAdminTheme();
  const [group, setGroup] = useState<(typeof TEMPLATE_GROUPS)[number]>('All');
  const shown = EMAIL_TEMPLATES.filter((t) => group === 'All' || t.group === group);
  const accent = isDark ? '#B8F36B' : FOREST;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: p.bg, paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Back"
            activeOpacity={0.7}
            style={[styles.iconBtn, { borderColor: p.line, backgroundColor: p.card }]}
          >
            <Feather name="arrow-left" size={18} color={p.text} />
          </TouchableOpacity>
          <Text style={[styles.title, ff(font.displayBold, '700'), { color: p.text }]}>Templates</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipScroll}>
          {TEMPLATE_GROUPS.map((g) => {
            const on = g === group;
            return (
              <TouchableOpacity
                key={g}
                onPress={() => setGroup(g)}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[
                  styles.chip,
                  on ? { backgroundColor: p.segActive, borderColor: p.segActive } : { backgroundColor: p.card, borderColor: p.line },
                ]}
              >
                <Text style={[styles.chipText, ff(font.bodySemi, '600'), { color: on ? p.segActiveText : p.sub }]}>{g}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
          <TouchableOpacity
            onPress={() => onPick(null)}
            activeOpacity={0.8}
            style={[styles.blank, { backgroundColor: p.card, borderColor: p.line }]}
          >
            <View style={[styles.blankIcon, { backgroundColor: p.soft }]}>
              <Feather name="plus" size={18} color={p.text} />
            </View>
            <View>
              <Text style={[styles.cardName, ff(font.bodySemi, '600'), { color: p.text }]}>Blank email</Text>
              <Text style={[styles.cardNote, ff(font.body, '500'), { color: p.sub }]}>Start from an empty message</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.grid}>
            {shown.map((t) => {
              const sel = t.id === selectedId;
              const required = isRequiredCategory(t.category);
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => onPick(t)}
                  activeOpacity={0.85}
                  accessibilityLabel={`${t.name} template`}
                  accessibilityState={{ selected: sel }}
                  style={[
                    styles.card,
                    { backgroundColor: p.card, borderColor: sel ? accent : p.line, borderWidth: sel ? 2 : 1 },
                  ]}
                >
                  <EmailThumb label={t.label} headline={t.subject} hasButton={!!firstButtonText(t.bodyMarkdown)} neutral={required} />
                  <View style={styles.cardFoot}>
                    <View style={styles.cardNameRow}>
                      <Text style={[styles.cardName, ff(font.bodySemi, '600'), { color: p.text }]} numberOfLines={1}>
                        {t.name}
                      </Text>
                      {sel && <Feather name="check" size={16} color={accent} />}
                    </View>
                    <Text style={[styles.cardNote, ff(font.body, '500'), { color: p.sub }]}>
                      {required ? 'Sent to everyone' : 'Has unsubscribe link'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const thumb = StyleSheet.create({
  wrap: { backgroundColor: '#F3F6F4', padding: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: '#E1E9E4' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  logo: { width: 10, height: 10, borderRadius: 3 },
  brand: { fontSize: 7, fontWeight: '700', color: '#0E1F17' },
  card: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E9E4', borderRadius: 5, padding: 8, gap: 4 },
  label: { fontSize: 6, fontWeight: '700', letterSpacing: 0.4 },
  headline: { fontSize: 9.5, lineHeight: 12, fontWeight: '700', color: '#0E1F17' },
  line: { height: 3, borderRadius: 2, backgroundColor: '#E1E9E4' },
  button: { marginTop: 'auto', width: 46, height: 9, borderRadius: 3, backgroundColor: '#0B3D2C' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  iconBtn: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, letterSpacing: -0.3 },
  chipScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13 },
  list: { paddingHorizontal: 16, gap: 14 },
  blank: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed' },
  blankIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  card: { width: '48.4%', borderRadius: 14, overflow: 'hidden' },
  cardFoot: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 3 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  cardName: { fontSize: 14 },
  cardNote: { fontSize: 11.5 },
});
