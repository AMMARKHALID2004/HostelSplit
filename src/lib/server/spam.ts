import { requireMember, openReview } from './reviews';
import { notify } from './notifications';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { expenses, expenseSplits, penaltyConfirmations, spamFlags, users, reviews, roomMemberships } from './schema';

function requireExpense<T>(value: T | undefined): T {
  if (!value) throw new Error('Expense not found');
  return value;
}

export async function resolveTargetedExpense(expenseId: string, userId: string, accept: boolean, roomId = 'default') {
  return db.transaction(async (tx) => {
    const actor = await requireMember(tx, userId, roomId);
    const expense = requireExpense((await tx.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1))[0]);
    if (expense.roomId !== roomId) throw new Error('Expense not found in this room.');
    if (expense.status !== 'pending_approval' || !expense.isTargeted) throw new Error('This charge is no longer awaiting approval');
    const split = (await tx.select().from(expenseSplits).where(and(eq(expenseSplits.expenseId, expenseId), eq(expenseSplits.userId, userId))).limit(1))[0];
    if (!split || split.status !== 'pending') throw new Error('Only the charged roommate can respond');
    const now = Date.now();
    await tx.update(expenseSplits).set({ status: accept ? 'confirmed' : 'rejected', respondedAt: now }).where(eq(expenseSplits.id, split.id));
    await tx.update(expenses).set({ status: accept ? 'active' : 'voided', resolvedAt: now, ...(accept ? {} : { voidedBy: userId, voidReason: 'The charged roommate rejected this charge.' }) }).where(eq(expenses.id, expenseId));
    if (!accept) await openReview(tx, { expenseId, accusedId: userId, openedBy: userId, kind: 'avoidance', roomId, reason: 'The charged roommate rejected the charge.' });
    await notify(tx, `${actor.name} ${accept ? 'accepted' : 'rejected'} their charge. ${accept ? '' : 'Roommates can review whether the rejection was justified in Reviews.'} Expense: ${expenseId}`, roomId);
    return accept ? 'active' : 'voided';
  });
}

