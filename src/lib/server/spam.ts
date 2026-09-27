import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { botNotifications, expenses, expenseSplits, penaltyConfirmations, spamFlags, users } from './schema';

function requireExpense<T>(value: T | undefined): T {
  if (!value) throw new Error('Expense not found');
  return value;
}

export async function resolveTargetedExpense(expenseId: string, userId: string, accept: boolean) {
  return db.transaction(async (tx) => {
    const expense = requireExpense((await tx.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1))[0]);
    if (expense.status !== 'pending_approval' || !expense.isTargeted) throw new Error('This charge is no longer awaiting approval');
    const split = (await tx.select().from(expenseSplits).where(and(eq(expenseSplits.expenseId, expenseId), eq(expenseSplits.userId, userId))).limit(1))[0];
    if (!split || split.status !== 'pending') throw new Error('Only the charged roommate can respond');
    const now = Date.now();
    await tx.update(expenseSplits).set({ status: accept ? 'confirmed' : 'rejected', respondedAt: now }).where(eq(expenseSplits.id, split.id));
    await tx.update(expenses).set({ status: accept ? 'active' : 'voided', resolvedAt: now, ...(accept ? {} : { voidedBy: userId, voidReason: 'The charged roommate rejected this charge.' }) }).where(eq(expenses.id, expenseId));
    return accept ? 'active' : 'voided';
  });
}

export async function rejectSplit(expenseId: string, userId: string) {
  return db.transaction(async (tx) => {
    const expense = requireExpense((await tx.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1))[0]);
    if (expense.status !== 'active') throw new Error('Only active expenses can be disputed');
    if (expense.paidBy === userId) throw new Error('You paid this expense. Cancel the entry if it is incorrect.');
    const rows = await tx.select().from(expenseSplits).where(eq(expenseSplits.expenseId, expenseId));
    const mine = rows.find((r) => r.userId === userId && r.status === 'confirmed' && r.sharePaisa > 0);
    if (!mine) throw new Error('You have no confirmed charge to reject in this expense');
    const now = Date.now();
    await tx.update(expenseSplits).set({ status: 'rejected', respondedAt: now }).where(eq(expenseSplits.id, mine.id));
    const payerShare = rows.find(r => r.userId === expense.paidBy);
    if (payerShare) {
      await tx.update(expenseSplits).set({ sharePaisa: (payerShare.status === 'confirmed' ? payerShare.sharePaisa : 0) + mine.sharePaisa, status: 'confirmed' }).where(eq(expenseSplits.id, payerShare.id));
    } else {
      await tx.insert(expenseSplits).values({ id: crypto.randomUUID(), expenseId, userId: expense.paidBy, sharePaisa: mine.sharePaisa, status: 'confirmed' });
    }
    const otherCharges = rows.filter(r => r.userId !== userId && r.userId !== expense.paidBy && r.status === 'confirmed' && r.sharePaisa > 0);
    if (!otherCharges.length) {
      await tx.update(expenses).set({ status: 'voided', resolvedAt: now, voidedBy: userId, voidReason: 'All charged roommates rejected their shares.' }).where(eq(expenses.id, expenseId));
      return 'voided';
    }
    return 'active';
  });
}

export async function cancelExpense(expenseId: string, userId: string, reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length < 3 || trimmed.length > 500) throw new Error('Give a cancellation reason between 3 and 500 characters.');
  return db.transaction(async (tx) => {
    const expense = requireExpense((await tx.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1))[0]);
    if (expense.paidBy !== userId && expense.createdBy !== userId) throw new Error('Only the payer or creator can cancel the whole expense.');
    if (expense.status === 'voided') throw new Error('This expense is already cancelled.');
    await tx.update(expenses).set({ status: 'voided', voidedBy: userId, voidReason: trimmed, resolvedAt: Date.now() }).where(eq(expenses.id, expenseId));
  });
}

export async function flagExpense(expenseId: string, userId: string) {
  return db.transaction(async (tx) => {
    const expense = requireExpense((await tx.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1))[0]);
    if (expense.status === 'voided') throw new Error('Expense is already voided');
    const flagger = (await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!flagger) throw new Error('Unknown roommate');
    const previous = (await tx.select().from(spamFlags).where(and(eq(spamFlags.expenseId, expenseId), eq(spamFlags.flaggedBy, userId))).limit(1))[0];
    if (previous) throw new Error('You already flagged this expense');
    await tx.insert(spamFlags).values({ id: crypto.randomUUID(), expenseId, flaggedBy: userId, createdAt: Date.now() });
    const count = (await tx.select({ id: spamFlags.id }).from(spamFlags).where(eq(spamFlags.expenseId, expenseId))).length;
    await tx.update(expenses).set({ spamFlagCount: count, ...(count >= 2 ? { status: 'voided', resolvedAt: Date.now(), voidReason: 'Cancelled after two spam reports.' } : {}) }).where(eq(expenses.id, expenseId));
    if (count < 2) return { voided: false, locked: false, culpritId: expense.createdBy };
    const culprit = (await tx.select().from(users).where(eq(users.id, expense.createdBy)).limit(1))[0];
    if (!culprit) throw new Error('Expense creator not found');
    const strikes = Math.min(2, culprit.strikes + 1);
    const locked = strikes >= 2;
    await tx.update(users).set({ strikes, isLocked: locked ? 1 : 0, penaltyRound: locked && !culprit.isLocked ? culprit.penaltyRound + 1 : culprit.penaltyRound }).where(eq(users.id, culprit.id));
    if (locked && !culprit.isLocked) await tx.insert(botNotifications).values({ id: crypto.randomUUID(), kind: 'lock', entityId: culprit.id, recipientJid: null,
      message: `🚨 STRIKE 2/2 🚨\n${culprit.name} got their troll expense voided by popular vote. New expenses are locked until they bring a 1.5L Jumbo cold drink to the room. 🥤 Confirm in the app once received.`, createdAt: Date.now() });
    return { voided: true, locked, culpritId: culprit.id };
  });
}

export async function confirmPenalty(culpritId: string, confirmingUserId: string) {
  if (culpritId === confirmingUserId) throw new Error('Another roommate must confirm your cold drink');
  return db.transaction(async (tx) => {
    const culprit = (await tx.select().from(users).where(eq(users.id, culpritId)).limit(1))[0];
    if (!culprit || !culprit.isLocked) throw new Error('This roommate is not locked');
    const confirmer = (await tx.select({ id: users.id }).from(users).where(eq(users.id, confirmingUserId)).limit(1))[0];
    if (!confirmer) throw new Error('Unknown roommate');
    const previous = (await tx.select().from(penaltyConfirmations).where(and(eq(penaltyConfirmations.culpritId, culpritId), eq(penaltyConfirmations.confirmedBy, confirmingUserId), eq(penaltyConfirmations.penaltyRound, culprit.penaltyRound))).limit(1))[0];
    if (previous) throw new Error('You already confirmed this round');
    await tx.insert(penaltyConfirmations).values({ id: crypto.randomUUID(), culpritId, confirmedBy: confirmingUserId, penaltyRound: culprit.penaltyRound, createdAt: Date.now() });
    const count = (await tx.select().from(penaltyConfirmations).where(and(eq(penaltyConfirmations.culpritId, culpritId), eq(penaltyConfirmations.penaltyRound, culprit.penaltyRound)))).length;
    if (count >= 2) await tx.update(users).set({ strikes: 0, isLocked: 0 }).where(eq(users.id, culpritId));
    return { unlocked: count >= 2, confirmations: count };
  });
}
