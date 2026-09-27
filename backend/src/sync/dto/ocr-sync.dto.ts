export class OcrSyncTransactionDto {
  amount: number;
  type: 'debit' | 'credit';
  date: string; // YYYY-MM-DD
  merchant: string;
  category?: string;
  balanceAfter?: number | null;
}

export class OcrSyncDto {
  bankProfileId: string;
  transactions: OcrSyncTransactionDto[];
  updatedBalance?: number | null;
}
