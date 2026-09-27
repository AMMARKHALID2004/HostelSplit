import { redirect } from '@sveltejs/kit';
import { getBalances } from '$lib/server/balances';
import { db } from '$lib/server/db';
import { expenses, users } from '$lib/server/schema';
import { desc, eq } from 'drizzle-orm';
import { expenseSplits } from '$lib/server/schema';

export async function load({ locals }: import('./$types').PageServerLoadEvent) {
  if (!locals.user) redirect(303, '/login');
  const [balances, recent, roommates, pendingSplits, pendingExpenses] = await Promise.all([
    getBalances(), db.select().from(expenses).orderBy(desc(expenses.createdAt)).limit(8), db.select().from(users),
    db.select().from(expenseSplits).where(eq(expenseSplits.userId, locals.user.id)),
    db.select().from(expenses).where(eq(expenses.status, 'pending_approval'))
  ]);
  return { balances, recent, roommates: roommates.filter(u => u.membershipStatus === 'approved').map((u) => ({ id: u.id, name: `${u.name} (@${u.username})`, isLocked: u.isLocked === 1 })), currentUserId: locals.user.id,
    pendingApprovals: pendingSplits.filter((s) => s.status === 'pending' && pendingExpenses.some((e) => e.id === s.expenseId)).map((s) => s.expenseId) };
}
