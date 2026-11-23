// What the user tells the app about their money cycle that no SMS shows: yearly costs
// (sinking funds) and "Salary received" marks. Stored as bounded JSON text on
// core.users.money_cycle_data so it follows the user to a new phone.

export interface YearlyCostData {
  id: string;
  name: string;
  amount: number;
  /** 0 = January. */
  month: number;
  category?: string | null;
}

export interface MoneyCycleData {
  yearlyCosts: YearlyCostData[];
  salaryMarks: number[];
  /** When the phone last changed it (epoch ms); the newer copy wins. */
  updatedAt: number;
}

const MAX_COSTS = 20;
const MAX_MARKS = 36;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** A valid copy from untrusted input, or null. Bad entries are dropped, not the whole thing. */
export function cleanMoneyCycleData(input: unknown): MoneyCycleData | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const updatedAt = Number(raw.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt <= 0 || updatedAt > Date.now() + 86_400_000) return null;

  const yearlyCosts: YearlyCostData[] = [];
  for (const c of Array.isArray(raw.yearlyCosts) ? raw.yearlyCosts.slice(0, MAX_COSTS) : []) {
    if (!c || typeof c !== 'object') continue;
    const r = c as Record<string, unknown>;
    const id = text(r.id, 40);
    const name = text(r.name, 40);
    const amount = Number(r.amount);
    const month = Number(r.month);
    if (!id || !name || !(amount > 0 && amount <= 1e9) || !Number.isInteger(month) || month < 0 || month > 11) continue;
    const category = text(r.category, 30) || null;
    yearlyCosts.push({ id, name, amount: Math.round(amount * 100) / 100, month, category });
  }

  const salaryMarks = (Array.isArray(raw.salaryMarks) ? raw.salaryMarks : [])
    .map(Number)
    .filter((t) => Number.isFinite(t) && t > 946_684_800_000 && t <= Date.now() + 86_400_000)
    .sort((a, b) => a - b)
    .slice(-MAX_MARKS);

  return { yearlyCosts, salaryMarks, updatedAt: Math.round(updatedAt) };
}

export function parseMoneyCycleData(stored: string | null | undefined): MoneyCycleData | null {
  if (!stored) return null;
  try {
    return cleanMoneyCycleData(JSON.parse(stored));
  } catch {
    return null;
  }
}
