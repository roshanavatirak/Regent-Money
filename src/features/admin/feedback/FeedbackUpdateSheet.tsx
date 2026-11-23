// Bottom sheet on the admin feedback detail page: change status and priority,
// and choose whether the sender is told about it. The parent remounts it (new key) on each open.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AdminFeedbackItem, FeedbackPriority, FeedbackStatus, FeedbackUpdate } from '../../../services/adminFeedbackService';
import { useAdminTheme, ff, Segmented, SectionLabel, LIME, FOREST } from '../adminTheme';
import { STATUS_ORDER, STATUS_INFO, PRIORITY_ORDER, PRIORITY_LABEL, statusTint, displayName } from './feedbackMeta';

export const FeedbackUpdateSheet: React.FC<{
  visible: boolean;
  item: AdminFeedbackItem;
  onClose: () => void;
  onSave: (changes: FeedbackUpdate) => Promise<void>;
}> = ({ visible, item, onClose, onSave }) => {
  const insets = useSafeAreaInsets();
  const { p, font, isDark } = useAdminTheme();
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [priority, setPriority] = useState<FeedbackPriority>(item.priority);
  const [notify, setNotify] = useState(!!item.userId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusChanged = status !== item.status;
  const changed = statusChanged || priority !== item.priority;
  const firstName = displayName(item.user?.name, item.user?.email).split(' ')[0];
  const what = item.kind === 'bug' ? 'report' : 'idea';

  const save = async () => {
    if (!changed) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        status: statusChanged ? status : undefined,
        priority: priority !== item.priority ? priority : undefined,
        notify: notify && statusChanged,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Couldn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !saving && onClose()}>
      <Pressable style={styles.backdrop} onPress={() => !saving && onClose()}>
        <Pressable
          style={[styles.sheet, { backgroundColor: p.card, paddingBottom: insets.bottom + 20 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.grabber, { backgroundColor: p.line }]} />
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={[{ fontSize: 22, color: p.text }, ff(font.display, '800')]}>
                Update {item.kind === 'bug' ? 'report' : 'suggestion'}
              </Text>
              <Text numberOfLines={1} style={[{ fontSize: 13, color: p.sub, marginTop: 2 }, ff(font.body, '500')]}>
                {item.title}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={saving}
              accessibilityLabel="Close"
              style={[styles.closeBtn, { backgroundColor: p.soft }]}
            >
              <Feather name="x" size={18} color={p.text} />
            </TouchableOpacity>
          </View>

          <SectionLabel style={{ marginHorizontal: 0, marginTop: 18 }}>Status</SectionLabel>
          <View style={styles.grid}>
            {STATUS_ORDER.map((s) => {
              const on = s === status;
              const tint = statusTint(s, p);
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => setStatus(s)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={[
                    styles.statusCard,
                    {
                      borderColor: on ? p.segActive : p.line,
                      borderWidth: on ? 2 : 1,
                      backgroundColor: on ? p.tint.green.bg : p.card,
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tint.fg }} />
                    <Text style={[{ fontSize: 14, color: tint.fg }, ff(font.bodyBold, '700')]}>{STATUS_INFO[s].label}</Text>
                  </View>
                  <Text style={[{ fontSize: 12, color: p.sub, marginTop: 2 }, ff(font.body, '500')]}>{STATUS_INFO[s].hint}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <SectionLabel style={{ marginHorizontal: 0, marginTop: 16 }}>Priority</SectionLabel>
          <Segmented<FeedbackPriority>
            value={priority}
            onChange={setPriority}
            options={PRIORITY_ORDER.map((x) => ({ id: x, label: PRIORITY_LABEL[x] }))}
          />

          {item.userId ? (
            <View style={[styles.notifyRow, { backgroundColor: p.bg, opacity: statusChanged ? 1 : 0.55 }]}>
              <View style={[styles.notifyIcon, { backgroundColor: p.tint.green.bg }]}>
                <Feather name="bell" size={16} color={p.tint.green.fg} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[{ fontSize: 14, color: p.text }, ff(font.bodyBold, '700')]}>Tell {firstName}</Text>
                <Text style={[{ fontSize: 12, color: p.sub }, ff(font.body, '500')]} numberOfLines={2}>
                  {statusChanged
                    ? `Push: “Your ${what} is now ${STATUS_INFO[status].label.toLowerCase()}”`
                    : 'Only sent when the status changes'}
                </Text>
              </View>
              <Switch
                value={notify}
                onValueChange={setNotify}
                disabled={!statusChanged}
                accessibilityLabel={`Notify ${firstName}`}
                trackColor={{ false: p.line, true: isDark ? LIME : FOREST }}
                thumbColor={notify ? (isDark ? FOREST : LIME) : '#FFFFFF'}
              />
            </View>
          ) : null}

          {error ? (
            <Text style={[{ fontSize: 13, color: p.danger, marginTop: 12 }, ff(font.bodySemi, '600')]}>{error}</Text>
          ) : null}

          <TouchableOpacity
            onPress={save}
            disabled={saving}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: isDark ? LIME : FOREST, opacity: saving ? 0.7 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator color={isDark ? FOREST : LIME} />
            ) : (
              <Text style={[{ fontSize: 16, color: isDark ? FOREST : LIME }, ff(font.bodyBold, '700')]}>
                {changed ? 'Save changes' : 'Done'}
              </Text>
            )}
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11, 31, 23, 0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusCard: { width: '48.5%', flexGrow: 1, flexBasis: '45%', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16 },
  notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, marginTop: 16 },
  notifyIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { height: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
});
