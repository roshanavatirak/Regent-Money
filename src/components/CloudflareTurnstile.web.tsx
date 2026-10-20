import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';

interface CloudflareTurnstileProps {
  onVerify: (token: string) => void;
  onError?: (error?: any) => void;
  onExpire?: () => void;
  theme?: 'dark' | 'light' | 'auto';
  style?: any;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement | string, options: any) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onloadTurnstileCallback?: () => void;
  }
}

const TURNSTILE_SITE_KEY =
  process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAFS21ZDrV2b2WG7k';

export const CloudflareTurnstile: React.FC<CloudflareTurnstileProps> = ({
  onVerify,
  onError,
  onExpire,
  theme = 'light',
  style,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Inject custom styling to ensure full width alignment
    const styleId = 'cf-turnstile-custom-css';
    let styleTag = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = `
      .cf-turnstile-fullwidth {
        width: 100% !important;
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        border-radius: 14px !important;
        overflow: visible !important;
        position: relative !important;
        z-index: 10 !important;
        pointer-events: auto !important;
      }
      .cf-turnstile-fullwidth > div {
        display: flex !important;
        justify-content: center !important;
        align-items: center !important;
        pointer-events: auto !important;
      }
      .cf-turnstile-fullwidth iframe {
        border-radius: 14px !important;
        box-sizing: border-box !important;
        pointer-events: auto !important;
        position: relative !important;
        z-index: 10 !important;
      }
    `;

    // Check if script is already present
    const existingScript = document.getElementById('cf-turnstile-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'cf-turnstile-script';
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => setScriptLoaded(true);
      script.onerror = (e) => {
        console.warn('[Turnstile] Failed to load script:', e);
        onError?.(e);
      };
      document.head.appendChild(script);
    } else if (window.turnstile) {
      setScriptLoaded(true);
    } else {
      existingScript.addEventListener('load', () => setScriptLoaded(true));
    }
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !window.turnstile) return;

    try {
      // Clear previous widget if exists
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
      }

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme,
        size: 'normal',
        callback: (token: string) => {
          console.log('[Turnstile] Verification successful, token received.');
          onVerify(token);
        },
        'error-callback': (err: any) => {
          console.warn('[Turnstile] Challenge error:', err);
          onError?.(err);
        },
        'expired-callback': () => {
          console.log('[Turnstile] Token expired.');
          onExpire?.();
        },
      });
    } catch (e) {
      console.warn('[Turnstile] Error rendering widget:', e);
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [scriptLoaded, theme]);

  return (
    <View pointerEvents="auto" style={[styles.wrapper, style]}>
      {/* Container for Cloudflare widget on web */}
      <div
        ref={containerRef}
        className="cf-turnstile-fullwidth"
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 65,
          position: 'relative',
          zIndex: 10,
          pointerEvents: 'auto',
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    marginVertical: 10,
    alignItems: 'stretch',
    justifyContent: 'center',
    minHeight: 65,
    zIndex: 10,
  },
});

export default CloudflareTurnstile;
