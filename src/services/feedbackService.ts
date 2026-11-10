// src/services/feedbackService.ts
//
// Sends feature ideas and bug reports to the backend, keeps a draft
// while the person types, and syncs history and real-time status from the server.

import { Platform } from 'react-native';
import { mmkvStorage } from '../db/mmkv';
import { authService } from './authService';
import { getBackendUrl } from '../config/api';
import { getAppCurrentVersion } from './updateService';

export type FeedbackKind = 'feature' | 'bug';
export type FeedbackPriority = 'low' | 'medium' | 'high' | 'critical';
export type FeedbackStatus = 'open' | 'investigating' | 'in_progress' | 'fixed' | 'resolved' | 'closed';

export interface FeedbackInput {
  kind: FeedbackKind;
  title: string;
  description: string;
  area?: string;
  impact?: string;
  priority?: FeedbackPriority;
  /** Optional base64 screenshots (max 3) */
  images?: string[];
  /** Send app version, phone OS and theme. Defaults to true. */
  includeDevice?: boolean;
  /** Extra device fields shown to the person before sending, e.g. { theme: 'light' } */
  device?: Record<string, string>;
}

export interface SentFeedback {
  id: string;
  kind: FeedbackKind;
  title: string;
  description?: string;
  area?: string;
  impact?: string;
  priority?: FeedbackPriority;
  status?: FeedbackStatus;
  mediaUrls?: string[];
  adminNotes?: string | null;
  sentAt: number;
  resolvedAt?: number | null;
}

const HISTORY_KEY = 'feedback_history_v1';
const draftKey = (kind: FeedbackKind) => `feedback_draft_${kind}_v1`;

const readJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = (mmkvStorage as any).getString?.(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJSON = (key: string, value: unknown) => {
  try {
    (mmkvStorage as any).setString?.(key, JSON.stringify(value));
  } catch {}
};

export const feedbackService = {
  /** Sends to POST /feedback. Throws with a readable message if it fails. */
  async submit(input: FeedbackInput): Promise<SentFeedback> {
    const token = authService.getAccessToken();
    if (!token) throw new Error('Sign in again to send feedback.');

    const response = await fetch(`${getBackendUrl()}/feedback`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: input.kind,
        title: input.title.trim(),
        description: input.description.trim(),
        area: input.area,
        impact: input.impact,
        priority: input.priority || 'medium',
        images: input.images && input.images.length > 0 ? input.images.slice(0, 3) : undefined,
        ...(input.includeDevice === false
          ? {}
          : {
              appVersion: getAppCurrentVersion(),
              platform: Platform.OS,
              osVersion: String(Platform.Version ?? ''),
              ...(input.device || {}),
            }),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Couldn’t send it. Check your connection and try again.');
    }

    const json = await response.json().catch(() => ({}));
    const sent: SentFeedback = {
      id: json.id || `local_${Date.now()}`,
      kind: input.kind,
      title: input.title.trim(),
      description: input.description.trim(),
      area: input.area,
      impact: input.impact,
      priority: (json.priority || input.priority || 'medium') as FeedbackPriority,
      status: (json.status || 'open') as FeedbackStatus,
      mediaUrls: json.mediaUrls || [],
      sentAt: json.createdAt ? Number(json.createdAt) : Date.now(),
    };
    writeJSON(HISTORY_KEY, [sent, ...this.history()].slice(0, 30));
    this.clearDraft(input.kind);
    return sent;
  },

  /** Retrieves user's feedback history from server with updated statuses & admin notes. */
  async fetchMyReports(): Promise<SentFeedback[]> {
    try {
      const token = authService.getAccessToken();
      if (!token) return this.history();

      const response = await fetch(`${getBackendUrl()}/feedback/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) return this.history();

      const remoteItems = await response.json();
      if (Array.isArray(remoteItems)) {
        const mapped: SentFeedback[] = remoteItems.map((item: any) => ({
          id: item.id,
          kind: item.kind,
          title: item.title,
          description: item.description,
          area: item.area,
          impact: item.impact,
          priority: item.priority,
          status: item.status,
          mediaUrls: item.mediaUrls || [],
          adminNotes: item.adminNotes,
          sentAt: Number(item.createdAt) || Date.now(),
          resolvedAt: item.resolvedAt ? Number(item.resolvedAt) : null,
        }));
        writeJSON(HISTORY_KEY, mapped.slice(0, 50));
        return mapped;
      }
    } catch (err) {
      console.warn('[FeedbackService] Failed to sync reports from server:', err);
    }
    return this.history();
  },

  /**
   * Edits a report you sent. The server only allows this while its status is 'open'.
   * Returns the saved report and refreshes the local history copy.
   */
  async update(
    id: string,
    changes: { title?: string; description?: string; area?: string | null; impact?: string | null; priority?: FeedbackPriority },
  ): Promise<SentFeedback> {
    const token = authService.getAccessToken();
    if (!token) throw new Error('Sign in again to edit this report.');

    const response = await fetch(`${getBackendUrl()}/feedback/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...changes,
        title: changes.title?.trim(),
        description: changes.description?.trim(),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Couldn’t save your changes. Try again.');
    }

    const item = await response.json();
    const updated: SentFeedback = {
      id: item.id,
      kind: item.kind,
      title: item.title,
      description: item.description,
      area: item.area ?? undefined,
      impact: item.impact ?? undefined,
      priority: item.priority,
      status: item.status,
      mediaUrls: item.mediaUrls || [],
      adminNotes: item.adminNotes,
      sentAt: Number(item.createdAt) || Date.now(),
      resolvedAt: item.resolvedAt ? Number(item.resolvedAt) : null,
    };
    writeJSON(
      HISTORY_KEY,
      this.history().map((h) => (h.id === id ? updated : h)),
    );
    return updated;
  },

  history(kind?: FeedbackKind): SentFeedback[] {
    const all = readJSON<SentFeedback[]>(HISTORY_KEY, []);
    return kind ? all.filter((f) => f.kind === kind) : all;
  },

  getDraft(kind: FeedbackKind): Partial<FeedbackInput> {
    return readJSON(draftKey(kind), {});
  },
  saveDraft(kind: FeedbackKind, draft: Partial<FeedbackInput>) {
    writeJSON(draftKey(kind), draft);
  },
  clearDraft(kind: FeedbackKind) {
    writeJSON(draftKey(kind), {});
  },
};
