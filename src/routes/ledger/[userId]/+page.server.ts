import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { approvedMembers } from '$lib/server/rooms';
import { getPairwiseDebt } from '$lib/server/balances';
import { expenses, expenseSplits, settlements } from '$lib/server/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) redirect(303, '/login');
  if (params.userId === locals.user.id) error(400, 'Choose another roommate');
  const other = (await approvedMembers(locals.roomId!)).find(u => u.id === params.userId);
  if (!other) error(404, 'Roommate not found');
  const [allExpenses, allSplits, allSettlements, debt] = await Promise.all([
    db.select().from(expenses).where(and(eq(expenses.roomId, locals.roomId!), eq(expenses.status, 'active'))),
    db.select().from(expenseSplits).where(eq(expenseSplits.status, 'confirmed')),
    db.select().from(settlements).where(and(eq(settlements.roomId, locals.roomId!), eq(settlements.status, 'confirmed'))),
    getPairwiseDebt(locals.user.id, other.id, locals.roomId!)
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
