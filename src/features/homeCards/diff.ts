import type { HomeCard } from './schema';

export type ChangeKind = 'Added' | 'Removed' | 'Edited' | 'Paused' | 'Resumed' | 'Reordered';

export interface CardChange {
  kind: ChangeKind;
  id?: string;
  title?: string;
  /** Edited only: what changed, in words. */
  fields?: string[];
}

const FIELD_LABELS: Partial<Record<keyof HomeCard, string>> = {
  title: 'title',
  cta: 'button text',
  art: 'illustration',
  theme: 'colour',
  colors: 'colour',
  action: 'tap action',
  url: 'link',
  rule: 'audience',
  platform: 'platform',
  startsAt: 'start date',
  endsAt: 'end date',
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Everything that differs between what users see (`live`) and the admin's draft. */
export function diffCards(live: HomeCard[], draft: HomeCard[]): CardChange[] {
  const liveById = new Map(live.map((c) => [c.id, c]));
  const draftIds = new Set(draft.map((c) => c.id));
  const out: CardChange[] = [];

  for (const c of draft) {
    const before = liveById.get(c.id);
    if (!before) {
      out.push({ kind: 'Added', id: c.id, title: c.title });
      continue;
    }
    const fields = [
      ...new Set(
        (Object.keys(FIELD_LABELS) as (keyof HomeCard)[])
          .filter((k) => !(k === 'colors' && c.theme !== 'custom' && before.theme !== 'custom'))
          .filter((k) => !same(before[k], c[k]))
          .map((k) => FIELD_LABELS[k]!),
      ),
    ];
    if (fields.length) out.push({ kind: 'Edited', id: c.id, title: c.title, fields });
    else if (before.enabled !== c.enabled) out.push({ kind: c.enabled ? 'Resumed' : 'Paused', id: c.id, title: c.title });
    if (fields.length && before.enabled !== c.enabled) {
      out.push({ kind: c.enabled ? 'Resumed' : 'Paused', id: c.id, title: c.title });
    }
  }
  for (const c of live) {
    if (!draftIds.has(c.id)) out.push({ kind: 'Removed', id: c.id, title: c.title });
  }
  const liveOrder = live.filter((c) => draftIds.has(c.id)).map((c) => c.id);
  const draftOrder = draft.filter((c) => liveById.has(c.id)).map((c) => c.id);
  if (!same(liveOrder, draftOrder)) out.push({ kind: 'Reordered' });
  return out;
}

/** A new id for a card made from `base` that doesn't clash with `taken`. */
export function freshId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
