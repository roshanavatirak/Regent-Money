// src/services/voiceEntryService.ts
//
// Voice entry, phone side: sends one short recording to the backend and gets draft
// transactions back. Nothing is saved until the person confirms on the review screen.

import { File } from 'expo-file-system';
import { useBankStore, useTransactionStore } from '../store';
import { authService } from './authService';
import { uploadFile, UploadError } from './uploadFile';
import { getBackendUrl } from '../config/api';
import { getCashProfile } from './cashService';
import { tagLearningService } from './tagLearningService';
import { getCategory } from '../constants/categories';
import { readSpokenLocally } from './voiceParser';

export type VoiceLanguage = 'hi' | 'en';

export interface VoiceDraft {
  type: 'debit' | 'credit';
  amount: number | null;
  merchant: string;
  category: string;
  /** An account name the phone sent, 'cash', or null when none was said. */
  account: string | null;
  date: string | null;
  time: string | null;
  /** False when the amount could not be matched to the words that were said. */
  amountVerified: boolean;
}

export type VoiceProblem =
  | 'no_speech'
  | 'not_a_transaction'
  | 'offline'
  | 'limit'
  | 'unavailable'
  | 'signed_out';

export type VoiceOutcome =
  | { ok: true; transcript: string; drafts: VoiceDraft[] }
  | { ok: false; problem: VoiceProblem; message?: string; transcript?: string };

/** The longest recording the app makes. The speech service accepts 30 seconds per request. */
export const MAX_RECORDING_MS = 25_000;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Account names as the person would say them, without duplicates. */
export const spokenAccountNames = (): string[] => {
  const names = useBankStore.getState().bankProfiles.map((b) => String(b.bankName || '').trim());
  return [...new Set(names.filter(Boolean))].slice(0, 20);
};

/** Sends the recording and returns drafts, or the reason there are none. Never throws. */
export async function sendVoiceRecording(fileUri: string, lang: VoiceLanguage): Promise<VoiceOutcome> {
  const token = authService.getAccessToken();
  if (!token) return { ok: false, problem: 'signed_out' };

  try {
    const json = await uploadFile({
      url: `${getBackendUrl()}/ai/voice-transaction`,
      fileUri,
      fileName: 'voice.m4a',
      fields: { lang, accounts: JSON.stringify(spokenAccountNames()) },
      headers: { Authorization: `Bearer ${token}` },
      maxBytes: MAX_UPLOAD_BYTES,
      timeoutMs: 50_000,
    });

    const transcript = typeof json?.transcript === 'string' ? json.transcript : '';
    if (json?.status === 'no_speech') return { ok: false, problem: 'no_speech' };
    if (json?.status === 'not_a_transaction') return { ok: false, problem: 'not_a_transaction', transcript };

    const drafts = toDrafts(json?.drafts);
    if (drafts.length === 0) return { ok: false, problem: 'not_a_transaction', transcript };
    return { ok: true, transcript, drafts };
  } catch (e: any) {
    if (e instanceof UploadError) {
      if (e.status === 429) return { ok: false, problem: 'limit', message: e.message };
      if (e.status === 401) return { ok: false, problem: 'signed_out' };
      if (e.status) return { ok: false, problem: 'unavailable', message: e.status === 503 ? e.message : undefined };
      return { ok: false, problem: 'offline' };
    }
    return { ok: false, problem: 'unavailable' };
  } finally {
    deleteRecording(fileUri);
  }
}

const toDrafts = (list: any): VoiceDraft[] =>
  (Array.isArray(list) ? list : [])
    .filter((d: any) => d && (d.type === 'debit' || d.type === 'credit'))
    .map((d: any) => ({
      type: d.type,
      amount: typeof d.amount === 'number' && d.amount > 0 ? d.amount : null,
      merchant: typeof d.merchant === 'string' ? d.merchant : '',
      category: typeof d.category === 'string' ? d.category : 'miscellaneous',
      account: typeof d.account === 'string' ? d.account : null,
      date: typeof d.date === 'string' ? d.date : null,
      time: typeof d.time === 'string' ? d.time : null,
      amountVerified: d.amountVerified === true,
    }));

/** How long the app waits for the AI to read a sentence before using its own rules. */
const TEXT_TIMEOUT_MS = 9000;

