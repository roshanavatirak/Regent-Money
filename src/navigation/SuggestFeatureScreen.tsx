import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, showGlobalConfirm } from '../store';

const FEATURE_CATEGORIES = [
  'AI Intelligence',
  'Bank Sync',
  'Budgeting',
  'Analytics',
  'Net Worth',
  'Interface',
  'Other',
];

const IMPACT_LEVELS = [
  'Nice to Have',
  'High Value',
  'Game Changer',
];

export const SuggestFeatureScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();

  const [category, setCategory] = useState(FEATURE_CATEGORIES[0]);
  const [impact, setImpact] = useState(IMPACT_LEVELS[1]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = () => {
    if (!title.trim() || !description.trim()) {
      showGlobalConfirm({
        title: 'Missing Details',
        message: 'Please provide both a title and description for your feature suggestion.',
        confirmText: 'OK',
        icon: 'alert-triangle',
        onConfirm: () => {},
      });
      return;
    }

    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      showGlobalConfirm({
        title: 'Suggestion Received!',
        message: 'Thank you for helping shape Regent Money. Your suggestion has been dispatched directly to our product architecture board.',
        confirmText: 'Back to App',
        icon: 'info',
        onConfirm: () => {
          navigation.goBack();
        },
      });
    }, 700);
  };

  const styles = getStyles(colors, isDark);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>Suggest a Feature</Text>
          <Text style={styles.headerSubtitle}>Share product ideas directly with our team</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* Intro Card */}
        <View style={styles.bannerCard}>
          <View style={styles.bannerIconBox}>
            <Ionicons name="bulb-outline" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Client-Driven Innovation</Text>
            <Text style={styles.bannerSub}>
              We prioritize features directly requested by private wealth clients. Tell us what would simplify your financial life.
            </Text>
          </View>
        </View>

        {/* Category Picker */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>CATEGORY</Text>
          <View style={styles.pillWrap}>
            {FEATURE_CATEGORIES.map((cat) => {
              const isSelected = category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setCategory(cat)}
                  style={[styles.pill, isSelected && styles.pillActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Impact Level */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>EXPECTED IMPACT</Text>
          <View style={styles.impactRow}>
            {IMPACT_LEVELS.map((lvl) => {
              const isSelected = impact === lvl;
              return (
                <TouchableOpacity
                  key={lvl}
                  onPress={() => setImpact(lvl)}
                  style={[styles.impactPill, isSelected && styles.impactPillActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.impactPillText, isSelected && styles.impactPillTextActive]}>
                    {lvl}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Form Fields */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>FEATURE TITLE</Text>
          <TextInput
            style={styles.textInput}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Export monthly tax reports to PDF/Excel"
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={[styles.sectionLabel, { marginTop: 14 }]}>USE CASE & WORKFLOW</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the workflow you want, how it should work, and why it would be valuable..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Feather name="send" size={15} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>Submit Suggestion</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.buttonSecondaryBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.text,
    },
    headerSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 16,
      gap: 14,
    },
    bannerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.08)' : '#f0fdf4',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(45, 186, 78, 0.25)' : '#bbf7d0',
      padding: 14,
      gap: 12,
    },
    bannerIconBox: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(45, 186, 78, 0.1)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    bannerTitle: {
      fontSize: 13.5,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 3,
    },
    bannerSub: {
      fontSize: 11.5,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    sectionLabel: {
      fontSize: 10.5,
      fontWeight: '800',
      letterSpacing: 0.8,
      color: colors.textSecondary,
      marginBottom: 10,
    },
    pillWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    pill: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc',
      borderWidth: 1,
      borderColor: colors.border,
    },
    pillActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    pillText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
    pillTextActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    impactRow: {
      flexDirection: 'row',
      gap: 8,
    },
    impactPill: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc',
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    impactPillActive: {
      backgroundColor: isDark ? 'rgba(45, 186, 78, 0.18)' : '#e6f7ec',
      borderColor: colors.accent,
    },
    impactPillText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    impactPillTextActive: {
      color: colors.accent,
      fontWeight: '800',
    },
    textInput: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
      color: colors.text,
    },
    textArea: {
      minHeight: 110,
      paddingTop: 10,
      lineHeight: 19,
    },
    submitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
      paddingVertical: 14,
      borderRadius: 12,
      marginTop: 4,
    },
    submitBtnText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
    },
  });
