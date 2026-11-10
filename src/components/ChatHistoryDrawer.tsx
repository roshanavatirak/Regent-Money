// src/components/ChatHistoryDrawer.tsx
//
// Saved Regent chats in a left drawer (75% of the screen), opened from the Regent
// logo on the chat screen. Pinned chats first, then Today / Yesterday / Earlier.
// Each chat has a "…" menu (also on long-press): Pin, Rename, Delete.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  Animated,
  PanResponder,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { useTheme } from '../store';
import { chatHistory, useChatHistoryStore, ChatSummary, daysLeft, KEEP_DAYS } from '../services/chatHistoryService';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

type Props = {
  visible: boolean;
  onClose: () => void;
  currentChatId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
};

type Section = { key: string; title: string; pinned?: boolean; items: ChatSummary[] };

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const groupChats = (chats: ChatSummary[], query: string): Section[] => {
  const q = query.trim().toLowerCase();
  const list = q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats;
  const today = startOfDay();
  const yesterday = today - 24 * 60 * 60 * 1000;
  const sections: Section[] = [
    { key: 'pinned', title: 'Pinned', pinned: true, items: list.filter((c) => c.pinned) },
    { key: 'today', title: 'Today', items: list.filter((c) => !c.pinned && c.lastMessageAt >= today) },
    { key: 'yesterday', title: 'Yesterday', items: list.filter((c) => !c.pinned && c.lastMessageAt >= yesterday && c.lastMessageAt < today) },
    { key: 'earlier', title: 'Earlier', items: list.filter((c) => !c.pinned && c.lastMessageAt < yesterday) },
  ];
  return sections.filter((s) => s.items.length > 0);
};

