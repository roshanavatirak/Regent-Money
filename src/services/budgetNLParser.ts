import { BudgetPeriodType } from '../store';

export interface ParsedNLBudget {
  amount: number | null;
  category: string;
  isOverall: boolean;
  periodType: BudgetPeriodType;
  customStartDate?: number;
  customEndDate?: number;
  name: string;
  matchedKeywords: string[];
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Client-Side Natural Language Budget Intent Parser
 * Converts expressions like "₹8,000 food budget for Goa trip 10 to 18 Dec" into structured fields.
 */
export function parseNaturalLanguageBudget(text: string): ParsedNLBudget {
  const norm = text.toLowerCase().trim();
  const matchedKeywords: string[] = [];

  // 1. Parse Amount
  let amount: number | null = null;
  // Patterns: ₹8000, Rs. 15,000, 15k, 2.5k, 50000
  const kMatch = norm.match(/(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    amount = Math.round(parseFloat(kMatch[1]) * 1000);
    matchedKeywords.push(`amount: ₹${amount}`);
  } else {
    const numMatch = norm.match(/(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\s*(?:rupees|bucks))?/i);
    if (numMatch) {
      amount = parseFloat(numMatch[1].replace(/,/g, ''));
      matchedKeywords.push(`amount: ₹${amount}`);
    }
  }

  // 2. Parse Category & Scope
  let category = 'food';
  let isOverall = false;

  if (norm.includes('overall') || norm.includes('total') || norm.includes('all spend') || norm.includes('entire')) {
    isOverall = true;
    category = 'all';
    matchedKeywords.push('scope: overall');
  } else if (
    norm.includes('food') ||
    norm.includes('dining') ||
    norm.includes('dinner') ||
    norm.includes('lunch') ||
    norm.includes('breakfast') ||
    norm.includes('restaurant') ||
    norm.includes('swiggy') ||
    norm.includes('zomato') ||
    norm.includes('grocery') ||
    norm.includes('groceries') ||
    norm.includes('coffee') ||
    norm.includes('cafe') ||
    norm.includes('snack')
  ) {
    category = 'food';
    matchedKeywords.push('category: food');
  } else if (
    norm.includes('shop') ||
    norm.includes('clothes') ||
    norm.includes('clothing') ||
    norm.includes('amazon') ||
    norm.includes('myntra') ||
    norm.includes('flipkart') ||
    norm.includes('electronics') ||
    norm.includes('zara')
  ) {
    category = 'shopping';
    matchedKeywords.push('category: shopping');
  } else if (
    norm.includes('travel') ||
    norm.includes('cab') ||
    norm.includes('uber') ||
    norm.includes('ola') ||
    norm.includes('flight') ||
    norm.includes('trip') ||
    norm.includes('fuel') ||
    norm.includes('petrol') ||
    norm.includes('commute')
  ) {
    category = 'transport';
    matchedKeywords.push('category: transport');
  } else if (
    norm.includes('bill') ||
    norm.includes('rent') ||
    norm.includes('utilities') ||
    norm.includes('electricity') ||
    norm.includes('wifi') ||
    norm.includes('recharge') ||
    norm.includes('maintenance')
  ) {
    category = 'utilities';
    matchedKeywords.push('category: utilities');
  } else if (
    norm.includes('movie') ||
    norm.includes('netflix') ||
    norm.includes('entertainment') ||
    norm.includes('game') ||
    norm.includes('party') ||
    norm.includes('concert')
  ) {
    category = 'entertainment';
    matchedKeywords.push('category: entertainment');
  } else if (
    norm.includes('health') ||
    norm.includes('medicine') ||
    norm.includes('doctor') ||
    norm.includes('hospital') ||
    norm.includes('pharmacy') ||
    norm.includes('gym')
  ) {
    category = 'health';
    matchedKeywords.push('category: health');
  }

  // 3. Parse Duration / Date Range
  let periodType: BudgetPeriodType = 'monthly';
  let customStartDate: number | undefined;
  let customEndDate: number | undefined;

  const now = new Date();
  const currentYear = now.getFullYear();

  // Pattern A: "10 to 18 Dec" or "10th - 18th December" or "from 10 to 18 dec"
  const dateRangeSameMonth = norm.match(
    /(?:from\s+)?(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|-|till|until)\s*(\d{1,2})(?:st|nd|rd|th)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/i
  );

  // Pattern B: "10 Dec to 18 Dec" or "10 Dec - 18 Dec"
  const dateRangeTwoMonths = norm.match(
    /(?:from\s+)?(\d{1,2})(?:st|nd|rd|th)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(?:to|-|till|until)\s*(\d{1,2})(?:st|nd|rd|th)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)/i
  );

  if (dateRangeSameMonth) {
    const startDay = parseInt(dateRangeSameMonth[1], 10);
    const endDay = parseInt(dateRangeSameMonth[2], 10);
    const monthKey = dateRangeSameMonth[3].slice(0, 3).toLowerCase();
    const monthIdx = MONTH_MAP[monthKey] ?? now.getMonth();

    const startDate = new Date(currentYear, monthIdx, startDay, 0, 0, 0, 0);
    const endDate = new Date(currentYear, monthIdx, endDay, 23, 59, 59, 999);

    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
      periodType = 'custom';
      customStartDate = startDate.getTime();
      customEndDate = endDate.getTime();
      matchedKeywords.push(`custom date: ${startDay} - ${endDay} ${monthKey.toUpperCase()}`);
    }
  } else if (dateRangeTwoMonths) {
    const startDay = parseInt(dateRangeTwoMonths[1], 10);
    const startMonthKey = dateRangeTwoMonths[2].slice(0, 3).toLowerCase();
    const startMonthIdx = MONTH_MAP[startMonthKey] ?? now.getMonth();

    const endDay = parseInt(dateRangeTwoMonths[3], 10);
    const endMonthKey = dateRangeTwoMonths[4].slice(0, 3).toLowerCase();
    const endMonthIdx = MONTH_MAP[endMonthKey] ?? now.getMonth();

    const startDate = new Date(currentYear, startMonthIdx, startDay, 0, 0, 0, 0);
    const endDate = new Date(currentYear, endMonthIdx, endDay, 23, 59, 59, 999);

    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
      periodType = 'custom';
      customStartDate = startDate.getTime();
      customEndDate = endDate.getTime();
      matchedKeywords.push(`custom date: ${startDay} ${startMonthKey} - ${endDay} ${endMonthKey}`);
    }
  } else {
    // Relative preset parsing
    if (norm.includes('1 week') || norm.includes('one week') || norm.includes('weekly') || norm.includes('7 day')) {
      periodType = '1_week';
      matchedKeywords.push('period: 1 week');
    } else if (norm.includes('2 week') || norm.includes('two week') || norm.includes('fortnight') || norm.includes('14 day')) {
      periodType = '2_week';
      matchedKeywords.push('period: 2 weeks');
    } else if (norm.includes('3 week') || norm.includes('three week') || norm.includes('21 day')) {
      periodType = '3_week';
      matchedKeywords.push('period: 3 weeks');
    } else if (norm.includes('4 week') || norm.includes('four week') || norm.includes('28 day')) {
      periodType = '4_week';
      matchedKeywords.push('period: 4 weeks');
    } else if (norm.includes('2 month') || norm.includes('two month')) {
      periodType = '2_month';
      matchedKeywords.push('period: 2 months');
    } else if (norm.includes('3 month') || norm.includes('quarter') || norm.includes('three month')) {
      periodType = '3_month';
      matchedKeywords.push('period: 3 months');
    } else if (norm.includes('4 month') || norm.includes('four month')) {
      periodType = '4_month';
      matchedKeywords.push('period: 4 months');
    } else if (norm.includes('6 month') || norm.includes('half year')) {
      periodType = '6_month';
      matchedKeywords.push('period: 6 months');
    } else if (norm.includes('1 year') || norm.includes('annual') || norm.includes('one year')) {
      periodType = '1_year';
      matchedKeywords.push('period: 1 year');
    } else if (norm.includes('5 year') || norm.includes('five year')) {
      periodType = '5_year';
      matchedKeywords.push('period: 5 years');
    } else if (norm.includes('salary') || norm.includes('payday')) {
      periodType = 'salary_cycle';
      matchedKeywords.push('period: salary cycle');
    }
  }

  // 4. Extract Budget Label / Name
  let name = '';
  // Match "for <trip name>"
  const forMatch = norm.match(/\bfor\s+([a-z0-9\s\-]+?)(?:\s+(?:budget|ceiling|limit|from|\d|$))/i);
  if (forMatch && forMatch[1]) {
    let rawName = forMatch[1].trim();
    // Clean out any trailing date fragments
    rawName = rawName.replace(/\b(?:from|\d{1,2}|to|till|dec|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov)\b.*$/i, '').trim();
    if (rawName.length > 2 && rawName !== 'a' && rawName !== 'the' && rawName !== 'this') {
      name = rawName
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }

  if (!name) {
    if (isOverall) {
      name = 'Overall Spending Budget';
    } else {
      const catLabel = category.charAt(0).toUpperCase() + category.slice(1);
      name = `${catLabel} Budget`;
    }
  }

  return {
    amount,
    category,
    isOverall,
    periodType,
    customStartDate,
    customEndDate,
    name,
    matchedKeywords,
  };
}
