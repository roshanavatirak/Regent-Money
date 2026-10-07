/**
 * Goal Illustration Registry
 * 
 * 15 consistent cover presets in high-depth / modern render aesthetic.
 * Fallback and keyword auto-picker mapping title & category to the most fitting cover.
 */

export interface GoalCoverPreset {
  key: string;
  label: string;
  category: string;
  imageUri: string;
}

export const GOAL_COVER_PRESETS: GoalCoverPreset[] = [
  {
    key: 'bike',
    label: 'Motorcycle & Scooters',
    category: 'bike',
    imageUri: 'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'car',
    label: 'Car & Automobile',
    category: 'car',
    imageUri: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'home',
    label: 'Dream Home',
    category: 'home',
    imageUri: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'travel_beach',
    label: 'Beach Vacation',
    category: 'travel',
    imageUri: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'travel_mountain',
    label: 'Mountain Getaway',
    category: 'travel',
    imageUri: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'travel_intl',
    label: 'International Trip',
    category: 'travel',
    imageUri: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'gadget',
    label: 'Gadgets & Tech',
    category: 'gadget',
    imageUri: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'wedding',
    label: 'Wedding & Celebration',
    category: 'wedding',
    imageUri: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'education',
    label: 'Education & Upskilling',
    category: 'education',
    imageUri: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'emergency',
    label: 'Emergency Safety Net',
    category: 'emergency',
    imageUri: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'gold',
    label: 'Gold & Precious Metals',
    category: 'gold',
    imageUri: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'gift',
    label: 'Gifts & Family',
    category: 'gift',
    imageUri: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'health',
    label: 'Health & Wellness',
    category: 'health',
    imageUri: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'business',
    label: 'Business Venture',
    category: 'business',
    imageUri: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'retirement',
    label: 'Financial Freedom & FIRE',
    category: 'fire',
    imageUri: 'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?auto=format&fit=crop&w=800&q=80',
  },
  {
    key: 'generic',
    label: 'Life Milestone',
    category: 'custom',
    imageUri: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=800&q=80',
  },
];

export const PRESET_MAP: Record<string, GoalCoverPreset> = GOAL_COVER_PRESETS.reduce(
  (acc, preset) => {
    acc[preset.key] = preset;
    return acc;
  },
  {} as Record<string, GoalCoverPreset>
);

/**
 * Keyword-based preset auto-detector.
 * Maps goal title or category to the most relevant cover illustration.
 */
export function detectCoverPreset(title: string = '', category: string = ''): GoalCoverPreset {
  const normTitle = title.toLowerCase();
  const normCategory = category.toLowerCase();

  // Bike keywords
  if (
    normTitle.includes('bike') ||
    normTitle.includes('bullet') ||
    normTitle.includes('hunter') ||
    normTitle.includes('scooter') ||
    normTitle.includes('royalenfield') ||
    normTitle.includes('motorcycle') ||
    normCategory === 'bike'
  ) {
    return PRESET_MAP.bike;
  }

  // Car keywords
  if (
    normTitle.includes('car') ||
    normTitle.includes('suv') ||
    normTitle.includes('sedan') ||
    normTitle.includes('thar') ||
    normTitle.includes('creta') ||
    normTitle.includes('vehicle') ||
    normCategory === 'car'
  ) {
    return PRESET_MAP.car;
  }

  // Home keywords
  if (
    normTitle.includes('home') ||
    normTitle.includes('flat') ||
    normTitle.includes('house') ||
    normTitle.includes('apartment') ||
    normTitle.includes('interior') ||
    normTitle.includes('renovation') ||
    normCategory === 'home'
  ) {
    return PRESET_MAP.home;
  }

  // Travel sub-types
  if (
    normTitle.includes('beach') ||
    normTitle.includes('goa') ||
    normTitle.includes('bali') ||
    normTitle.includes('maldives') ||
    normTitle.includes('phuket')
  ) {
    return PRESET_MAP.travel_beach;
  }

  if (
    normTitle.includes('mountain') ||
    normTitle.includes('manali') ||
    normTitle.includes('ladakh') ||
    normTitle.includes('himalaya') ||
    normTitle.includes('trek')
  ) {
    return PRESET_MAP.travel_mountain;
  }

  if (
    normTitle.includes('trip') ||
    normTitle.includes('travel') ||
    normTitle.includes('europe') ||
    normTitle.includes('japan') ||
    normTitle.includes('usa') ||
    normTitle.includes('flight') ||
    normCategory === 'travel'
  ) {
    return PRESET_MAP.travel_intl;
  }

  // Gadgets
  if (
    normTitle.includes('phone') ||
    normTitle.includes('iphone') ||
    normTitle.includes('macbook') ||
    normTitle.includes('laptop') ||
    normTitle.includes('ipad') ||
    normTitle.includes('gadget') ||
    normTitle.includes('camera') ||
    normCategory === 'gadget'
  ) {
    return PRESET_MAP.gadget;
  }

  // Wedding
  if (
    normTitle.includes('wedding') ||
    normTitle.includes('marriage') ||
    normTitle.includes('shaadi') ||
    normCategory === 'wedding'
  ) {
    return PRESET_MAP.wedding;
  }

  // Education
  if (
    normTitle.includes('degree') ||
    normTitle.includes('college') ||
    normTitle.includes('school') ||
    normTitle.includes('mba') ||
    normTitle.includes('course') ||
    normTitle.includes('education') ||
    normCategory === 'education'
  ) {
    return PRESET_MAP.education;
  }

  // Emergency
  if (
    normTitle.includes('emergency') ||
    normTitle.includes('safety') ||
    normTitle.includes('fund') ||
    normCategory === 'emergency'
  ) {
    return PRESET_MAP.emergency;
  }

  // Gold
  if (
    normTitle.includes('gold') ||
    normTitle.includes('jewel') ||
    normTitle.includes('silver') ||
    normCategory === 'gold'
  ) {
    return PRESET_MAP.gold;
  }

  // Business
  if (
    normTitle.includes('business') ||
    normTitle.includes('startup') ||
    normTitle.includes('shop') ||
    normCategory === 'business'
  ) {
    return PRESET_MAP.business;
  }

  // Retirement / Freedom
  if (
    normTitle.includes('retire') ||
    normTitle.includes('freedom') ||
    normTitle.includes('fire') ||
    normCategory === 'wealth_stash' ||
    normCategory === 'fire'
  ) {
    return PRESET_MAP.retirement;
  }

  return PRESET_MAP.generic;
}

export function getCoverImageUri(goal: { coverPresetKey?: string; coverImageUri?: string; name?: string; category?: string }): string {
  if (goal.coverImageUri) return goal.coverImageUri;
  if (goal.coverPresetKey && PRESET_MAP[goal.coverPresetKey]) {
    return PRESET_MAP[goal.coverPresetKey].imageUri;
  }
  return detectCoverPreset(goal.name || '', goal.category || '').imageUri;
}
