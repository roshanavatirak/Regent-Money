import type { HomeCard, PresetKey } from './schema';

export interface CardTheme {
  bg: string;
  fg: string;
  ctaBg: string;
  ctaFg: string;
  ring: string;
  ring2: string;
}

/** First four are the colours the carousel always had. */
export const PRESETS: Record<PresetKey, CardTheme & { name: string }> = {
  lime: { name: 'Lime', bg: '#B8F36B', fg: '#0B3D2C', ctaBg: '#0B3D2C', ctaFg: '#FFFFFF', ring: '#D3F8A3', ring2: '#A4E752' },
  lilac: { name: 'Lilac', bg: '#C9B8FF', fg: '#1C0F4A', ctaBg: '#1C0F4A', ctaFg: '#FFFFFF', ring: '#DCD0FF', ring2: '#B9A5FF' },
  amber: { name: 'Amber', bg: '#FFB020', fg: '#2B1700', ctaBg: '#2B1700', ctaFg: '#FFFFFF', ring: '#FFD27A', ring2: '#FFC24D' },
  coral: { name: 'Coral', bg: '#FF8A6B', fg: '#3A0D00', ctaBg: '#3A0D00', ctaFg: '#FFFFFF', ring: '#FFB29E', ring2: '#FF7552' },
  sky: { name: 'Sky', bg: '#9FD4FF', fg: '#062A4A', ctaBg: '#062A4A', ctaFg: '#FFFFFF', ring: '#C6E6FF', ring2: '#7EC1FA' },
  forest: { name: 'Forest', bg: '#0B3D2C', fg: '#EAF7EF', ctaBg: '#B8F36B', ctaFg: '#0B3D2C', ring: '#124B37', ring2: '#1D6148' },
};

/** Presets the carousel may swap between so neighbours never match. Forest is never swapped in. */
const AUTO: PresetKey[] = ['lime', 'lilac', 'amber', 'coral', 'sky'];

const mix = (a: string, b: string, t: number) => {
  const A = parseInt(a.slice(1), 16);
  const B = parseInt(b.slice(1), 16);
  const ch = (s: number) => {
    const x = (A >> s) & 255;
    const y = (B >> s) & 255;
    return Math.round(x + (y - x) * t);
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0').toUpperCase()}`;
};

export function themeFor(card: Pick<HomeCard, 'theme' | 'colors'>, shownAs?: PresetKey): CardTheme {
  if (card.theme === 'custom' && card.colors) {
    const c = card.colors;
    return { ...c, ring: mix(c.bg, '#FFFFFF', 0.3), ring2: mix(c.bg, '#000000', 0.1) };
  }
  return PRESETS[shownAs || (card.theme as PresetKey)] || PRESETS.lime;
}

/**
 * Colour each visible card so no two neighbours match, including last→first since the
 * carousel loops. A card keeps its own colour when it can. Custom and forest cards never change.
 */
export function assignThemes(cards: Pick<HomeCard, 'id' | 'theme'>[]): (PresetKey | null)[] {
  const out: string[] = [];
  cards.forEach((c, i) => {
    if (c.theme === 'custom' || c.theme === 'forest') {
      out.push(c.theme === 'custom' ? `custom:${c.id}` : 'forest');
      return;
    }
    const pref = c.theme as PresetKey;
    const prev = out[i - 1];
    const wraps = i > 0 && i === cards.length - 1;
    const ok = (t: string) => t !== prev && !(wraps && t === out[0]);
    const unused = (t: string) => !out.includes(t);
    out.push(
      (ok(pref) && unused(pref) && pref) ||
        AUTO.find((t) => ok(t) && unused(t)) ||
        (ok(pref) && pref) ||
        AUTO.find(ok) ||
        pref,
    );
  });
  return out.map((t) => (t.startsWith('custom:') ? null : (t as PresetKey)));
}
