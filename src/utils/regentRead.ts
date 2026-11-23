// Regent's read on the Net Worth screen: the two things most worth saying to THIS person right
// now, picked from their own numbers, instead of one sentence shape filled with figures.
import type { MonthRow, Health, MilestonePlan } from './netWorth.ts';

export interface ReadInput {
  rows: MonthRow[];
  health: Health;
  plan: MilestonePlan | null;
  /** Formats an amount (masked when amounts are hidden). */
  fmt: (minor: number) => string;
  /** Names a period: "Sep". */
  periodName: (row: MonthRow) => string;
  /** Formats a date: "Jun 2027". */
  dateName: (ts: number) => string;
  one: string;
  many: string;
}

interface Insight {
  /** Higher says it first. */
  weight: number;
  text: string;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Every insight that applies, strongest first. */
export function readInsights(input: ReadInput): string[] {
  const { rows, health: h, plan, fmt, periodName, dateName, one, many } = input;
  const finished = rows.filter((r) => !r.isCurrent && !r.isPartial);
  const current = rows.length && rows[rows.length - 1].isCurrent ? rows[rows.length - 1] : null;
  const out: Insight[] = [];

  // Balances that never moved usually mean an account isn't syncing, not a perfectly flat month.
  const flat = finished.filter((r) => r.changeMinor === 0 && r.inMinor === 0 && r.outMinor === 0);
  if (flat.length >= 2 && flat.length * 2 >= finished.length) {
    out.push({
      weight: 100,
      text: `Nothing moved in ${flat.length} of your last ${finished.length} ${many}. A bank may not be syncing: check your accounts so this stays accurate.`,
    });
  }

  // This period so far.
  if (current && current.inMinor > 0) {
    if (current.changeMinor < 0) {
      out.push({
        weight: 90,
        text: `This ${one} you're down ${fmt(-current.changeMinor)} so far: ${fmt(current.outMinor)} out against ${fmt(current.inMinor)} in.`,
      });
    } else if (h.keptPct !== null) {
      out.push({
        weight: 60,
        text: `You've kept ${Math.round(h.keptPct)}% of this ${one} so far, ${fmt(current.changeMinor)} of ${fmt(current.inMinor)}.`,
      });
    }
  }

  // Why the latest drop happened, against the person's own usual spending.
  const lastFell = [...finished].reverse().find((r) => r.changeMinor < 0);
  const usualOut = finished.length >= 2 ? median(finished.map((r) => r.outMinor)) : null;
  if (lastFell) {
    const extra = usualOut !== null ? lastFell.outMinor - usualOut : 0;
    out.push({
      weight: lastFell === finished[finished.length - 1] ? 85 : 55,
      text:
        extra > 0
          ? `${periodName(lastFell)} fell ${fmt(-lastFell.changeMinor)}: you spent ${fmt(extra)} more than your usual ${one}.`
          : `${periodName(lastFell)} fell ${fmt(-lastFell.changeMinor)}, with ${fmt(lastFell.outMinor)} going out.`,
    });
  }

  // Their milestone.
  if (plan && !plan.reached) {
    if (plan.byTs !== null && plan.requiredPerPeriodMinor !== null) {
      const usual = h.typicalGrowthMinor;
      const behind = !plan.needsHistory && usual !== null && usual < plan.requiredPerPeriodMinor;
      out.push({
        weight: behind ? 88 : 65,
        text: behind
          ? `To reach ${fmt(plan.targetMinor)} by ${dateName(plan.byTs)} you need ${fmt(plan.requiredPerPeriodMinor)} a month. Your usual is ${fmt(Math.max(0, usual ?? 0))}.`
          : `Keep ${fmt(plan.requiredPerPeriodMinor)} a month and you reach ${fmt(plan.targetMinor)} by ${dateName(plan.byTs)}.`,
      });
    } else if (plan.periodsAtPace !== null) {
      out.push({ weight: 62, text: `At your usual pace you reach ${fmt(plan.targetMinor)} in about ${plan.periodsAtPace} months.` });
    }
  }

  // A good run.
  if (h.streakMonths >= 3) {
    out.push({ weight: 70, text: `${h.streakMonths} ${many} in a row of growth. Keep it going.` });
  }

  // The best period, and what made it.
  const best = finished.reduce<MonthRow | null>((b, r) => (r.changeMinor > 0 && (!b || r.changeMinor > b.changeMinor) ? r : b), null);
  if (best && best.inMinor > 0) {
    out.push({
      weight: 45,
      text: `Your best was ${periodName(best)}: you kept ${fmt(best.changeMinor)} of ${fmt(best.inMinor)}.`,
    });
  }

  // How long what they have would last.
  if (h.runwayDays !== null && h.runwayDays > 0) {
    out.push({ weight: 40, text: `What you have covers about ${h.runwayDays} days of your usual spending.` });
  }

  return out.sort((a, b) => b.weight - a.weight).map((i) => i.text);
}

/** The read: the two strongest insights. */
export function regentRead(input: ReadInput): string {
  return readInsights(input).slice(0, 2).join(' ');
}
