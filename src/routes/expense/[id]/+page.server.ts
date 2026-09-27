import { error, fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { expenses, expenseSplits, users, spamFlags } from '$lib/server/schema';
import { cancelExpense, flagExpense, rejectSplit, resolveTargetedExpense } from '$lib/server/spam';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) redirect(303, '/login');
  const found = await db.select().from(expenses).where(eq(expenses.id, params.id)).limit(1);
  if (!found[0]) error(404, 'Expense not found');
  const [splits, roommates, flags] = await Promise.all([
    db.select().from(expenseSplits).where(eq(expenseSplits.expenseId, params.id)),
    db.select().from(users),
    db.select({ id: spamFlags.id }).from(spamFlags).where(and(eq(spamFlags.expenseId, params.id), eq(spamFlags.flaggedBy, locals.user.id)))
  ]);
  return { expense: found[0], splits, hasFlagged: flags.length > 0, roommates: roommates.map((u) => ({ id: u.id, name: u.name })), currentUserId: locals.user.id };
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
    return runAction(() => cancelExpense(params.id, locals.user!.id, String(data.get('reason') ?? '')), 'Expense cancelled. It no longer affects balances.');
  },
  accept: async ({ locals, params }) => {
    if (!locals.user) redirect(303, '/login');
    return runAction(() => resolveTargetedExpense(params.id, locals.user!.id, true), 'Charge accepted.');
  },
  reject: async ({ locals, params }) => {
    if (!locals.user) redirect(303, '/login');
    return runAction(() => resolveTargetedExpense(params.id, locals.user!.id, false), 'Charge rejected.');
  },
  dispute: async ({ locals, params }) => {
    if (!locals.user) redirect(303, '/login');
    return runAction(() => rejectSplit(params.id, locals.user!.id), 'Your charge was removed. Other roommates’ amounts are unchanged.');
  },
  flag: async ({ locals, params }) => {
    if (!locals.user) redirect(303, '/login');
    return runAction(() => flagExpense(params.id, locals.user!.id), 'Spam report recorded. Two reports cancel an expense.');
  }
} satisfies Actions;
