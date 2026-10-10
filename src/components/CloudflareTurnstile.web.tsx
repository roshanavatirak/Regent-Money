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
  theme = 'dark',
  style,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Inject custom styling to ensure full width alignment
    const styleId = 'cf-turnstile-custom-css';
    if (!document.getElementById(styleId)) {
      const styleTag = document.createElement('style');
      styleTag.id = styleId;
      styleTag.innerHTML = `
        .cf-turnstile-fullwidth {
          width: 100% !important;
          display: flex !important;
          justify-content: center !important;
          align-items: center !important;
        }
        .cf-turnstile-fullwidth > div,
        .cf-turnstile-fullwidth iframe {
          width: 100% !important;
          max-width: 100% !important;
          border-radius: 14px !important;
          box-sizing: border-box !important;
        }
      `;
      document.head.appendChild(styleTag);
    }

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
        size: 'flexible',
        callback: (token: string) => {
          onVerify(token);
        },
        'error-callback': (err: any) => {
          console.warn('[Turnstile] Challenge error:', err);
          onError?.(err);
        },
        'expired-callback': () => {
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
    <View style={[styles.wrapper, style]}>
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
  },
});

export default CloudflareTurnstile;
