import { mmkvStorage } from '../db/mmkv';

const TOKEN_KEY = 'auth_access_token';

let inMemoryToken: string | null = null;

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
   * Saves or updates the current access token.
   */
  setAccessToken(token: string | null): void {
    inMemoryToken = token;
    if (token) {
      mmkvStorage.setString(TOKEN_KEY, token);
    } else {
      mmkvStorage.delete(TOKEN_KEY);
    }
  },

  /**
   * Clears the current access token.
   */
  clearAccessToken(): void {
    inMemoryToken = null;
    mmkvStorage.delete(TOKEN_KEY);
  },
};
