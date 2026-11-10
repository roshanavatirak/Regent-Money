import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSidebarStore } from '../store';

/**
 * When a screen is navigated from the sidebar (passing route.params.fromSidebar = true),
 * this hook ensures that any back action (in-app back button, Android hardware back,
 * or gesture back) seamlessly re-opens the sidebar upon returning.
 */
export function useSidebarBackHandler() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const fromSidebar = !!route.params?.fromSidebar;
  const isBackHandled = useRef(false);

  const handleBack = () => {
    if (isBackHandled.current) return;
    isBackHandled.current = true;
    navigation.goBack();
    if (fromSidebar) {
      setTimeout(() => {
        useSidebarStore.getState().openSidebar();
      }, 100);
    }
  };

  useEffect(() => {
    if (!fromSidebar) return;

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });

    const unsub = navigation.addListener('beforeRemove', () => {
      if (!isBackHandled.current) {
        isBackHandled.current = true;
        setTimeout(() => {
          useSidebarStore.getState().openSidebar();
        }, 100);
      }
    });

    return () => {
      sub.remove();
      unsub();
    };
  }, [navigation, fromSidebar]);

  return { handleBack, fromSidebar };
}

