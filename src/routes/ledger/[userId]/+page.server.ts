import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { getPairwiseDebt } from '$lib/server/balances';
import { expenses, expenseSplits, settlements, users } from '$lib/server/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) redirect(303, '/login');
  if (params.userId === locals.user.id) error(400, 'Choose another roommate');
  const other = (await db.select().from(users).where(eq(users.id, params.userId)).limit(1))[0];
  if (!other) error(404, 'Roommate not found');
  const [allExpenses, allSplits, allSettlements, debt] = await Promise.all([
    db.select().from(expenses).where(eq(expenses.status, 'active')),
    db.select().from(expenseSplits).where(eq(expenseSplits.status, 'confirmed')),
    db.select().from(settlements).where(eq(settlements.status, 'confirmed')),
    getPairwiseDebt(locals.user.id, other.id)
  ]);
  const entries = allExpenses.flatMap((expense) => {
    const myShare = allSplits.find((s) => s.expenseId === expense.id && s.userId === locals.user!.id)?.sharePaisa ?? 0;
    const theirShare = allSplits.find((s) => s.expenseId === expense.id && s.userId === other.id)?.sharePaisa ?? 0;
    const amountPaisa = expense.paidBy === other.id ? myShare : expense.paidBy === locals.user!.id ? -theirShare : 0;
    return amountPaisa ? [{ id: expense.id, type: 'expense', label: `${expense.category}${expense.description ? ` · ${expense.description}` : ''}`, amountPaisa, at: expense.createdAt }] : [];
  });
  for (const settlement of allSettlements) {
    const amountPaisa = settlement.payerId === locals.user.id && settlement.payeeId === other.id ? -settlement.amountPaisa : settlement.payerId === other.id && settlement.payeeId === locals.user.id ? settlement.amountPaisa : 0;
    if (amountPaisa) entries.push({ id: settlement.id, type: 'settlement', label: 'Confirmed payment', amountPaisa, at: settlement.createdAt });
  }
  entries.sort((a, b) => b.at - a.at);
  return { otherName: other.name, debt, entries };
};
