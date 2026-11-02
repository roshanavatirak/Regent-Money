/**
 * Integer paise conversion utilities to eliminate IEEE-754 floating-point drift in sums.
 */
export const toMinor = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export const fromMinor = (m: number): number => m / 100;

