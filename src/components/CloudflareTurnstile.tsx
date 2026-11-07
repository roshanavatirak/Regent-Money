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

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

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
    if (msg.type === 'ready') setStatus(s => (s === 'loading' ? 'ready' : s));
    else if (msg.type === 'token' && typeof msg.token === 'string') {
      setStatus('verified');
      onVerify(msg.token);
    } else if (msg.type === 'expired') {
      setStatus('ready');
      onExpire?.();
    } else if (msg.type === 'error') {
      console.warn('[Turnstile] Challenge error:', msg.code);
      setStatus('error');
      onError?.(msg.code);
    }
  };

  return (
    <View style={[styles.wrapper, style]}>
      <WebView
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
        containerStyle={styles.webviewContainer}
        androidLayerType="hardware"
      />
      {status === 'loading' && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="small" color="#0B3D2C" />
          <Text style={styles.overlayText}>Loading security check…</Text>
        </View>
      )}
      {status === 'error' && (
        <Text style={styles.errorText}>Security check couldn’t load. Check your connection and try again.</Text>
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
});

export default CloudflareTurnstile;
