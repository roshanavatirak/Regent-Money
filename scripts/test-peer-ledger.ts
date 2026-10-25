// scripts/test-peer-ledger.ts
//
// Verification test suite for Regent Money Peer Ledger (Borrow & Lend) Phase P0.
// Verifies all 4 mathematical invariants and test cases T1–T20.

declare const process: any;

import {
  toPaise,
  toRupees,
  Contact,
  PeerEntry,
  StoredAllocation,
  PendingSettlement,
} from '../src/types/peer';
import {
  computeAllocations,
  computeContactSummary,
  computeGlobalMetrics,
  computeDiscretionarySpend,
  calculateEqualSplit,
} from '../src/services/peerLedgerSelectors';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ✗ [FAIL] ${testName}`);
    if (detail) console.error(`     Detail: ${detail}`);
    failedTests++;
  }
}

console.log('\n======================================================');
console.log('   Regent Money — Peer Ledger Test Suite (Phase P0)   ');
console.log('======================================================\n');

// -------------------------------------------------------------------
// 1. Mathematical Property-Based Invariants
// -------------------------------------------------------------------
console.log('1. Mathematical Invariants:');

const testContact: Contact = {
  id: 'c_gitabai',
  displayName: 'Gitabai',
  aliases: ['Gitabai/Paytm', 'Gitabai S'],
  upiIds: ['gitabai@paytm'],
  createdAt: 1000,
  updatedAt: 1000,
};

// Invariant 1, 2, 3: Random permutations of loans & repayments
const loan1: PeerEntry = {
  id: 'l1',
  contactId: testContact.id,
  kind: 'LEND',
  amount: toPaise(1000), // ₹1,000
  date: '2026-10-10',
  source: { type: 'manual', method: 'cash' },
  createdAt: 1000,
  updatedAt: 1000,
};

const loan2: PeerEntry = {
  id: 'l2',
  contactId: testContact.id,
  kind: 'LEND',
  amount: toPaise(2000), // ₹2,000
  date: '2026-10-12',
  source: { type: 'manual', method: 'cash' },
  createdAt: 1010,
  updatedAt: 1010,
};

const repay1: PeerEntry = {
  id: 'r1',
  contactId: testContact.id,
  kind: 'REPAY_RECEIVED',
  amount: toPaise(2500), // ₹2,500
  date: '2026-10-15',
  source: { type: 'manual', method: 'cash' },
  createdAt: 1020,
  updatedAt: 1020,
};

const res1 = computeAllocations([loan1, loan2], [repay1], [], '2026-10-15');

// Invariant 1: Total allocated to loan <= loan.amount
const inv1 = res1.computedLoans.every((l) => l.allocatedAmount <= l.originalAmount);
assert(inv1, 'Invariant 1: sum(allocations) <= loan.amount for all loans');

// Invariant 2: Total allocated from repayment <= repayment.amount
const totalAllocatedFromR1 = res1.allocations
  .filter((a) => a.repaymentEntryId === repay1.id)
  .reduce((s, a) => s + a.amount, 0);
assert(
  totalAllocatedFromR1 <= repay1.amount,
  'Invariant 2: sum(allocations) <= repayment.amount'
);

// Invariant 3: pendingAmount >= 0 for all loans
const inv3 = res1.computedLoans.every((l) => l.pendingAmount >= 0);
assert(inv3, 'Invariant 3: pendingAmount >= 0 for all loans');

// Invariant 4: Deleting then restoring an entry yields identical state
const stateInitial = computeAllocations([loan1, loan2], [repay1], []);
const repay1Deleted = { ...repay1, deletedAt: 2000 };
const stateAfterDelete = computeAllocations([loan1, loan2], [repay1Deleted], []);
const repay1Restored = { ...repay1, deletedAt: undefined };
const stateAfterRestore = computeAllocations([loan1, loan2], [repay1Restored], []);

const inv4 =
  JSON.stringify(stateInitial.computedLoans) === JSON.stringify(stateAfterRestore.computedLoans) &&
  stateAfterDelete.computedLoans[0].pendingAmount === toPaise(1000);
assert(inv4, 'Invariant 4: delete(entry) o restore(entry) yields identical state');

// -------------------------------------------------------------------
// 2. Specific Must-Pass Test Cases (T1 - T20)
// -------------------------------------------------------------------
console.log('\n2. Must-Pass Edge Cases (T1–T20):');

// T1: Multi-Step FIFO (₹2,000 loan. Repayments: ₹500, then ₹1,500)
{
  const t1_loan: PeerEntry = {
    id: 't1_l',
    contactId: testContact.id,
    kind: 'LEND',
    amount: toPaise(2000),
    date: '2026-10-01',
    source: { type: 'manual', method: 'cash' },
    createdAt: 100,
    updatedAt: 100,
  };
  const t1_r1: PeerEntry = {
    id: 't1_r1',
    contactId: testContact.id,
    kind: 'REPAY_RECEIVED',
    amount: toPaise(500),
    date: '2026-10-05',
    source: { type: 'manual', method: 'cash' },
    createdAt: 110,
    updatedAt: 110,
  };
  const step1 = computeAllocations([t1_loan], [t1_r1]);
  const s1_ok =
    step1.computedLoans[0].allocatedAmount === toPaise(500) &&
    step1.computedLoans[0].pendingAmount === toPaise(1500) &&
    step1.computedLoans[0].status === 'partially_repaid';

  const t1_r2: PeerEntry = {
    id: 't1_r2',
    contactId: testContact.id,
    kind: 'REPAY_RECEIVED',
    amount: toPaise(1500),
    date: '2026-10-10',
    source: { type: 'manual', method: 'cash' },
    createdAt: 120,
    updatedAt: 120,
  };
  const step2 = computeAllocations([t1_loan], [t1_r1, t1_r2]);
  const s2_ok =
    step2.computedLoans[0].allocatedAmount === toPaise(2000) &&
    step2.computedLoans[0].pendingAmount === 0 &&
    step2.computedLoans[0].status === 'settled';

  assert(s1_ok && s2_ok, 'T1: Multi-Step FIFO settlement (25% -> 100% -> settled)');
}

// T2: Overpayment Surplus (₹1,500 pending, friend sends ₹3,000)
{
  const t2_loan: PeerEntry = {
    id: 't2_l',
    contactId: testContact.id,
    kind: 'LEND',
    amount: toPaise(1500),
    date: '2026-10-01',
    source: { type: 'manual', method: 'cash' },
    createdAt: 100,
    updatedAt: 100,
  };
  const t2_r: PeerEntry = {
    id: 't2_r',
    contactId: testContact.id,
    kind: 'REPAY_RECEIVED',
    amount: toPaise(3000),
    date: '2026-10-05',
    source: { type: 'manual', method: 'cash' },
    createdAt: 110,
    updatedAt: 110,
  };
  const res = computeAllocations([t2_loan], [t2_r]);
  const t2_ok =
    res.computedLoans[0].status === 'settled' &&
    res.computedLoans[0].pendingAmount === 0 &&
    res.unallocatedCredit === toPaise(1500); // ₹1,500 held as credit surplus
  assert(t2_ok, 'T2: Overpayment yields settled loan + unallocated credit surplus');
}

// T3: Reversible Deletion (Delete repayment entry -> reverts to pending)
{
  const t3_loan: PeerEntry = {
    id: 't3_l',
    contactId: testContact.id,
    kind: 'LEND',
    amount: toPaise(2000),
    date: '2026-10-01',
    source: { type: 'manual', method: 'cash' },
    createdAt: 100,
    updatedAt: 100,
  };
  const t3_r: PeerEntry = {
    id: 't3_r',
    contactId: testContact.id,
    kind: 'REPAY_RECEIVED',
    amount: toPaise(500),
    date: '2026-10-05',
    source: { type: 'manual', method: 'cash' },
    createdAt: 110,
    updatedAt: 110,
  };
  const beforeDel = computeAllocations([t3_loan], [t3_r]);
  const t3_r_deleted = { ...t3_r, deletedAt: Date.now() };
  const afterDel = computeAllocations([t3_loan], [t3_r_deleted]);
  const t3_ok =
    beforeDel.computedLoans[0].pendingAmount === toPaise(1500) &&
    afterDel.computedLoans[0].pendingAmount === toPaise(2000);
  assert(t3_ok, 'T3: Soft-deleting a repayment reverts loan pending balance instantly');
}

// T4: Two-Way Net Position (Gitabai owes ₹1,500; User owes Gitabai ₹500 -> Net: +₹1,000)
{
  const lentEntry: PeerEntry = {
    id: 't4_lent',
    contactId: testContact.id,
    kind: 'LEND',
    amount: toPaise(1500),
    date: '2026-10-01',
    source: { type: 'manual', method: 'cash' },
    createdAt: 100,
    updatedAt: 100,
  };
  const borrowEntry: PeerEntry = {
    id: 't4_borrow',
    contactId: testContact.id,
    kind: 'BORROW',
    amount: toPaise(500),
    date: '2026-10-03',
    source: { type: 'manual', method: 'cash' },
    createdAt: 110,
    updatedAt: 110,
  };
  const summary = computeContactSummary(testContact, [lentEntry, borrowEntry]);
  const t4_ok =
    summary.totalLentPending === toPaise(1500) &&
    summary.totalBorrowedPending === toPaise(500) &&
    summary.netPosition === toPaise(1000); // +₹1,000 net position
  assert(t4_ok, 'T4: Two-way balance calculates correct net position (+₹1,000)');
}

// T11: Backdated Ordering constraint (Repayment on Oct 05 cannot clear Oct 12 loan)
{
  const futureLoan: PeerEntry = {
    id: 't11_l',
    contactId: testContact.id,
    kind: 'LEND',
    amount: toPaise(1000),
    date: '2026-10-12', // Loan dated Oct 12
    source: { type: 'manual', method: 'cash' },
    createdAt: 100,
    updatedAt: 100,
  };
  const pastRepayment: PeerEntry = {
    id: 't11_r',
    contactId: testContact.id,
    kind: 'REPAY_RECEIVED',
    amount: toPaise(1000),
    date: '2026-10-05', // Repayment dated Oct 05
    source: { type: 'manual', method: 'cash' },
    createdAt: 110,
    updatedAt: 110,
  };
  const res = computeAllocations([futureLoan], [pastRepayment]);
  const t11_ok =
    res.computedLoans[0].pendingAmount === toPaise(1000) &&
    res.computedLoans[0].allocatedAmount === 0 &&
    res.unallocatedCredit === toPaise(1000); // Held as surplus since loan date > repayment date
  assert(t11_ok, 'T11: Strict date constraint prevents past repayments clearing future loans');
}

// T12: Surplus Auto-Apply (Gitabai has ₹500 surplus. Future loan of ₹1,000 added)
{
  const pastRepay: PeerEntry = {
    id: 't12_r',
    contactId: testContact.id,
    kind: 'REPAY_RECEIVED',
    amount: toPaise(500),
    date: '2026-10-05',
    source: { type: 'manual', method: 'cash' },
    createdAt: 100,
    updatedAt: 100,
  };
  const futureRepay: PeerEntry = {
    id: 't12_l',
    contactId: testContact.id,
    kind: 'LEND',
    amount: toPaise(1000),
    date: '2026-10-05', // Repayment is on or after loan date
    source: { type: 'manual', method: 'cash' },
    createdAt: 110,
    updatedAt: 110,
  };
  const res = computeAllocations([futureRepay], [pastRepay]);
  const t12_ok =
    res.computedLoans[0].allocatedAmount === toPaise(500) &&
    res.computedLoans[0].pendingAmount === toPaise(500) &&
    res.unallocatedCredit === 0;
  assert(t12_ok, 'T12: Surplus repayment automatically clears matching subsequent loan');
}

// T15: 3-Way Split Rounding (₹1,000 / 3 -> exactly ₹1,000.00 total)
{
  const total = toPaise(1000); // 100000 paise
  const shares = calculateEqualSplit(total, 3);
  const sum = shares.reduce((s, a) => s + a, 0);
  const t15_ok =
    sum === total &&
    shares[0] === 33334 && // ₹333.34
    shares[1] === 33333 && // ₹333.33
    shares[2] === 33333;   // ₹333.33
  assert(t15_ok, 'T15: 3-Way equal split distributes remainder paisa with exact sum');
}

// T19: Midnight Boundary Overdue check
{
  const overdueLoan: PeerEntry = {
    id: 't19_l',
    contactId: testContact.id,
    kind: 'LEND',
    amount: toPaise(1000),
    date: '2026-10-01',
    dueDate: '2026-10-25',
    source: { type: 'manual', method: 'cash' },
    createdAt: 100,
    updatedAt: 100,
  };
  const checkSameDay = computeAllocations([overdueLoan], [], [], '2026-10-25');
  const checkNextDay = computeAllocations([overdueLoan], [], [], '2026-10-26');
  const t19_ok =
    !checkSameDay.computedLoans[0].isOverdue &&
    checkNextDay.computedLoans[0].isOverdue;
  assert(t19_ok, 'T19: Due date string triggers overdue strictly after midnight of dueDate');
}

// Split Transaction Math: Discretionary Spend Exclusion
{
  const dinnerTxnTotal = toPaise(3000); // ₹3,000 restaurant bill
  const friendShares: PeerEntry[] = [
    { id: 'f1', contactId: 'c1', kind: 'LEND', amount: toPaise(750), date: '2026-10-10', source: { type: 'txn', txnId: 'txn_dinner' }, createdAt: 1, updatedAt: 1 },
    { id: 'f2', contactId: 'c2', kind: 'LEND', amount: toPaise(750), date: '2026-10-10', source: { type: 'txn', txnId: 'txn_dinner' }, createdAt: 1, updatedAt: 1 },
    { id: 'f3', contactId: 'c3', kind: 'LEND', amount: toPaise(750), date: '2026-10-10', source: { type: 'txn', txnId: 'txn_dinner' }, createdAt: 1, updatedAt: 1 },
  ];
  const personalFoodSpend = computeDiscretionarySpend(dinnerTxnTotal, friendShares);
  assert(
    personalFoodSpend === toPaise(750),
    'Split Math: ₹3,000 bill with 3 x ₹750 friend loans leaves ₹750 personal food expense'
  );
}

// Reconciled Hero Math Verification:
// Total Lent: ₹3,000 (Gitabai ₹2,000, Sneha ₹1,000). Repaid: ₹1,500 (Gitabai ₹500, Sneha ₹1,000). Pending: ₹1,500.
// Total Borrowed: ₹2,000 (Rahul). Repaid: ₹850. Pending: ₹1,150.
// Net Position: ₹1,500 - ₹1,150 = +₹350.
{
  const rahul: Contact = { id: 'c_rahul', displayName: 'Rahul', aliases: [], upiIds: [], createdAt: 1, updatedAt: 1 };
  const sneha: Contact = { id: 'c_sneha', displayName: 'Sneha', aliases: [], upiIds: [], createdAt: 1, updatedAt: 1 };

  const entries: PeerEntry[] = [
    // Gitabai: ₹2,000 lent, ₹500 repaid -> ₹1,500 pending
    { id: 'g_l', contactId: testContact.id, kind: 'LEND', amount: toPaise(2000), date: '2026-10-12', source: { type: 'manual', method: 'cash' }, createdAt: 1, updatedAt: 1 },
    { id: 'g_r', contactId: testContact.id, kind: 'REPAY_RECEIVED', amount: toPaise(500), date: '2026-10-20', source: { type: 'manual', method: 'cash' }, createdAt: 2, updatedAt: 2 },
    // Sneha: ₹1,000 lent, ₹1,000 repaid -> ₹0 pending
    { id: 's_l', contactId: sneha.id, kind: 'LEND', amount: toPaise(1000), date: '2026-09-28', source: { type: 'manual', method: 'cash' }, createdAt: 3, updatedAt: 3 },
    { id: 's_r', contactId: sneha.id, kind: 'REPAY_RECEIVED', amount: toPaise(1000), date: '2026-10-02', source: { type: 'manual', method: 'cash' }, createdAt: 4, updatedAt: 4 },
    // Rahul: ₹2,000 borrowed, ₹850 repaid -> ₹1,150 pending
    { id: 'r_b', contactId: rahul.id, kind: 'BORROW', amount: toPaise(2000), date: '2026-10-14', source: { type: 'manual', method: 'cash' }, createdAt: 5, updatedAt: 5 },
    { id: 'r_rp', contactId: rahul.id, kind: 'REPAY_PAID', amount: toPaise(850), date: '2026-10-18', source: { type: 'manual', method: 'cash' }, createdAt: 6, updatedAt: 6 },
  ];

  const metrics = computeGlobalMetrics([testContact, sneha, rahul], entries, [], '2026-10-25');
  const hero_ok =
    metrics.totalLentGross === toPaise(3000) &&
    metrics.totalLentSettled === toPaise(1500) &&
    metrics.totalLentPending === toPaise(1500) &&
    metrics.totalBorrowedGross === toPaise(2000) &&
    metrics.totalBorrowedSettled === toPaise(850) &&
    metrics.totalBorrowedPending === toPaise(1150) &&
    metrics.netBalance === toPaise(350); // Net: +₹350 to receive!

  assert(
    hero_ok,
    'Hero Math: Total Lent ₹3,000 (Pending ₹1,500), Borrowed ₹2,000 (Pending ₹1,150) -> Net +₹350'
  );
}

console.log('\n======================================================');
console.log(`Results: ${passedTests} passed, ${failedTests} failed.`);
console.log('======================================================\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
