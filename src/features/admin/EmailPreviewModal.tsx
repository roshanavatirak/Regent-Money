import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adminService, EmailDraft } from '../../services/adminService';
import { useAdminTheme, ff, FOREST, LIME } from './adminTheme';
import { markdownToPlain } from './emailTemplates';

const APP_ICON = require('../../../assets/appicon.png');

/**
 * Full-screen preview of an email broadcast, rendered by the backend with the exact HTML recipients get.
 * Links inside the preview don't open.
 */
export const EmailPreviewModal: React.FC<{
  visible: boolean;
  draft: EmailDraft;
  onClose: () => void;
  onSendTest: () => void;
  sendingTest: boolean;
}> = ({ visible, draft, onClose, onSendTest, sendingTest }) => {
  const insets = useSafeAreaInsets();
  const { p, font } = useAdminTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setHtml(null);
    setError(null);
    adminService
      .previewEmail(draft)
      .then((r) => alive && setHtml(r.html))
      .catch((e: any) => alive && setError(e?.message || "Couldn't load the preview."));
    return () => {
      alive = false;
    };
  }, [visible, draft]);

  const firstLine = markdownToPlain(draft.bodyMarkdown).split('\n').find((l) => l.trim() && !/^(hi|hello)\b/i.test(l)) || '';

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: p.card, paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <View style={[styles.header, { borderBottomColor: p.line }]}>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
            activeOpacity={0.7}
            style={[styles.iconBtn, { borderColor: p.line, backgroundColor: p.card }]}
          >
            <Feather name="x" size={18} color={p.text} />
          </TouchableOpacity>
          <Text style={[styles.title, ff(font.displayBold, '700'), { color: p.text }]}>Preview</Text>
        </View>

        <View style={[styles.inbox, { borderBottomColor: p.line }]}>
          <Image source={APP_ICON} style={styles.avatar} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.inboxTop}>
              <Text style={[styles.from, ff(font.bodyBold, '700'), { color: p.text }]}>Regent Money</Text>
              <Text style={[styles.time, ff(font.body, '500'), { color: p.muted }]}>now</Text>
            </View>
            <Text style={[styles.subject, ff(font.bodySemi, '600'), { color: p.text }]} numberOfLines={1}>
              {draft.subject || 'Subject'}
            </Text>
            <Text style={[styles.snippet, ff(font.body, '500'), { color: p.sub }]} numberOfLines={1}>
              {firstLine}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          {error ? (
            <View style={styles.center}>
              <Feather name="alert-circle" size={22} color={p.danger} />
              <Text style={[styles.centerText, ff(font.bodySemi, '600'), { color: p.danger }]}>{error}</Text>
            </View>
          ) : !html ? (
            <View style={styles.center}>
              <ActivityIndicator color={p.segActive} />
            </View>
          ) : (
            <WebView
              originWhitelist={['*']}
              source={{ html }}
              style={{ backgroundColor: '#F3F6F4' }}
              // Preview only: never follow links out of it.
              onShouldStartLoadWithRequest={(req) => req.url === 'about:blank' || req.url.startsWith('data:')}
              setSupportMultipleWindows={false}
              javaScriptEnabled={false}
            />
          )}
        </View>

        <View style={[styles.footer, { borderTopColor: p.line, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <Text style={[styles.note, ff(font.body, '500'), { color: p.sub }]}>Shown with a sample name. Each person sees their own.</Text>
          <View style={styles.btnRow}>
            <TouchableOpacity
              onPress={onSendTest}
              disabled={sendingTest}
              activeOpacity={0.8}
              style={[styles.btn, styles.ghost, { borderColor: p.line, backgroundColor: p.card }]}
            >
              {sendingTest ? (
                <ActivityIndicator size="small" color={p.segActive} />
              ) : (
                <Text style={[styles.btnText, ff(font.bodyBold, '700'), { color: p.text }]}>Send test to me</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={[styles.btn, { backgroundColor: FOREST }]}>
              <Text style={[styles.btnText, ff(font.bodyBold, '700'), { color: LIME }]}>Looks good</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  iconBtn: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, letterSpacing: -0.3 },
  inbox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  inboxTop: { flexDirection: 'row', justifyContent: 'space-between' },
  from: { fontSize: 14 },
  time: { fontSize: 11.5 },
  subject: { fontSize: 13.5, marginTop: 1 },
  snippet: { fontSize: 12.5, marginTop: 1 },
  body: { flex: 1, backgroundColor: '#F3F6F4' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  centerText: { fontSize: 13, textAlign: 'center' },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, gap: 10 },
  note: { fontSize: 12, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  ghost: { borderWidth: 1 },
  btnText: { fontSize: 13.5 },
});
