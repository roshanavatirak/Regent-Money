import { useState, useEffect, useMemo } from 'react';
import { Keyboard, Platform, KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface KeyboardState {
  keyboardHeight: number;
  isKeyboardVisible: boolean;
  /**
   * Recommended bottom clearance to lift inputs or dock bars above the keyboard,
   * factoring in Android edge-to-edge transparent system navigation bars (insets.bottom).
   */
  keyboardBottomClearance: number;
  /**
   * Additional bottom padding to append to ScrollViews so all bottom inputs
   * can be scrolled comfortably above the keyboard.
   */
  scrollBottomPadding: number;
}

/**
 * Standardized, industry-standard keyboard tracker & clearance calculator across iOS and Android.
 * - Handles Android edge-to-edge transparent navigation bar occlusion.
 * - Essential for Android <Modal> dialogs where native adjustResize does not propagate automatically.
 * - Works seamlessly with scroll views and fixed bottom inputs.
 */
export function useKeyboardHeight(defaultScrollPadding = 40): KeyboardState {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
      setIsKeyboardVisible(true);
    };

    const onHide = () => {
      setKeyboardHeight(0);
      setIsKeyboardVisible(false);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Safe bottom clearance that lifts above the keyboard while factoring in
  // Android's transparent system navigation bar (insets.bottom)
  const keyboardBottomClearance = useMemo(() => {
    if (!isKeyboardVisible) return 0;
    const navBarHeight = Math.max(insets.bottom, 0);
    return Math.max(navBarHeight, 12) + 8;
  }, [isKeyboardVisible, insets.bottom]);

  const scrollBottomPadding = useMemo(() => {
    if (isKeyboardVisible) {
      return insets.bottom + Math.max(keyboardHeight, 0) + 16;
    }
    return insets.bottom + defaultScrollPadding;
  }, [isKeyboardVisible, keyboardHeight, insets.bottom, defaultScrollPadding]);

  return { keyboardHeight, isKeyboardVisible, keyboardBottomClearance, scrollBottomPadding };
}
