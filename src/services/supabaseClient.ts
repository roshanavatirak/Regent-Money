import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { mmkvStorage } from '../db/mmkv';

const SUPABASE_URL_KEY = 'supabase_project_url';
const SUPABASE_ANON_KEY_KEY = 'supabase_anon_key';
const GOOGLE_WEB_CLIENT_ID_KEY = 'google_web_client_id';

// Default placeholders (can be overridden in the app settings UI)
const DEFAULT_SUPABASE_URL = 'https://crwbdvenezmpnbsmpxhm.supabase.co'; 
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyd2JkdmVuZXptcG5ic21weGhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMDcyNjIsImV4cCI6MjA5NjU4MzI2Mn0.MPMcig4BMPADS_DKyolRA14DSreHS4MwXniVVuh2WdI'; 
const DEFAULT_GOOGLE_WEB_CLIENT_ID = '55231273460-epfomp35a43c6d15bhilb92i6btl6jt9.apps.googleusercontent.com'; 

export const getSupabaseUrl = (): string => {
  return process.env.EXPO_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
};

export const setSupabaseUrl = (url: string): void => {
  console.log('[SupabaseClient] setSupabaseUrl is deprecated. Use .env file configuration.');
};

export const getSupabaseAnonKey = (): string => {
  return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
};

export const setSupabaseAnonKey = (key: string): void => {
  console.log('[SupabaseClient] setSupabaseAnonKey is deprecated. Use .env file configuration.');
};

export const getGoogleWebClientId = (): string => {
  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || DEFAULT_GOOGLE_WEB_CLIENT_ID;
};

export const setGoogleWebClientId = (id: string): void => {
  console.log('[SupabaseClient] setGoogleWebClientId is deprecated. Use .env file configuration.');
};

export let supabase: ReturnType<typeof createClient> | null = null;

export function initializeSupabase() {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  if (url && anonKey) {
    try {
      const mmkvAuthStorage = {
        getItem: (key: string) => {
          return mmkvStorage.getString(key) || null;
        },
        setItem: (key: string, value: string) => {
          mmkvStorage.setString(key, value);
        },
        removeItem: (key: string) => {
          mmkvStorage.delete(key);
        },
      };

      supabase = createClient(url, anonKey, {
        auth: {
          storage: mmkvAuthStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      });

      // Configure Google Sign-in on native platforms
      if (Platform.OS !== 'web') {
        const webClientId = getGoogleWebClientId();
        if (webClientId) {
          try {
            const { GoogleSignin } = require('@react-native-google-signin/google-signin');
            GoogleSignin.configure({
              webClientId,
              offlineAccess: true,
            });
            console.log('[Supabase] Google Sign-In configured successfully.');
          } catch (e: any) {
            console.error('Failed to configure Google Sign-In:', e.message);
          }
        } else {
          console.warn('[Supabase] Google Web Client ID is not set. Google Sign-In is not initialized.');
        }
      }
    } catch (e) {
      console.error('Failed to initialize Supabase client:', e);
      supabase = null;
    }
  } else {
    supabase = null;
  }
  return supabase;
}

// Perform initial load check
initializeSupabase();
