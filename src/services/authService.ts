import { Platform, NativeModules } from 'react-native';
import { saveSession, syncNativeAuthCredentials, setSessionEndedHandler } from './sessionRefresh';
import { isRunningInExpoGo } from 'expo';
import { mmkvStorage } from '../db/mmkv';
import {
  useAuthStore,
  UserProfile,
  useSecurityStore,
  AutoLockTimeout,
  showGlobalAlert,
  useTransactionStore,
  useIncomeStore,
  useBankStore,
  useBudgetStore,
  useGoalsStore,
  useAnalyticsStore,
  useNotificationStore,
} from '../store';
import { getGoogleWebClientId } from '../config/auth';
import { BACKEND_URL, getBackendUrl } from '../config/api';
import { tokenStore } from './tokenStore';

// Lazy loader to eliminate require cycle: syncService -> apiClient -> authService -> syncService
const triggerSync = () => {
  try {
    const { syncService } = require('./syncService');
    syncService?.sync()?.catch((e: any) => console.warn('[Auth] Initial sync failed:', e));
  } catch (err) {
    console.warn('[Auth] Failed to load syncService:', err);
  }
};

/** Longest the login button waits for the account's data (a starting server can take ~60 s). */
const FIRST_LOAD_MAX_MS = 60000;

/**
 * Downloads the account's data while the login button still shows its spinner, so the
 * dashboard opens already filled in. Gives up after 12 s; the sync then finishes in the
 * background and the dashboard fills in when it arrives.
 */
