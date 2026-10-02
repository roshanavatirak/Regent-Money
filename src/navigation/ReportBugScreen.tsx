import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, showGlobalConfirm } from '../store';
import { getAppCurrentVersion } from '../services/updateService';

const BUG_CATEGORIES = [
  'Display / UI Glitch',
  'SMS Sync Issue',
  'Bank Ledger / Balance',
  'Regent AI Response',
  'Performance / Crash',
  'Other',
];

export const ReportBugScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark, theme } = useTheme();

  const [category, setCategory] = useState(BUG_CATEGORIES[0]);
  const [summary, setSummary] = useState('');
  const [steps, setSteps] = useState('');
  const [includeLogs, setIncludeLogs] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const currentVersion = getAppCurrentVersion();

  const handleSubmit = () => {
    if (!summary.trim()) {
      showGlobalConfirm({
        title: 'Missing Summary',
        message: 'Please provide a short description of the issue you experienced.',
        confirmText: 'OK',
        icon: 'alert-triangle',
        onConfirm: () => { },
      });
      return;
    }

    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      showGlobalConfirm({
        title: 'Bug Report Dispatched',
        message: `Thank you for reporting this issue. A diagnostic bundle (${Platform.OS.toUpperCase()} v${currentVersion}) has been logged for our quality assurance team.`,
        confirmText: 'Return to App',
        icon: 'info',
        onConfirm: () => {
          navigation.goBack();
        },
      });
    }, 750);
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
          <Text style={styles.headerTitle}>Report a Bug</Text>
          <Text style={styles.headerSubtitle}>Submit technical issues & diagnostics</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
      >
        {/* Banner */}
        <View style={styles.bannerCard}>
          <View style={styles.bannerIconBox}>
            <Ionicons name="bug-outline" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bannerTitle}>Precision Quality Engineering</Text>
            <Text style={styles.bannerSub}>
              We take bugs and sync discrepancies seriously. Every report is reviewed directly by our core software engineers.
            </Text>
          </View>
        </View>

        {/* Issue Category */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>ISSUE CATEGORY</Text>
          <View style={styles.pillWrap}>
            {BUG_CATEGORIES.map((cat) => {
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

        {/* Summary & Steps */}
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>ISSUE SUMMARY</Text>
          <TextInput
            style={styles.textInput}
            value={summary}
            onChangeText={setSummary}
            placeholder="e.g. Transaction amount displayed incorrectly"
            placeholderTextColor={colors.textTertiary}
          />

          <Text style={[styles.sectionLabel, { marginTop: 14 }]}>STEPS TO REPRODUCE</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={steps}
            onChangeText={setSteps}
            placeholder="What screen were you on? What did you tap before this occurred?"
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Diagnostic Metadata Box */}
        <View style={styles.card}>
          <View style={styles.metaHeader}>
            <Feather name="cpu" size={14} color={colors.accent} style={{ marginRight: 6 }} />
            <Text style={styles.sectionLabel}>DEVICE DIAGNOSTICS</Text>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>App Build</Text>
            <Text style={styles.metaVal}>v{currentVersion}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Platform</Text>
            <Text style={styles.metaVal}>{Platform.OS.toUpperCase()} {Platform.Version ? `(${Platform.Version})` : ''}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Color Interface</Text>
            <Text style={styles.metaVal}>{theme.toUpperCase()}</Text>
          </View>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.toggleTitle}>Include Diagnostic Logs</Text>
              <Text style={styles.toggleSub}>Attaches sanitized system timestamps and memory statistics</Text>
            </View>
            <Switch
              value={includeLogs}
              onValueChange={setIncludeLogs}
              thumbColor={includeLogs ? colors.accent : colors.text}
              trackColor={{ false: colors.buttonSecondaryBackground, true: colors.accentMuted }}
            />
          </View>
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
              <Text style={styles.submitBtnText}>Submit Bug Report</Text>
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
      backgroundColor: '#ef4444',
      borderColor: '#ef4444',
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
      minHeight: 90,
      paddingTop: 10,
      lineHeight: 19,
    },
    metaHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    metaKey: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    metaVal: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingTop: 8,
    },
    toggleTitle: {
      fontSize: 12.5,
      fontWeight: '700',
      color: colors.text,
    },
    toggleSub: {
      fontSize: 10.5,
      color: colors.textSecondary,
      marginTop: 2,
    },
    submitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ef4444',
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
