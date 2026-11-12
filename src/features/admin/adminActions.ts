import type { Feather } from '@expo/vector-icons';
import type { AdminPalette, Tint } from './adminTheme';

export type ActionKind = 'purge' | 'suspend' | 'reinstate' | 'other';

export const actionKind = (action: string): ActionKind => {
  const a = (action || '').toUpperCase();
  if (a.includes('UNBAN') || a.includes('REINSTATE')) return 'reinstate';
  if (a.includes('DELETE') || a.includes('PURGE')) return 'purge';
  if (a.includes('BAN') || a.includes('SUSPEND')) return 'suspend';
  return 'other';
};

export const actionMeta = (
  action: string,
  p: AdminPalette,
): { label: string; icon: keyof typeof Feather.glyphMap; tint: Tint } => {
  switch (actionKind(action)) {
    case 'purge':
      return { label: 'Account purged', icon: 'trash-2', tint: p.tint.coral };
    case 'suspend':
      return { label: 'Account suspended', icon: 'slash', tint: p.tint.amber };
    case 'reinstate':
      return { label: 'Account reinstated', icon: 'check-circle', tint: p.tint.green };
    default:
      return { label: action || 'Admin action', icon: 'activity', tint: p.tint.blue };
  }
};

export const fmtDay = (ts: number) =>
  new Date(Number(ts)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const fmtTime = (ts: number) =>
  new Date(Number(ts)).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

export const fmtLongDay = (ts: number) =>
  new Date(Number(ts)).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
