import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { expenses, expenseSplits, spamFlags, reviews } from '$lib/server/schema';
import { cancelExpense, flagExpense, rejectSplit, resolveTargetedExpense } from '$lib/server/spam';
import { approvedMembers } from '$lib/server/rooms';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) redirect(303, '/login');
  const found = await db.select().from(expenses).where(eq(expenses.id, params.id)).limit(1);
  if (!found[0] || found[0].roomId !== locals.roomId) error(404, 'Expense not found');
  const [splits, roommates, flags] = await Promise.all([
    db.select().from(expenseSplits).where(eq(expenseSplits.expenseId, params.id)),
    approvedMembers(locals.roomId!),
    db.select({ id: spamFlags.id }).from(spamFlags).where(and(eq(spamFlags.expenseId, params.id), eq(spamFlags.flaggedBy, locals.user.id)))
  ]);
  const reviewRows = await db.select().from(reviews).where(eq(reviews.expenseId, params.id));
  return { reviewRows, expense: found[0], splits, hasFlagged: flags.length > 0, roommates: roommates.map((u) => ({ id: u.id, name: `${u.name} (@${u.username})` })), currentUserId: locals.user.id };
};

async function runAction(fn: () => Promise<unknown>, success: string) {
  try { await fn(); return { success }; }
  catch (cause) { return fail(400, { message: cause instanceof Error ? cause.message : 'Action failed' }); }
}

export const actions = {
  cancel: async ({ locals, params, request }) => {
    if (!locals.user) redirect(303, '/login');
    const data = await request.formData();
    if (data.get('confirm') !== 'yes') return fail(400, { message: 'Confirm that you want to cancel this expense.' });
    return runAction(() => cancelExpense(params.id, locals.user!.id, String(data.get('reason') ?? ''), locals.roomId!), 'Expense cancelled. It no longer affects balances.');
  },
  accept: async ({ locals, params }) => {
    if (!locals.user) redirect(303, '/login');
    return runAction(() => resolveTargetedExpense(params.id, locals.user!.id, true, locals.roomId!), 'Charge accepted.');
  },
  reject: async ({ locals, params }) => {
    if (!locals.user) redirect(303, '/login');
    return runAction(() => resolveTargetedExpense(params.id, locals.user!.id, false, locals.roomId!), 'Charge rejected.');
  },
  dispute: async ({ locals, params }) => {
    if (!locals.user) redirect(303, '/login');
    return runAction(() => rejectSplit(params.id, locals.user!.id, locals.roomId!), 'Your charge was removed. Other roommates’ amounts are unchanged.');
  },
  flag: async ({ locals, params }) => {
    if (!locals.user) redirect(303, '/login');
    return runAction(() => flagExpense(params.id, locals.user!.id, locals.roomId!), 'Spam review opened. Four reviewers must agree before a penalty is applied.');
  }
} satisfies Actions;
