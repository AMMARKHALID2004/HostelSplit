import { fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { categories, createExpense, type Category } from '$lib/server/expense';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/login');
  return { users: (await db.select().from(users)).map((u) => ({ id: u.id, name: u.name })), currentUserId: locals.user.id };
};

export const actions = {
  default: async ({ request, locals }) => {
    if (!locals.user) redirect(303, '/login');
    const data = await request.formData();
    const amount = String(data.get('amount') ?? '');
    const category = String(data.get('category') ?? '') as Category;
    const paidBy = String(data.get('paidBy') ?? '');
    const description = String(data.get('description') ?? '').trim();
    const participants = data.getAll('participants').map(String);
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amount) || !categories.includes(category)) {
      return fail(400, { message: 'Enter a valid amount and category.' });
    }
    const [rupees, fractional = ''] = amount.split('.');
    const amountPaisa = Number(rupees) * 100 + Number(fractional.padEnd(2, '0'));
    try {
      const expense = await createExpense({ amountPaisa, category, description, paidBy, createdBy: locals.user.id, source: 'pwa', participants });
      redirect(303, `/expense/${expense.id}`);
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) throw error;
      return fail(400, { message: error instanceof Error ? error.message : 'Could not save expense.' });
    }
  }
} satisfies Actions;
