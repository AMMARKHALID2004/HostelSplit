import { redirect } from '@sveltejs/kit';
import { getBalances } from '$lib/server/balances';
import { db } from '$lib/server/db';
import { expenses } from '$lib/server/schema';
import { and, desc, eq } from 'drizzle-orm';
import { approvedMembers } from '$lib/server/rooms';
import { expenseSplits } from '$lib/server/schema';

export async function load({ locals }: import('./$types').PageServerLoadEvent) {
  if (!locals.user) return { guest: true, balances: [], recent: [], roommates: [], currentUserId: null, pendingApprovals: [] };
  const [balances, recent, roommates, pendingSplits, pendingExpenses] = await Promise.all([
    getBalances(locals.roomId!), db.select().from(expenses).where(eq(expenses.roomId, locals.roomId!)).orderBy(desc(expenses.createdAt)).limit(8), approvedMembers(locals.roomId!),
    db.select().from(expenseSplits).where(eq(expenseSplits.userId, locals.user.id)),
    db.select().from(expenses).where(and(eq(expenses.roomId, locals.roomId!), eq(expenses.status, 'pending_approval')))
  ]);
  return { guest: false, balances, recent, roommates: roommates.map((u) => ({ id: u.id, name: `${u.name} (@${u.username})`, isLocked: u.isLocked === 1 })), currentUserId: locals.user.id,
    pendingApprovals: pendingSplits.filter((s) => s.status === 'pending' && pendingExpenses.some((e) => e.id === s.expenseId)).map((s) => s.expenseId) };
}
