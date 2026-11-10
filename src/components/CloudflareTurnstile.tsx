// Cloudflare Turnstile on Android / iOS.
//
// Turnstile only runs in a browser, so the widget lives in a small WebView.
// The page is loaded with `baseUrl` set to our own web origin: Turnstile checks
// the page's hostname, so that hostname must be listed under the widget's
// allowed hostnames in the Cloudflare dashboard (Turnstile > widget > Hostnames).
// The token comes back through window.ReactNativeWebView.postMessage.
//
// Tokens are single use. Callers remount the widget (change its `key`) after
// every login / signup attempt to get a fresh one.

import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

type WebViewMessageEvent = any;
let WebView: any = null;
let isNativeWebViewAvailable = false;

try {
  const rnWebview = require('react-native-webview');
  WebView = rnWebview.WebView;
  isNativeWebViewAvailable = !!WebView;
} catch {
  WebView = null;
  isNativeWebViewAvailable = false;
}

interface CloudflareTurnstileProps {
  onVerify: (token: string) => void;
  onError?: (error?: any) => void;
  onExpire?: () => void;
  theme?: 'dark' | 'light' | 'auto';
  style?: any;
}

const TURNSTILE_SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAFS21ZDrV2b2WG7k';
// Must be a hostname allowed for the site key in Cloudflare.
const TURNSTILE_BASE_URL = process.env.EXPO_PUBLIC_TURNSTILE_BASE_URL || 'https://app.regentmoney.com';

const WIDGET_HEIGHT = 70;
// Turnstile can grow (an interactive challenge). The WebView follows its height up to this.
const MAX_WIDGET_HEIGHT = 420;

const buildHtml = (siteKey: string, theme: string) => `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body { display: flex; justify-content: center; align-items: center; min-height: ${WIDGET_HEIGHT}px; }
</style>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=rmOnLoad&render=explicit" async defer></script>
</head>
<body>
<div id="cf"></div>
<script>
  function send(msg) { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  var lastH = 0;
  function reportHeight() {
    var h = Math.ceil(document.getElementById('cf').getBoundingClientRect().height);
    if (h && h !== lastH) { lastH = h; send({ type: 'height', h: h }); }
  }
  if (window.ResizeObserver) { new ResizeObserver(reportHeight).observe(document.getElementById('cf')); }
  setInterval(reportHeight, 500);
  window.rmOnLoad = function () {
    try {
      turnstile.render('#cf', {
        sitekey: ${JSON.stringify(siteKey)},
        theme: ${JSON.stringify(theme)},
        size: 'normal',
        callback: function (token) { send({ type: 'token', token: token }); },
        'error-callback': function (code) { send({ type: 'error', code: String(code || '') }); return true; },
        'expired-callback': function () { send({ type: 'expired' }); },
        'timeout-callback': function () { send({ type: 'expired' }); }
      });
      send({ type: 'ready' });
    } catch (e) {
      send({ type: 'error', code: String(e && e.message || e) });
    }
  };
</script>
</body>
</html>`;

type Status = 'loading' | 'ready' | 'verified' | 'error';

