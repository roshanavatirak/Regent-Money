/**
 * The backend adds `X-Home-Cards: <version>` to its responses. installAuthFetch passes every
 * backend response here; when the number changes, the Home cards store hears about it and
 * downloads that version once. No extra requests are made just to check.
 */

let lastSeen = 0;
let listener: ((version: number) => void) | null = null;

export function reportHomeCardsHeader(res: { headers?: { get?: (name: string) => string | null } } | null | undefined) {
  const raw = res?.headers?.get?.('x-home-cards');
  if (!raw) return;
  const v = Number(raw);
  if (!Number.isInteger(v) || v <= 0) return;
  lastSeen = v;
  // Called on every response (a number comparison in the store); lets a failed download
  // retry on a later response once its backoff has passed.
  listener?.(v);
}

export function onHomeCardsVersion(fn: (version: number) => void) {
  listener = fn;
  if (lastSeen) fn(lastSeen);
}

/** For tests. */
export function resetHomeCardsSignal() {
  lastSeen = 0;
  listener = null;
}
