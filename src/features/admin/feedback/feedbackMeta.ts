// Labels, colours and small helpers shared by the admin feedback screens.

import { format } from 'date-fns';
import type { Feather } from '@expo/vector-icons';
import type { AdminPalette, Tint } from '../adminTheme';
import type { FeedbackKind, FeedbackPriority, FeedbackStatus } from '../../../services/adminFeedbackService';

export const STATUS_ORDER: FeedbackStatus[] = ['open', 'investigating', 'in_progress', 'fixed', 'resolved', 'closed'];
export const DONE_STATUSES: FeedbackStatus[] = ['fixed', 'resolved', 'closed'];
export const PRIORITY_ORDER: FeedbackPriority[] = ['low', 'medium', 'high', 'critical'];

export const STATUS_INFO: Record<FeedbackStatus, { label: string; hint: string }> = {
  open: { label: 'Open', hint: 'Not looked at yet' },
  investigating: { label: 'Investigating', hint: 'We’re checking it' },
  in_progress: { label: 'In progress', hint: 'Being built or fixed' },
  fixed: { label: 'Fixed', hint: 'Out in an update' },
  resolved: { label: 'Resolved', hint: 'Sorted, no app change' },
  closed: { label: 'Closed', hint: 'Won’t do or duplicate' },
};

export const PRIORITY_LABEL: Record<FeedbackPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

/** Areas people can pick on the Report a problem and Suggest a feature screens. */
export const FEEDBACK_AREAS = [
  'Home',
  'Bank sync',
  'Balance',
  'Budgets',
  'Goals',
  'Insights',
  'Regent chat',
  'Design',
  'Crash or slow',
  'Something else',
];

export const statusTint = (status: FeedbackStatus, p: AdminPalette): Tint => {
  switch (status) {
    case 'open':
      return p.tint.blue;
    case 'investigating':
      return p.tint.amber;
    case 'in_progress':
      return p.tint.lilac;
    case 'fixed':
    case 'resolved':
      return p.tint.green;
    default:
      return { bg: p.soft, fg: p.sub };
  }
};

export const priorityDot = (priority: FeedbackPriority, isDark: boolean): string => {
  switch (priority) {
    case 'critical':
      return isDark ? '#FF8A6B' : '#C8361D';
    case 'high':
      return isDark ? '#FFC24D' : '#D98A00';
    case 'medium':
      return isDark ? '#93C5FD' : '#1450A3';
    default:
      return isDark ? '#A9B0B6' : '#8A9A92';
  }
};

export const kindMeta = (
  kind: FeedbackKind,
  p: AdminPalette,
): { label: string; short: string; icon: keyof typeof Feather.glyphMap; tint: Tint } =>
  kind === 'bug'
    ? { label: 'Bug report', short: 'Report', icon: 'alert-triangle', tint: p.tint.coral }
    : { label: 'Suggestion', short: 'Suggestion', icon: 'zap', tint: p.tint.lilac };

/** "12m", "3h", "2d", then "21 Nov". */
export const ago = (ts: number, now = Date.now()): string => {
  const diff = Math.max(0, now - Number(ts));
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return format(new Date(Number(ts)), 'd MMM');
};

/** "2 days", "5 hours" — for "oldest waiting". */
export const spanWords = (ts: number, now = Date.now()): string => {
  const hr = Math.floor(Math.max(0, now - Number(ts)) / 3600000);
  if (hr < 1) return 'under an hour';
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'}`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? '' : 's'}`;
};

export const initials = (name?: string | null, email?: string | null): string => {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
};

export const displayName = (name?: string | null, email?: string | null): string =>
  (name && name.trim()) || (email && email.trim()) || 'Deleted user';

export const platformLabel = (platform?: string | null, os?: string | null): string | null => {
  if (!platform) return null;
  const pretty = platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : platform;
  return os ? `${pretty} ${os}` : pretty;
};

export const QUICK_REPLIES: Record<FeedbackKind, string[]> = {
  bug: [
    'Thanks for telling us — we’re looking into it.',
    'This is fixed in the next update.',
    'Could you tell us a bit more about when it happens?',
  ],
  feature: [
    'Love this — it’s on our plan. We’ll tell you here when it ships.',
    'Thanks! We’re looking at how many people want this.',
    'This one isn’t on our plan for now, but thank you for the idea.',
  ],
};
