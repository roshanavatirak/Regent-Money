// src/services/attributionService.ts
//
// Invite and campaign tracking.
//
// Once per account, in the background, the app tells the server how this install arrived:
// the referrer string Google Play recorded (which link was opened, or "organic"). For an
// invite or campaign link it also attaches a Google Play Integrity token, so the server can
// confirm the claim came from the real app. No screen is shown and nothing identifying the
// phone is sent. What we tell users about this lives in the Privacy center.

import { NativeModules, Platform } from 'react-native';
import { apiFetch } from './apiClient';
import { mmkvStorage } from '../db/mmkv';
import { getAppCurrentVersion } from './updateService';

type InstallReferrer = {
  status: 'ok' | 'unsupported' | 'unavailable';
  referrer: string;
  clickAt: number;
  installAt: number;
};

export interface MyInvite {
  code: string;
  /** Null when the server has no public link address configured yet. */
  link: string | null;
  opens: number;
  joined: number;
}

export interface AttributionOverview {
  days: number;
  integrityConfigured: boolean;
  integrityMode: 'enforce' | 'off';
  sources: { sourceType: string; users: number }[];
  funnel: { opens: number; joined: number; review: number; unverified: number; rejected: number };
  inviters: { userId: string; name: string | null; email: string | null; code: string; joined: number; review: number; rejected: number }[];
  campaigns: { id: string; code: string; name: string; channel: string | null; isActive: boolean; createdAt: number; opens: number; joined: number; link: string | null }[];
}

const doneKey = (userId: string) => `attribution.done.${userId}`;
const native = () => (Platform.OS === 'android' ? NativeModules.Attribution : null);

let inFlight: Promise<void> | null = null;

const readJson = async <T,>(response: Response, fallback: string): Promise<T> => {
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((Array.isArray(err.message) ? err.message[0] : err.message) || fallback);
  }
  return response.json();
};

const post = (path: string, body?: unknown) =>
  apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

async function claim(userId: string): Promise<void> {
  const mod = native();
  if (!mod?.getInstallReferrer) return;

  const install: InstallReferrer = await mod.getInstallReferrer();
  if (install.status === 'unavailable') return; // Play Store busy: try again next launch

  const referrer = install.status === 'ok' ? String(install.referrer || '') : '';
  const installAt = Math.floor(Number(install.installAt) || 0);
  const clickAt = Math.floor(Number(install.clickAt) || 0);
  const body: Record<string, unknown> = { referrer, installAt, clickAt, appVersion: getAppCurrentVersion() };

  // Only installs that came from one of our links need Google's proof.
  if (/(^|&)rm=/.test(referrer)) {
    const challenge = await readJson<{ userId: string; nonce: string; cloudProjectNumber: string | null }>(
      await post('/attribution/challenge'),
      'challenge failed',
    );
    // Debug builds are not recognised by Google Play, so they never ask for a token.
    if (challenge.cloudProjectNumber && !__DEV__ && mod.requestIntegrityToken) {
      // Must match integrityPayload() on the server, character for character.
      const payload = ['v1', challenge.userId, challenge.nonce, referrer, String(installAt), String(clickAt)].join('\n');
      try {
        body.integrityToken = await mod.requestIntegrityToken(challenge.cloudProjectNumber, payload);
      } catch {
        // No token: the server keeps the claim unverified and we try again next launch
      }
    }
  }

  const result = await readJson<{ done: boolean }>(await post('/attribution/claim', body), 'claim failed');
  if (result.done) mmkvStorage.setBoolean(doneKey(userId), true);
}

export const attributionService = {
  /** Safe to call on every launch: does nothing once this account has been recorded. */
  claimIfNeeded(userId?: string | null): Promise<void> {
    if (!userId || Platform.OS !== 'android') return Promise.resolve();
    if (mmkvStorage.getBoolean(doneKey(userId))) return Promise.resolve();
    if (!inFlight) {
      inFlight = claim(userId)
        .catch(() => {})
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  },

  async getMyInvite(): Promise<MyInvite> {
    return readJson<MyInvite>(await apiFetch('/attribution/me'), 'Couldn’t load your invite link. Try again.');
  },

  /* ---------------- Admin ---------------- */

  async getOverview(days: number): Promise<AttributionOverview> {
    return readJson<AttributionOverview>(
      await apiFetch(`/attribution/admin/overview?days=${days}`),
      'Couldn’t load tracking. Try again.',
    );
  },

  async createCampaign(input: { name: string; code: string; channel?: string }) {
    return readJson<{ id: string; code: string; link: string | null }>(
      await post('/attribution/admin/campaigns', input),
      'Couldn’t create the campaign link. Try again.',
    );
  },

  async setCampaignActive(id: string, isActive: boolean) {
    return readJson<{ id: string; isActive: boolean }>(
      await post(`/attribution/admin/campaigns/${encodeURIComponent(id)}/active`, { isActive }),
      'Couldn’t update the campaign. Try again.',
    );
  },

  async resolveReview(userId: string, approve: boolean) {
    return readJson<{ changed: number }>(
      await post(`/attribution/admin/inviters/${encodeURIComponent(userId)}/review`, { approve }),
      'Couldn’t save your decision. Try again.',
    );
  },
};
