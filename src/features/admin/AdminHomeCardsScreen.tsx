// Admin page: choose, edit, reorder and publish the cards in the user Home carousel.
// Users get changes without an app update: publishing creates a new version number that
// phones see on their next request and download once.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
  Switch,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { adminService, HomeCardsError, type HomeCardsAdminState } from '../../services/adminService';
import { useAdminTheme, ff, Pill, SectionLabel, Segmented, FOREST, LIME, type AdminPalette, type AdminFont } from './adminTheme';
import { HomeCardFace } from '../homeCards/HomeCardView';
import { ArtGlyph } from '../homeCards/HomeCardArt';
import { PRESETS, themeFor, assignThemes } from '../homeCards/themes';
import { TEMPLATES } from '../homeCards/defaults';
import { diffCards, freshId, type CardChange } from '../homeCards/diff';
import {
  ACTION_KEYS,
  ACTION_LABELS,
  ART_KEYS,
  LIMITS,
  PLATFORM_LABELS,
  PRESET_KEYS,
  RULE_KEYS,
  RULE_LABELS,
  TOKENS,
  cardProblems,
  isHex,
  type HomeCard,
  type PlatformKey,
} from '../homeCards/schema';

type Notice = { tone: 'ok' | 'error'; text: string; details?: string[] } | null;

const SAMPLE: Record<string, string> = {
  '{{first_name}}': 'Aarav',
  '{{spent_per_rupee}}': '1.24',
  '{{kept_pct}}': '18',
  '{{month}}': new Date().toLocaleDateString('en-IN', { month: 'long' }),
};
const sampleTitle = (t: string) => t.replace(/\{\{\w+\}\}/g, (m) => SAMPLE[m] ?? m);
const DEFAULT_CUSTOM = { bg: '#0B3D2C', fg: '#FFFFFF', ctaBg: '#B8F36B', ctaFg: '#0B3D2C' };
const ART_NAMES: Record<string, string> = {
  bank: 'Bank', sms: 'Phone', cash: 'Cash', regent: 'Chat', overspend: 'Wallet',
  kept: 'Growth', budget: 'Budget', goal: 'Target', bills: 'Calendar', refer: 'Gift',
};