/**
 * Words the phone's own recogniser heard -> drafts.
 *
 *   1. The rules on the phone read the sentence. When they are sure, that is the answer:
 *      nothing leaves the phone and the review screen opens at once.
 *   2. Otherwise the text (never audio) goes to the AI, which is better with names,
 *      Devanagari and several transactions in one sentence.
 *   3. If the AI can't be reached, the rules' reading is used anyway, flagged for checking.
 *
 * Never throws.
 */
export async function understandSpokenText(text: string): Promise<VoiceOutcome> {
  const transcript = text.replace(/\s+/g, ' ').trim();
  if (!transcript) return { ok: false, problem: 'no_speech' };

  const accounts = spokenAccountNames();
  const local = readSpokenLocally(transcript, accounts);
  const localDraft: VoiceDraft = { ...local.draft, amountVerified: local.draft.amount !== null };
  if (local.confident) return { ok: true, transcript, drafts: [localDraft] };

  const usable = local.draft.amount !== null;
  const fromRules = (): VoiceOutcome =>
    usable
      ? { ok: true, transcript, drafts: [{ ...localDraft, amountVerified: false }] }
      : { ok: false, problem: 'not_a_transaction', transcript };

  const token = authService.getAccessToken();
  if (!token) return usable ? fromRules() : { ok: false, problem: 'signed_out' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEXT_TIMEOUT_MS);
  try {
    const res = await fetch(`${getBackendUrl()}/ai/voice-text`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: transcript, accounts }),
      signal: controller.signal,
    });
    if (res.status === 429 && !usable) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, problem: 'limit', message: typeof body?.message === 'string' ? body.message : undefined };
    }
    if (!res.ok) return fromRules();
    const json = await res.json();
    if (json?.status === 'not_a_transaction') return { ok: false, problem: 'not_a_transaction', transcript };
    const drafts = toDrafts(json?.drafts);
    return drafts.length ? { ok: true, transcript, drafts } : fromRules();
  } catch {
    // Offline, timed out, or the server is down: the rules' reading still gets the person to review
    return usable ? fromRules() : { ok: false, problem: 'offline' };
  } finally {
    clearTimeout(timer);
  }
}

/** Recordings are only needed for the upload; remove them from the phone straight after. */
export const deleteRecording = (fileUri?: string | null) => {
  if (!fileUri) return;
  try {
    const f = new File(fileUri);
    if (f.exists) f.delete();
  } catch {
    // Already gone, or a scheme File can't open: the cache is cleared by the system anyway.
  }
};

/**
 * The account a draft should start on: the one that was said, otherwise the account the
 * person used most recently, otherwise their first account. `said` is false for the last two,
 * so the review screen can ask them to check it.
 */
export const resolveDraftAccount = (account: string | null): { id: string | null; said: boolean } => {
  const profiles = useBankStore.getState().bankProfiles;
  if (account) {
    const wanted = account.toLowerCase();
    const match =
      wanted === 'cash'
        ? getCashProfile(profiles)
        : profiles.find((b) => String(b.bankName || '').toLowerCase() === wanted);
    if (match) return { id: match.id, said: true };
  }
  const recent = [...useTransactionStore.getState().transactions]
    .filter((t: any) => t?.bankProfileId && profiles.some((b) => b.id === t.bankProfileId))
    .sort((a: any, b: any) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))[0] as any;
  if (recent?.bankProfileId) return { id: recent.bankProfileId, said: false };
  return { id: profiles[0]?.id ?? null, said: false };
};

/** The person's own "Always tag X as Y" rule beats the AI's guess. */
export const resolveDraftCategory = (draft: VoiceDraft): string => {
  const learned = draft.merchant ? tagLearningService.getLearnedTag(draft.merchant) : null;
  const fallback = draft.type === 'credit' ? 'money_received' : 'miscellaneous';
  return getCategory(learned || draft.category || fallback).id;
};

/** When the transaction happened: the day and time that were said, otherwise now. */
export const resolveDraftTimestamp = (draft: VoiceDraft, now = Date.now()): number => {
  if (!draft.date) return now;
  const m = draft.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return now;
  const base = new Date(now);
  const d = new Date(+m[1], +m[2] - 1, +m[3], base.getHours(), base.getMinutes(), 0, 0);
  const t = draft.time?.match(/^(\d{1,2}):(\d{2})$/);
  if (t) d.setHours(+t[1], +t[2], 0, 0);
  const ts = d.getTime();
  return isNaN(ts) || ts > now ? now : ts;
};
