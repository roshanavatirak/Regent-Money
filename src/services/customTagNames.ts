/**
 * Rules for the names in "Your tags". Pure (no React Native imports) so it runs under
 * `npm run test:unit`; tagLearningService passes in the built-in category check.
 */

export const MAX_CUSTOM_TAG_LENGTH = 40;

/** Cleans a typed name: trims and collapses spaces. */
export const cleanTagName = (name: unknown) => (typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : '');

/**
 * Whether a name belongs in "Your tags". Budget category ids (custom_…) are listed from the
 * budgets themselves, and names of built-in categories (Food, Misc…) already have a tile.
 */
export function isCustomTagName(name: string, isBuiltIn: (name: string) => boolean): boolean {
  const n = cleanTagName(name);
  if (n.length < 2 || n.length > MAX_CUSTOM_TAG_LENGTH) return false;
  if (/^custom_/i.test(n)) return false;
  return !isBuiltIn(n);
}

/**
 * Adds `incoming` names to `current` without duplicates (case does not matter); the first
 * spelling wins and the order is kept. Returns the merged list and what was new.
 */
export function mergeTagNames(
  current: string[],
  incoming: string[],
  isBuiltIn: (name: string) => boolean,
): { merged: string[]; added: string[] } {
  const seen = new Set(current.map((t) => t.toLowerCase()));
  const merged = [...current];
  const added: string[] = [];
  for (const raw of incoming) {
    const name = cleanTagName(raw);
    if (!isCustomTagName(name, isBuiltIn) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    merged.push(name);
    added.push(name);
  }
  return { merged, added };
}
