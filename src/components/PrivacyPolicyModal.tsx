// src/components/PrivacyPolicyModal.tsx
//
// Privacy policy as a bottom sheet. Text comes from src/constants/legalContent.ts.

import React from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '../store';
import { PRIVACY } from '../constants/legalContent';
import { LegalDocumentView } from './LegalDocumentView';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

interface PrivacyPolicyModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ visible, onDismiss }) => {
  const { isDark } = useTheme();
  return (
    <LegalDocumentView
      visible={visible}
      doc={PRIVACY}
      variant="sheet"
      icon="shield"
      onClose={onDismiss}
      footer={() => (
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => [s.btn, { backgroundColor: isDark ? LIME : FOREST }, pressed && { transform: [{ scale: 0.98 }] }]}
          accessibilityRole="button"
        >
          <Text style={[s.btnText, { color: isDark ? FOREST : LIME }]}>Done</Text>
        </Pressable>
      )}
    />
  );
};

const s = StyleSheet.create({
  btn: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: '700' },
});