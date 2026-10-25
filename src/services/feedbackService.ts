// src/services/feedbackService.ts
//
// Sends feature ideas (and later, bug reports) to the backend, keeps a draft
// while the person types, and remembers what they've sent on this phone.

import { Platform } from 'react-native';
import { mmkvStorage } from '../db/mmkv';
import { authService } from './authService';
import { getBackendUrl } from '../config/api';
import { getAppCurrentVersion } from './updateService';

export type FeedbackKind = 'feature' | 'bug';

export interface FeedbackInput {
  kind: FeedbackKind;
  title: string;
  description: string;
  area?: string;
  impact?: string;
  /** Send app version, phone OS and theme. Defaults to true. */
  includeDevice?: boolean;
  /** Extra device fields shown to the person before sending, e.g. { theme: 'light' } */
  device?: Record<string, string>;
}

export interface SentFeedback {
  id: string;
  kind: FeedbackKind;
  title: string;
  area?: string;
  sentAt: number;
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
      area: input.area,
      sentAt: Date.now(),
    };
    writeJSON(HISTORY_KEY, [sent, ...this.history()].slice(0, 30));
    this.clearDraft(input.kind);
    return sent;
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
