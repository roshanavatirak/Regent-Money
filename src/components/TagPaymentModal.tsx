import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import {
  PAYTM_TRANSACTION_TAGS,
  TransactionTagDef,
  getTagDef,
} from '../constants/transactionTags';
import { tagLearningService } from '../services/tagLearningService';

interface TagPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  selectedTag: string;
  onSelectTag: (tag: string) => void;
  merchantName?: string;
  isDark: boolean;
  colors: any;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_WIDTH = (SCREEN_WIDTH - 64) / 4;

export const TagPaymentModal: React.FC<TagPaymentModalProps> = ({
  visible,
  onClose,
  selectedTag,
  onSelectTag,
  merchantName,
  isDark,
  colors,
}) => {
  const [currentSelected, setCurrentSelected] = useState(selectedTag || 'miscellaneous');
  const [customTags, setCustomTags] = useState<string[]>(() =>
    tagLearningService.getCustomTags()
  );
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const [errorText, setErrorText] = useState('');

  // Update selection if prop changes
  React.useEffect(() => {
    if (visible) {
      setCurrentSelected(selectedTag || 'miscellaneous');
      setIsCreatingNew(false);
      setNewTagInput('');
      setErrorText('');
      setCustomTags(tagLearningService.getCustomTags());
    }
  }, [visible, selectedTag]);

  const handleCreateCustomTag = () => {
    const clean = newTagInput.trim();
    if (!clean) {
      setErrorText('Please enter a tag name');
      return;
    }
    if (clean.length < 2) {
      setErrorText('Tag name is too short');
      return;
    }

    const updated = tagLearningService.addCustomTag(clean);
    setCustomTags(updated);
    setCurrentSelected(clean.toLowerCase());
    setIsCreatingNew(false);
    setNewTagInput('');
    setErrorText('');
  };

  const handleConfirm = () => {
    onSelectTag(currentSelected);
    if (merchantName) {
      tagLearningService.saveLearnedTag(merchantName, currentSelected);
    }
    onClose();
  };

  const renderTagItem = (item: TransactionTagDef, isCustom = false) => {
    const isSelected =
      currentSelected.toLowerCase() === item.id.toLowerCase() ||
      currentSelected.toLowerCase() === item.label.toLowerCase();

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.gridItem}
        onPress={() => setCurrentSelected(item.id)}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.iconCard,
            {
              backgroundColor: isDark ? item.bgColorDark : item.bgColorLight,
              borderColor: isSelected
                ? '#002E6E'
                : isDark
                ? 'transparent'
                : 'rgba(0,0,0,0.04)',
              borderWidth: isSelected ? 2 : 1,
            },
          ]}
        >
          {item.iconType === 'ionicons' ? (
            <Ionicons
              name={item.iconName as any}
              size={26}
              color={item.iconColor}
            />
          ) : (
            <Feather
              name={item.iconName as any}
              size={24}
              color={item.iconColor}
            />
          )}

          {isSelected && (
            <View style={styles.selectedBadge}>
              <Ionicons name="checkmark" size={11} color="#FFFFFF" />
            </View>
          )}
        </View>

        <Text
          numberOfLines={2}
          style={[
            styles.tagLabel,
            {
              color: isSelected
                ? isDark
                  ? '#60A5FA'
                  : '#002E6E'
                : isDark
                ? '#D1D5DB'
                : '#4B5563',
              fontWeight: isSelected ? '800' : '500',
            },
          ]}
        >
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: isDark ? '#14141E' : '#FFFFFF',
              borderColor: isDark ? '#2D2D3D' : '#E5E7EB',
            },
          ]}
        >
          {/* Top Grabber */}
          <View style={styles.grabberWrap}>
            <View
              style={[
                styles.grabber,
                { backgroundColor: isDark ? '#3D3D52' : '#E2E8F0' },
              ]}
            />
          </View>

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.title,
                  { color: isDark ? '#FFFFFF' : '#111827' },
                ]}
              >
                Tag your payment
              </Text>
              <Text style={styles.subtitle}>
                Tags help you categorise payments for better spending insights
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeBtn,
                { backgroundColor: isDark ? '#232332' : '#F3F4F6' },
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather
                name="x"
                size={16}
                color={isDark ? '#9CA3AF' : '#6B7280'}
              />
            </TouchableOpacity>
          </View>

          {/* Section: Recommended Tags */}
          <Text
            style={[
              styles.sectionTitle,
              { color: isDark ? '#9CA3AF' : '#1F2937' },
            ]}
          >
            Recommended Tags
          </Text>

          {/* Grid Scroll Area */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Custom User Tags (if any) */}
            {customTags.length > 0 && (
              <View style={styles.customTagsSection}>
                <Text
                  style={[
                    styles.customSectionLabel,
                    { color: isDark ? '#818CF8' : '#4F46E5' },
                  ]}
                >
                  YOUR CUSTOM TAGS
                </Text>
                <View style={styles.grid}>
                  {customTags.map((tagName) =>
                    renderTagItem(getTagDef(tagName), true)
                  )}
                </View>
              </View>
            )}

            {/* Standard Paytm Tags Grid */}
            <View style={styles.grid}>
              {PAYTM_TRANSACTION_TAGS.map((tag) => renderTagItem(tag))}
            </View>

            {/* Didn't find right tag banner */}
            <View
              style={[
                styles.createBanner,
                {
                  backgroundColor: isDark ? '#1C1C29' : '#F9FAFB',
                  borderColor: isDark ? '#2D2D3D' : '#E5E7EB',
                },
              ]}
            >
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text
                  style={[
                    styles.createBannerTitle,
                    { color: isDark ? '#FFFFFF' : '#111827' },
                  ]}
                >
                  Didn’t find the right tag?
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.createBtn,
                  { borderColor: isDark ? '#6366F1' : '#002E6E' },
                ]}
                onPress={() => setIsCreatingNew(!isCreatingNew)}
                activeOpacity={0.8}
              >
                <Feather
                  name={isCreatingNew ? 'minus' : 'plus'}
                  size={14}
                  color={isDark ? '#818CF8' : '#002E6E'}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.createBtnText,
                    { color: isDark ? '#818CF8' : '#002E6E' },
                  ]}
                >
                  {isCreatingNew ? 'Cancel' : 'Create New'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Inline Custom Tag Input */}
            {isCreatingNew && (
              <View
                style={[
                  styles.inlineInputBox,
                  {
                    backgroundColor: isDark ? '#232333' : '#F3F4F6',
                    borderColor: errorText
                      ? '#EF4444'
                      : isDark
                      ? '#3D3D52'
                      : '#D1D5DB',
                  },
                ]}
              >
                <Feather
                  name="tag"
                  size={16}
                  color={isDark ? '#9CA3AF' : '#6B7280'}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  style={[
                    styles.inlineTextInput,
                    { color: isDark ? '#FFFFFF' : '#111827' },
                  ]}
                  placeholder="Enter tag name (e.g. Pet Care, Gaming)..."
                  placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                  value={newTagInput}
                  onChangeText={(txt) => {
                    setErrorText('');
                    setNewTagInput(txt);
                  }}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreateCustomTag}
                />
                <TouchableOpacity
                  style={[
                    styles.inlineSaveBtn,
                    { backgroundColor: isDark ? '#6366F1' : '#002E6E' },
                  ]}
                  onPress={handleCreateCustomTag}
                  activeOpacity={0.8}
                >
                  <Text style={styles.inlineSaveBtnText}>Add</Text>
                </TouchableOpacity>
              </View>
            )}

            {errorText ? (
              <Text style={styles.errorText}>{errorText}</Text>
            ) : null}

            {merchantName && (
              <View style={styles.memoryHintWrap}>
                <Feather name="check-circle" size={13} color="#10B981" style={{ marginRight: 6 }} />
                <Text style={styles.memoryHintText}>
                  Future transactions from "{merchantName}" will automatically use this tag.
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Bottom Primary CTA Button */}
          <View style={styles.footerWrap}>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: isDark ? '#6366F1' : '#002E6E' },
              ]}
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Tag Payment</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  sheetContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  grabberWrap: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#8E8E9F',
    lineHeight: 16,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 20,
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  iconCard: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  selectedBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#002E6E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  tagLabel: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 14,
  },
  customTagsSection: {
    marginBottom: 10,
  },
  customSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  createBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 8,
  },
  createBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  createBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  inlineInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  inlineTextInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  inlineSaveBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginLeft: 8,
  },
  inlineSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 11,
    marginTop: 4,
    paddingHorizontal: 4,
    fontWeight: '600',
  },
  memoryHintWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  memoryHintText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  footerWrap: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  primaryBtn: {
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#002E6E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
