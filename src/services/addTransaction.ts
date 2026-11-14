// src/services/addTransaction.ts
//
// Saves one new transaction to an account, the same way the "Add expense" screen does:
// through the offline outbox when it is on, otherwise straight to the server.
// Used by voice entry.

import { format } from 'date-fns';
import { useBankStore, useTransactionStore, useIncomeStore, usePeerStore, useAuthStore } from '../store';
import { authService } from './authService';
import { syncService } from './syncService';
import { outbox, isOutboxEnabled } from '../db/outbox';
import { getBackendUrl } from '../config/api';
import { getCategory } from '../constants/categories';

export interface NewTransactionInput {
  bankProfileId: string;
  type: 'credit' | 'debit';
  amount: number;
  category: string;
  /** Merchant or person. Falls back to the category name. */
  note?: string;
  timestamp: number;
}

export interface NewTransactionResult {
  id: string;
  updatedBalance: number;
}

const randomPart = () => Math.random().toString(36).substring(2, 9);

export async function addTransaction(input: NewTransactionInput): Promise<NewTransactionResult> {
  const { bankProfileId, type, category, timestamp } = input;
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) throw new Error('Enter an amount above ₹0.');

  const token = authService.getAccessToken();
  if (!token) throw new Error('Sign in again to add transactions.');

  const bank = useBankStore.getState().bankProfiles.find((b) => b.id === bankProfileId);
  if (!bank) throw new Error('Choose an account for this transaction.');

  const currentBal = Number(bank.currentBalance) || 0;
  const newBal = Math.round((type === 'credit' ? currentBal + amount : currentBal - amount) * 100) / 100;
  const isPeer = category.startsWith('peer_');
  const note = (input.note || '').trim();
  const label = note || (isPeer ? 'Friend' : getCategory(category).label);
  const dateStr = format(new Date(timestamp), 'yyyy-MM-dd');

  if (isOutboxEnabled()) {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('Sign in again to add transactions.');

    const entityId = `${type === 'credit' ? 'inc_manual_' : 'tx_manual_'}${Date.now()}_${randomPart()}`;

    // 1. Persistent outbox first, so the entry survives being offline or the app closing
    outbox.enqueue({
      idemKey: `op_${Date.now()}_${randomPart()}`,
      userId: user.id,
      entity: type === 'credit' ? 'income' : 'transaction',
      op: 'upsert',
      entityId,
      payload: {
        amount,
        category,
        [type === 'credit' ? 'source' : 'merchant']: label,
        timestamp,
        bankProfileId,
        status: 'cleared',
        updatedAt: Date.now(),
      },
    });

    // 2. Show it straight away; the server applies the same change when the outbox reaches it
    useBankStore.getState().updateBankBalance(bankProfileId, newBal);
    const record: any = {
      id: entityId,
      amount,
      category,
      merchant: label,
      source: label,
      timestamp,
      bankProfileId,
      type,
      status: 'cleared',
      updatedAt: Date.now(),
    };
    if (type === 'credit') {
      if (!isPeer) useIncomeStore.getState().addIncomeRecordState(record);
    } else {
      useTransactionStore.getState().addTransactionState(record);
    }
    usePeerStore.getState().syncWithTransactionTag(entityId, category, amount, dateStr, label);

    // 3. Send in the background (retries by itself when offline)
    syncService.flushOutbox().catch(() => {});
    return { id: entityId, updatedBalance: newBal };
  }

  const response = await fetch(`${getBackendUrl()}/sync/manual-transaction`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bankProfileId, type, amount, category, note: note || undefined, timestamp }),
  });
  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson.message || `Could not save this transaction (error ${response.status}).`);
  }

  const result = await response.json();
  if (!result.record) throw new Error('Could not save this transaction. Try again.');
  const updatedBalance = result.updatedBalance !== undefined ? result.updatedBalance : newBal;
  useBankStore.getState().updateBankBalance(bankProfileId, updatedBalance);

  const recordTs = result.record.timestamp ? Number(result.record.timestamp) : timestamp;
  if (type === 'credit') {
    if (!isPeer) {
      useIncomeStore.getState().addIncomeRecordState({
        id: result.record.id,
        amount,
        category,
        merchant: label,
        source: label,
        timestamp: recordTs,
        bankProfileId,
        updatedAt: Date.now(),
        type: 'credit',
      } as any);
    }
  } else {
    useTransactionStore.getState().addTransactionState({
      id: result.record.id,
      amount,
      category,
      merchant: label,
      timestamp: recordTs,
      bankProfileId,
      type: 'debit',
      status: 'confirmed',
    } as any);
  }
  usePeerStore.getState().syncWithTransactionTag(
    result.record.id,
    category,
    amount,
    format(new Date(recordTs), 'yyyy-MM-dd'),
    note || (isPeer ? 'Friend' : undefined),
  );
  return { id: result.record.id, updatedBalance };
}
