import { mmkvStorage } from '../db/mmkv';
import { useAuthStore, UserProfile } from '../store';
import { syncService } from './syncService';
import { getGoogleWebClientId } from './supabaseClient';

const SESSION_KEY = 'auth_user_id';
const USER_PROFILE_KEY = 'auth_user_profile';
const TOKEN_KEY = 'auth_access_token';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

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

export const authService = {
  /**
   * Retrieves the saved access token from local MMKV storage
   */
  getAccessToken(): string | null {
    return mmkvStorage.getString(TOKEN_KEY) || null;
  },

  /**
   * Loads the cached session profile from MMKV, boots the UI,
   * and triggers a background database sync with the NestJS backend in the background.
   */
  async checkSession(): Promise<UserProfile | null> {
    const cachedProfile = mmkvStorage.getObject<UserProfile>(USER_PROFILE_KEY);
    const token = mmkvStorage.getString(TOKEN_KEY);
    const rememberMe = mmkvStorage.getBoolean('auth_remember_me') !== false;

    // Google logins are always remembered by default. If it's a local/email login,
    // we require rememberMe to be true.
    const isGoogle = cachedProfile?.authProvider === 'google';

    if (!cachedProfile || !token || (!rememberMe && !isGoogle)) {
      if (cachedProfile || token) {
        await this.logOut();
      }
      useAuthStore.getState().setUser(null);
      useAuthStore.getState().setLoading(false);
      return null;
    }

    useAuthStore.getState().setUser(cachedProfile);
    useAuthStore.getState().setLoading(false);

    // Sync in background to download updates from other devices
    syncService.sync().catch((e) => 
      console.log('[Auth] Background sync on session check failed:', e.message)
    );
    return cachedProfile;
  },

  async signUp(name: string, email: string, phone: string, password?: string): Promise<{ profile: UserProfile; sessionConfirmed: boolean }> {
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
      mmkvStorage.setString(TOKEN_KEY, data.accessToken);
      mmkvStorage.setBoolean('auth_remember_me', true); // Sign up auto-remembers
      useAuthStore.getState().setUser(profile);

      // Initial database push
      syncService.sync().catch((e) => console.error('[Auth] Initial sync push failed:', e));
    }

    return { profile, sessionConfirmed };
  },

  /**
   * Log in online using NestJS Authentication.
   */
  async logIn(emailOrMobile: string, password?: string, rememberMe: boolean = true): Promise<UserProfile> {
    const input = emailOrMobile.trim();
    const isMail = input.includes('@');
    const emailOrMobileFormatted = isMail ? input.toLowerCase() : formatPhoneNumber(input);

    const response = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emailOrMobile: emailOrMobileFormatted,
        password,
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
    mmkvStorage.setString(TOKEN_KEY, data.accessToken);
    mmkvStorage.setBoolean('auth_remember_me', rememberMe);
    useAuthStore.getState().setUser(profile);

    // Initial database pull (downloads user transactions, budgets, goals)
    syncService.sync().catch((e) => console.error('[Auth] Initial sync pull failed:', e));

    return profile;
  },

  /**
   * Native Google Login flow (stub or bridged verification via ID token)
   */
  async signInWithGoogleNative(): Promise<UserProfile> {
    const webClientId = getGoogleWebClientId();
    if (!webClientId) {
      throw new Error('Google Web Client ID is not configured.');
    }

    try {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      
      GoogleSignin.configure({
        webClientId,
        offlineAccess: true,
      });

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult?.data?.idToken || signInResult?.idToken;

      if (!idToken) {
        throw new Error('No ID token returned from Google Sign-In.');
      }

      // Extract user info from ID token or profile details to pass to backend
      const userEmail = signInResult?.data?.user?.email || signInResult?.user?.email || '';
      const userName = signInResult?.data?.user?.name || signInResult?.user?.name || userEmail.split('@')[0];
      const userAvatar = signInResult?.data?.user?.photo || signInResult?.user?.photo || '';

      const response = await fetch(`${BACKEND_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          name: userName,
          avatarUrl: userAvatar,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Google Auth verification failed on backend.');
      }

      const data = await response.json();
      const profile: UserProfile = data.profile;

      // Save profile cache and token locally
      mmkvStorage.setString(SESSION_KEY, profile.id);
      mmkvStorage.setObject(USER_PROFILE_KEY, profile);
      mmkvStorage.setString(TOKEN_KEY, data.accessToken);
      useAuthStore.getState().setUser(profile);

      // Initial database sync
      syncService.sync().catch((e) => console.error('[Auth] Google Native login sync failed:', e));

      return profile;
    } catch (e: any) {
      console.error('[Auth] Native Google Sign-In failed:', e);
      throw e;
    }
  },

  /**
   * Performs high-fidelity mock Google signup/login mapped directly to NestJS endpoints.
   */
  async signUpOrLogInGoogle(name: string, email: string, avatarUrl?: string): Promise<UserProfile> {
    const sanitizedEmail = email.trim().toLowerCase();

    const response = await fetch(`${BACKEND_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: sanitizedEmail,
        name,
        avatarUrl,
      }),
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.message || 'Google Auth verification failed on backend.');
    }

    const data = await response.json();
    const profile: UserProfile = data.profile;

    // Save profile cache and token locally
    mmkvStorage.setString(SESSION_KEY, profile.id);
    mmkvStorage.setObject(USER_PROFILE_KEY, profile);
    mmkvStorage.setString(TOKEN_KEY, data.accessToken);
    useAuthStore.getState().setUser(profile);

    // Initial database sync
    syncService.sync().catch((e) => console.error('[Auth] Google login sync failed:', e));
    return profile;
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
      mmkvStorage.delete(TOKEN_KEY);
      mmkvStorage.delete('auth_remember_me');
    } catch (e: any) {
      console.error('[Auth] Failed to delete MMKV session keys:', e.message);
    }

    useAuthStore.getState().setUser(null);
  },
};
