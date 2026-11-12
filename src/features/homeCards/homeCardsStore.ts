import { create } from 'zustand';
import { mmkvStorage } from '../../db/mmkv';
import { getBackendUrl } from '../../config/api';
import { readCards, type HomeCard } from './schema';
import { DEFAULT_CARDS } from './defaults';
import { onHomeCardsVersion } from './homeCardsSignal';

const STORAGE_KEY = 'home_cards_release_v1';
/** After a failed download, wait this long before trying the same version again. */
const RETRY_AFTER_MS = 5 * 60_000;
/** Spread downloads after a publish so phones don't all ask in the same second. */
const MAX_JITTER_MS = 20_000;

interface Stored {
  version: number;
  cards: HomeCard[];
}

interface HomeCardsState extends Stored {
  /** True once a release from the server is in use (false = built-in defaults). */
  fromServer: boolean;
}

const loadStored = (): HomeCardsState => {
  try {
    const s = mmkvStorage.getObject<Stored>(STORAGE_KEY);
    if (s && Number.isInteger(s.version) && s.version > 0) {
      return { version: s.version, cards: readCards(s.cards), fromServer: true };
    }
  } catch {
    /* fall through to defaults */
  }
  return { version: 0, cards: DEFAULT_CARDS, fromServer: false };
};

/**
 * Cards for the Home carousel. Starts from the copy saved on the phone (or the built-in six),
 * so Home never waits on the network. Downloads a release only when the server's
 * X-Home-Cards header shows a newer version than the one held here.
 */
export const useHomeCardsStore = create<HomeCardsState>(() => loadStored());

let pending: { version: number; timer: ReturnType<typeof setTimeout> } | null = null;
let failed: { version: number; at: number } | null = null;

async function download(version: number) {
  try {
    const res = await fetch(`${getBackendUrl()}/home-cards/${version}`, { headers: { Accept: 'application/json' } });
    if (res.status === 404) {
      // Published again meanwhile: follow the server's current number once.
      const body = await res.json().catch(() => ({}));
      const current = Number(body?.current);
      pending = null;
      if (Number.isInteger(current) && current > version) wantVersion(current);
      return;
    }
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = await res.json();
    if (Number(body?.version) !== version) throw new Error('version mismatch');
    const next: Stored = { version, cards: readCards(body.cards) };
    try {
      mmkvStorage.setObject(STORAGE_KEY, next);
    } catch {
      /* still use it for this session */
    }
    useHomeCardsStore.setState({ ...next, fromServer: true });
    failed = null;
  } catch {
    failed = { version, at: Date.now() };
  } finally {
    if (pending?.version === version) pending = null;
  }
}

/** Called with the server's live version; downloads it once if it's newer than ours. */
export function wantVersion(version: number) {
  const have = useHomeCardsStore.getState();
  if (version <= have.version) return;
  if (pending && pending.version >= version) return;
  if (failed && failed.version === version && Date.now() - failed.at < RETRY_AFTER_MS) return;
  if (pending) clearTimeout(pending.timer);
  // First release on this phone: fetch now. Later releases: spread over ~20 s.
  const delay = have.fromServer ? Math.floor(Math.random() * MAX_JITTER_MS) : 0;
  pending = { version, timer: setTimeout(() => void download(version), delay) };
}

onHomeCardsVersion(wantVersion);
