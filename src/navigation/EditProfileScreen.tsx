import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useAuthStore } from '../store';
import { authService } from '../services/authService';

export const EditProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const user = useAuthStore((state) => state.user);

  const [name, setName] = useState(user?.name || '');
  const [dob, setDob] = useState(user?.dob || '');
  const [gender, setGender] = useState(user?.gender || 'Male');
  const [occupation, setOccupation] = useState(user?.occupation || 'Salaried');
  const [income, setIncome] = useState(user?.currentIncome ? String(user.currentIncome) : '75000');
  const [sourcesCount, setSourcesCount] = useState(user?.incomeSourcesCount || 1);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const parsedIncome = parseFloat(income.replace(/[^0-9.]/g, '')) || 0;
      await authService.updateProfile({
        name: name.trim() || user?.name || 'User',
        dob: dob.trim() || undefined,
        gender,
        occupation,
        currentIncome: parsedIncome,
        incomeSourcesCount: sourcesCount,
      });
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Save Failed', err?.message || 'Failed to update profile information.');
    } finally {
      setLoading(false);
    }
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
          <Text style={styles.headerTitle}>Edit Profile Information</Text>
          <Text style={styles.headerSubtitle}>Customize your personal and financial attributes</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        >
          {/* Full Name */}
          <Text style={styles.formFieldLabel}>FULL NAME</Text>
          <TextInput
            style={styles.formInput}
            value={name}
            onChangeText={setName}
            placeholder="Your Full Name"
            placeholderTextColor={colors.textTertiary}
          />

          {/* Date of Birth */}
          <Text style={styles.formFieldLabel}>DATE OF BIRTH (DD / MM / YYYY)</Text>
          <TextInput
            style={styles.formInput}
            value={dob}
            onChangeText={setDob}
            placeholder="e.g. 15/08/1998"
            placeholderTextColor={colors.textTertiary}
          />

          {/* Gender */}
          <Text style={styles.formFieldLabel}>GENDER</Text>
          <View style={styles.pillRow}>
            {['Male', 'Female', 'Other', 'Prefer not to say'].map((gen) => {
              const isSel = gender === gen;
              return (
                <TouchableOpacity
                  key={gen}
                  onPress={() => setGender(gen)}
                  style={[styles.smallPill, isSel && styles.smallPillActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.smallPillText, isSel && styles.smallPillTextActive]}>{gen}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Occupation */}
          <Text style={styles.formFieldLabel}>OCCUPATION</Text>
          <View style={styles.pillRow}>
            {['Salaried', 'Business Owner', 'Freelancer', 'Student', 'Professional'].map((occ) => {
              const isSel = occupation === occ;
              return (
                <TouchableOpacity
                  key={occ}
                  onPress={() => setOccupation(occ)}
                  style={[styles.smallPill, isSel && styles.smallPillActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.smallPillText, isSel && styles.smallPillTextActive]}>{occ}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Monthly Income */}
          <Text style={styles.formFieldLabel}>CURRENT MONTHLY INCOME (₹)</Text>
          <TextInput
            style={styles.formInput}
            value={income}
            onChangeText={setIncome}
            placeholder="e.g. 75000"
            keyboardType="numeric"
            placeholderTextColor={colors.textTertiary}
          />

          {/* Number of Income Streams */}
          <Text style={styles.formFieldLabel}>NUMBER OF INCOME SOURCES</Text>
          <View style={styles.streamRow}>
            {[1, 2, 3, 4].map((count) => {
              const isSel = sourcesCount === count;
              return (
                <TouchableOpacity
                  key={count}
                  onPress={() => setSourcesCount(count)}
                  style={[styles.streamPill, isSel && styles.streamPillActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.streamPillText, isSel && styles.streamPillTextActive]}>
                    {count}{count === 4 ? '+' : ''} Stream{count > 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="check" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.saveBtnText}>Save Profile Details</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
      paddingTop: 12,
    },
    formFieldLabel: {
      fontSize: 10.5,
      fontWeight: '800',
      letterSpacing: 1,
      color: colors.textSecondary,
      marginTop: 14,
      marginBottom: 6,
    },
    formInput: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      fontSize: 13.5,
      color: colors.text,
      fontWeight: '600',
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 4,
    },
    smallPill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    smallPillActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    smallPillText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.text,
    },
    smallPillTextActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    streamRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 8,
    },
    streamPill: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    streamPillActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    streamPillText: {
      fontSize: 11.5,
      fontWeight: '600',
      color: colors.text,
    },
    streamPillTextActive: {
      color: '#ffffff',
      fontWeight: '700',
    },
    saveBtn: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 24,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 4,
    },
    saveBtnText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '800',
    },
  });
