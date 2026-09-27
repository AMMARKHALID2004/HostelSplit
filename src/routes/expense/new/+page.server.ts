import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { createExpense, type Category } from '$lib/server/expense';
import { parseRupees } from '$lib/money';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return { users: (await db.select().from(users)).filter(u => u.membershipStatus === 'approved').map((u) => ({ id: u.id, name: `${u.name} (@${u.username})` })), currentUserId: locals.user.id };
};

export const actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) redirect(303, '/login');
    const data = await request.formData();
    const participants = data.getAll('participants').map(String);
    const values = {
      amount: String(data.get('amount') ?? ''), category: String(data.get('category') ?? 'chai'),
      paidBy: String(data.get('paidBy') ?? ''), description: String(data.get('description') ?? '').trim(),
      splitMode: String(data.get('splitMode') ?? 'equal'), participants,
      shares: Object.fromEntries(participants.map(id => [id, String(data.get(`share_${id}`) ?? '')]))
    };
    try {
      if (!['equal', 'custom'].includes(values.splitMode)) throw new Error('Choose equal or custom amounts.');
      const amountPaisa = parseRupees(values.amount);
      const customShares = values.splitMode === 'custom' ? participants.map(userId => ({ userId, sharePaisa: parseRupees(values.shares[userId]) })) : undefined;
      const expense = await createExpense({ amountPaisa, category: values.category as Category, description: values.description, paidBy: values.paidBy, createdBy: locals.user.id, source: 'pwa', participants, customShares });
      redirect(303, `/expense/${expense.id}`);
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) throw error;
      return fail(400, { message: error instanceof Error ? error.message : 'Could not save expense.', values });
    }
  }
} satisfies Actions;
