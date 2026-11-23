// Occupations offered in Edit Profile. `value` is what is stored on the profile; the first five
// keep the values older app versions saved (Salaried, Business Owner, Freelancer, Student,
// Professional). `pay` is how people in that work are usually paid, used only as a starting
// suggestion for "How are you paid?".

export type UsualPay = 'monthly' | 'weekly' | 'irregular';

export interface Occupation {
  value: string;
  label: string;
  group: 'Job' | 'Own work' | 'Not working';
  pay: UsualPay;
}

export const OCCUPATIONS: Occupation[] = [
  { value: 'Salaried', label: 'Salaried, private job', group: 'Job', pay: 'monthly' },
  { value: 'Government Employee', label: 'Government or PSU job', group: 'Job', pay: 'monthly' },
  { value: 'Professional', label: 'Professional (doctor, CA, lawyer)', group: 'Job', pay: 'monthly' },
  { value: 'Teacher', label: 'Teacher or lecturer', group: 'Job', pay: 'monthly' },
  { value: 'IT Professional', label: 'IT or software', group: 'Job', pay: 'monthly' },
  { value: 'Contract Worker', label: 'Contract or temporary job', group: 'Job', pay: 'monthly' },
  { value: 'Daily Wage Worker', label: 'Daily wage worker', group: 'Job', pay: 'weekly' },
  { value: 'Business Owner', label: 'Business owner', group: 'Own work', pay: 'irregular' },
  { value: 'Shop Owner', label: 'Shop owner or trader', group: 'Own work', pay: 'irregular' },
  { value: 'Self Employed', label: 'Self-employed', group: 'Own work', pay: 'irregular' },
  { value: 'Freelancer', label: 'Freelancer', group: 'Own work', pay: 'irregular' },
  { value: 'Gig Worker', label: 'Delivery or ride partner (Swiggy, Uber…)', group: 'Own work', pay: 'weekly' },
  { value: 'Farmer', label: 'Farmer', group: 'Own work', pay: 'irregular' },
  { value: 'Student', label: 'Student', group: 'Not working', pay: 'irregular' },
  { value: 'Homemaker', label: 'Homemaker', group: 'Not working', pay: 'irregular' },
  { value: 'Retired', label: 'Retired, on pension', group: 'Not working', pay: 'monthly' },
  { value: 'Looking for Work', label: 'Looking for work', group: 'Not working', pay: 'irregular' },
];

/** Label for a stored occupation; free text ("Other") is shown as typed. */
export const occupationLabel = (value?: string | null): string => {
  if (!value) return '';
  return OCCUPATIONS.find((o) => o.value.toLowerCase() === value.toLowerCase())?.label ?? value;
};

/** Is this a value from the list (as opposed to text the user typed under "Other")? */
export const isListedOccupation = (value?: string | null): boolean =>
  !!value && OCCUPATIONS.some((o) => o.value.toLowerCase() === value.toLowerCase());

/** Retired people get a pension, not a salary: wording on Home follows. */
export const isPensioner = (value?: string | null): boolean => (value || '').toLowerCase() === 'retired';
