import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getSmsSenderSuggestions } from '../constants/bankSmsSenders';

interface SmsSenderTagsManagerProps {
  tags: string[];
  onChangeTags: (tags: string[]) => void;
  bankCodeOrName?: string;
  colors: any;
  isDark: boolean;
  label?: string;
  hint?: string;
}

export const SmsSenderTagsManager: React.FC<SmsSenderTagsManagerProps> = ({
  tags,
  onChangeTags,
  bankCodeOrName,
  colors,
  isDark,
  label = 'SMS SENDER CODES / HEADERS',
  hint = 'Banks send SMS alerts from multiple codes (e.g. SBIPSG, SBIBNK, SBIUPI). Add all sender codes to auto-read transactions.',
}) => {
  const [inputVal, setInputVal] = useState('');
  const [errorText, setErrorText] = useState('');

  // Get known suggestions for this bank
  const suggestions = useMemo(() => {
    return getSmsSenderSuggestions(bankCodeOrName);
  }, [bankCodeOrName]);

  // Suggestions that aren't added yet
  const availableSuggestions = useMemo(() => {
    const activeUpper = new Set(tags.map(t => t.toUpperCase()));
    return suggestions.filter(s => !activeUpper.has(s.toUpperCase()));
  }, [suggestions, tags]);

  const handleAddTag = (rawTag: string) => {
    const clean = rawTag.replace(/[^A-Za-z0-9]/g, '').toUpperCase().trim();
    if (!clean) return;
    if (clean.length < 3) {
      setErrorText('Sender code must be at least 3 characters');
      return;
    }
    if (tags.some(t => t.toUpperCase() === clean)) {
      setErrorText(`'${clean}' is already added`);
      return;
    }

    setErrorText('');
    onChangeTags([...tags, clean]);
    setInputVal('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onChangeTags(tags.filter(t => t.toUpperCase() !== tagToRemove.toUpperCase()));
  };

  const handleAddAllSuggestions = () => {
    const activeUpper = new Set(tags.map(t => t.toUpperCase()));
    const newTags = [...tags];
    for (const s of availableSuggestions) {
      if (!activeUpper.has(s.toUpperCase())) {
        newTags.push(s.toUpperCase());
        activeUpper.add(s.toUpperCase());
      }
    }
    onChangeTags(newTags);
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
        {availableSuggestions.length > 0 && (
          <TouchableOpacity
            onPress={handleAddAllSuggestions}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.addAllText, { color: colors.primary || '#6366F1' }]}>
              + Add All Suggested
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Active Tag Chips */}
      <View style={styles.chipsContainer}>
        {tags.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: isDark ? '#333333' : '#E5E7EB' }]}>
            <Feather name="info" size={14} color={colors.textTertiary || '#8E8E9F'} style={{ marginRight: 6 }} />
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              No SMS codes added yet. Add one or pick from suggestions below.
            </Text>
          </View>
        ) : (
          tags.map((tag) => (
            <View
              key={tag}
              style={[
                styles.tagChip,
                {
                  backgroundColor: isDark ? 'rgba(99, 102, 241, 0.16)' : '#EEF2FF',
                  borderColor: isDark ? 'rgba(99, 102, 241, 0.35)' : '#C7D2FE',
                },
              ]}
            >
              <Feather
                name="message-square"
                size={11}
                color={colors.primary || '#6366F1'}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.tagText, { color: colors.text || '#FFFFFF' }]}>
                {tag}
              </Text>
              <TouchableOpacity
                onPress={() => handleRemoveTag(tag)}
                style={styles.removeBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel={`Remove ${tag}`}
              >
                <Feather name="x" size={13} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {/* Input row to type custom tag */}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: isDark ? '#1C1C24' : '#F9FAFB',
            borderColor: errorText ? '#EF4444' : isDark ? '#2D2D3A' : '#E5E7EB',
          },
        ]}
      >
        <Feather
          name="tag"
          size={15}
          color={colors.textTertiary || '#8E8E9F'}
          style={styles.inputIcon}
        />
        <TextInput
          style={[styles.inputField, { color: colors.text || '#FFFFFF' }]}
          value={inputVal}
          onChangeText={(txt) => {
            setErrorText('');
            // If user enters comma, immediately add tag
            if (txt.includes(',')) {
              const parts = txt.split(',');
              parts.forEach(p => {
                if (p.trim()) handleAddTag(p);
              });
            } else {
              setInputVal(txt);
            }
          }}
          onSubmitEditing={() => handleAddTag(inputVal)}
          placeholder="Type sender code (e.g. SBIPSG, HDFCBK)..."
          placeholderTextColor={isDark ? 'rgba(255, 255, 255, 0.35)' : '#9CA3AF'}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
        />
        <TouchableOpacity
          onPress={() => handleAddTag(inputVal)}
          style={[
            styles.addBtn,
            {
              backgroundColor: inputVal.trim()
                ? (colors.primary || '#6366F1')
                : (isDark ? '#2A2A38' : '#E5E7EB'),
            },
          ]}
          disabled={!inputVal.trim()}
          activeOpacity={0.8}
        >
          <Feather
            name="plus"
            size={14}
            color={inputVal.trim() ? '#FFFFFF' : colors.textTertiary}
            style={{ marginRight: 2 }}
          />
          <Text
            style={[
              styles.addBtnText,
              { color: inputVal.trim() ? '#FFFFFF' : colors.textTertiary },
            ]}
          >
            Add
          </Text>
        </TouchableOpacity>
      </View>

      {errorText ? (
        <Text style={styles.errorText}>{errorText}</Text>
      ) : null}

      {/* Suggested Tags from Known Bank Codes */}
      {availableSuggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={[styles.suggestionTitle, { color: colors.textTertiary }]}>
            SUGGESTIONS FOR {bankCodeOrName ? bankCodeOrName.toUpperCase() : 'THIS BANK'}:
          </Text>
          <View style={styles.suggestionsList}>
            {availableSuggestions.map((sug) => (
              <TouchableOpacity
                key={sug}
                style={[
                  styles.suggestionChip,
                  {
                    backgroundColor: isDark ? '#232330' : '#F3F4F6',
                    borderColor: isDark ? '#353545' : '#E5E7EB',
                  },
                ]}
                onPress={() => handleAddTag(sug)}
                activeOpacity={0.7}
              >
                <Feather
                  name="plus"
                  size={12}
                  color={colors.primary || '#6366F1'}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.suggestionText, { color: colors.text || '#FFFFFF' }]}>
                  {sug}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {hint ? (
        <Text style={[styles.hintText, { color: colors.textTertiary }]}>{hint}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  addAllText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 10,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginRight: 6,
  },
  removeBtn: {
    padding: 2,
    borderRadius: 10,
  },
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    height: 44,
  },
  inputIcon: {
    marginRight: 8,
  },
  inputField: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 7,
    marginLeft: 6,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
  suggestionsContainer: {
    marginTop: 10,
    marginBottom: 4,
  },
  suggestionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  suggestionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 7,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  hintText: {
    fontSize: 11,
    marginTop: 6,
    lineHeight: 15,
  },
});
