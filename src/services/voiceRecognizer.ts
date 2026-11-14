// src/services/voiceRecognizer.ts
//
// The phone's own speech recogniser (android/.../VoiceRecognizerModule.kt): free, instant,
// and shows the words while you speak. It is optional. Every function here is safe to call on
// a phone or app build that does not have it; voice entry then uses the cloud services.

import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

type Native = {
  isAvailable(): Promise<boolean>;
  start(language: string, session: number): Promise<boolean>;
  /** Missing on app builds made before it was added. */
  startOnDevice?(language: string, session: number): Promise<'started' | 'unavailable' | 'failed'>;
  stop(): void;
  cancel(): void;
};

const native: Native | null = Platform.OS === 'android' ? (NativeModules.VoiceRecognizer ?? null) : null;

export type LocalVoiceErrorReason =
  | 'no_speech'
  | 'permission'
  | 'network'
  | 'audio'
  | 'busy'
  | 'language'
  /** On-device only: the language pack was missing and Android started downloading it. */
  | 'language_downloading'
  | 'failed';

export interface LocalVoiceHandlers {
  onReady?: () => void;
  onPartial?: (text: string) => void;
  onLevel?: (level: number) => void;
  onFinal: (text: string, confidence: number) => void;
  onError: (reason: LocalVoiceErrorReason) => void;
}

let nextSession = 1;

/** True when this phone can recognise speech by itself. Never throws. */
export async function isLocalVoiceAvailable(): Promise<boolean> {
  if (!native) return false;
  try {
    return (await native.isAvailable()) === true;
  } catch {
    return false;
  }
}

type VoiceHandle = { stop: () => void; cancel: () => void };

/** Wires the native events for one session, then asks `begin` to open the mic. */
async function run(
  handlers: LocalVoiceHandlers,
  begin: (session: number) => Promise<boolean | 'started' | 'unavailable' | 'failed'>,
): Promise<{ status: 'started'; handle: VoiceHandle } | { status: 'unavailable' | 'failed' }> {
  if (!native) return { status: 'unavailable' };
  const n = native;
  const session = nextSession++;
  const mine = (e: any) => e?.session === session;
  const subs = [
    DeviceEventEmitter.addListener('voiceReady', (e) => mine(e) && handlers.onReady?.()),
    DeviceEventEmitter.addListener('voicePartial', (e) => mine(e) && typeof e.text === 'string' && handlers.onPartial?.(e.text)),
    DeviceEventEmitter.addListener('voiceLevel', (e) => mine(e) && handlers.onLevel?.(Number(e.level) || 0)),
    DeviceEventEmitter.addListener('voiceFinal', (e) => {
      if (!mine(e)) return;
      release();
      handlers.onFinal(String(e.text || ''), typeof e.confidence === 'number' ? e.confidence : -1);
    }),
    DeviceEventEmitter.addListener('voiceError', (e) => {
      if (!mine(e)) return;
      release();
      handlers.onError((e.reason as LocalVoiceErrorReason) || 'failed');
    }),
  ];
  let released = false;
  function release() {
    if (released) return;
    released = true;
    subs.forEach((s) => s.remove());
  }

  try {
    const result = await begin(session);
    if (result !== true && result !== 'started') {
      release();
      return { status: result === 'unavailable' ? 'unavailable' : 'failed' };
    }
  } catch {
    release();
    return { status: 'failed' };
  }

  return {
    status: 'started',
    handle: {
      stop: () => {
        try {
          n.stop();
        } catch {}
      },
      cancel: () => {
        release();
        try {
          n.cancel();
        } catch {}
      },
    },
  };
}

/**
 * Starts listening. Resolves to a handle, or null when the recogniser could not start
 * (the caller then uses the cloud path). Events from older sessions are ignored.
 */
export async function startLocalVoice(language: string, handlers: LocalVoiceHandlers): Promise<VoiceHandle | null> {
  const r = await run(handlers, (session) => native!.start(language, session));
  return r.status === 'started' ? r.handle : null;
}

/**
 * Strict on-device recognition: the audio stays on the phone and nothing falls back to a
 * cloud or AI service. `unavailable` means this phone (or app build) cannot do it locally.
 * Pass '' as the language to use the phone's own.
 */
export async function startOnDeviceVoice(
  language: string,
  handlers: LocalVoiceHandlers,
): Promise<{ status: 'started'; handle: VoiceHandle } | { status: 'unavailable' | 'failed' }> {
  if (!native || typeof native.startOnDevice !== 'function') {
    if (__DEV__ && native) {
      console.warn('VoiceRecognizer.startOnDevice is missing: rebuild the Android app (native code changed).');
    }
    return { status: 'unavailable' };
  }
  return run(handlers, (session) => native!.startOnDevice!(language, session));
}
