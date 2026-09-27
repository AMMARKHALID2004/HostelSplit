import { redirect } from '@sveltejs/kit';
import { desc, eq, and, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { expenses, expenseSplits, users } from '$lib/server/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, '/login');
  const raw = Number(url.searchParams.get('page') ?? 1);
  const page = Number.isSafeInteger(raw) && raw > 0 ? Math.min(raw, 10000) : 1;
  const rows = await db.select().from(expenses).orderBy(desc(expenses.createdAt), desc(expenses.id)).limit(26).offset((page - 1) * 25);
  const shown = rows.slice(0, 25);
  const [people, mine] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users),
    shown.length ? db.select().from(expenseSplits).where(and(eq(expenseSplits.userId, locals.user.id), inArray(expenseSplits.expenseId, shown.map(e => e.id)))) : Promise.resolve([])
  ]);
  return { expenses: shown, people, mine, page, hasMore: rows.length > 25 };
};
