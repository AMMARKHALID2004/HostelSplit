import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { expenses, expenseSplits, users } from '$lib/server/schema';
import { flagExpense, rejectSplit, resolveTargetedExpense } from '$lib/server/spam';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) redirect(303, '/login');
  const found = await db.select().from(expenses).where(eq(expenses.id, params.id)).limit(1);
  if (!found[0]) error(404, 'Expense not found');
  const [splits, roommates] = await Promise.all([
    db.select().from(expenseSplits).where(eq(expenseSplits.expenseId, params.id)),
    db.select().from(users)
  ]);
  return { expense: found[0], splits, roommates: roommates.map((u) => ({ id: u.id, name: u.name })), currentUserId: locals.user.id };
};

async function runAction(fn: () => Promise<unknown>) {
  try { await fn(); return { success: true }; }
  catch (cause) { return fail(400, { message: cause instanceof Error ? cause.message : 'Action failed' }); }
}

export const actions = {
  accept: async ({ locals, params }) => {
    if (!locals.user) redirect(303, '/login');
    return runAction(() => resolveTargetedExpense(params.id, locals.user!.id, true));
  },
  reject: async ({ locals, params }) => {
    if (!locals.user) redirect(303, '/login');
    return runAction(() => resolveTargetedExpense(params.id, locals.user!.id, false));
  },
  dispute: async ({ locals, params }) => {
    if (!locals.user) redirect(303, '/login');
    return runAction(() => rejectSplit(params.id, locals.user!.id));
  },
  flag: async ({ locals, params }) => {
    if (!locals.user) redirect(303, '/login');
    return runAction(() => flagExpense(params.id, locals.user!.id));
  }
} satisfies Actions;
