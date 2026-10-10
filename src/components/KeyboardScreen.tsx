import React from 'react';
import { KeyboardAwareScrollView, KeyboardAwareScrollViewProps } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleProp, ViewStyle } from 'react-native';

export interface KeyboardScreenProps extends KeyboardAwareScrollViewProps {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  bottomOffset?: number;
}

/**
 * Universal Form/Screen Wrapper with Edge-to-Edge Android and iOS Keyboard Avoidance.
 * Automatically scrolls the active focused input into view above the keyboard.
 */
export function KeyboardScreen({
  children,
  contentContainerStyle,
  bottomOffset = 24,
  ...rest
}: KeyboardScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAwareScrollView
      bottomOffset={bottomOffset}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        { paddingBottom: (insets?.bottom || 0) + 16 },
        contentContainerStyle as any,
      ]}
      {...rest}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

export default KeyboardScreen;
