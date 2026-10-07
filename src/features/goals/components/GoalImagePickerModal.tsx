import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../../store';
import type { Goal } from '../services/goalPacingService';
import {
  GOAL_COVER_PRESETS,
  GoalCoverPreset,
  getCoverImageUri,
} from '../services/goalIllustrationMap';

interface GoalImagePickerModalProps {
  goal: Goal | null;
  visible: boolean;
  onClose: () => void;
  onSelectPreset: (goalId: string, presetKey: string) => void;
  onCustomImagePicked: (goalId: string, imageUri: string) => void;
  onResetToAuto: (goalId: string) => void;
}

export const GoalImagePickerModal: React.FC<GoalImagePickerModalProps> = ({
  goal,
  visible,
  onClose,
  onSelectPreset,
  onCustomImagePicked,
  onResetToAuto,
}) => {
  const { colors, isDark } = useTheme();

  if (!goal) return null;

  const currentCoverUri = getCoverImageUri(goal);

  const handlePickFromLibrary = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(
            'Permission Required',
            'Please allow photo library access to upload a custom cover photo.'
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const pickedUri = result.assets[0].uri;
        onCustomImagePicked(goal.id, pickedUri);
        onClose();
      }
    } catch (err) {
      console.warn('Error picking image:', err);
    }
  };

  const handleSelectPreset = (preset: GoalCoverPreset) => {
    onSelectPreset(goal.id, preset.key);
    onClose();
  };

  const handleResetAuto = () => {
    onResetToAuto(goal.id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.dismissOverlay}
          activeOpacity={1}
          onPress={onClose}
        />

        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Handlebar */}
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>
                Goal Cover Image
              </Text>
              <Text
                style={[styles.subtitle, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {goal.name}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeBtn,
                { backgroundColor: colors.buttonSecondaryBackground },
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Current Cover Preview */}
          <View style={styles.previewContainer}>
            <Image
              source={{ uri: currentCoverUri }}
              style={styles.previewImage}
              resizeMode="cover"
            />
            <View
              style={[
                styles.previewBadge,
                {
                  backgroundColor: isDark ? 'rgba(36, 41, 46, 0.85)' : 'rgba(15, 23, 42, 0.75)',
                },
              ]}
            >
              <Ionicons name="image" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.previewBadgeText}>Active Cover</Text>
            </View>
          </View>

          {/* Action Buttons Row */}
          <View style={styles.actionRow}>
            {/* Upload Button */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handlePickFromLibrary}
              style={[styles.actionBtn, { backgroundColor: colors.accent }]}
            >
              <Ionicons name="cloud-upload-outline" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.actionBtnText}>Upload Photo</Text>
            </TouchableOpacity>

            {/* Auto Detect / Reset */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleResetAuto}
              style={[
                styles.actionBtnSecondary,
                {
                  backgroundColor: colors.buttonSecondaryBackground,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons name="sparkles-outline" size={15} color={colors.text} style={{ marginRight: 6 }} />
              <Text style={[styles.actionBtnSecondaryText, { color: colors.text }]}>
                Auto-match
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            OR CHOOSE A CURATED THEME
          </Text>

          {/* Curated Presets Grid */}
          <ScrollView
            style={styles.presetScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.presetGrid}
          >
            {GOAL_COVER_PRESETS.map((preset) => {
              const isSelected =
                !goal.coverImageUri &&
                (goal.coverPresetKey === preset.key ||
                  (!goal.coverPresetKey && currentCoverUri === preset.imageUri));

              return (
                <TouchableOpacity
                  key={preset.key}
                  activeOpacity={0.82}
                  onPress={() => handleSelectPreset(preset)}
                  style={[
                    styles.presetCard,
                    {
                      borderColor: isSelected ? colors.accent : colors.border,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}
                >
                  <Image
                    source={{ uri: preset.imageUri }}
                    style={styles.presetThumb}
                    resizeMode="cover"
                  />
                  <View style={styles.presetScrim}>
                    <Text style={styles.presetLabel} numberOfLines={1}>
                      {preset.label}
                    </Text>
                  </View>
                  {isSelected ? (
                    <View style={[styles.selectedCheck, { backgroundColor: colors.accent }]}>
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  dismissOverlay: {
    flex: 1,
  },
  sheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: '82%',
  },
  handleBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148, 163, 184, 0.4)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContainer: {
    height: 96,
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 14,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  previewBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  presetScroll: {
    maxHeight: 250,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 16,
  },
  presetCard: {
    width: '48.5%',
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  presetThumb: {
    width: '100%',
    height: '100%',
  },
  presetScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  presetLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  selectedCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: '#10B981',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