export const ChatHistoryDrawer: React.FC<Props> = ({ visible, onClose, currentChatId, onSelect, onNewChat }) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const drawerWidth = Math.round(width * 0.75);

  const chats = useChatHistoryStore((s) => s.chats);

  const [mounted, setMounted] = useState(visible);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState<{ chat: ChatSummary; top: number; left: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<ChatSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const slide = useRef(new Animated.Value(-drawerWidth)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const rowRefs = useRef(new Map<string, View | null>()).current;
  const useNative = Platform.OS !== 'web';

  const p = useMemo(
    () => ({
      sheet: isDark ? colors.card : '#FFFFFF',
      ink: isDark ? '#FFFFFF' : '#0B1F17',
      muted: isDark ? 'rgba(250,251,252,0.62)' : '#5B6B63',
      soft: isDark ? 'rgba(255,255,255,0.07)' : '#EEF3F0',
      line: isDark ? 'rgba(250,251,252,0.08)' : '#EEF3F0',
      primary: isDark ? LIME : FOREST,
      onPrimary: isDark ? FOREST : LIME,
      danger: isDark ? '#FF8A6B' : '#B42E17',
      warn: isDark ? '#FFC24D' : '#9A5B00',
      menu: isDark ? '#30373E' : '#FFFFFF',
      input: isDark ? colors.inputBackground : '#F3F6F4',
    }),
    [isDark, colors]
  );

  const font = {
    display: Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined,
    semi: Font.isLoaded('Figtree_600SemiBold') ? 'Figtree_600SemiBold' : undefined,
    bold: Font.isLoaded('Figtree_700Bold') ? 'Figtree_700Bold' : undefined,
  };
  const ff = (family: string | undefined, weight: '600' | '700' | '800') =>
    family ? { fontFamily: family } : { fontWeight: weight };

  /* ---------------- Open / close ---------------- */

  useEffect(() => {
    if (visible) {
      setMounted(true);
      slide.setValue(-drawerWidth);
      Animated.parallel([
        Animated.spring(slide, { toValue: 0, damping: 26, stiffness: 240, mass: 0.8, overshootClamping: true, useNativeDriver: useNative }),
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: useNative }),
      ]).start();
      chatHistory.refresh();
    } else if (mounted) {
      setMenu(null);
      setRenamingId(null);
      setConfirmDelete(null);
      setNotice(null);
      setSearching(false);
      setQuery('');
      Animated.parallel([
        Animated.timing(slide, { toValue: -drawerWidth, duration: 180, useNativeDriver: useNative }),
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: useNative }),
      ]).start(({ finished }) => finished && setMounted(false));
    }
  }, [visible, drawerWidth]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_, g) => {
          const x = Math.min(0, g.dx);
          slide.setValue(x);
          fade.setValue(1 + x / drawerWidth);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx < -drawerWidth * 0.3 || g.vx < -0.5) onClose();
          else
            Animated.parallel([
              Animated.spring(slide, { toValue: 0, damping: 26, stiffness: 240, overshootClamping: true, useNativeDriver: useNative }),
              Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: useNative }),
            ]).start();
        },
      }),
    [drawerWidth, onClose]
  );

  const sections = useMemo(() => groupChats(chats, query), [chats, query]);

  if (!mounted) return null;

  /* ---------------- Actions ---------------- */

  const openMenu = (chat: ChatSummary) => {
    const ref = rowRefs.get(chat.id);
    if (!ref) return;
    ref.measureInWindow((x, y, w, h) => {
      const menuW = 220;
      const menuH = 160;
      const below = y + h + 4;
      setMenu({
        chat,
        left: Math.max(12, Math.min(x + w - menuW, width - menuW - 12)),
        top: below + menuH > height - insets.bottom - 16 ? Math.max(insets.top + 8, y - menuH - 4) : below,
      });
    });
  };

  // Shown inside the drawer (a second pop-up over this one doesn't show reliably on iOS).
  const fail = (e: any) => {
    setNotice(e?.message || 'Couldn’t update the chat. Try again.');
    setTimeout(() => setNotice(null), 3500);
  };

  const togglePin = async (chat: ChatSummary) => {
    setMenu(null);
    try {
      await chatHistory.setPinned(chat.id, !chat.pinned);
    } catch (e) {
      fail(e);
    }
  };

  const startRename = (chat: ChatSummary) => {
    setMenu(null);
    setRenamingId(chat.id);
    setRenameText(chat.title);
  };

  const saveRename = async () => {
    const id = renamingId;
    if (!id) return;
    setRenamingId(null);
    const current = chats.find((c) => c.id === id);
    if (!renameText.trim() || renameText.trim() === current?.title) return;
    try {
      await chatHistory.rename(id, renameText);
    } catch (e) {
      fail(e);
    }
  };

  const askDelete = (chat: ChatSummary) => {
    setMenu(null);
    setConfirmDelete(chat);
  };

  const doDelete = async () => {
    const chat = confirmDelete;
    setConfirmDelete(null);
    if (!chat) return;
    await chatHistory.remove(chat.id);
    if (chat.id === currentChatId) onNewChat();
  };

  /* ---------------- Rows ---------------- */

  const renderRow = (chat: ChatSummary) => {
    const active = chat.id === currentChatId;
    const left = daysLeft(chat);
    const showLeft = left <= 5;

    if (renamingId === chat.id) {
      return (
        <View key={chat.id} style={[st.row, st.renameRow, { borderColor: p.primary, backgroundColor: p.sheet }]}>
          <TextInput
            value={renameText}
            onChangeText={setRenameText}
            autoFocus
            selectTextOnFocus
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={saveRename}
            onBlur={saveRename}
            style={[st.renameInput, { color: p.ink }, ff(font.bold, '700')]}
            accessibilityLabel="Chat name"
          />
          <Pressable onPress={saveRename} accessibilityRole="button" accessibilityLabel="Save name" style={[st.dots, { backgroundColor: p.primary }]}>
            <Feather name="check" size={16} color={p.onPrimary} />
          </Pressable>
        </View>
      );
    }

    return (
      <View
        key={chat.id}
        ref={(r) => {
          rowRefs.set(chat.id, r);
        }}
        collapsable={false}
        style={[st.row, active && { backgroundColor: menu?.chat.id === chat.id ? (isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8') : p.soft }]}
      >
        <Pressable
          onPress={() => onSelect(chat.id)}
          onLongPress={() => openMenu(chat)}
          delayLongPress={300}
          accessibilityRole="button"
          accessibilityLabel={chat.title}
          accessibilityHint="Long-press for options"
          style={st.rowMain}
        >
          <Text
            numberOfLines={1}
            style={[st.rowText, { color: active ? p.primary : p.ink }, active ? ff(font.bold, '700') : ff(font.semi, '600')]}
          >
            {chat.title}
          </Text>
          {showLeft && !active ? (
            <Text style={[st.leftText, { color: p.warn }, ff(font.bold, '700')]}>{left}d left</Text>
          ) : null}
        </Pressable>
        {active ? (
          <Pressable
            onPress={() => openMenu(chat)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Chat options"
            style={[st.dots, menu?.chat.id === chat.id && { backgroundColor: p.primary }]}
          >
            <Feather name="more-horizontal" size={18} color={menu?.chat.id === chat.id ? p.onPrimary : p.primary} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  /* ---------------- Render ---------------- */

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, st.backdrop, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close chat history" />
        </Animated.View>

        <Animated.View
          {...pan.panHandlers}
          style={[
            st.drawer,
            {
              width: drawerWidth,
              backgroundColor: p.sheet,
              paddingTop: insets.top + 16,
              transform: [{ translateX: slide }],
            },
          ]}
          accessibilityRole="menu"
          accessibilityLabel="Chat history"
        >
          {/* Header */}
          <View style={st.header}>
            <Text style={[st.title, { color: p.ink }, ff(font.display, '800')]}>Chats</Text>
            <Pressable
              onPress={() => {
                setSearching((v) => !v);
                setQuery('');
              }}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Search chats"
              style={st.iconBtn}
            >
              <Feather name={searching ? 'x-circle' : 'search'} size={18} color={p.primary} />
            </Pressable>
            <Pressable onPress={onClose} hitSlop={6} accessibilityRole="button" accessibilityLabel="Close chat history" style={st.iconBtn}>
              <Feather name="x" size={19} color={p.primary} />
            </Pressable>
          </View>

          {notice ? (
            <View style={[st.notice, { backgroundColor: isDark ? 'rgba(255,138,107,0.14)' : '#FFF4F1' }]}>
              <Feather name="alert-circle" size={14} color={p.danger} />
              <Text style={[st.noticeText, { color: p.danger }, ff(font.semi, '600')]}>{notice}</Text>
            </View>
          ) : null}

          {searching ? (
            <View style={[st.search, { backgroundColor: p.input }]}>
              <Feather name="search" size={15} color={p.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                autoFocus
                placeholder="Search chats"
                placeholderTextColor={p.muted}
                style={[st.searchInput, { color: p.ink }, ff(font.semi, '600')]}
                accessibilityLabel="Search chats"
              />
            </View>
          ) : null}

          {/* New chat */}
          <Pressable
            onPress={onNewChat}
            accessibilityRole="button"
            style={({ pressed }) => [st.newChat, pressed && { backgroundColor: p.soft }]}
          >
            <View style={[st.newChatIcon, { backgroundColor: FOREST }]}>
              <Feather name="edit-3" size={14} color={LIME} />
            </View>
            <Text style={[st.newChatText, { color: p.primary }, ff(font.bold, '700')]}>New chat</Text>
          </Pressable>

          {/* List */}
          {chats.length === 0 ? (
            <View style={st.empty}>
              <View style={[st.emptyIcon, { backgroundColor: FOREST }]}>
                <Feather name="message-square" size={22} color={LIME} />
              </View>
              <Text style={[st.emptyTitle, { color: p.ink }, ff(font.display, '800')]}>No chats yet</Text>
              <Text style={[st.emptyText, { color: p.muted }, ff(font.semi, '600')]}>Your chats show here for {KEEP_DAYS} days.</Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScrollBeginDrag={() => setMenu(null)}
            >
              {sections.length === 0 ? (
                <Text style={[st.noMatch, { color: p.muted }, ff(font.semi, '600')]}>No chats match “{query}”</Text>
              ) : (
                sections.map((s) => (
                  <View key={s.key}>
                    <View style={st.sectionHead}>
                      {s.pinned ? <Feather name="bookmark" size={12} color={p.muted} /> : null}
                      <Text style={[st.sectionTitle, { color: p.muted }, ff(font.bold, '700')]}>{s.title}</Text>
                    </View>
                    {s.items.map(renderRow)}
                  </View>
                ))
              )}
            </ScrollView>
          )}

          <View style={[st.footer, { borderTopColor: p.line, paddingBottom: Math.max(insets.bottom, 12) + 10 }]}>
            <Feather name="clock" size={13} color={p.muted} />
            <Text style={[st.footerText, { color: p.muted }, ff(font.semi, '600')]}>Chats are kept for {KEEP_DAYS} days</Text>
          </View>
        </Animated.View>

        {/* Row menu */}
        {menu ? (
          <>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)} accessibilityLabel="Close options" />
            <View style={[st.menu, { top: menu.top, left: menu.left, backgroundColor: p.menu }]} accessibilityRole="menu">
              <MenuItem
                icon="bookmark"
                label={menu.chat.pinned ? 'Unpin' : 'Pin'}
                color={p.ink}
                iconColor={p.primary}
                font={ff(font.semi, '600')}
                onPress={() => togglePin(menu.chat)}
              />
              <MenuItem icon="edit-2" label="Rename" color={p.ink} iconColor={p.primary} font={ff(font.semi, '600')} onPress={() => startRename(menu.chat)} />
              <View style={[st.menuDivider, { backgroundColor: p.line }]} />
              <MenuItem icon="trash-2" label="Delete" color={p.danger} iconColor={p.danger} font={ff(font.semi, '600')} onPress={() => askDelete(menu.chat)} />
            </View>
          </>
        ) : null}

        {/* Delete confirmation */}
        {confirmDelete ? (
          <View style={[StyleSheet.absoluteFill, st.dialogWrap]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmDelete(null)} accessibilityLabel="Cancel" />
            <View style={[st.dialog, { backgroundColor: p.sheet }]} accessibilityRole="alert">
              <View style={[st.dialogIcon, { backgroundColor: isDark ? 'rgba(255,138,107,0.18)' : '#FDE4DF' }]}>
                <Feather name="trash-2" size={20} color={p.danger} />
              </View>
              <Text style={[st.dialogTitle, { color: p.ink }, ff(font.display, '800')]}>Delete this chat?</Text>
              <Text style={[st.dialogText, { color: p.muted }, ff(font.semi, '600')]}>
                “{confirmDelete.title}” is removed from all your devices.
              </Text>
              <View style={st.dialogButtons}>
                <Pressable
                  onPress={() => setConfirmDelete(null)}
                  accessibilityRole="button"
                  style={[st.dialogBtn, { backgroundColor: p.soft }]}
                >
                  <Text style={[st.dialogBtnText, { color: p.primary }, ff(font.bold, '700')]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={doDelete}
                  accessibilityRole="button"
                  style={[st.dialogBtn, { backgroundColor: isDark ? '#E5482C' : '#C8361D' }]}
                >
                  <Text style={[st.dialogBtnText, { color: '#FFFFFF' }, ff(font.bold, '700')]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
};

const MenuItem: React.FC<{
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
  iconColor: string;
  font: object;
  onPress: () => void;
}> = ({ icon, label, color, iconColor, font, onPress }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="menuitem"
    style={({ pressed }) => [st.menuItem, pressed && { opacity: 0.6 }]}
  >
    <Feather name={icon} size={17} color={iconColor} />
    <Text style={[st.menuText, { color }, font]}>{label}</Text>
  </Pressable>
);

const st = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(7, 17, 13, 0.45)' },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 20, paddingRight: 12, marginBottom: 10 },
  title: { flex: 1, fontSize: 24, letterSpacing: -0.4 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, borderRadius: 999, marginHorizontal: 14, marginBottom: 8, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },

  newChat: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 46, marginHorizontal: 10, paddingHorizontal: 12, borderRadius: 14 },
  newChatIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  newChatText: { fontSize: 15 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 6, marginHorizontal: 12 },
  sectionTitle: { fontSize: 12.5 },

  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderRadius: 14, paddingLeft: 12, paddingRight: 4 },
  rowMain: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { flex: 1, fontSize: 14.5 },
  leftText: { fontSize: 11.5, marginRight: 8 },
  dots: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  renameRow: { borderWidth: 1.5, minHeight: 46 },
  renameInput: { flex: 1, fontSize: 14.5, paddingVertical: 0 },

  noMatch: { fontSize: 13, textAlign: 'center', marginTop: 24 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 60, gap: 8 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 21, letterSpacing: -0.3 },
  emptyText: { fontSize: 14, textAlign: 'center' },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 14, paddingHorizontal: 20 },
  footerText: { fontSize: 12.5 },

  menu: {
    position: 'absolute',
    width: 220,
    borderRadius: 20,
    padding: 6,
    gap: 2,
    shadowColor: '#0B1F17',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 14,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 46, borderRadius: 14, paddingHorizontal: 12 },
  menuText: { fontSize: 15 },
  menuDivider: { height: 1, marginHorizontal: 8, marginVertical: 4 },

  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 8, padding: 10, borderRadius: 12 },
  noticeText: { flex: 1, fontSize: 12.5 },

  dialogWrap: { backgroundColor: 'rgba(7, 17, 13, 0.4)', justifyContent: 'center', paddingHorizontal: 24 },
  dialog: { borderRadius: 26, padding: 20, gap: 6 },
  dialogIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  dialogTitle: { fontSize: 21, letterSpacing: -0.3 },
  dialogText: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  dialogButtons: { flexDirection: 'row', gap: 10 },
  dialogBtn: { flex: 1, height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dialogBtnText: { fontSize: 15 },
});
