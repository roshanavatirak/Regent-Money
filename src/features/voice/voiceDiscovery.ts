// Helping people find voice entry: whether they have used it, and how often each hint has been
// shown, so hints stop once they have done their job. Kept on the phone only.
import { create } from 'zustand';
import { mmkvStorage } from '../../db/mmkv';

const STORAGE_KEY = 'voice_discovery_v1';

/** How many times each hint may show before it stops for good. */
export const HINT_LIMITS = { addHint: 3, tabHint: 3, nudge: 3 } as const;
export type HintKind = keyof typeof HINT_LIMITS;

interface Saved {
  usedVoice: boolean;
  shown: Record<HintKind, number>;
}

interface VoiceDiscoveryState extends Saved {
  /** A typed transaction was just saved: the label shown in the "say it next time" nudge. */
  pendingNudge: { label: string } | null;
  /** The tab hint shows at most once per app session. */
  tabHintThisSession: boolean;
  markUsed: () => void;
  noteShown: (kind: HintKind) => void;
  queueNudge: (label: string) => void;
  clearNudge: () => void;
  setTabHintThisSession: () => void;
}

const empty: Saved = { usedVoice: false, shown: { addHint: 0, tabHint: 0, nudge: 0 } };

const load = (): Saved => {
  try {
    const s = mmkvStorage.getObject<Saved>(STORAGE_KEY);
    if (s && typeof s.usedVoice === 'boolean') return { usedVoice: s.usedVoice, shown: { ...empty.shown, ...(s.shown || {}) } };
  } catch {
    /* first run */
  }
  return empty;
};

const persist = (s: Saved) => {
  try {
    mmkvStorage.setObject(STORAGE_KEY, { usedVoice: s.usedVoice, shown: s.shown });
  } catch {
    /* keep it in memory for this session */
  }
};

export const useVoiceDiscovery = create<VoiceDiscoveryState>((set, get) => ({
  ...load(),
  pendingNudge: null,
  tabHintThisSession: false,
  markUsed: () => {
    if (get().usedVoice) return;
    set({ usedVoice: true, pendingNudge: null });
    persist(get());
  },
  noteShown: (kind) => {
    set({ shown: { ...get().shown, [kind]: get().shown[kind] + 1 } });
    persist(get());
  },
  queueNudge: (label) => {
    if (!canShow(get(), 'nudge')) return;
    set({ pendingNudge: { label } });
  },
  clearNudge: () => set({ pendingNudge: null }),
  setTabHintThisSession: () => set({ tabHintThisSession: true }),
}));

/** A hint shows only to people who have not used voice yet, and only up to its limit. */
export const canShow = (s: Saved, kind: HintKind) => !s.usedVoice && s.shown[kind] < HINT_LIMITS[kind];
