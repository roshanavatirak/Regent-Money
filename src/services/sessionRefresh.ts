// src/services/sessionRefresh.ts
//
// Keeps the 15-minute access token fresh without the user noticing.
//
// installAuthFetch() wraps the global fetch once at app start. Every request to the Regent
// backend that carries an Authorization header goes through it, so all ~23 files that call
// fetch themselves are covered without changes, and so is any code added later:
//   1. If the access token has under 2 minutes left, refresh first.
//   2. Send the request with the current token.
//   3. If the server still says TOKEN_EXPIRED, refresh once and send it again.
// Only one refresh runs at a time; every request waiting on it shares the same promise
// (two refreshes at once would look like a stolen token to the server).

import { NativeModules, Platform } from 'react-native';
import { BACKEND_URL, getBackendUrl } from '../config/api';
import { tokenStore } from './tokenStore';
import type { SessionTokens } from './tokenStore';

const REFRESH_EARLY_MS = 2 * 60 * 1000;

export type RefreshResult = 'ok' | 'ended' | 'offline';

let refreshInFlight: Promise<RefreshResult> | null = null;
let onSessionEnded: (() => void) | null = null;
let originalFetch: typeof fetch | null = null;

/** authService registers what to do when the session can't be refreshed (log out + message). */
export const setSessionEndedHandler = (handler: () => void) => {
  onSessionEnded = handler;
};

/** Gives the native Android SMS worker its SMS-only token (or the old token for old sessions). */
export function syncNativeAuthCredentials(token: string | null, userId?: string | null) {
  if (Platform.OS !== 'android') return;
  try {
    if (token) {
      NativeModules.NativeStorage?.setAuthCredentials?.(token, getBackendUrl(), userId || null);
    } else {
      NativeModules.NativeStorage?.clearAuthCredentials?.();
    }
  } catch (e) {
    console.warn('[Session] Failed to sync credentials to native storage:', e);
  }
}

/** Saves a session from the server and hands the background SMS token to native code. */
export function saveSession(tokens: SessionTokens, userId?: string | null) {
  tokenStore.setSession(tokens);
  syncNativeAuthCredentials(tokens.ingestToken || tokens.accessToken, userId);
}

const rawFetch = (input: any, init?: any) => (originalFetch || fetch)(input, init);

/**
 * Swaps the refresh token for a new pair. Concurrent callers share one request.
 * 'ended' means the server refused it (logged out, expired, banned): the user must log in.
 * 'offline' means the server couldn't be reached: keep the current token and try later.
 */
export function refreshSession(): Promise<RefreshResult> {
  if (refreshInFlight) return refreshInFlight;
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return Promise.resolve('ended');

  refreshInFlight = (async (): Promise<RefreshResult> => {
    try {
      const res = await rawFetch(`${getBackendUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (res.ok) {
        const data = await res.json();
        if (!data?.accessToken) return 'offline';
        // A logout that happened while this was in flight wins: don't bring the session back
        if (tokenStore.getRefreshToken() !== refreshToken) return 'ok';
        let userId: string | null = null;
        try {
          const { useAuthStore } = require('../store');
          userId = useAuthStore.getState().user?.id || null;
        } catch {}
        saveSession(data, userId);
        return 'ok';
      }
      if (res.status === 401 || res.status === 403) {
        onSessionEnded?.();
        return 'ended';
      }
      return 'offline'; // 429 / 5xx: try again on the next request
    } catch {
      return 'offline';
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/** Refreshes first when the access token is about to expire (sessions with a refresh token only). */
export async function ensureFreshAccessToken(): Promise<void> {
  if (!tokenStore.getRefreshToken()) return;
  const expiresAt = tokenStore.getAccessExpiresAt();
  if (expiresAt && expiresAt - Date.now() > REFRESH_EARLY_MS) return;
  await refreshSession();
}

const backendOrigins = () => {
  const out = new Set<string>();
  for (const u of [getBackendUrl(), BACKEND_URL]) {
    if (typeof u === 'string' && u) out.add(u.replace(/\/+$/, ''));
  }
  return [...out];
};

const isBackendRequest = (url: string) => backendOrigins().some((o) => url.startsWith(o));

/** Wraps global fetch once (call at app start, also covers headless background tasks). */
export function installAuthFetch() {
  if (originalFetch) return;
  originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    if (!isBackendRequest(url) || url.includes('/auth/refresh')) {
      return originalFetch!(input, init);
    }

    const headers = new Headers(init?.headers || (typeof input === 'object' && input?.headers) || undefined);
    if (!headers.has('Authorization')) {
      return originalFetch!(input, init);
    }

    // 1. Refresh early if needed, then always send the newest token
    await ensureFreshAccessToken();
    const current = tokenStore.getAccessToken();
    if (current) headers.set('Authorization', `Bearer ${current}`);

    let res = await originalFetch!(input, { ...init, headers });

    // 2. Expired anyway (phone clock off, app was asleep): refresh once and retry.
    //    Cancelled by the server (logged out elsewhere, banned): sign out here too.
    if (res.status === 401 && tokenStore.getRefreshToken()) {
      const body = await res.clone().json().catch(() => ({}));
      if (body?.code === 'SESSION_REVOKED') {
        onSessionEnded?.();
      } else if (body?.code === 'TOKEN_EXPIRED') {
        const result = await refreshSession();
        if (result === 'ok') {
          const next = tokenStore.getAccessToken();
          if (next) headers.set('Authorization', `Bearer ${next}`);
          res = await originalFetch!(input, { ...init, headers });
        }
      }
    }
    return res;
  }) as typeof fetch;
}
