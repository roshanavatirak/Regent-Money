export class OcrSyncTransactionDto {
  amount: number;
  type: 'debit' | 'credit';
  date: string; // YYYY-MM-DD
  merchant: string;
}

export class OcrSyncDto {
  bankProfileId: string;
  transactions: OcrSyncTransactionDto[];
}
