import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { reviews, reviewVotes, expenses, expenseSplits, users, roomSettings, roomMemberships } from './schema';
import { requireApprovedMember } from './rooms';
import { notify } from './notifications';
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function requireMember(tx: Tx, id: string, roomId = 'default') {
  return requireApprovedMember(tx, id, roomId);
}
export async function openReview(tx: Tx, input: { expenseId: string; accusedId: string; openedBy: string; kind: 'spam' | 'avoidance'; reason: string; roomId?: string }) {
  const id = crypto.randomUUID();
  await tx.insert(reviews).values({ id, ...input, roomId: input.roomId ?? 'default', createdAt: Date.now() });
  return id;
}
export async function voteReview(reviewId: string, userId: string, verdict: string, roomId = 'default') {
  if (!['uphold', 'dismiss'].includes(verdict)) throw new Error('Choose a verdict.');
  return db.transaction(async tx => {
    const voter = await requireMember(tx, userId, roomId);
    const review = (await tx.select().from(reviews).where(eq(reviews.id, reviewId)))[0];
    if (!review || review.roomId !== roomId || review.status !== 'pending') throw new Error('This review is already closed.');
    if (review.accusedId === userId) throw new Error('You cannot vote on your own case.');
    const previous = (await tx.select().from(reviewVotes).where(and(eq(reviewVotes.reviewId, reviewId), eq(reviewVotes.userId, userId))))[0];
    if (previous) throw new Error('You already voted on this review.');
    await tx.insert(reviewVotes).values({ id: crypto.randomUUID(), reviewId, userId, verdict, createdAt: Date.now() });
    const votes = await tx.select().from(reviewVotes).where(and(eq(reviewVotes.reviewId, reviewId), eq(reviewVotes.verdict, verdict)));
    await notify(tx, `${voter.name} voted ${verdict === 'uphold' ? (review.kind === 'spam' ? 'irrelevant expense' : 'avoiding payment') : (review.kind === 'spam' ? 'valid expense' : 'justified rejection')} in a review (${votes.length}/4). Expense: ${review.expenseId}`, roomId);
    if (votes.length < 4) return;
    const expense = (await tx.select().from(expenses).where(eq(expenses.id, review.expenseId)))[0];
    const culprit = await requireMember(tx, review.accusedId, roomId);
    if (verdict === 'uphold') {
      if (review.kind === 'spam') {
        if (expense.status === 'voided' && !['All charged roommates rejected their shares.', 'The charged roommate rejected this charge.'].includes(expense.voidReason ?? '')) throw new Error('This expense was cancelled; its review is no longer applicable.');
        await tx.update(expenses).set({ status: 'voided', voidReason: 'Four roommates verified this as an irrelevant expense.', resolvedAt: Date.now() }).where(eq(expenses.id, expense.id));
        // A cancelled expense cannot later regain a charge through an avoidance review.
        await tx.update(reviews).set({ status: 'cancelled', resolvedAt: Date.now() }).where(and(eq(reviews.expenseId, expense.id), eq(reviews.status, 'pending')));
        const strikes = Math.min(2, culprit.strikes + 1);
        await tx.update(roomMemberships).set({ strikes, isLocked: strikes >= 2 ? 1 : culprit.isLocked, penaltyRound: strikes >= 2 && !culprit.isLocked ? culprit.penaltyRound + 1 : culprit.penaltyRound }).where(eq(roomMemberships.id, culprit.membershipId));
        if (strikes >= 2) await notify(tx, `${culprit.name} has two verified spam strikes. Bring a cold drink for the room to unlock new expenses.`, roomId);
      } else {
        const rows = await tx.select().from(expenseSplits).where(eq(expenseSplits.expenseId, expense.id));
        const rejected = rows.find(s => s.userId === culprit.id && s.status === 'rejected');
        if (!rejected) throw new Error('The rejected share is no longer available.');
        const autoVoided = expense.voidReason === 'All charged roommates rejected their shares.' || expense.voidReason === 'The charged roommate rejected this charge.';
        if (expense.status === 'voided' && !autoVoided) throw new Error('This expense was cancelled. It cannot be restored.');
        if (review.reason !== 'The charged roommate rejected the charge.') {
          const payer = rows.find(s => s.userId === expense.paidBy && s.status === 'confirmed');
          if (!payer || payer.sharePaisa < rejected.sharePaisa) throw new Error('The share cannot be restored safely.');
          await tx.update(expenseSplits).set({ sharePaisa: payer.sharePaisa - rejected.sharePaisa }).where(eq(expenseSplits.id, payer.id));
        }
        await tx.update(expenseSplits).set({ status: 'confirmed' }).where(eq(expenseSplits.id, rejected.id));
        await tx.update(expenses).set({ status: 'active', voidReason: null, voidedBy: null, resolvedAt: Date.now() }).where(eq(expenses.id, expense.id));
        const strikes = culprit.avoidanceStrikes + 1;
        const fries = strikes % 3 === 0;
        await tx.update(roomMemberships).set({ avoidanceStrikes: strikes, friesOwed: culprit.friesOwed + (fries ? 1 : 0) }).where(eq(roomMemberships.id, culprit.membershipId));
        if (fries) await notify(tx, `${culprit.name} has three more verified payment-avoidance incidents and owes fries for everyone! The room creator can mark them served in Reviews.`, roomId);
      }
    }
    await tx.update(reviews).set({ status: verdict === 'uphold' ? 'upheld' : 'dismissed', resolvedAt: Date.now() }).where(eq(reviews.id, reviewId));
    await notify(tx, `${review.kind === 'spam' ? 'Spam' : 'Rejected-share'} review resolved by four roommates: ${verdict === 'uphold' ? (review.kind === 'spam' ? 'expense cancelled' : 'payment avoidance confirmed; charge restored') : 'report dismissed; no penalty'}. Expense: ${expense.id}`, roomId);
  });
}
export async function serveFries(actorId: string, userId: string, roomId = 'default') {
  await db.transaction(async tx => {
    const owner = (await tx.select().from(roomSettings).where(eq(roomSettings.id, roomId)))[0];
    if (owner?.ownerId !== actorId) throw new Error('Only the room creator can confirm fries were served.');
    const person = await requireMember(tx, userId, roomId);
    if (!person.friesOwed) throw new Error('No fries penalty is outstanding.');
    await tx.update(roomMemberships).set({ friesOwed: person.friesOwed - 1 }).where(eq(roomMemberships.id, person.membershipId));
    await notify(tx, `The room creator confirmed ${person.name} served fries for everyone. One fries penalty cleared.`, roomId);
  });
}