const loadAccountData = async (profile: { id: string; role?: string | null }) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { syncService } = require('./syncService');
    await Promise.race([
      syncService.loadForLogin(profile),
      new Promise((resolve) => {
        timer = setTimeout(resolve, FIRST_LOAD_MAX_MS);
      }),
    ]);
  } catch (err) {
    console.warn('[Auth] Initial data load failed:', err);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const SESSION_KEY = 'auth_user_id';
const USER_PROFILE_KEY = 'auth_user_profile';
const LAST_GOOGLE_USER_KEY = 'last_google_user';

export interface LastGoogleUser {
  email: string;
  name: string;
  photo?: string;
}

function formatPhoneNumber(phone: string): string {
  const clean = phone.replace(/\s+/g, '');
  if (!clean) return '';
  if (clean.startsWith('+')) {
    return clean;
  }
  // If it's a 10-digit Indian number, prepend +91
  if (clean.length === 10 && /^\d+$/.test(clean)) {
    return '+91' + clean;
  }
  return '+' + clean;
}

/** Headers that ask the server for a 15-minute access token + refresh token. */
const SESSION_HEADERS = {
  'X-Supports-Refresh': '1',
  'X-Device-Name': `${Platform.OS} app`,
};

/**
 * Marks a 429 from the auth API so screens can show a countdown.
 * Wait time comes from the body (retryAfterSeconds), then the Retry-After header, else 60s.
 */
function applyRateLimit(err: any, response: Response, errData: any) {
  if (response.status !== 429) return;
  const fromHeader = Number(response.headers?.get?.('Retry-After'));
  const seconds = Number(errData?.retryAfterSeconds) || (fromHeader > 0 ? fromHeader : 60);
  err.rateLimited = true;
  err.retryAfterSeconds = Math.ceil(seconds);
  err.message = `Too many attempts. Try again in ${Math.ceil(seconds)}s.`;
}

export const authService = {
  /**
   * Retrieves the saved access token from local MMKV storage
   */
  getAccessToken(): string | null {
    return tokenStore.getAccessToken();
  },

  /**
   * Returns remembered last used Google Account for LinkedIn-style 1-tap display
   */
  getLastGoogleUser(): LastGoogleUser | null {
    const direct = mmkvStorage.getObject<LastGoogleUser>(LAST_GOOGLE_USER_KEY);
    if (direct && direct.email) return direct;

    // Fallback: Check cached user profile if previously authenticated with Google
    const cached =
      mmkvStorage.getObject<UserProfile>(USER_PROFILE_KEY) ||
      mmkvStorage.getObject<UserProfile>('user_profile');
    if (cached?.email && (cached.email.toLowerCase().includes('@gmail.com') || cached.avatarUrl?.includes('google'))) {
      return {
        email: cached.email,
        name: cached.name || cached.email.split('@')[0],
        photo: cached.avatarUrl || undefined,
      };
    }
    return null;
  },

  /**
   * Clears remembered last Google user
   */
  clearLastGoogleUser(): void {
    mmkvStorage.delete(LAST_GOOGLE_USER_KEY);
  },

  /**
   * Loads the cached session profile from MMKV, boots the UI,
   * and triggers a background database sync with the NestJS backend in the background.
   */
  async checkSession(): Promise<UserProfile | null> {
    const cachedProfile =
      mmkvStorage.getObject<UserProfile>(USER_PROFILE_KEY) ||
      mmkvStorage.getObject<UserProfile>('user_profile');
    const token = tokenStore.getAccessToken();

    if (!cachedProfile || !token) {
      useAuthStore.getState().setUser(null);
      useAuthStore.getState().setLoading(false);
      return null;
    }

    // Keep cached user immediately so avatar and profile are displayed instantly
    useAuthStore.getState().setUser(cachedProfile);
    useAuthStore.getState().setLoading(false);

    // Sync in background if token exists
    if (token) {
      syncNativeAuthCredentials(tokenStore.getIngestToken() || token, cachedProfile?.id);
      if (!tokenStore.getRefreshToken()) {
        // Signed in before refresh tokens existed: swap the old 30-day token once, silently
        this.upgradeSession(cachedProfile?.id).catch(() => { });
      }
      this.fetchProfile().catch(() => { });
      triggerSync();
    }

    // Sync security settings from backend
    this.fetchSecuritySettings().then((settings) => {
      if (settings) {
        useSecurityStore.getState().setBiometricsEnabled(settings.biometricsEnabled);
        if ([1, 5, 10].includes(settings.autoLockTimeout)) {
          useSecurityStore.getState().setAutoLockTimeout(settings.autoLockTimeout as AutoLockTimeout);
        }
      }
    }).catch(() => { });

    return cachedProfile;
  },

  /**
   * Exchanges an old 30-day token for a 15-minute access token + refresh token, without asking
   * the user to log in again. If it can't (offline), the old token keeps working until it expires.
   */
  async upgradeSession(userId?: string | null): Promise<boolean> {
    const legacy = tokenStore.getAccessToken();
    if (!legacy || tokenStore.getRefreshToken()) return false;
    const rememberMe = mmkvStorage.getBoolean?.('auth_remember_me') ?? true;
    const res = await fetch(`${BACKEND_URL}/auth/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${legacy}`, ...SESSION_HEADERS },
      body: JSON.stringify({ rememberMe }),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    if (!data?.accessToken || !data?.refreshToken) return false;
    // Logged out while this was in flight: don't bring the session back
    if (tokenStore.getAccessToken() !== legacy) return false;
    saveSession(data, userId);
    return true;
  },

  async signUp(name: string, email: string, phone: string, password?: string, turnstileToken?: string): Promise<{ profile: UserProfile; sessionConfirmed: boolean }> {
    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedPhone = formatPhoneNumber(phone.trim());

    const response = await fetch(`${BACKEND_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...SESSION_HEADERS },
      body: JSON.stringify({
        name,
        email: sanitizedEmail,
        phone: sanitizedPhone,
        password,
        turnstileToken,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const err: any = new Error(errData.message || 'Failed to sign up.');
      err.status = response.status;
      applyRateLimit(err, response, errData);
      throw err;
    }

    const data = await response.json();
    const profile: UserProfile = data.profile;
    const sessionConfirmed = data.sessionConfirmed;

    if (sessionConfirmed && data.accessToken) {
      // Save profile cache and tokens locally
      mmkvStorage.setString(SESSION_KEY, profile.id);
      mmkvStorage.setObject(USER_PROFILE_KEY, profile);
      saveSession(data, profile?.id);
      mmkvStorage.setBoolean('auth_remember_me', true); // Sign up auto-remembers
      await loadAccountData(profile);
      useAuthStore.getState().setUser(profile);

      // Auto-accept terms locally and on backend since user agreed inline during signup
      this.acceptTerms().catch(() => {});

    }

    return { profile, sessionConfirmed };
  },

  /**
   * Log in online using NestJS Authentication.
   */
  async logIn(emailOrMobile: string, password?: string, rememberMe: boolean = true, turnstileToken?: string): Promise<UserProfile> {
    const input = emailOrMobile.trim();
    const isMail = input.includes('@');
    const emailOrMobileFormatted = isMail ? input.toLowerCase() : formatPhoneNumber(input);

    const response = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...SESSION_HEADERS },
      body: JSON.stringify({
        emailOrMobile: emailOrMobileFormatted,
        password,
        turnstileToken,
        rememberMe,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const err: any = new Error(errData.message || 'Invalid credentials.');
      err.status = response.status;
      err.locked = Boolean(errData.locked || response.status === 423);
      err.lockedUntil = errData.lockedUntil;
      err.remainingSeconds = errData.remainingSeconds;
      err.remainingMinutes = errData.remainingMinutes;
      err.remainingAttempts = errData.attemptsLeft;
      err.tier = errData.tier;
      applyRateLimit(err, response, errData);
      throw err;
    }

    const data = await response.json();
    const profile: UserProfile = data.profile;

    // Save profile cache and token locally
    mmkvStorage.setString(SESSION_KEY, profile.id);
    mmkvStorage.setObject(USER_PROFILE_KEY, profile);
    saveSession(data, profile?.id);
    mmkvStorage.setBoolean('auth_remember_me', rememberMe);
    // Load the account's data while the login button still spins, then open the dashboard
    await loadAccountData(profile);
    useAuthStore.getState().setUser(profile);

    if (data.accountRestored) {
      showGlobalAlert(
        'Account Restored! 🎉',
        'Welcome back! Your scheduled account deletion has been cancelled and your data has been fully restored. (Note: A 7-day cooldown is now active before deletion can be requested again).'
      );
    }


    return profile;
  },

  /**
   * Resends verification email with a fresh secure token.
   * `retryAfterSeconds`: how long the server will refuse another resend (60 s between emails, 5 a day).
   */
  async resendVerificationEmail(email: string): Promise<{ message: string; retryAfterSeconds?: number }> {
    const response = await fetch(`${BACKEND_URL}/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Failed to resend verification link.');
    }
    return data;
  },

  /**
   * Dispatches a password reset link to user's registered email
   */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const response = await fetch(`${BACKEND_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Failed to request password reset.');
    }
    return data;
  },

  /**
   * Resets password with token and immediately unlocks account
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string; success: boolean }> {
    const response = await fetch(`${BACKEND_URL}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.trim(), newPassword }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Failed to reset password.');
    }
    return data;
  },

  /**
   * Native Google Login flow (stub or bridged verification via ID token)
   */
  async signInWithGoogleNative(forceAccountPicker: boolean = false): Promise<UserProfile> {
    if (isRunningInExpoGo()) {
      throw new Error(
        'Google Sign-In uses native Google Play Services, which is not supported in Expo Go. Please sign in with Email & Password in Expo Go, or test Google Sign-In in a standalone APK.'
      );
    }

    const webClientId = getGoogleWebClientId();
    if (!webClientId) {
      throw new Error('Google Web Client ID is not configured.');
    }

    try {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');

      GoogleSignin.configure({
        webClientId,
        offlineAccess: false,
      });

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // If switching account or forceAccountPicker is requested, sign out of Google Play Services session first
      if (forceAccountPicker) {
        try {
          await GoogleSignin.signOut();
        } catch (_) {}
      }

      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult?.data?.idToken || signInResult?.idToken;

      if (!idToken) {
        throw new Error('No ID token returned from Google Sign-In.');
      }

      // Send idToken to backend for cryptographic verification and account linking
      const response = await fetch(`${BACKEND_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...SESSION_HEADERS },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Google Auth verification failed on backend.');
      }

      const data = await response.json();
      const profile: UserProfile = data.user || data.profile;

      // Remember Google user details for LinkedIn-style 1-tap display
      const googleUser = signInResult?.data?.user || signInResult?.user;
      const gEmail = googleUser?.email || profile.email;
      const gName = googleUser?.name || profile.name;
      const gPhoto = googleUser?.photo || profile.avatarUrl;

      if (gEmail) {
        mmkvStorage.setObject(LAST_GOOGLE_USER_KEY, {
          email: gEmail,
          name: gName || gEmail.split('@')[0],
          photo: gPhoto || '',
        });
      }

      // Save profile cache and token locally
      mmkvStorage.setString(SESSION_KEY, profile.id);
      mmkvStorage.setObject(USER_PROFILE_KEY, profile);
      saveSession(data, profile?.id);
      await loadAccountData(profile);
      useAuthStore.getState().setUser(profile);

      // Auto-accept terms if not yet accepted (user agreed via Google button notice)
      if (!profile.termsAccepted) {
        this.acceptTerms().catch(() => {});
      }

      if (data.accountRestored) {
        showGlobalAlert(
          'Account Restored! 🎉',
          'Welcome back! Your scheduled account deletion has been cancelled and your data has been fully restored. (Note: A 7-day cooldown is now active before deletion can be requested again).'
        );
      }

      // Initial database sync

      return profile;
    } catch (e: any) {
      console.error('[Auth] Native Google Sign-In failed:', e);
      throw e;
    }
  },


  /**
   * Sync security settings (biometricsEnabled, autoLockTimeout) with backend
   */
  async updateSecuritySettings(settings: { biometricsEnabled?: boolean; autoLockTimeout?: number }): Promise<void> {
    const token = this.getAccessToken();
    if (!token) return;

    try {
      await fetch(`${BACKEND_URL}/auth/security-settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });
    } catch (err) {
      console.warn('[AuthService] Failed to sync security settings with backend:', err);
    }
  },

  /**
   * Fetch saved security settings from backend
   */
  async fetchSecuritySettings(): Promise<{ biometricsEnabled: boolean; autoLockTimeout: number } | null> {
    const token = this.getAccessToken();
    if (!token) return null;

    try {
      const res = await fetch(`${BACKEND_URL}/auth/security-settings`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[AuthService] Failed to fetch security settings:', err);
    }
    return null;
  },

  /**
   * Fetch complete user profile from backend
   */
  async fetchProfile(): Promise<UserProfile | null> {
    const token = this.getAccessToken();
    if (!token) return null;

    try {
      const res = await fetch(`${BACKEND_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const profile = await res.json();
        useAuthStore.getState().updateUser(profile);
        return profile;
      } else if (res.status === 403 || res.status === 401) {
        const data = await res.json().catch(() => ({}));
        if (data.code === 'USER_BANNED' || data.code === 'ACCOUNT_DELETED') {
          await this.logOut();
          showGlobalAlert(
            data.code === 'USER_BANNED' ? 'Account Suspended' : 'Account Removed',
            data.message || 'Your account has been suspended by an administrator.',
          );
        }
      }
    } catch (err) {
      console.warn('[AuthService] Failed to fetch profile:', err);
    }
    return null;
  },

  /**
   * Update user personal/financial profile
   */
  async updateProfile(fields: {
    name?: string;
    avatarUrl?: string;
    dob?: string;
    gender?: string;
    occupation?: string;
    currentIncome?: number;
    incomeSourcesCount?: number;
  }): Promise<UserProfile | null> {
    const token = this.getAccessToken();
    // Update local state immediately for snappy response
    useAuthStore.getState().updateUser(fields);

    if (!token) return null;

    try {
      const res = await fetch(`${BACKEND_URL}/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(fields),
      });
      if (res.ok) {
        const updated = await res.json();
        useAuthStore.getState().updateUser(updated);
        return updated;
      }
    } catch (err) {
      console.warn('[AuthService] Failed to sync profile with backend:', err);
    }
    return null;
  },

  /**
   * Upload avatar to Cloudinary via backend
   */
  async uploadAvatar(fileData: string): Promise<string | null> {
    const token = this.getAccessToken();
    if (!token) {
      useAuthStore.getState().updateUser({ avatarUrl: fileData });
      return fileData;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/auth/upload-avatar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ fileData }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.avatarUrl) {
          useAuthStore.getState().updateUser({ avatarUrl: data.avatarUrl });
          return data.avatarUrl;
        }
      }
    } catch (err) {
      console.warn('[AuthService] Upload avatar failed:', err);
    }

    // Fallback: save locally
    useAuthStore.getState().updateUser({ avatarUrl: fileData });
    return fileData;
  },

  /**
   * Accept Terms & Conditions and persist status locally and in database
   */
  async acceptTerms(): Promise<boolean> {
    const now = Date.now();
    // 1. Immediately update Zustand store for instant, reactive UI dismissal
    useAuthStore.getState().updateUser({
      termsAccepted: true,
      termsAcceptedAt: now,
    });

    // 2. Persist to MMKV cached profile so it never pops up again across restarts
    const currentProfile = mmkvStorage.getObject<UserProfile>(USER_PROFILE_KEY);
    if (currentProfile) {
      mmkvStorage.setObject(USER_PROFILE_KEY, {
        ...currentProfile,
        termsAccepted: true,
        termsAcceptedAt: now,
      });
    }

    // 3. Persist to backend database via PATCH /auth/accept-terms
    const token = this.getAccessToken();
    if (!token) return true;

    try {
      const res = await fetch(`${BACKEND_URL}/auth/accept-terms`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        console.warn('[AuthService] Backend accept-terms responded with status:', res.status);
      }
    } catch (err) {
      console.warn('[AuthService] Failed to sync accept-terms with backend:', err);
    }
    return true;
  },

  /**
   * Log out session.
   */
  async logOut(): Promise<void> {
    // Forget the "data version" for this account, so the next login downloads everything
    // (the local stores are wiped below, so a "nothing changed" reply would leave them empty).
    const uid = useAuthStore.getState().user?.id;
    if (uid) {
      // Forget the saved sync version and cursor, so the next login downloads everything
      for (const key of ['sync_etag_v1_', 'sync_cursor_v1_', 'sync_full_at_v1_', 'sync_delta_miss_v1_', 'sync_delta_paused_until_v1_']) {
        mmkvStorage.delete(`${key}${uid}`);
      }
    }

    // Revoke the session on the server first, so the token stops working even if a copy exists.
    // Best effort with a short timeout: sign-out must still finish offline.
    const currentToken = tokenStore.getAccessToken();
    const refreshToken = tokenStore.getRefreshToken();
    // Forget the tokens first, so nothing tries to refresh this session while logging out
    tokenStore.clearAccessToken();
    if (currentToken) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        await fetch(`${BACKEND_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` },
          // The refresh token lets the server cancel this device's session even if the access token expired
          body: JSON.stringify({ refreshToken }),
          signal: controller.signal,
        });
      } catch {
        // Offline or server unreachable; the local wipe below still runs
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      if (GoogleSignin) {
        const hasSignedIn = typeof GoogleSignin.hasPreviousSignIn === 'function'
          ? GoogleSignin.hasPreviousSignIn()
          : typeof GoogleSignin.isSignedIn === 'function'
            ? await GoogleSignin.isSignedIn()
            : false;
        if (hasSignedIn && typeof GoogleSignin.signOut === 'function') {
          await GoogleSignin.signOut();
          console.log('[Auth] Signed out from Google Native.');
        }
      }
    } catch (e: any) {
      console.log('[Auth] Google Native signout failed or not initialized:', e.message);
    }

    try {
      // 1. Wipe Authentication & Session Tokens
      mmkvStorage.delete(SESSION_KEY);
      mmkvStorage.delete(USER_PROFILE_KEY);
      mmkvStorage.delete('user_profile');
      tokenStore.clearAccessToken();
      mmkvStorage.delete('auth_remember_me');
      mmkvStorage.delete('auth_user_profile');

      // 2. Wipe All Local Financial Records to prevent cross-user data leakage
      const financialKeys = [
        'cache_transactions',
        'cache_income_records',
        'cache_bank_profiles',
        'cache_budgets',
        'cache_budget_custom_categories',
        'cache_budget_excluded_tx_ids',
        'cache_goals',
        'cache_monthly_income',
        'cache_net_worth_snapshots',
        'cache_notifications',
        'cache_peer_allocations',
        'cache_peer_contacts',
        'cache_peer_entries',
        'cache_peer_pending_settlements',
        'security_last_bg_time',
      ];
      for (const k of financialKeys) {
        mmkvStorage.delete(k);
      }

      // Wipe dynamic outbox items and sharded transaction/income partitions
      const allKeys = mmkvStorage.getAllKeys();
      for (const k of allKeys) {
        if (k.startsWith('outbox') || k.startsWith('tx:') || k.startsWith('inc:')) {
          mmkvStorage.delete(k);
        }
      }
    } catch (e: any) {
      console.error('[Auth] Failed to delete MMKV session keys:', e.message);
    }

    syncNativeAuthCredentials(null);

    // 3. Reset In-Memory Zustand Stores
    try {
      useTransactionStore.getState().setTransactions([]);
      useIncomeStore.getState().setIncomeRecords([]);
      useBankStore.getState().setBankProfiles([]);
      useBudgetStore.getState().setBudgets([]);
      useGoalsStore.getState().setGoals([]);
      useAnalyticsStore.getState().setSnapshots([]);
      useAnalyticsStore.getState().setIncomeCurrentMonth(0);
      useNotificationStore.getState().setNotifications([]);
      useAuthStore.getState().setUser(null);

      // Lazily reset peer store if loaded
      try {
        const { usePeerStore } = require('../store/peerStore');
        usePeerStore?.setState?.({
          contacts: [],
          entries: [],
          storedAllocations: [],
          pendingSettlements: [],
        });
      } catch {
        // Peer store optional
      }
    } catch (e: any) {
      console.warn('[Auth] Error clearing in-memory stores:', e.message);
    }
  },

  /**
   * Schedules account deletion with 7-day grace period, survey reason, and optional password confirmation.
   */
  async requestAccountDeletion(
    reasonCode: string,
    customFeedback?: string,
    password?: string,
  ): Promise<{ success: boolean; message: string; deletionDeadline: number }> {
    const token = tokenStore.getAccessToken();
    if (!token) {
      throw new Error('You must be logged in to delete your account.');
    }

    const response = await fetch(`${BACKEND_URL}/auth/account/request-deletion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        reasonCode,
        customFeedback,
        password,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'Failed to schedule account deletion.');
    }

    return data;
  },
};

// When a refresh is refused (logged out elsewhere, banned, session expired), sign out here too.
let endingSession = false;
setSessionEndedHandler(() => {
  if (endingSession) return;
  endingSession = true;
  authService
    .logOut()
    .catch(() => {})
    .finally(() => {
      endingSession = false;
      showGlobalAlert('Session ended', 'Log in again to continue.');
    });
});
