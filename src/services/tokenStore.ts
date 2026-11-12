import { mmkvStorage } from '../db/mmkv';

const TOKEN_KEY = 'auth_access_token';
const REFRESH_KEY = 'auth_refresh_token';
const EXPIRES_AT_KEY = 'auth_access_expires_at';
const INGEST_KEY = 'auth_ingest_token';

let inMemoryToken: string | null = null;

/** What the server returns from login, signup, Google sign-in, refresh and upgrade. */
export interface SessionTokens {
  accessToken: string;
  refreshToken?: string;
  /** Seconds until the access token expires. */
  expiresIn?: number;
  /** SMS-only token for the Android background worker. */
  ingestToken?: string;
}

/**
 * Tokens live in the encrypted MMKV store.
 *  - access token: sent with every request (15 minutes for new sessions, 30 days for old ones)
 *  - refresh token: swapped for a new pair when the access token is about to expire
 *  - ingest token: given to the native background SMS worker
 */
export const tokenStore = {
  /**
   * Retrieves the current access token dynamically at call time.
   */
  getAccessToken(): string | null {
    const stored = mmkvStorage.getString(TOKEN_KEY) || null;
    inMemoryToken = stored;
    return stored;
  },

  /**
   * Saves or updates the current access token (older 30-day sessions without a refresh token).
   */
  setAccessToken(token: string | null): void {
    inMemoryToken = token;
    if (token) {
      mmkvStorage.setString(TOKEN_KEY, token);
    } else {
      mmkvStorage.delete(TOKEN_KEY);
    }
  },

  /** Saves a full session (access + refresh + SMS token). */
  setSession(tokens: SessionTokens): void {
    this.setAccessToken(tokens.accessToken);
    if (tokens.refreshToken) mmkvStorage.setString(REFRESH_KEY, tokens.refreshToken);
    if (tokens.expiresIn) mmkvStorage.setNumber(EXPIRES_AT_KEY, Date.now() + tokens.expiresIn * 1000);
    if (tokens.ingestToken) mmkvStorage.setString(INGEST_KEY, tokens.ingestToken);
  },

  getRefreshToken(): string | null {
    return mmkvStorage.getString(REFRESH_KEY) || null;
  },

  /** When the access token expires (ms), or 0 if unknown (old 30-day sessions). */
  getAccessExpiresAt(): number {
    const v = mmkvStorage.getNumber(EXPIRES_AT_KEY);
    return typeof v === 'number' && !isNaN(v) ? v : 0;
  },

  getIngestToken(): string | null {
    return mmkvStorage.getString(INGEST_KEY) || null;
  },

  /**
   * Clears every token (log out).
   */
  clearAccessToken(): void {
    inMemoryToken = null;
    mmkvStorage.delete(TOKEN_KEY);
    mmkvStorage.delete(REFRESH_KEY);
    mmkvStorage.delete(EXPIRES_AT_KEY);
    mmkvStorage.delete(INGEST_KEY);
  },
};
