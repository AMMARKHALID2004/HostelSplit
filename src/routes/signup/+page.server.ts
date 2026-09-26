import { fail, redirect } from '@sveltejs/kit';
import { hash } from 'bcryptjs';
import { compare } from 'bcryptjs';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { getRoomSettings, setSession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.user) redirect(303, '/');
  if (!(await getRoomSettings())) redirect(303, '/setup');
};

export const actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const pin = String(data.get('pin') ?? '');
    const settings = await getRoomSettings();
    if (!settings) redirect(303, '/setup');
    if (!(await compare(pin, settings.pinHash))) return fail(400, { message: 'Room PIN is incorrect' });
    if (!/^[\p{L}][\p{L} '\-]{1,39}$/u.test(name)) return fail(400, { message: 'Enter a name between 2 and 40 letters' });
    const existing = await db.select({ name: users.name }).from(users);
    if (existing.some((u) => u.name.toLowerCase() === name.toLowerCase())) return fail(400, { message: 'That name is already in the room' });
    const id = crypto.randomUUID();
    await db.insert(users).values({ id, name, pinHash: await hash(pin, 12), createdAt: Date.now() });
    await setSession(cookies, id);
    redirect(303, '/');
  }
} satisfies Actions;
