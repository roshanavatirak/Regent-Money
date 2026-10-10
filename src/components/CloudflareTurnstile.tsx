import React from 'react';
import { View, StyleSheet } from 'react-native';

interface CloudflareTurnstileProps {
  onVerify: (token: string) => void;
  onError?: (error?: any) => void;
  onExpire?: () => void;
  theme?: 'dark' | 'light' | 'auto';
  style?: any;
}

export const CloudflareTurnstile: React.FC<CloudflareTurnstileProps> = ({
  style,
}) => {
  // On native platforms, Cloudflare Turnstile web widget is not rendered
  // Rate limiting and Play Integrity / App Attest protect native endpoints
  return <View style={[styles.wrapper, style]} />;
};

const styles = StyleSheet.create({
  wrapper: {
    minHeight: 0,
  },
});

export default CloudflareTurnstile;