export async function rejectSplit(expenseId: string, userId: string, roomId = 'default') {
  return db.transaction(async (tx) => {
    const actor = await requireMember(tx, userId, roomId);
    const expense = requireExpense((await tx.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1))[0]);
    if (expense.roomId !== roomId) throw new Error('Expense not found in this room.');
    if (expense.status !== 'active') throw new Error('Only active expenses can be disputed');
    if (expense.paidBy === userId) throw new Error('You paid this expense. Cancel the entry if it is incorrect.');
    const rows = await tx.select().from(expenseSplits).where(eq(expenseSplits.expenseId, expenseId));
    const mine = rows.find((r) => r.userId === userId && r.status === 'confirmed' && r.sharePaisa > 0);
    if (!mine) throw new Error('You have no confirmed charge to reject in this expense');
    const priorReview = (await tx.select().from(reviews).where(and(eq(reviews.expenseId, expenseId), eq(reviews.accusedId, userId), eq(reviews.kind, 'avoidance'))))[0];
    if (priorReview) throw new Error('This charge has already been reviewed. Ask the payer or creator to cancel an incorrect entry.');
    await openReview(tx, { expenseId, accusedId: userId, openedBy: userId, kind: 'avoidance', roomId, reason: 'This roommate rejected their share of the expense.' });
    await notify(tx, `${actor.name} rejected their share. The payer temporarily covers it. Review whether this was justified in Reviews. Expense: ${expenseId}`, roomId);
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

export async function cancelExpense(expenseId: string, userId: string, reason: string, roomId = 'default') {
  const trimmed = reason.trim();
  if (trimmed.length < 3 || trimmed.length > 500) throw new Error('Give a cancellation reason between 3 and 500 characters.');
  return db.transaction(async (tx) => {
    const actor = await requireMember(tx, userId, roomId);
    const expense = requireExpense((await tx.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1))[0]);
    if (expense.roomId !== roomId) throw new Error('Expense not found in this room.');
    if (expense.paidBy !== userId && expense.createdBy !== userId) throw new Error('Only the payer or creator can cancel the whole expense.');
    if (expense.status === 'voided' && !['All charged roommates rejected their shares.', 'The charged roommate rejected this charge.'].includes(expense.voidReason ?? '')) throw new Error('This expense is already cancelled.');
    await tx.update(expenses).set({ status: 'voided', voidedBy: userId, voidReason: `Cancelled by payer or creator: ${trimmed}`, resolvedAt: Date.now() }).where(eq(expenses.id, expenseId));
    await tx.update(reviews).set({ status: 'cancelled', resolvedAt: Date.now() }).where(and(eq(reviews.expenseId, expenseId), eq(reviews.status, 'pending')));
    await notify(tx, `${actor.name} cancelled an expense: ${trimmed}. Expense: ${expenseId}`, roomId);
  });
}

export async function flagExpense(expenseId: string, userId: string, roomId = 'default') {
  return db.transaction(async tx => {
    const actor = await requireMember(tx, userId, roomId);
    const expense = requireExpense((await tx.select().from(expenses).where(eq(expenses.id, expenseId)))[0]);
    if (expense.roomId !== roomId) throw new Error('Expense not found in this room.');
    if (expense.status === 'voided') throw new Error('Expense is already cancelled.');
    if (expense.createdBy === userId) throw new Error('Cancel your own incorrect expense instead.');
    const previous = (await tx.select().from(reviews).where(and(eq(reviews.expenseId, expenseId), eq(reviews.kind, 'spam'))))[0];
    if (previous) throw new Error('This expense already has a spam review. Open Reviews to vote.');
    await tx.insert(spamFlags).values({ id: crypto.randomUUID(), expenseId, flaggedBy: userId, createdAt: Date.now() });
    await openReview(tx, { expenseId, accusedId: expense.createdBy, openedBy: userId, kind: 'spam', roomId, reason: 'Reported as an irrelevant expense.' });
    await notify(tx, `${actor.name} reported an irrelevant expense. Four reviewers must agree before any cancellation or strike. Expense: ${expenseId}`, roomId);
    return { voided: false, locked: false, culpritId: expense.createdBy };
  });
}

export async function confirmPenalty(culpritId: string, confirmingUserId: string, roomId = 'default') {
  if (culpritId === confirmingUserId) throw new Error('Another roommate must confirm your cold drink');
  return db.transaction(async (tx) => {
    await requireMember(tx, confirmingUserId, roomId);
    const culprit = (await tx.select().from(roomMemberships).where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, culpritId))).limit(1))[0];
    if (!culprit || !culprit.isLocked) throw new Error('This roommate is not locked');
    const confirmer = await requireMember(tx, confirmingUserId, roomId);
    const culpritUser = (await tx.select().from(users).where(eq(users.id, culpritId)).limit(1))[0];
    if (!confirmer) throw new Error('Unknown roommate');
    const previous = (await tx.select().from(penaltyConfirmations).where(and(eq(penaltyConfirmations.roomId, roomId), eq(penaltyConfirmations.culpritId, culpritId), eq(penaltyConfirmations.confirmedBy, confirmingUserId), eq(penaltyConfirmations.penaltyRound, culprit.penaltyRound))).limit(1))[0];
    if (previous) throw new Error('You already confirmed this round');
    await tx.insert(penaltyConfirmations).values({ id: crypto.randomUUID(), culpritId, confirmedBy: confirmingUserId, penaltyRound: culprit.penaltyRound, roomId, createdAt: Date.now() });
    const count = (await tx.select().from(penaltyConfirmations).where(and(eq(penaltyConfirmations.roomId, roomId), eq(penaltyConfirmations.culpritId, culpritId), eq(penaltyConfirmations.penaltyRound, culprit.penaltyRound)))).length;
    if (count >= 2) await tx.update(roomMemberships).set({ strikes: 0, isLocked: 0 }).where(eq(roomMemberships.id, culprit.id));
    await notify(tx, `Cold drink delivery for ${culpritUser?.name} confirmed (${count}/2). ${count >= 2 ? 'New expenses unlocked.' : ''}`, roomId);
    return { unlocked: count >= 2, confirmations: count };
  });
}