export const AdminHomeCardsScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const { p, font, isDark } = useAdminTheme();
  const accent = isDark ? LIME : FOREST;

  const [server, setServer] = useState<HomeCardsAdminState | null>(null);
  const [draft, setDraft] = useState<HomeCard[]>([]);
  const [rev, setRev] = useState(0);
  const [savedJson, setSavedJson] = useState('[]');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'publish' | 'rollback' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'publish' } | { kind: 'rollback'; version: number } | null>(null);

  const fetchState = useCallback(
    () =>
      adminService
        .getHomeCards()
        .then((st) => {
          setServer(st);
          setDraft(st.draft);
          setRev(st.rev);
          setSavedJson(JSON.stringify(st.draft));
        })
        .catch((err: any) => setNotice({ tone: 'error', text: err?.message || "Couldn't load the cards." }))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const load = async () => {
    setLoading(true);
    await fetchState();
  };

  const changes = useMemo(() => (server ? diffCards(server.live, draft) : []), [server, draft]);
  const draftDirty = JSON.stringify(draft) !== savedJson;
  const broken = draft.filter((c) => c.enabled && Object.keys(cardProblems(c)).length > 0);
  const liveVersion = server?.liveVersion ?? 0;

  const update = (id: string, patch: Partial<HomeCard>) =>
    setDraft((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  /** Moves the card with `id` to position `to`. */
  const moveCard = (id: string, to: number) =>
    setDraft((list) => {
      const from = list.findIndex((c) => c.id === id);
      if (from < 0 || to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [card] = next.splice(from, 1);
      next.splice(to, 0, card);
      return next;
    });

  /* ---- drag to reorder (6-dot handle) ---- */
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [dragY] = useState(() => new Animated.Value(0));
  const rowBoxes = useRef<Record<string, { y: number; h: number }>>({});
  const listHeight = useRef(0);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };

  const startDrag = (id: string) => {
    const box = rowBoxes.current[id];
    const from = draft.findIndex((c) => c.id === id);
    if (!box || from < 0) return;
    dragY.setValue(0);
    setDrag({ id, from, to: from, h: box.h });
  };

  const moveDrag = (dy: number) => {
    const d = dragRef.current;
    const box = d && rowBoxes.current[d.id];
    if (!d || !box) return;
    // Keep the row inside the list
    const y = Math.max(-box.y, Math.min(listHeight.current - box.y - box.h, dy));
    dragY.setValue(y);
    const centre = box.y + box.h / 2 + y;
    let to = 0;
    for (const c of draft) {
      if (c.id === d.id) continue;
      const o = rowBoxes.current[c.id];
      if (o && o.y + o.h / 2 < centre) to++;
    }
    if (to !== d.to) setDrag({ ...d, to });
  };

  const endDrag = () => {
    const d = dragRef.current;
    setDrag(null);
    dragY.setValue(0);
    if (d && d.to !== d.from) moveCard(d.id, d.to);
  };

  /** How far a resting row slides to make room for the row being dragged. */
  const restingOffset = (i: number) => {
    if (!drag) return 0;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -drag.h;
    if (drag.from > drag.to && i >= drag.to && i < drag.from) return drag.h;
    return 0;
  };

  const addTemplate = (key: string) => {
    const t = TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    if (draft.length >= LIMITS.maxCards) {
      setNotice({ tone: 'error', text: `You can have up to ${LIMITS.maxCards} cards. Remove one first.` });
      return;
    }
    const id = freshId(t.key, draft.map((c) => c.id));
    setDraft((list) => [{ ...t.card, id }, ...list]);
    setEditingId(id);
  };

  const handleError = (err: any, fallback: string) => {
    if (err instanceof HomeCardsError && err.code === 'VERSION_CHANGED') {
      setNotice({ tone: 'error', text: err.message });
      return;
    }
    if (err instanceof HomeCardsError && err.problems.length > 1) {
      setNotice({ tone: 'error', text: 'Fix these before publishing:', details: err.problems });
      return;
    }
    setNotice({ tone: 'error', text: err?.message || fallback });
  };

  const saveDraft = async () => {
    setBusy('save');
    setNotice(null);
    try {
      const r = await adminService.saveHomeCardsDraft(draft, rev);
      setRev(r.rev);
      setSavedJson(JSON.stringify(r.cards));
      setDraft(r.cards);
      setNotice({ tone: 'ok', text: 'Draft saved. Users still see the live version.' });
    } catch (err: any) {
      handleError(err, "Couldn't save the draft.");
    } finally {
      setBusy(null);
    }
  };

  const publish = async (note: string) => {
    setBusy('publish');
    setNotice(null);
    try {
      const r = await adminService.publishHomeCards(draft, liveVersion, note || undefined);
      setConfirm(null);
      await load();
      setNotice({ tone: 'ok', text: `Version ${r.version} is live. Users see it the next time the app talks to the server.` });
    } catch (err: any) {
      setConfirm(null);
      handleError(err, "Couldn't publish.");
    } finally {
      setBusy(null);
    }
  };

  const rollback = async (version: number) => {
    setBusy('rollback');
    setNotice(null);
    try {
      const r = await adminService.rollbackHomeCards(version, liveVersion);
      setConfirm(null);
      await load();
      setNotice({ tone: 'ok', text: `Cards from version ${version} are live again as version ${r.version}.` });
    } catch (err: any) {
      setConfirm(null);
      handleError(err, "Couldn't roll back.");
    } finally {
      setBusy(null);
    }
  };

  const goBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  };

  const previewList = useMemo(() => {
    const on = draft.filter((c) => c.enabled);
    const shown = assignThemes(on);
    return on.map((c, i) => ({ card: c, theme: themeFor(c, shown[i] ?? undefined) }));
  }, [draft]);

  const liveIds = new Set((server?.live ?? []).map((c) => c.id));
  const changedIds = new Set(changes.map((c) => c.id).filter(Boolean) as string[]);
  const editing = draft.find((c) => c.id === editingId) || null;
  const t = makeText(p, font);
  const cardW = Math.min(width - 72, 320);

  return (
    <View style={[styles.flex, { backgroundColor: p.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <TouchableOpacity
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          activeOpacity={0.7}
          style={[styles.iconBtn, { borderColor: p.line, backgroundColor: p.card }]}
        >
          <Feather name="arrow-left" size={18} color={p.text} />
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={[styles.title, ff(font.displayBold, '700'), { color: p.text }]}>Home cards</Text>
          <Text style={[t.sub, { marginTop: 2 }]}>
            {liveVersion ? `Live: version ${liveVersion}` : 'Nothing published yet. Users see the built-in cards.'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={load}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Reload"
          activeOpacity={0.7}
          style={[styles.iconBtn, { borderColor: p.line, backgroundColor: p.card }]}
        >
          {loading ? <ActivityIndicator size="small" color={accent} /> : <Feather name="refresh-cw" size={16} color={p.text} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!drag}
      >
        {notice && (
          <View style={[styles.notice, { backgroundColor: notice.tone === 'ok' ? p.tint.green.bg : p.tint.coral.bg }]}>
            <Feather
              name={notice.tone === 'ok' ? 'check-circle' : 'alert-circle'}
              size={16}
              color={notice.tone === 'ok' ? p.success : p.danger}
            />
            <View style={styles.flex}>
              <Text style={[t.semi, { color: notice.tone === 'ok' ? p.text : p.danger }]}>{notice.text}</Text>
              {notice.details?.map((d) => (
                <Text key={d} style={[t.small, { color: p.danger, marginTop: 2 }]}>• {d}</Text>
              ))}
            </View>
            <TouchableOpacity onPress={() => setNotice(null)} hitSlop={10} accessibilityLabel="Dismiss">
              <Feather name="x" size={16} color={p.muted} />
            </TouchableOpacity>
          </View>
        )}

        {loading && !server ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={accent} />
        ) : (
          <>
            {/* Preview */}
            <SectionLabel right={<Text style={t.small}>{previewList.length} switched on</Text>}>Preview</SectionLabel>
            {previewList.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 16 }}>
                {previewList.map(({ card, theme }) => (
                  <TouchableOpacity key={card.id} activeOpacity={0.85} onPress={() => setEditingId(card.id)}>
                    <HomeCardFace title={sampleTitle(card.title) || 'Card title'} cta={card.cta || 'Button'} art={card.art} theme={theme} style={{ width: cardW }} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={[styles.empty, { borderColor: p.line }]}>
                <Text style={t.sub}>No cards are switched on, so Home hides the carousel.</Text>
              </View>
            )}
            <Text style={[t.small, { marginTop: 8 }]}>
              Every switched-on card is shown here. Each user sees only the ones whose audience matches them, up to {LIMITS.maxVisible}.
            </Text>

            {/* Current list */}
            <SectionLabel right={<Text style={t.small}>{draft.length}/{LIMITS.maxCards}</Text>}>On the Home screen</SectionLabel>
            <View
              style={[styles.group, { backgroundColor: p.card, borderColor: p.line }]}
              onLayout={(e) => {
                listHeight.current = e.nativeEvent.layout.height;
              }}
            >
              {draft.map((c, i) => {
                const th = themeFor(c);
                const problems = Object.keys(cardProblems(c)).length > 0;
                const status = !liveIds.has(c.id) ? 'New' : changedIds.has(c.id) ? 'Changed' : 'Live';
                const dragging = drag?.id === c.id;
                return (
                  <Animated.View
                    key={c.id}
                    onLayout={(e) => {
                      const { y, height } = e.nativeEvent.layout;
                      rowBoxes.current[c.id] = { y, h: height };
                    }}
                    style={[
                      styles.row,
                      { backgroundColor: p.card, paddingLeft: 4 },
                      i > 0 && { borderTopWidth: 1, borderTopColor: p.divider },
                      dragging
                        ? [styles.lifted, { transform: [{ translateY: dragY }], borderColor: p.segActive }]
                        : { transform: [{ translateY: restingOffset(i) }] },
                    ]}
                  >
                    <DragHandle
                      color={dragging ? p.segActive : p.muted}
                      label={`Reorder ${sampleTitle(c.title)}`}
                      onStart={() => startDrag(c.id)}
                      onMove={moveDrag}
                      onEnd={endDrag}
                      onStep={(dir) => moveCard(c.id, i + dir)}
                    />
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setEditingId(c.id)}
                      style={[styles.flex, styles.rowMain]}
                      accessibilityLabel={`Edit ${c.title}`}
                    >
                      <View style={[styles.swatch, { backgroundColor: th.bg }]}>
                        <ArtGlyph kind={c.art} theme={th} size={34} />
                      </View>
                      <View style={[styles.flex, { opacity: c.enabled ? 1 : 0.5 }]}>
                        <Text style={t.rowTitle} numberOfLines={2}>{sampleTitle(c.title) || 'Untitled card'}</Text>
                        <View style={styles.chips}>
                          <Pill
                            small
                            font={font}
                            label={status}
                            tint={status === 'New' ? p.tint.blue : status === 'Changed' ? p.tint.amber : p.tint.green}
                          />
                          <Pill small font={font} label={RULE_LABELS[c.rule]} tint={{ bg: p.soft, fg: p.sub }} />
                          {c.platform !== 'all' && <Pill small font={font} label={PLATFORM_LABELS[c.platform]} tint={{ bg: p.soft, fg: p.sub }} />}
                          {problems && <Pill small font={font} label="Needs a fix" tint={p.tint.coral} />}
                        </View>
                      </View>
                    </TouchableOpacity>
                    <Switch
                      value={c.enabled}
                      onValueChange={(v) => update(c.id, { enabled: v })}
                      trackColor={{ false: p.line, true: p.success }}
                      thumbColor="#FFFFFF"
                      accessibilityLabel="Show this card"
                    />
                  </Animated.View>
                );
              })}
              {draft.length === 0 && (
                <Text style={[t.sub, { padding: 16 }]}>No cards. Add one from the templates below.</Text>
              )}
            </View>

            {/* Templates */}
            <SectionLabel right={<Text style={t.small}>10 ready to use</Text>}>Standard templates</SectionLabel>
            <View style={styles.grid}>
              {TEMPLATES.map((tpl) => {
                const th = themeFor(tpl.card);
                const showing = draft.some((c) => c.template === tpl.key && c.enabled);
                const added = draft.some((c) => c.template === tpl.key);
                return (
                  <View key={tpl.key} style={[styles.tpl, { backgroundColor: p.card, borderColor: showing ? p.success : p.line }]}>
                    <View style={[styles.tplArt, { backgroundColor: th.bg }]}>
                      <ArtGlyph kind={tpl.card.art} theme={th} size={64} />
                      {showing && (
                        <View style={[styles.tick, { backgroundColor: p.success, borderColor: p.card }]} accessibilityLabel="Showing on Home">
                          <Feather name="check" size={13} color="#FFFFFF" />
                        </View>
                      )}
                    </View>
                    <Text style={t.rowTitle} numberOfLines={1}>{tpl.name}</Text>
                    <Text style={t.small} numberOfLines={1}>
                      {showing ? 'Showing now' : added ? 'Added, paused' : RULE_LABELS[tpl.card.rule]}
                    </Text>
                    <TouchableOpacity
                      onPress={() => addTemplate(tpl.key)}
                      activeOpacity={0.8}
                      style={[styles.smallBtn, { borderColor: p.line }]}
                    >
                      <Feather name="plus" size={14} color={p.text} />
                      <Text style={t.semi}>{added ? 'Add again' : 'Add'}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {/* History */}
            <SectionLabel>Publish history</SectionLabel>
            <View style={[styles.group, { backgroundColor: p.card, borderColor: p.line }]}>
              {(server?.releases ?? []).map((r, i) => (
                <View key={r.version} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: p.divider }]}>
                  <View style={styles.flex}>
                    <Text style={t.rowTitle}>
                      Version {r.version}
                      {r.note ? ` · ${r.note}` : ''}
                    </Text>
                    <Text style={t.small}>
                      {new Date(r.publishedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {r.count} cards
                    </Text>
                  </View>
                  {r.version === liveVersion ? (
                    <Pill small font={font} label="Live" tint={p.tint.green} />
                  ) : (
                    <TouchableOpacity
                      onPress={() => setConfirm({ kind: 'rollback', version: r.version })}
                      style={[styles.smallBtn, { borderColor: p.line, marginTop: 0 }]}
                    >
                      <Text style={t.semi}>Roll back</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {!server?.releases.length && <Text style={[t.sub, { padding: 16 }]}>Nothing published yet.</Text>}
            </View>
          </>
        )}
      </ScrollView>

      {/* Bottom bar */}
      <View style={[styles.bottom, { backgroundColor: p.card, borderTopColor: p.line, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.flex}>
          <Text style={t.semi}>
            {changes.length ? `${changes.length} change${changes.length > 1 ? 's' : ''} not published` : 'Matches what users see'}
          </Text>
          {broken.length > 0 && <Text style={[t.small, { color: p.danger }]}>{broken.length} card{broken.length > 1 ? 's need' : ' needs'} a fix</Text>}
        </View>
        <TouchableOpacity
          onPress={saveDraft}
          disabled={!draftDirty || !!busy}
          style={[styles.btn, { borderColor: p.line, opacity: !draftDirty || busy ? 0.45 : 1 }]}
        >
          {busy === 'save' ? <ActivityIndicator size="small" color={accent} /> : <Text style={t.semi}>Save draft</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setConfirm({ kind: 'publish' })}
          disabled={!changes.length || broken.length > 0 || !!busy}
          style={[
            styles.btn,
            { backgroundColor: p.segActive, borderColor: p.segActive, opacity: !changes.length || broken.length || busy ? 0.45 : 1 },
          ]}
        >
          <Text style={[t.semi, { color: p.segActiveText }]}>Review & publish</Text>
        </TouchableOpacity>
      </View>

      <CardEditor
        key={editing?.id ?? 'none'}
        card={editing}
        onChange={(patch) => editing && update(editing.id, patch)}
        onClose={() => setEditingId(null)}
        onRemove={() => {
          if (!editing) return;
          setDraft((list) => list.filter((c) => c.id !== editing.id));
          setEditingId(null);
        }}
        onDuplicate={() => {
          if (!editing) return;
          const id = freshId(editing.template, draft.map((c) => c.id));
          setDraft((list) => {
            const i = list.findIndex((c) => c.id === editing.id);
            const next = [...list];
            next.splice(i + 1, 0, { ...editing, id });
            return next;
          });
          setEditingId(id);
        }}
        p={p}
        font={font}
      />

      <ConfirmSheet
        key={!confirm ? 'closed' : confirm.kind === 'publish' ? 'publish' : `rollback-${confirm.version}`}
        state={confirm}
        changes={changes}
        nextVersion={liveVersion + 1}
        busy={busy === 'publish' || busy === 'rollback'}
        onCancel={() => setConfirm(null)}
        onPublish={publish}
        onRollback={rollback}
        p={p}
        font={font}
      />
    </View>
  );
};

/* ------------------------------------------------------------------ */
/* Drag handle                                                         */
/* ------------------------------------------------------------------ */

type Drag = { id: string; from: number; to: number; h: number };

/**
 * Six-dot grip. Press and drag to move the row; the page stops scrolling while dragging.
 * Screen readers get "move up / move down" actions instead.
 */
function DragHandle({
  color,
  label,
  onStart,
  onMove,
  onEnd,
  onStep,
}: {
  color: string;
  label: string;
  onStart: () => void;
  onMove: (dy: number) => void;
  onEnd: () => void;
  onStep: (dir: -1 | 1) => void;
}) {
  // Finger position when the drag started; only touched inside touch handlers.
  const startY = useRef(0);

  return (
    <View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      // Don't hand the touch to the page scroll mid-drag
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        startY.current = e.nativeEvent.pageY;
        onStart();
        return true; // Android: stop native views (the ScrollView) taking over
      }}
      onResponderMove={(e) => onMove(e.nativeEvent.pageY - startY.current)}
      onResponderRelease={onEnd}
      onResponderTerminate={onEnd}
      style={styles.grip}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint="Drag to change the order"
      accessibilityActions={[
        { name: 'decrement', label: 'Move up' },
        { name: 'increment', label: 'Move down' },
      ]}
      onAccessibilityAction={(e) => onStep(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
    >
      <MaterialCommunityIcons name="drag" size={22} color={color} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

function CardEditor({
  card,
  onChange,
  onClose,
  onRemove,
  onDuplicate,
  p,
  font,
}: {
  card: HomeCard | null;
  onChange: (patch: Partial<HomeCard>) => void;
  onClose: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  p: AdminPalette;
  font: AdminFont;
}) {
  const insets = useSafeAreaInsets();
  // Reset per card: the parent gives each card's editor its own key
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (!card) return null;
  const t = makeText(p, font);
  const problems = cardProblems(card);
  const theme = themeFor(card);
  const custom = card.colors ?? DEFAULT_CUSTOM;

  const field = (label: string, right?: string) => (
    <View style={styles.fieldHead}>
      <Text style={t.semi}>{label}</Text>
      {right ? <Text style={t.small}>{right}</Text> : null}
    </View>
  );
  const input = [styles.input, { borderColor: p.line, backgroundColor: p.bg, color: p.text }];
  const chip = (on: boolean) => [styles.chip, { borderColor: on ? p.segActive : p.line, backgroundColor: on ? p.segActive : p.card }];
  const chipText = (on: boolean) => [t.small, { color: on ? p.segActiveText : p.sub }, ff(font.bodySemi, '600')];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.flex, { backgroundColor: p.bg }]}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
          <View style={styles.flex}>
            <Text style={t.small}>Editing</Text>
            <Text style={[styles.title, { fontSize: 20, color: p.text }, ff(font.displayBold, '700')]} numberOfLines={1}>
              {card.cta || 'Untitled card'}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={[styles.btn, { backgroundColor: p.segActive, borderColor: p.segActive }]}>
            <Text style={[t.semi, { color: p.segActiveText }]}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 20 }} keyboardShouldPersistTaps="handled">
          <HomeCardFace title={sampleTitle(card.title) || 'Card title'} cta={card.cta || 'Button'} art={card.art} theme={theme} />

          <View style={[styles.rowBetween, { backgroundColor: p.card, borderColor: p.line }]}>
            <View style={styles.flex}>
              <Text style={t.semi}>Show on Home</Text>
              <Text style={t.small}>Off keeps the card here without showing it.</Text>
            </View>
            <Switch value={card.enabled} onValueChange={(v) => onChange({ enabled: v })} trackColor={{ false: p.line, true: p.success }} thumbColor="#FFFFFF" />
          </View>

          <View>
            {field('Title', `${card.title.length}/${LIMITS.title}`)}
            <TextInput
              value={card.title}
              onChangeText={(v) => onChange({ title: v })}
              maxLength={LIMITS.title}
              multiline
              style={[input, { minHeight: 64, textAlignVertical: 'top' }, problems.title ? { borderColor: p.danger } : null]}
              placeholder="Track every rupee without typing"
              placeholderTextColor={p.muted}
            />
            <View style={[styles.chips, { marginTop: 8 }]}>
              {TOKENS.map((tok) => (
                <TouchableOpacity
                  key={tok}
                  onPress={() => card.title.length + tok.length <= LIMITS.title && onChange({ title: `${card.title}${tok}` })}
                  style={[styles.chip, { borderColor: p.line, borderStyle: 'dashed' }]}
                >
                  <Text style={[t.small, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>{tok}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[t.small, { marginTop: 4 }]}>Fill-ins show every user their own numbers. The preview uses sample values.</Text>
            {problems.title ? <Text style={[t.small, { color: p.danger }]}>{problems.title}</Text> : null}
          </View>

          <View>
            {field('Button text', `${card.cta.length}/${LIMITS.cta}`)}
            <TextInput
              value={card.cta}
              onChangeText={(v) => onChange({ cta: v })}
              maxLength={LIMITS.cta}
              style={[input, problems.cta ? { borderColor: p.danger } : null]}
              placeholder="Turn on auto-tracking"
              placeholderTextColor={p.muted}
            />
            {problems.cta ? <Text style={[t.small, { color: p.danger }]}>{problems.cta}</Text> : null}
          </View>

          <View>
            {field('Illustration')}
            <View style={styles.artGrid}>
              {ART_KEYS.map((k) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => onChange({ art: k })}
                  accessibilityLabel={ART_NAMES[k]}
                  style={[styles.artBtn, { backgroundColor: theme.bg, borderColor: card.art === k ? p.segActive : 'transparent' }]}
                >
                  <ArtGlyph kind={k} theme={theme} size={46} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View>
            {field('Colour')}
            <View style={styles.chips}>
              {PRESET_KEYS.map((k) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => onChange({ theme: k })}
                  accessibilityLabel={PRESETS[k].name}
                  style={[styles.swatchBtn, { backgroundColor: PRESETS[k].bg, borderColor: card.theme === k ? p.segActive : p.line }]}
                />
              ))}
              <TouchableOpacity
                onPress={() => onChange({ theme: 'custom', colors: card.colors ?? DEFAULT_CUSTOM })}
                style={[styles.chip, card.theme === 'custom' ? chip(true) : chip(false)]}
              >
                <Text style={chipText(card.theme === 'custom')}>Custom</Text>
              </TouchableOpacity>
            </View>
            {card.theme === 'custom' && (
              <View style={[styles.chips, { marginTop: 10 }]}>
                {(
                  [
                    ['bg', 'Background'],
                    ['fg', 'Text'],
                    ['ctaBg', 'Button'],
                    ['ctaFg', 'Button text'],
                  ] as const
                ).map(([k, label]) => (
                  <View key={k} style={styles.hexField}>
                    <View style={[styles.hexDot, { backgroundColor: isHex(custom[k]) ? custom[k] : 'transparent', borderColor: p.line }]} />
                    <View style={styles.flex}>
                      <Text style={t.small}>{label}</Text>
                      <TextInput
                        value={custom[k]}
                        onChangeText={(v) => onChange({ colors: { ...custom, [k]: v.startsWith('#') ? v : `#${v}` } })}
                        autoCapitalize="characters"
                        maxLength={7}
                        style={[input, { paddingVertical: 6 }]}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
            {problems.colors ? <Text style={[t.small, { color: p.danger, marginTop: 6 }]}>{problems.colors}</Text> : null}
            {card.theme !== 'custom' && card.theme !== 'forest' ? (
              <Text style={[t.small, { marginTop: 6 }]}>If the card next to it has the same colour, the app picks another preset.</Text>
            ) : null}
          </View>

          <View>
            {field('When tapped')}
            <View style={styles.chips}>
              {ACTION_KEYS.map((k) => (
                <TouchableOpacity key={k} onPress={() => onChange({ action: k })} style={chip(card.action === k)}>
                  <Text style={chipText(card.action === k)}>{ACTION_LABELS[k]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {card.action === 'url' && (
              <>
                <TextInput
                  value={card.url ?? ''}
                  onChangeText={(v) => onChange({ url: v.trim() })}
                  autoCapitalize="none"
                  keyboardType="url"
                  placeholder="https://regentmoney.com/diwali"
                  placeholderTextColor={p.muted}
                  style={[input, { marginTop: 10 }, problems.url ? { borderColor: p.danger } : null]}
                />
                <Text style={[t.small, { color: problems.url ? p.danger : p.muted }]}>
                  {problems.url || 'Only links on Regent Money sites are accepted.'}
                </Text>
              </>
            )}
          </View>

          <View>
            {field('Who sees it')}
            <Segmented<PlatformKey>
              options={(['all', 'android', 'ios'] as const).map((k) => ({ id: k, label: k === 'all' ? 'Both' : PLATFORM_LABELS[k].replace(' only', '') }))}
              value={card.platform}
              onChange={(v) => onChange({ platform: v })}
            />
            <View style={[styles.chips, { marginTop: 10 }]}>
              {RULE_KEYS.map((k) => (
                <TouchableOpacity key={k} onPress={() => onChange({ rule: k })} style={chip(card.rule === k)}>
                  <Text style={chipText(card.rule === k)}>{RULE_LABELS[k]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[t.small, { marginTop: 6 }]}>Checked on each phone with data already on it. Nothing about the user is sent to the server.</Text>
          </View>

          <View>
            {field('Schedule', 'optional')}
            <View style={styles.chips}>
              <TextInput
                value={card.startsAt ?? ''}
                onChangeText={(v) => onChange({ startsAt: v.trim() || undefined })}
                placeholder="Start YYYY-MM-DD"
                placeholderTextColor={p.muted}
                maxLength={10}
                style={[input, styles.flex]}
              />
              <TextInput
                value={card.endsAt ?? ''}
                onChangeText={(v) => onChange({ endsAt: v.trim() || undefined })}
                placeholder="End YYYY-MM-DD"
                placeholderTextColor={p.muted}
                maxLength={10}
                style={[input, styles.flex]}
              />
            </View>
            {problems.dates ? <Text style={[t.small, { color: p.danger }]}>{problems.dates}</Text> : null}
          </View>

          <View style={[styles.chips, { borderTopWidth: 1, borderTopColor: p.line, paddingTop: 16 }]}>
            {confirmRemove ? (
              <>
                <Text style={[t.semi, { flexBasis: '100%' }]}>Remove this card? It stays live until you publish.</Text>
                <TouchableOpacity onPress={onRemove} style={[styles.btn, { backgroundColor: p.tint.coral.bg, borderColor: p.dangerLine }]}>
                  <Text style={[t.semi, { color: p.danger }]}>Remove</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setConfirmRemove(false)} style={[styles.btn, { borderColor: p.line }]}>
                  <Text style={t.semi}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={onDuplicate} style={[styles.btn, { borderColor: p.line }]}>
                  <Text style={t.semi}>Duplicate</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setConfirmRemove(true)} style={[styles.btn, { borderColor: p.dangerLine }]}>
                  <Text style={[t.semi, { color: p.danger }]}>Remove card</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Publish / rollback confirmation                                     */
/* ------------------------------------------------------------------ */

const KIND_TINT = (p: AdminPalette, k: CardChange['kind']) =>
  k === 'Added' || k === 'Resumed' ? p.tint.green : k === 'Removed' ? p.tint.coral : k === 'Paused' ? { bg: p.soft, fg: p.sub } : p.tint.amber;

function ConfirmSheet({
  state,
  changes,
  nextVersion,
  busy,
  onCancel,
  onPublish,
  onRollback,
  p,
  font,
}: {
  state: { kind: 'publish' } | { kind: 'rollback'; version: number } | null;
  changes: CardChange[];
  nextVersion: number;
  busy: boolean;
  onCancel: () => void;
  onPublish: (note: string) => void;
  onRollback: (version: number) => void;
  p: AdminPalette;
  font: AdminFont;
}) {
  // Fresh for every opening: the parent keys this sheet by what it confirms
  const [note, setNote] = useState('');
  const [ack, setAck] = useState(false);
  if (!state) return null;
  const t = makeText(p, font);
  const isPublish = state.kind === 'publish';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { backgroundColor: p.card }]}>
          <Text style={[{ fontSize: 20, color: p.text, letterSpacing: -0.3 }, ff(font.displayBold, '700')]}>
            {isPublish
              ? `Publish ${changes.length} change${changes.length > 1 ? 's' : ''} as version ${nextVersion}?`
              : `Roll back to version ${state.version}?`}
          </Text>
          <ScrollView style={{ maxHeight: 260, marginVertical: 12 }}>
            {isPublish ? (
              changes.map((c, i) => (
                <View key={`${c.kind}-${c.id ?? i}`} style={styles.changeRow}>
                  <Pill small font={font} label={c.kind} tint={KIND_TINT(p, c.kind)} />
                  <Text style={[t.sub, styles.flex]}>
                    {c.title ? sampleTitle(c.title) : 'New card order'}
                    {c.fields ? <Text style={t.small}>{`\n${c.fields.join(', ')}`}</Text> : null}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={t.sub}>
                The cards from version {state.version} are published again as version {nextVersion}. This also replaces the current draft.
              </Text>
            )}
          </ScrollView>
          <View style={[styles.reach, { backgroundColor: p.soft }]}>
            <Text style={t.semi}>Reaches users without an app update.</Text>
            <Text style={t.small}>Phones pick it up the next time the app talks to the server, usually within minutes.</Text>
          </View>
          {isPublish && (
            <TextInput
              value={note}
              onChangeText={setNote}
              maxLength={80}
              placeholder="Release note (optional), e.g. Diwali budget push"
              placeholderTextColor={p.muted}
              style={[styles.input, { borderColor: p.line, backgroundColor: p.bg, color: p.text, marginTop: 12 }]}
            />
          )}
          <TouchableOpacity onPress={() => setAck((a) => !a)} style={styles.ack} accessibilityRole="checkbox" accessibilityState={{ checked: ack }}>
            <View style={[styles.box, { borderColor: ack ? p.success : p.line, backgroundColor: ack ? p.success : 'transparent' }]}>
              {ack && <Feather name="check" size={13} color="#FFFFFF" />}
            </View>
            <Text style={[t.sub, styles.flex]}>I checked these cards in the preview.</Text>
          </TouchableOpacity>
          <View style={styles.sheetFoot}>
            <TouchableOpacity onPress={onCancel} disabled={busy} style={[styles.btn, { borderColor: p.line }]}>
              <Text style={t.semi}>Keep editing</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => (isPublish ? onPublish(note.trim()) : onRollback(state.version))}
              disabled={!ack || busy}
              style={[styles.btn, { backgroundColor: p.segActive, borderColor: p.segActive, opacity: !ack || busy ? 0.45 : 1 }]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={p.segActiveText} />
              ) : (
                <Text style={[t.semi, { color: p.segActiveText }]}>{isPublish ? `Publish version ${nextVersion}` : 'Roll back'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const makeText = (p: AdminPalette, font: AdminFont) => ({
  sub: [{ fontSize: 13.5, color: p.sub }, ff(font.body, '500')],
  small: [{ fontSize: 12, color: p.muted }, ff(font.body, '500')],
  semi: [{ fontSize: 13.5, color: p.text }, ff(font.bodySemi, '600')],
  rowTitle: [{ fontSize: 14, color: p.text, lineHeight: 18 }, ff(font.bodySemi, '600')],
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  title: { fontSize: 24, letterSpacing: -0.4 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 14, marginBottom: 4 },
  empty: { height: 150, borderRadius: 24, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', padding: 16 },
  group: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grip: { width: 30, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginRight: -4 },
  lifted: {
    zIndex: 10,
    elevation: 8,
    borderWidth: 1,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1 },
  swatch: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tpl: { width: '48.5%', borderWidth: 1.5, borderRadius: 16, padding: 10, gap: 4 },
  tplArt: { height: 84, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  tick: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  smallBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, marginTop: 6 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  btn: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', minHeight: 42 },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  artGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  artBtn: { width: '18%', aspectRatio: 1, borderRadius: 12, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  swatchBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 3 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 11 },
  hexField: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8 },
  hexDot: { width: 28, height: 28, borderRadius: 8, borderWidth: 1 },
  scrim: { flex: 1, backgroundColor: 'rgba(5,15,10,0.55)', justifyContent: 'center', padding: 16 },
  sheet: { borderRadius: 22, padding: 20 },
  changeRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  reach: { borderRadius: 12, padding: 12, gap: 2 },
  ack: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  sheetFoot: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
});
