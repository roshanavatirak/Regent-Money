import { Platform, NativeModules } from 'react-native';
import { mmkvStorage } from '../db/mmkv';
import { useAuthStore, UserProfile, useSecurityStore, AutoLockTimeout } from '../store';
import { syncService } from './syncService';
import { getGoogleWebClientId } from '../config/auth';
import { BACKEND_URL, getBackendUrl } from '../config/api';
import { tokenStore } from './tokenStore';

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

function syncNativeAuthCredentials(token: string | null, userId?: string | null) {
  if (Platform.OS === 'android') {
    try {
      if (token) {
        NativeModules.NativeStorage?.setAuthCredentials?.(token, getBackendUrl(), userId || null);
      } else {
        NativeModules.NativeStorage?.clearAuthCredentials?.();
      }
    } catch (e) {
      console.warn('[AuthService] Failed to sync credentials to native storage:', e);
    }
  }
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

    if (!cachedProfile) {
      useAuthStore.getState().setUser(null);
      useAuthStore.getState().setLoading(false);
      return null;
    }

    // Keep cached user immediately so avatar and profile are displayed instantly
    useAuthStore.getState().setUser(cachedProfile);
    useAuthStore.getState().setLoading(false);

    // Sync in background if token exists
    if (token) {
      syncNativeAuthCredentials(token, cachedProfile?.id);
      this.fetchProfile().catch(() => { });
      syncService.sync().catch((e) =>
        console.log('[Auth] Background sync on session check notice:', e.message)
      );
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

  async signUp(name: string, email: string, phone: string, password?: string, turnstileToken?: string): Promise<{ profile: UserProfile; sessionConfirmed: boolean }> {
    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedPhone = formatPhoneNumber(phone.trim());

    const response = await fetch(`${BACKEND_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email: sanitizedEmail,
        phone: sanitizedPhone,
        password,
        turnstileToken,
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.message || 'Failed to sign up.');
    }

    const data = await response.json();
    const profile: UserProfile = data.profile;
    const sessionConfirmed = data.sessionConfirmed;

    // Log the email verification link in development so the developer knows it immediately
    if (data.verificationLink) {
      console.log(`[DEVELOPMENT] Email verification link: ${data.verificationLink}`);
    }

    if (sessionConfirmed && data.accessToken) {
      // Save profile cache and token locally
      mmkvStorage.setString(SESSION_KEY, profile.id);
      mmkvStorage.setObject(USER_PROFILE_KEY, profile);
      tokenStore.setAccessToken(data.accessToken);
      mmkvStorage.setBoolean('auth_remember_me', true); // Sign up auto-remembers
      useAuthStore.getState().setUser(profile);
      syncNativeAuthCredentials(data.accessToken);

      // Initial database push
      syncService.sync().catch((e) => console.warn('[Auth] Initial sync push failed:', e));
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailOrMobile: emailOrMobileFormatted,
        password,
        turnstileToken,
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.message || 'Invalid credentials.');
    }

    const data = await response.json();
    const profile: UserProfile = data.profile;

    // Save profile cache and token locally
    mmkvStorage.setString(SESSION_KEY, profile.id);
    mmkvStorage.setObject(USER_PROFILE_KEY, profile);
    tokenStore.setAccessToken(data.accessToken);
    mmkvStorage.setBoolean('auth_remember_me', rememberMe);
    useAuthStore.getState().setUser(profile);
    syncNativeAuthCredentials(data.accessToken, profile?.id);

    // Initial database pull (downloads user transactions, budgets, goals)
    syncService.sync().catch((e) => console.warn('[Auth] Initial sync pull failed:', e));

    return profile;
  },

  /**
   * Native Google Login flow (stub or bridged verification via ID token)
   */
  async signInWithGoogleNative(forceAccountPicker: boolean = false): Promise<UserProfile> {
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
        headers: { 'Content-Type': 'application/json' },
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
      tokenStore.setAccessToken(data.accessToken);
      useAuthStore.getState().setUser(profile);
      syncNativeAuthCredentials(data.accessToken, profile?.id);

      // Initial database sync
      syncService.sync().catch((e) => console.warn('[Auth] Google Native login sync failed:', e));

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
    try {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      const isSignedIn = await GoogleSignin.isSignedIn();
      if (isSignedIn) {
        await GoogleSignin.signOut();
        console.log('[Auth] Signed out from Google Native.');
      }
    } catch (e: any) {
      console.log('[Auth] Google Native signout failed or not initialized:', e.message);
    }

    try {
      mmkvStorage.delete(SESSION_KEY);
      mmkvStorage.delete(USER_PROFILE_KEY);
      tokenStore.clearAccessToken();
      mmkvStorage.delete('auth_remember_me');
    } catch (e: any) {
      console.error('[Auth] Failed to delete MMKV session keys:', e.message);
    }

    syncNativeAuthCredentials(null);

    useAuthStore.getState().setUser(null);
  },
};
