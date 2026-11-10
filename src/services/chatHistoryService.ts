// src/services/chatHistoryService.ts
//
// Saved Regent chats. The phone keeps a copy (MMKV) so the history drawer opens
// instantly and works offline; the server (/chats) is the source of truth across
// devices. No AI calls happen here: titles come from the first question.
//
// Consistency rules (mirrored on the server):
//  - Saving a chat replaces its messages; the newest copy wins (409 → reload server copy).
//  - Rename / pin / delete apply on the phone at once and are undone if the server refuses.
//  - A deleted chat is a tombstone on the server, so an old phone can't bring it back (410).
//  - Chats are kept 30 days after their last message, pinned chats 90 days (max 5 pinned).

import { create } from 'zustand';
import { mmkvStorage } from '../db/mmkv';
import { getBackendUrl } from '../config/api';
import { tokenStore } from './tokenStore';
import type { ChatMessage } from './aiService';

const DAY_MS = 24 * 60 * 60 * 1000;
export const KEEP_DAYS = 30;
export const PINNED_KEEP_DAYS = 90;
export const MAX_PINNED = 5;

export interface ChatSummary {
  id: string;
  title: string;
  pinned: boolean;
  messageCount: number;
  lastMessageAt: number;
  updatedAt: number;
  expiresAt: number;
  /** Local changes not yet on the server. */
  pending?: boolean;
  /** Quick fingerprint of the saved messages, to skip saving an unchanged chat. */
  sig?: string;
}

type StoredMessage = { role: 'user' | 'assistant'; content: string; timestamp: number; isEdited?: boolean };

/* ------------------------------------------------------------------ */
/* Storage (per signed-in user)                                        */
/* ------------------------------------------------------------------ */

const currentUserId = (): string => {
  try {
    const { useAuthStore } = require('../store');
    return useAuthStore.getState().user?.id || 'anon';
  } catch {
    return 'anon';
  }
};
const listKey = () => `chat_threads_v1_${currentUserId()}`;
const msgsKey = (id: string) => `chat_msgs_v1_${currentUserId()}_${id}`;
const deletesKey = () => `chat_deletes_v1_${currentUserId()}`;

const readList = (): ChatSummary[] => mmkvStorage.getObject<ChatSummary[]>(listKey()) || [];
const readDeletes = (): string[] => mmkvStorage.getObject<string[]>(deletesKey()) || [];
const writeDeletes = (ids: string[]) => mmkvStorage.setObject(deletesKey(), ids);

const sortChats = (list: ChatSummary[]) => [...list].sort((a, b) => b.lastMessageAt - a.lastMessageAt);

/* ------------------------------------------------------------------ */
/* Store the drawer renders from                                       */
/* ------------------------------------------------------------------ */

interface ChatHistoryState {
  chats: ChatSummary[];
  loading: boolean;
  setChats: (chats: ChatSummary[]) => void;
}

export const useChatHistoryStore = create<ChatHistoryState>((set) => ({
  chats: [],
  loading: false,
  setChats: (chats) => set({ chats: sortChats(chats) }),
}));

const commit = (list: ChatSummary[]) => {
  const now = Date.now();
  const live = list.filter((c) => c.expiresAt > now);
  mmkvStorage.setObject(listKey(), live);
  useChatHistoryStore.getState().setChats(live);
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const newChatId = () => `chat_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const titleFromMessages = (messages: { role: string; content: string }[]): string => {
  const first = messages.find((m) => m.role === 'user')?.content?.replace(/\s+/g, ' ').trim() || 'New chat';
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first;
};

const toStored = (messages: ChatMessage[]): StoredMessage[] =>
  messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : String(m.content ?? ''),
      timestamp: m.timestamp || Date.now(),
      ...(m.isEdited ? { isEdited: true } : {}),
    }));

const signature = (m: StoredMessage[]) => {
  const last = m[m.length - 1];
  return `${m.length}:${last?.timestamp ?? 0}:${last?.content.length ?? 0}`;
};

const expiryFor = (pinned: boolean, from: number) => from + (pinned ? PINNED_KEEP_DAYS : KEEP_DAYS) * DAY_MS;

/** Days left before a chat is removed (rounded up), for the "4d left" label. */
export const daysLeft = (c: ChatSummary, now = Date.now()) => Math.max(0, Math.ceil((c.expiresAt - now) / DAY_MS));

const api = async (path: string, init: RequestInit = {}) => {
  const token = tokenStore.getAccessToken();
  if (!token) throw Object.assign(new Error('Sign in again to sync your chats.'), { status: 401 });
  const res = await fetch(`${getBackendUrl()}/chats${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.message || 'Couldn’t reach the server. Try again.'), { status: res.status });
  }
  return res.status === 204 ? null : res.json().catch(() => null);
};

