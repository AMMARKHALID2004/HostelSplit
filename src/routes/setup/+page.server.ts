import { fail, redirect } from '@sveltejs/kit';
import { validUsername } from '$lib/server/auth';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { db } from '$lib/server/db';
import { roomSettings, users } from '$lib/server/schema';
import { getRoomSettings, setSession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

const validName = (name: string) => /^[\p{L}][\p{L} '\-]{1,39}$/u.test(name);

export const load: PageServerLoad = async () => {
  if (await getRoomSettings()) redirect(303, '/login');
};

export const actions = {
  default: async ({ request, cookies }) => {
    if (await getRoomSettings()) redirect(303, '/login');
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const username = String(data.get('username') ?? '').trim().toLowerCase();
    if (!validUsername(username)) return fail(400, { message: 'Username: 3–24 lowercase letters, numbers or underscores.' });
    const pin = String(data.get('pin') ?? '');
    const confirm = String(data.get('confirm') ?? '');
    if (!validName(name)) return fail(400, { message: 'Enter a name between 2 and 40 letters.' });
    if (!/^\d{4,8}$/.test(pin)) return fail(400, { message: 'Choose a PIN with 4 to 8 digits.' });
    if (pin !== confirm) return fail(400, { message: 'The PINs do not match.' });
    const id = crypto.randomUUID();
    try {
      const pinHash = await hash(pin, 12);
      await db.transaction(async (tx) => {
        await tx.insert(roomSettings).values({ id: 'default', ownerId: id, pinHash, sessionSecret: randomBytes(32).toString('hex'), createdAt: Date.now() });
        await tx.insert(users).values({ id, name, username, pinHash, createdAt: Date.now() });
      });
      await setSession(cookies, id);
      redirect(303, '/');
    } catch (cause) {
      if (cause && typeof cause === 'object' && 'status' in cause) throw cause;
      return fail(409, { message: 'The room has already been created. Please sign in.' });
    }
  }
} satisfies Actions;
