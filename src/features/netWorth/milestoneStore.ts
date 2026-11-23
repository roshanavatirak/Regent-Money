import { create } from 'zustand';
import { mmkvStorage } from '../../db/mmkv';

const STORAGE_KEY = 'net_worth_milestone_v1';

/** A net worth milestone the person set: an amount, and optionally the month they want it by. */
export interface NetWorthMilestone {
  targetMinor: number;
  /** The date they want it by, or null for no date. */
  byTs: number | null;
}

interface MilestoneState {
  milestone: NetWorthMilestone | null;
  save: (m: NetWorthMilestone) => void;
  clear: () => void;
}

const load = (): NetWorthMilestone | null => {
  try {
    const m = mmkvStorage.getObject<NetWorthMilestone>(STORAGE_KEY);
    if (m && Number.isFinite(m.targetMinor) && m.targetMinor > 0) {
      return { targetMinor: Math.round(m.targetMinor), byTs: Number.isFinite(m.byTs) ? (m.byTs as number) : null };
    }
  } catch {
    /* nothing saved */
  }
  return null;
};

export const useNetWorthMilestone = create<MilestoneState>((set) => ({
  milestone: load(),
  save: (m) => {
    try {
      mmkvStorage.setObject(STORAGE_KEY, m);
    } catch {
      /* keep it for this session */
    }
    set({ milestone: m });
  },
  clear: () => {
    try {
      mmkvStorage.delete(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    set({ milestone: null });
  },
}));
