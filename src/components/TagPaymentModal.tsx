import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Switch,
  Platform,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CATEGORIES,
  CATEGORY_GROUPS,
  CategoryDef,
  getCategory,
  searchCategories,
} from '../constants/categories';
import { CategoryIcon } from './CategoryIcon';
import { tagLearningService } from '../services/tagLearningService';
import { usePeerStore } from '../store';

interface TagPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  selectedTag: string;
  onSelectTag: (tag: string, updatePayeeRule?: boolean) => void;
  merchantName?: string;
  transactionType?: 'credit' | 'debit';
  isDark: boolean;
  colors: any;
}

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

export const TagPaymentModal: React.FC<TagPaymentModalProps> = ({
  visible,
  onClose,
  selectedTag,
  onSelectTag,
  merchantName,
  transactionType = 'debit',
  isDark,
  colors,
}) => {
  const insets = useSafeAreaInsets();

  const [current, setCurrent] = useState(selectedTag || 'miscellaneous');
  const [customTags, setCustomTags] = useState<string[]>(() => tagLearningService.getCustomTags());
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [errorText, setErrorText] = useState('');
  const [rememberForPayee, setRememberForPayee] = useState(false);

  useEffect(() => {
    if (visible) {
      setCurrent(selectedTag || 'miscellaneous');
      setCustomTags(tagLearningService.getCustomTags());
      setQuery('');
      setIsCreating(false);
      setNewTag('');
      setErrorText('');
      setRememberForPayee(false);
    }
  }, [visible, selectedTag]);

  const sheetBg = isDark ? colors.background : '#F3F6F4';
  const cardBg = colors.card;
  const line = isDark ? colors.border : '#DCE5E0';
  const ink = colors.text;
  const muted = colors.textSecondary;

  const currentCat = getCategory(current);
  const isSelected = (value: string) => getCategory(value).id === currentCat.id;

  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    return {
      builtIn: searchCategories(query),
      custom: customTags.filter((t) => t.toLowerCase().includes(q)),
    };
  }, [query, customTags]);

  const handleCreate = (name: string = newTag) => {
    const clean = name.trim();
    if (!clean) {
      setErrorText('Enter a name for your tag.');
      return;
    }
    if (clean.length < 2) {
      setErrorText('Use at least 2 characters.');
      return;
    }
    const updated = tagLearningService.addCustomTag(clean);
    setCustomTags(updated);
    setCurrent(clean.toLowerCase());
    setQuery('');
    setIsCreating(false);
    setNewTag('');
    setErrorText('');
  };

  const handleConfirm = () => {
    if (current.startsWith('peer_') && merchantName) {
      usePeerStore.getState().findOrCreateContact(merchantName);
    }
    onSelectTag(current, merchantName ? rememberForPayee : undefined);
    onClose();
  };

  const renderTile = (value: string, label: string) => {
    const selected = isSelected(value);
    return (
      <Pressable
        key={value}
        onPress={() => setCurrent(value)}
        style={styles.tile}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
      >
        <CategoryIcon category={value} size={56} selected={selected} backgroundColor={sheetBg} />
        <Text
          numberOfLines={1}
          style={[
            styles.tileLabel,
            { color: selected ? ink : isDark ? 'rgba(234, 242, 238, 0.82)' : '#26332D' },
            selected && { fontWeight: '700' },
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const renderBuiltIn = (cats: CategoryDef[]) => (
    <View style={styles.grid}>{cats.map((c) => renderTile(c.id, c.label))}</View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />

        <View style={[styles.sheet, { backgroundColor: sheetBg }]}>
          <View style={[styles.grabber, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#C9D4CE' }]} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: ink }]}>Tag this payment</Text>
              {merchantName ? (
                <View style={styles.payeeRow}>
                  <View style={[styles.payeeAvatar, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E9EFEB' }]}>
                    <Text style={{ color: isDark ? LIME : FOREST, fontSize: 12, fontWeight: '700' }}>
                      {merchantName.trim().charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={{ color: muted, fontSize: 14 }} numberOfLines={1}>
                    Paid to <Text style={{ color: ink, fontWeight: '700' }}>{merchantName}</Text>
                  </Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: cardBg, borderColor: line }]}
              accessibilityLabel="Close"
            >
              <Feather name="x" size={18} color={ink} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={[styles.search, { backgroundColor: cardBg, borderColor: line }]}>
            <Feather name="search" size={17} color={muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search tags"
              placeholderTextColor={muted}
              style={[styles.searchInput, { color: ink }]}
              autoCorrect={false}
              accessibilityLabel="Search tags"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
                <Feather name="x-circle" size={16} color={muted} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {searchResults ? (
              <>
                {searchResults.builtIn.length + searchResults.custom.length === 0 ? (
                  <Text style={[styles.emptyText, { color: muted }]}>
                    No tag called "{query.trim()}". Create it below.
                  </Text>
                ) : (
                  <>
                    <Text style={[styles.groupTitle, { color: muted }]}>Results</Text>
                    <View style={styles.grid}>
                      {searchResults.builtIn.map((c) => renderTile(c.id, c.label))}
                      {searchResults.custom.map((t) => renderTile(t.toLowerCase(), getCategory(t).label))}
                    </View>
                  </>
                )}
              </>
            ) : (
              <>
                {CATEGORY_GROUPS.map((g) => (
                  <View key={g.id}>
                    <Text style={[styles.groupTitle, { color: muted }]}>{g.label}</Text>
                    {renderBuiltIn(CATEGORIES.filter((c) => c.group === g.id && !c.id.startsWith('peer_')))}
                  </View>
                ))}

                {/* Friends & Lending (Direction-Aware: 2 contextual options) - Placed above Your tags */}
                <View style={styles.peerSection}>
                  <Text style={[styles.groupTitle, { color: muted, paddingTop: 16, paddingBottom: 2 }]}>
                    Friends & lending
                  </Text>
                  <Text style={[styles.peerPromptText, { color: muted }]}>
                    {transactionType === 'credit'
                      ? 'Did a friend repay you, or did you borrow this?'
                      : 'Did you lend money to a friend, or repay a debt?'}
                  </Text>
                  <View style={styles.grid}>
                    {transactionType === 'credit' ? (
                      <>
                        {renderTile('peer_lent_repaid', 'Friend repaid')}
                        {renderTile('peer_borrowed', 'Borrowed')}
                      </>
                    ) : (
                      <>
                        {renderTile('peer_lent', 'Lent to friend')}
                        {renderTile('peer_borrow_repaid', 'Repaid friend')}
                      </>
                    )}
                  </View>
                </View>

                <Text style={[styles.groupTitle, { color: muted }]}>Your tags</Text>
                <View style={styles.grid}>
                  {customTags.map((t) => renderTile(t.toLowerCase(), getCategory(t).label))}
                  {renderTile('miscellaneous', 'Misc')}
                  <Pressable
                    onPress={() => {
                      setIsCreating((v) => !v);
                      setErrorText('');
                    }}
                    style={styles.tile}
                    accessibilityRole="button"
                    accessibilityLabel="Create a new tag"
                  >
                    <View
                      style={[
                        styles.newTile,
                        { borderColor: isDark ? 'rgba(255,255,255,0.3)' : '#9DB2A7' },
                        isCreating && { backgroundColor: isDark ? 'rgba(184,243,107,0.12)' : '#E3F2E8' },
                      ]}
                    >
                      <Feather name={isCreating ? 'minus' : 'plus'} size={22} color={isDark ? LIME : FOREST} />
                    </View>
                    <Text style={[styles.tileLabel, { color: isDark ? 'rgba(234, 242, 238, 0.82)' : '#26332D' }]}>
                      New tag
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* Create a tag */}
            {(isCreating || (searchResults && searchResults.builtIn.length + searchResults.custom.length === 0)) && (
              <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
                <View
                  style={[
                    styles.createBox,
                    { backgroundColor: cardBg, borderColor: errorText ? '#E03131' : line },
                  ]}
                >
                  <TextInput
                    value={newTag}
                    onChangeText={(t) => {
                      setErrorText('');
                      setNewTag(t);
                    }}
                    placeholder={searchResults ? `Create "${query.trim()}"` : 'Name your tag, like Pet care'}
                    placeholderTextColor={muted}
                    style={[styles.createInput, { color: ink }]}
                    autoFocus={isCreating}
                    returnKeyType="done"
                    onSubmitEditing={() => handleCreate(newTag.trim() || query.trim())}
                    accessibilityLabel="New tag name"
                  />
                  <TouchableOpacity
                    onPress={() => handleCreate(newTag.trim() || query.trim())}
                    style={[styles.createBtn, { backgroundColor: isDark ? LIME : FOREST }]}
                    activeOpacity={0.85}
                  >
                    <Text style={{ color: isDark ? FOREST : '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Create</Text>
                  </TouchableOpacity>
                </View>
                {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
              </View>
            )}

            {/* Remember for this payee */}
            {merchantName ? (
              <View style={[styles.rememberCard, { backgroundColor: cardBg, borderColor: line }]}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ color: ink, fontSize: 14, fontWeight: '700' }} numberOfLines={2}>
                    Always tag {merchantName} as {currentCat.label}
                  </Text>
                  <Text style={{ color: muted, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
                    Future payments to {merchantName} get this tag automatically
                  </Text>
                </View>
                <Switch
                  value={rememberForPayee}
                  onValueChange={setRememberForPayee}
                  trackColor={{ false: isDark ? '#3A3A3C' : '#D1D5DB', true: '#16A34A' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={isDark ? '#3A3A3C' : '#D1D5DB'}
                />
              </View>
            ) : null}
          </ScrollView>

          {/* Confirm */}
          <View
            style={[
              styles.footer,
              { borderTopColor: line, paddingBottom: Math.max(insets.bottom, 12) + 4 },
            ]}
          >
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: isDark ? LIME : FOREST }]}
              onPress={handleConfirm}
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryBtnText, { color: isDark ? FOREST : LIME }]}>
                Tag as {currentCat.label}
              </Text>
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
    backgroundColor: 'rgba(7, 17, 13, 0.55)',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  payeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  payeeAvatar: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginTop: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 12,
  },
  peerSection: {
    marginBottom: 6,
  },
  peerPromptText: {
    fontSize: 12,
    paddingHorizontal: 22,
    paddingBottom: 12,
    lineHeight: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    rowGap: 16,
  },
  tile: {
    width: '25%',
    alignItems: 'center',
    gap: 8,
    paddingTop: 6,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  newTile: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  createBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 6,
    height: 52,
  },
  createInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  createBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#E03131',
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: 4,
    fontWeight: '600',
  },
  rememberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 22,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
