export interface SanitizedTransaction {
  category: string;
  amountRange: string;
  relativeDate: string;
  type: 'debit' | 'credit';
  merchantType: string;
}

export const sanitizeTransactions = (
  transactions: Array<{
    amount: number;
    category: string;
    merchant: string;
    timestamp: number;
    type: 'debit' | 'credit';
  }>
): SanitizedTransaction[] => {
  const now = Date.now();
  return transactions.map((t) => {
    // 1. Amount to range
    const amountRange = getAmountRange(t.amount);

    // 2. Relative date calculation
    const relativeDate = getRelativeDateString(t.timestamp, now);

    // 3. Merchant anonymization (categorize merchant or simplify)
    const merchantType = getMerchantType(t.merchant, t.category);

    return {
      category: t.category,
      amountRange,
      relativeDate,
      type: t.type,
      merchantType,
    };
  });
};

const getAmountRange = (amount: number): string => {
  if (amount < 100) return 'Under 100 INR';
  if (amount < 500) return '100 - 500 INR';
  if (amount < 1000) return '500 - 1,000 INR';
  if (amount < 5000) return '1,000 - 5,000 INR';
  if (amount < 10000) return '5,000 - 10,000 INR';
  if (amount < 25000) return '10,000 - 25,000 INR';
  if (amount < 50000) return '25,000 - 50,000 INR';
  if (amount < 100000) return '50,000 - 100,000 INR';
  return 'Over 100,000 INR';
};

const getRelativeDateString = (timestamp: number, now: number): string => {
  const diffMs = now - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
};

const getMerchantType = (merchant: string, category: string): string => {
  // Return generalized merchant details or category-based labels
  const cleanMerchant = merchant.toLowerCase();
  
  if (category === 'food' || cleanMerchant.includes('zomato') || cleanMerchant.includes('swiggy')) {
    return 'Food Delivery Service';
  }
  if (category === 'transport' || cleanMerchant.includes('uber') || cleanMerchant.includes('ola')) {
    return 'Ride Sharing App';
  }
  if (category === 'entertainment' || cleanMerchant.includes('netflix') || cleanMerchant.includes('spotify')) {
    return 'Digital Subscription';
  }
  if (category === 'shopping' || cleanMerchant.includes('amazon') || cleanMerchant.includes('flipkart')) {
    return 'E-commerce platform';
  }
  if (category === 'utilities' || cleanMerchant.includes('jio') || cleanMerchant.includes('bill')) {
    return 'Telecom / Utility Provider';
  }

  return 'Local Store / Merchant';
};

// Strips any potential numbers resembling bank accounts, credits, phone numbers, names
export const sanitizeText = (text: string): string => {
  return text
    .replace(/\b\d{10,12}\b/g, '[PHONE/REF]') // Phone or RRN
    .replace(/\b\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}\b/g, '[CARD_NUMBER]') // Card numbers
    .replace(/\b(?:A\/c|acct|account)\s*(?:no|num)?\.?\s*[Xx\d]+\b/ig, 'Account [MASKED]') // HDFC A/c XX3241
    .replace(/\b(?:ending|ending in)\s*\d{4}\b/ig, 'ending [MASKED]');
};