export const CloudflareTurnstile: React.FC<CloudflareTurnstileProps> = ({
  onVerify,
  onError,
  onExpire,
  theme = 'light',
  style,
}) => {
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  const [height, setHeight] = useState(WIDGET_HEIGHT);
  const dark = theme === 'dark';
  const [lastErrorCode, setLastErrorCode] = useState<string | null>(null);
  const lastErrorLoggedRef = useRef<string | null>(null);
  const html = useMemo(() => buildHtml(TURNSTILE_SITE_KEY, theme), [theme]);

  if (!isNativeWebViewAvailable || !WebView) {
    // The installed binary was built before react-native-webview was added
    // (rebuild with `npx expo run:android`). Don't crash; say why login is blocked.
    return (
      <View style={[styles.wrapper, style]}>
        <Text style={styles.errorText}>Security check needs the latest app version. Update the app to continue.</Text>
      </View>
    );
  }

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'height' && typeof msg.h === 'number') {
      setHeight(Math.min(MAX_WIDGET_HEIGHT, Math.max(WIDGET_HEIGHT, msg.h + 8)));
    } else if (msg.type === 'ready') setStatus(s => (s === 'loading' ? 'ready' : s));
    else if (msg.type === 'token' && typeof msg.token === 'string') {
      setStatus('verified');
      onVerify(msg.token);
    } else if (msg.type === 'expired') {
      setStatus('ready');
      onExpire?.();
    } else if (msg.type === 'error') {
      const errCode = String(msg.code || '');
      if (lastErrorLoggedRef.current !== errCode) {
        lastErrorLoggedRef.current = errCode;
        if (errCode === '110200') {
          console.warn(
            `[Turnstile] Challenge error 110200: Domain not authorized for sitekey. Ensure "${TURNSTILE_BASE_URL}" is added under Turnstile > Widget > Hostnames in Cloudflare Dashboard.`
          );
        } else {
          console.warn('[Turnstile] Challenge error:', errCode);
        }
      }
      setLastErrorCode(errCode);
      setStatus('error');
      onError?.(errCode);
    }
  };

  const retry = () => {
    lastErrorLoggedRef.current = null;
    setLastErrorCode(null);
    setHeight(WIDGET_HEIGHT);
    setStatus('loading');
    setAttempt(a => a + 1);
    onExpire?.();
  };

  // On failure Turnstile shows its own "Troubleshoot" panel, which doesn't fit a phone
  // layout. Hide the widget and show our own short message with a retry instead.
  if (status === 'error') {
    const notSetUp = lastErrorCode === '110200';
    return (
      <View style={[styles.wrapper, style]}>
        <View
          style={[
            styles.errorCard,
            { backgroundColor: dark ? 'rgba(255,138,107,0.10)' : '#FFF4F1', borderColor: dark ? 'rgba(255,138,107,0.28)' : '#F6D3CA' },
          ]}
        >
          <View style={[styles.errorIcon, { backgroundColor: dark ? 'rgba(255,138,107,0.18)' : '#FDE4DF' }]}>
            <Feather name="shield-off" size={17} color={dark ? '#FF8A6B' : '#B42E17'} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.errorTitle, { color: dark ? '#FFFFFF' : '#0B1F17' }]}>Security check failed</Text>
            <Text style={[styles.errorBody, { color: dark ? 'rgba(250,251,252,0.66)' : '#5B6B63' }]}>
              {notSetUp ? 'Not set up for this app yet.' : 'Check your connection.'}
            </Text>
          </View>
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="Try the security check again"
            hitSlop={6}
            style={({ pressed }) => [
              styles.retryBtn,
              { backgroundColor: dark ? '#B8F36B' : '#0B3D2C', opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="rotate-cw" size={13} color={dark ? '#0B3D2C' : '#B8F36B'} />
            <Text style={[styles.retryText, { color: dark ? '#0B3D2C' : '#FFFFFF' }]}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, style]}>
      <WebView
        key={attempt}
        source={{ html, baseUrl: TURNSTILE_BASE_URL }}
        originWhitelist={['*']}
        onMessage={onMessage}
        onError={() => {
          setStatus('error');
          onError?.('webview-load-failed');
        }}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        scrollEnabled={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        style={styles.webview}
        containerStyle={[styles.webviewContainer, { height }]}
        androidLayerType="hardware"
      />
      {status === 'loading' && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="small" color={dark ? '#B8F36B' : '#0B3D2C'} />
          <Text style={[styles.overlayText, dark && { color: 'rgba(250,251,252,0.66)' }]}>Loading security check…</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: { width: '100%', marginTop: 16, alignItems: 'center' },
  webview: { backgroundColor: 'transparent' },
  webviewContainer: { width: '100%', height: WIDGET_HEIGHT, backgroundColor: 'transparent' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: WIDGET_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  overlayText: { fontSize: 13, color: '#5E7A6C' },
  errorText: { marginTop: 6, fontSize: 12, color: '#C92A2A', textAlign: 'center' },
  errorCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 10,
  },
  errorIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { fontSize: 14, fontWeight: '700' },
  errorBody: { fontSize: 12.5, marginTop: 1 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  retryText: { fontSize: 13, fontWeight: '700' },
});

export default CloudflareTurnstile;
