import { format } from 'date-fns';

export interface FestivalEventPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  suggestedAmount: number;
  startMonth: number; // 0-indexed (e.g. 9 = October)
  startDay: number;
  endMonth: number;
  endDay: number;
  icon: string;
  color: string;
  tag: string;
}

/**
 * Curated Indian Festival & Seasonal Event Presets
 */
export const INDIAN_FESTIVAL_EVENTS: FestivalEventPreset[] = [
  {
    id: 'diwali_shopping',
    name: 'Diwali Festive Shopping',
    category: 'shopping',
    description: 'Gifts, sweets, decor, and electronics for Diwali celebrations',
    suggestedAmount: 25000,
    startMonth: 9, // October
    startDay: 20,
    endMonth: 10, // November
    endDay: 5,
    icon: 'flame',
    color: '#f59e0b',
    tag: 'Diwali 2026',
  },
  {
    id: 'goa_vacation',
    name: 'Goa / Year-End Vacation',
    category: 'transport',
    description: 'Flights, stay, dining, and parties for Christmas & New Year',
    suggestedAmount: 35000,
    startMonth: 11, // December
    startDay: 22,
    endMonth: 0, // January
    endDay: 3,
    icon: 'airplane',
    color: '#06b6d4',
    tag: 'Year-End',
  },
  {
    id: 'wedding_season',
    name: 'Winter Wedding Season',
    category: 'shopping',
    description: 'Attire, jewellery, wedding gifts, and celebrations',
    suggestedAmount: 40000,
    startMonth: 10, // November
    startDay: 15,
    endMonth: 1, // February
    endDay: 28,
    icon: 'heart',
    color: '#ec4899',
    tag: 'Weddings',
  },
  {
    id: 'summer_holiday',
    name: 'Summer Family Trip',
    category: 'transport',
    description: 'Annual summer vacation and travel bookings',
    suggestedAmount: 45000,
    startMonth: 4, // May
    startDay: 1,
    endMonth: 5, // June
    endDay: 15,
    icon: 'sunny',
    color: '#eab308',
    tag: 'Summer',
  },
  {
    id: 'festive_eid',
    name: 'Eid & Festive Ingathering',
    category: 'food',
    description: 'Festive feasts, attire, family gifting, and celebrations',
    suggestedAmount: 20000,
    startMonth: 2, // March
    startDay: 18,
    endMonth: 3, // April
    endDay: 5,
    icon: 'moon',
    color: '#10b981',
    tag: 'Eid',
  },
];

/**
 * Helper to compute active or upcoming event date range in epoch ms
 */
export function getFestivalEventRange(event: FestivalEventPreset, currentYear: number = new Date().getFullYear()): {
  startDate: number;
  endDate: number;
  totalDays: number;
  label: string;
} {
  let startYear = currentYear;
  let endYear = currentYear;

  // Cross-year event (e.g. Dec to Jan)
  if (event.endMonth < event.startMonth) {
    endYear = currentYear + 1;
  }

  const start = new Date(startYear, event.startMonth, event.startDay, 0, 0, 0, 0).getTime();
  const end = new Date(endYear, event.endMonth, event.endDay, 23, 59, 59, 999).getTime();
  const totalDays = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));

  return {
    startDate: start,
    endDate: end,
    totalDays,
    label: `${format(new Date(start), 'dd MMM')} - ${format(new Date(end), 'dd MMM yyyy')}`,
  };
}
