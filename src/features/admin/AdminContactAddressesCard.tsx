// Admin: the public contact addresses (support, contact, privacy, grievance) that the app and
// every email show. Saved on the server, so changes need no app update.

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { adminService, AdminContactEmails } from '../../services/adminService';
import { ff, FOREST, LIME } from './adminTheme';

type Field = { key: keyof AdminContactEmails; label: string; hint: string; email: boolean };

const FIELDS: Field[] = [
  { key: 'support', label: 'Support', hint: 'Help in the app and Reply-To on every email', email: true },
  { key: 'contact', label: 'General enquiries', hint: 'Business and partnership questions', email: true },
  { key: 'privacy', label: 'Privacy', hint: 'Privacy questions and account deletion', email: true },
  { key: 'grievance', label: 'Grievance', hint: 'Complaints, shown in the Privacy policy', email: true },
  { key: 'grievanceOfficer', label: 'Grievance Officer', hint: 'Name and company, shown in the Privacy policy', email: false },
];

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;

export const AdminContactAddressesCard: React.FC<{ p: any; font: any }> = ({ p, font }) => {
  const [saved, setSaved] = useState<AdminContactEmails | null>(null);
  const [draft, setDraft] = useState<AdminContactEmails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const value = await adminService.getContactEmails();
      setSaved(value);
      setDraft(value);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || "Couldn't load contact addresses." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const invalid = draft
    ? FIELDS.filter((f) => (f.email ? !EMAIL_RE.test((draft[f.key] || '').trim()) : !(draft[f.key] || '').trim()))
    : [];
  const changed = !!draft && !!saved && FIELDS.some((f) => draft[f.key].trim() !== saved[f.key]);

  const save = async () => {
    if (!draft || invalid.length || !changed) return;
    setSaving(true);
    setMessage(null);
    try {
      const trimmed = Object.fromEntries(FIELDS.map((f) => [f.key, draft[f.key].trim()])) as unknown as AdminContactEmails;
      const value = await adminService.setContactEmails(trimmed);
      setSaved(value);
      setDraft(value);
      setMessage({ type: 'success', text: 'Saved. The app and emails use these within a few minutes.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || "Couldn't save. Try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[s.card, { backgroundColor: p.card, borderColor: p.line }]}>
      <View style={s.top}>
        <View style={[s.icon, { backgroundColor: p.soft }]}>
          <Feather name="at-sign" size={16} color={p.text} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.title, ff(font.bodyBold, '700'), { color: p.text }]}>Contact addresses</Text>
          <Text style={[s.caption, ff(font.body, '500'), { color: p.muted }]}>Shown in the app, the Privacy policy and emails</Text>
        </View>
      </View>

      {loading || !draft ? (
        <ActivityIndicator style={{ marginTop: 16 }} color={p.text} />
      ) : (
        <>
          {FIELDS.map((f) => {
            const bad = invalid.includes(f);
            return (
              <View key={f.key} style={s.field}>
                <Text style={[s.label, ff(font.bodySemi, '600'), { color: p.sub }]}>{f.label}</Text>
                <View style={[s.inputRow, { backgroundColor: p.soft, borderColor: bad ? p.danger : 'transparent' }]}>
                  <TextInput
                    value={draft[f.key]}
                    onChangeText={(v) => {
                      setDraft({ ...draft, [f.key]: v });
                      setMessage(null);
                    }}
                    autoCapitalize={f.email ? 'none' : 'words'}
                    autoCorrect={false}
                    keyboardType={f.email ? 'email-address' : 'default'}
                    accessibilityLabel={f.label}
                    style={[s.input, ff(font.bodySemi, '600'), { color: p.text }]}
                  />
                </View>
                <Text style={[s.hint, ff(font.body, '500'), { color: bad ? p.danger : p.muted }]}>
                  {bad ? (f.email ? 'Enter a valid email address.' : 'This can’t be empty.') : f.hint}
                </Text>
              </View>
            );
          })}

          {message && (
            <View style={[s.notice, { backgroundColor: message.type === 'success' ? p.tint.green.bg : p.tint.coral.bg }]}>
              <Feather
                name={message.type === 'success' ? 'check-circle' : 'alert-circle'}
                size={15}
                color={message.type === 'success' ? p.tint.green.fg : p.danger}
              />
              <Text style={[s.noticeText, ff(font.bodySemi, '600'), { color: message.type === 'success' ? p.tint.green.fg : p.danger }]}>
                {message.text}
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={save}
            disabled={saving || !changed || invalid.length > 0}
            activeOpacity={0.85}
            accessibilityRole="button"
            style={[s.btn, { backgroundColor: FOREST, opacity: !changed || invalid.length > 0 ? 0.5 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={LIME} />
            ) : (
              <Text style={[s.btnText, ff(font.bodyBold, '700'), { color: LIME }]}>Save addresses</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 16 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15 },
  caption: { fontSize: 12, marginTop: 1 },
  field: { marginTop: 12 },
  label: { fontSize: 12.5, marginBottom: 7 },
  inputRow: { borderRadius: 12, paddingHorizontal: 12, height: 46, justifyContent: 'center', borderWidth: 1.5 },
  input: { fontSize: 14, paddingVertical: 0 },
  hint: { fontSize: 11.5, marginTop: 5, marginLeft: 2 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14 },
  noticeText: { flex: 1, fontSize: 12.5 },
  btn: { height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  btnText: { fontSize: 13.5 },
});
