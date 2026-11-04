import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import App from './App';

// Suppress unhandled promise rejections from web font observers
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const msg = typeof reason === 'string' ? reason : (reason?.message || '');
    if (msg.includes('12000ms timeout exceeded') || msg.includes('timeout exceeded')) {
      event.preventDefault?.();
      if (typeof (event as any).stopImmediatePropagation === 'function') {
        (event as any).stopImmediatePropagation();
      }
    }
  });

  // Prevent Chrome "Blocked aria-hidden on an element because its descendant retained focus"
  if (typeof Element !== 'undefined' && Element.prototype && Element.prototype.setAttribute) {
    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name: string, value: string) {
      if (name === 'aria-hidden' && (value === 'true' || value === '')) {
        if (typeof document !== 'undefined' && document.activeElement && this.contains(document.activeElement)) {
          try {
            (document.activeElement as HTMLElement).blur?.();
          } catch {}
        }
      }
      return originalSetAttribute.apply(this, arguments as any);
    };
  }
}

registerRootComponent(App);