const fromServer = (s: any): ChatSummary => ({
  id: s.id,
  title: s.title || 'New chat',
  pinned: !!s.pinned,
  messageCount: Number(s.messageCount) || 0,
  lastMessageAt: Number(s.lastMessageAt) || Date.now(),
  updatedAt: Number(s.updatedAt) || Date.now(),
  expiresAt: Number(s.expiresAt) || expiryFor(!!s.pinned, Date.now()),
  pending: false,
});

/* ------------------------------------------------------------------ */
/* Uploads (debounced per chat)                                        */
/* ------------------------------------------------------------------ */

const uploadTimers = new Map<string, ReturnType<typeof setTimeout>>();

const upload = async (id: string) => {
  const summary = readList().find((c) => c.id === id);
  const messages = mmkvStorage.getObject<StoredMessage[]>(msgsKey(id));
  if (!summary || !messages || messages.length === 0) return;
  try {
    const saved = await api(`/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ title: summary.title, messages, updatedAt: summary.updatedAt }),
    });
    const merged = { ...summary, ...fromServer(saved), title: summary.title || saved.title, sig: summary.sig };
    // Only clear `pending` if nothing changed locally while the upload was in flight.
    const latest = readList().find((c) => c.id === id);
    commit(readList().map((c) => (c.id === id ? { ...merged, pending: latest?.sig !== summary.sig } : c)));
  } catch (e: any) {
    if (e.status === 409) {
      // Another device saved a newer copy: take it.
      await chatHistory.loadMessages(id, { forceServer: true }).catch(() => {});
    } else if (e.status === 410 || e.status === 404) {
      // Deleted (or expired) elsewhere: drop it here too.
      removeLocal(id);
    }
    // Network errors: stay pending; refresh() retries.
  }
};

const scheduleUpload = (id: string, delay = 1200) => {
  const t = uploadTimers.get(id);
  if (t) clearTimeout(t);
  uploadTimers.set(
    id,
    setTimeout(() => {
      uploadTimers.delete(id);
      upload(id);
    }, delay),
  );
};

/** Makes sure a chat exists on the server before changing it there. */
const ensureUploaded = async (id: string) => {
  if (!readList().find((c) => c.id === id)?.pending) return;
  const t = uploadTimers.get(id);
  if (t) clearTimeout(t);
  uploadTimers.delete(id);
  await upload(id);
};

const removeLocal = (id: string) => {
  mmkvStorage.delete(msgsKey(id));
  commit(readList().filter((c) => c.id !== id));
};

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export const chatHistory = {
  /** Shows the cached list straight away (call on screen mount). */
  hydrate() {
    commit(readList());
  },

  /**
   * Saves the open chat on the phone and uploads it shortly after.
   * Skips the write when nothing changed (e.g. just opening an old chat).
   */
  save(id: string, messages: ChatMessage[]) {
    const stored = toStored(messages);
    if (stored.length === 0) return;
    const sig = signature(stored);
    const list = readList();
    const existing = list.find((c) => c.id === id);
    if (existing && existing.sig === sig) return;

    const now = Date.now();
    const lastMessageAt = Math.max(...stored.map((m) => m.timestamp));
    const pinned = existing?.pinned ?? false;
    const summary: ChatSummary = {
      id,
      title: existing?.title || titleFromMessages(stored),
      pinned,
      messageCount: stored.length,
      lastMessageAt,
      updatedAt: Math.max(now, (existing?.updatedAt ?? 0) + 1),
      expiresAt: Math.max(existing?.expiresAt ?? 0, expiryFor(pinned, Math.min(lastMessageAt, now))),
      pending: true,
      sig,
    };
    mmkvStorage.setObject(msgsKey(id), stored);
    commit(existing ? list.map((c) => (c.id === id ? summary : c)) : [summary, ...list]);
    scheduleUpload(id);
  },

  /** Messages for a chat: from the phone if cached, otherwise from the server. */
  async loadMessages(id: string, opts: { forceServer?: boolean } = {}): Promise<ChatMessage[]> {
    if (!opts.forceServer) {
      const cached = mmkvStorage.getObject<StoredMessage[]>(msgsKey(id));
      if (cached && cached.length) return cached.map((m, i) => ({ ...m, id: `${id}_${i}` }));
    }
    const data = await api(`/${encodeURIComponent(id)}`);
    const messages: StoredMessage[] = data?.messages || [];
    mmkvStorage.setObject(msgsKey(id), messages);
    const summary = { ...fromServer(data), sig: signature(messages) };
    const list = readList();
    commit(list.some((c) => c.id === id) ? list.map((c) => (c.id === id ? summary : c)) : [summary, ...list]);
    return messages.map((m, i) => ({ ...m, id: `${id}_${i}` }));
  },

  /**
   * Syncs with the server: retries pending uploads and deletes, then takes the
   * server's list as the truth (chats deleted or expired elsewhere disappear here).
   */
  async refresh() {
    useChatHistoryStore.setState({ loading: true });
    try {
      for (const id of readDeletes()) {
        try {
          await api(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
          writeDeletes(readDeletes().filter((x) => x !== id));
        } catch {}
      }
      for (const c of readList().filter((x) => x.pending)) await upload(c.id);

      const server: any[] = (await api('')) || [];
      const serverIds = new Set(server.map((s) => s.id));
      const local = readList();
      const localById = new Map(local.map((c) => [c.id, c]));

      const merged: ChatSummary[] = server.map((s) => {
        const mine = localById.get(s.id);
        const fresh = fromServer(s);
        // Messages changed on another device: drop the cached copy so it reloads.
        if (mine && mine.updatedAt < fresh.updatedAt) mmkvStorage.delete(msgsKey(s.id));
        return mine?.pending ? mine : { ...fresh, sig: mine && mine.updatedAt >= fresh.updatedAt ? mine.sig : undefined };
      });
      // Keep chats that only exist here because they haven't uploaded yet.
      for (const c of local) if (c.pending && !serverIds.has(c.id)) merged.push(c);
      for (const c of local) if (!c.pending && !serverIds.has(c.id)) mmkvStorage.delete(msgsKey(c.id));

      commit(merged);
    } catch {
      commit(readList()); // offline: keep what we have
    } finally {
      useChatHistoryStore.setState({ loading: false });
    }
  },

  async rename(id: string, title: string) {
    const clean = title.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!clean) throw new Error('Give the chat a name.');
    await ensureUploaded(id);
    const before = readList();
    commit(before.map((c) => (c.id === id ? { ...c, title: clean } : c)));
    try {
      const saved = await api(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title: clean }) });
      commit(readList().map((c) => (c.id === id ? { ...c, ...fromServer(saved), pending: c.pending, sig: c.sig } : c)));
    } catch (e) {
      commit(before);
      throw e;
    }
  },

  async setPinned(id: string, pinned: boolean) {
    await ensureUploaded(id);
    const before = readList();
    if (pinned && before.filter((c) => c.pinned).length >= MAX_PINNED) {
      throw new Error(`You can pin up to ${MAX_PINNED} chats. Unpin one first.`);
    }
    const now = Date.now();
    commit(
      before.map((c) =>
        c.id === id
          ? { ...c, pinned, expiresAt: pinned ? expiryFor(true, c.expiresAt - KEEP_DAYS * DAY_MS) : expiryFor(false, now) }
          : c,
      ),
    );
    try {
      const saved = await api(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ pinned }) });
      commit(readList().map((c) => (c.id === id ? { ...c, ...fromServer(saved), pending: c.pending, sig: c.sig } : c)));
    } catch (e) {
      commit(before);
      throw e;
    }
  },

  /** Removes the chat here at once; the server delete is retried until it succeeds. */
  async remove(id: string) {
    const t = uploadTimers.get(id);
    if (t) clearTimeout(t);
    uploadTimers.delete(id);
    removeLocal(id);
    writeDeletes([...new Set([...readDeletes(), id])]);
    try {
      await api(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
      writeDeletes(readDeletes().filter((x) => x !== id));
    } catch {}
  },
};
