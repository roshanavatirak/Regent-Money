// src/services/adminFeedbackService.ts
//
// Admin side of suggestions and bug reports: list with filters, counts,
// one item, and status / priority / reply updates (optionally telling the sender).

import { apiFetch } from './apiClient';
import type { FeedbackKind, FeedbackPriority, FeedbackStatus } from './feedbackService';

export type { FeedbackKind, FeedbackPriority, FeedbackStatus };

export interface FeedbackSender {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  reportCount: number;
}

export interface AdminFeedbackItem {
  id: string;
  userId: string | null;
  kind: FeedbackKind;
  title: string;
  description: string;
  area: string | null;
  impact: string | null;
  priority: FeedbackPriority;
  status: FeedbackStatus;
  mediaUrls: string[];
  mediaPurged: boolean;
  adminNotes: string | null;
  appVersion: string | null;
  platform: string | null;
  osVersion: string | null;
  theme: string | null;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
  user: FeedbackSender | null;
}

export interface FeedbackStats {
  total: number;
  feature: number;
  bug: number;
  byStatus: Record<FeedbackStatus, number>;
  awaitingReply: number;
  oldestAwaitingAt: number | null;
  criticalOpen: number;
  fixedLast7d: number;
}

export interface FeedbackFilters {
  kind?: FeedbackKind;
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  area?: string;
  search?: string;
  since?: number;
  limit?: number;
  offset?: number;
}

export interface FeedbackUpdate {
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  adminNotes?: string;
  notify?: boolean;
}

const num = (v: any): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

const normalize = (raw: any): AdminFeedbackItem => ({
  ...raw,
  mediaUrls: Array.isArray(raw?.mediaUrls) ? raw.mediaUrls : [],
  mediaPurged: !!raw?.mediaPurged,
  createdAt: Number(raw?.createdAt) || 0,
  updatedAt: Number(raw?.updatedAt) || 0,
  resolvedAt: num(raw?.resolvedAt),
  user: raw?.user ?? null,
});

async function readError(res: Response, fallback: string): Promise<Error> {
  const err = await res.json().catch(() => ({}));
  const msg = Array.isArray(err?.message) ? err.message[0] : err?.message;
  return new Error(msg || `${fallback} (${res.status})`);
}

export const adminFeedbackService = {
  async list(filters: FeedbackFilters = {}): Promise<{ items: AdminFeedbackItem[]; total: number }> {
    const params = new URLSearchParams();
    params.set('limit', String(filters.limit ?? 30));
    params.set('offset', String(filters.offset ?? 0));
    if (filters.kind) params.set('kind', filters.kind);
    if (filters.status) params.set('status', filters.status);
    if (filters.priority) params.set('priority', filters.priority);
    if (filters.area) params.set('area', filters.area);
    if (filters.search?.trim()) params.set('search', filters.search.trim());
    if (filters.since) params.set('since', String(filters.since));

    const res = await apiFetch(`/feedback/admin/all?${params.toString()}`);
    if (!res.ok) throw await readError(res, "Couldn't load feedback");
    const json = await res.json();
    return { items: (json?.items || []).map(normalize), total: Number(json?.total) || 0 };
  },

  async stats(): Promise<FeedbackStats> {
    const res = await apiFetch('/feedback/admin/stats');
    if (!res.ok) throw await readError(res, "Couldn't load counts");
    return res.json();
  },

  async get(id: string): Promise<AdminFeedbackItem> {
    const res = await apiFetch(`/feedback/admin/${encodeURIComponent(id)}`);
    if (!res.ok) throw await readError(res, "Couldn't load this item");
    return normalize(await res.json());
  },

  async update(id: string, changes: FeedbackUpdate): Promise<AdminFeedbackItem> {
    const res = await apiFetch(`/feedback/admin/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (!res.ok) throw await readError(res, "Couldn't save");
    return normalize(await res.json());
  },
};
