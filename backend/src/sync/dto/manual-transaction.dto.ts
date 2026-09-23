export class ManualTransactionDto {
  bankProfileId: string;
  type: 'debit' | 'credit';
  amount: number;
  category: string;
  note?: string;
  timestamp?: number;
}
